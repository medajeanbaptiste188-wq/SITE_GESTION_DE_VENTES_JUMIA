const { checkDatabaseConnection } = require('../config/database');

async function health(req, res) {
  try {
    await checkDatabaseConnection();
    return res.json({ status: 'ok' });
  } catch (error) {
    console.error('Contrôle de santé MySQL impossible :', error.message);
    return res.status(503).json({ message: 'La base de données est indisponible.' });
  }
}

module.exports = { health };
