const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

const IMAGE_PREFIX = '/uploads/products/';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function backupError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function asArray(value, name) {
  if (!Array.isArray(value)) throw backupError(`La section « ${name} » de la sauvegarde est invalide.`);
  return value;
}

function imagePathFor(userId, photo) {
  if (typeof photo !== 'string') return null;
  const prefix = `${IMAGE_PREFIX}${userId}/`;
  if (!photo.startsWith(prefix) || !/^[a-f0-9-]+\.webp$/iu.test(photo.slice(prefix.length))) return null;
  return path.join(__dirname, '../../uploads/products', String(userId), photo.slice(prefix.length));
}

async function imageForBackup(userId, photo) {
  const file = imagePathFor(userId, photo);
  if (!file) return null;
  try {
    const contents = await fs.promises.readFile(file);
    return { mime: 'image/webp', data: contents.toString('base64') };
  } catch (error) {
    // Une ancienne image supprimée ne doit pas empêcher la sauvegarde des données.
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function createBackup(req, res) {
  try {
    const userId = req.user.id;
    const [[categories], [products], [promotions], [promotionProducts], [sales], [periods], [settings]] = await Promise.all([
      pool.execute('SELECT nom, taux_commission, frais_fixe, actif FROM categories WHERE utilisateur_id = ? ORDER BY id', [userId]),
      pool.execute('SELECT id, nom, categorie, photo, prix_achat, prix_vente, taux_commission, frais_fixe, stock, actif FROM produits WHERE utilisateur_id = ? ORDER BY id', [userId]),
      pool.execute('SELECT id, nom, type, valeur, date_debut, date_fin, recurrence, jour_semaine FROM promotions WHERE utilisateur_id = ? ORDER BY id', [userId]),
      pool.execute(`SELECT pp.promotion_id, pp.produit_id FROM promotion_produit pp INNER JOIN promotions p ON p.id = pp.promotion_id WHERE p.utilisateur_id = ? ORDER BY pp.promotion_id, pp.produit_id`, [userId]),
      pool.execute(`SELECT id, produit_id, promotion_id, date, date_commande, statut, canal, mois, annee, quantite, prix_achat_fige, prix_vente_fige, remise, taux_commission_fige, frais_fixe_fige, frais_fixes_totaux, commission, autres_frais, benefice FROM ventes WHERE utilisateur_id = ? ORDER BY id`, [userId]),
      pool.execute('SELECT mois, annee, actif FROM periodes WHERE utilisateur_id = ? ORDER BY annee, mois', [userId]),
      pool.execute('SELECT commission_par_defaut, devise FROM parametres WHERE utilisateur_id = ? LIMIT 1', [userId])
    ]);
    const productImages = await Promise.all(products.map((product) => imageForBackup(userId, product.photo)));
    const productIdsByPromotion = new Map();
    promotionProducts.forEach((row) => {
      const ids = productIdsByPromotion.get(row.promotion_id) || [];
      ids.push(row.produit_id);
      productIdsByPromotion.set(row.promotion_id, ids);
    });
    return res.json({
      version: 6,
      exporte_le: new Date().toISOString(),
      categories,
      produits: products.map((product, index) => ({ ...product, image: productImages[index] })),
      promotions: promotions.map((promotion) => ({ ...promotion, produit_ids: productIdsByPromotion.get(promotion.id) || [] })),
      ventes: sales,
      periodes: periods,
      parametres: settings[0] || null
    });
  } catch (error) {
    console.error('Sauvegarde impossible :', error.message);
    return res.status(500).json({ message: 'Impossible de créer la sauvegarde.' });
  }
}

function validateBackup(data) {
  if (!data || typeof data !== 'object' || (data.version !== 5 && data.version !== 6)) throw backupError('Ce fichier n’est pas une sauvegarde complète compatible.');
  const backup = {
    categories: asArray(data.categories, 'categories'), produits: asArray(data.produits, 'produits'),
    promotions: asArray(data.promotions, 'promotions'), ventes: asArray(data.ventes, 'ventes'), periodes: asArray(data.periodes, 'periodes'),
    parametres: data.parametres && typeof data.parametres === 'object' ? data.parametres : null
  };
  const productIds = new Set(); const promotionIds = new Set();
  backup.produits.forEach((product) => { if (!Number.isSafeInteger(Number(product.id)) || productIds.has(Number(product.id))) throw backupError('Un produit de la sauvegarde est invalide.'); productIds.add(Number(product.id)); });
  backup.promotions.forEach((promotion) => {
    if (!Number.isSafeInteger(Number(promotion.id)) || promotionIds.has(Number(promotion.id)) || !Array.isArray(promotion.produit_ids) || promotion.produit_ids.some((id) => !productIds.has(Number(id)))) throw backupError('Une promotion de la sauvegarde est invalide.');
    promotionIds.add(Number(promotion.id));
  });
  backup.ventes.forEach((sale) => {
    if (!productIds.has(Number(sale.produit_id)) || (sale.promotion_id !== null && sale.promotion_id !== undefined && !promotionIds.has(Number(sale.promotion_id)))) throw backupError('Une vente de la sauvegarde est invalide.');
    if (sale.canal !== undefined && sale.canal !== null && sale.canal !== 'jumia' && sale.canal !== 'directe') throw backupError('Une vente de la sauvegarde a un canal invalide.');
    sale.canal = sale.canal === 'directe' ? 'directe' : 'jumia';
  });
  return backup;
}

async function restoreImages(userId, products) {
  const directory = path.join(__dirname, '../../uploads/products', String(userId));
  const created = [];
  const photos = new Map();
  try {
    for (const product of products) {
      if (!product.image) { photos.set(Number(product.id), null); continue; }
      if (product.image.mime !== 'image/webp' || typeof product.image.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/u.test(product.image.data)) throw backupError('Une image de la sauvegarde est invalide.');
      const contents = Buffer.from(product.image.data, 'base64');
      if (!contents.length || contents.length > MAX_IMAGE_BYTES) throw backupError('Une image de la sauvegarde est trop volumineuse.');
      await fs.promises.mkdir(directory, { recursive: true });
      const filename = `${crypto.randomUUID()}.webp`; const file = path.join(directory, filename);
      await fs.promises.writeFile(file, contents, { flag: 'wx' });
      created.push(file); photos.set(Number(product.id), `${IMAGE_PREFIX}${userId}/${filename}`);
    }
    return { photos, created };
  } catch (error) {
    await Promise.all(created.map((file) => fs.promises.unlink(file).catch(() => {})));
    throw error;
  }
}

async function restoreBackup(req, res) {
  let images;
  try {
    const backup = validateBackup(req.body);
    const userId = req.user.id;
    images = await restoreImages(userId, backup.produits);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('DELETE FROM ventes WHERE utilisateur_id = ?', [userId]);
      await connection.execute('DELETE FROM promotions WHERE utilisateur_id = ?', [userId]);
      await connection.execute('DELETE FROM produits WHERE utilisateur_id = ?', [userId]);
      await connection.execute('DELETE FROM categories WHERE utilisateur_id = ?', [userId]);
      await connection.execute('DELETE FROM periodes WHERE utilisateur_id = ?', [userId]);
      await connection.execute('DELETE FROM parametres WHERE utilisateur_id = ?', [userId]);

      for (const category of backup.categories) await connection.execute('INSERT INTO categories (utilisateur_id, nom, taux_commission, frais_fixe, actif) VALUES (?, ?, ?, ?, ?)', [userId, category.nom, category.taux_commission, category.frais_fixe, category.actif]);
      const productMap = new Map();
      for (const product of backup.produits) {
        const [result] = await connection.execute('INSERT INTO produits (utilisateur_id, nom, categorie, photo, prix_achat, prix_vente, taux_commission, frais_fixe, stock, actif) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [userId, product.nom, product.categorie, images.photos.get(Number(product.id)), product.prix_achat, product.prix_vente, product.taux_commission, product.frais_fixe, product.stock, product.actif]);
        productMap.set(Number(product.id), result.insertId);
      }
      const promotionMap = new Map();
      for (const promotion of backup.promotions) {
        const [result] = await connection.execute('INSERT INTO promotions (utilisateur_id, nom, type, valeur, date_debut, date_fin, recurrence, jour_semaine) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [userId, promotion.nom, promotion.type, promotion.valeur, promotion.date_debut, promotion.date_fin, promotion.recurrence, promotion.jour_semaine]);
        promotionMap.set(Number(promotion.id), result.insertId);
        for (const oldProductId of promotion.produit_ids) await connection.execute('INSERT INTO promotion_produit (promotion_id, produit_id) VALUES (?, ?)', [result.insertId, productMap.get(Number(oldProductId))]);
      }
      for (const sale of backup.ventes) await connection.execute('INSERT INTO ventes (utilisateur_id, produit_id, promotion_id, date, date_commande, statut, canal, mois, annee, quantite, prix_achat_fige, prix_vente_fige, remise, taux_commission_fige, frais_fixe_fige, frais_fixes_totaux, commission, autres_frais, benefice) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [userId, productMap.get(Number(sale.produit_id)), sale.promotion_id === null || sale.promotion_id === undefined ? null : promotionMap.get(Number(sale.promotion_id)), sale.date, sale.date_commande, sale.statut, sale.canal || 'jumia', sale.mois, sale.annee, sale.quantite, sale.prix_achat_fige, sale.prix_vente_fige, sale.remise, sale.taux_commission_fige, sale.frais_fixe_fige, sale.frais_fixes_totaux, sale.commission, sale.autres_frais, sale.benefice]);
      for (const period of backup.periodes) await connection.execute('INSERT INTO periodes (utilisateur_id, mois, annee, actif) VALUES (?, ?, ?, ?)', [userId, period.mois, period.annee, period.actif]);
      if (backup.parametres) await connection.execute('INSERT INTO parametres (utilisateur_id, commission_par_defaut, devise) VALUES (?, ?, ?)', [userId, backup.parametres.commission_par_defaut, backup.parametres.devise]);
      await connection.commit();
    } catch (error) {
      await connection.rollback(); throw error;
    } finally { connection.release(); }
    return res.json({ message: 'Sauvegarde complète restaurée.' });
  } catch (error) {
    if (images?.created) await Promise.all(images.created.map((file) => fs.promises.unlink(file).catch(() => {})));
    console.error('Restauration impossible :', error.message);
    return res.status(error.status || 500).json({ message: error.status ? error.message : 'La restauration a échoué. Vos données n’ont pas été modifiées.' });
  }
}

module.exports = { createBackup, restoreBackup };
