// Migrates externally-hosted recipe images into local /uploads storage and
// rewrites recipes.image to ${BASE_URL}/uploads/<file>. Idempotent: rows that
// already point at BASE_URL are skipped. On download/processing failure the
// original URL is preserved (never blanked) so admins can retry.
//
// Run: BASE_URL=https://api.example.com npm run migrate:images

import { PrismaClient } from '@prisma/client';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) {
  console.error('BASE_URL is required (e.g. BASE_URL=http://localhost:3000). Refusing to bake a wrong host into DB.');
  process.exit(1);
}
const NORMALIZED_BASE = BASE_URL.replace(/\/$/, '');

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
const MAX_DIMENSION = 1920;
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 30_000;

type Downloaded = { buffer: Buffer; contentType: string };

function downloadImage(url: string, redirectsLeft = MAX_REDIRECTS): Promise<Downloaded> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, { timeout: REQUEST_TIMEOUT_MS }, (response) => {
      const status = response.statusCode ?? 0;

      if (status >= 300 && status < 400 && response.headers.location) {
        if (redirectsLeft <= 0) {
          response.resume();
          reject(new Error(`Too many redirects for ${url}`));
          return;
        }
        const next = new URL(response.headers.location, url).toString();
        response.resume();
        downloadImage(next, redirectsLeft - 1).then(resolve).catch(reject);
        return;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`HTTP ${status} for ${url}`));
        return;
      }

      const contentType = String(response.headers['content-type'] ?? '').toLowerCase();
      if (!contentType.startsWith('image/')) {
        response.resume();
        reject(new Error(`Non-image content-type "${contentType}" for ${url}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType }));
      response.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Timeout after ${REQUEST_TIMEOUT_MS}ms for ${url}`));
    });
    req.on('error', reject);
  });
}

async function processAndSaveImage(buffer: Buffer, contentType: string): Promise<string> {
  // Mirror the /with-image endpoint: PNG → webp, everything else → jpg q80,
  // resize to <=1920px wide.
  const isPng = contentType === 'image/png';
  const ext = isPng ? '.webp' : '.jpg';
  const filename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);

  const image = sharp(buffer);
  const metadata = await image.metadata();
  const needsResize = !!metadata.width && metadata.width > MAX_DIMENSION;

  let pipeline = needsResize
    ? image.resize({ width: MAX_DIMENSION, withoutEnlargement: true })
    : image;
  pipeline = isPng ? pipeline.webp({ quality: 80 }) : pipeline.jpeg({ quality: 80 });

  await pipeline.toFile(filepath);
  return filename;
}

async function migrateRecipeImages() {
  console.log(`Starting image migration (BASE_URL=${NORMALIZED_BASE})...`);

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  const prisma = new PrismaClient();

  try {
    const recipes = await prisma.recipe.findMany({
      where: { image: { not: '' } },
      select: { id: true, image: true },
    });

    console.log(`Found ${recipes.length} recipes with non-empty image`);

    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    for (const recipe of recipes) {
      const url = recipe.image;

      // Idempotency: anything already on our origin is left alone.
      if (url.startsWith(`${NORMALIZED_BASE}/uploads/`) || url.startsWith('/uploads/')) {
        skipped++;
        continue;
      }

      try {
        console.log(`[${recipe.id}] downloading: ${url}`);
        const { buffer, contentType } = await downloadImage(url);
        const filename = await processAndSaveImage(buffer, contentType);
        const newUrl = `${NORMALIZED_BASE}/uploads/${filename}`;

        await prisma.recipe.update({
          where: { id: recipe.id },
          data: { image: newUrl },
        });

        console.log(`[${recipe.id}] migrated -> ${newUrl}`);
        migrated++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[${recipe.id}] FAILED, leaving original URL untouched: ${msg}`);
        failed++;
      }
    }

    console.log('\nMigration complete.');
    console.log(`  migrated: ${migrated}`);
    console.log(`  skipped:  ${skipped}`);
    console.log(`  failed:   ${failed}`);

    process.exitCode = failed > 0 ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

migrateRecipeImages().catch((err) => {
  console.error(err);
  process.exit(1);
});
