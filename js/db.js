// =============================================
// DB – localStorage con soporte multi-usuario
// =============================================

function lsGet(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
  catch { return def; }
}
function lsSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); }

// Clave con namespace de usuario actual
function _uid_prefix() {
  try {
    const s = localStorage.getItem('cf_session');
    return s ? JSON.parse(s).id : 'local';
  } catch { return 'local'; }
}
function uk(key) { return `${key}_${_uid_prefix()}`; }

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

// ---- AUTH (delegado a AuthService en auth.js) ----
const Auth = {
  getUser() {
    const s = AuthService.getSession();
    return s ? { id: s.id, email: s.email, name: s.name } : { id: 'local', email: 'usuario@local' };
  },
  onAuthChange() {},
  async signOut() { AuthService.logout(); },
};

// ---- PROFILES ----
const Profiles = {
  get()          { return lsGet(uk('cf_profile'), { id: _uid_prefix(), name: 'Usuario', currency: 'PEN' }); },
  update(_, upd) {
    const p = { ...Profiles.get(), ...upd };
    lsSet(uk('cf_profile'), p);
    return p;
  }
};

// ---- CATEGORIES ----
const Categories = {
  getAll(type) {
    if (!lsGet(uk('cf_cats_init'), false)) {
      lsSet(uk('cf_categories'), DEFAULT_CATS);
      lsSet(uk('cf_cats_init'), true);
    }
    const cats = lsGet(uk('cf_categories'), DEFAULT_CATS);
    if (!type || type === 'both') return cats;
    if (type === 'expense') return cats.filter(c => c.type === 'expense' || c.type === 'both');
    if (type === 'income')  return cats.filter(c => c.type === 'income'  || c.type === 'both');
    return cats;
  },
  update(id, changes) {
    const all = lsGet(uk('cf_categories'), DEFAULT_CATS);
    const idx = all.findIndex(c => c.id === id);
    if (idx >= 0) { all[idx] = { ...all[idx], ...changes }; lsSet(uk('cf_categories'), all); }
  },
  remove(id) {
    lsSet(uk('cf_categories'), lsGet(uk('cf_categories'), DEFAULT_CATS).filter(c => c.id !== id));
  }
};

// ---- TRANSACTIONS ----
const Transactions = {
  _cats() { return lsGet(uk('cf_categories'), DEFAULT_CATS); },
  _enrich(t) { return { ...t, category: this._cats().find(c => c.id === t.category_id) ?? null }; },

  getByMonth(month) {
    const [y, m] = month.split('-');
    const start = `${y}-${m}-01`;
    const end   = new Date(y, m, 0).toISOString().split('T')[0];
    return lsGet(uk('cf_transactions'), [])
      .filter(t => t.date >= start && t.date <= end)
      .map(t => this._enrich(t))
      .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  },

  getByDateRange(from, to) {
    return lsGet(uk('cf_transactions'), [])
      .filter(t => t.date >= from && t.date <= to)
      .map(t => this._enrich(t))
      .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  },

  getRecent(limit = 10) {
    return lsGet(uk('cf_transactions'), [])
      .slice(-limit).reverse()
      .map(t => this._enrich(t));
  },

  add(tx) {
    const all   = lsGet(uk('cf_transactions'), []);
    const newTx = { ...tx, id: uid(), created_at: new Date().toISOString() };
    all.push(newTx);
    lsSet(uk('cf_transactions'), all);
    return this._enrich(newTx);
  },

  update(id, changes) {
    const all = lsGet(uk('cf_transactions'), []);
    const idx = all.findIndex(t => t.id === id);
    if (idx < 0) return;
    all[idx] = { ...all[idx], ...changes };
    lsSet(uk('cf_transactions'), all);
    return this._enrich(all[idx]);
  },

  remove(id) {
    lsSet(uk('cf_transactions'), lsGet(uk('cf_transactions'), []).filter(t => t.id !== id));
  }
};

// ---- BUDGETS ----
const Budgets = {
  _key(month) { return uk(`cf_budgets_${month}`); },
  getAll(month) { return lsGet(Budgets._key(month), []); },
  set(month, categoryId, limit) {
    const all = Budgets.getAll(month).filter(b => b.category_id !== categoryId);
    if (limit > 0) all.push({ category_id: categoryId, monthly_limit: limit });
    lsSet(Budgets._key(month), all);
  },
  remove(month, categoryId) { Budgets.set(month, categoryId, 0); }
};

