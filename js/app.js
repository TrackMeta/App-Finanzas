// =============================================
// APP – Router, UI y lógica principal
// =============================================

// ---- ESTADO GLOBAL ----
const State = {
  user: null,
  categories: [],
  currentMonth: new Date().toISOString().slice(0,7),
  transactions: [],
  quickAddType: 'expense',
  quickAddAmount: '0',
  quickAddCategoryId: '',
  quickAddRecurring: false,
  transferFromId: '',
  transferToId: '',
  selectedGoalId: null,
  selectedGoalName: '',
  selectedDebtId: null,
  selectedDebtName: '',
  calMonth: new Date().toISOString().slice(0,7),
  simCategoryId: '',
  charts: {},
  txFilterType: 'all',
  txCatFilter: '',
  txSearch: '',
  txDateFrom: '',
  txDateTo: '',
  quickAddAccountId: '',
};

// ---- UTILS ----
function $(id) { return document.getElementById(id); }
function toast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2800);
}
function openOverlay(id) { $(id).classList.remove('hidden'); $(id).classList.add('active'); }
function closeOverlay(id) { $(id).classList.remove('active'); $(id).classList.add('hidden'); }
function fmtMonth(m) {
  const [y,mon] = m.split('-');
  return new Date(y, mon-1, 1).toLocaleDateString('es-PE', {month:'long', year:'numeric'});
}
function today() { return new Date().toISOString().split('T')[0]; }

// ---- ROUTER ----
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });
  const el = $('page-' + page);
  if (el) { el.classList.remove('hidden'); el.classList.add('active'); }

  document.querySelectorAll('.tab, .nav-link').forEach(t => {
    t.classList.toggle('active', t.dataset.page === page);
  });

  if (page === 'dashboard') loadDashboard();
  if (page === 'transactions') loadTransactions();
  if (page === 'goals') loadGoals();
  if (page === 'debts') loadDebts();
  if (page === 'calendar') loadCalendar();
  if (page === 'insights') loadInsights();
  if (page === 'reports')   loadReports();
  if (page === 'profile')   loadProfile();
  if (page === 'accounts')  loadAccountsPage();
}

// ---- SHOW APP ----
function showApp() {
  // Cargar moneda desde el perfil antes de renderizar nada
  const profile = Profiles.get();
  if (profile.currency) setCurrency(profile.currency);

  $('screen-app').classList.remove('hidden');
  $('screen-app').classList.add('active');
  loadDashboard();

  // Resumen de fin de mes (primer acceso a un mes nuevo)
  setTimeout(checkMonthSummary, 800);

  // Manejo de shortcuts PWA (?action=...)
  const action = new URLSearchParams(location.search).get('action');
  if (action === 'expense')           setTimeout(() => openQuickAdd('expense'), 400);
  else if (action === 'income')       setTimeout(() => openQuickAdd('income'), 400);
  else if (action === 'transactions') setTimeout(() => navigate('transactions'), 300);
  if (action) history.replaceState(null, '', location.pathname);
}
function showLogin() { /* sin login */ }

// ---- ONBOARDING ----
function showOnboarding() {
  const screen = $('screen-onboarding');
  screen.classList.remove('hidden');

  // Renderizar inputs de saldos de cuentas
  const accounts = Accounts.getAll();
  $('ob-accounts-inputs').innerHTML = accounts.map(acc => `
    <div class="ob-account-row">
      <div class="ob-account-icon" style="background:${acc.color}20;">${acc.icon}</div>
      <div style="flex:1;">
        <p style="font-size:0.9rem;font-weight:600;">${acc.name}</p>
      </div>
      <div style="display:flex;align-items:center;gap:0.4rem;">
        <span style="font-size:0.85rem;color:var(--text-muted);">S/</span>
        <input type="number" class="input ob-acc-input" data-accid="${acc.id}"
          value="0" min="0" step="0.01"
          style="width:100px;text-align:right;padding:0.4rem 0.6rem;font-size:0.95rem;" />
      </div>
    </div>`).join('');

  let currentStep = 0;

  function goToStep(next) {
    const from = $(`ob-step-${currentStep}`);
    const to   = $(`ob-step-${next}`);
    const goingForward = next > currentStep;

    // Salida del paso actual
    from.classList.add(goingForward ? 'out-left' : 'out-right');

    // Entrada del siguiente
    to.classList.remove('out-left', 'out-right');

    // Dots
    document.querySelectorAll('.ob-dot').forEach((d, i) => {
      d.classList.toggle('active', i === next);
    });

    currentStep = next;
  }

  // Botón paso 0 → 1
  $('ob-next-0').addEventListener('click', () => {
    const name = $('ob-name').value.trim();
    if (!name) { $('ob-name').focus(); toast('Ingresa tu nombre', 'error'); return; }
    Profiles.update(null, { name });
    $('ob-ready-title').textContent = `¡Estás listo, ${name}! 🎉`;
    goToStep(1);
  });

  // Enter en el input de nombre
  $('ob-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('ob-next-0').click();
  });

  // Botón paso 1 → 2 (guardar saldos)
  function saveBalancesAndContinue() {
    document.querySelectorAll('.ob-acc-input').forEach(input => {
      const balance = parseFloat(input.value) || 0;
      Accounts.update(input.dataset.accid, { initial_balance: balance });
    });
    goToStep(2);
  }
  $('ob-next-1').addEventListener('click', saveBalancesAndContinue);
  $('ob-skip-1').addEventListener('click', () => goToStep(2));

  // Botón final → entrar a la app
  $('ob-finish').addEventListener('click', () => {
    lsSet('cf_onboarding_done', true);
    screen.classList.add('hidden');
    showApp();
  });
}

// ---- DASHBOARD ----
async function loadDashboard() {
  const [txs, cats] = await Promise.all([
    Transactions.getByMonth(State.currentMonth),
    Categories.getAll()
  ]);
  State.transactions = txs;
  State.categories = cats;

  const { income, expenses, savings } = calcMonthStats(txs);

  // Balance
  $('hero-balance').textContent = new Intl.NumberFormat(LOCALE,{minimumFractionDigits:2}).format(savings);
  $('stat-income').textContent = fmt(income, true);
  $('stat-expenses').textContent = fmt(expenses, true);
  $('stat-savings').textContent = fmt(Math.max(0, savings), true);

  // Delta vs mes anterior
  const prevMonth = getPrevMonth(State.currentMonth);
  const prevTxs = await Transactions.getByMonth(prevMonth);
  const prevExp = prevTxs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  if (prevExp > 0) {
    const delta = ((expenses - prevExp) / prevExp) * 100;
    $('hero-delta').textContent = `${delta>0?'+':''}${delta.toFixed(0)}% vs mes anterior`;
  }

  // Sparkline
  renderSparkline(txs);

  // Donut
  renderDonut(txs, cats);

  // Insights (incluye alertas de presupuesto)
  const budgets = Budgets.getAll(State.currentMonth);
  const insights = generateInsights(txs, prevTxs, cats, budgets);

  // Alertas de deudas próximas o vencidas
  const debtAlerts = Debts.getAll()
    .filter(d => d.total > (d.paid || 0) && d.next_payment_date)
    .map(d => {
      const days = Math.ceil((new Date(d.next_payment_date) - new Date()) / 86400000);
      if (days > 5) return null;
      return {
        type: days <= 0 ? 'warning' : 'tip',
        icon: days <= 0 ? '🚨' : '⏰',
        priority: days <= 0 ? 10 : 9,
        title: days <= 0
          ? `Deuda vencida: ${d.name}`
          : `Pago en ${days} día${days !== 1 ? 's' : ''}: ${d.name}`,
        desc: `Monto pendiente: ${fmt(d.total - (d.paid || 0))}. ${days <= 0 ? 'Regulariza cuanto antes.' : 'Prepara el pago.'}`
      };
    }).filter(Boolean);

  const allInsights = [...debtAlerts, ...insights].sort((a,b) => b.priority - a.priority);
  renderInsights($('dashboard-insights'), allInsights.slice(0, 3));

  // Cuentas en dashboard
  renderAccountsCard();

  // Presupuestos en dashboard
  const cardBudgetsDash = $('card-budgets-dash');
  if (budgets.length) {
    cardBudgetsDash.style.display = '';
    renderDashBudgets(txs, cats, budgets);
  } else {
    cardBudgetsDash.style.display = 'none';
  }

  // Gastos fijos del mes
  const recurring = txs.filter(t => t.is_recurring && t.type === 'expense');
  const cardRec = $('card-recurring');
  if (recurring.length) {
    cardRec.style.display = '';
    const total = recurring.reduce((s,t) => s+t.amount, 0);
    $('recurring-total').textContent = fmt(total) + '/mes';
    renderTxList($('recurring-list'), recurring, false);
  } else {
    cardRec.style.display = 'none';
  }

  // Últimas transacciones
  const recent = await Transactions.getRecent(5);
  renderTxList($('recent-transactions'), recent, true);
}

function getPrevMonth(m) {
  const [y,mon] = m.split('-').map(Number);
  const d = new Date(y, mon-1, 1);
  d.setMonth(d.getMonth()-1);
  return d.toISOString().slice(0,7);
}

// ---- SPARKLINE ----
function renderSparkline(transactions) {
  const ctx = $('chart-sparkline').getContext('2d');
  if (State.charts.sparkline) State.charts.sparkline.destroy();

  const days = 30;
  const labels = [], data = [];
  for (let i=days-1; i>=0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const key = d.toISOString().split('T')[0];
    labels.push('');
    data.push(transactions.filter(t=>t.type==='expense'&&t.date===key).reduce((s,t)=>s+t.amount,0));
  }

  State.charts.sparkline = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{ data, fill: true, borderColor: 'rgba(255,255,255,0.8)',
        backgroundColor: 'rgba(255,255,255,0.15)', tension: 0.4,
        pointRadius: 0, borderWidth: 2 }]
    },
    options: { plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      animation: { duration: 600 } }
  });
}

// ---- DONUT ----
function renderDonut(transactions, categories) {
  const ctx = $('chart-donut').getContext('2d');
  if (State.charts.donut) State.charts.donut.destroy();

  const expenses = transactions.filter(t=>t.type==='expense');
  const total = expenses.reduce((s,t)=>s+t.amount,0);
  const byCat = {};
  expenses.forEach(t => { if(t.category_id) byCat[t.category_id]=(byCat[t.category_id]||0)+t.amount; });

  const sorted = Object.entries(byCat).sort(([,a],[,b])=>b-a).slice(0,5);
  const chartData = sorted.map(([id,amount]) => {
    const cat = categories.find(c=>c.id===id);
    return { name: cat?.name??'Otros', amount, color: cat?.color??'#6B7280', icon: cat?.icon??'💸' };
  });

  if (!chartData.length) { $('donut-legend').innerHTML = '<p class="text-muted text-sm">Sin gastos este mes</p>'; return; }

  State.charts.donut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: chartData.map(d=>d.name),
      datasets: [{ data: chartData.map(d=>d.amount), backgroundColor: chartData.map(d=>d.color),
        borderWidth: 2, borderColor: 'var(--bg-card)', hoverOffset: 4 }]
    },
    options: { cutout: '65%', plugins: { legend: { display: false }, tooltip: {
      callbacks: { label: ctx => ` ${fmt(ctx.raw)}` }
    }}, animation: { animateRotate: true, duration: 700 } }
  });

  // Leyenda
  const legend = $('donut-legend');
  legend.innerHTML = chartData.map(d => `
    <div class="legend-item-row">
      <div class="legend-dot" style="background:${d.color}"></div>
      <span class="legend-name">${d.icon} ${d.name}</span>
      <span class="legend-amount">${fmt(d.amount,true)}</span>
      <span class="legend-pct">${total>0?((d.amount/total)*100).toFixed(0):0}%</span>
    </div>
  `).join('');
}

// ---- RENDER TX LIST ----
function renderTxList(container, txs, showDate = false) {
  if (!txs.length) {
    container.innerHTML = '<p class="text-muted text-center py-4 text-sm">Sin movimientos</p>';
    return;
  }
  container.innerHTML = txs.map(tx => txItemHTML(tx, showDate)).join('');

  container.querySelectorAll('.tx-item').forEach(item => {
    item.addEventListener('click', e => {
      const panel = item.nextElementSibling;
      if (!panel || !panel.classList.contains('tx-actions')) return;
      // Cerrar otros paneles abiertos en el mismo contenedor
      container.querySelectorAll('.tx-actions').forEach(a => {
        if (a !== panel) a.classList.add('hidden');
      });
      panel.classList.toggle('hidden');
    });
  });
}

// ---- TX ITEM HTML (reutilizable) ----
function txItemHTML(tx, showDate = false) {
  if (tx.type === 'transfer') {
    const accounts = Accounts.getAll();
    const from = accounts.find(a => a.id === tx.from_account);
    const to   = accounts.find(a => a.id === tx.to_account);
    const meta = [showDate ? fmtDate(tx.date) : '', tx.note].filter(Boolean).join(' · ');
    return `
      <div class="tx-item" data-id="${tx.id}">
        <div class="tx-icon" style="background:var(--violet-dim)">↔️</div>
        <div class="tx-info">
          <p class="tx-name">${from?.icon ?? ''}${from?.name ?? '?'} → ${to?.icon ?? ''}${to?.name ?? '?'}</p>
          ${meta ? `<p class="tx-meta">${meta}</p>` : ''}
        </div>
        <span class="tx-amount transfer">${fmt(tx.amount)}</span>
      </div>
      <div class="tx-actions hidden">
        <button class="btn btn-danger btn-sm" style="flex:1;" onclick="deleteTx('${tx.id}')">🗑 Eliminar</button>
      </div>`;
  }
  const color     = tx.category?.color ?? '#6B7280';
  const recurring = tx.is_recurring ? '🔁 ' : '';
  const accounts  = Accounts.getAll();
  const account   = tx.account_id ? accounts.find(a => a.id === tx.account_id) : null;
  const accLabel  = account ? `${account.icon} ${account.name}` : '';
  const meta      = [showDate ? fmtDate(tx.date) : '', tx.note, accLabel].filter(Boolean).join(' · ');
  return `
    <div class="tx-item" data-id="${tx.id}">
      <div class="tx-icon" style="background:${color}20">${tx.category?.icon ?? '💸'}</div>
      <div class="tx-info">
        <p class="tx-name">${recurring}${tx.category?.name ?? 'Sin categoría'}</p>
        ${meta ? `<p class="tx-meta">${meta}</p>` : ''}
      </div>
      <span class="tx-amount ${tx.type}">${tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : ''}${fmt(tx.amount)}</span>
    </div>
    <div class="tx-actions hidden">
      <button class="btn btn-sm" style="flex:1;background:var(--bg-secondary);" onclick="openEditTx('${tx.id}')">✏️ Editar</button>
      <button class="btn btn-danger btn-sm" style="flex:1;" onclick="deleteTx('${tx.id}')">🗑 Eliminar</button>
    </div>`;
}

