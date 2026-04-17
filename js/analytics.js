// =============================================
// ANALYTICS – Motor de inteligencia financiera
// 100% local, sin APIs externas
// =============================================

// ---- FORMATO ----
function fmt(amount, compact = false) {
  if (compact && Math.abs(amount) >= 1000) {
    return CURRENCY_SYMBOL + ' ' + (amount / 1000).toFixed(1) + 'k';
  }
  return CURRENCY_SYMBOL + ' ' + new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(amount);
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
  if (d.getTime() === today.getTime()) return 'Hoy';
  if (d.getTime() === yesterday.getTime()) return 'Ayer';
  return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
}

function fmtDaysLeft(deadline) {
  const days = Math.ceil((new Date(deadline) - new Date()) / 86400000);
  if (days < 0) return 'Vencida';
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  if (days < 30) return `${days} días`;
  if (days < 365) return `${Math.ceil(days/30)} meses`;
  return `${(days/365).toFixed(1)} años`;
}

// ---- STATS ----
function calcMonthStats(transactions) {
  const income = transactions.filter(t => t.type === 'income').reduce((s,t) => s+t.amount, 0);
  const expenses = transactions.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0);
  return { income, expenses, savings: income - expenses };
}

// ---- INSIGHTS ----
function generateInsights(transactions, prevTransactions, categories, budgets = []) {
  const insights = [];
  const expenses = transactions.filter(t => t.type === 'expense');
  const prevExpenses = prevTransactions.filter(t => t.type === 'expense');
  const totalExp = expenses.reduce((s,t) => s+t.amount, 0);
  const prevTotalExp = prevExpenses.reduce((s,t) => s+t.amount, 0);

  // 1. Comparación vs mes anterior
  if (prevTotalExp > 0) {
    const change = ((totalExp - prevTotalExp) / prevTotalExp) * 100;
    if (change > 20) {
      insights.push({ type: 'warning', icon: '📈', priority: 8,
        title: `Gastos +${change.toFixed(0)}% vs mes pasado`,
        desc: `Gastaste ${fmt(totalExp - prevTotalExp)} más que el mes anterior.` });
    } else if (change < -10) {
      insights.push({ type: 'achievement', icon: '🎉', priority: 6,
        title: `Gastos -${Math.abs(change).toFixed(0)}% vs mes pasado`,
        desc: `Excelente control. Ahorraste ${fmt(prevTotalExp - totalExp)} más.` });
    }
  }

  // 2. Tasa de ahorro
  const income = transactions.filter(t => t.type === 'income').reduce((s,t) => s+t.amount, 0);
  if (income > 0) {
    const rate = ((income - totalExp) / income) * 100;
    if (rate < 0) {
      insights.push({ type: 'warning', icon: '🔴', priority: 10,
        title: 'Gastas más de lo que ganas',
        desc: `Tus gastos superan tus ingresos en ${fmt(totalExp - income)}. Actúa ahora.` });
    } else if (rate >= 25) {
      insights.push({ type: 'achievement', icon: '🏆', priority: 6,
        title: `¡Ahorras el ${rate.toFixed(0)}% de tus ingresos!`,
        desc: 'Estás en la zona élite. El objetivo recomendado es 20%. Sigue así.' });
    }
  }

  // 3. Fugas en pequeños gastos
  const small = expenses.filter(t => t.amount < 20);
  const byCat = {};
  small.forEach(t => { if(t.category_id) byCat[t.category_id] = (byCat[t.category_id]||0) + t.amount; });
  Object.entries(byCat).forEach(([catId, total]) => {
    if (total >= 80) {
      const cat = categories.find(c => c.id === catId);
      if (cat) insights.push({ type: 'warning', icon: cat.icon, priority: 7,
        title: `Fuga en ${cat.name}`,
        desc: `Pequeños gastos en ${cat.name} suman ${fmt(total)} este mes.` });
    }
  });

  // 4. Outliers (gastos > 2σ del promedio de su categoría)
  const catAmounts = {};
  expenses.forEach(t => { if(t.category_id) { catAmounts[t.category_id] = catAmounts[t.category_id]||[]; catAmounts[t.category_id].push(t.amount); } });
  Object.entries(catAmounts).forEach(([catId, amounts]) => {
    if (amounts.length < 3) return;
    const avg = amounts.reduce((a,b)=>a+b,0) / amounts.length;
    const std = Math.sqrt(amounts.map(a=>Math.pow(a-avg,2)).reduce((a,b)=>a+b,0) / amounts.length);
    const outliers = amounts.filter(a => a > avg + 2*std);
    if (outliers.length > 0) {
      const cat = categories.find(c => c.id === catId);
      if (cat) insights.push({ type: 'tip', icon: '⚠️', priority: 5,
        title: `Gasto inusual en ${cat.name}`,
        desc: `Un gasto de ${fmt(Math.max(...outliers))} está muy por encima de tu promedio de ${fmt(avg)}.` });
    }
  });

  // 5. Patrón por día de semana
  if (expenses.length >= 14) {
    const days = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const byDay = {};
    expenses.forEach(t => { const d = new Date(t.date+'T00:00:00').getDay(); byDay[d]=(byDay[d]||0)+t.amount; });
    const avg = Object.values(byDay).reduce((a,b)=>a+b,0) / Object.keys(byDay).length;
    Object.entries(byDay).forEach(([day, total]) => {
      if (total / avg >= 2.0) insights.push({ type: 'tip', icon: '📅', priority: 4,
        title: `Los ${days[day]} gastas más`,
        desc: `Tus ${days[day]} gastas ${(total/avg).toFixed(1)}× más que el promedio diario.` });
    });
  }

  return insights.sort((a,b) => b.priority - a.priority).slice(0, 5);
}

