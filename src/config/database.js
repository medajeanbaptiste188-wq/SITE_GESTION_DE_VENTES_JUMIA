const mysql = require('mysql2/promise');

const dbPort = Number(process.env.DB_PORT || 3306);

const databaseOptions = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number.isInteger(dbPort) && dbPort > 0 ? dbPort : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  dateStrings: true
};

const pool = mysql.createPool(databaseOptions);

async function checkDatabaseConnection() {
  await pool.query('SELECT 1 AS connected');
}

module.exports = { pool, checkDatabaseConnection, databaseOptions };