// ---- EDITAR TRANSACCIÓN ----
let _editTxId = null;
let _editTxRecurring = false;

function openEditTx(id) {
  const all = lsGet('cf_transactions', []);
  const tx  = all.find(t => t.id === id);
  if (!tx) return;
  _editTxId = id;
  _editTxRecurring = tx.is_recurring || false;

  // Tipo
  document.querySelectorAll('[data-edit-type]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.editType === tx.type);
  });

  // Campos
  $('edit-tx-amount').value   = tx.amount;
  $('edit-tx-date').value     = tx.date;
  $('edit-tx-note').value     = tx.note || '';

  // Toggle recurrente
  const recBtn = $('edit-tx-recurring');
  recBtn.classList.toggle('active', _editTxRecurring);

  // Categorías
  const cats = Categories.getAll();
  $('edit-tx-category').innerHTML = `<option value="">Sin categoría</option>` +
    cats.map(c => `<option value="${c.id}" ${c.id===tx.category_id?'selected':''}>${c.icon} ${c.name}</option>`).join('');

  // Cuenta
  const accs = Accounts.getAll();
  $('edit-tx-account').innerHTML = `<option value="">— Sin cuenta —</option>` +
    accs.map(a => `<option value="${a.id}" ${a.id===tx.account_id?'selected':''}>${a.icon} ${a.name}</option>`).join('');

  openOverlay('overlay-edit-tx');
}

async function saveEditTx() {
  if (!_editTxId) return;
  const amount = parseFloat($('edit-tx-amount').value);
  if (!amount || amount <= 0) { toast('Monto inválido', 'error'); return; }
  const type = document.querySelector('[data-edit-type].active')?.dataset.editType || 'expense';
  Transactions.update(_editTxId, {
    amount,
    type,
    category_id: $('edit-tx-category').value || null,
    account_id:  $('edit-tx-account').value  || null,
    date:        $('edit-tx-date').value,
    note:        $('edit-tx-note').value || null,
    is_recurring: _editTxRecurring
  });
  toast('Movimiento actualizado ✓', 'success');
  closeOverlay('overlay-edit-tx');
  loadDashboard();
  if ($('page-transactions').classList.contains('active')) loadTransactions();
}

async function deleteTx(id) {
  if (!confirm('¿Eliminar esta transacción?')) return;
  try {
    await Transactions.remove(id);
    toast('Eliminado', 'success');
    navigate('transactions');
    loadDashboard();
  } catch { toast('Error al eliminar', 'error'); }
}

// ---- RENDER INSIGHTS ----
function renderInsights(container, insights) {
  if (!insights.length) { container.innerHTML = ''; return; }
  container.innerHTML = insights.map(i => `
    <div class="insight-card ${i.type}">
      <span class="insight-icon">${i.icon}</span>
      <div class="insight-content">
        <p class="insight-title">${i.title}</p>
        <p class="insight-desc">${i.desc}</p>
      </div>
    </div>`).join('');
}

// ---- TRANSACTIONS PAGE ----
async function loadTransactions() {
  // Si hay rango de fechas activo, ignorar el mes y filtrar por rango
  if (State.txDateFrom && State.txDateTo) {
    const all = lsGet('cf_transactions', []);
    const cats = lsGet('cf_categories', []);
    const ranged = all
      .filter(t => t.date >= State.txDateFrom && t.date <= State.txDateTo)
      .map(t => ({ ...t, category: cats.find(c => c.id === t.category_id) ?? null }))
      .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
    State.transactions = ranged;
    $('current-month-label').textContent = `${State.txDateFrom} → ${State.txDateTo}`;
    renderTransactionsPage(ranged);
    return;
  }

  const label = $('current-month-label');
  label.textContent = fmtMonth(State.currentMonth);

  const txs = await Transactions.getByMonth(State.currentMonth);
  State.transactions = txs;
  renderTransactionsPage(txs);

  // Sugerencia de recurrentes al abrir el mes actual
  checkRecurringSuggestion(txs);
}

function checkRecurringSuggestion(currentTxs) {
  const banner = $('recurring-banner');
  if (!banner) return;

  // Solo mostrar en el mes actual
  if (State.currentMonth !== new Date().toISOString().slice(0, 7)) {
    banner.classList.add('hidden'); return;
  }

  // Recurrentes del mes anterior que aún no están este mes
  const prevMonth = getPrevMonth(State.currentMonth);
  const prevTxs = lsGet('cf_transactions', [])
    .filter(t => t.date >= prevMonth + '-01' && t.date <= prevMonth + '-31' && t.is_recurring);

  const thisMonthCatIds = new Set(currentTxs.filter(t => t.is_recurring).map(t => t.category_id));
  const pending = prevTxs.filter(t => !thisMonthCatIds.has(t.category_id));

  if (!pending.length) { banner.classList.add('hidden'); return; }

  banner.classList.remove('hidden');
  $('recurring-banner-text').textContent =
    `🔁 Tienes ${pending.length} gasto${pending.length > 1 ? 's' : ''} fijo${pending.length > 1 ? 's' : ''} del mes anterior sin registrar`;

  $('recurring-banner-btn').onclick = () => {
    pending.forEach(t => {
      Transactions.add({
        user_id: t.user_id || 'local',
        type: t.type,
        amount: t.amount,
        date: today(),
        note: t.note,
        is_recurring: true,
        category_id: t.category_id,
        account_id: t.account_id || null,
      });
    });
    toast(`${pending.length} gasto${pending.length > 1 ? 's' : ''} fijo${pending.length > 1 ? 's' : ''} agregado${pending.length > 1 ? 's' : ''} ✓`, 'success');
    banner.classList.add('hidden');
    loadTransactions();
    loadDashboard();
  };

  $('recurring-banner-close').onclick = () => banner.classList.add('hidden');
}

function renderTransactionsPage(txs) {
  // Filtros de categoría — se reconstruyen si el nº de categorías cambió
  const cats = Categories.getAll();
  const catFilter = $('tx-cat-filters');
  const builtCount = parseInt(catFilter.dataset.built || '0', 10);
  if (catFilter && builtCount !== cats.length) {
    catFilter.dataset.built = String(cats.length);
    catFilter.innerHTML = `<button class="filter-btn active" data-catid="">Todas</button>` +
      cats.map(c => `<button class="filter-btn" data-catid="${c.id}">${c.icon} ${c.name}</button>`).join('');
    catFilter.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        catFilter.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        State.txCatFilter = btn.dataset.catid;
        renderTransactionsPage(State.transactions);
      });
    });
  }
  // Restaurar el botón activo según el filtro actual
  catFilter.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.catid === State.txCatFilter);
  });

  const filtered = txs.filter(t => {
    if (State.txFilterType === 'recurring') return t.is_recurring;
    if (State.txFilterType !== 'all' && t.type !== State.txFilterType) return false;
    if (State.txCatFilter && t.category_id !== State.txCatFilter) return false;
    const q = State.txSearch.toLowerCase();
    if (q) return (t.category?.name??'').toLowerCase().includes(q) ||
      (t.note??'').toLowerCase().includes(q) ||
      t.amount.toString().includes(q);
    return true;
  });

  const income = filtered.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expenses = filtered.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  $('tx-income').textContent = fmt(income);
  $('tx-expenses').textContent = fmt(expenses);

  // Agrupar por fecha
  const groups = {};
  filtered.forEach(t => { groups[t.date]=groups[t.date]||[]; groups[t.date].push(t); });
  const sorted = Object.entries(groups).sort(([a],[b])=>b.localeCompare(a));

  const container = $('transactions-list');
  if (!sorted.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>Sin movimientos</p></div>';
    return;
  }

  container.innerHTML = sorted.map(([date, items]) => {
    const dayTotal = items.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    const d = new Date(date+'T00:00:00');
    const label = d.toLocaleDateString('es-PE',{weekday:'short',day:'numeric',month:'short'});
    return `
      <div class="tx-group-header">
        <span>${label}</span>
        ${dayTotal>0?`<span class="text-rose font-mono">-${fmt(dayTotal,true)}</span>`:''}
      </div>
      <div class="card" style="margin-bottom:0.5rem">
        <div class="card-body" style="padding:0 1rem">
          ${items.map(tx => txItemHTML(tx, false)).join('')}
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.tx-item').forEach(item => {
    item.addEventListener('click', e => {
      const panel = item.nextElementSibling;
      if (!panel || !panel.classList.contains('tx-actions')) return;
      // Cerrar otros paneles abiertos en la misma lista
      container.querySelectorAll('.tx-actions').forEach(a => {
        if (a !== panel) a.classList.add('hidden');
      });
      panel.classList.toggle('hidden');
    });
  });
}

// ---- GOALS PAGE ----
function calcGoalProjection(goal) {
  const remaining = goal.target_amount - goal.current_amount;
  if (remaining <= 0) return null;
  const now = new Date();
  // Ahorro promedio de los últimos 3 meses
  const allTxs = lsGet('cf_transactions', []);
  const samples = [];
  for (let i = 1; i <= 3; i++) {
    const d  = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y  = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0');
    const start = `${y}-${m}-01`;
    const end   = new Date(y, d.getMonth()+1, 0).toISOString().split('T')[0];
    const mTxs  = allTxs.filter(t => t.date >= start && t.date <= end);
    const inc   = mTxs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount, 0);
    const exp   = mTxs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount, 0);
    if (inc > 0) samples.push(inc - exp);
  }
  if (!samples.length) return null;
  const avg = samples.reduce((a,b)=>a+b,0) / samples.length;
  if (avg <= 0) return null;
  const months = Math.ceil(remaining / avg);
  const date   = new Date(now.getFullYear(), now.getMonth() + months, 1);
  return { months, date, avgSavings: avg };
}

async function loadGoals() {
  const goals = await Goals.getAll();
  const total = goals.reduce((s,g)=>s+g.current_amount,0);
  const target = goals.reduce((s,g)=>s+g.target_amount,0);
  $('goals-summary').textContent = goals.length ? `${fmt(total)} de ${fmt(target)} ahorrados` : '';

  const container = $('goals-list');
  if (!goals.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🎯</div>
      <p>Sin metas aún</p>
      <button class="btn btn-primary mt-3" onclick="$('btn-new-goal').click()">Crear primera meta</button>
    </div>`; return;
  }

  container.innerHTML = goals.map(g => {
    const pct = Math.min((g.current_amount/g.target_amount)*100, 100);
    const daysLeft = Math.ceil((new Date(g.deadline)-new Date())/86400000);
    const daily = daysLeft>0 ? (g.target_amount-g.current_amount)/daysLeft : 0;
    const done = g.current_amount >= g.target_amount;
    return `
      <div class="goal-card">
        <div class="goal-header">
          <div class="goal-icon" style="background:${g.color}20">${g.icon}</div>
          <div class="goal-info">
            <p class="goal-name">${g.name}</p>
            <p class="goal-deadline">📅 ${fmtDaysLeft(g.deadline)}</p>
          </div>
          ${done?'<span class="goal-completed">✅ Lograda</span>':''}
        </div>
        <div class="goal-progress-bar">
          <div class="goal-progress-fill" style="width:${pct}%;background:${g.color}"></div>
        </div>
        <div class="goal-amounts">
          <span class="text-muted">${fmt(g.current_amount)}</span>
          <span class="font-bold">${fmt(g.target_amount)}</span>
        </div>
        ${!done&&daysLeft>0?`<p class="goal-daily">📌 Necesitas <strong>${fmt(daily)}/día</strong> para lograrlo</p>`:''}
        ${!done ? (() => { const proj = calcGoalProjection(g); return proj ? `<p class="goal-daily text-muted">📈 A tu ritmo actual: <strong>${proj.months} mes${proj.months!==1?'es':''}</strong> (${proj.date.toLocaleDateString('es-PE',{month:'short',year:'numeric'})})</p>` : ''; })() : ''}
        <div class="goal-actions">
          ${!done?`<button class="btn btn-primary btn-sm flex-1" style="background:${g.color}" onclick="openContribute('${g.id}','${g.name}')">+ Aportar</button>`:''}
          <button class="btn btn-sm btn-ghost" onclick="openEditGoal('${g.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteGoal('${g.id}')">🗑</button>
        </div>
      </div>`;
  }).join('');
}

function openContribute(id, name) {
  State.selectedGoalId = id;
  State.selectedGoalName = name;
  $('contribute-title').textContent = `Aportar a "${name}"`;
  $('contribute-amount').value = '';
  openOverlay('overlay-contribute');
}

async function deleteGoal(id) {
  if (!confirm('¿Eliminar esta meta?')) return;
  try { await Goals.remove(id); toast('Meta eliminada'); loadGoals(); }
  catch { toast('Error', 'error'); }
}

function openEditGoal(id) {
  const goal = Goals.getAll().find(g => g.id === id);
  if (!goal) return;

  // Configurar modal en modo edición
  $('goal-edit-id').value = id;
  $('goal-modal-title').textContent = 'Editar meta';
  $('btn-goal-submit').textContent = 'Guardar cambios';

  // Precargar valores
  $('goal-name').value    = goal.name;
  $('goal-target').value  = goal.target_amount;
  $('goal-current').value = goal.current_amount;
  $('goal-deadline').value = goal.deadline;

  // Precargar ícono y color
  goalSelectedIcon  = goal.icon  || '🎯';
  goalSelectedColor = goal.color || '#10B981';
  initGoalForm();   // re-renderiza los pickers con los valores correctos

  openOverlay('overlay-goal');
}

