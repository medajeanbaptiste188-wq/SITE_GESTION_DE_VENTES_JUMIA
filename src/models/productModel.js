const { pool } = require('../config/database');

async function findAll(userId, { recherche, categorie, includeArchived }) {
  const conditions = ['utilisateur_id = ?'];
  const values = [userId];
  if (!includeArchived) conditions.push('actif = 1');
  if (recherche) {
    conditions.push('nom LIKE ?');
    values.push(`%${recherche}%`);
  }
  if (categorie) {
    conditions.push('categorie = ?');
    values.push(categorie);
  }
  const [rows] = await pool.execute(
    `SELECT id, nom, categorie, photo, prix_achat, prix_vente, taux_commission, frais_fixe, stock, actif, date_creation
     FROM produits WHERE ${conditions.join(' AND ')} ORDER BY actif DESC, nom ASC`,
    values
  );
  return rows;
}

async function findById(userId, productId) {
  const [rows] = await pool.execute(
    `SELECT id, nom, categorie, photo, prix_achat, prix_vente, taux_commission, frais_fixe, stock, actif, date_creation
     FROM produits WHERE id = ? AND utilisateur_id = ? LIMIT 1`,
    [productId, userId]
  );
  return rows[0] || null;
}

async function create(userId, product) {
  const [result] = await pool.execute(
    `INSERT INTO produits (utilisateur_id, nom, categorie, photo, prix_achat, prix_vente, taux_commission, frais_fixe, stock, actif)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, product.nom, product.categorie, product.photo, product.prix_achat, product.prix_vente, product.taux_commission, product.frais_fixe, product.stock, product.actif]
  );
  return findById(userId, result.insertId);
}

async function update(userId, productId, fields) {
  const values = Object.values(fields);
  const columns = Object.keys(fields).map((column) => `${column} = ?`);
  if (columns.length === 0) return findById(userId, productId);
  values.push(productId, userId);
  const [result] = await pool.execute(
    `UPDATE produits SET ${columns.join(', ')} WHERE id = ? AND utilisateur_id = ?`,
    values
  );
  if (result.affectedRows === 0) return null;
  return findById(userId, productId);
}

async function remove(userId, productId) {
  const [result] = await pool.execute('DELETE FROM produits WHERE id = ? AND utilisateur_id = ?', [productId, userId]);
  return result.affectedRows > 0;
}

module.exports = { findAll, findById, create, update, remove };
