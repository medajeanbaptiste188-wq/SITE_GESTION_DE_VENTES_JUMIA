const { loginRateLimitMax, loginRateLimitWindowMs } = require('../config/auth');

const attemptsByIp = new Map();

function loginRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'inconnue';
  const now = Date.now();
  const current = attemptsByIp.get(ip);
  const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + loginRateLimitWindowMs } : current;

  entry.count += 1;
  attemptsByIp.set(ip, entry);
  res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));

  if (entry.count > loginRateLimitMax) {
    return res.status(429).json({ message: 'Trop de tentatives de connexion. Réessayez plus tard.' });
  }
  return next();
}

module.exports = { loginRateLimit };
