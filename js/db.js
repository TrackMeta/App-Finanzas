// =============================================
// DB – Supabase backend (multi-usuario)
// =============================================

// _sb y AuthService son definidos en auth.js (cargado antes)

function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Helper: lanza error legible de Supabase
function _sbErr(error, msg) {
  console.error('[DB]', msg, error);
  throw new Error(msg || error?.message || 'Error de base de datos');
}

// Helper: user_id del usuario actual
function _me() { return AuthService.getCurrentUserId(); }

// ---- AUTH (compatibilidad con app.js) ----
const Auth = {
  getUser() {
    const u = AuthService.getCachedUser();
    return u ? { id: u.id, email: u.email } : { id: 'local', email: '' };
  },
  onAuthChange() {},
  async signOut() { return AuthService.logout(); },
};

// ---- PROFILES ----
const Profiles = {
  async get() {
    const { data, error } = await _sb
      .from('profiles')
      .select('*')
      .eq('id', _me())
      .single();
    if (error) return { name: 'Usuario', currency: 'PEN' };
    return data;
  },

  async update(_, upd) {
    const { data, error } = await _sb
      .from('profiles')
      .upsert({ id: _me(), ...upd }, { onConflict: 'id' })
      .select()
      .single();
    if (error) _sbErr(error, 'Error al actualizar perfil');
    return data;
  },
};

// ---- CATEGORIES ----
const Categories = {
  async getAll(type) {
    let q = _sb.from('categories').select('*').eq('user_id', _me()).order('name');
    if (type === 'expense') q = q.eq('type', 'expense');
    else if (type === 'income') q = q.eq('type', 'income');
    const { data, error } = await q;
    if (error) _sbErr(error, 'Error al cargar categorías');
    return data || [];
  },

  async update(id, changes) {
    const { error } = await _sb
      .from('categories')
      .update(changes)
      .eq('id', id)
      .eq('user_id', _me());
    if (error) _sbErr(error, 'Error al actualizar categoría');
  },

  async remove(id) {
    const { error } = await _sb
      .from('categories')
      .delete()
      .eq('id', id)
      .eq('user_id', _me());
    if (error) _sbErr(error, 'Error al eliminar categoría');
  },

  async add(cat) {
    const { data, error } = await _sb
      .from('categories')
      .insert({ ...cat, user_id: _me() })
      .select()
      .single();
    if (error) _sbErr(error, 'Error al crear categoría');
    return data;
  },
};

// ---- TRANSACTIONS ----
const Transactions = {
  _enrich(t) {
    // Supabase devuelve la categoría en t.categories (join)
    return { ...t, category: t.categories || null };
  },

  async getByDateRange(from, to) {
    const { data, error } = await _sb
      .from('transactions')
      .select('*, categories(id,name,icon,color,type)')
      .eq('user_id', _me())
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) _sbErr(error, 'Error al cargar movimientos');
    return (data || []).map(t => this._enrich(t));
  },

  async getByMonth(month) {
    const [y, m] = month.split('-');
    const from = `${y}-${m}-01`;
    const to   = new Date(y, m, 0).toISOString().split('T')[0];
    return this.getByDateRange(from, to);
  },

  async getAll() {
    // Para cálculo de saldos (sin filtro de fecha)
    const { data, error } = await _sb
      .from('transactions')
      .select('id,type,amount,account_id,from_account,to_account,date')
      .eq('user_id', _me());
    if (error) _sbErr(error, 'Error al cargar movimientos');
    return data || [];
  },

  async getRecent(limit = 10) {
    const { data, error } = await _sb
      .from('transactions')
      .select('*, categories(id,name,icon,color,type)')
      .eq('user_id', _me())
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) _sbErr(error, 'Error al cargar recientes');
    return (data || []).map(t => this._enrich(t));
  },

  async add(tx) {
    const { data, error } = await _sb
      .from('transactions')
      .insert({ ...tx, user_id: _me() })
      .select('*, categories(id,name,icon,color,type)')
      .single();
    if (error) _sbErr(error, 'Error al guardar movimiento');
    return this._enrich(data);
  },

  async update(id, changes) {
    const { data, error } = await _sb
      .from('transactions')
      .update(changes)
      .eq('id', id)
      .eq('user_id', _me())
      .select('*, categories(id,name,icon,color,type)')
      .single();
    if (error) _sbErr(error, 'Error al actualizar movimiento');
    return this._enrich(data);
  },

  async remove(id) {
    const { error } = await _sb
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', _me());
    if (error) _sbErr(error, 'Error al eliminar movimiento');
  },
};

