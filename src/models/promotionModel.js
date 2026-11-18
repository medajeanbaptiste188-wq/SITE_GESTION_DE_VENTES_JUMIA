const { pool } = require('../config/database');

function toPromotion(row) {
  return {
    ...row,
    produit_ids: row.produit_ids ? row.produit_ids.split(',').map(Number) : []
  };
}

async function findAll(userId, mois, annee) {
  const [rows] = await pool.execute(
    `SELECT p.id, p.nom, p.type, p.valeur, p.date_debut, p.date_fin, p.recurrence, p.jour_semaine, p.date_creation,
            GROUP_CONCAT(pp.produit_id ORDER BY pp.produit_id) AS produit_ids,
            COUNT(pp.produit_id) AS produits_count,
            (SELECT pr.photo
             FROM promotion_produit pp_photo
             INNER JOIN produits pr ON pr.id = pp_photo.produit_id
             WHERE pp_photo.promotion_id = p.id
             ORDER BY pp_photo.produit_id ASC
             LIMIT 1) AS produit_photo,
            (SELECT COALESCE(SUM(v.quantite), 0)
              FROM ventes v
              WHERE v.utilisateur_id = p.utilisateur_id
                AND v.promotion_id = p.id
                AND v.statut = 'livree'
                AND v.mois = ?
                AND v.annee = ?) AS produits_vendus
     FROM promotions p
     LEFT JOIN promotion_produit pp ON pp.promotion_id = p.id
     WHERE p.utilisateur_id = ?
     GROUP BY p.id, p.nom, p.type, p.valeur, p.date_debut, p.date_fin, p.recurrence, p.jour_semaine, p.date_creation
     ORDER BY p.date_debut DESC, p.id DESC`,
    [mois, annee, userId]
  );
  return rows.map(toPromotion);
}

async function findById(userId, promotionId, connection = pool) {
  const [rows] = await connection.execute(
    `SELECT id, nom, type, valeur, date_debut, date_fin, recurrence, jour_semaine, date_creation
     FROM promotions WHERE id = ? AND utilisateur_id = ? LIMIT 1`,
    [promotionId, userId]
  );
  if (!rows[0]) return null;
  const [products] = await connection.execute(
    `SELECT pp.produit_id FROM promotion_produit pp
     INNER JOIN produits pr ON pr.id = pp.produit_id
     WHERE pp.promotion_id = ? AND pr.utilisateur_id = ? ORDER BY pp.produit_id`,
    [promotionId, userId]
  );
  return { ...rows[0], produit_ids: products.map((row) => Number(row.produit_id)) };
}

async function assertProductsOwned(connection, userId, productIds) {
  const placeholders = productIds.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT id FROM produits WHERE utilisateur_id = ? AND id IN (${placeholders})`,
    [userId, ...productIds]
  );
  if (rows.length !== productIds.length) {
    const error = new Error('Un ou plusieurs produits sont introuvables.');
    error.code = 'INVALID_PROMOTION_PRODUCTS';
    throw error;
  }
}

async function assertPromoPriceIsValid(connection, userId, productIds, type, value) {
  if (type !== 'prix_promo') return;
  const placeholders = productIds.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT nom FROM produits
     WHERE utilisateur_id = ? AND id IN (${placeholders}) AND prix_vente < ?`,
    [userId, ...productIds, value]
  );
  if (rows.length) {
    const error = new Error(`Le prix promo dépasse le prix de vente de : ${rows.map((row) => row.nom).join(', ')}.`);
    error.code = 'INVALID_PROMO_PRICE';
    throw error;
  }
}

async function replaceProducts(connection, promotionId, productIds) {
  await connection.execute('DELETE FROM promotion_produit WHERE promotion_id = ?', [promotionId]);
  const placeholders = productIds.map(() => '(?, ?)').join(', ');
  const values = productIds.flatMap((productId) => [promotionId, productId]);
  await connection.execute(`INSERT INTO promotion_produit (promotion_id, produit_id) VALUES ${placeholders}`, values);
}

async function create(userId, promotion) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await assertProductsOwned(connection, userId, promotion.produit_ids);
    await assertPromoPriceIsValid(connection, userId, promotion.produit_ids, promotion.type, promotion.valeur);
    const [result] = await connection.execute(
      `INSERT INTO promotions (utilisateur_id, nom, type, valeur, date_debut, date_fin, recurrence, jour_semaine)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, promotion.nom, promotion.type, promotion.valeur, promotion.date_debut, promotion.date_fin, promotion.recurrence, promotion.jour_semaine]
    );
    await replaceProducts(connection, result.insertId, promotion.produit_ids);
    const created = await findById(userId, result.insertId, connection);
    await connection.commit();
    return created;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function update(userId, promotionId, fields, productIds) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const existing = await findById(userId, promotionId, connection);
    if (!existing) {
      await connection.rollback();
      return null;
    }
    if (productIds) await assertProductsOwned(connection, userId, productIds);
    await assertPromoPriceIsValid(
      connection,
      userId,
      productIds || existing.produit_ids,
      fields.type || existing.type,
      fields.valeur || existing.valeur
    );
    const columns = Object.keys(fields).map((column) => `${column} = ?`);
    if (columns.length > 0) {
      await connection.execute(
        `UPDATE promotions SET ${columns.join(', ')} WHERE id = ? AND utilisateur_id = ?`,
        [...Object.values(fields), promotionId, userId]
      );
    }
    if (productIds) await replaceProducts(connection, promotionId, productIds);
    const updated = await findById(userId, promotionId, connection);
    await connection.commit();
    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function remove(userId, promotionId) {
  const [result] = await pool.execute('DELETE FROM promotions WHERE id = ? AND utilisateur_id = ?', [promotionId, userId]);
  return result.affectedRows > 0;
}

module.exports = { findAll, findById, create, update, remove };
