const promotionModel = require('../models/promotionModel');
const { validateId, validateText, validateMoney, validateDate } = require('../utils/validation');

function validateProductIds(value, { required = true } = {}) {
  if (value === undefined && !required) return { value: undefined };
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return { error: 'Sélectionnez entre 1 et 100 produits.' };
  const ids = value.map((item) => validateId(item, 'Identifiant de produit'));
  const invalid = ids.find((result) => result.error);
  if (invalid) return { error: invalid.error };
  const values = ids.map((result) => result.value);
  if (new Set(values).size !== values.length) return { error: 'Un produit ne peut être sélectionné qu’une fois.' };
  return { value: values };
}

function validatePromotion(body, { partial = false } = {}) {
  const data = {};
  const endDate = body.date_fin === '' ? null : body.date_fin;
  const validations = [
    ['nom', validateText(body.nom, 'Le nom de la promotion', { min: 1, max: 255, required: !partial })],
    ['date_debut', validateDate(body.date_debut, 'La date de début', { required: !partial })]
  ];
  for (const [field, result] of validations) {
    if (result.error) return { error: result.error };
    if (result.value !== undefined) data[field] = result.value;
  }
  if (endDate === null && (Object.hasOwn(body, 'date_fin') || !partial)) data.date_fin = null;
  else {
    const result = validateDate(endDate, 'La date de fin', { required: !partial });
    if (result.error) return { error: result.error };
    if (result.value !== undefined) data.date_fin = result.value;
  }

  let type = body.type;
  if (type === undefined && !partial) type = null;
  if (type !== undefined && !['pourcentage', 'montant', 'prix_promo'].includes(type)) return { error: 'Le type de remise est invalide.' };
  if (type !== undefined) data.type = type;

  const valueResult = validateMoney(body.valeur, 'La valeur de remise', { min: 0.01, required: !partial });
  if (valueResult.error) return { error: valueResult.error };
  if (valueResult.value !== undefined) data.valeur = valueResult.value;
  if ((data.type === 'pourcentage' || (!data.type && type === 'pourcentage')) && Number(data.valeur) > 100) return { error: 'Une remise en pourcentage ne peut pas dépasser 100 %.' };

  let recurrence = body.recurrence;
  if (recurrence === undefined && !partial) recurrence = 'aucune';
  if (recurrence !== undefined && !['aucune', 'hebdomadaire'].includes(recurrence)) return { error: 'La récurrence est invalide.' };
  if (recurrence !== undefined) data.recurrence = recurrence;

  if (body.jour_semaine === null) {
    data.jour_semaine = null;
  } else if (body.jour_semaine !== undefined) {
    const day = Number(body.jour_semaine);
    if (!Number.isInteger(day) || day < 0 || day > 6) return { error: 'Le jour de la semaine est invalide.' };
    data.jour_semaine = day;
  } else if (!partial) {
    data.jour_semaine = null;
  }
  if (!partial && recurrence === 'hebdomadaire' && data.jour_semaine === null) return { error: 'Le jour de la semaine est requis pour une promotion hebdomadaire.' };
  if (!partial && recurrence === 'aucune' && data.jour_semaine !== null) return { error: 'Le jour de la semaine ne s’applique qu’aux promotions hebdomadaires.' };

  const productIds = validateProductIds(body.produit_ids, { required: !partial });
  if (productIds.error) return { error: productIds.error };
  if (partial && Object.keys(data).length === 0 && productIds.value === undefined) return { error: 'Aucune donnée à modifier.' };
  return { value: data, productIds: productIds.value };
}

function handleError(res, error, action) {
  console.error(`${action} impossible :`, error.message);
  if (error.code === 'INVALID_PROMOTION_PRODUCTS' || error.code === 'INVALID_PROMO_PRICE') return res.status(400).json({ message: error.message });
  return res.status(500).json({ message: `${action} est impossible pour le moment.` });
}

