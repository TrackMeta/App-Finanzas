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
  selectedGoalId: null,
  selectedGoalName: '',
  selectedDebtId: null,
  calMonth: new Date().toISOString().slice(0,7),
  simCategoryId: '',
  charts: {},
  txFilterType: 'all',
  txCatFilter: '',
  txSearch: '',
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
  if (page === 'reports') loadReports();
  if (page === 'profile') loadProfile();
}

// ---- SHOW APP ----
function showApp() {
  $('screen-app').classList.remove('hidden');
  $('screen-app').classList.add('active');
  loadDashboard();
}
function showLogin() { /* sin login */ }

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
  renderInsights($('dashboard-insights'), insights.slice(0,3));

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
  container.innerHTML = txs.map(tx => {
    const color = tx.category?.color ?? '#6B7280';
    const recurring = tx.is_recurring ? '🔁 ' : '';
    const meta = [showDate?fmtDate(tx.date):'', tx.note].filter(Boolean).join(' · ');
    return `
      <div class="tx-item" data-id="${tx.id}">
        <div class="tx-icon" style="background:${color}20">${tx.category?.icon??'💸'}</div>
        <div class="tx-info">
          <p class="tx-name">${recurring}${tx.category?.name??'Sin categoría'}</p>
          ${meta?`<p class="tx-meta">${meta}</p>`:''}
        </div>
        <span class="tx-amount ${tx.type}">${tx.type==='expense'?'-':tx.type==='income'?'+':''}${fmt(tx.amount)}</span>
      </div>
      <div class="tx-actions hidden">
        <button class="btn btn-sm" style="flex:1;background:var(--bg-secondary);" onclick="openEditTx('${tx.id}')">✏️ Editar</button>
        <button class="btn btn-danger btn-sm" style="flex:1;" onclick="deleteTx('${tx.id}')">🗑 Eliminar</button>
      </div>`;
  }).join('');

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
  const label = $('current-month-label');
  label.textContent = fmtMonth(State.currentMonth);

  const txs = await Transactions.getByMonth(State.currentMonth);
  State.transactions = txs;
  renderTransactionsPage(txs);
}

