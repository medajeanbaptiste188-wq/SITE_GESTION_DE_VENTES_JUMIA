const adminModel = require('../models/adminModel');
const { validateId, validateText, validateMoney, validatePercentage, validateBoolean } = require('../utils/validation');

function categoryInput(body, partial = false) {
  const data = {}; const fields = [['nom', validateText(body.nom, 'Le nom de la catégorie', { min: 1, max: 100, required: !partial })], ['taux_commission', validatePercentage(body.taux_commission, 'Le taux de commission', { required: !partial })], ['frais_fixe', validateMoney(body.frais_fixe, 'Le frais fixe', { min: 0, required: !partial })], ['actif', validateBoolean(body.actif, 'Le statut', { required: false })]];
  for (const [key, result] of fields) { if (result.error) return { error: result.error }; if (result.value !== undefined) data[key] = result.value; }
  return partial && !Object.keys(data).length ? { error: 'Aucune donnée à modifier.' } : { value: data };
}
function periodInput(body, partial = false) {
  const data = {}; for (const key of ['mois', 'annee']) { if (body[key] === undefined && partial) continue; const value = Number(body[key]); const valid = Number.isInteger(value) && (key === 'mois' ? value >= 1 && value <= 12 : value >= 2000 && value <= 9999); if (!valid) return { error: key === 'mois' ? 'Le mois est invalide.' : 'L’année est invalide.' }; data[key] = value; }
  const active = validateBoolean(body.actif, 'Le statut', { required: false }); if (active.error) return { error: active.error }; if (active.value !== undefined) data.actif = active.value;
  return partial && !Object.keys(data).length ? { error: 'Aucune donnée à modifier.' } : { value: data };
}
function id(value) { return validateId(value, 'Identifiant'); }
function handlers(kind, input, list, create, update, remove) { return {
  list: async (req, res) => { try { res.json({ [kind]: await list(req.user.id) }); } catch { res.status(500).json({ message: 'Impossible de charger les données.' }); } },
  create: async (req, res) => { const validated = input(req.body || {}); if (validated.error) return res.status(400).json({ message: validated.error }); try { res.status(201).json({ [kind.slice(0, -1)]: await create(req.user.id, validated.value) }); } catch (error) { res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ message: error.code === 'ER_DUP_ENTRY' ? 'Cette entrée existe déjà.' : 'Impossible d’enregistrer les données.' }); } },
  update: async (req, res) => { const identifier = id(req.params.id); const validated = input(req.body || {}, true); if (identifier.error || validated.error) return res.status(400).json({ message: identifier.error || validated.error }); try { const value = await update(req.user.id, identifier.value, validated.value); return value ? res.json({ [kind.slice(0, -1)]: value }) : res.status(404).json({ message: 'Entrée introuvable.' }); } catch (error) { res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ message: error.code === 'ER_DUP_ENTRY' ? 'Cette entrée existe déjà.' : 'Impossible de modifier les données.' }); } },
  remove: async (req, res) => { const identifier = id(req.params.id); if (identifier.error) return res.status(400).json({ message: identifier.error }); try { return await remove(req.user.id, identifier.value) ? res.status(204).end() : res.status(404).json({ message: 'Entrée introuvable.' }); } catch { return res.status(500).json({ message: 'Impossible de supprimer les données.' }); } }
}; }
module.exports = { categories: handlers('categories', categoryInput, adminModel.listCategories, adminModel.createCategory, adminModel.updateCategory, adminModel.removeCategory), periods: handlers('periodes', periodInput, adminModel.listPeriods, adminModel.createPeriod, adminModel.updatePeriod, adminModel.removePeriod) };
