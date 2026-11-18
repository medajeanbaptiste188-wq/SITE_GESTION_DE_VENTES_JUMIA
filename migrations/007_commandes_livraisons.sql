-- Les ventes historiques sont considérées comme déjà livrées.
ALTER TABLE ventes
  ADD COLUMN date_commande DATE NULL AFTER date,
  ADD COLUMN statut ENUM('en_attente', 'livree') NOT NULL DEFAULT 'livree' AFTER date_commande,
  ADD KEY idx_ventes_utilisateur_statut_date (utilisateur_id, statut, date);

UPDATE ventes SET date_commande = date WHERE date_commande IS NULL;

ALTER TABLE ventes MODIFY COLUMN date_commande DATE NOT NULL;