// ---- DEBTS PAGE ----
async function loadDebts() {
  const debts = await Debts.getAll();
  const total = debts.reduce((s,d)=>s+(d.total-d.paid),0);
  $('debts-summary').textContent = debts.length ? `Total pendiente: ${fmt(total)}` : '';

  const container = $('debts-list');
  if (!debts.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🎉</div>
      <p>Sin deudas registradas</p>
      <button class="btn btn-primary mt-3" onclick="$('btn-new-debt').click()">Registrar deuda</button>
    </div>`; return;
  }

  container.innerHTML = debts.map(d => {
    const pct = Math.min((d.paid/d.total)*100,100);
    const remaining = d.total - d.paid;
    const daysTo = Math.ceil((new Date(d.next_payment_date)-new Date())/86400000);
    const urgent = daysTo <= 3;
    return `
      <div class="debt-card ${urgent?'urgent':''}">
        <div class="debt-header">
          <div style="display:flex;align-items:center;gap:0.75rem">
            <div class="debt-icon">💳</div>
            <div>
              <p class="font-bold text-sm">${d.name}</p>
              <p class="text-muted text-xs">${d.paid_installments}/${d.installments} cuotas${d.interest_rate>0?` · ${d.interest_rate}% TEA`:''}</p>
            </div>
          </div>
          ${urgent?`<span class="debt-badge">${daysTo<=0?'Vencida':daysTo+'d'}</span>`:''}
        </div>
        <div class="goal-progress-bar"><div class="goal-progress-fill" style="width:${pct}%;background:var(--rose)"></div></div>
        <div class="goal-amounts">
          <span class="text-muted">Pagado: ${fmt(d.paid)}</span>
          <span style="color:var(--rose)" class="font-bold">Resta: ${fmt(remaining)}</span>
        </div>
        <p class="text-muted text-xs">Próximo pago: ${fmtDate(d.next_payment_date)}</p>
        <div class="debt-calc">
          <p class="text-xs font-bold text-muted">Calculadora de pago extra</p>
          <div style="display:flex;align-items:center;gap:0.5rem">
            <span class="text-muted text-xs">S/</span>
            <input type="number" class="input" style="height:32px;font-size:0.8rem" value="100"
              id="extra-${d.id}" placeholder="100" oninput="updateCalc('${d.id}',${JSON.stringify(d).replace(/'/g,"\\'")})" />
            <span class="text-muted text-xs">extra/mes</span>
          </div>
          <div id="calc-result-${d.id}" class="calc-result hidden"></div>
        </div>
        <div style="display:flex;gap:0.5rem;margin-top:0.25rem;">
          <button class="btn btn-primary btn-sm flex-1" onclick="openPayDebt('${d.id}','${d.name.replace(/'/g,"\\'")}',${d.total},${d.paid})">💳 Registrar pago</button>
          <button class="btn btn-danger btn-sm" onclick="deleteDebt('${d.id}')">🗑</button>
        </div>
      </div>`;
  }).join('');
}

function updateCalc(debtId, debt) {
  const extra = parseFloat($('extra-' + debtId)?.value) || 0;
  const result = $('calc-result-' + debtId);
  if (!result || extra <= 0) { result?.classList.add('hidden'); return; }
  const s = calcDebtSavings(debt, extra);
  result.classList.remove('hidden');
  result.innerHTML = s.interestSaved > 0
    ? `<p class="sim-result-title">Pagarías ${s.monthsSaved} meses antes</p>
       <p class="sim-result-detail">Ahorrarías <strong style="color:var(--emerald)">${fmt(s.interestSaved)}</strong> en intereses</p>`
    : `<p class="sim-result-detail">Terminarías en ${s.monthsToPayOff} meses</p>`;
}

async function deleteDebt(id) {
  if (!confirm('¿Eliminar esta deuda?')) return;
  try { await Debts.remove(id); toast('Deuda eliminada'); loadDebts(); }
  catch { toast('Error', 'error'); }
}

// ---- ACCOUNTS PAGE ----
function loadAccountsPage() {
  const accounts = Accounts.getAll();
  const allTxs   = lsGet('cf_transactions', []);
  const cats     = lsGet('cf_categories', []);

  // Total entre todas las cuentas
  const totalBal = accounts.reduce((s, a) => s + Accounts.getBalance(a.id), 0);
  $('accounts-total-label').textContent = `Saldo total: ${fmt(totalBal)}`;

  const container = $('accounts-page-list');
  if (!accounts.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">💳</div><p>No tienes cuentas aún</p></div>`;
    return;
  }

  container.innerHTML = accounts.map(acc => {
    const bal  = Accounts.getBalance(acc.id);
    // Últimas 5 transacciones de esta cuenta (por account_id o transferencias)
    const txs  = allTxs
      .filter(t => t.account_id === acc.id || t.from_account === acc.id || t.to_account === acc.id)
      .sort((a,b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
      .slice(0, 5)
      .map(t => ({ ...t, category: cats.find(c => c.id === t.category_id) ?? null }));

    const txRows = txs.length ? txs.map(t => {
      const sign = t.account_id === acc.id
        ? (t.type === 'income' ? '+' : '-')
        : (t.to_account === acc.id ? '+' : '-');
      const color = sign === '+' ? 'var(--emerald)' : 'var(--rose)';
      return `<div style="display:flex;align-items:center;gap:0.5rem;padding:0.3rem 0;border-bottom:1px solid var(--border);font-size:0.82rem;">
        <span style="width:22px;text-align:center;">${t.category?.icon ?? (t.type==='transfer'?'↔️':'💸')}</span>
        <span style="flex:1;color:var(--text-muted);">${t.category?.name ?? (t.type==='transfer'?'Transferencia':'Sin categoría')}${t.note?' · '+t.note:''}</span>
        <span style="font-family:monospace;font-weight:700;color:${color};">${sign}${fmt(t.amount,true)}</span>
        <span style="color:var(--text-muted);font-size:0.7rem;white-space:nowrap;">${fmtDate(t.date)}</span>
      </div>`;
    }).join('') : `<p class="text-muted text-sm" style="padding:0.5rem 0;">Sin movimientos vinculados</p>`;

    return `
    <div class="card" style="margin-bottom:0.75rem;">
      <div class="card-body">
        <!-- Cabecera cuenta -->
        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;">
          <div style="width:44px;height:44px;border-radius:14px;background:${acc.color}20;display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0;">${acc.icon}</div>
          <div style="flex:1;">
            <p style="font-weight:700;">${acc.name}</p>
            <p style="font-size:1.1rem;font-family:monospace;font-weight:800;color:${bal>=0?acc.color:'var(--rose)'};">${fmt(bal)}</p>
          </div>
          <div style="display:flex;gap:0.4rem;">
            <button class="btn btn-sm btn-ghost" onclick="openEditAccountPage('${acc.id}')">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="deleteAccountPage('${acc.id}')">🗑</button>
          </div>
        </div>
        <!-- Últimos movimientos -->
        <p style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:0.25rem;">Últimos movimientos</p>
        ${txRows}
        ${txs.length >= 5 ? `<button class="btn btn-sm btn-ghost btn-full" style="margin-top:0.4rem;font-size:0.75rem;" onclick="filterTxByAccount('${acc.id}')">Ver todos →</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function openEditAccountPage(id) {
  // Reutilizamos el modal de cuentas existente enfocándonos en la edición
  openAccountsModal();
  // Pequeño delay para que el modal esté en DOM y podamos hacer scroll al item
  setTimeout(() => {
    const editBtn = document.querySelector(`.acc-edit-btn[data-id="${id}"]`);
    if (editBtn) { editBtn.click(); editBtn.scrollIntoView({ behavior:'smooth', block:'center' }); }
  }, 100);
}

function deleteAccountPage(id) {
  if (!confirm('¿Eliminar esta cuenta? Las transacciones vinculadas no se eliminarán.')) return;
  Accounts.remove(id);
  toast('Cuenta eliminada', 'success');
  loadAccountsPage();
}

function filterTxByAccount(accId) {
  // Navegar a movimientos y poner filtro de la cuenta en el buscador
  navigate('transactions');
  setTimeout(() => {
    const acc = Accounts.getAll().find(a => a.id === accId);
    if (acc) {
      State.txSearch = acc.name;
      $('tx-search').value = acc.name;
      renderTransactionsPage(State.transactions);
    }
  }, 200);
}

function openPayDebt(id, name, total, paid) {
  State.selectedDebtId   = id;
  State.selectedDebtName = name;
  $('pay-debt-title').textContent = `Pagar: ${name}`;
  const remaining = total - paid;
  $('pay-debt-info').textContent  = `Pendiente: ${fmt(remaining)} de ${fmt(total)}`;
  $('pay-debt-amount').value      = '';
  openOverlay('overlay-pay-debt');
}

// ---- CALENDAR PAGE ----
async function loadCalendar() {
  $('cal-month-label').textContent = fmtMonth(State.calMonth);
  const txs = await Transactions.getByMonth(State.calMonth);
  renderCalendar(txs);
}

function renderCalendar(txs) {
  const [y,m] = State.calMonth.split('-').map(Number);
  const firstDay = new Date(y, m-1, 1);
  const lastDay = new Date(y, m, 0);

  // Calcular inicio del grid (lunes)
  let start = new Date(firstDay);
  start.setDate(start.getDate() - (start.getDay()===0?6:start.getDay()-1));

  const dailyExp = {};
  txs.filter(t=>t.type==='expense').forEach(t => dailyExp[t.date]=(dailyExp[t.date]||0)+t.amount);
  const maxDay = Math.max(...Object.values(dailyExp), 1);

  const grid = $('calendar-grid');
  const dayNames = ['Lu','Ma','Mi','Ju','Vi','Sá','Do'];

  let html = dayNames.map(d=>`<div class="cal-header"><div class="cal-day-name">${d}</div></div>`).join('');

  const cur = new Date(start);
  const todayStr = today();

  while (cur <= lastDay || cur.getDay() !== 1) {
    const dateStr = cur.toISOString().split('T')[0];
    const isCurrentMonth = cur.getMonth() === m-1;
    const isToday = dateStr === todayStr;
    const amount = dailyExp[dateStr] || 0;
    const ratio = amount / maxDay;
    const level = amount === 0 ? 0 : ratio < 0.3 ? 1 : ratio < 0.6 ? 2 : ratio < 0.85 ? 3 : 4;

    html += `<div class="cal-cell level-${level} ${!isCurrentMonth?'other-month':''} ${isToday?'today':''}"
      data-date="${dateStr}" onclick="selectCalDay('${dateStr}', ${JSON.stringify(txs.filter(t=>t.date===dateStr))})">
      <span class="cal-day-num">${cur.getDate()}</span>
      ${amount>0?`<span class="cal-amount">${fmt(amount,true)}</span>`:''}
    </div>`;

    cur.setDate(cur.getDate()+1);
    if (cur > lastDay && cur.getDay() === 1) break;
  }

  grid.innerHTML = html;
}

function selectCalDay(dateStr, txs) {
  document.querySelectorAll('.cal-cell').forEach(c=>c.classList.remove('selected'));
  const cell = document.querySelector(`[data-date="${dateStr}"]`);
  if (cell) cell.classList.add('selected');

  const detail = $('cal-day-detail');
  if (!txs.length) { detail.classList.add('hidden'); return; }

  const d = new Date(dateStr+'T00:00:00');
  $('cal-day-title').textContent = d.toLocaleDateString('es-PE',{weekday:'long',day:'numeric',month:'long'});
  const total = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  $('cal-day-total').textContent = total>0 ? `-${fmt(total)}` : '';
  renderTxList($('cal-day-transactions'), txs);
  detail.classList.remove('hidden');
}

// ---- INSIGHTS PAGE ----
// ---- PRESUPUESTOS ----
function renderBudgetsList(txs, cats, budgets) {
  const container = $('budgets-list');
  if (!budgets.length) {
    container.innerHTML = '<p class="text-muted text-sm">Sin presupuestos. Haz clic en "Editar" para configurar.</p>';
    return;
  }
  const expCats = cats.filter(c => c.type === 'expense');
  container.innerHTML = budgets.map(b => {
    const cat = expCats.find(c => c.id === b.category_id);
    if (!cat) return '';
    const spent = txs.filter(t => t.type === 'expense' && t.category_id === b.category_id)
                     .reduce((s, t) => s + t.amount, 0);
    const pct = Math.min((spent / b.monthly_limit) * 100, 100);
    const over = spent > b.monthly_limit;
    const warn = pct >= 80 && !over;
    const color = over ? 'var(--rose)' : warn ? 'var(--amber)' : 'var(--emerald)';
    const remaining = b.monthly_limit - spent;
    return `
      <div style="display:flex;flex-direction:column;gap:0.4rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:600;">${cat.icon} ${cat.name}</span>
          <span style="font-size:0.8rem;color:${color};">
            ${over ? '⚠️ Excedido ' : ''}${fmt(spent)} / ${fmt(b.monthly_limit)}
          </span>
        </div>
        <div style="background:var(--bg-secondary);border-radius:99px;height:8px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${color};border-radius:99px;transition:width 0.4s;"></div>
        </div>
        <span style="font-size:0.75rem;color:var(--text-muted);">
          ${over ? fmt(Math.abs(remaining)) + ' sobre el límite' : fmt(remaining) + ' disponible'}
        </span>
      </div>`;
  }).join('<hr style="border-color:var(--border);margin:0.25rem 0;">');
}

function openBudgetsModal(cats, budgets) {
  const expCats = cats.filter(c => c.type === 'expense');
  $('budgets-form-list').innerHTML = expCats.map(cat => {
    const existing = budgets.find(b => b.category_id === cat.id);
    return `
      <div style="display:flex;align-items:center;gap:0.75rem;">
        <span style="font-size:1.25rem;width:2rem;text-align:center;">${cat.icon}</span>
        <span style="flex:1;font-size:0.9rem;">${cat.name}</span>
        <div style="display:flex;align-items:center;gap:0.4rem;">
          <span style="color:var(--text-muted);font-size:0.85rem;">${CURRENCY_SYMBOL}</span>
          <input type="number" class="input budget-input" data-catid="${cat.id}"
            value="${existing ? existing.monthly_limit : ''}"
            placeholder="0" min="0" step="1"
            style="width:90px;padding:0.4rem 0.5rem;font-size:0.85rem;text-align:right;" />
        </div>
      </div>`;
  }).join('');
  openOverlay('overlay-budgets');
}

async function loadInsights() {
  $('insights-month-label').textContent = fmtMonth(State.currentMonth);

  const [txs, cats, prevTxs] = await Promise.all([
    Transactions.getByMonth(State.currentMonth),
    Categories.getAll(),
    Transactions.getByMonth(getPrevMonth(State.currentMonth))
  ]);
  State.transactions = txs;
  State.categories   = cats;

  // Presupuestos
  const budgets = Budgets.getAll(State.currentMonth);
  renderBudgetsList(txs, cats, budgets);

  // Score (bug fix: Streaks.get() no recibe argumento)
  const streak = Streaks.get();
  const score  = calcScore(txs, Goals.getAll(), budgets, streak);
  renderScore(score);

  // Proyección
  const proj = projectEndOfMonth(txs);
  $('proj-expenses').textContent    = fmt(proj.projectedExpenses);
  $('proj-savings').textContent     = fmt(Math.abs(proj.projectedSavings)) + (proj.projectedSavings < 0 ? ' (déficit)' : '');
  $('proj-savings-card').className  = 'stat-card ' + (proj.projectedSavings >= 0 ? 'savings' : 'expense');
  $('proj-confidence').textContent  = `Confianza: ${proj.confidence} (${new Date().getDate()} días de datos)`;

  // Gráfico semanal
  renderWeeklyChart(txs);

  // Simulador
  renderSimCategories(cats, txs);

  // Insights — bug fix: se pasan los budgets para activar esas reglas
  const insights = generateInsights(txs, prevTxs, cats, budgets);
  renderInsights($('all-insights'), insights);
}

function renderScore(score) {
  const color = score.total>=80?'#10B981':score.total>=60?'#F59E0B':'#F43F5E';
  const arc = $('score-arc');
  const circumference = 251.2;
  arc.style.strokeDashoffset = circumference - (score.total / 100) * circumference;
  arc.style.stroke = color;

  $('score-grade').textContent = score.grade;
  $('score-grade').style.color = color;
  $('score-value').textContent = `${score.total}/100`;
  $('score-message').textContent = score.message;

  const breakdown = $('score-breakdown');
  breakdown.innerHTML = [
    {label:'Ahorro', val:score.breakdown.savings, max:40},
    {label:'Consistencia', val:score.breakdown.consistency, max:25},
    {label:'Presupuestos', val:score.breakdown.budgets, max:20},
    {label:'Metas', val:score.breakdown.goals, max:15},
  ].map(item=>`
    <div class="score-row">
      <div class="score-row-header">
        <span class="text-muted text-xs">${item.label}</span>
        <span class="text-xs font-mono">${item.val}/${item.max}</span>
      </div>
      <div class="score-bar-bg">
        <div class="score-bar-fill" style="width:${(item.val/item.max)*100}%"></div>
      </div>
    </div>`).join('');
}

function renderWeeklyChart(txs) {
  const ctx = $('chart-weekly').getContext('2d');
  if (State.charts.weekly) State.charts.weekly.destroy();

  // Agrupar por semana del mes (1–5)
  const weeks = {};
  for (let w = 1; w <= 5; w++) weeks[w] = { income: 0, expenses: 0 };
  txs.forEach(t => {
    const w = Math.min(Math.ceil(new Date(t.date + 'T00:00:00').getDate() / 7), 5);
    if (t.type === 'income')  weeks[w].income   += t.amount;
    if (t.type === 'expense') weeks[w].expenses += t.amount;
  });

  // Quitar semanas vacías al final
  const usedWeeks = Object.entries(weeks).filter(([,v]) => v.income > 0 || v.expenses > 0);
  if (!usedWeeks.length) {
    $('chart-weekly').parentElement.innerHTML +=
      '<p class="text-muted text-sm text-center" style="margin-top:-0.5rem;padding-bottom:0.5rem;">Sin datos este mes</p>';
    return;
  }

  // Color del grid adaptado al tema
  const isDark = document.documentElement.dataset.theme !== 'light';
  const gridColor  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const tickColor  = isDark ? '#71717a' : '#6B6B80';

  const labels = usedWeeks.map(([w]) => `Sem ${w}`);
  State.charts.weekly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Ingresos', data: usedWeeks.map(([,v]) => v.income),   backgroundColor: 'rgba(16,185,129,0.75)', borderRadius: 6 },
        { label: 'Gastos',   data: usedWeeks.map(([,v]) => v.expenses), backgroundColor: 'rgba(244,63,94,0.75)',  borderRadius: 6 }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: tickColor, font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: tickColor }, grid: { display: false } },
        y: { ticks: { color: tickColor, callback: v => fmt(v, true) }, grid: { color: gridColor } }
      }
    }
  });
}

