function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET doit contenir au moins 32 caractères.');
  }
  return secret;
}

module.exports = {
  getJwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  bcryptRounds: positiveInteger(process.env.BCRYPT_ROUNDS, 12),
  maxLoginAttempts: positiveInteger(process.env.MAX_LOGIN_ATTEMPTS, 5),
  loginLockMinutes: positiveInteger(process.env.LOGIN_LOCK_MINUTES, 15),
  loginRateLimitMax: positiveInteger(process.env.LOGIN_RATE_LIMIT_MAX, 10),
  loginRateLimitWindowMs: positiveInteger(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 900000)
};
