/**
 * Vitest setup: runs before each test file.
 * Ensures ADMIN_TOKEN is set so server/auth tests that use config get a valid token.
 */
if (!process.env.ADMIN_TOKEN) {
  process.env.ADMIN_TOKEN = 'polymarket-test-admin';
}