function renderSimCategories(cats, txs) {
  const container = $('sim-categories');
  const expCats = cats.filter(c=>c.type!=='income');
  container.innerHTML = expCats.map(c=>`
    <button class="filter-btn" data-catid="${c.id}"
      onclick="selectSimCategory('${c.id}','${c.name}')" style="font-size:0.75rem">
      ${c.icon} ${c.name}
    </button>`).join('');
}

function selectSimCategory(id, name) {
  State.simCategoryId = id;
  document.querySelectorAll('#sim-categories .filter-btn').forEach(b=>b.classList.toggle('active', b.dataset.catid===id));
  $('sim-controls').classList.remove('hidden');
  updateSimResult();
}

function updateSimResult() {
  if (!State.simCategoryId) return;
  const pct = parseInt($('sim-slider').value);
  $('sim-label').textContent = `Reducir un ${pct}%`;
  const sim    = simulateSavings(State.transactions, State.simCategoryId, pct);
  const result = $('sim-result');
  result.classList.remove('hidden');
  if (sim.currentMonthly <= 0) {
    result.innerHTML = `<p class="sim-result-detail text-muted">Sin gastos en esta categoría este mes.</p>`;
  } else if (sim.monthlySavings > 0) {
    result.innerHTML = `
      <p class="sim-result-title">Ahorro mensual: <strong style="color:var(--emerald)">${fmt(sim.monthlySavings)}</strong></p>
      <p class="sim-result-detail">Ahorro anual: <strong>${fmt(sim.yearlySavings)}</strong></p>
      <p class="sim-result-detail">Gasto actual: <s>${fmt(sim.currentMonthly)}</s> → ${fmt(sim.reducedMonthly)}</p>`;
  } else {
    result.innerHTML = `<p class="sim-result-detail text-muted">Ajusta el porcentaje para ver proyección.</p>`;
  }
}

// ---- LOGROS ----
function checkAchievements() {
  const txs = lsGet('cf_transactions', []);
  const goals = Goals.getAll();
  const streak = Streaks.get();

  const unlock = (type, label, icon) => {
    const all = Achievements.getAll();
    if (!all.includes(type)) {
      Achievements.unlock(type);
      setTimeout(() => toast(`🏆 Logro desbloqueado: ${icon} ${label}`, 'success'), 400);
    }
  };

  if (txs.length >= 1)                       unlock('first_transaction', 'Primer registro',    '📝');
  if (goals.length >= 1)                     unlock('first_goal',        'Primera meta',        '🎯');
  if (streak.current_streak >= 7)            unlock('streak_7',          'Racha 7 días',        '🔥');
  if (streak.current_streak >= 30)           unlock('streak_30',         'Racha 30 días',       '💥');
  if (streak.current_streak >= 100)          unlock('streak_100',        '100 días',            '⚡');
  if (goals.some(g => g.current_amount >= g.target_amount)) unlock('goal_completed', 'Meta lograda', '🏆');

  // Ahorrador élite: tasa de ahorro > 25% este mes
  const month = State.currentMonth;
  const monthTxs = lsGet('cf_transactions', []).filter(t => t.date?.startsWith(month));
  const income   = monthTxs.filter(t => t.type === 'income').reduce((s,t) => s+t.amount, 0);
  const expenses = monthTxs.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0);
  if (income > 0 && (income - expenses) / income >= 0.25) unlock('savings_25', 'Ahorrador élite', '💎');
}

// ---- NOTIFICACIONES ----
function setupNotifications() {
  const enabled = localStorage.getItem('cf_notif_enabled') === 'true';
  const time    = localStorage.getItem('cf_notif_time') || '20:00';
  const toggle  = $('toggle-notif');
  const timeRow = $('notif-time-row');
  const timeIn  = $('notif-time');

  toggle.classList.toggle('active', enabled);
  timeRow.classList.toggle('hidden', !enabled);
  timeIn.value = time;

  toggle.addEventListener('click', async () => {
    const nowEnabled = toggle.classList.contains('active');
    if (!nowEnabled) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('Permiso de notificaciones denegado', 'error'); return; }
      toggle.classList.add('active');
      timeRow.classList.remove('hidden');
      localStorage.setItem('cf_notif_enabled', 'true');
      toast('Recordatorio activado ✓', 'success');
      scheduleReminder();
    } else {
      toggle.classList.remove('active');
      timeRow.classList.add('hidden');
      localStorage.setItem('cf_notif_enabled', 'false');
      toast('Recordatorio desactivado', '');
    }
  });

  timeIn.addEventListener('change', () => {
    localStorage.setItem('cf_notif_time', timeIn.value);
    if (localStorage.getItem('cf_notif_enabled') === 'true') scheduleReminder();
    toast(`Recordatorio a las ${timeIn.value} ✓`, 'success');
  });

  if (enabled) scheduleReminder();
}

function scheduleReminder() {
  const time   = localStorage.getItem('cf_notif_time') || '20:00';
  const [h, m] = time.split(':').map(Number);
  const now    = new Date();
  const fire   = new Date();
  fire.setHours(h, m, 0, 0);
  if (fire <= now) fire.setDate(fire.getDate() + 1);
  const delay  = fire - now;

  clearTimeout(window._reminderTimer);
  window._reminderTimer = setTimeout(() => {
    const today = new Date().toISOString().split('T')[0];
    const loggedToday = lsGet('cf_transactions', []).some(t => t.date === today);
    if (!loggedToday && Notification.permission === 'granted') {
      new Notification('💰 Coach Finanzas', {
        body: '¿Registraste tus gastos de hoy? Solo toma 3 segundos.',
        icon: 'https://placehold.co/192x192/10B981/ffffff?text=💰',
        tag: 'daily-reminder'
      });
    }
    scheduleReminder(); // reprogramar para mañana
  }, delay);
}

