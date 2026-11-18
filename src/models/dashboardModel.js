const { pool } = require('../config/database');

async function monthlyTotals(userId, mois, annee) {
  const [rows] = await pool.execute(
    `SELECT
       COALESCE(SUM((prix_vente_fige - remise) * quantite), 0) AS chiffre_affaires,
       COALESCE(SUM(prix_achat_fige * quantite), 0) AS total_achats,
       COALESCE(SUM(CASE WHEN canal = 'jumia' THEN commission ELSE 0 END), 0) AS total_commissions,
       COALESCE(SUM(CASE WHEN canal = 'jumia' THEN frais_fixe_fige * quantite ELSE 0 END), 0) AS total_frais_fixes,
       COALESCE(SUM(remise * quantite), 0) AS total_remises,
       COALESCE(SUM(autres_frais), 0) AS total_autres_frais,
       COALESCE(SUM(benefice), 0) AS benefice_net,
       COALESCE(SUM(quantite), 0) AS articles_vendus,
       COUNT(*) AS nombre_ventes
     FROM ventes WHERE utilisateur_id = ? AND statut = 'livree' AND mois = ? AND annee = ?`,
    [userId, mois, annee]
  );
  return rows[0];
}

async function weeklyTotals(userId, debut, fin) {
  const [rows] = await pool.execute(
    `SELECT
       COALESCE(SUM(prix_achat_fige * quantite), 0) AS total_achats,
       COALESCE(SUM(benefice), 0) AS benefice_net
     FROM ventes
      WHERE utilisateur_id = ? AND statut = 'livree' AND date BETWEEN ? AND ?`,
    [userId, debut, fin]
  );
  return rows[0];
}

async function topProducts(userId, mois, annee, orderBy) {
  const columns = orderBy === 'quantite' ? 'SUM(v.quantite) DESC, SUM(v.benefice) DESC' : 'SUM(v.benefice) DESC, SUM(v.quantite) DESC';
  const [rows] = await pool.execute(
    `SELECT p.id AS produit_id, p.nom, SUM(v.quantite) AS quantite_vendue,
       SUM(v.benefice) AS benefice, SUM((v.prix_vente_fige - v.remise) * v.quantite) AS chiffre_affaires
     FROM ventes v INNER JOIN produits p ON p.id = v.produit_id
     WHERE v.utilisateur_id = ? AND v.statut = 'livree' AND v.mois = ? AND v.annee = ?
     GROUP BY p.id, p.nom ORDER BY ${columns} LIMIT 5`,
    [userId, mois, annee]
  );
  return rows;
}

async function monthlyHistory(userId, periods) {
  const conditions = periods.map(() => '(annee = ? AND mois = ?)').join(' OR ');
  const values = periods.flatMap((period) => [period.annee, period.mois]);
  const [rows] = await pool.execute(
    `SELECT annee, mois, COALESCE(SUM(benefice), 0) AS benefice_net
     FROM ventes WHERE utilisateur_id = ? AND statut = 'livree' AND (${conditions})
     GROUP BY annee, mois`,
    [userId, ...values]
  );
  return rows;
}

async function exportRows(userId, mois, annee) {
  const [rows] = await pool.execute(
    `SELECT v.id, v.date, p.nom AS produit, v.canal, v.quantite, v.prix_achat_fige, v.prix_vente_fige,
       v.remise, (v.prix_vente_fige - v.remise) AS prix_applique, v.taux_commission_fige, v.frais_fixe_fige, v.frais_fixes_totaux,
       v.commission, v.autres_frais, v.benefice, pr.nom AS promotion
     FROM ventes v
     INNER JOIN produits p ON p.id = v.produit_id
     LEFT JOIN promotions pr ON pr.id = v.promotion_id
     WHERE v.utilisateur_id = ? AND v.statut = 'livree' AND v.mois = ? AND v.annee = ?
     ORDER BY v.date ASC, v.id ASC`,
    [userId, mois, annee]
  );
  return rows;
}

module.exports = { monthlyTotals, weeklyTotals, topProducts, monthlyHistory, exportRows };
