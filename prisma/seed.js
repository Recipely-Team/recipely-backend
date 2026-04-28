// Plain CommonJS so it runs in the production image without `tsx`
// (devDependencies are pruned by `npm prune --omit=dev` in Dockerfile).
// Idempotent: skips when ADMIN_EMAIL/PASSWORD unset, promotes existing
// user to admin if email matches, otherwise creates a new admin.

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('[seed] ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin seed.');
    return;
  }
  if (password.length < 12) {
    throw new Error('[seed] ADMIN_PASSWORD must be at least 12 chars.');
  }

  const prisma = new PrismaClient();
  try {
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
      data: {
        email,
        passwordHash,
        displayName: 'Admin',
        role: 'admin',
      },
    });
    console.log(`[seed] Created admin user ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