function renderTransactionsPage(txs) {
  // Filtros de categoría
  const cats = Categories.getAll();
  const catFilter = $('tx-cat-filters');
  if (catFilter && !catFilter.dataset.built) {
    catFilter.dataset.built = '1';
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
          ${items.map(tx => {
            const color = tx.category?.color??'#6B7280';
            const recurring = tx.is_recurring ? '🔁 ' : '';
            return `
              <div class="tx-item" data-id="${tx.id}">
                <div class="tx-icon" style="background:${color}20">${tx.category?.icon??'💸'}</div>
                <div class="tx-info">
                  <p class="tx-name">${recurring}${tx.category?.name??'Sin categoría'}</p>
                  ${tx.note?`<p class="tx-meta">${tx.note}</p>`:''}
                </div>
                <span class="tx-amount ${tx.type}">${tx.type==='expense'?'-':'+'}${fmt(tx.amount)}</span>
              </div>
              <div class="tx-actions hidden" data-txid="${tx.id}">
                <button class="btn btn-sm" style="flex:1;background:var(--bg-secondary);" onclick="openEditTx('${tx.id}')">✏️ Editar</button>
                <button class="btn btn-danger btn-sm" style="flex:1;" onclick="deleteTx('${tx.id}')">🗑 Eliminar</button>
              </div>`;
          }).join('')}
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
        <div class="goal-actions">
          ${!done?`<button class="btn btn-primary btn-sm flex-1" style="background:${g.color}" onclick="openContribute('${g.id}','${g.name}')">+ Aportar</button>`:''}
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
        <button class="btn btn-danger btn-sm" onclick="deleteDebt('${d.id}')">🗑 Eliminar</button>
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
  const [txs, cats, prevTxs] = await Promise.all([
    Transactions.getByMonth(State.currentMonth),
    Categories.getAll(),
    Transactions.getByMonth(getPrevMonth(State.currentMonth))
  ]);
  State.transactions = txs;
  State.categories = cats;

  // Presupuestos
  const budgets = Budgets.getAll(State.currentMonth);
  renderBudgetsList(txs, cats, budgets);

  // Score
  const streak = State.user ? Streaks.get(State.user.id) : null;
  const score = calcScore(txs, Goals.getAll(), budgets, streak);
  renderScore(score);

  // Proyección
  const proj = projectEndOfMonth(txs);
  $('proj-expenses').textContent = fmt(proj.projectedExpenses);
  $('proj-savings').textContent = fmt(Math.abs(proj.projectedSavings)) + (proj.projectedSavings<0?' (déficit)':'');
  $('proj-savings-card').className = 'stat-card ' + (proj.projectedSavings>=0?'savings':'expense');
  $('proj-confidence').textContent = `Confianza: ${proj.confidence} (${new Date().getDate()} días de datos)`;

  // Gráfico semanal
  renderWeeklyChart(txs);

  // Simulador
  renderSimCategories(cats, txs);

  // Insights
  const insights = generateInsights(txs, prevTxs, cats);
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

  const weeks = {};
  txs.forEach(t => {
    const w = Math.ceil(new Date(t.date+'T00:00:00').getDate()/7);
    weeks[w] = weeks[w]||{income:0,expenses:0};
    if (t.type==='income') weeks[w].income+=t.amount;
    if (t.type==='expense') weeks[w].expenses+=t.amount;
  });

  const labels = Object.keys(weeks).map(w=>`Sem ${w}`);
  State.charts.weekly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {label:'Ingresos', data:Object.values(weeks).map(w=>w.income), backgroundColor:'rgba(16,185,129,0.7)', borderRadius:6},
        {label:'Gastos', data:Object.values(weeks).map(w=>w.expenses), backgroundColor:'rgba(244,63,94,0.7)', borderRadius:6}
      ]
    },
    options: {
      plugins: { legend: { labels: { color: '#71717a', font: {size:11} } } },
      scales: {
        x: { ticks: { color:'#71717a' }, grid: { display:false } },
        y: { ticks: { color:'#71717a', callback: v=>fmt(v,true) }, grid: { color:'rgba(255,255,255,0.05)' } }
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
  const sim = simulateSavings(State.transactions, State.simCategoryId, pct);
  const result = $('sim-result');
  if (sim.monthlySavings > 0) {
    result.classList.remove('hidden');
    result.innerHTML = `
      <p class="sim-result-title">Ahorro mensual: ${fmt(sim.monthlySavings)}</p>
      <p class="sim-result-detail">Ahorro anual: <strong>${fmt(sim.yearlySavings)}</strong></p>
      <p class="sim-result-detail">Gasto actual: <s>${fmt(sim.currentMonthly)}</s> → ${fmt(sim.reducedMonthly)}</p>`;
  } else result.classList.add('hidden');
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

  // --- Resumen de presupuestos ---
  const budgetRows = budgets.map(b => {
    const cat   = cats.find(c => c.id === b.category_id);
    if (!cat) return '';
    const spent = txs.filter(t => t.type === 'expense' && t.category_id === b.category_id)
                     .reduce((s, t) => s + t.amount, 0);
    const pct   = Math.min((spent / b.monthly_limit) * 100, 100).toFixed(0);
    const over  = spent > b.monthly_limit;
    const color = over ? '#E11D48' : pct >= 80 ? '#D97706' : '#059669';
    return `
      <div class="pr-budget-row">
        <span>${cat.icon} ${cat.name}</span>
        <span style="color:${color};font-weight:600;">${fmt(spent)} / ${fmt(b.monthly_limit)}</span>
      </div>
      <div class="pr-budget-bar-bg">
        <div class="pr-budget-bar" style="width:${pct}%;background:${color};"></div>
      </div>`;
  }).join('');

  // --- Top categorías ---
  const byCat = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    if (t.category_id) byCat[t.category_id] = (byCat[t.category_id] || 0) + t.amount;
  });
  const topCats = Object.entries(byCat).sort(([, a], [, b]) => b - a).slice(0, 8);
  const catRows = topCats.map(([id, amount]) => {
    const cat = cats.find(c => c.id === id);
    return `<div class="pr-cat-row">
      <span>${cat?.icon ?? ''} ${cat?.name ?? 'Otros'}</span>
      <span style="color:#E11D48;font-weight:600;">-${fmt(amount)}</span>
    </div>`;
  }).join('');

  // --- Transacciones agrupadas por fecha ---
  const groups = {};
  txs.forEach(t => { groups[t.date] = groups[t.date] || []; groups[t.date].push(t); });
  const txRows = Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => {
      const dLabel = new Date(date + 'T00:00:00')
        .toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
      const rows = items.map(t => {
        const cat   = cats.find(c => c.id === t.category_id);
        const sign  = t.type === 'expense' ? '-' : '+';
        const color = t.type === 'expense' ? 'expense' : 'income';
        return `<div class="pr-tx-row">
          <span>${cat?.icon ?? ''} ${cat?.name ?? 'Sin categoría'}${t.note ? ` · ${t.note}` : ''}</span>
          <span class="pr-tx-amount ${color}">${sign}${fmt(t.amount)}</span>
        </div>`;
      }).join('');
      return `<div class="pr-tx-group">
        <div class="pr-tx-date">${dLabel}</div>
        ${rows}
      </div>`;
    }).join('');

  // --- Armar HTML del reporte ---
  $('print-report').innerHTML = `
    <div class="pr-page">
      <div class="pr-header">
        <div>
          <div class="pr-logo">💰 Coach Finanzas</div>
          <div style="font-size:0.8rem;color:#555;margin-top:2px;">Resumen financiero mensual</div>
        </div>
        <div class="pr-month">
          <strong>${profile.name || 'Usuario'}</strong><br>
          ${monthLabel}<br>
          <span style="color:#aaa;">Generado ${new Date().toLocaleDateString('es-PE')}</span>
        </div>
      </div>

      <div class="pr-section">
        <div class="pr-section-title">Resumen del mes</div>
        <div class="pr-stats">
          <div class="pr-stat income">
            <div class="pr-stat-label">Ingresos</div>
            <div class="pr-stat-value">${fmt(income)}</div>
          </div>
          <div class="pr-stat expense">
            <div class="pr-stat-label">Gastos</div>
            <div class="pr-stat-value">${fmt(expenses)}</div>
          </div>
          <div class="pr-stat savings">
            <div class="pr-stat-label">${savings >= 0 ? 'Ahorro' : 'Déficit'}</div>
            <div class="pr-stat-value">${fmt(Math.abs(savings))}</div>
          </div>
        </div>
      </div>

      ${budgetRows ? `
      <div class="pr-section">
        <div class="pr-section-title">Presupuestos del mes</div>
        ${budgetRows}
      </div>` : ''}

      ${catRows ? `
      <div class="pr-section">
        <div class="pr-section-title">Gastos por categoría</div>
        ${catRows}
      </div>` : ''}

      <div class="pr-section">
        <div class="pr-section-title">Detalle de movimientos (${txs.length})</div>
        ${txRows || '<p style="color:#aaa;font-size:0.85rem;">Sin movimientos este mes</p>'}
      </div>

      <div class="pr-footer">
        Coach Finanzas · Reporte generado automáticamente · ${new Date().toLocaleString('es-PE')}
      </div>
    </div>`;

  // Pequeña pausa para que el DOM se actualice, luego imprimir
  setTimeout(() => {
    window.print();
  }, 150);
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
  $('amount-value').textContent = '0';
  $('quickadd-note').classList.add('hidden');
  $('btn-add-note').classList.remove('hidden');
  $('quickadd-note').value = '';
  $('btn-toggle-recurring').style.color = 'var(--text-muted)';
  $('btn-toggle-recurring').style.fontWeight = 'normal';
  $('quickadd-date').value = today();

  document.querySelectorAll('.type-pill').forEach(p=>p.classList.toggle('active', p.dataset.type===type));
  loadQuickAddCategories(type);
  openOverlay('overlay-quickadd');
}

