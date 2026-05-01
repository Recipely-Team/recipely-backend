// Bulk import categories from CSV for i18n localized data.
// Idempotent: uses upsert by slug, so re-running updates existing rows.
//
// Usage:
//   npx tsx scripts/import-categories.ts --file ./data/categories.csv
//
// CSV format:
//   slug,name_en,name_tr,name_de,name_fr,cuisine_en,cuisine_tr,cuisine_de,cuisine_fr
//   pasta,Pasta,Makarna,Pasta,Pâtes,Italian,İtalyan,Italien,Pâtes

import { createReadStream } from 'fs';
import { parse as parseCsv } from 'csv-parse';
import { PrismaClient } from '@prisma/client';

const SUPPORTED_LOCALES = ['en', 'tr', 'de', 'fr', 'es', 'ar'] as const;

interface CliOptions {
  file: string;
}

interface CsvRow {
  slug: string;
  name_en: string;
  name_tr: string;
  name_de?: string;
  name_fr?: string;
  cuisine_en: string;
  cuisine_tr: string;
  cuisine_de?: string;
  cuisine_fr?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--file') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --file');
      args.file = value;
      i++;
    }
  }
  if (!args.file) {
    throw new Error('Usage: import-categories --file <path>');
  }
  return { file: args.file };
}

function buildLocalizedString(row: Record<string, string>, prefix: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const locale of SUPPORTED_LOCALES) {
    const value = row[`${prefix}_${locale}`];
    if (value !== undefined && value.trim().length > 0) {
      result[locale] = value.trim();
    }
  }
  return result;
}

async function main(argv: string[]) {
  const opts = parseArgs(argv);

  const prisma = new PrismaClient();

  let count = 0;
  let skipped = 0;

  return new Promise<void>((resolve, reject) => {
    const parser = createReadStream(opts.file).pipe(
      parseCsv({
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }),
    );

    parser.on('data', async (row: CsvRow) => {
      parser.pause();

      if (!row.slug?.trim()) {
        console.warn('Skipping row without slug:', row);
        skipped++;
        parser.resume();
        return;
      }

      try {
        const name = buildLocalizedString(row, 'name');
        const cuisine = buildLocalizedString(row, 'cuisine');

        if (Object.keys(name).length === 0) {
          console.warn(`Skipping row with no name: ${row.slug}`);
          skipped++;
          parser.resume();
          return;
        }

        await prisma.category.upsert({
          where: { slug: row.slug.trim() },
          update: { name, cuisine },
          create: { slug: row.slug.trim(), name, cuisine },
        });

        count++;
        console.log(`Upserted category: ${row.slug} (name: ${JSON.stringify(name)})`);
        parser.resume();
      } catch (err) {
        console.error(`Error upserting category ${row.slug}:`, err);
        skipped++;
        parser.resume();
      }
    });

    parser.on('error', (err: Error) => {
      reject(err);
    });

    parser.on('end', async () => {
      console.log(`\nDone. Imported: ${count}, skipped: ${skipped}`);
      await prisma.$disconnect();
      resolve();
    });
  });
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err);
  process.exit(1);
});