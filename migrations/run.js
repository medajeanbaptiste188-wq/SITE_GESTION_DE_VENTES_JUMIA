require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');
const { databaseOptions } = require('../src/config/database');

async function runMigrations() {
  const connection = await mysql.createConnection({
    ...databaseOptions,
    multipleStatements: true
  });

  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        nom VARCHAR(255) NOT NULL,
        executee_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (nom)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const directory = __dirname;
    const files = (await fs.readdir(directory))
      .filter((file) => /^\d+_.+\.sql$/u.test(file))
      .sort();

    for (const file of files) {
      const [alreadyRun] = await connection.execute(
        'SELECT nom FROM schema_migrations WHERE nom = ?',
        [file]
      );
      if (alreadyRun.length > 0) {
        console.log(`Migration déjà appliquée : ${file}`);
        continue;
      }

      const sql = await fs.readFile(path.join(directory, file), 'utf8');
      await connection.beginTransaction();
      try {
        await connection.query(sql);
        await connection.execute('INSERT INTO schema_migrations (nom) VALUES (?)', [file]);
        await connection.commit();
        console.log(`Migration appliquée : ${file}`);
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
  } finally {
    await connection.end();
  }
}

runMigrations()
  .then(() => console.log('Migrations terminées.'))
  .catch((error) => {
    console.error(`Échec des migrations : ${error.message}`);
    process.exitCode = 1;
  });