// ---- EXPORTAR CSV ----
function exportCSV() {
  const txs  = lsGet('cf_transactions', []);
  const cats = lsGet('cf_categories', []);
  if (!txs.length) { toast('No hay transacciones para exportar', 'error'); return; }

  const header = ['Fecha','Tipo','Categoría','Monto','Nota'];
  const rows = txs.map(t => {
    const cat = cats.find(c => c.id === t.category_id);
    return [
      t.date,
      t.type === 'expense' ? 'Gasto' : 'Ingreso',
      cat?.name ?? '-',
      t.amount.toFixed(2),
      (t.note || '').replace(/,/g, ';')
    ].join(',');
  });

  const csv   = [header.join(','), ...rows].join('\n');
  const blob  = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `finanzas_${State.currentMonth}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Descarga iniciada ✓', 'success');
}

// ---- ACCOUNTS ----
function renderAccountsCard() {
  const accounts = Accounts.getAll();
  const container = $('dash-accounts-list');
  container.innerHTML = accounts.map(acc => {
    const bal = Accounts.getBalance(acc.id);
    return `
      <div style="flex-shrink:0;background:${acc.color}18;border:1px solid ${acc.color}40;border-radius:14px;padding:0.75rem 1rem;min-width:110px;text-align:center;">
        <div style="font-size:1.5rem;">${acc.icon}</div>
        <p style="font-size:0.75rem;font-weight:600;margin:4px 0 2px;">${acc.name}</p>
        <p style="font-size:0.85rem;font-family:monospace;color:${acc.color};font-weight:700;">${fmt(bal)}</p>
      </div>`;
  }).join('');
}

function openAccountsModal() {
  renderAccountsList();
  // Color picker
  const picker = $('acc-color-picker');
  let selColor = '#10B981';
  picker.innerHTML = ['#10B981','#3B82F6','#8B5CF6','#F59E0B','#EC4899','#06B6D4','#EF4444','#F97316'].map(c => `
    <button type="button" class="cat-color-opt" data-color="${c}"
      style="width:26px;height:26px;border-radius:50%;background:${c};border:2px solid ${c === selColor ? 'white' : 'transparent'};"></button>`
  ).join('');
  picker.querySelectorAll('.cat-color-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      selColor = btn.dataset.color;
      picker.querySelectorAll('.cat-color-opt').forEach(b =>
        b.style.borderColor = b.dataset.color === selColor ? 'white' : 'transparent'
      );
    });
  });
  $('form-account').onsubmit = e => {
    e.preventDefault();
    const name = $('acc-name').value.trim();
    if (!name) return;
    Accounts.add({
      name,
      icon:            $('acc-icon').value.trim() || '💼',
      color:           selColor,
      initial_balance: parseFloat($('acc-balance').value) || 0
    });
    $('form-account').reset();
    renderAccountsList();
    renderAccountsCard();
    toast('Cuenta agregada ✓', 'success');
  };
  openOverlay('overlay-accounts');
}

const ACC_COLORS = ['#10B981','#3B82F6','#8B5CF6','#F59E0B','#EC4899','#06B6D4','#EF4444','#F97316'];

function renderAccountsList() {
  const accs = Accounts.getAll();
  const container = $('accounts-list');
  container.innerHTML = '';

  accs.forEach(acc => {
    const bal = Accounts.getBalance(acc.id);

    // Fila principal
    const row = document.createElement('div');
    row.className = 'acc-item';
    row.innerHTML = `
      <div style="width:38px;height:38px;border-radius:12px;background:${acc.color}20;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">${acc.icon}</div>
      <div style="flex:1;min-width:0;">
        <p style="font-size:0.875rem;font-weight:600;">${acc.name}</p>
        <p style="font-size:0.75rem;color:${acc.color};font-family:monospace;">${fmt(bal)}</p>
      </div>
      <button class="btn btn-sm btn-ghost acc-edit-btn" data-id="${acc.id}" title="Editar" style="color:var(--text-muted);padding:0.3rem 0.5rem;">✏️</button>
      <button class="btn btn-sm btn-danger acc-del-btn" data-id="${acc.id}" title="Eliminar" style="padding:0.3rem 0.5rem;">✕</button>`;

    // Form de edición (oculto por defecto)
    const editForm = document.createElement('div');
    editForm.className = 'acc-edit-form hidden';
    editForm.dataset.id = acc.id;
    editForm.innerHTML = `
      <div style="display:flex;gap:0.5rem;">
        <input class="input acc-ef-icon" style="width:52px;font-size:1.3rem;text-align:center;" value="${acc.icon}" maxlength="2" placeholder="💵"/>
        <input class="input acc-ef-name" style="flex:1;" value="${acc.name}" maxlength="20" placeholder="Nombre"/>
      </div>
      <div style="display:flex;gap:0.5rem;align-items:center;">
        <label style="font-size:0.8rem;color:var(--text-muted);white-space:nowrap;">Saldo base (S/)</label>
        <input type="number" class="input acc-ef-balance" style="flex:1;" value="${acc.initial_balance ?? 0}" min="0" step="0.01"/>
      </div>
      <div class="acc-edit-colors">
        ${ACC_COLORS.map(c => `<button type="button" class="acc-ef-color" data-color="${c}"
          style="width:26px;height:26px;border-radius:50%;background:${c};border:2px solid ${c === acc.color ? 'white':'transparent'};cursor:pointer;transition:transform .1s;"></button>`).join('')}
      </div>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn btn-primary btn-sm acc-ef-save" data-id="${acc.id}" style="flex:1;">Guardar</button>
        <button class="btn btn-sm btn-outline acc-ef-cancel" style="flex:1;">Cancelar</button>
      </div>`;

    container.appendChild(row);
    container.appendChild(editForm);

    // Toggle edición
    row.querySelector('.acc-edit-btn').addEventListener('click', () => {
      editForm.classList.toggle('hidden');
    });

    // Eliminar
    row.querySelector('.acc-del-btn').addEventListener('click', () => {
      if (confirm(`¿Eliminar "${acc.name}"?`)) {
        Accounts.remove(acc.id);
        renderAccountsList();
        renderAccountsCard();
        toast('Cuenta eliminada', '');
      }
    });

    // Color en form de edición
    let editColor = acc.color;
    editForm.querySelectorAll('.acc-ef-color').forEach(btn => {
      btn.addEventListener('click', () => {
        editColor = btn.dataset.color;
        editForm.querySelectorAll('.acc-ef-color').forEach(b =>
          b.style.borderColor = b.dataset.color === editColor ? 'white' : 'transparent'
        );
      });
    });

    // Guardar edición
    editForm.querySelector('.acc-ef-save').addEventListener('click', () => {
      const newName    = editForm.querySelector('.acc-ef-name').value.trim();
      const newIcon    = editForm.querySelector('.acc-ef-icon').value.trim() || '💼';
      const newBalance = parseFloat(editForm.querySelector('.acc-ef-balance').value) || 0;
      if (!newName) return;
      Accounts.update(acc.id, { name: newName, icon: newIcon, color: editColor, initial_balance: newBalance });
      renderAccountsList();
      renderAccountsCard();
      toast('Cuenta actualizada ✓', 'success');
    });

    // Cancelar edición
    editForm.querySelector('.acc-ef-cancel').addEventListener('click', () => {
      editForm.classList.add('hidden');
    });
  });
}

// ---- DASH BUDGETS ----
function renderDashBudgets(txs, cats, budgets) {
  const container = $('dash-budgets-list');
  const toShow = budgets.slice(0, 5);
  container.innerHTML = toShow.map(b => {
    const cat = cats.find(c => c.id === b.category_id);
    if (!cat) return '';
    const spent = txs.filter(t => t.type === 'expense' && t.category_id === b.category_id)
                     .reduce((s, t) => s + t.amount, 0);
    const pct   = Math.min((spent / b.monthly_limit) * 100, 100);
    const over  = spent > b.monthly_limit;
    const warn  = pct >= 80 && !over;
    const color = over ? 'var(--rose)' : warn ? 'var(--amber)' : 'var(--emerald)';
    const emoji = over ? '🔴' : warn ? '🟡' : '🟢';
    return `
      <div style="padding:0.45rem 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-size:0.85rem;">${emoji} ${cat.icon} ${cat.name}</span>
          <span style="font-size:0.75rem;color:${color};font-family:monospace;">
            ${fmt(spent,true)} / ${fmt(b.monthly_limit,true)}
          </span>
        </div>
        <div style="background:var(--bg-secondary);border-radius:99px;height:5px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${color};border-radius:99px;transition:width 0.4s;"></div>
        </div>
      </div>`;
  }).join('');
  if (budgets.length > 5) {
    container.innerHTML += `<p class="text-muted text-xs text-center" style="padding-top:0.3rem;">+${budgets.length - 5} más en Análisis</p>`;
  }
}

// ---- REPORTS PAGE ----
let _reportRange = 6;

async function loadReports() {
  // Filtros de rango
  const filterBtns = document.querySelectorAll('[data-range]');
  filterBtns.forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.range) === _reportRange);
    btn.onclick = () => {
      _reportRange = parseInt(btn.dataset.range);
      filterBtns.forEach(b => b.classList.toggle('active', b === btn));
      renderReports();
    };
  });
  renderReports();
}

async function renderReports() {
  const n = _reportRange;
  const months = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }

  $('report-range-label').textContent =
    `${fmtMonth(months[0])} – ${fmtMonth(months[months.length - 1])}`;

  const monthsData = await Promise.all(months.map(m => Transactions.getByMonth(m)));
  const cats = Categories.getAll();

  const labels      = months.map(m => {
    const [y, mo] = m.split('-');
    return new Date(y, mo - 1, 1).toLocaleDateString('es-PE', { month: 'short', year:'2-digit' });
  });
  const incomeData  = monthsData.map(txs => txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0));
  const expenseData = monthsData.map(txs => txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0));
  const savingsData = monthsData.map((_, i) => Math.max(0, incomeData[i] - expenseData[i]));

  // Chart: barras ingresos vs gastos
  const ctx = $('chart-monthly').getContext('2d');
  if (State.charts.monthly) State.charts.monthly.destroy();
  State.charts.monthly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Ingresos',  data: incomeData,  backgroundColor: 'rgba(16,185,129,0.75)', borderRadius: 5 },
        { label: 'Gastos',    data: expenseData, backgroundColor: 'rgba(244,63,94,0.75)',  borderRadius: 5 },
      ]
    },
    options: {
      plugins: { legend: { labels: { color: '#71717a', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#71717a', font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#71717a', callback: v => fmt(v, true) }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });

  // Chart: tendencia ahorro
  const ctx2 = $('chart-savings-trend').getContext('2d');
  if (State.charts.savingsTrend) State.charts.savingsTrend.destroy();
  State.charts.savingsTrend = new Chart(ctx2, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Ahorro', data: savingsData,
        borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.15)',
        fill: true, tension: 0.4, pointRadius: 4, borderWidth: 2,
        pointBackgroundColor: '#3B82F6'
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#71717a', font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#71717a', callback: v => fmt(v, true) }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });

  // Resumen del periodo
  const totalIncome   = incomeData.reduce((s, v) => s + v, 0);
  const totalExpenses = expenseData.reduce((s, v) => s + v, 0);
  const totalSavings  = totalIncome - totalExpenses;
  const avgExpense    = totalExpenses / n;
  const nonZeroExp    = expenseData.filter(v => v > 0);
  const bestIdx       = expenseData.indexOf(Math.min(...(nonZeroExp.length ? nonZeroExp : [0])));
  const worstIdx      = expenseData.indexOf(Math.max(...expenseData));

  $('report-summary').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:0.75rem;">
      <div class="stat-card income" style="padding:0.75rem;">
        <p class="stat-label">Ingresos totales</p>
        <p class="stat-value" style="font-size:1rem;">${fmt(totalIncome, true)}</p>
      </div>
      <div class="stat-card expense" style="padding:0.75rem;">
        <p class="stat-label">Gastos totales</p>
        <p class="stat-value" style="font-size:1rem;">${fmt(totalExpenses, true)}</p>
      </div>
      <div class="stat-card ${totalSavings >= 0 ? 'savings' : 'expense'}" style="padding:0.75rem;">
        <p class="stat-label">Ahorro total</p>
        <p class="stat-value" style="font-size:1rem;">
          ${totalSavings < 0 ? '-' : ''}${fmt(Math.abs(totalSavings), true)}
          ${totalSavings < 0 ? '<small style="font-size:0.65rem;display:block;">déficit</small>' : ''}
        </p>
      </div>
      <div class="stat-card" style="padding:0.75rem;background:var(--bg-secondary);">
        <p class="stat-label">Gasto promedio/mes</p>
        <p class="stat-value" style="font-size:1rem;">${fmt(avgExpense, true)}</p>
      </div>
    </div>
    ${nonZeroExp.length && bestIdx >= 0 ? `<p class="text-muted text-xs">✅ Mes más económico: <strong style="color:var(--emerald)">${fmtMonth(months[bestIdx])}</strong></p>` : ''}
    ${expenseData.some(v => v > 0) ? `<p class="text-muted text-xs">⚠️ Mes con más gastos: <strong style="color:var(--rose)">${fmtMonth(months[worstIdx])}</strong></p>` : ''}`;

  // Top categorías
  const allTxs = monthsData.flat();
  const byCat  = {};
  allTxs.filter(t => t.type === 'expense').forEach(t => {
    if (t.category_id) byCat[t.category_id] = (byCat[t.category_id] || 0) + t.amount;
  });
  const totalCatExp = Object.values(byCat).reduce((s, v) => s + v, 0);
  const topCats     = Object.entries(byCat).sort(([, a], [, b]) => b - a).slice(0, 6);

  $('report-top-cats').innerHTML = topCats.length ? topCats.map(([id, amount]) => {
    const cat   = cats.find(c => c.id === id);
    const pct   = totalCatExp > 0 ? ((amount / totalCatExp) * 100).toFixed(0) : 0;
    const color = cat?.color ?? '#6B7280';
    return `
      <div style="padding:0.45rem 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-size:0.875rem;">${cat?.icon ?? '💸'} ${cat?.name ?? 'Otros'}</span>
          <span style="font-size:0.8rem;color:${color};font-weight:600;">${fmt(amount, true)} · ${pct}%</span>
        </div>
        <div style="background:var(--bg-secondary);border-radius:99px;height:6px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${color};border-radius:99px;"></div>
        </div>
      </div>`;
  }).join('') : '<p class="text-muted text-sm">Sin gastos en el periodo</p>';
}

