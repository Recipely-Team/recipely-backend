// Plain CommonJS so it runs in the production image without `tsx`
// (devDependencies are pruned by `npm prune --omit=dev` in Dockerfile).
// Idempotent: admin seed skips when env vars unset; import-bot is always ensured.

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const IMPORT_BOT_EMAIL = 'import-bot@recipely.local';

async function ensureAdmin(prisma) {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('[seed] ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin seed.');
    return;
  }
  if (password.length < 12) {
    throw new Error('[seed] ADMIN_PASSWORD must be at least 12 chars.');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== 'admin') {
      await prisma.user.update({ where: { id: existing.id }, data: { role: 'admin' } });
      console.log(`[seed] Promoted ${email} to admin.`);
    } else {
      console.log(`[seed] Admin ${email} already exists.`);
    }
    return;
  }

  const rounds = Number.parseInt(process.env.BCRYPT_ROUNDS ?? '10', 10);
  const passwordHash = await bcrypt.hash(password, rounds);
  await prisma.user.create({
    data: { email, passwordHash, displayName: 'Admin', role: 'admin' },
  });
  console.log(`[seed] Created admin user ${email}.`);
}

// WHY: scripts/import-foodcom.ts needs a User to set as Recipe.ownerId. We never
// log in as this user — password is a random unguessable hash and role !== 'admin'
// so AdminJS rejects it. Idempotent: returns existing if already created.
async function ensureImportBot(prisma) {
  const existing = await prisma.user.findUnique({ where: { email: IMPORT_BOT_EMAIL } });
  if (existing) {
    return;
  }
  const rounds = Number.parseInt(process.env.BCRYPT_ROUNDS ?? '10', 10);
  const unguessable = crypto.randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(unguessable, rounds);
  await prisma.user.create({
    data: {
      email: IMPORT_BOT_EMAIL,
      passwordHash,
      displayName: 'Import Bot',
      role: 'system',
    },
  });
  console.log(`[seed] Created import bot user ${IMPORT_BOT_EMAIL}.`);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await ensureAdmin(prisma);
    await ensureImportBot(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
