ALTER TABLE categories
  ADD COLUMN frais_fixe DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER taux_commission;

ALTER TABLE produits
  ADD COLUMN frais_fixe DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER taux_commission;

ALTER TABLE ventes
  ADD COLUMN frais_fixe_fige DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER taux_commission_fige;
