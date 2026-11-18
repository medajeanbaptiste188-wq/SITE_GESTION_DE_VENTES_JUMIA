CREATE TABLE IF NOT EXISTS utilisateurs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  identifiant VARCHAR(100) NOT NULL,
  mot_de_passe_hash VARCHAR(255) NOT NULL,
  tentatives_echouees TINYINT UNSIGNED NOT NULL DEFAULT 0,
  verrouille_jusqu_a DATETIME NULL,
  date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  date_modification DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_utilisateurs_identifiant (identifiant)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS produits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  utilisateur_id BIGINT UNSIGNED NOT NULL,
  nom VARCHAR(255) NOT NULL,
  categorie VARCHAR(100) NOT NULL,
  photo VARCHAR(500) NULL,
  prix_achat DECIMAL(12,2) NOT NULL,
  prix_vente DECIMAL(12,2) NOT NULL,
  taux_commission DECIMAL(5,2) NOT NULL,
  stock INT UNSIGNED NULL,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  date_modification DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_produits_utilisateur_actif (utilisateur_id, actif),
  KEY idx_produits_utilisateur_categorie (utilisateur_id, categorie),
  CONSTRAINT fk_produits_utilisateur FOREIGN KEY (utilisateur_id)
    REFERENCES utilisateurs (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promotions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  utilisateur_id BIGINT UNSIGNED NOT NULL,
  nom VARCHAR(255) NOT NULL,
  type ENUM('pourcentage', 'montant', 'prix_promo') NOT NULL,
  valeur DECIMAL(12,2) NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NULL,
  recurrence ENUM('aucune', 'hebdomadaire') NOT NULL DEFAULT 'aucune',
  jour_semaine TINYINT UNSIGNED NULL,
  date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  date_modification DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_promotions_utilisateur_dates (utilisateur_id, date_debut, date_fin),
  CONSTRAINT fk_promotions_utilisateur FOREIGN KEY (utilisateur_id)
    REFERENCES utilisateurs (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promotion_produit (
  promotion_id BIGINT UNSIGNED NOT NULL,
  produit_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (promotion_id, produit_id),
  KEY idx_promotion_produit_produit (produit_id),
  CONSTRAINT fk_promotion_produit_promotion FOREIGN KEY (promotion_id)
    REFERENCES promotions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_promotion_produit_produit FOREIGN KEY (produit_id)
    REFERENCES produits (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ventes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  utilisateur_id BIGINT UNSIGNED NOT NULL,
  produit_id BIGINT UNSIGNED NOT NULL,
  promotion_id BIGINT UNSIGNED NULL,
  date DATE NOT NULL,
  mois TINYINT UNSIGNED NOT NULL,
  annee SMALLINT UNSIGNED NOT NULL,
  quantite INT UNSIGNED NOT NULL,
  prix_achat_fige DECIMAL(12,2) NOT NULL,
  prix_vente_fige DECIMAL(12,2) NOT NULL,
  remise DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  taux_commission_fige DECIMAL(5,2) NOT NULL,
  commission DECIMAL(12,2) NOT NULL,
  autres_frais DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  benefice DECIMAL(12,2) NOT NULL,
  date_creation DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  date_modification DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ventes_utilisateur_mois_annee (utilisateur_id, annee, mois),
  KEY idx_ventes_annee_mois (annee, mois),
  KEY idx_ventes_produit (produit_id),
  CONSTRAINT fk_ventes_utilisateur FOREIGN KEY (utilisateur_id)
    REFERENCES utilisateurs (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_ventes_produit FOREIGN KEY (produit_id)
    REFERENCES produits (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_ventes_promotion FOREIGN KEY (promotion_id)
    REFERENCES promotions (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parametres (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  utilisateur_id BIGINT UNSIGNED NOT NULL,
  commission_par_defaut DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  devise VARCHAR(10) NOT NULL DEFAULT 'FCFA',
  code_pin_hash VARCHAR(255) NULL,
  date_modification DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_parametres_utilisateur (utilisateur_id),
  CONSTRAINT fk_parametres_utilisateur FOREIGN KEY (utilisateur_id)
    REFERENCES utilisateurs (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
