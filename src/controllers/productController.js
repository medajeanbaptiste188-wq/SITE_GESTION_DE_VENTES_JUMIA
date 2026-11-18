const productModel = require('../models/productModel');
const { validateId, validateText, validateMoney, validatePercentage, validateOptionalInteger, validateBoolean } = require('../utils/validation');

function validateProduct(body, { partial = false } = {}) {
  const data = {};
  const checks = [
    ['nom', validateText(body.nom, 'Le nom du produit', { min: 1, max: 255, required: !partial })],
    ['categorie', validateText(body.categorie, 'La catégorie', { min: 1, max: 100, required: !partial })],
    ['prix_achat', validateMoney(body.prix_achat, 'Le prix d’achat', { min: 0, required: !partial })],
    ['prix_vente', validateMoney(body.prix_vente, 'Le prix de vente', { min: 0.01, required: !partial })],
    ['taux_commission', validatePercentage(body.taux_commission, 'Le taux de commission', { required: !partial })],
    ['frais_fixe', validateMoney(body.frais_fixe, 'Le frais fixe Jumia', { min: 0, required: !partial })],
    ['actif', validateBoolean(body.actif, 'Le statut', { required: false })]
  ];
  if (!partial || Object.hasOwn(body, 'stock')) checks.push(['stock', validateOptionalInteger(body.stock, 'Le stock')]);

  for (const [key, result] of checks) {
    if (result.error) return { error: result.error };
    if (result.value !== undefined) data[key] = result.value;
  }

  // Tout nouveau produit est actif par défaut. Les mises à jour ne modifient
  // le statut que si celui-ci est explicitement fourni.
  if (!partial && data.actif === undefined) data.actif = 1;

  if (body.photo !== undefined) {
    if (body.photo !== null && typeof body.photo !== 'string') return { error: 'La photo est invalide.' };
    const photo = typeof body.photo === 'string' ? body.photo.trim() : null;
    if (photo && photo.length > 500) return { error: 'La photo ne peut pas dépasser 500 caractères.' };
    data.photo = photo || null;
  } else if (!partial) {
    data.photo = null;
  }

  if (partial && Object.keys(data).length === 0) return { error: 'Aucune donnée à modifier.' };
  return { value: data };
}

async function listProducts(req, res) {
  const rechercheResult = validateText(req.query.recherche, 'La recherche', { min: 1, max: 100, required: false });
  const categoryResult = validateText(req.query.categorie, 'La catégorie', { min: 1, max: 100, required: false });
  const archivedResult = validateBoolean(req.query.inclure_archives, 'Le filtre des archives', { required: false });
  const invalid = [rechercheResult, categoryResult, archivedResult].find((result) => result.error);
  if (invalid) return res.status(400).json({ message: invalid.error });

  try {
    const products = await productModel.findAll(req.user.id, {
      recherche: rechercheResult.value,
      categorie: categoryResult.value,
      includeArchived: archivedResult.value === 1
    });
    return res.json({ produits: products });
  } catch (error) {
    console.error('Liste des produits impossible :', error.message);
    return res.status(500).json({ message: 'Impossible de charger les produits.' });
  }
}

async function getProduct(req, res) {
  const idResult = validateId(req.params.id, 'Identifiant du produit');
  if (idResult.error) return res.status(400).json({ message: idResult.error });
  try {
    const product = await productModel.findById(req.user.id, idResult.value);
    return product ? res.json({ produit: product }) : res.status(404).json({ message: 'Produit introuvable.' });
  } catch (error) {
    console.error('Lecture du produit impossible :', error.message);
    return res.status(500).json({ message: 'Impossible de charger ce produit.' });
  }
}

async function createProduct(req, res) {
  const body = req.file ? { ...req.body, photo: `/uploads/products/${req.user.id}/${req.file.filename}` } : (req.body || {});
  const validated = validateProduct(body);
  if (validated.error) return res.status(400).json({ message: validated.error });
  try {
    const product = await productModel.create(req.user.id, validated.value);
    return res.status(201).json({ produit: product });
  } catch (error) {
    console.error('Création du produit impossible :', error.message);
    return res.status(500).json({ message: 'Impossible de créer le produit.' });
  }
}

async function updateProduct(req, res) {
  const idResult = validateId(req.params.id, 'Identifiant du produit');
  const body = req.file ? { ...req.body, photo: `/uploads/products/${req.user.id}/${req.file.filename}` } : (req.body || {});
  const validated = validateProduct(body, { partial: true });
  if (idResult.error || validated.error) return res.status(400).json({ message: idResult.error || validated.error });
  try {
    const product = await productModel.update(req.user.id, idResult.value, validated.value);
    return product ? res.json({ produit: product }) : res.status(404).json({ message: 'Produit introuvable.' });
  } catch (error) {
    console.error('Modification du produit impossible :', error.message);
    return res.status(500).json({ message: 'Impossible de modifier le produit.' });
  }
}

async function deleteProduct(req, res) {
  const idResult = validateId(req.params.id, 'Identifiant du produit');
  if (idResult.error) return res.status(400).json({ message: idResult.error });
  try {
    const deleted = await productModel.remove(req.user.id, idResult.value);
    return deleted ? res.status(204).end() : res.status(404).json({ message: 'Produit introuvable.' });
  } catch (error) {
    console.error('Suppression du produit impossible :', error.message);
    if (error.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ message: 'Ce produit possède des ventes et ne peut pas être supprimé. Archivez-le plutôt.' });
    return res.status(500).json({ message: 'Impossible de supprimer le produit.' });
  }
}

module.exports = { listProducts, getProduct, createProduct, updateProduct, deleteProduct };
