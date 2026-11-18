const dashboardModel = require('../models/dashboardModel');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const EXPORT_HEADERS = ['ID', 'Date', 'Produit', 'Canal', 'Quantité', 'Prix achat', 'Prix vente', 'Remise unitaire', 'Prix appliqué', 'Taux commission (%)', 'Frais fixe unitaire', 'Frais fixes totaux', 'Commission totale', 'Autres frais', 'Bénéfice', 'Promotion'];
const EXPORT_FIELDS = ['id', 'date', 'produit', 'canal', 'quantite', 'prix_achat_fige', 'prix_vente_fige', 'remise', 'prix_applique', 'taux_commission_fige', 'frais_fixe_fige', 'frais_fixes_totaux', 'commission', 'autres_frais', 'benefice', 'promotion'];
const MONEY_FIELDS = new Set(['prix_achat_fige', 'prix_vente_fige', 'remise', 'prix_applique', 'frais_fixe_fige', 'frais_fixes_totaux', 'commission', 'autres_frais', 'benefice']);
const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function validatePeriod(query) {
  const mois = Number(query.mois);
  const annee = Number(query.annee);
  if (!Number.isInteger(mois) || mois < 1 || mois > 12 || !Number.isInteger(annee) || annee < 2000 || annee > 9999) return { error: 'Le mois ou l’année est invalide.' };
  return { value: { mois, annee } };
}

function periodsForYear(annee) {
  return Array.from({ length: 12 }, (_, index) => ({ mois: index + 1, annee }));
}

function previousPeriod(mois, annee) {
  return mois === 1 ? { mois: 12, annee: annee - 1 } : { mois: mois - 1, annee };
}

