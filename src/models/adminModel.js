const { pool } = require('../config/database');

function listCategories(userId) { return pool.execute('SELECT id, nom, taux_commission, frais_fixe, actif FROM categories WHERE utilisateur_id = ? ORDER BY actif DESC, nom ASC', [userId]).then(([rows]) => rows); }
function createCategory(userId, category) { return pool.execute('INSERT INTO categories (utilisateur_id, nom, taux_commission, frais_fixe, actif) VALUES (?, ?, ?, ?, ?)', [userId, category.nom, category.taux_commission, category.frais_fixe, category.actif ?? 1]).then(([result]) => findCategory(userId, result.insertId)); }
function findCategory(userId, id) { return pool.execute('SELECT id, nom, taux_commission, frais_fixe, actif FROM categories WHERE utilisateur_id = ? AND id = ?', [userId, id]).then(([rows]) => rows[0] || null); }
async function updateCategory(userId, id, fields) { const keys = Object.keys(fields); if (!keys.length) return findCategory(userId, id); const values = keys.map((key) => fields[key]); values.push(id, userId); const [result] = await pool.execute(`UPDATE categories SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ? AND utilisateur_id = ?`, values); return result.affectedRows ? findCategory(userId, id) : null; }
async function removeCategory(userId, id) { const [result] = await pool.execute('DELETE FROM categories WHERE id = ? AND utilisateur_id = ?', [id, userId]); return result.affectedRows > 0; }

function listPeriods(userId) { return pool.execute('SELECT id, mois, annee, actif FROM periodes WHERE utilisateur_id = ? ORDER BY annee DESC, mois DESC', [userId]).then(([rows]) => rows); }
function createPeriod(userId, period) { return pool.execute('INSERT INTO periodes (utilisateur_id, mois, annee, actif) VALUES (?, ?, ?, ?)', [userId, period.mois, period.annee, period.actif ?? 1]).then(([result]) => findPeriod(userId, result.insertId)); }
function findPeriod(userId, id) { return pool.execute('SELECT id, mois, annee, actif FROM periodes WHERE utilisateur_id = ? AND id = ?', [userId, id]).then(([rows]) => rows[0] || null); }
async function updatePeriod(userId, id, fields) { const keys = Object.keys(fields); if (!keys.length) return findPeriod(userId, id); const values = keys.map((key) => fields[key]); values.push(id, userId); const [result] = await pool.execute(`UPDATE periodes SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ? AND utilisateur_id = ?`, values); return result.affectedRows ? findPeriod(userId, id) : null; }
async function removePeriod(userId, id) { const [result] = await pool.execute('DELETE FROM periodes WHERE id = ? AND utilisateur_id = ?', [id, userId]); return result.affectedRows > 0; }

module.exports = { listCategories, createCategory, updateCategory, removeCategory, listPeriods, createPeriod, updatePeriod, removePeriod };