async function loadQuickAddCategories(type) {
  const cats = await Categories.getAll(type === 'income' ? 'income' : 'expense');
  State.categories = cats;

  // Auto-predict
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
  if (amount <= 0 || !State.quickAddCategoryId) {
    toast('Ingresa un monto y selecciona una categoría', 'error'); return;
  }
  const btn = $('btn-save-transaction');
  btn.disabled = true; btn.textContent = 'Guardando...';

  try {
    await Transactions.add({
      user_id: State.user.id,
      type: State.quickAddType,
      amount,
      category_id: State.quickAddCategoryId,
      date: $('quickadd-date').value || today(),
      note: $('quickadd-note').value || null,
      is_recurring: State.quickAddRecurring
    });
    Categorizer.reinforce(amount, State.quickAddCategoryId);
    Streaks.update();
    checkAchievements();
    toast(`Guardado: ${fmt(amount)}`, 'success');
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
  // Entrar directo a la app — sin login
  State.user = Auth.getUser();
  showApp();

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
        t.style.color      = State.quickAddRecurring ? 'var(--emerald)' : 'var(--text-muted)';
        t.style.fontWeight = State.quickAddRecurring ? '700' : 'normal';
        t.textContent      = State.quickAddRecurring ? '🔁 Fijo ✓' : '🔁 Fijo';
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

  $('btn-new-goal').addEventListener('click', () => { initGoalForm(); openOverlay('overlay-goal'); });
  $('form-goal').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await Goals.add({
        user_id: State.user.id,
        name: $('goal-name').value,
        target_amount: parseFloat($('goal-target').value),
        current_amount: parseFloat($('goal-current').value)||0,
        deadline: $('goal-deadline').value,
        icon: goalSelectedIcon,
        color: goalSelectedColor
      });
      toast('¡Meta creada!', 'success');
      checkAchievements();
      closeOverlay('overlay-goal');
      loadGoals();
      e.target.reset();
    } catch { toast('Error al crear meta', 'error'); }
  });

  // -- Contribute --
  $('btn-confirm-contribute').addEventListener('click', async () => {
    const amount = parseFloat($('contribute-amount').value);
    if (!amount||amount<=0) { toast('Ingresa un monto válido', 'error'); return; }
    try {
      await Goals.contribute(State.selectedGoalId, amount, State.user.id, State.selectedGoalName);
      toast(`Aporte de ${fmt(amount)} registrado`, 'success');
      closeOverlay('overlay-contribute');
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

  // -- Links con data-page --
  document.addEventListener('click', e => {
    const link = e.target.closest('[data-page]');
    if (link && !link.classList.contains('tab') && !link.classList.contains('nav-link')) {
      e.preventDefault();
      navigate(link.dataset.page);
    }
  });
}

// Arrancar la app
document.addEventListener('DOMContentLoaded', init);
