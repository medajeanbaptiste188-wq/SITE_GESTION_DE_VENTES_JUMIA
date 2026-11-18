const saleModel = require('../models/saleModel');
const { pool } = require('../config/database');
const { validateId, validateDate, validateMoney, validateOptionalInteger } = require('../utils/validation');

const MAX_CENTS = 999999999999n;

function has(object, key) { return Object.hasOwn(object, key); }

function toCents(value) {
  const [whole, fraction = ''] = String(value).replace(',', '.').split('.');
  return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
}

function fromCents(cents) {
  const sign = cents < 0n ? '-' : '';
  const absolute = cents < 0n ? -cents : cents;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

function validateSale(body, { partial = false } = {}) {
  const data = {};
  const fields = [
    ['produit_id', validateId(body.produit_id, 'Identifiant du produit')],
    ['date', validateDate(body.date, 'La date de vente')],
    ['quantite', validateOptionalInteger(body.quantite, 'La quantité', { min: 1, max: 1000000 })],
    ['autres_frais', validateMoney(body.autres_frais, 'Les autres frais', { min: 0, required: false })]
  ];
  for (const [field, result] of fields) {
    if (partial && !has(body, field)) continue;
    if (result.error || (field === 'quantite' && result.value === null)) return { error: result.error || 'La quantité est requise.' };
    data[field] = result.value;
  }
  if (data.date && data.date > todayIsoDate()) return { error: 'La date de vente ne peut pas être postérieure à la date du jour.' };
  if (has(body, 'canal') || !partial) {
    const channel = validateChannel(body.canal);
    if (channel.error) return { error: channel.error };
    data.canal = channel.value || 'jumia';
  }
  if (has(body, 'promotion_id')) {
    if (body.promotion_id === null) data.promotion_id = null;
    else {
      const result = validateId(body.promotion_id, 'Identifiant de la promotion');
      if (result.error) return { error: result.error };
      data.promotion_id = result.value;
    }
  }
  if (!partial && (!has(data, 'produit_id') || !has(data, 'date') || !has(data, 'quantite'))) return { error: 'Le produit, la date et la quantité sont requis.' };
  if (!partial && !has(data, 'autres_frais')) data.autres_frais = '0.00';
  if (partial && Object.keys(data).length === 0) return { error: 'Aucune donnée à modifier.' };
  return { value: data };
}

function validateChannel(value) {
  if (value === undefined || value === null || value === '') return { value: undefined };
  if (value !== 'jumia' && value !== 'directe') return { error: 'Le canal de vente est invalide.' };
  return { value };
}

function salePeriod(date) {
  const [annee, mois] = date.split('-').map(Number);
  return { annee, mois };
}

function todayIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function calculate(product, promotion, quantite, autresFrais, canal = 'jumia') {
  const purchase = toCents(product.prix_achat);
  const price = toCents(product.prix_vente);
  const directe = canal === 'directe';
  const rate = directe ? 0n : toCents(product.taux_commission);
  const fixedFee = directe ? 0n : toCents(product.frais_fixe || 0);
  let discount = 0n;
  if (!directe && promotion) {
    const value = toCents(promotion.valeur);
    discount = promotion.type === 'pourcentage' ? (price * value + 5000n) / 10000n : promotion.type === 'prix_promo' ? price - value : value;
    if (discount < 0n) discount = 0n;
    if (discount > price) discount = price;
  }
  const applied = price - discount;
  const quantity = BigInt(quantite);
  const commissionUnit = (applied * rate + 5000n) / 10000n;
  const commission = commissionUnit * quantity;
  const fixedFeesTotal = fixedFee * quantity;
  const benefit = (applied - purchase) * quantity - commission - fixedFeesTotal - toCents(autresFrais);
  if ([price, discount, commission, fixedFeesTotal, benefit < 0n ? -benefit : benefit].some((amount) => amount > MAX_CENTS)) {
    return { error: 'Les montants calculés sont trop élevés.' };
  }
  return {
    prix_achat_fige: fromCents(purchase), prix_vente_fige: fromCents(price), remise: fromCents(discount),
    taux_commission_fige: fromCents(rate), frais_fixe_fige: fromCents(fixedFee), frais_fixes_totaux: fromCents(fixedFeesTotal), commission: fromCents(commission), autres_frais: fromCents(toCents(autresFrais)),
    benefice: fromCents(benefit)
  };
}

function presentSale(sale) {
  const applied = toCents(sale.prix_vente_fige) - toCents(sale.remise);
  const unitBenefit = applied - toCents(sale.prix_achat_fige) - (toCents(sale.commission) / BigInt(sale.quantite)) - (toCents(sale.frais_fixes_totaux) / BigInt(sale.quantite));
  return {
    ...sale,
    prix_applique: fromCents(applied),
    marge: applied > 0n ? ((Number(unitBenefit) * 100) / Number(applied)).toFixed(2) : null,
    alerte_vente_a_perte: toCents(sale.benefice) < 0n
  };
}

async function resolveSale(userId, input, existing = null) {
  const productId = input.produit_id || existing.produit_id;
  const date = input.date || existing.date;
  const quantite = input.quantite || existing.quantite;
  const canal = input.canal || existing?.canal || 'jumia';
  const autresFrais = input.autres_frais !== undefined ? input.autres_frais : existing ? existing.autres_frais : '0.00';
  const productChanged = !existing || productId !== existing.produit_id;
  const dateChanged = !existing || date !== existing.date;
  const canalChanged = Boolean(existing) && canal !== existing.canal;
  const needsLiveRates = canal === 'jumia' && (productChanged || canalChanged);
  let product;
  if (productChanged || needsLiveRates) {
    product = await saleModel.findActiveProduct(pool, userId, productId);
    if (!product) return { error: 'Produit actif introuvable.' };
  } else {
    product = { prix_achat: existing.prix_achat_fige, prix_vente: existing.prix_vente_fige, taux_commission: existing.taux_commission_fige, frais_fixe: existing.frais_fixe_fige };
  }

  let promotion = null;
  let promotionId = null;
  const explicitlySelected = has(input, 'promotion_id');
  if (canal === 'directe') {
    promotion = null;
    promotionId = null;
  } else if (input.promotion_id !== null && (explicitlySelected || productChanged || dateChanged || canalChanged)) {
    const requestedId = explicitlySelected ? input.promotion_id : undefined;
    promotion = await saleModel.findApplicablePromotion(pool, userId, productId, date, requestedId);
    if (requestedId !== undefined && !promotion) return { error: 'La promotion est introuvable, inactive ou ne concerne pas ce produit.' };
    promotionId = promotion ? promotion.id : null;
  } else if (existing && !productChanged && !dateChanged && !explicitlySelected && !canalChanged) {
    promotionId = existing.promotion_id;
  }

  const calculated = (existing && !productChanged && !dateChanged && !explicitlySelected && !canalChanged)
    ? calculate(
      { prix_achat: existing.prix_achat_fige, prix_vente: existing.prix_vente_fige, taux_commission: existing.taux_commission_fige, frais_fixe: existing.frais_fixe_fige },
      toCents(existing.remise) > 0n ? { type: 'montant', valeur: existing.remise } : null,
      quantite,
      autresFrais,
      canal
    )
    : calculate(product, promotion, quantite, autresFrais, canal);
  if (calculated.error) return calculated;
  const dateCommande = existing?.statut === 'livree' ? (existing.date_commande || date) : date;
  return { value: { produit_id: productId, promotion_id: promotionId, date, date_commande: dateCommande, statut: existing?.statut || 'en_attente', canal, quantite, ...salePeriod(date), ...calculated } };
}

function validateMonthYear(query) {
  const mois = Number(query.mois);
  const annee = Number(query.annee);
  if (!Number.isInteger(mois) || mois < 1 || mois > 12 || !Number.isInteger(annee) || annee < 2000 || annee > 9999) return { error: 'Le mois ou l’année est invalide.' };
  return { value: { mois, annee } };
}

async function listSales(req, res) {
  const period = validateMonthYear(req.query);
  if (period.error) return res.status(400).json({ message: period.error });
  try { return res.json({ ventes: (await saleModel.findAll(req.user.id, period.value.mois, period.value.annee)).map(presentSale) }); }
  catch (error) { console.error('Liste des ventes impossible :', error.message); return res.status(500).json({ message: 'Impossible de charger les ventes.' }); }
}

async function listPendingSales(req, res) {
  try { return res.json({ ventes: (await saleModel.findPending(req.user.id)).map(presentSale) }); }
  catch (error) { console.error('Liste des commandes en attente impossible :', error.message); return res.status(500).json({ message: 'Impossible de charger les commandes en attente.' }); }
}

async function listPeriodsWithSales(req, res) {
  const now = new Date();
  try { return res.json({ periodes: await saleModel.findPeriodsWithSales(req.user.id, now.getMonth() + 1, now.getFullYear()) }); }
  catch (error) { console.error('Liste des périodes impossible :', error.message); return res.status(500).json({ message: 'Impossible de charger les périodes.' }); }
}

async function createSale(req, res) {
  const validated = validateSale(req.body || {});
  if (validated.error) return res.status(400).json({ message: validated.error });
  try {
    const resolved = await resolveSale(req.user.id, validated.value);
    if (resolved.error) return res.status(400).json({ message: resolved.error });
    return res.status(201).json({ vente: presentSale(await saleModel.create(req.user.id, resolved.value)) });
  } catch (error) { console.error('Création de la vente impossible :', error.message); return res.status(500).json({ message: 'Impossible d’enregistrer la vente.' }); }
}

async function deliverSale(req, res) {
  const id = validateId(req.params.id, 'Identifiant de la commande');
  if (id.error) return res.status(400).json({ message: id.error });
  try {
    const sale = await saleModel.markDelivered(req.user.id, id.value, todayIsoDate());
    return sale ? res.json({ vente: presentSale(sale) }) : res.status(404).json({ message: 'Commande en attente introuvable.' });
  } catch (error) { console.error('Validation de livraison impossible :', error.message); return res.status(500).json({ message: 'Impossible de valider la livraison.' }); }
}

async function updateSale(req, res) {
  const id = validateId(req.params.id, 'Identifiant de la vente');
  const validated = validateSale(req.body || {}, { partial: true });
  if (id.error || validated.error) return res.status(400).json({ message: id.error || validated.error });
  try {
    const existing = await saleModel.findById(req.user.id, id.value);
    if (!existing) return res.status(404).json({ message: 'Vente introuvable.' });
    const resolved = await resolveSale(req.user.id, validated.value, existing);
    if (resolved.error) return res.status(400).json({ message: resolved.error });
    return res.json({ vente: presentSale(await saleModel.update(req.user.id, id.value, resolved.value)) });
  } catch (error) { console.error('Modification de la vente impossible :', error.message); return res.status(500).json({ message: 'Impossible de modifier la vente.' }); }
}

async function deleteSale(req, res) {
  const id = validateId(req.params.id, 'Identifiant de la vente');
  if (id.error) return res.status(400).json({ message: id.error });
  try { return (await saleModel.remove(req.user.id, id.value)) ? res.status(204).end() : res.status(404).json({ message: 'Vente introuvable.' }); }
  catch (error) { console.error('Suppression de la vente impossible :', error.message); return res.status(500).json({ message: 'Impossible de supprimer la vente.' }); }
}

module.exports = { listSales, listPendingSales, listPeriodsWithSales, createSale, deliverSale, updateSale, deleteSale };