function validateWeeklyPeriod(query) {
  const debut = String(query.debut_semaine || '');
  const fin = String(query.fin_semaine || '');
  const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
  if (!datePattern.test(debut) || !datePattern.test(fin) || debut > fin) return { error: 'La période hebdomadaire est invalide.' };
  const start = new Date(`${debut}T00:00:00Z`);
  const end = new Date(`${fin}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.toISOString().slice(0, 10) !== debut || end.toISOString().slice(0, 10) !== fin || (end - start) / 86400000 > 6) return { error: 'La période hebdomadaire est invalide.' };
  return { value: { debut, fin } };
}

async function dashboard(req, res) {
  const period = validatePeriod(req.query);
  if (period.error) return res.status(400).json({ message: period.error });
  const { mois, annee } = period.value;
  const weeklyPeriod = validateWeeklyPeriod(req.query);
  if (weeklyPeriod.error) return res.status(400).json({ message: weeklyPeriod.error });
  try {
    const periods = periodsForYear(annee);
    const previous = previousPeriod(mois, annee);
    const [totals, weekly, profitable, sold, historyRows, previousTotals] = await Promise.all([
      dashboardModel.monthlyTotals(req.user.id, mois, annee),
      dashboardModel.weeklyTotals(req.user.id, weeklyPeriod.value.debut, weeklyPeriod.value.fin),
      dashboardModel.topProducts(req.user.id, mois, annee, 'benefice'),
      dashboardModel.topProducts(req.user.id, mois, annee, 'quantite'),
      dashboardModel.monthlyHistory(req.user.id, periods),
      dashboardModel.monthlyTotals(req.user.id, previous.mois, previous.annee)
    ]);
    const historicalByPeriod = new Map(historyRows.map((row) => [`${row.annee}-${row.mois}`, row.benefice_net]));
    const previousBenefit = Number(previousTotals.benefice_net);
    const currentBenefit = Number(totals.benefice_net);
    const evolution_12_mois = periods.map((item) => ({
      ...item,
      benefice_net: historicalByPeriod.get(`${item.annee}-${item.mois}`) || '0.00'
    }));
    return res.json({
      ...totals,
      hebdomadaire: { ...weekly, debut: weeklyPeriod.value.debut, fin: weeklyPeriod.value.fin },
      top_produits_rentables: profitable,
      top_produits_vendus: sold,
      evolution_12_mois,
      historique: evolution_12_mois.map((item) => Number(item.benefice_net)),
      mois_precedent: { ...previous, benefice_net: previousTotals.benefice_net },
      variation_pourcent: previousBenefit === 0 ? null : Number((((currentBenefit - previousBenefit) / Math.abs(previousBenefit)) * 100).toFixed(2))
    });
  } catch (error) {
    console.error('Chargement du tableau de bord impossible :', error.message);
    return res.status(500).json({ message: 'Impossible de charger le tableau de bord.' });
  }
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function exportFilename(mois, annee, format) {
  return `ventes-${annee}-${String(mois).padStart(2, '0')}.${format}`;
}

function channelLabel(canal) {
  return canal === 'directe' ? 'Directe' : 'Jumia';
}

function exportValues(row) {
  return EXPORT_FIELDS.map((field) => (field === 'canal' ? channelLabel(row.canal) : row[field] ?? ''));
}

async function createXlsx(rows, mois, annee) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Mes ventes';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Ventes');
  sheet.mergeCells(1, 1, 1, EXPORT_HEADERS.length);
  const title = sheet.getCell('A1');
  title.value = `Rapport des ventes - ${MONTH_NAMES[mois - 1]} ${annee}`;
  title.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF26A00' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 27;
  const headerRow = sheet.addRow(EXPORT_HEADERS);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF1B2430' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1E4' } };
    cell.alignment = { vertical: 'center', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFE7EAEF' } } };
  });
  rows.forEach((row) => {
    const excelRow = sheet.addRow(exportValues(row));
    EXPORT_FIELDS.forEach((field, index) => {
      const cell = excelRow.getCell(index + 1);
      if (field === 'canal') cell.value = channelLabel(row.canal);
      if (MONEY_FIELDS.has(field)) { cell.value = Number(row[field] || 0); cell.numFmt = '#,##0.00'; }
      if (field === 'quantite') cell.value = Number(row[field] || 0);
      if (field === 'taux_commission_fige') { cell.value = Number(row[field] || 0) / 100; cell.numFmt = '0.00%'; }
    });
  });
  sheet.views = [{ state: 'frozen', ySplit: 2 }];
  sheet.autoFilter = { from: 'A2', to: `${String.fromCharCode(64 + EXPORT_HEADERS.length)}2` };
  [8, 13, 28, 12, 10, 14, 14, 16, 14, 19, 17, 17, 18, 14, 14, 22].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  return workbook.xlsx.writeBuffer();
}

function money(value) {
  // PDFKit avec la police Helvetica ne prend pas correctement en charge l’espace
  // insécable fine renvoyée par toLocaleString('fr-FR'). On compose donc le
  // montant avec des espaces ordinaires, fiables dans le PDF.
  const amount = Number(value || 0);
  const sign = amount < 0 ? '-' : '';
  const [whole, decimals] = Math.abs(amount).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${grouped},${decimals} FCFA`;
}

function createPdf(rows, mois, annee) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, info: { Title: `Ventes ${annee}-${mois}` } });
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    const columns = [
      ['Date', 44], ['Produit', 72], ['Canal', 42], ['Qté', 26], ['Achat', 46], ['Vente', 46], ['Remise', 46], ['Prix appl.', 48], ['Frais fixe', 48], ['Frais fixes', 50], ['Commission', 52], ['Autres frais', 48], ['Bénéfice', 52], ['Promotion', 52]
    ];
    const tableWidth = columns.reduce((total, [, width]) => total + width, 0);
    const drawHeader = () => {
      document.fillColor('#1B2430').font('Helvetica-Bold').fontSize(17).text(`Rapport des ventes - ${MONTH_NAMES[mois - 1]} ${annee}`, 28, 28);
      document.fillColor('#6B7686').font('Helvetica').fontSize(9).text(`${rows.length} vente${rows.length === 1 ? '' : 's'} exportée${rows.length === 1 ? '' : 's'}`, 28, 51);
      let x = 28; const y = 72;
      columns.forEach(([label, width]) => { document.rect(x, y, width, 20).fill('#F26A00'); document.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(6.5).text(label, x + 3, y + 7, { width: width - 6, ellipsis: true }); x += width; });
      return y + 20;
    };
    let y = drawHeader();
    const values = (row) => [row.date, row.produit, channelLabel(row.canal), row.quantite, money(row.prix_achat_fige), money(row.prix_vente_fige), money(row.remise), money(row.prix_applique), money(row.frais_fixe_fige), money(row.frais_fixes_totaux), money(row.commission), money(row.autres_frais), money(row.benefice), row.promotion || '-'];
    rows.forEach((row, index) => {
      const cells = values(row);
      document.font('Helvetica').fontSize(6.5);
      const height = Math.max(19, ...cells.map((cell, column) => document.heightOfString(String(cell), { width: columns[column][1] - 6, lineGap: 1 }) + 7));
      if (y + height > document.page.height - 38) { document.addPage(); y = drawHeader(); }
      let x = 28;
      columns.forEach(([, width], column) => { document.rect(x, y, width, height).fill(index % 2 ? '#FFFFFF' : '#FFF8F2'); document.fillColor('#1B2430').font('Helvetica').fontSize(6.5).text(String(cells[column]), x + 3, y + 4, { width: width - 6, height: height - 6, ellipsis: true }); x += width; });
      y += height;
    });
    if (!rows.length) document.fillColor('#6B7686').font('Helvetica').fontSize(11).text('Aucune vente pour cette période.', 28, y + 22, { width: tableWidth, align: 'center' });
    document.end();
  });
}

async function exportCsv(req, res) {
  const period = validatePeriod(req.query);
  if (period.error) return res.status(400).json({ message: period.error });
  const format = (req.query.format || 'csv').toLowerCase();
  if (!['csv', 'xlsx', 'pdf'].includes(format)) return res.status(400).json({ message: 'Format d’export non pris en charge.' });
  const { mois, annee } = period.value;
  try {
    const rows = await dashboardModel.exportRows(req.user.id, mois, annee);
    if (format === 'csv') {
      const content = [EXPORT_HEADERS, ...rows.map(exportValues)].map((line) => line.map(csvCell).join(';')).join('\r\n');
      res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${exportFilename(mois, annee, format)}"`, 'Cache-Control': 'no-store' });
      return res.send(`\uFEFF${content}`);
    }
    if (format === 'xlsx') {
      const content = await createXlsx(rows, mois, annee);
      res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${exportFilename(mois, annee, format)}"`, 'Cache-Control': 'no-store' });
      return res.send(Buffer.from(content));
    }
    const content = await createPdf(rows, mois, annee);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${exportFilename(mois, annee, format)}"`, 'Cache-Control': 'no-store' });
    return res.send(content);
  } catch (error) {
    console.error(`Export ${format.toUpperCase()} impossible :`, error.message);
    return res.status(500).json({ message: `Impossible de générer l’export ${format.toUpperCase()}.` });
  }
}

module.exports = { dashboard, exportCsv, createPdf, createXlsx };