function validateMonthYear(query) {
  const mois = Number(query.mois);
  const annee = Number(query.annee);
  if (!Number.isInteger(mois) || mois < 1 || mois > 12 || !Number.isInteger(annee) || annee < 2000 || annee > 9999) return { error: 'Le mois ou l’année est invalide.' };
  return { value: { mois, annee } };
}

async function listPromotions(req, res) {
  const period = validateMonthYear(req.query);
  if (period.error) return res.status(400).json({ message: period.error });
  try { return res.json({ promotions: await promotionModel.findAll(req.user.id, period.value.mois, period.value.annee) }); }
  catch (error) { return handleError(res, error, 'Le chargement des promotions'); }
}

async function getPromotion(req, res) {
  const id = validateId(req.params.id, 'Identifiant de la promotion');
  if (id.error) return res.status(400).json({ message: id.error });
  try {
    const promotion = await promotionModel.findById(req.user.id, id.value);
    return promotion ? res.json({ promotion }) : res.status(404).json({ message: 'Promotion introuvable.' });
  } catch (error) { return handleError(res, error, 'Le chargement de cette promotion'); }
}

async function createPromotion(req, res) {
  const validated = validatePromotion(req.body || {});
  if (validated.error) return res.status(400).json({ message: validated.error });
  if (validated.value.date_fin && validated.value.date_debut > validated.value.date_fin) return res.status(400).json({ message: 'La date de fin doit être postérieure ou égale à la date de début.' });
  try { return res.status(201).json({ promotion: await promotionModel.create(req.user.id, { ...validated.value, produit_ids: validated.productIds }) }); }
  catch (error) { return handleError(res, error, 'La création de la promotion'); }
}

async function updatePromotion(req, res) {
  const id = validateId(req.params.id, 'Identifiant de la promotion');
  const validated = validatePromotion(req.body || {}, { partial: true });
  if (id.error || validated.error) return res.status(400).json({ message: id.error || validated.error });
  try {
    const existing = await promotionModel.findById(req.user.id, id.value);
    if (!existing) return res.status(404).json({ message: 'Promotion introuvable.' });
    const start = validated.value.date_debut || existing.date_debut;
    const end = Object.hasOwn(validated.value, 'date_fin') ? validated.value.date_fin : existing.date_fin;
    if (end && start > end) return res.status(400).json({ message: 'La date de fin doit être postérieure ou égale à la date de début.' });
    const type = validated.value.type || existing.type;
    const value = validated.value.valeur || existing.valeur;
    if (type === 'pourcentage' && Number(value) > 100) return res.status(400).json({ message: 'Une remise en pourcentage ne peut pas dépasser 100 %.' });
    const recurrence = validated.value.recurrence || existing.recurrence;
    const day = Object.hasOwn(validated.value, 'jour_semaine') ? validated.value.jour_semaine : existing.jour_semaine;
    if (recurrence === 'hebdomadaire' && day === null) return res.status(400).json({ message: 'Le jour de la semaine est requis pour une promotion hebdomadaire.' });
    if (recurrence === 'aucune' && day !== null) {
      if (Object.hasOwn(validated.value, 'jour_semaine')) return res.status(400).json({ message: 'Le jour de la semaine ne s’applique qu’aux promotions hebdomadaires.' });
      validated.value.jour_semaine = null;
    }
    const promotion = await promotionModel.update(req.user.id, id.value, validated.value, validated.productIds);
    return res.json({ promotion });
  } catch (error) { return handleError(res, error, 'La modification de la promotion'); }
}

async function deletePromotion(req, res) {
  const id = validateId(req.params.id, 'Identifiant de la promotion');
  if (id.error) return res.status(400).json({ message: id.error });
  try {
    const deleted = await promotionModel.remove(req.user.id, id.value);
    return deleted ? res.status(204).end() : res.status(404).json({ message: 'Promotion introuvable.' });
  } catch (error) { return handleError(res, error, 'La suppression de la promotion'); }
}

module.exports = { listPromotions, getPromotion, createPromotion, updatePromotion, deletePromotion };
