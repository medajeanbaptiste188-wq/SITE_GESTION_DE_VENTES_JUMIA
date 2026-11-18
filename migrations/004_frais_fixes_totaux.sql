ALTER TABLE ventes
  ADD COLUMN frais_fixes_totaux DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER frais_fixe_fige;

UPDATE ventes
SET frais_fixes_totaux = frais_fixe_fige * quantite,
    commission = commission - (frais_fixe_fige * quantite)
WHERE frais_fixe_fige > 0.00;