// ---- BUDGETS ----
const Budgets = {
  async getAll(month) {
    const { data, error } = await _sb
      .from('budgets')
      .select('*, categories(id,name,icon,color,type)')
      .eq('user_id', _me())
      .eq('month', month);
    if (error) _sbErr(error, 'Error al cargar presupuestos');
    // Mapear al formato esperado por la UI
    return (data || []).map(b => ({
      category_id:    b.category_id,
      monthly_limit:  Number(b.monthly_limit),
      category:       b.categories,
    }));
  },

  async set(month, categoryId, limit) {
    if (limit <= 0) {
      // Eliminar presupuesto
      await _sb.from('budgets')
        .delete()
        .eq('user_id', _me())
        .eq('category_id', categoryId)
        .eq('month', month);
      return;
    }
    const { error } = await _sb.from('budgets').upsert({
      user_id:       _me(),
      category_id:   categoryId,
      month,
      monthly_limit: limit,
    }, { onConflict: 'user_id,category_id,month' });
    if (error) _sbErr(error, 'Error al guardar presupuesto');
  },

  async remove(month, categoryId) { return this.set(month, categoryId, 0); },
};

// ---- GOALS ----
const Goals = {
  async getAll() {
    const { data, error } = await _sb
      .from('goals')
      .select('*')
      .eq('user_id', _me())
      .order('created_at');
    if (error) _sbErr(error, 'Error al cargar metas');
    return data || [];
  },

  async add(goal) {
    const { data, error } = await _sb
      .from('goals')
      .insert({ ...goal, user_id: _me() })
      .select()
      .single();
    if (error) _sbErr(error, 'Error al crear meta');
    return data;
  },

  async contribute(goalId, amount, userId, goalName) {
    // 1. Actualizar progreso de la meta
    const goals = await this.getAll();
    const g = goals.find(x => x.id === goalId);
    if (g) {
      const newAmount = Math.min((Number(g.current_amount) || 0) + amount, Number(g.target_amount));
      await _sb.from('goals').update({ current_amount: newAmount }).eq('id', goalId).eq('user_id', _me());
    }
    // 2. Registrar como gasto
    return Transactions.add({
      user_id: _me(), type: 'expense', amount,
      date: new Date().toISOString().split('T')[0],
      note: `Aporte a meta: ${goalName}`, is_recurring: false, category_id: null,
    });
  },

  async update(id, changes) {
    const { data, error } = await _sb
      .from('goals')
      .update(changes)
      .eq('id', id)
      .eq('user_id', _me())
      .select()
      .single();
    if (error) _sbErr(error, 'Error al actualizar meta');
    return data;
  },

  async remove(id) {
    const { error } = await _sb
      .from('goals')
      .delete()
      .eq('id', id)
      .eq('user_id', _me());
    if (error) _sbErr(error, 'Error al eliminar meta');
  },
};

