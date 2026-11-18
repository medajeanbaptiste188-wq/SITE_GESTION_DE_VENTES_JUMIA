-- Les ventes déjà enregistrées restent des ventes Jumia.
ALTER TABLE ventes
  ADD COLUMN canal ENUM('jumia', 'directe') NOT NULL DEFAULT 'jumia' AFTER statut;
