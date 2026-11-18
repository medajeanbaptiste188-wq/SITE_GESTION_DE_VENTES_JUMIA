(() => {
  const labels = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(new Date(2000, index, 1)).replace('.', ''));
  const emptyDashboard = () => ({ chiffre_affaires: 0, total_commissions: 0, total_achats: 0, total_remises: 0, total_frais_fixes: 0, articles_vendus: 0, benefice_net: 0, variation_pourcent: 0, hebdomadaire: { benefice_net: 0, total_achats: 0 }, historique: Array(12).fill(0) });
  let products = [];
  let managedCategories = [];
  let activeCategory = 'Tous';
  let promotions = [];
  let promotionProducts = [];
  let saleProducts = [];
  let deferredInstallPrompt;
  let currentView;
  let sessionTimeoutId;
  let appVersion;
  const appVersionStorageKey = 'sellora.app-version';
  let serviceWorkerRegistration;
  let applyingAppUpdate = false;
  const loadedViews = new Set();
  const money = (value) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(value || 0)).replaceAll('\u202f', ' ')} FCFA`;
  const byId = (id) => document.getElementById(id);
  const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
  function endSession(message = '') {
    window.clearTimeout(sessionTimeoutId); sessionTimeoutId = undefined;
    window.api.clearToken(); loadedViews.clear(); products = []; promotions = []; activeCategory = 'Tous'; showView('login');
    if (message) { const loginMessage = byId('login-message'); loginMessage.classList.remove('is-error'); loginMessage.textContent = message; }
  }
  function scheduleSessionExpiration() {
    window.clearTimeout(sessionTimeoutId);
    const expiration = window.api.getTokenExpiration();
    if (!expiration || expiration <= Date.now()) return endSession('Votre session a expiré. Veuillez vous reconnecter.');
    sessionTimeoutId = window.setTimeout(() => endSession('Votre session a expiré. Veuillez vous reconnecter.'), expiration - Date.now() + 100);
  }
  function updatePeriodLabels() {
    const [year, month] = byId('month-select').value.split('-').map(Number);
    const period = new Date(year, month - 1, 1);
    const periodLabel = monthFormatter.format(period);
    byId('chart-year').textContent = String(year);
    byId('profit-label').textContent = `Bénéfice net — ${periodLabel}`;
    byId('export-title').textContent = `Exporter ${periodLabel}`;
  }
  function isoDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  function weeklyPeriod() {
    // Les cartes hebdomadaires restent indépendantes du mois sélectionné.
    const date = new Date();
    const mondayOffset = (date.getDay() + 6) % 7;
    const start = new Date(date); start.setDate(date.getDate() - mondayOffset);
    const end = new Date(date); end.setDate(date.getDate() + (6 - mondayOffset));
    const label = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
    const range = start.getTime() === end.getTime() ? label.format(start) : `${label.format(start)} au ${label.format(end)}`;
    return { start: isoDate(start), end: isoDate(end), label: range };
  }
  function syncMonthPickerValue(select) {
    select.closest('.month-picker').querySelector('.month-picker-value').textContent = select.selectedOptions[0]?.textContent || '';
  }
  function populateMonthPickers(salePeriods = []) {
    const current = new Date(); current.setDate(1);
    const selectedValue = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
    const periodsByValue = new Map([[selectedValue, { value: selectedValue, label: monthFormatter.format(current) }]]);
    salePeriods.forEach((period) => {
      const date = new Date(Number(period.annee), Number(period.mois) - 1, 1);
      if (date <= current) periodsByValue.set(`${period.annee}-${String(period.mois).padStart(2, '0')}`, { value: `${period.annee}-${String(period.mois).padStart(2, '0')}`, label: monthFormatter.format(date) });
    });
    const periods = [...periodsByValue.values()].sort((left, right) => right.value.localeCompare(left.value));
    ['month-select', 'sales-month-select', 'promotions-month-select'].forEach((id) => {
      const select = byId(id);
      const previouslySelected = select.value;
      select.replaceChildren(...periods.map(({ value, label }) => new Option(label, value)));
      select.value = periods.some((period) => period.value === previouslySelected) ? previouslySelected : selectedValue;
      syncMonthPickerValue(select);
    });
    updatePeriodLabels();
  }
  async function refreshMonthPickers() {
    try { const response = await window.api.getSalesPeriods(); populateMonthPickers(response.periodes || []); }
    catch (error) { populateMonthPickers(); }
  }
  function drawChart(values = Array(12).fill(0)) {
    const chartValues = Array.isArray(values) && values.length === 12 ? values : Array(12).fill(0);
    const maximum = Math.max(...chartValues, 1);
    const selectedMonth = Number(byId('month-select').value.split('-')[1]);
    byId('profit-chart').replaceChildren(...chartValues.map((value, index) => {
      const bar = document.createElement('i'); bar.className = `bar${index === selectedMonth - 1 ? ' is-current' : ''}`;
      bar.style.height = `${Math.max(10, Math.round((value / maximum) * 88))}%`; return bar;
    }));
    byId('chart-labels').replaceChildren(...labels.map((label, index) => {
      const item = document.createElement('span'); item.textContent = label; if (index === selectedMonth - 1) item.className = 'is-current'; return item;
    }));
  }
  function render(data) {
    byId('net-profit').textContent = money(data.benefice_net);
    byId('revenue').textContent = money(data.chiffre_affaires);
    byId('commission').textContent = money(data.total_commissions);
    byId('cost').textContent = money(data.total_achats || data.cout_achat);
    byId('discount').textContent = money(data.total_remises);
    byId('fixed-fees').textContent = money(data.total_frais_fixes);
    byId('items-sold').textContent = new Intl.NumberFormat('fr-FR').format(Number(data.articles_vendus || 0));
    const [year, month] = byId('month-select').value.split('-').map(Number);
    const week = weeklyPeriod();
    byId('weekly-profit-label').textContent = `Bénéfice — ${week.label}`;
    byId('weekly-cost-label').textContent = `Coût d'achat — ${week.label}`;
    byId('weekly-profit').textContent = money(data.hebdomadaire?.benefice_net);
    byId('weekly-cost').textContent = money(data.hebdomadaire?.total_achats);
    const previousDate = new Date(year, month - 2, 1);
    const previousLabel = monthFormatter.format(previousDate);
    if (data.variation_pourcent === null || data.variation_pourcent === undefined) {
      byId('profit-trend').textContent = `Pas de comparaison avec ${previousLabel}`;
    } else {
      const variation = Number(data.variation_pourcent);
      byId('profit-trend').textContent = `${variation >= 0 ? '▲' : '▼'} ${Math.abs(variation)} % par rapport à ${previousLabel}`;
    }
    drawChart(data.historique);
  }
  async function loadDashboard() {
    const [year, month] = byId('month-select').value.split('-').map(Number);
    const week = weeklyPeriod();
    try { render(await window.api.getDashboard(month, year, week.start, week.end)); }
    catch (error) { render(emptyDashboard()); }
  }
  function productProfit(product) { return Number(product.prix_vente) - Number(product.prix_achat) - (Number(product.prix_vente) * Number(product.taux_commission || 0) / 100) - Number(product.frais_fixe || 0); }
  function iconFor(product) { return product.icon || '🧴'; }
  function savedVisuals(root) {
    const pool = new Map();
    root.querySelectorAll('.product-icon.has-photo[data-photo-source]').forEach((visual) => {
      const source = visual.dataset.photoSource; const visuals = pool.get(source) || [];
      visuals.push(visual); pool.set(source, visuals);
    });
    return pool;
  }
  function productVisual(product, className = 'product-icon', visualPool) {
    const photo = product?.photo;
    const saved = photo ? visualPool?.get(photo)?.shift() : undefined;
    if (saved) return saved;
    const visual = Object.assign(document.createElement('span'), { className });
    if (photo) {
      visual.classList.add('has-photo'); visual.dataset.photoSource = photo; const image = document.createElement('img'); image.src = photo; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.addEventListener('error', () => { visual.classList.remove('has-photo'); delete visual.dataset.photoSource; visual.replaceChildren(document.createTextNode(iconFor(product))); }); visual.append(image);
    } else visual.textContent = iconFor(product || {});
    visual.setAttribute('aria-hidden', 'true'); return visual;
  }
  function renderProducts() {
    const query = byId('product-search').value.trim().toLocaleLowerCase('fr');
    const categories = ['Tous', ...new Set(products.map((product) => product.categorie).filter(Boolean))];
    byId('category-chips').replaceChildren(...categories.map((category) => {
      const chip = document.createElement('button'); chip.type = 'button'; chip.className = `chip${category === activeCategory ? ' is-active' : ''}`; chip.textContent = category;
      chip.addEventListener('click', () => { activeCategory = category; renderProducts(); }); return chip;
    }));
    const visible = products.filter((product) => (activeCategory === 'Tous' || product.categorie === activeCategory) && product.nom.toLocaleLowerCase('fr').includes(query));
    byId('product-count').textContent = `${products.filter((product) => product.actif !== false).length} actifs`;
    const productList = byId('product-list'); const visualPool = savedVisuals(productList);
    productList.replaceChildren(...(visible.length ? visible.map((product) => {
      const profit = productProfit(product); const margin = Number(product.prix_vente) ? Math.round((profit / Number(product.prix_vente)) * 100) : 0;
      const row = document.createElement('article'); row.className = 'product-row';
      const icon = productVisual(product, 'product-icon', visualPool);
      const info = Object.assign(document.createElement('div'), { className: 'product-info' });
      info.append(Object.assign(document.createElement('strong'), { textContent: product.nom }), Object.assign(document.createElement('small'), { textContent: `Achat ${money(product.prix_achat)} · Vente ${money(product.prix_vente)}` }));
      const amount = Object.assign(document.createElement('div'), { className: 'product-profit', textContent: money(profit) });
      amount.append(Object.assign(document.createElement('small'), { textContent: `marge ${margin} %` })); row.append(icon, info, amount);
      row.tabIndex = 0; row.setAttribute('role', 'button'); row.setAttribute('aria-label', `Modifier ${product.nom}`); row.addEventListener('click', () => openProductForm(product)); return row;
    }) : [Object.assign(document.createElement('p'), { className: 'empty-state', textContent: 'Aucun produit ne correspond à votre recherche.' })]));
  }
  async function loadProducts(force = false) { if (loadedViews.has('products') && !force) return; try { const response = await window.api.getProducts(); products = Array.isArray(response) ? response : (response.produits || []); } catch (error) { products = []; } loadedViews.add('products'); renderProducts(); }
  function updateCalculation() {
    const purchase = Number(byId('purchase-price').value) || 0; const sale = Number(byId('sale-price').value) || 0; const rate = Number(byId('commission-rate').value) || 0; const fixedFee = Number(byId('fixed-fee').value) || 0;
    const commission = sale * rate / 100; const profit = sale - purchase - commission - fixedFee; const margin = sale ? profit / sale * 100 : 0;
    byId('calculated-commission').textContent = money(commission); byId('calculated-fixed-fee').textContent = money(fixedFee); byId('calculated-margin').textContent = `${Math.round(margin)} %`; byId('calculated-profit').textContent = money(profit);
  }
  async function loadManagedCategories() {
    try {
      const response = await window.api.getAdminCategories(); managedCategories = (response.categories || []).filter((category) => Number(category.actif) === 1);
      const select = byId('product-category'); const current = select.value;
      select.replaceChildren(new Option('Choisir une catégorie', ''), ...managedCategories.map((category) => new Option(category.nom, category.nom)));
      if ([...select.options].some((option) => option.value === current)) select.value = current;
    } catch (error) { managedCategories = []; byId('product-category').replaceChildren(new Option('Choisir une catégorie', '')); }
  }
  function applyCategoryCommission() {
    const category = managedCategories.find((item) => item.nom === byId('product-category').value);
    if (category && !byId('product-id').value) { byId('commission-rate').value = category.taux_commission; byId('fixed-fee').value = category.frais_fixe ?? 0; updateCalculation(); }
  }
  function openProductForm(product = null) {
    const form = byId('product-form'); form.reset(); byId('product-id').value = product?.id || ''; byId('product-form-title').textContent = product ? 'Modifier le produit' : 'Nouveau produit';
    byId('product-name').value = product?.nom || ''; if (product?.categorie && ![...byId('product-category').options].some((option) => option.value === product.categorie)) byId('product-category').append(new Option(product.categorie, product.categorie)); byId('product-category').value = product?.categorie || ''; byId('purchase-price').value = product?.prix_achat || ''; byId('sale-price').value = product?.prix_vente || ''; byId('commission-rate').value = product?.taux_commission ?? 10; byId('fixed-fee').value = product?.frais_fixe ?? 0; byId('product-stock').value = product?.stock ?? ''; byId('product-form-message').textContent = ''; setProductImagePreview(product?.photo, product);
    showView('product-form'); updateCalculation();
  }
  function setProductImagePreview(source, product = null) {
    const preview = byId('product-image-preview'); preview.replaceChildren(); preview.classList.toggle('has-photo', Boolean(source));
    if (source) { const image = document.createElement('img'); image.src = source; image.alt = ''; image.addEventListener('error', () => { preview.classList.remove('has-photo'); preview.textContent = iconFor(product || { categorie: byId('product-category').value }); }); preview.append(image); }
    else preview.textContent = iconFor(product || { categorie: byId('product-category').value });
  }
  function productFormData() {
    const data = new FormData();
    data.append('nom', byId('product-name').value.trim()); data.append('categorie', byId('product-category').value);
    data.append('prix_achat', byId('purchase-price').value); data.append('prix_vente', byId('sale-price').value);
    data.append('taux_commission', byId('commission-rate').value); data.append('frais_fixe', byId('fixed-fee').value || '0'); data.append('stock', byId('product-stock').value || '0'); data.append('actif', '1');
    const photo = byId('product-photo').files[0]; if (photo) data.append('photo', photo); return data;
  }
  async function saveProduct(event) {
    event.preventDefault(); const form = event.currentTarget; const submit = form.querySelector('[type="submit"]'); const id = byId('product-id').value;
    const product = productFormData();
    submit.disabled = true; byId('product-form-message').textContent = ''; byId('product-form-message').classList.remove('is-error');
    try { const saved = id ? await window.api.updateProduct(id, product) : await window.api.createProduct(product); const result = saved?.produit || saved; products = id ? products.map((item) => String(item.id) === String(id) ? result : item) : [result, ...products]; loadedViews.add('products'); renderProducts(); showView('products'); }
    catch (error) { byId('product-form-message').classList.add('is-error'); byId('product-form-message').textContent = error.message || 'Impossible d’enregistrer le produit. Vérifiez votre connexion puis réessayez.'; }
    finally { submit.disabled = false; }
  }
  function saleDate(value) { return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`)).replace('.', ''); }
  function renderPendingSales(sales) {
    byId('pending-sales-count').textContent = String(sales.reduce((sum, sale) => sum + Number(sale.quantite || 1), 0));
    const pendingList = byId('pending-sales-list'); const visualPool = savedVisuals(pendingList);
    pendingList.replaceChildren(...(sales.length ? sales.map((sale) => {
      const product = sale.produit || { nom: sale.produit_nom, photo: sale.produit_photo };
      const row = Object.assign(document.createElement('article'), { className: 'sale-row pending-sale-row' });
      const info = Object.assign(document.createElement('div'), { className: 'sale-info' });
      const line = Object.assign(document.createElement('small'), { textContent: `Commandée le ${saleDate(sale.date_commande || sale.date)}` });
      line.append(channelBadge(sale));
      if (sale.promotion) line.append(Object.assign(document.createElement('span'), { className: 'badge', textContent: sale.promotion }));
      info.append(Object.assign(document.createElement('strong'), { textContent: `${product.nom || sale.produit_nom || 'Produit'} × ${sale.quantite || 1}` }), line, Object.assign(document.createElement('small'), { textContent: `Bénéfice estimé : ${money(sale.benefice)}` }));
      const actions = Object.assign(document.createElement('div'), { className: 'pending-sale-actions' });
      const deliver = Object.assign(document.createElement('button'), { className: 'primary-button', type: 'button', textContent: 'Valider la livraison' });
      deliver.addEventListener('click', async () => {
        if (!window.confirm(`Confirmer la livraison de « ${product.nom || sale.produit_nom || 'ce produit'} » aujourd’hui ?`)) return;
        deliver.disabled = true;
        try { await window.api.deliverSale(sale.id); await refreshMonthPickers(); await loadSales(true); await loadDashboard(); }
        catch (error) { window.alert(error.message || 'Impossible de valider la livraison.'); deliver.disabled = false; }
      });
      const cancel = Object.assign(document.createElement('button'), { className: 'pending-cancel-button', type: 'button', textContent: 'Annuler' });
      cancel.addEventListener('click', async () => {
        if (!window.confirm(`Annuler définitivement la commande de « ${product.nom || sale.produit_nom || 'ce produit'} » ?`)) return;
        cancel.disabled = true;
        try { await window.api.deleteSale(sale.id); await loadSales(true); }
        catch (error) { window.alert(error.message || 'Impossible d’annuler la commande.'); cancel.disabled = false; }
      });
      actions.append(deliver, cancel); row.append(productVisual(product, 'product-icon', visualPool), info, actions); return row;
    }) : [Object.assign(document.createElement('p'), { className: 'empty-state', textContent: 'Aucune commande en attente de livraison.' })]));
  }
  function renderSales(sales) {
    const total = sales.reduce((sum, sale) => sum + Number(sale.benefice || 0), 0); byId('sales-count').textContent = `${sales.reduce((sum, sale) => sum + Number(sale.quantite || 1), 0)} ventes`; byId('sales-profit').textContent = money(total);
    const salesList = byId('sales-list'); const visualPool = savedVisuals(salesList);
    salesList.replaceChildren(...(sales.length ? sales.map((sale) => {
      const product = sale.produit || { nom: sale.produit_nom, photo: sale.produit_photo }; const profit = Number(sale.benefice || 0); const row = Object.assign(document.createElement('article'), { className: 'sale-row' });
      const icon = productVisual(product, 'product-icon', visualPool);
      const info = Object.assign(document.createElement('div'), { className: 'sale-info' }); const line = Object.assign(document.createElement('small'), { textContent: saleDate(sale.date) }); line.append(channelBadge(sale)); if (sale.promotion) line.append(Object.assign(document.createElement('span'), { className: 'badge', textContent: sale.promotion })); if (profit < 0) line.append(Object.assign(document.createElement('span'), { className: 'badge is-loss', textContent: 'Perte' }));
      info.append(Object.assign(document.createElement('strong'), { textContent: `${product.nom || sale.produit_nom || 'Produit'} × ${sale.quantite || 1}` }), line);
      const amount = Object.assign(document.createElement('div'), { className: 'sale-profit', textContent: money(profit) }); amount.append(Object.assign(document.createElement('small'), { textContent: `${profit >= 0 ? '+' : ''}${money(profit)}` })); if (profit < 0) amount.querySelector('small').classList.add('is-loss'); row.append(icon, info, amount); return row;
    }) : [Object.assign(document.createElement('p'), { className: 'empty-state', textContent: 'Aucune vente enregistrée pour ce mois.' })]));
  }
  async function loadSales(force = false) {
    if (loadedViews.has('sales') && !force) return;
    const [year, month] = byId('sales-month-select').value.split('-').map(Number);
    try {
      const [delivered, pending] = await Promise.all([window.api.getSales(month, year), window.api.getPendingSales()]);
      renderSales(Array.isArray(delivered) ? delivered : (delivered.ventes || []));
      renderPendingSales(Array.isArray(pending) ? pending : (pending.ventes || []));
    } catch (error) { renderSales([]); renderPendingSales([]); }
    loadedViews.add('sales');
  }
  function localIsoDate() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
  function channelBadge(sale) {
    const directe = sale.canal === 'directe';
    return Object.assign(document.createElement('span'), { className: directe ? 'badge is-direct' : 'badge', textContent: directe ? 'Directe' : 'Jumia' });
  }
  function updateSalePreview() {
    const product = saleProducts.find((item) => String(item.id) === byId('sale-product').value);
    const directe = byId('sale-channel').value === 'directe';
    const quantity = Math.max(1, Number(byId('sale-quantity').value) || 1);
    const otherFees = Number(byId('sale-other-fees').value) || 0;
    const price = Number(product?.prix_vente || 0);
    const purchase = Number(product?.prix_achat || 0);
    const commission = directe ? 0 : price * Number(product?.taux_commission || 0) / 100 * quantity;
    const fixedFee = directe ? 0 : Number(product?.frais_fixe || 0) * quantity;
    const profit = (price - purchase) * quantity - commission - fixedFee - otherFees;
    byId('sale-preview-commission').textContent = money(commission);
    byId('sale-preview-fixed').textContent = money(fixedFee);
    byId('sale-preview-profit').textContent = money(profit);
    byId('sale-preview-note').textContent = directe
      ? 'Vente hors Jumia : commission et frais fixe à 0. Les promotions Jumia ne s’appliquent pas.'
      : 'Commission et frais fixe Jumia du produit. Une promotion active est appliquée à l’enregistrement.';
  }
  async function openSaleDialog() {
    const message = byId('sale-form-message'); message.textContent = ''; message.classList.remove('is-error'); byId('sale-form').reset(); byId('sale-channel').value = 'jumia'; byId('sale-date').value = localIsoDate(); byId('sale-quantity').value = 1;
    try { const response = await window.api.getProducts(); saleProducts = (response.produits || response || []).filter((product) => product.actif !== false && Number(product.actif) !== 0); const select = byId('sale-product'); select.replaceChildren(new Option('Choisir un produit', ''), ...saleProducts.map((product) => new Option(`${product.nom} — ${money(product.prix_vente)}`, product.id))); if (!saleProducts.length) { message.classList.add('is-error'); message.textContent = 'Ajoutez d’abord un produit actif avant d’enregistrer une vente.'; } }
    catch (error) { saleProducts = []; message.classList.add('is-error'); message.textContent = 'Impossible de charger les produits.'; }
    updateSalePreview(); byId('sale-dialog').showModal();
  }
  async function saveSale(event) {
    event.preventDefault(); const button = byId('save-sale-button'); const message = byId('sale-form-message'); const date = byId('sale-date').value;
    if (date > localIsoDate()) { message.classList.add('is-error'); message.textContent = 'La date de vente ne peut pas être postérieure à la date du jour.'; return; }
    const sale = { produit_id: Number(byId('sale-product').value), canal: byId('sale-channel').value, date, quantite: Number(byId('sale-quantity').value), autres_frais: byId('sale-other-fees').value || 0 };
    button.disabled = true; message.textContent = ''; message.classList.remove('is-error');
    try { await window.api.createSale(sale); byId('sale-dialog').close(); loadSales(true); }
    catch (error) { message.classList.add('is-error'); message.textContent = error.message || 'Impossible d’enregistrer la commande.'; }
    finally { button.disabled = false; }
  }
  function promotionStatus(promotion) {
    if (promotion.statut) return promotion.statut; const today = new Date().toISOString().slice(0, 10); if (promotion.date_fin && promotion.date_fin < today) return 'Terminée'; if (promotion.date_debut && promotion.date_debut > today) return 'Planifiée'; return 'Active';
  }
  const weekdayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function syncPromotionValueLabel() {
    byId('promotion-value-label').textContent = byId('promotion-type').value === 'pourcentage' ? 'Valeur' : 'Montant';
  }
  function promotionUnitProfit(product, type, value) {
    const cents = (amount) => Math.round(Number(amount || 0) * 100); const price = cents(product.prix_vente); const cost = cents(product.prix_achat); const fixedFee = cents(product.frais_fixe); const discountValue = cents(value);
    const discount = type === 'pourcentage' ? Math.floor((price * discountValue + 5000) / 10000) : type === 'prix_promo' ? Math.max(0, price - discountValue) : discountValue;
    const applied = Math.max(0, price - discount); const commission = Math.floor((applied * cents(product.taux_commission) + 5000) / 10000);
    return applied - cost - commission - fixedFee;
  }
  function updatePromotionLossWarning() {
    const warning = byId('promotion-loss-warning'); const type = byId('promotion-type').value; const value = byId('promotion-value').value;
    const selected = new Set(selectedPromotionProductIds());
    const affected = promotionProducts.filter((product) => selected.has(Number(product.id)) && value !== '' && promotionUnitProfit(product, type, value) < 0);
    warning.hidden = affected.length === 0;
    warning.textContent = affected.length ? `Attention : cette remise ferait vendre à perte ${affected.map((product) => product.nom).join(', ')} (hors autres frais).` : '';
  }
  function selectedPromotionProductIds() {
    return [...byId('promotion-products').querySelectorAll('[data-product-id]')].map((item) => Number(item.dataset.productId));
  }
  function renderPromotionProductChoices(available, selectedIds = new Set(), disabled = false) {
    const root = byId('promotion-products'); const picker = byId('promotion-product-picker');
    picker.disabled = disabled || !available.length;
    picker.replaceChildren(new Option(available.length ? 'Choisir un produit' : 'Aucun produit disponible', ''), ...available.filter((product) => !selectedIds.has(Number(product.id))).map((product) => new Option(product.nom, product.id)));
    root.replaceChildren(...(selectedIds.size ? available.filter((product) => selectedIds.has(Number(product.id))).map((product) => {
      const item = Object.assign(document.createElement('div'), { className: 'promotion-selected-product' }); item.dataset.productId = product.id; item.setAttribute('role', 'listitem');
      const remove = Object.assign(document.createElement('button'), { type: 'button', disabled, ariaLabel: `Retirer ${product.nom}` });
      const removeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); removeIcon.setAttribute('viewBox', '0 0 24 24'); removeIcon.setAttribute('aria-hidden', 'true');
      const removePath = document.createElementNS('http://www.w3.org/2000/svg', 'path'); removePath.setAttribute('d', 'M6 6 18 18M18 6 6 18'); removeIcon.append(removePath); remove.append(removeIcon);
      remove.addEventListener('click', () => { const next = new Set(selectedPromotionProductIds()); next.delete(Number(product.id)); renderPromotionProductChoices(promotionProducts, next); updatePromotionLossWarning(); });
      item.append(document.createTextNode(product.nom), remove); return item;
    }) : []));
  }
  function syncPromotionWeekdayField() {
    const recurring = byId('promotion-recurrence').value === 'hebdomadaire'; const field = byId('promotion-weekday-field'); const weekday = byId('promotion-weekday');
    field.hidden = !recurring; weekday.required = recurring; weekday.disabled = !recurring;
  }
  function renderPromotions() {
    const promotionList = byId('promotion-list'); const visualPool = savedVisuals(promotionList);
    promotionList.replaceChildren(...(promotions.length ? promotions.map((promotion) => {
      const status = promotionStatus(promotion); const row = Object.assign(document.createElement('article'), { className: 'promotion-row' }); const soldCount = Number(promotion.produits_vendus || 0); const icon = productVisual({ photo: promotion.produit_photo, icon: status === 'Active' ? '🏷️' : status === 'Planifiée' ? '🔥' : '🎁' }, 'product-icon', visualPool);
      const info = Object.assign(document.createElement('div'), { className: 'promotion-info' }); const soldLabel = `${soldCount} produit${soldCount === 1 ? '' : 's'} vendu${soldCount === 1 ? '' : 's'}`; const day = weekdayNames[Number(promotion.jour_semaine)] || 'dimanche'; const schedule = promotion.recurrence === 'hebdomadaire' ? `Chaque ${day}${promotion.date_fin ? ` jusqu’au ${saleDate(promotion.date_fin)}` : ''} · ${soldLabel}` : `${promotion.date_debut ? saleDate(promotion.date_debut) : ''} au ${promotion.date_fin ? saleDate(promotion.date_fin) : ''} · ${soldLabel}`; info.append(Object.assign(document.createElement('strong'), { textContent: promotion.nom }), Object.assign(document.createElement('small'), { textContent: schedule }));
      const badge = Object.assign(document.createElement('span'), { className: `status${status === 'Active' ? ' is-active' : status === 'Terminée' ? ' is-finished' : ''}`, textContent: status }); row.append(icon, info, badge); row.tabIndex = 0; row.setAttribute('role', 'button'); row.setAttribute('aria-label', `Modifier la promotion ${promotion.nom}`); row.addEventListener('click', () => openPromotionDialog(promotion)); row.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPromotionDialog(promotion); } }); return row;
    }) : [Object.assign(document.createElement('p'), { className: 'empty-state', textContent: 'Aucune promotion créée.' })]));
  }
  async function loadPromotions(force = false) { if (loadedViews.has('promotions') && !force) return; const [year, month] = byId('promotions-month-select').value.split('-').map(Number); try { const response = await window.api.getPromotions(month, year); promotions = Array.isArray(response) ? response : (response.promotions || []); } catch (error) { promotions = []; } loadedViews.add('promotions'); renderPromotions(); }
  async function openPromotionDialog(promotion = null) {
    const message = byId('promotion-form-message'); byId('promotion-form').reset(); ['promotion-name', 'promotion-type', 'promotion-value'].forEach((id) => { byId(id).disabled = Boolean(promotion); }); byId('promotion-id').value = promotion?.id || ''; byId('promotion-dialog-title').textContent = promotion ? 'Modifier la promotion' : 'Nouvelle promotion'; byId('save-promotion-button').textContent = promotion ? 'Enregistrer les modifications' : 'Créer la promotion'; byId('delete-promotion-button').hidden = !promotion; message.textContent = ''; message.classList.remove('is-error');
    try {
      const response = await window.api.getProducts(); const available = (response.produits || response || []).filter((product) => Number(product.actif) !== 0 && product.actif !== false); promotionProducts = available;
      const selectedIds = new Set((promotion?.produit_ids || []).map(Number)); renderPromotionProductChoices(available, selectedIds, Boolean(promotion));
      if (promotion) { byId('promotion-name').value = promotion.nom; byId('promotion-type').value = promotion.type; byId('promotion-value').value = promotion.valeur; byId('promotion-start').value = promotion.date_debut; byId('promotion-end').value = promotion.date_fin; byId('promotion-recurrence').value = promotion.recurrence || 'aucune'; if (promotion.jour_semaine !== null && promotion.jour_semaine !== undefined) byId('promotion-weekday').value = String(promotion.jour_semaine); }
      if (!available.length) { message.classList.add('is-error'); message.textContent = 'Ajoutez d’abord un produit actif avant de créer une promotion.'; }
    } catch (error) { renderPromotionProductChoices([]); message.classList.add('is-error'); message.textContent = error.message || 'Impossible de charger les produits.'; }
    syncPromotionValueLabel(); updatePromotionLossWarning(); syncPromotionWeekdayField(); byId('promotion-dialog').showModal();
  }
  async function savePromotion(event) {
    event.preventDefault(); const submit = byId('save-promotion-button'); const id = byId('promotion-id').value; const recurrence = byId('promotion-recurrence').value; const promotion = { nom: byId('promotion-name').value.trim(), produit_ids: selectedPromotionProductIds(), type: byId('promotion-type').value, valeur: Number(byId('promotion-value').value), date_debut: byId('promotion-start').value, date_fin: byId('promotion-end').value || null, recurrence, jour_semaine: recurrence === 'hebdomadaire' ? Number(byId('promotion-weekday').value) : null }; const payload = id ? { date_debut: promotion.date_debut, date_fin: promotion.date_fin, recurrence: promotion.recurrence, jour_semaine: promotion.jour_semaine } : promotion;
    if (!id && !promotion.produit_ids.length) { const message = byId('promotion-form-message'); message.classList.add('is-error'); message.textContent = 'Sélectionnez au moins un produit concerné.'; return; }
    submit.disabled = true; byId('promotion-form-message').textContent = ''; byId('promotion-form-message').classList.remove('is-error'); try { if (id) await window.api.updatePromotion(id, payload); else await window.api.createPromotion(promotion); byId('promotion-dialog').close(); await loadPromotions(true); } catch (error) { byId('promotion-form-message').classList.add('is-error'); byId('promotion-form-message').textContent = error.message || `Impossible de ${id ? 'modifier' : 'créer'} cette promotion.`; } finally { submit.disabled = false; }
  }
  async function deletePromotion() {
    const id = byId('promotion-id').value; if (!id || !window.confirm('Supprimer définitivement cette promotion ?')) return;
    const button = byId('delete-promotion-button'); button.disabled = true; try { await window.api.deletePromotion(id); byId('promotion-dialog').close(); await loadPromotions(true); } catch (error) { const message = byId('promotion-form-message'); message.classList.add('is-error'); message.textContent = error.message || 'Impossible de supprimer cette promotion.'; } finally { button.disabled = false; }
  }
  function setSettingsMessage(message, isError = false) { const area = byId('settings-message'); area.textContent = message; area.classList.toggle('is-error', isError); }
  function completeLogin(response) {
    const token = response.token || response.jwt || response.access_token; if (!token) throw new Error('JWT missing'); window.api.setToken(token); scheduleSessionExpiration(); if (!window.api.hasToken()) return; showView('dashboard'); loadDashboard(); loadManagedCategories();
  }
  async function login(event) {
    event.preventDefault(); const button = byId('login-button'); const message = byId('login-message'); button.disabled = true; message.textContent = ''; message.classList.remove('is-error');
    try { const response = await window.api.login(byId('login-identifier').value.trim(), byId('login-password').value); byId('login-password').value = ''; completeLogin(response); }
    catch (error) { message.classList.add('is-error'); message.textContent = error.message || 'Impossible de se connecter pour le moment.'; }
    finally { button.disabled = false; }
  }
  async function signup(event) {
    event.preventDefault(); const button = byId('signup-button'); const message = byId('signup-message'); const password = byId('signup-password').value; message.textContent = ''; message.classList.remove('is-error');
    if (password !== byId('signup-password-confirm').value) { message.classList.add('is-error'); message.textContent = 'Les mots de passe ne correspondent pas.'; return; }
    button.disabled = true;
    try { const response = await window.api.signup(byId('signup-identifier').value.trim(), password); byId('signup-dialog').close(); byId('signup-form').reset(); completeLogin(response); }
    catch (error) { message.classList.add('is-error'); message.textContent = error.message || 'Impossible de créer le compte.'; }
    finally { button.disabled = false; }
  }
  function settingsAction(label, callback) { const button = Object.assign(document.createElement('button'), { className: 'text-button', type: 'button', textContent: label }); button.addEventListener('click', callback); return button; }
  function setCategoryMessage(message = '', isError = false) { const area = byId('settings-category-message'); area.textContent = message; area.classList.toggle('is-error', isError); }
  function settingsStatus(active) { return Object.assign(document.createElement('span'), { className: `status${active ? ' is-active' : ' is-finished'}`, textContent: active ? 'Active' : 'Inactive' }); }
  function settingsItemTitle(...content) { const group = Object.assign(document.createElement('div'), { className: 'settings-item-title' }); group.append(...content); return group; }
  function settingsItemActions(...actions) { const group = Object.assign(document.createElement('div'), { className: 'settings-item-actions' }); group.append(...actions); return group; }
  function renderSettingsCategories() {
    const root = byId('settings-category-list'); root.replaceChildren(...(managedCategories.length ? managedCategories.map((category) => { const active = Number(category.actif) === 1; const item = Object.assign(document.createElement('article'), { className: 'settings-item' }); const name = Object.assign(document.createElement('strong'), { textContent: category.nom }); const rate = Object.assign(document.createElement('small'), { textContent: `${Number(category.taux_commission)} % · Frais fixe ${money(category.frais_fixe)}` }); item.append(settingsItemTitle(name, rate), settingsItemActions(settingsStatus(active), settingsAction('Modifier', () => editSettingsCategory(category)), settingsAction(active ? 'Désactiver' : 'Activer', () => saveSettingsCategory({ actif: active ? 0 : 1 }, category.id)), settingsAction('Supprimer', () => deleteSettingsCategory(category)))); return item; }) : [Object.assign(document.createElement('p'), { className: 'empty-state', textContent: 'Aucune catégorie créée.' })]));
  }
  async function loadSettingsManagement() { try { const categories = await window.api.getAdminCategories(); managedCategories = categories.categories || []; renderSettingsCategories(); } catch (error) { setSettingsMessage(error.message || 'Impossible de charger ces réglages.', true); } }
  function resetSettingsCategory() { byId('settings-category-form').reset(); byId('settings-category-id').value = ''; byId('settings-category-submit').textContent = 'Ajouter'; byId('settings-category-cancel').hidden = true; }
  function editSettingsCategory(category) { byId('settings-category-id').value = category.id; byId('settings-category-name').value = category.nom; byId('settings-category-rate').value = category.taux_commission; byId('settings-category-fixed-fee').value = category.frais_fixe ?? 0; byId('settings-category-submit').textContent = 'Enregistrer'; byId('settings-category-cancel').hidden = false; }
  async function saveSettingsCategory(data, id) { const button = byId('settings-category-submit'); button.disabled = true; setCategoryMessage(''); try { if (id) await window.api.updateAdminCategory(id, data); else await window.api.createAdminCategory(data); resetSettingsCategory(); await loadSettingsManagement(); await loadManagedCategories(); setCategoryMessage('Catégorie enregistrée.'); } catch (error) { setCategoryMessage(error.message || 'Impossible d’enregistrer la catégorie.', true); } finally { button.disabled = false; } }
  async function deleteSettingsCategory(category) { if (!window.confirm(`Supprimer la catégorie « ${category.nom} » ?`)) return; try { await window.api.deleteAdminCategory(category.id); await loadSettingsManagement(); await loadManagedCategories(); setSettingsMessage('Catégorie supprimée.'); } catch (error) { setSettingsMessage(error.message || 'Impossible de supprimer la catégorie.', true); } }
  function downloadFile(content, filename, type) { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }
  async function exportMonth(format) { const [year, month] = byId('month-select').value.split('-').map(Number); try { const result = await window.api.exportMonth(month, year, format); downloadFile(result, `ventes-${year}-${String(month).padStart(2, '0')}.${format}`, result.type || 'application/octet-stream'); setSettingsMessage(`Export ${format.toUpperCase()} téléchargé.`); } catch (error) { setSettingsMessage('Impossible de générer cet export. Vérifiez votre connexion.', true); } }
  async function backupSettings() { const button = byId('backup-button'); button.disabled = true; try { const backup = await window.api.getBackup(); downloadFile(JSON.stringify(backup, null, 2), 'mes-ventes-sauvegarde.json', 'application/json'); setSettingsMessage('Sauvegarde complète téléchargée.'); } catch (error) { setSettingsMessage(error.message || 'Impossible de créer la sauvegarde.', true); } finally { button.disabled = false; } }
  function restoreSettings(event) { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (!window.confirm('Restaurer cette sauvegarde remplacera définitivement toutes vos données actuelles (catégories, produits, promotions et ventes). Continuer ?')) return; const reader = new FileReader(); reader.addEventListener('load', async () => { try { const data = JSON.parse(reader.result); await window.api.restoreBackup(data); await loadSettingsManagement(); await loadManagedCategories(); await refreshMonthPickers(); await loadDashboard(); await loadSales(true); setSettingsMessage('Sauvegarde complète restaurée.'); } catch (error) { setSettingsMessage(error.message || 'Cette sauvegarde est invalide ou incompatible.', true); } }); reader.readAsText(file); }
  const SCALE_LABELS = {
    1: 'Compact',
    2: 'Normal',
    3: 'Grand',
    4: 'Très grand'
  };
  function setupAccessibilityScale() {
    const slider = byId('ui-scale-slider');
    const badge = byId('ui-scale-badge');
    const downBtn = byId('ui-scale-down');
    const upBtn = byId('ui-scale-up');
    const ticks = document.querySelectorAll('.scale-tick');

    function applyScale(level, save = true) {
      const validLevel = Math.max(1, Math.min(4, Number(level) || 2));
      document.documentElement.setAttribute('data-ui-scale', String(validLevel));
      if (slider) slider.value = String(validLevel);
      if (badge) badge.textContent = SCALE_LABELS[validLevel] || SCALE_LABELS[2];
      if (downBtn) downBtn.disabled = validLevel <= 1;
      if (upBtn) upBtn.disabled = validLevel >= 4;
      ticks.forEach((tick) => tick.classList.toggle('is-active', tick.dataset.level === String(validLevel)));
      if (save) {
        try { window.localStorage.setItem('sellora_ui_scale', String(validLevel)); } catch (_) {}
      }
    }

    let initialLevel = 2;
    try {
      const stored = window.localStorage.getItem('sellora_ui_scale');
      if (stored && SCALE_LABELS[stored]) initialLevel = Number(stored);
    } catch (_) {}

    applyScale(initialLevel, false);

    if (slider) {
      slider.addEventListener('input', (event) => applyScale(event.target.value, true));
    }
    if (downBtn) {
      downBtn.addEventListener('click', () => {
        const current = Number(slider?.value || 2);
        applyScale(current - 1, true);
      });
    }
    if (upBtn) {
      upBtn.addEventListener('click', () => {
        const current = Number(slider?.value || 2);
        applyScale(current + 1, true);
      });
    }
    ticks.forEach((tick) => {
      tick.addEventListener('click', () => applyScale(tick.dataset.level, true));
    });
  }
  function isInstalledApp() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
  function syncInstallButton() { const row = byId('install-row'); if (row) row.hidden = isInstalledApp(); }
  async function installApp() { if (deferredInstallPrompt) { deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = undefined; syncInstallButton(); return; } const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; setSettingsMessage(isIos ? 'Dans Safari, ouvrez Partager puis « Sur l’écran d’accueil » pour installer Sellora.' : 'Ouvrez le menu de votre navigateur puis choisissez « Installer Sellora » ou « Ajouter à l’écran d’accueil ».', false); }
  function showAppUpdateNotice() { byId('app-update-notice').hidden = false; }
  async function checkForAppUpdate() {
    try {
      const response = await window.api.getAppVersion();
      if (!response.version) return;
      // La dernière version est conservée : une PWA fermée puis rouverte peut
      // donc encore détecter qu'elle démarre avec une ancienne interface.
      const knownVersion = appVersion || window.localStorage.getItem(appVersionStorageKey);
      if (knownVersion && knownVersion !== response.version) showAppUpdateNotice();
      appVersion = response.version;
      window.localStorage.setItem(appVersionStorageKey, response.version);
    } catch (error) {
      // L'application reste utilisable hors ligne : la vérification reprendra plus tard.
    }
  }
  async function applyAppUpdate() {
    if (applyingAppUpdate) return;
    applyingAppUpdate = true;
    const button = byId('app-update-button'); button.disabled = true; button.textContent = 'Actualisation…';
    const waitingWorker = serviceWorkerRegistration?.waiting;
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      window.setTimeout(() => window.location.reload(), 3000);
      return;
    }
    window.location.reload();
  }
  function watchServiceWorker(registration) {
    const announceWaitingWorker = () => { if (navigator.serviceWorker.controller && registration.waiting) showAppUpdateNotice(); };
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => { if (worker.state === 'installed') announceWaitingWorker(); });
    });
    announceWaitingWorker();
  }
  async function setupServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    try {
      serviceWorkerRegistration = await navigator.serviceWorker.register('service-worker.js');
      watchServiceWorker(serviceWorkerRegistration);
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (applyingAppUpdate) window.location.reload(); });
      await serviceWorkerRegistration.update();
    } catch (error) {
      // L'application continue sans cache hors ligne si le service worker échoue.
    }
  }
  async function refreshCurrentData() {
    if (!window.api.hasToken()) return;
    await refreshMonthPickers();
    if (currentView === 'dashboard') await loadDashboard();
    if (currentView === 'products') await loadProducts(true);
    if (currentView === 'sales') await loadSales(true);
    if (currentView === 'promotions') await loadPromotions(true);
    if (currentView === 'settings') { await loadSettingsManagement(); await loadManagedCategories(); }
  }
  function setupPullToRefresh() {
    const indicator = byId('pull-refresh-indicator');
    const threshold = 72;
    const gestureStartThreshold = 12;
    const holdingDistance = 44;
    let startX = 0; let startY = 0; let distance = 0; let gestureDirection; let scrollArea; let indicatorBaseTop = 0; let pulling = false; let refreshing = false; let pullFrame; let returnFrame; let returnAnimation; let returnTimer;
    const reset = (area = scrollArea) => {
      window.cancelAnimationFrame(pullFrame); window.cancelAnimationFrame(returnFrame); window.clearTimeout(returnTimer); returnAnimation?.cancel(); pullFrame = undefined; returnFrame = undefined;
      const returnDistance = Number.parseFloat(area?.style.getPropertyValue('--pull-distance')) || 0;
      pulling = false; distance = 0; gestureDirection = undefined; area?.classList.remove('is-pulling', 'is-pull-holding'); area?.classList.add('is-pull-returning');
      // Cette animation est composée séparément des longues listes : leur rendu
      // ne peut donc plus interrompre visuellement la remontée.
      const activeReturnAnimation = area && returnDistance ? area.animate([
        { transform: `translate3d(0, ${returnDistance}px, 0)` },
        { transform: 'translate3d(0, 0, 0)' },
      ], { duration: 540, easing: 'cubic-bezier(.16, .88, .22, 1)', fill: 'both' }) : undefined;
      returnAnimation = activeReturnAnimation;
      returnFrame = window.requestAnimationFrame(() => {
        returnFrame = undefined; area?.style.removeProperty('--pull-distance');
        indicator.style.setProperty('--pull-indicator-y', '0px'); indicator.style.removeProperty('--pull-icon-rotation'); indicator.style.removeProperty('--pull-icon-sweep'); indicator.style.removeProperty('--pull-indicator-opacity');
        indicator.classList.remove('is-visible', 'is-ready', 'is-pulling', 'is-settling'); if (!refreshing) indicator.classList.remove('is-loading');
      });
      returnTimer = window.setTimeout(() => {
        if (returnAnimation !== activeReturnAnimation) return;
        returnAnimation?.cancel(); returnAnimation = undefined; area?.classList.remove('is-pull-returning'); indicator.style.removeProperty('--pull-indicator-top');
      }, 580);
    };
    const renderPullState = () => {
      pullFrame = undefined;
      // Une résistance progressive imite le ressort d'une application native,
      // tout en évitant une translation trop rapide quand le doigt descend.
      const visualDistance = Math.min(88, 96 * (1 - Math.exp(-distance / 160)));
      scrollArea.classList.remove('is-pull-returning'); scrollArea.classList.add('is-pulling'); scrollArea.style.setProperty('--pull-distance', `${visualDistance}px`);
      const circlePosition = Math.max(2, visualDistance * 0.55 - 14);
      const pullProgress = Math.min(1, distance / threshold);
      indicator.style.setProperty('--pull-indicator-top', `${indicatorBaseTop}px`); indicator.style.setProperty('--pull-indicator-y', `${circlePosition}px`); indicator.style.setProperty('--pull-icon-rotation', `${-90 + distance * 2.2}deg`); indicator.style.setProperty('--pull-icon-sweep', `${18 + pullProgress * 252}deg`); indicator.style.setProperty('--pull-indicator-opacity', `${Math.max(0.06, pullProgress)}`);
      indicator.classList.add('is-pulling'); indicator.classList.toggle('is-visible', distance > 0 || refreshing); indicator.classList.toggle('is-ready', distance >= threshold && !refreshing);
    };
    const setPullState = () => { if (!pullFrame) pullFrame = window.requestAnimationFrame(renderPullState); };
    document.querySelectorAll('.page-content').forEach((area) => {
      area.addEventListener('touchstart', (event) => {
        if (refreshing || event.touches.length !== 1 || area.scrollTop > 0 || !window.api.hasToken()) return;
        // Un nouveau geste prend toujours la main sur un retour encore animé.
        window.cancelAnimationFrame(returnFrame); window.clearTimeout(returnTimer); returnAnimation?.cancel(); returnFrame = undefined; returnAnimation = undefined; area.classList.remove('is-pull-returning');
        startX = event.touches[0].clientX; startY = event.touches[0].clientY; distance = 0; gestureDirection = undefined; scrollArea = area; indicatorBaseTop = Math.round(area.getBoundingClientRect().top); pulling = true;
      }, { passive: true });
      area.addEventListener('touchmove', (event) => {
        if (!pulling || scrollArea !== area || event.touches.length !== 1) return;
        const horizontalDistance = event.touches[0].clientX - startX;
        const verticalDistance = event.touches[0].clientY - startY;
        if (!gestureDirection) {
          // Empêche le rebond natif du navigateur dès qu'un geste vertical
          // descendant est reconnu, même avant le seuil visuel du cercle.
          if (verticalDistance > 0 && verticalDistance > Math.abs(horizontalDistance)) event.preventDefault();
          if (Math.hypot(horizontalDistance, verticalDistance) < gestureStartThreshold) return;
          if (verticalDistance <= 0 || Math.abs(horizontalDistance) >= verticalDistance * 0.65) { pulling = false; scrollArea = undefined; return; }
          gestureDirection = 'down';
        }
        distance = Math.max(0, verticalDistance - gestureStartThreshold);
        if (!distance) return;
        event.preventDefault();
        setPullState();
      }, { passive: false });
      area.addEventListener('touchend', async () => {
        if (!pulling || scrollArea !== area) return;
        if (pullFrame) { window.cancelAnimationFrame(pullFrame); renderPullState(); }
        const shouldRefresh = distance >= threshold;
        if (!shouldRefresh) { reset(); scrollArea = undefined; return; }
        // Comme dans les applications natives, le contenu reste tiré vers le
        // bas durant tout le chargement et ne revient qu'une fois terminé.
        pulling = false; distance = 0; refreshing = true;
        area.classList.remove('is-pulling'); area.classList.add('is-pull-holding'); area.style.setProperty('--pull-distance', `${holdingDistance}px`);
        indicator.style.setProperty('--pull-indicator-y', '10px'); indicator.style.removeProperty('--pull-icon-sweep'); indicator.classList.remove('is-ready', 'is-pulling'); indicator.classList.add('is-visible', 'is-settling', 'is-loading');
        // Laisse au navigateur une image pour afficher la rotation avant de
        // lancer le travail réseau et le rendu des listes actualisées.
        await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
        const refreshStartedAt = performance.now();
        try {
          await Promise.all([refreshCurrentData(), checkForAppUpdate()]);
          const remainingTime = 450 - (performance.now() - refreshStartedAt);
          if (remainingTime > 0) await new Promise((resolve) => window.setTimeout(resolve, remainingTime));
        }
        catch (error) { /* L'indicateur disparaît simplement si le réseau est indisponible. */ }
        finally { refreshing = false; reset(area); scrollArea = undefined; }
      }, { passive: true });
      area.addEventListener('touchcancel', () => { if (pulling && scrollArea === area) { reset(area); scrollArea = undefined; } }, { passive: true });
    });
  }
  function showView(view) {
    if (currentView === view) return;
    const isInitialView = currentView === undefined;
    currentView = view;
    document.querySelectorAll('.app-view').forEach((element) => { element.hidden = element.id !== `${view}-view`; });
    const activeView = byId(`${view}-view`);
    if (!isInitialView) {
      activeView.classList.remove('view-enter');
      void activeView.offsetWidth;
      activeView.classList.add('view-enter');
      activeView.addEventListener('animationend', () => activeView.classList.remove('view-enter'), { once: true });
    }
    document.querySelectorAll('.nav-item').forEach((item) => { const isActive = item.dataset.view === view; item.classList.toggle('is-active', isActive); item.toggleAttribute('aria-current', isActive); });
    byId('dashboard-header').hidden = view !== 'dashboard'; document.querySelector('.bottom-nav').classList.toggle('is-hidden', view === 'product-form' || view === 'login');
    if (view === 'products') loadProducts();
    if (view === 'sales') loadSales();
    if (view === 'promotions') loadPromotions();
    if (view === 'settings') loadSettingsManagement();
  }
  document.addEventListener('DOMContentLoaded', () => {
    setupAccessibilityScale();
    syncInstallButton(); populateMonthPickers(); drawChart(); setupPullToRefresh(); setupServiceWorker(); checkForAppUpdate(); byId('app-update-button').addEventListener('click', applyAppUpdate); byId('month-select').addEventListener('change', (event) => { syncMonthPickerValue(event.currentTarget); updatePeriodLabels(); loadDashboard(); });
    byId('product-search').addEventListener('input', renderProducts); document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.addEventListener('click', () => showView(item.dataset.view)));
    byId('new-product-button').addEventListener('click', () => openProductForm()); byId('cancel-product-button').addEventListener('click', () => showView('products')); byId('product-category').addEventListener('change', applyCategoryCommission);
    ['purchase-price', 'sale-price', 'commission-rate', 'fixed-fee'].forEach((id) => byId(id).addEventListener('input', updateCalculation)); byId('product-form').addEventListener('submit', saveProduct);
    byId('product-photo').addEventListener('change', (event) => { const file = event.currentTarget.files[0]; if (!file) return setProductImagePreview(); if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { event.currentTarget.value = ''; byId('product-form-message').classList.add('is-error'); byId('product-form-message').textContent = 'Choisissez une image JPEG, PNG ou WebP de 5 Mo maximum.'; return setProductImagePreview(); } byId('product-form-message').textContent = ''; byId('product-form-message').classList.remove('is-error'); setProductImagePreview(URL.createObjectURL(file)); });
    byId('sale-date').max = localIsoDate(); byId('sales-month-select').addEventListener('change', (event) => { syncMonthPickerValue(event.currentTarget); loadSales(true); }); byId('promotions-month-select').addEventListener('change', (event) => { syncMonthPickerValue(event.currentTarget); loadPromotions(true); }); byId('new-sale-button').addEventListener('click', openSaleDialog); byId('close-sale-dialog').addEventListener('click', () => byId('sale-dialog').close()); ['sale-product', 'sale-channel', 'sale-quantity', 'sale-other-fees'].forEach((id) => byId(id).addEventListener('input', updateSalePreview)); byId('sale-form').addEventListener('submit', saveSale);
    byId('create-promotion-button').addEventListener('click', () => openPromotionDialog()); byId('close-promotion-dialog').addEventListener('click', () => byId('promotion-dialog').close()); byId('promotion-recurrence').addEventListener('change', syncPromotionWeekdayField); byId('promotion-product-picker').addEventListener('change', (event) => { const productId = Number(event.currentTarget.value); if (!productId) return; const selected = new Set(selectedPromotionProductIds()); selected.add(productId); renderPromotionProductChoices(promotionProducts, selected); updatePromotionLossWarning(); }); byId('promotion-type').addEventListener('change', () => { syncPromotionValueLabel(); updatePromotionLossWarning(); }); byId('promotion-value').addEventListener('input', updatePromotionLossWarning); byId('promotion-form').addEventListener('submit', savePromotion); byId('delete-promotion-button').addEventListener('click', deletePromotion);
    resetSettingsCategory(); byId('settings-category-form').addEventListener('submit', (event) => { event.preventDefault(); saveSettingsCategory({ nom: byId('settings-category-name').value.trim(), taux_commission: byId('settings-category-rate').value, frais_fixe: byId('settings-category-fixed-fee').value || 0 }, byId('settings-category-id').value); }); byId('settings-category-cancel').addEventListener('click', resetSettingsCategory); document.querySelectorAll('[data-export-format]').forEach((button) => button.addEventListener('click', () => exportMonth(button.dataset.exportFormat))); byId('backup-button').addEventListener('click', backupSettings); byId('restore-input').addEventListener('change', restoreSettings); byId('install-button')?.addEventListener('click', installApp); byId('logout-button').addEventListener('click', () => endSession()); byId('login-form').addEventListener('submit', login); byId('open-signup-button').addEventListener('click', () => { byId('signup-form').reset(); byId('signup-message').textContent = ''; byId('signup-dialog').showModal(); }); byId('close-signup-dialog').addEventListener('click', () => byId('signup-dialog').close()); byId('signup-form').addEventListener('submit', signup);
    if (window.api.hasToken()) scheduleSessionExpiration();
    showView(window.api.hasToken() ? 'dashboard' : 'login'); if (window.api.hasToken()) { refreshMonthPickers().then(() => { loadDashboard(); loadSales(true); }); loadDashboard(); loadManagedCategories(); }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkForAppUpdate(); serviceWorkerRegistration?.update(); if (window.api.hasToken()) { scheduleSessionExpiration(); refreshMonthPickers().then(() => { loadDashboard(); loadSales(true); }); } } });
    window.setInterval(() => { checkForAppUpdate(); serviceWorkerRegistration?.update(); }, 5 * 60 * 1000);
  });
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstallPrompt = event; const row = byId('install-row'); if (row) row.hidden = false; });
  window.addEventListener('appinstalled', () => { deferredInstallPrompt = undefined; syncInstallButton(); });
})();