// ---- DEBTS ----
const Debts = {
  async getAll() {
    const { data, error } = await _sb
      .from('debts')
      .select('*')
      .eq('user_id', _me())
      .order('created_at');
    if (error) _sbErr(error, 'Error al cargar deudas');
    return data || [];
  },

  async add(debt) {
    const { data, error } = await _sb
      .from('debts')
      .insert({ ...debt, user_id: _me() })
      .select()
      .single();
    if (error) _sbErr(error, 'Error al registrar deuda');
    return data;
  },

  async pay(id, amount) {
    const debts = await this.getAll();
    const d = debts.find(x => x.id === id);
    if (!d) return null;
    const newPaid = Math.min((Number(d.paid) || 0) + amount, Number(d.total));
    const newInst = (d.paid_installments || 0) + 1;
    let nextDate = d.next_payment_date;
    if (nextDate) {
      const nd = new Date(nextDate + 'T00:00:00');
      nd.setMonth(nd.getMonth() + 1);
      nextDate = nd.toISOString().split('T')[0];
    }
    const { data, error } = await _sb
      .from('debts')
      .update({ paid: newPaid, paid_installments: newInst, next_payment_date: nextDate })
      .eq('id', id)
      .eq('user_id', _me())
      .select()
      .single();
    if (error) _sbErr(error, 'Error al registrar pago');
    return data;
  },

  async remove(id) {
    const { error } = await _sb
      .from('debts')
      .delete()
      .eq('id', id)
      .eq('user_id', _me());
    if (error) _sbErr(error, 'Error al eliminar deuda');
  },
};

// ---- ACCOUNTS ----
const Accounts = {
  async getAll() {
    const { data, error } = await _sb
      .from('accounts')
      .select('*')
      .eq('user_id', _me())
      .order('created_at');
    if (error) _sbErr(error, 'Error al cargar cuentas');
    return data || [];
  },

  async add(acc) {
    const { data, error } = await _sb
      .from('accounts')
      .insert({ ...acc, user_id: _me() })
      .select()
      .single();
    if (error) _sbErr(error, 'Error al crear cuenta');
    return data;
  },

  async update(id, changes) {
    const { error } = await _sb
      .from('accounts')
      .update(changes)
      .eq('id', id)
      .eq('user_id', _me());
    if (error) _sbErr(error, 'Error al actualizar cuenta');
  },

  async remove(id) {
    const { error } = await _sb
      .from('accounts')
      .delete()
      .eq('id', id)
      .eq('user_id', _me());
    if (error) _sbErr(error, 'Error al eliminar cuenta');
  },

  // Calcula el saldo a partir de todas las transacciones cargadas
  getBalance(id, allTxs, accounts) {
    const acc     = (accounts || State?.accounts || []).find(a => a.id === id);
    const initial = Number(acc?.initial_balance) || 0;
    return (allTxs || []).reduce((bal, t) => {
      if (t.type === 'transfer') {
        if (t.to_account   === id) return bal + Number(t.amount);
        if (t.from_account === id) return bal - Number(t.amount);
      }
      if (t.account_id === id) {
        if (t.type === 'income')  return bal + Number(t.amount);
        if (t.type === 'expense') return bal - Number(t.amount);
      }
      return bal;
    }, initial);
  },
};

// ---- STREAKS (local – no afecta multi-usuario en Supabase) ----
const Streaks = {
  _key() { return `cf_streaks_${_me()}`; },
  get() {
    try { const v = localStorage.getItem(this._key()); return v ? JSON.parse(v) : { current_streak:0, longest_streak:0, last_log_date:null }; }
    catch { return { current_streak:0, longest_streak:0, last_log_date:null }; }
  },
  update() {
    const s    = this.get();
    const td   = new Date().toISOString().split('T')[0];
    if (s.last_log_date === td) return;
    const yd   = new Date(Date.now()-86400000).toISOString().split('T')[0];
    s.current_streak = s.last_log_date === yd ? s.current_streak + 1 : 1;
    s.longest_streak = Math.max(s.current_streak, s.longest_streak);
    s.last_log_date  = td;
    localStorage.setItem(this._key(), JSON.stringify(s));
  },
};

// ---- ACHIEVEMENTS (local) ----
const Achievements = {
  _key()       { return `cf_achievements_${_me()}`; },
  getAll()     { try { const v=localStorage.getItem(this._key()); return v?JSON.parse(v):[]; } catch{return[];} },
  unlock(type) { const a=this.getAll(); if(!a.includes(type)){a.push(type);localStorage.setItem(this._key(),JSON.stringify(a));} },
};

// ── lsGet/lsSet helpers (usados en app.js para UI state) ──────────────
function lsGet(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
  catch { return def; }
}
function lsSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// uk() ya no es necesario con Supabase pero app.js lo usa para onboarding_done
function uk(key) { return `${key}_${_me() || 'local'}`; }
