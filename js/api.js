window.api = (() => {
  const tokenKey = 'mes-ventes.jwt';
  const getToken = () => localStorage.getItem(tokenKey);
  const getTokenExpiration = () => {
    const token = getToken();
    if (!token) return null;
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const json = new TextDecoder().decode(Uint8Array.from(atob(base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=')), (character) => character.charCodeAt(0)));
      const expiration = Number(JSON.parse(json).exp);
      return Number.isFinite(expiration) ? expiration * 1000 : null;
    } catch (error) {
      return null;
    }
  };
  const request = async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`api${path}`, { ...options, headers });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `API ${response.status}`);
    }
    return response.status === 204 ? null : response.json();
  };
  return {
    setToken: (token) => localStorage.setItem(tokenKey, token),
    clearToken: () => localStorage.removeItem(tokenKey),
    hasToken: () => Boolean(getToken()),
    getTokenExpiration,
    getAppVersion: async () => {
      const response = await fetch('api/app-version', { cache: 'no-store' });
      if (!response.ok) throw new Error(`API ${response.status}`);
      return response.json();
    },
    getDashboard: (month, year, weekStart, weekEnd) => request(`/dashboard?mois=${month}&annee=${year}&debut_semaine=${encodeURIComponent(weekStart)}&fin_semaine=${encodeURIComponent(weekEnd)}`),
    getProducts: () => request('/produits'),
    createProduct: (product) => request('/produits', { method: 'POST', body: product instanceof FormData ? product : JSON.stringify(product) }),
    updateProduct: (id, product) => request(`/produits/${encodeURIComponent(id)}`, { method: 'PUT', body: product instanceof FormData ? product : JSON.stringify(product) }),
    getSales: (month, year) => request(`/ventes?mois=${month}&annee=${year}`),
    getPendingSales: () => request('/ventes/en-attente'),
    getSalesPeriods: () => request('/ventes/periodes'),
    createSale: (sale) => request('/ventes', { method: 'POST', body: JSON.stringify(sale) }),
    deliverSale: (id) => request(`/ventes/${encodeURIComponent(id)}/livrer`, { method: 'POST' }),
    deleteSale: (id) => request(`/ventes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    getPromotions: (month, year) => request(`/promotions?mois=${encodeURIComponent(month)}&annee=${encodeURIComponent(year)}`),
    getAdminCategories: () => request('/admin/categories'),
    createAdminCategory: (category) => request('/admin/categories', { method: 'POST', body: JSON.stringify(category) }),
    updateAdminCategory: (id, category) => request(`/admin/categories/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(category) }),
    deleteAdminCategory: (id) => request(`/admin/categories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    createPromotion: (promotion) => request('/promotions', { method: 'POST', body: JSON.stringify(promotion) }),
    updatePromotion: (id, promotion) => request(`/promotions/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(promotion) }),
    deletePromotion: (id) => request(`/promotions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    getBackup: () => request('/sauvegarde'),
    restoreBackup: (backup) => request('/sauvegarde/restore', { method: 'POST', body: JSON.stringify(backup) }),
    exportMonth: async (month, year, format) => {
      const headers = new Headers({ Accept: '*/*' }); const token = getToken(); if (token) headers.set('Authorization', `Bearer ${token}`);
      const response = await fetch(`api/export?mois=${month}&annee=${year}&format=${encodeURIComponent(format)}`, { headers });
      if (!response.ok) throw new Error(`API ${response.status}`); return response.blob();
    },
    login: (identifiant, motDePasse) => request('/auth/login', { method: 'POST', body: JSON.stringify({ identifiant, motDePasse }) }),
    signup: (identifiant, motDePasse) => request('/auth/inscription', { method: 'POST', body: JSON.stringify({ identifiant, motDePasse }) })
  };
})();
