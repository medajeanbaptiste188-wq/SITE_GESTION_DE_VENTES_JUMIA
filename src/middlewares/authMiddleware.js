const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/auth');

function requireAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/iu);

  if (!match) {
    return res.status(401).json({ message: 'Authentification requise.' });
  }

  try {
    const payload = jwt.verify(match[1], getJwtSecret());
    const userId = Number(payload && payload.sub);
    if (!payload || !Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({ message: 'Jeton d’authentification invalide.' });
    }
    req.user = { id: userId, identifiant: payload.identifiant };
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Jeton d’authentification invalide ou expiré.' });
  }
}

module.exports = { requireAuth };