// ---- EXPORTAR PDF ----
async function exportPDF() {
  const txs     = Transactions.getByMonth(State.currentMonth);
  const cats    = Categories.getAll();
  const budgets = Budgets.getAll(State.currentMonth);
  const profile = Profiles.get();
  const { income, expenses, savings } = calcMonthStats(txs);
  const monthLabel = fmtMonth(State.currentMonth);

  // --- Presupuestos ---
  const budgetRows = budgets.map(b => {
    const cat  = cats.find(c => c.id === b.category_id);
    if (!cat) return '';
    const spent = txs.filter(t => t.type === 'expense' && t.category_id === b.category_id)
                     .reduce((s, t) => s + t.amount, 0);
    const pct   = Math.min((spent / b.monthly_limit) * 100, 100).toFixed(0);
    const over  = spent > b.monthly_limit;
    const color = over ? '#E11D48' : pct >= 80 ? '#D97706' : '#059669';
    return `<div class="pr-budget-row">
        <span>${cat.icon} ${cat.name}</span>
        <span style="color:${color};font-weight:600;">${fmt(spent)} / ${fmt(b.monthly_limit)}</span>
      </div>
      <div class="pr-budget-bar-bg"><div class="pr-budget-bar" style="width:${pct}%;background:${color};"></div></div>`;
  }).join('');

  // --- Top categorías ---
  const byCat = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    if (t.category_id) byCat[t.category_id] = (byCat[t.category_id] || 0) + t.amount;
  });
  const topCats = Object.entries(byCat).sort(([, a], [, b]) => b - a).slice(0, 8);
  const catRows = topCats.map(([id, amount]) => {
    const cat = cats.find(c => c.id === id);
    return `<div class="pr-cat-row"><span>${cat?.icon ?? ''} ${cat?.name ?? 'Otros'}</span><span style="color:#E11D48;font-weight:600;">-${fmt(amount)}</span></div>`;
  }).join('');

  // --- Transacciones ---
  const groups = {};
  txs.forEach(t => { groups[t.date] = groups[t.date] || []; groups[t.date].push(t); });
  const txRows = Object.entries(groups).sort(([a], [b]) => b.localeCompare(a)).map(([date, items]) => {
    const dLabel = new Date(date + 'T00:00:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
    const rows = items.map(t => {
      const cat  = cats.find(c => c.id === t.category_id);
      const sign = t.type === 'expense' ? '-' : t.type === 'income' ? '+' : '↔';
      const col  = t.type === 'expense' ? '#E11D48' : t.type === 'income' ? '#059669' : '#7C3AED';
      return `<div class="pr-tx-row"><span>${cat?.icon ?? ''}${cat?.name ?? (t.type === 'transfer' ? 'Transferencia' : 'Sin categoría')}${t.note ? ` · ${t.note}` : ''}</span><span style="color:${col};font-weight:600;">${sign}${fmt(t.amount)}</span></div>`;
    }).join('');
    return `<div class="pr-tx-group"><div class="pr-tx-date">${dLabel}</div>${rows}</div>`;
  }).join('');

  // --- Estilos del reporte (inline, sin dependencias externas) ---
  const css = `
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;background:#fff;padding:2rem;}
    .pr-page{max-width:700px;margin:0 auto;}
    .pr-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:1rem;border-bottom:3px solid #10B981;margin-bottom:1.5rem;}
    .pr-logo{font-size:1.4rem;font-weight:800;color:#10B981;}
    .pr-logo small{display:block;font-size:0.8rem;color:#777;font-weight:400;margin-top:2px;}
    .pr-month{text-align:right;font-size:0.85rem;color:#555;line-height:1.6;}
    .pr-section{margin-bottom:1.5rem;}
    .pr-section-title{font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#999;margin-bottom:0.6rem;padding-bottom:0.3rem;border-bottom:1px solid #eee;}
    .pr-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;}
    .pr-stat{background:#f5f5f7;border-radius:10px;padding:0.75rem;}
    .pr-stat-label{font-size:0.65rem;color:#888;margin-bottom:3px;text-transform:uppercase;letter-spacing:.05em;}
    .pr-stat-value{font-size:1.15rem;font-weight:800;font-family:monospace;}
    .pr-stat.income .pr-stat-value{color:#059669;}
    .pr-stat.expense .pr-stat-value{color:#E11D48;}
    .pr-stat.savings .pr-stat-value{color:#2563EB;}
    .pr-budget-row{display:flex;justify-content:space-between;padding:0.35rem 0;font-size:0.85rem;border-bottom:1px solid #f0f0f0;}
    .pr-budget-bar-bg{height:4px;background:#eee;border-radius:99px;margin-bottom:4px;}
    .pr-budget-bar{height:4px;border-radius:99px;}
    .pr-cat-row{display:flex;justify-content:space-between;padding:0.3rem 0;font-size:0.85rem;border-bottom:1px solid #f5f5f5;}
    .pr-tx-group{margin-bottom:0.75rem;}
    .pr-tx-date{font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#999;padding:0.4rem 0 0.2rem;}
    .pr-tx-row{display:flex;justify-content:space-between;padding:0.22rem 0;font-size:0.82rem;border-bottom:1px solid #fafafa;}
    .pr-footer{margin-top:2rem;padding-top:0.75rem;border-top:1px solid #ddd;font-size:0.65rem;color:#bbb;text-align:center;}
    @media print{@page{margin:1.5cm;size:A4;}}
  `;

  // --- HTML del reporte ---
  const html = `
    <div class="pr-page">
      <div class="pr-header">
        <div><div class="pr-logo">💰 Coach Finanzas<small>Resumen financiero mensual</small></div></div>
        <div class="pr-month"><strong>${profile.name || 'Usuario'}</strong><br>${monthLabel}<br><span style="color:#aaa;">Generado ${new Date().toLocaleDateString('es-PE')}</span></div>
      </div>
      <div class="pr-section">
        <div class="pr-section-title">Resumen del mes</div>
        <div class="pr-stats">
          <div class="pr-stat income"><div class="pr-stat-label">Ingresos</div><div class="pr-stat-value">${fmt(income)}</div></div>
          <div class="pr-stat expense"><div class="pr-stat-label">Gastos</div><div class="pr-stat-value">${fmt(expenses)}</div></div>
          <div class="pr-stat savings"><div class="pr-stat-label">${savings >= 0 ? 'Ahorro' : 'Déficit'}</div><div class="pr-stat-value">${fmt(Math.abs(savings))}</div></div>
        </div>
      </div>
      ${budgetRows ? `<div class="pr-section"><div class="pr-section-title">Presupuestos del mes</div>${budgetRows}</div>` : ''}
      ${catRows    ? `<div class="pr-section"><div class="pr-section-title">Gastos por categoría</div>${catRows}</div>` : ''}
      <div class="pr-section">
        <div class="pr-section-title">Movimientos del mes (${txs.length})</div>
        ${txRows || '<p style="color:#aaa;font-size:0.85rem;">Sin movimientos este mes</p>'}
      </div>
      <div class="pr-footer">Coach Finanzas · Generado el ${new Date().toLocaleString('es-PE')}</div>
    </div>`;

  // Abrir ventana nueva — evita conflictos con el CSS de la app
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { toast('Permitir ventanas emergentes para generar el PDF', 'error'); return; }
  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Coach Finanzas – ${monthLabel}</title><style>${css}</style></head><body>${html}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// ---- PROFILE PAGE ----
async function loadProfile() {
  if (!State.user) return;
  const [profile, streak, achievements] = await Promise.all([
    Profiles.get(State.user.id),
    Streaks.get(State.user.id),
    Achievements.getAll(State.user.id)
  ]);

  $('profile-name').textContent = profile?.name || State.user.email?.split('@')[0] || 'Usuario';
  $('profile-email').textContent = State.user.email || '';

  if (profile?.avatar_url) {
    $('profile-avatar').innerHTML = `<img src="${profile.avatar_url}" alt="avatar">`;
  }
  if (profile?.financial_profile) {
    const badges = {saver:'🏅 Ahorrador', spender:'💸 Gastador', balanced:'⚖️ Equilibrado'};
    $('profile-badge').textContent = badges[profile.financial_profile] || '';
    $('profile-badge').classList.remove('hidden');
  }

  if (streak) {
    $('streak-current').textContent = streak.current_streak;
    $('streak-longest').textContent = streak.longest_streak;
  }

  const ACHIEVEMENTS = [
    {type:'first_transaction', label:'Primer registro', icon:'📝'},
    {type:'first_goal', label:'Primera meta', icon:'🎯'},
    {type:'streak_7', label:'Racha 7 días', icon:'🔥'},
    {type:'streak_30', label:'Racha 30 días', icon:'💥'},
    {type:'streak_100', label:'100 días', icon:'⚡'},
    {type:'budget_month', label:'Mes bajo presupuesto', icon:'✅'},
    {type:'goal_completed', label:'Meta lograda', icon:'🏆'},
    {type:'savings_25', label:'Ahorrador élite', icon:'💎'},
  ];

  $('achievements-count').textContent = `${achievements.length}/${ACHIEVEMENTS.length}`;
  $('achievements-grid').innerHTML = ACHIEVEMENTS.map(a=>`
    <div class="achievement-item" title="${a.label}">
      <div class="achievement-icon ${achievements.includes(a.type)?'unlocked':'locked'}">${a.icon}</div>
      <span class="achievement-label">${a.label}</span>
    </div>`).join('');

  // Categorías
  renderCategoriesList();

  // Selector de moneda
  const currSelect = $('currency-select');
  currSelect.innerHTML = Object.entries(CURRENCIES)
    .map(([code, c]) => `<option value="${code}" ${code === CURRENCY ? 'selected' : ''}>${c.name}</option>`)
    .join('');
  currSelect.onchange = () => {
    setCurrency(currSelect.value);
    Profiles.update(null, { currency: currSelect.value });
    loadDashboard();
    toast(`Moneda cambiada a ${CURRENCIES[currSelect.value].name} ✓`, 'success');
  };

  // Mostrar nombre editable
  $('profile-name-edit').style.display = 'none';
  $('profile-name').parentElement.style.display = 'flex';
}

// ---- CATEGORÍAS ----
const CAT_COLORS = ['#F59E0B','#3B82F6','#8B5CF6','#EF4444','#EC4899','#06B6D4','#10B981','#F97316','#84CC16','#6B7280'];

function renderCategoriesList() {
  const cats = Categories.getAll();
  const container = $('categories-list');
  const defaultIds = ['cat-01','cat-02','cat-03','cat-04','cat-05','cat-06','cat-07','cat-08','cat-09','cat-10','cat-11','cat-12','cat-13','cat-14','cat-15'];
  container.innerHTML = cats.map(c => `
    <div style="display:flex;align-items:center;gap:0.75rem;padding:0.4rem 0;">
      <span style="width:28px;height:28px;border-radius:50%;background:${c.color}22;display:flex;align-items:center;justify-content:center;font-size:1rem;">${c.icon}</span>
      <span style="flex:1;font-size:0.9rem;">${c.name}</span>
      <span class="text-muted text-xs">${c.type === 'income' ? 'Ingreso' : 'Gasto'}</span>
      ${!defaultIds.includes(c.id) ? `<button class="btn-icon text-rose btn-del-cat" data-id="${c.id}" style="font-size:0.85rem;">✕</button>` : ''}
    </div>`).join('');

  container.querySelectorAll('.btn-del-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('¿Eliminar esta categoría?')) {
        const all = lsGet('cf_categories', []).filter(c => c.id !== btn.dataset.id);
        lsSet('cf_categories', all);
        renderCategoriesList();
        toast('Categoría eliminada', '');
      }
    });
  });
}

function openCategoryModal() {
  const picker = $('cat-color-picker');
  let selectedColor = '#10B981';
  $('cat-icon').value = '';
  $('cat-name').value = '';
  picker.innerHTML = CAT_COLORS.map(c => `
    <button type="button" class="color-btn cat-color-opt ${c===selectedColor?'selected':''}"
      data-color="${c}" style="background:${c};width:28px;height:28px;border-radius:50%;border:2px solid ${c===selectedColor?'white':'transparent'};"></button>`
  ).join('');
  picker.querySelectorAll('.cat-color-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedColor = btn.dataset.color;
      picker.querySelectorAll('.cat-color-opt').forEach(b => {
        b.style.borderColor = b.dataset.color === selectedColor ? 'white' : 'transparent';
        b.classList.toggle('selected', b.dataset.color === selectedColor);
      });
    });
  });
  $('form-category').onsubmit = (e) => {
    e.preventDefault();
    const name = $('cat-name').value.trim();
    const icon = $('cat-icon').value.trim() || '🏷️';
    const type = $('cat-type').value;
    if (!name) return;
    const all = lsGet('cf_categories', []);
    all.push({ id: uid(), name, icon, color: selectedColor, type });
    lsSet('cf_categories', all);
    closeOverlay('overlay-category');
    renderCategoriesList();
    toast('Categoría creada ✓', 'success');
    $('form-category').reset();
  };
  openOverlay('overlay-category');
}

// ---- QUICK ADD ----
function openQuickAdd(type = 'expense') {
  State.quickAddType = type;
  State.quickAddAmount = '0';
  State.quickAddCategoryId = '';
  State.quickAddRecurring = false;
  State.transferFromId = '';
  State.transferToId = '';
  State.quickAddAccountId = '';
  $('amount-value').textContent = '0';
  $('quickadd-note').classList.add('hidden');
  $('btn-add-note').classList.remove('hidden');
  $('quickadd-note').value = '';
  const recBtn = $('btn-toggle-recurring');
  recBtn.classList.remove('active-recurring');
  recBtn.textContent = '🔁 Fijo';
  $('quickadd-date').value = today();

  document.querySelectorAll('.type-pill').forEach(p=>p.classList.toggle('active', p.dataset.type===type));
  loadQuickAddCategories(type);
  openOverlay('overlay-quickadd');
}

async function loadQuickAddCategories(type) {
  const isTransfer = type === 'transfer';

  // Mostrar panel correcto
  $('quickadd-categories').classList.toggle('hidden', isTransfer);
  $('transfer-panel').classList.toggle('hidden', !isTransfer);
  $('quickadd-account-row').classList.toggle('hidden', isTransfer);
  // Ocultar recurrente en transferencias
  $('btn-toggle-recurring').parentElement.style.display = isTransfer ? 'none' : '';

  if (isTransfer) {
    loadTransferAccountPickers();
    return;
  }

  // Selector de cuenta (para gastos e ingresos)
  const accounts = Accounts.getAll();
  State.quickAddAccountId = State.quickAddAccountId || accounts[0]?.id || '';
  const accList = $('quickadd-account-list');
  function renderAccChips() {
    accList.innerHTML = accounts.map(acc => {
      const sel = acc.id === State.quickAddAccountId;
      return `<button type="button" class="acc-chip ${sel ? 'selected' : ''}"
        data-accid="${acc.id}"
        style="${sel ? `border-color:${acc.color};color:${acc.color};background:${acc.color}18;` : ''}">
        ${acc.icon} ${acc.name}
      </button>`;
    }).join('');
    accList.querySelectorAll('.acc-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        State.quickAddAccountId = btn.dataset.accid;
        renderAccChips();
      });
    });
  }
  renderAccChips();

  const cats = await Categories.getAll(type === 'income' ? 'income' : 'expense');
  State.categories = cats;

  const predicted = Categorizer.predict(parseFloat(State.quickAddAmount)||0);
  const defaultId = predicted || (cats[0]?.id ?? '');
  State.quickAddCategoryId = defaultId;

  $('quickadd-categories').innerHTML = cats.map(c=>`
    <button class="cat-btn ${c.id===defaultId?'selected':''}" data-catid="${c.id}"
      style="${c.id===defaultId?`background:${c.color}20;outline-color:${c.color}`:''}">
      <span class="cat-btn-icon">${c.icon}</span>
      <span class="cat-btn-name">${c.name}</span>
    </button>`).join('');

  $('quickadd-categories').querySelectorAll('.cat-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      State.quickAddCategoryId = btn.dataset.catid;
      $('quickadd-categories').querySelectorAll('.cat-btn').forEach(b=>{
        const c = cats.find(x=>x.id===b.dataset.catid);
        b.classList.toggle('selected', b.dataset.catid===State.quickAddCategoryId);
        b.style.background = b.dataset.catid===State.quickAddCategoryId ? (c?.color??'#10B981')+'20' : '';
        b.style.outlineColor = b.dataset.catid===State.quickAddCategoryId ? (c?.color??'#10B981') : '';
      });
    });
  });
}

function loadTransferAccountPickers() {
  const accounts = Accounts.getAll();
  State.transferFromId = accounts[0]?.id ?? '';
  State.transferToId   = accounts[1]?.id ?? '';

  function renderList(containerId, selectedId, onSelect) {
    const el = $(containerId);
    el.innerHTML = accounts.map(acc => {
      const sel = acc.id === selectedId;
      return `<button type="button" class="cat-btn ${sel?'selected':''}" data-accid="${acc.id}"
        style="${sel?`background:${acc.color}20;outline-color:${acc.color}`:''}">
        <span class="cat-btn-icon">${acc.icon}</span>
        <span class="cat-btn-name">${acc.name}</span>
      </button>`;
    }).join('');
    el.querySelectorAll('.cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        onSelect(btn.dataset.accid);
        renderList(containerId, btn.dataset.accid, onSelect);
      });
    });
  }

  renderList('transfer-from-list', State.transferFromId, id => { State.transferFromId = id; });
  renderList('transfer-to-list',   State.transferToId,   id => { State.transferToId   = id; });
}

