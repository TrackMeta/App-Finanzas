// =============================================
// DB – localStorage (sin login, funciona offline)
// =============================================

function lsGet(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
  catch { return def; }
}
function lsSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ---- CATEGORÍAS POR DEFECTO ----
const DEFAULT_CATS = [
  { id: 'cat-01', name: 'Comida',        icon: '🍔', color: '#F59E0B', type: 'expense' },
  { id: 'cat-02', name: 'Transporte',    icon: '🚌', color: '#3B82F6', type: 'expense' },
  { id: 'cat-03', name: 'Vivienda',      icon: '🏠', color: '#8B5CF6', type: 'expense' },
  { id: 'cat-04', name: 'Salud',         icon: '💊', color: '#EF4444', type: 'expense' },
  { id: 'cat-05', name: 'Ocio',          icon: '🎮', color: '#EC4899', type: 'expense' },
  { id: 'cat-06', name: 'Suscripciones', icon: '📱', color: '#06B6D4', type: 'expense' },
  { id: 'cat-07', name: 'Educación',     icon: '📚', color: '#10B981', type: 'expense' },
  { id: 'cat-08', name: 'Ropa',          icon: '👕', color: '#F97316', type: 'expense' },
  { id: 'cat-09', name: 'Delivery',      icon: '🛵', color: '#84CC16', type: 'expense' },
  { id: 'cat-10', name: 'Otros gastos',  icon: '💸', color: '#6B7280', type: 'expense' },
  { id: 'cat-11', name: 'Sueldo',        icon: '💼', color: '#10B981', type: 'income'  },
  { id: 'cat-12', name: 'Freelance',     icon: '💻', color: '#8B5CF6', type: 'income'  },
  { id: 'cat-13', name: 'Inversiones',   icon: '📈', color: '#3B82F6', type: 'income'  },
  { id: 'cat-14', name: 'Regalo',        icon: '🎁', color: '#EC4899', type: 'income'  },
  { id: 'cat-15', name: 'Otros ingresos',icon: '💰', color: '#6B7280', type: 'income'  },
];

// ---- AUTH (mock – sin login) ----
const Auth = {
  getUser()        { return { id: 'local', email: 'usuario@local' }; },
  onAuthChange()   {},
  async signOut()  {}
};

// ---- PROFILES ----
const Profiles = {
  get()          { return lsGet('cf_profile', { id: 'local', name: 'Usuario', currency: 'PEN' }); },
  update(_, upd) {
    const p = { ...Profiles.get(), ...upd };
    lsSet('cf_profile', p);
    return p;
  }
};

// ---- CATEGORIES ----
const Categories = {
  getAll(type) {
    if (!lsGet('cf_cats_init', false)) { lsSet('cf_categories', DEFAULT_CATS); lsSet('cf_cats_init', true); }
    const cats = lsGet('cf_categories', DEFAULT_CATS);
    if (!type || type === 'both') return cats;
    if (type === 'expense') return cats.filter(c => c.type === 'expense' || c.type === 'both');
    if (type === 'income')  return cats.filter(c => c.type === 'income'  || c.type === 'both');
    return cats;
  }
};

// ---- TRANSACTIONS ----
const Transactions = {
  _cats() { return lsGet('cf_categories', DEFAULT_CATS); },
  _enrich(t) { return { ...t, category: this._cats().find(c => c.id === t.category_id) ?? null }; },

  getByMonth(month) {
    const [y, m] = month.split('-');
    const start = `${y}-${m}-01`;
    const end   = new Date(y, m, 0).toISOString().split('T')[0];
    return lsGet('cf_transactions', [])
      .filter(t => t.date >= start && t.date <= end)
      .map(t => this._enrich(t))
      .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  },

  getRecent(limit = 10) {
    return lsGet('cf_transactions', [])
      .slice(-limit).reverse()
      .map(t => this._enrich(t));
  },

  add(tx) {
    const all = lsGet('cf_transactions', []);
    const newTx = { ...tx, id: uid(), created_at: new Date().toISOString() };
    all.push(newTx);
    lsSet('cf_transactions', all);
    return this._enrich(newTx);
  },

  remove(id) {
    lsSet('cf_transactions', lsGet('cf_transactions', []).filter(t => t.id !== id));
  }
};

// ---- GOALS ----
const Goals = {
  getAll() { return lsGet('cf_goals', []); },

  add(goal) {
    const all = lsGet('cf_goals', []);
    const g = { ...goal, id: uid(), created_at: new Date().toISOString() };
    all.push(g); lsSet('cf_goals', all);
    return g;
  },

  contribute(goalId, amount, userId, goalName) {
    const all = lsGet('cf_goals', []);
    const i = all.findIndex(g => g.id === goalId);
    if (i >= 0) {
      all[i].current_amount = Math.min((all[i].current_amount || 0) + amount, all[i].target_amount);
      lsSet('cf_goals', all);
    }
    Transactions.add({
      user_id: userId, type: 'expense', amount,
      date: new Date().toISOString().split('T')[0],
      note: `Aporte a meta: ${goalName}`, is_recurring: false, category_id: null
    });
  },

  remove(id) { lsSet('cf_goals', lsGet('cf_goals', []).filter(g => g.id !== id)); }
};

// ---- DEBTS ----
const Debts = {
  getAll() { return lsGet('cf_debts', []); },

  add(debt) {
    const all = lsGet('cf_debts', []);
    const d = { ...debt, id: uid(), created_at: new Date().toISOString() };
    all.push(d); lsSet('cf_debts', all);
    return d;
  },

  remove(id) { lsSet('cf_debts', lsGet('cf_debts', []).filter(d => d.id !== id)); }
};

// ---- STREAKS ----
const Streaks = {
  get() {
    return lsGet('cf_streaks', { current_streak: 0, longest_streak: 0, last_log_date: null });
  },
  update() {
    const s = Streaks.get();
    const today = new Date().toISOString().split('T')[0];
    if (s.last_log_date === today) return;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    s.current_streak = s.last_log_date === yesterday ? s.current_streak + 1 : 1;
    s.longest_streak = Math.max(s.current_streak, s.longest_streak);
    s.last_log_date = today;
    lsSet('cf_streaks', s);
  }
};

// ---- ACHIEVEMENTS ----
const Achievements = {
  getAll() { return lsGet('cf_achievements', []); },
  unlock(type) {
    const all = Achievements.getAll();
    if (!all.includes(type)) { all.push(type); lsSet('cf_achievements', all); }
  }
};
