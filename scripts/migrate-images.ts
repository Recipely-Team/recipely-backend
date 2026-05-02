// Migration script to download external images and upload to local storage
// Run: npx tsx scripts/migrate-images.ts

import { PrismaClient } from '@prisma/client';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';

const prisma = new PrismaClient();
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
const MAX_DIMENSION = 1920;

async function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadImage(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

async function processAndSaveImage(imageBuffer: Buffer, originalUrl: string): Promise<string> {
  const ext = path.extname(new URL(originalUrl).pathname) || '.jpg';
  const filename = `${crypto.randomBytes(16).toString('hex')}${ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);

  // For now, just save the original (sharp processing can be added later)
  fs.writeFileSync(filepath, imageBuffer);

  return filename;
}

async function migrateRecipeImages() {
  console.log('Starting image migration...');

  // Ensure uploads directory exists
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  // Get all recipes with images
  const recipes = await prisma.recipe.findMany({
    where: {
      image: {
        not: '',
      },
    },
  });

  console.log(`Found ${recipes.length} recipes with images`);

  let migrated = 0;
  let skipped = 0;

  for (const recipe of recipes) {
    if (!recipe.image) {
      skipped++;
      continue;
    }

    // Skip if already local
    if (recipe.image.startsWith('/uploads') || recipe.image.startsWith('http://') && !recipe.image.includes('unsplash')) {
      console.log(`Skipping ${recipe.name}: already local or not unsplash`);
      skipped++;
      continue;
    }

    try {
      console.log(`Downloading: ${recipe.image}`);
      const imageBuffer = await downloadImage(recipe.image);
      const filename = await processAndSaveImage(imageBuffer, recipe.image);

      // Update database with new local URL
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const newUrl = `${baseUrl}/uploads/${filename}`;

      await prisma.recipe.update({
        where: { id: recipe.id },
        data: { image: newUrl },
      });

      console.log(`Migrated: ${recipe.id} -> ${newUrl}`);
      migrated++;
    } catch (error) {
      console.error(`Failed to migrate recipe ${recipe.id}:`, error);
    }
  }

  console.log(`\nMigration complete!`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped: ${skipped}`);

  await prisma.$disconnect();
}

migrateRecipeImages().catch((err) => {
  console.error(err);
  process.exit(1);
});