function handleNumpad(key) {
  if (typeof navigator.vibrate === 'function') navigator.vibrate(8);
  let v = State.quickAddAmount;
  if (key === 'del') { v = v.length<=1?'0':v.slice(0,-1); }
  else if (key === '.') { if (!v.includes('.')) v += '.'; }
  else {
    const parts = v.split('.');
    if (parts[1] && parts[1].length>=2) return;
    v = v==='0'?key:v+key;
    if (parseFloat(v) > 999999) return;
  }
  State.quickAddAmount = v;
  $('amount-value').textContent = v;
}

async function saveTransaction() {
  const amount = parseFloat(State.quickAddAmount);
  if (amount <= 0) { toast('Ingresa un monto válido', 'error'); return; }

  const isTransfer = State.quickAddType === 'transfer';

  if (isTransfer) {
    if (!State.transferFromId || !State.transferToId) {
      toast('Selecciona las cuentas de origen y destino', 'error'); return;
    }
    if (State.transferFromId === State.transferToId) {
      toast('Las cuentas de origen y destino deben ser distintas', 'error'); return;
    }
  } else {
    if (!State.quickAddCategoryId) {
      toast('Selecciona una categoría', 'error'); return;
    }
  }

  const btn = $('btn-save-transaction');
  btn.disabled = true; btn.textContent = 'Guardando...';

  try {
    const txData = {
      user_id:      State.user.id,
      type:         State.quickAddType,
      amount,
      date:         $('quickadd-date').value || today(),
      note:         $('quickadd-note').value || null,
      is_recurring: isTransfer ? false : State.quickAddRecurring,
      category_id:  isTransfer ? null : State.quickAddCategoryId,
      account_id:   isTransfer ? null : (State.quickAddAccountId || null),
      from_account: isTransfer ? State.transferFromId  : null,
      to_account:   isTransfer ? State.transferToId    : null,
    };
    await Transactions.add(txData);

    if (!isTransfer) Categorizer.reinforce(amount, State.quickAddCategoryId);
    Streaks.update();
    checkAchievements();

    const accounts = Accounts.getAll();
    const fromName = accounts.find(a => a.id === State.transferFromId)?.name ?? '';
    const toName   = accounts.find(a => a.id === State.transferToId)?.name ?? '';
    toast(isTransfer
      ? `Transferencia: ${fromName} → ${toName} ${fmt(amount)}`
      : `Guardado: ${fmt(amount)}`, 'success');

    closeOverlay('overlay-quickadd');
    loadDashboard();
  } catch(e) {
    toast('Error al guardar', 'error');
  } finally {
    btn.disabled = false; btn.textContent = '✓ Guardar';
  }
}

// ---- GOALS FORM ----
const GOAL_ICONS = ['🏠','✈️','🚗','💍','📱','🎓','💊','🎯','💼','🏖️','🍕','🏋️'];
const GOAL_COLORS = ['#10B981','#3B82F6','#8B5CF6','#F59E0B','#EC4899','#06B6D4','#EF4444','#84CC16'];
let goalSelectedIcon = '🎯', goalSelectedColor = '#10B981';

function initGoalForm() {
  $('goal-icon-picker').innerHTML = GOAL_ICONS.map(i=>`
    <button type="button" class="icon-btn ${i===goalSelectedIcon?'selected':''}" data-icon="${i}">${i}</button>`).join('');
  $('goal-color-picker').innerHTML = GOAL_COLORS.map(c=>`
    <button type="button" class="color-btn ${c===goalSelectedColor?'selected':''}" data-color="${c}" style="background:${c}"></button>`).join('');

  $('goal-icon-picker').querySelectorAll('.icon-btn').forEach(b=>{
    b.addEventListener('click',()=>{
      goalSelectedIcon=b.dataset.icon;
      $('goal-icon-picker').querySelectorAll('.icon-btn').forEach(x=>x.classList.toggle('selected',x===b));
    });
  });
  $('goal-color-picker').querySelectorAll('.color-btn').forEach(b=>{
    b.addEventListener('click',()=>{
      goalSelectedColor=b.dataset.color;
      $('goal-color-picker').querySelectorAll('.color-btn').forEach(x=>x.classList.toggle('selected',x===b));
    });
  });
}

// ---- INIT & EVENTS ----
async function init() {
  State.user = Auth.getUser();

  // Primera vez: mostrar onboarding
  if (!lsGet('cf_onboarding_done', false)) {
    showOnboarding();
  } else {
    showApp();
  }

  // -- Navegación --
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); navigate(el.dataset.page); });
  });

  // -- FAB --
  $('fab').addEventListener('click', () => openQuickAdd('expense'));
  $('sidebar-fab').addEventListener('click', () => openQuickAdd('expense'));

  // -- Quick Add --
  document.querySelectorAll('.type-pill').forEach(p => {
    p.addEventListener('click', () => {
      State.quickAddType = p.dataset.type;
      document.querySelectorAll('.type-pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      loadQuickAddCategories(State.quickAddType);
    });
  });

  document.querySelectorAll('.numpad-key').forEach(btn => {
    btn.addEventListener('pointerdown', e => { e.preventDefault(); handleNumpad(btn.dataset.key); });
  });

  $('btn-close-quickadd').addEventListener('click', () => closeOverlay('overlay-quickadd'));
  $('overlay-quickadd').addEventListener('click', e => { if(e.target===$('overlay-quickadd')) closeOverlay('overlay-quickadd'); });
  $('btn-save-transaction').addEventListener('click', saveTransaction);

  $('btn-add-note').addEventListener('click', () => {
    $('btn-add-note').classList.add('hidden');
    $('quickadd-note').classList.remove('hidden');
    $('quickadd-note').focus();
  });

  // -- Event delegation: captura clicks de botones dinámicos --
  document.addEventListener('click', e => {
    const t = e.target.closest('[id]');
    if (!t) return;
    switch (t.id) {

      case 'btn-toggle-recurring': {
        State.quickAddRecurring = !State.quickAddRecurring;
        t.classList.toggle('active-recurring', State.quickAddRecurring);
        t.textContent = State.quickAddRecurring ? '🔁 Fijo ✓' : '🔁 Fijo';
        break;
      }

      case 'btn-edit-name': {
        const wrap = $('profile-name').parentElement;
        wrap.style.display = 'none';
        const editEl = $('profile-name-edit');
        editEl.style.display = 'flex';
        $('input-profile-name').value = $('profile-name').textContent;
        $('input-profile-name').focus();
        break;
      }

      case 'btn-save-name': {
        const newName = $('input-profile-name').value.trim();
        if (!newName) return;
        Profiles.update(null, { name: newName });
        $('profile-name').textContent = newName;
        $('profile-name').parentElement.style.display = 'flex';
        $('profile-name-edit').style.display = 'none';
        toast('Nombre actualizado ✓', 'success');
        break;
      }

      case 'btn-new-category':
        openCategoryModal();
        break;

      case 'btn-manage-accounts':
        openAccountsModal();
        break;

      case 'btn-export-csv':
        exportCSV();
        break;

      case 'btn-export-pdf':
      case 'btn-export-pdf-reports':
        exportPDF();
        break;

      case 'btn-save-edit-tx':
        saveEditTx();
        break;

      case 'edit-tx-recurring':
        _editTxRecurring = !_editTxRecurring;
        $('edit-tx-recurring').classList.toggle('active', _editTxRecurring);
        break;
    }

    // Tipo en modal edición
    if (t.dataset.editType) {
      document.querySelectorAll('[data-edit-type]').forEach(b => b.classList.remove('active'));
      t.classList.add('active');
    }
  });

  // -- Goals --
  // -- Presupuestos --
  $('btn-edit-budgets').addEventListener('click', () => {
    const cats = Categories.getAll('expense');
    const budgets = Budgets.getAll(State.currentMonth);
    openBudgetsModal(cats, budgets);
  });
  $('btn-save-budgets').addEventListener('click', () => {
    document.querySelectorAll('.budget-input').forEach(input => {
      const catId = input.dataset.catid;
      const val = parseFloat(input.value) || 0;
      Budgets.set(State.currentMonth, catId, val);
    });
    closeOverlay('overlay-budgets');
    toast('Presupuestos guardados ✓', 'success');
    loadInsights();
  });

  $('btn-new-goal').addEventListener('click', () => {
    $('goal-edit-id').value  = '';
    $('goal-modal-title').textContent = 'Nueva meta de ahorro';
    $('btn-goal-submit').textContent  = 'Crear meta';
    goalSelectedIcon  = '🎯';
    goalSelectedColor = '#10B981';
    // Limpiar todos los campos del formulario
    $('goal-name').value     = '';
    $('goal-target').value   = '';
    $('goal-current').value  = '0';
    $('goal-deadline').value = '';
    initGoalForm();
    openOverlay('overlay-goal');
  });
  $('form-goal').addEventListener('submit', async e => {
    e.preventDefault();
    const editId = $('goal-edit-id').value;
    const data = {
      name: $('goal-name').value,
      target_amount: parseFloat($('goal-target').value),
      current_amount: parseFloat($('goal-current').value)||0,
      deadline: $('goal-deadline').value,
      icon: goalSelectedIcon,
      color: goalSelectedColor
    };
    try {
      if (editId) {
        Goals.update(editId, data);
        toast('Meta actualizada ✓', 'success');
      } else {
        await Goals.add({ ...data, user_id: State.user.id });
        toast('¡Meta creada!', 'success');
        checkAchievements();
      }
      closeOverlay('overlay-goal');
      loadGoals();
      e.target.reset();
    } catch { toast(editId ? 'Error al actualizar' : 'Error al crear meta', 'error'); }
  });

  // -- Contribute --
  $('btn-confirm-contribute').addEventListener('click', async () => {
    const amount = parseFloat($('contribute-amount').value);
    if (!amount||amount<=0) { toast('Ingresa un monto válido', 'error'); return; }
    try {
      await Goals.contribute(State.selectedGoalId, amount, State.user.id, State.selectedGoalName);
      closeOverlay('overlay-contribute');
      // Verificar si la meta se completó
      const goal = Goals.getAll().find(g => g.id === State.selectedGoalId);
      if (goal && goal.current_amount >= goal.target_amount) {
        toast(`🏆 ¡Meta "${State.selectedGoalName}" completada!`, 'success');
        showConfetti();
        Achievements.unlock('goal_completed');
      } else {
        toast(`Aporte de ${fmt(amount)} registrado ✓`, 'success');
      }
      loadGoals();
    } catch { toast('Error al aportar', 'error'); }
  });

  // -- Debts --
  $('btn-new-debt').addEventListener('click', () => openOverlay('overlay-debt'));
  $('form-debt').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await Debts.add({
        user_id: State.user.id,
        name: $('debt-name').value,
        total: parseFloat($('debt-total').value),
        paid: parseFloat($('debt-paid').value)||0,
        interest_rate: parseFloat($('debt-rate').value)||0,
        installments: parseInt($('debt-installments').value)||1,
        paid_installments: parseInt($('debt-paid-inst').value)||0,
        next_payment_date: $('debt-date').value
      });
      toast('Deuda registrada', 'success');
      closeOverlay('overlay-debt');
      loadDebts();
      e.target.reset();
    } catch { toast('Error al registrar', 'error'); }
  });

  // -- Pago de deuda --
  $('btn-confirm-pay-debt').addEventListener('click', () => {
    const amount = parseFloat($('pay-debt-amount').value);
    if (!amount || amount <= 0) { toast('Ingresa un monto válido', 'error'); return; }
    const debt = Debts.pay(State.selectedDebtId, amount);
    if (!debt) { toast('Error al registrar pago', 'error'); return; }

    if ($('pay-debt-as-tx').checked) {
      Transactions.add({
        user_id: State.user?.id || 'local',
        type: 'expense',
        amount,
        date: today(),
        note: `Pago deuda: ${State.selectedDebtName}`,
        is_recurring: false,
        category_id: null,
      });
    }
    toast(`Pago de ${fmt(amount)} registrado ✓`, 'success');
    closeOverlay('overlay-pay-debt');
    loadDebts();
    loadDashboard();
  });

  // -- Backup & Restore --
  $('btn-backup').addEventListener('click', backupData);
  $('input-restore').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) restoreData(file);
    e.target.value = '';
  });

  // -- Importar CSV --
  $('input-import-csv').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) importCSV(file);
    e.target.value = '';
  });

  // -- Resumen fin de mes: ir a reportes --
  $('ms-btn-reports').addEventListener('click', () => {
    closeOverlay('overlay-month-summary');
    navigate('reports');
  });

  // -- Close modals --
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => closeOverlay('overlay-' + btn.dataset.modal));
  });
  document.querySelectorAll('.overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if(e.target===overlay) closeOverlay(overlay.id); });
  });

  // -- Transactions filters --
  $('tx-search').addEventListener('input', e => { State.txSearch=e.target.value; renderTransactionsPage(State.transactions); });
  document.querySelectorAll('#tx-filters .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      State.txFilterType = btn.dataset.filter;
      document.querySelectorAll('#tx-filters .filter-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      renderTransactionsPage(State.transactions);
    });
  });

  // -- Filtro por rango de fechas --
  $('tx-date-toggle').addEventListener('click', () => {
    const panel = $('tx-date-range');
    const arrow = $('tx-date-toggle-arrow');
    const open  = panel.classList.toggle('hidden');
    $('tx-date-toggle').classList.toggle('open', !open);
    arrow.textContent = open ? '▼' : '▲';
  });

  function applyDateRange() {
    State.txDateFrom = $('tx-date-from').value;
    State.txDateTo   = $('tx-date-to').value;
    if (State.txDateFrom && State.txDateTo) loadTransactions();
  }
  $('tx-date-from').addEventListener('change', applyDateRange);
  $('tx-date-to').addEventListener('change', applyDateRange);
  $('tx-date-clear').addEventListener('click', () => {
    State.txDateFrom = ''; State.txDateTo = '';
    $('tx-date-from').value = ''; $('tx-date-to').value = '';
    // Cerrar panel
    $('tx-date-range').classList.add('hidden');
    $('tx-date-toggle').classList.remove('open');
    $('tx-date-toggle-arrow').textContent = '▼';
    loadTransactions();
  });

  // -- Month nav (transactions) --
  $('prev-month').addEventListener('click', () => {
    const [y,m] = State.currentMonth.split('-').map(Number);
    const d = new Date(y,m-1,1); d.setMonth(d.getMonth()-1);
    State.currentMonth = d.toISOString().slice(0,7);
    loadTransactions();
  });
  $('next-month').addEventListener('click', () => {
    const [y,m] = State.currentMonth.split('-').map(Number);
    const d = new Date(y,m-1,1); d.setMonth(d.getMonth()+1);
    const next = d.toISOString().slice(0,7);
    if (next <= new Date().toISOString().slice(0,7)) { State.currentMonth=next; loadTransactions(); }
  });

  // -- Insights month nav --
  $('insights-prev-month').addEventListener('click', () => {
    const [y,m] = State.currentMonth.split('-').map(Number);
    const d = new Date(y,m-1,1); d.setMonth(d.getMonth()-1);
    State.currentMonth = d.toISOString().slice(0,7);
    loadInsights();
  });
  $('insights-next-month').addEventListener('click', () => {
    const [y,m] = State.currentMonth.split('-').map(Number);
    const d = new Date(y,m-1,1); d.setMonth(d.getMonth()+1);
    const next = d.toISOString().slice(0,7);
    if (next <= new Date().toISOString().slice(0,7)) { State.currentMonth = next; loadInsights(); }
  });

  // -- Calendar nav --
  $('cal-prev-month').addEventListener('click', () => {
    const [y,m] = State.calMonth.split('-').map(Number);
    const d = new Date(y,m-1,1); d.setMonth(d.getMonth()-1);
    State.calMonth = d.toISOString().slice(0,7);
    loadCalendar();
  });
  $('cal-next-month').addEventListener('click', () => {
    const [y,m] = State.calMonth.split('-').map(Number);
    const d = new Date(y,m-1,1); d.setMonth(d.getMonth()+1);
    const next = d.toISOString().slice(0,7);
    if (next <= new Date().toISOString().slice(0,7)) { State.calMonth=next; loadCalendar(); }
  });

  // -- Simulator --
  $('sim-slider').addEventListener('input', updateSimResult);

  // -- Theme toggle --
  $('theme-toggle').addEventListener('click', () => {
    const isDark = document.documentElement.dataset.theme === 'dark';
    document.documentElement.dataset.theme = isDark ? 'light' : 'dark';
    $('theme-toggle').classList.toggle('active', !isDark);
  });

  // -- Notificaciones --
  setupNotifications();

  // -- Logout --
  $('btn-logout').addEventListener('click', () => {
    if (confirm('¿Borrar TODOS los datos? Esta acción no se puede deshacer.')) {
      localStorage.clear();
      location.reload();
    }
  });

  // -- Keyboard shortcuts (web) --
  document.addEventListener('keydown', e => {
    if (e.key === 'q' || e.key === 'Q') openQuickAdd('expense');
    if (e.key === 'Escape') {
      document.querySelectorAll('.overlay.active').forEach(o=>closeOverlay(o.id));
    }
  });

  // -- Menú "Más" (bottom nav) --
  $('tab-more').addEventListener('click', () => openOverlay('overlay-more'));
  $('btn-close-more').addEventListener('click', () => closeOverlay('overlay-more'));
  document.querySelectorAll('.more-menu-item').forEach(btn => {
    btn.addEventListener('click', () => {
      closeOverlay('overlay-more');
      navigate(btn.dataset.page);
    });
  });

  // -- Filtro de categorías en Movimientos (collapsible) --
  $('tx-cat-toggle').addEventListener('click', () => {
    const filters = $('tx-cat-filters');
    const btn     = $('tx-cat-toggle');
    const arrow   = $('tx-cat-toggle-arrow');
    const isHidden = filters.classList.toggle('hidden');
    btn.classList.toggle('open', !isHidden);
    if (arrow) arrow.textContent = isHidden ? '▼' : '▲';
  });

  // -- Página de Cuentas: botón nueva cuenta --
  $('btn-new-account-page').addEventListener('click', () => openAccountsModal());

  // -- PWA install prompt --
  setupPWAPrompt();

  // -- Links con data-page --
  document.addEventListener('click', e => {
    const link = e.target.closest('[data-page]');
    if (link && !link.classList.contains('tab') && !link.classList.contains('nav-link') && !link.classList.contains('more-menu-item')) {
      e.preventDefault();
      navigate(link.dataset.page);
    }
  });
}