// ---- GOALS ----
const Goals = {
  getAll() { return lsGet(uk('cf_goals'), []); },

  add(goal) {
    const all = lsGet(uk('cf_goals'), []);
    const g   = { ...goal, id: uid(), created_at: new Date().toISOString() };
    all.push(g);
    lsSet(uk('cf_goals'), all);
    return g;
  },

  contribute(goalId, amount, userId, goalName) {
    const all = lsGet(uk('cf_goals'), []);
    const i   = all.findIndex(g => g.id === goalId);
    if (i >= 0) {
      all[i].current_amount = Math.min((all[i].current_amount || 0) + amount, all[i].target_amount);
      lsSet(uk('cf_goals'), all);
    }
    Transactions.add({
      user_id: userId, type: 'expense', amount,
      date: new Date().toISOString().split('T')[0],
      note: `Aporte a meta: ${goalName}`, is_recurring: false, category_id: null
    });
  },

  update(id, changes) {
    const all = lsGet(uk('cf_goals'), []);
    const i   = all.findIndex(g => g.id === id);
    if (i >= 0) { all[i] = { ...all[i], ...changes }; lsSet(uk('cf_goals'), all); return all[i]; }
  },
  remove(id) { lsSet(uk('cf_goals'), lsGet(uk('cf_goals'), []).filter(g => g.id !== id)); }
};

// ---- DEBTS ----
const Debts = {
  getAll() { return lsGet(uk('cf_debts'), []); },

  add(debt) {
    const all = lsGet(uk('cf_debts'), []);
    const d   = { ...debt, id: uid(), created_at: new Date().toISOString() };
    all.push(d);
    lsSet(uk('cf_debts'), all);
    return d;
  },

  pay(id, amount) {
    const all = lsGet(uk('cf_debts'), []);
    const i   = all.findIndex(d => d.id === id);
    if (i < 0) return null;
    all[i].paid = Math.min((all[i].paid || 0) + amount, all[i].total);
    all[i].paid_installments = (all[i].paid_installments || 0) + 1;
    if (all[i].next_payment_date) {
      const d = new Date(all[i].next_payment_date);
      d.setMonth(d.getMonth() + 1);
      all[i].next_payment_date = d.toISOString().split('T')[0];
    }
    lsSet(uk('cf_debts'), all);
    return all[i];
  },
  remove(id) { lsSet(uk('cf_debts'), lsGet(uk('cf_debts'), []).filter(d => d.id !== id)); }
};

// ---- ACCOUNTS (billeteras) ----
const DEFAULT_ACCOUNTS = [
  { id: 'acc-01', name: 'Efectivo', icon: '💵', color: '#10B981', initial_balance: 0 },
  { id: 'acc-02', name: 'Banco',    icon: '🏦', color: '#3B82F6', initial_balance: 0 },
  { id: 'acc-03', name: 'Digital',  icon: '📱', color: '#8B5CF6', initial_balance: 0 },
];

const Accounts = {
  getAll() {
    if (!lsGet(uk('cf_accs_init'), false)) {
      lsSet(uk('cf_accounts'), DEFAULT_ACCOUNTS);
      lsSet(uk('cf_accs_init'), true);
    }
    return lsGet(uk('cf_accounts'), DEFAULT_ACCOUNTS);
  },
  add(acc) {
    const all = this.getAll();
    const a   = { ...acc, id: uid() };
    all.push(a);
    lsSet(uk('cf_accounts'), all);
    return a;
  },
  update(id, changes) {
    const all = this.getAll();
    const i   = all.findIndex(a => a.id === id);
    if (i >= 0) { all[i] = { ...all[i], ...changes }; lsSet(uk('cf_accounts'), all); }
  },
  remove(id) {
    lsSet(uk('cf_accounts'), lsGet(uk('cf_accounts'), []).filter(a => a.id !== id));
  },
  getBalance(id) {
    const acc     = this.getAll().find(a => a.id === id);
    const initial = acc?.initial_balance || 0;
    const txs     = lsGet(uk('cf_transactions'), []);
    return txs.reduce((bal, t) => {
      if (t.type === 'transfer') {
        if (t.to_account   === id) return bal + t.amount;
        if (t.from_account === id) return bal - t.amount;
      }
      if (t.account_id === id) {
        if (t.type === 'income')  return bal + t.amount;
        if (t.type === 'expense') return bal - t.amount;
      }
      return bal;
    }, initial);
  }
};

// ---- STREAKS ----
const Streaks = {
  get() {
    return lsGet(uk('cf_streaks'), { current_streak: 0, longest_streak: 0, last_log_date: null });
  },
  update() {
    const s         = Streaks.get();
    const todayStr  = new Date().toISOString().split('T')[0];
    if (s.last_log_date === todayStr) return;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    s.current_streak = s.last_log_date === yesterday ? s.current_streak + 1 : 1;
    s.longest_streak = Math.max(s.current_streak, s.longest_streak);
    s.last_log_date  = todayStr;
    lsSet(uk('cf_streaks'), s);
  }
};

// ---- ACHIEVEMENTS ----
const Achievements = {
  getAll()      { return lsGet(uk('cf_achievements'), []); },
  unlock(type)  {
    const all = Achievements.getAll();
    if (!all.includes(type)) { all.push(type); lsSet(uk('cf_achievements'), all); }
  }
};
