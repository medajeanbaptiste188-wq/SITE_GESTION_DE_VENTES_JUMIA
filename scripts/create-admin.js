require('dotenv').config();

const bcrypt = require('bcrypt');
const { pool } = require('../src/config/database');
const { bcryptRounds } = require('../src/config/auth');

const identifiant = (process.env.ADMIN_IDENTIFIANT || '').trim();
const motDePasse = process.env.ADMIN_MOT_DE_PASSE || '';

async function createAdmin() {
  if (identifiant.length < 3 || identifiant.length > 100 || motDePasse.length < 8 || motDePasse.length > 128) {
    throw new Error('ADMIN_IDENTIFIANT doit contenir 3 à 100 caractères et ADMIN_MOT_DE_PASSE 8 à 128 caractères.');
  }

  const passwordHash = await bcrypt.hash(motDePasse, bcryptRounds);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      'INSERT INTO utilisateurs (identifiant, mot_de_passe_hash) VALUES (?, ?)',
      [identifiant, passwordHash]
    );
    await connection.execute('INSERT INTO parametres (utilisateur_id) VALUES (?)', [result.insertId]);
    await connection.commit();
    console.log('Utilisateur administrateur créé.');
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      throw new Error('Cet identifiant existe déjà.');
    }
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

createAdmin().catch((error) => {
  console.error(`Création de l’administrateur impossible : ${error.message}`);
  process.exitCode = 1;
});