// ---- PWA INSTALL PROMPT ----
function setupPWAPrompt() {
  // No mostrar si ya fue instalado (display=standalone) o descartado
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  if (lsGet('cf_pwa_dismissed', false)) return;

  // Incrementar contador de visitas
  const visits = (lsGet('cf_pwa_visits', 0)) + 1;
  lsSet('cf_pwa_visits', visits);

  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    // Mostrar banner solo si el usuario lleva ≥ 2 visitas
    if (visits >= 2) showPWABanner();
  });

  function showPWABanner() {
    const banner = $('pwa-banner');
    banner.classList.remove('hidden');

    $('pwa-install-btn').addEventListener('click', async () => {
      banner.classList.add('hidden');
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') toast('¡App instalada! 🎉', 'success');
      deferredPrompt = null;
      lsSet('cf_pwa_dismissed', true);
    });

    $('pwa-dismiss-btn').addEventListener('click', () => {
      banner.classList.add('hidden');
      lsSet('cf_pwa_dismissed', true);
    });
  }

  // Si ya hubo prompt antes (iOS/Safari no soporta beforeinstallprompt)
  // mostrar instrucción genérica tras 3 visitas
  if (visits === 3) {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS && !deferredPrompt) {
      const banner = $('pwa-banner');
      banner.querySelector('p:last-child').textContent = 'Toca Compartir → "Agregar a inicio"';
      banner.classList.remove('hidden');
      $('pwa-install-btn').textContent = 'Cómo instalar';
      $('pwa-install-btn').addEventListener('click', () => banner.classList.add('hidden'));
      $('pwa-dismiss-btn').addEventListener('click', () => {
        banner.classList.add('hidden');
        lsSet('cf_pwa_dismissed', true);
      });
    }
  }
}

// ---- CONFETTI ----
function showConfetti() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.appendChild(overlay);
  const colors = ['#10B981','#F59E0B','#EF4444','#8B5CF6','#3B82F6','#EC4899','#F97316'];
  for (let i = 0; i < 70; i++) {
    const el   = document.createElement('div');
    const size = Math.random() * 10 + 6;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const dur  = (Math.random() * 2 + 1.5).toFixed(2);
    const delay = (Math.random() * 0.8).toFixed(2);
    el.style.cssText = `
      position:absolute; width:${size}px; height:${size}px;
      background:${color}; border-radius:${Math.random()>.5?'50%':'3px'};
      left:${Math.random()*100}%; top:-20px; opacity:1;
      animation: confettiFall ${dur}s ${delay}s ease-in forwards;
    `;
    overlay.appendChild(el);
  }
  setTimeout(() => overlay.remove(), 4500);
}

// ---- IMPORTAR CSV ----
function importCSV(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const lines = e.target.result.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { toast('CSV vacío o sin datos', 'error'); return; }

      const raw = lines[0].split(',').map(h => h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''));
      const idx = (names) => names.reduce((f, n) => f >= 0 ? f : raw.indexOf(n), -1);

      const dateIdx   = idx(['fecha','date']);
      const typeIdx   = idx(['tipo','type']);
      const amountIdx = idx(['monto','amount','importe']);
      const catIdx    = idx(['categoria','category','categoría']);
      const noteIdx   = idx(['nota','note','descripcion','description']);

      if (dateIdx < 0 || amountIdx < 0) {
        toast('El CSV debe tener al menos columnas: Fecha y Monto', 'error'); return;
      }

      const cats = lsGet('cf_categories', []);
      let imported = 0, skipped = 0;

      lines.slice(1).forEach(line => {
        const cols   = line.split(',');
        const date   = cols[dateIdx]?.trim();
        const amount = parseFloat(cols[amountIdx]?.replace(/[^0-9.-]/g,''));
        if (!date || isNaN(amount) || amount <= 0) { skipped++; return; }

        const rawType = typeIdx >= 0 ? cols[typeIdx]?.trim().toLowerCase() : '';
        const type    = rawType.includes('ingreso') || rawType.includes('income') ? 'income' : 'expense';
        const catName = catIdx >= 0 ? cols[catIdx]?.trim() : '';
        const note    = noteIdx >= 0 ? (cols[noteIdx]?.trim().replace(/;/g,',') || null) : null;
        const cat     = catName ? cats.find(c => c.name.toLowerCase() === catName.toLowerCase()) : null;

        Transactions.add({ user_id:'local', type, amount, date, note, is_recurring:false, category_id: cat?.id || null });
        imported++;
      });

      toast(`${imported} transacciones importadas${skipped ? `, ${skipped} omitidas` : ''} ✓`, 'success');
      loadDashboard();
      if ($('page-transactions').classList.contains('active')) loadTransactions();
    } catch { toast('Error al procesar el CSV', 'error'); }
  };
  reader.readAsText(file, 'UTF-8');
}

// ---- RESUMEN FIN DE MES ----
function checkMonthSummary() {
  const currentMonth = new Date().toISOString().slice(0,7);
  const lastSeen     = lsGet('cf_last_month', null);

  // Si es la primera vez o el mismo mes, no mostrar
  if (!lastSeen || lastSeen === currentMonth) {
    lsSet('cf_last_month', currentMonth);
    return;
  }

  // Mes anterior al actual (el que hay que resumir)
  const [cy, cm] = currentMonth.split('-').map(Number);
  const prevDate  = new Date(cy, cm-2, 1);
  const prevMonth = prevDate.toISOString().slice(0,7);

  if (lastSeen !== prevMonth && lastSeen < prevMonth) {
    lsSet('cf_last_month', currentMonth);
    return; // Más de un mes sin abrir — saltar
  }

  const txs      = lsGet('cf_transactions', []);
  const prevTxs  = txs.filter(t => t.date.startsWith(prevMonth));
  const income   = prevTxs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expenses = prevTxs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const savings  = income - expenses;

  const monthLabel = prevDate.toLocaleDateString('es-PE',{month:'long',year:'numeric'});
  $('ms-title').textContent    = `Resumen: ${monthLabel}`;
  $('ms-income').textContent   = fmt(income);
  $('ms-expenses').textContent = fmt(expenses);
  $('ms-savings').textContent  = fmt(Math.abs(savings));

  const savingsCard = $('ms-savings-card');
  if (savings >= 0) {
    savingsCard.style.background = 'var(--emerald-dim)';
    $('ms-savings-label').textContent = 'Ahorro';
    $('ms-savings').style.color = 'var(--emerald)';
  } else {
    savingsCard.style.background = 'var(--rose-dim)';
    $('ms-savings-label').textContent = 'Déficit';
    $('ms-savings').style.color = 'var(--rose)';
  }

  // Top 3 categorías de gasto
  const cats   = lsGet('cf_categories', []);
  const catMap = {};
  prevTxs.filter(t=>t.type==='expense').forEach(t => {
    if (t.category_id) catMap[t.category_id] = (catMap[t.category_id]||0) + t.amount;
  });
  const topCats = Object.entries(catMap).sort(([,a],[,b])=>b-a).slice(0,3);
  $('ms-top-cats').innerHTML = topCats.map(([id, total]) => {
    const cat = cats.find(c=>c.id===id);
    if (!cat) return '';
    const pct = expenses > 0 ? (total/expenses*100).toFixed(0) : 0;
    return `<div style="display:flex;align-items:center;gap:0.5rem;font-size:0.82rem;">
      <span>${cat.icon}</span>
      <span style="flex:1;">${cat.name}</span>
      <span style="color:var(--text-muted);">${pct}%</span>
      <span class="font-mono text-rose">${fmt(total,true)}</span>
    </div>`;
  }).join('');

  // Mensaje coach
  const rate = income > 0 ? ((savings/income)*100).toFixed(0) : 0;
  const msgs = savings < 0
    ? [`😟 Terminaste ${monthLabel} con déficit de ${fmt(Math.abs(savings))}. Este mes, fíjate un límite de gasto diario.`]
    : rate >= 20
    ? [`🏆 ¡Excelente! Ahorraste el ${rate}% de tus ingresos en ${monthLabel}. Sigue así.`]
    : [`👍 Ahorraste el ${rate}% en ${monthLabel}. Intenta llegar al 20% este mes.`];
  $('ms-coach-msg').textContent = msgs[0];
  $('ms-subtitle').textContent  = `${prevTxs.length} movimientos registrados`;

  lsSet('cf_last_month', currentMonth);
  openOverlay('overlay-month-summary');
}

// ---- BACKUP / RESTORE ----
function backupData() {
  const KEYS = [
    'cf_profile','cf_categories','cf_cats_init',
    'cf_transactions','cf_goals','cf_debts',
    'cf_accounts','cf_accs_init','cf_streaks',
    'cf_achievements','cf_onboarding_done',
  ];
  // Incluir también presupuestos (múltiples claves cf_budgets_*)
  Object.keys(localStorage).filter(k => k.startsWith('cf_budgets_')).forEach(k => KEYS.push(k));

  const data = {};
  KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) data[k] = JSON.parse(v); });

  const json  = JSON.stringify({ version: 1, date: new Date().toISOString(), data }, null, 2);
  const blob  = new Blob([json], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `finanzas_backup_${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Copia de seguridad descargada ✓', 'success');
}

function restoreData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const backup = JSON.parse(e.target.result);
      if (!backup.data || backup.version !== 1) { toast('Archivo inválido', 'error'); return; }
      if (!confirm(`¿Restaurar copia del ${new Date(backup.date).toLocaleDateString('es-PE')}?\nSe sobreescribirán los datos actuales.`)) return;
      Object.entries(backup.data).forEach(([k, v]) => lsSet(k, v));
      toast('Datos restaurados ✓', 'success');
      setTimeout(() => location.reload(), 1200);
    } catch { toast('Error al leer el archivo', 'error'); }
  };
  reader.readAsText(file);
}

// Arrancar la app
document.addEventListener('DOMContentLoaded', init);
