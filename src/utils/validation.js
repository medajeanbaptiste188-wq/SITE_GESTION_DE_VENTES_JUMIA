const MAX_MONEY = 9999999999.99;

function validateId(value, label = 'identifiant') {
  const id = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(id) || id <= 0 || String(id) !== String(value)) {
    return { error: `${label} invalide.` };
  }
  return { value: id };
}

function validateText(value, label, { min = 1, max = 255, required = true } = {}) {
  if (value === undefined && !required) return { value: undefined };
  if (typeof value !== 'string') return { error: `${label} invalide.` };
  const normalized = value.trim();
  if (!required && normalized.length === 0) return { value: undefined };
  if (normalized.length < min || normalized.length > max) return { error: `${label} doit contenir entre ${min} et ${max} caractères.` };
  return { value: normalized };
}

function validateMoney(value, label, { min = 0, max = MAX_MONEY, required = true } = {}) {
  if (value === undefined && !required) return { value: undefined };
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return { error: `${label} invalide.` };
  const normalized = String(value).trim().replace(',', '.');
  if (!/^\d{1,10}(?:\.\d{1,2})?$/u.test(normalized)) return { error: `${label} doit être un montant avec au plus deux décimales.` };
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < min || number > max) return { error: `${label} doit être compris entre ${min} et ${max}.` };
  return { value: number.toFixed(2) };
}

function validatePercentage(value, label, { required = true } = {}) {
  const result = validateMoney(value, label, { min: 0, max: 100, required });
  return result.error ? result : { value: result.value };
}

function validateOptionalInteger(value, label, { min = 0, max = 2147483647 } = {}) {
  if (value === undefined || value === null || value === '') return { value: null };
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) return { error: `${label} invalide.` };
  return { value: number };
}

function validateBoolean(value, label, { required = true } = {}) {
  if (value === undefined && !required) return { value: undefined };
  if (typeof value === 'boolean') return { value: value ? 1 : 0 };
  if (value === 0 || value === 1 || value === '0' || value === '1') return { value: Number(value) };
  return { error: `${label} invalide.` };
}

function validateDate(value, label, { required = true } = {}) {
  if (value === undefined && !required) return { value: undefined };
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return { error: `${label} invalide.` };
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return { error: `${label} invalide.` };
  return { value };
}

module.exports = { validateId, validateText, validateMoney, validatePercentage, validateOptionalInteger, validateBoolean, validateDate };
