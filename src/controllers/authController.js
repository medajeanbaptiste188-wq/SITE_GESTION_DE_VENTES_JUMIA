const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { getJwtSecret, jwtExpiresIn, maxLoginAttempts, loginLockMinutes, bcryptRounds } = require('../config/auth');

function validCredentials(identifiant, motDePasse) {
  return typeof identifiant === 'string' && identifiant.trim().length >= 3 && identifiant.trim().length <= 100
    && typeof motDePasse === 'string' && motDePasse.length >= 8 && motDePasse.length <= 128;
}

async function login(req, res) {
  const { identifiant, motDePasse } = req.body || {};
  if (!validCredentials(identifiant, motDePasse)) {
    return res.status(400).json({ message: 'Identifiant ou mot de passe invalide.' });
  }

  const normalizedIdentifier = identifiant.trim();
  try {
    const [users] = await pool.execute(
      'SELECT id, identifiant, mot_de_passe_hash, tentatives_echouees, verrouille_jusqu_a FROM utilisateurs WHERE identifiant = ? LIMIT 1',
      [normalizedIdentifier]
    );
    const user = users[0];
    const now = new Date();

    if (!user) {
      return res.status(401).json({ message: 'Identifiant ou mot de passe incorrect.' });
    }
    if (user.verrouille_jusqu_a && new Date(user.verrouille_jusqu_a) > now) {
      return res.status(429).json({ message: 'Compte temporairement verrouillé. Réessayez plus tard.' });
    }

    const passwordMatches = await bcrypt.compare(motDePasse, user.mot_de_passe_hash);
    if (!passwordMatches) {
      const failedAttempts = Number(user.tentatives_echouees) + 1;
      const shouldLock = failedAttempts >= maxLoginAttempts;
      const lockUntil = shouldLock ? new Date(now.getTime() + loginLockMinutes * 60 * 1000) : null;
      await pool.execute(
        'UPDATE utilisateurs SET tentatives_echouees = ?, verrouille_jusqu_a = ? WHERE id = ?',
        [shouldLock ? 0 : failedAttempts, lockUntil, user.id]
      );
      return res.status(401).json({ message: 'Identifiant ou mot de passe incorrect.' });
    }

    await pool.execute('UPDATE utilisateurs SET tentatives_echouees = 0, verrouille_jusqu_a = NULL WHERE id = ?', [user.id]);
    const token = jwt.sign({ identifiant: user.identifiant }, getJwtSecret(), {
      subject: String(user.id),
      expiresIn: jwtExpiresIn
    });
    return res.json({ token });
  } catch (error) {
    console.error('Échec de connexion :', error.message);
    return res.status(500).json({ message: 'La connexion est temporairement indisponible.' });
  }
}

async function signup(req, res) {
  const { identifiant, motDePasse } = req.body || {};
  if (!validCredentials(identifiant, motDePasse)) {
    return res.status(400).json({ message: 'L’identifiant doit contenir 3 à 100 caractères et le mot de passe 8 à 128 caractères.' });
  }

  const normalizedIdentifier = identifiant.trim();
  try {
    const passwordHash = await bcrypt.hash(motDePasse, bcryptRounds);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute('INSERT INTO utilisateurs (identifiant, mot_de_passe_hash) VALUES (?, ?)', [normalizedIdentifier, passwordHash]);
      await connection.execute('INSERT INTO parametres (utilisateur_id) VALUES (?)', [result.insertId]);
      await connection.commit();
      const token = jwt.sign({ identifiant: normalizedIdentifier }, getJwtSecret(), { subject: String(result.insertId), expiresIn: jwtExpiresIn });
      return res.status(201).json({ token });
    } catch (error) {
      await connection.rollback();
      if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Cet identifiant est déjà utilisé.' });
      throw error;
    } finally { connection.release(); }
  } catch (error) {
    console.error('Création de compte impossible :', error.message);
    return res.status(500).json({ message: 'La création du compte est temporairement indisponible.' });
  }
}

module.exports = { login, signup };
