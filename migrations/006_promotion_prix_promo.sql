ALTER TABLE promotions
  MODIFY COLUMN type ENUM('pourcentage', 'montant', 'prix_promo') NOT NULL;