// ---- PROYECCIÓN ----
function projectEndOfMonth(transactions) {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const expenses = transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const income = transactions.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const projExp = (expenses / dayOfMonth) * daysInMonth;
  const projInc = income > 0 ? income : (income / dayOfMonth) * daysInMonth;
  return {
    projectedExpenses: projExp,
    projectedIncome: projInc,
    projectedSavings: projInc - projExp,
    confidence: dayOfMonth >= 20 ? 'Alta' : dayOfMonth >= 10 ? 'Media' : 'Baja'
  };
}

// ---- SCORE ----
function calcScore(transactions, goals, budgets, streak) {
  const income = transactions.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expenses = transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);

  // Ahorro (40 pts)
  let savingsScore = 0;
  if (income > 0) savingsScore = Math.min(Math.max(0, (income-expenses)/income) * 160, 40);

  // Consistencia (25 pts)
  let consistencyScore = 0;
  if (streak) {
    const dayOfMonth = new Date().getDate();
    consistencyScore = Math.min((Math.min(streak.current_streak, dayOfMonth) / dayOfMonth) * 25, 25);
  }

  // Presupuestos (20 pts)
  let budgetScore = budgets.length === 0 ? 20 :
    Math.min((budgets.filter(b => b.monthly_limit > 0 && b.current_spent <= b.monthly_limit).length / Math.max(budgets.length,1)) * 20, 20);

  // Metas (15 pts)
  let goalsScore = goals.length === 0 ? 7 :
    Math.min((goals.reduce((s,g) => s + Math.min(g.current_amount/g.target_amount,1), 0) / goals.length) * 15, 15);

  const total = Math.round(savingsScore + consistencyScore + budgetScore + goalsScore);
  const grade = total>=90?'S':total>=80?'A':total>=70?'B':total>=60?'C':total>=45?'D':'F';
  const messages = {
    S:'¡Eres un maestro financiero!', A:'Excelente manejo financiero.',
    B:'Buen camino. Pequeños ajustes te llevarán al nivel A.',
    C:'Promedio. Puedes mejorar tu ahorro o consistencia.',
    D:'Atención: tus finanzas necesitan más disciplina.',
    F:'Empieza por registrar todo esta semana.'
  };
  return { total, grade, message: messages[grade],
    breakdown: {
      savings: Math.round(savingsScore), consistency: Math.round(consistencyScore),
      budgets: Math.round(budgetScore), goals: Math.round(goalsScore)
    }
  };
}

// ---- SIMULADOR ----
function simulateSavings(transactions, categoryId, reductionPct) {
  const current = transactions.filter(t=>t.type==='expense'&&t.category_id===categoryId).reduce((s,t)=>s+t.amount,0);
  const reduced = current * (1 - reductionPct/100);
  return { currentMonthly: current, reducedMonthly: reduced,
    monthlySavings: current-reduced, yearlySavings: (current-reduced)*12 };
}

// ---- AUTO-CATEGORIZACIÓN (local) ----
const Categorizer = {
  _key: 'cat_patterns',
  _load() { try { return JSON.parse(localStorage.getItem(this._key)||'{}'); } catch { return {}; } },
  _save(p) { try { localStorage.setItem(this._key, JSON.stringify(p)); } catch {} },
  _bucket(a) { return a<5?0:a<10?5:a<20?10:a<50?20:a<100?50:a<200?100:a<500?200:500; },
  predict(amount) {
    const p = this._load();
    const h = new Date().getHours();
    const d = new Date().getDay();
    const key = `${h}_${d}_${this._bucket(amount)}`;
    const w = p[key];
    if (!w||!w.length) return null;
    const best = w.reduce((a,b)=>a.weight>b.weight?a:b);
    return best.weight >= 2 ? best.categoryId : null;
  },
  reinforce(amount, categoryId) {
    const p = this._load();
    const h = new Date().getHours();
    const d = new Date().getDay();
    const key = `${h}_${d}_${this._bucket(amount)}`;
    if (!p[key]) p[key] = [];
    const ex = p[key].find(x=>x.categoryId===categoryId);
    if (ex) ex.weight++; else p[key].push({categoryId, weight:1});
    p[key].sort((a,b)=>b.weight-a.weight);
    p[key] = p[key].slice(0,5);
    this._save(p);
  }
};

// ---- CÁLCULO DEUDAS ----
function calcDebtSavings(debt, extraMonthly) {
  const remaining = debt.total - debt.paid;
  const installmentsLeft = debt.installments - debt.paid_installments;
  const rate = debt.interest_rate / 100 / 12;

  if (rate === 0) {
    const basePayment = remaining / installmentsLeft;
    const extraMonths = Math.ceil(remaining / (basePayment + extraMonthly));
    return { monthsToPayOff: extraMonths, interestSaved: 0, monthsSaved: installmentsLeft - extraMonths };
  }

  const payment = (remaining * rate) / (1 - Math.pow(1+rate, -installmentsLeft));
  let balance = remaining, totalInterest = 0;
  for (let i=0; i<installmentsLeft; i++) {
    const interest = balance * rate;
    totalInterest += interest;
    balance -= payment - interest;
  }

  balance = remaining;
  let extraInterest = 0, extraMonths = 0;
  while (balance > 0.01 && extraMonths < 600) {
    const interest = balance * rate;
    extraInterest += interest;
    balance -= payment + extraMonthly - interest;
    extraMonths++;
  }

  return {
    monthsToPayOff: extraMonths,
    interestSaved: totalInterest - extraInterest,
    monthsSaved: installmentsLeft - extraMonths
  };
}
