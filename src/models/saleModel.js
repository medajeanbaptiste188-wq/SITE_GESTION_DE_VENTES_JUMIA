const { pool } = require('../config/database');

const saleColumns = `v.id, v.produit_id, v.promotion_id, v.date, v.date_commande, v.statut, v.canal, v.mois, v.annee, v.quantite,
  v.prix_achat_fige, v.prix_vente_fige, v.remise, v.taux_commission_fige, v.frais_fixe_fige, v.frais_fixes_totaux,
  v.commission, v.autres_frais, v.benefice, v.date_creation, p.nom AS produit_nom, p.photo AS produit_photo, pr.nom AS promotion`;

async function findAll(userId, mois, annee) {
  const [rows] = await pool.execute(
    `SELECT ${saleColumns} FROM ventes v
     INNER JOIN produits p ON p.id = v.produit_id
     LEFT JOIN promotions pr ON pr.id = v.promotion_id
     WHERE v.utilisateur_id = ? AND v.statut = 'livree' AND v.mois = ? AND v.annee = ?
     ORDER BY v.date DESC, v.id DESC`,
    [userId, mois, annee]
  );
  return rows;
}

async function findPending(userId) {
  const [rows] = await pool.execute(
    `SELECT ${saleColumns} FROM ventes v
     INNER JOIN produits p ON p.id = v.produit_id
     LEFT JOIN promotions pr ON pr.id = v.promotion_id
     WHERE v.utilisateur_id = ? AND v.statut = 'en_attente'
     ORDER BY v.date_commande DESC, v.id DESC`,
    [userId]
  );
  return rows;
}

async function findPeriodsWithSales(userId, moisCourant, anneeCourante) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT mois, annee FROM ventes
     WHERE utilisateur_id = ? AND statut = 'livree' AND (annee < ? OR (annee = ? AND mois <= ?))
     ORDER BY annee DESC, mois DESC`,
    [userId, anneeCourante, anneeCourante, moisCourant]
  );
  return rows;
}

async function findById(userId, saleId, connection = pool) {
  const [rows] = await connection.execute(
    `SELECT ${saleColumns} FROM ventes v
     INNER JOIN produits p ON p.id = v.produit_id
     LEFT JOIN promotions pr ON pr.id = v.promotion_id
     WHERE v.id = ? AND v.utilisateur_id = ? LIMIT 1`,
    [saleId, userId]
  );
  return rows[0] || null;
}

async function findActiveProduct(connection, userId, productId) {
  const [rows] = await connection.execute(
    `SELECT id, prix_achat, prix_vente, taux_commission, frais_fixe
     FROM produits WHERE id = ? AND utilisateur_id = ? AND actif = 1 LIMIT 1`,
    [productId, userId]
  );
  return rows[0] || null;
}

async function findApplicablePromotion(connection, userId, productId, date, promotionId) {
  const conditions = [
    'p.utilisateur_id = ?',
    'pp.produit_id = ?',
    '? >= p.date_debut',
    '(p.date_fin IS NULL OR ? <= p.date_fin)',
    "(p.recurrence = 'aucune' OR (p.recurrence = 'hebdomadaire' AND p.jour_semaine = DAYOFWEEK(?) - 1))"
  ];
  const values = [userId, productId, date, date, date];
  if (promotionId !== undefined) {
    conditions.push('p.id = ?');
    values.push(promotionId);
  }
  const [rows] = await connection.execute(
    `SELECT p.id, p.type, p.valeur FROM promotions p
     INNER JOIN promotion_produit pp ON pp.promotion_id = p.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.date_debut DESC, p.id DESC LIMIT 1`,
    values
  );
  return rows[0] || null;
}

async function create(userId, sale) {
  const [result] = await pool.execute(
    `INSERT INTO ventes (utilisateur_id, produit_id, promotion_id, date, mois, annee, quantite, date_commande, statut, canal,
      prix_achat_fige, prix_vente_fige, remise, taux_commission_fige, frais_fixe_fige, frais_fixes_totaux, commission, autres_frais, benefice)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, sale.produit_id, sale.promotion_id, sale.date, sale.mois, sale.annee, sale.quantite, sale.date_commande, sale.statut, sale.canal,
      sale.prix_achat_fige, sale.prix_vente_fige, sale.remise, sale.taux_commission_fige, sale.frais_fixe_fige, sale.frais_fixes_totaux,
      sale.commission, sale.autres_frais, sale.benefice]
  );
  return findById(userId, result.insertId);
}

async function markDelivered(userId, saleId, date) {
  const [result] = await pool.execute(
    `UPDATE ventes SET statut = 'livree', date = ?, mois = MONTH(?), annee = YEAR(?)
     WHERE id = ? AND utilisateur_id = ? AND statut = 'en_attente'`,
    [date, date, date, saleId, userId]
  );
  return result.affectedRows ? findById(userId, saleId) : null;
}

async function update(userId, saleId, sale) {
  const [result] = await pool.execute(
    `UPDATE ventes SET produit_id = ?, promotion_id = ?, date = ?, date_commande = ?, canal = ?, mois = ?, annee = ?, quantite = ?,
      prix_achat_fige = ?, prix_vente_fige = ?, remise = ?, taux_commission_fige = ?, frais_fixe_fige = ?, frais_fixes_totaux = ?,
      commission = ?, autres_frais = ?, benefice = ?
     WHERE id = ? AND utilisateur_id = ?`,
    [sale.produit_id, sale.promotion_id, sale.date, sale.date_commande, sale.canal, sale.mois, sale.annee, sale.quantite,
      sale.prix_achat_fige, sale.prix_vente_fige, sale.remise, sale.taux_commission_fige, sale.frais_fixe_fige, sale.frais_fixes_totaux,
      sale.commission, sale.autres_frais, sale.benefice, saleId, userId]
  );
  return result.affectedRows ? findById(userId, saleId) : null;
}

async function remove(userId, saleId) {
  const [result] = await pool.execute('DELETE FROM ventes WHERE id = ? AND utilisateur_id = ?', [saleId, userId]);
  return result.affectedRows > 0;
}

module.exports = { findAll, findPending, findPeriodsWithSales, findById, findActiveProduct, findApplicablePromotion, create, markDelivered, update, remove };
