/* Cash-flow timeline: actual cash only. Claims and contract values are excluded. */
const R24Cashflow = ((R) => {
  const dateOK = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
  const cash = value => R.cents(value ?? 0) / 100;
  const rows = value => Array.isArray(value) ? value : [];
  const keyFor = (date, mode) => mode === 'year' ? String(date).slice(0, 4) : String(date).slice(0, 7);

  function entries(d, code = '') {
    const out = [];
    const push = (kind, date, amount, source, rowCode = '') => {
      if (!dateOK(date) || (code && rowCode !== code)) return;
      const value = cash(amount);
      if (!value) return;
      out.push({kind, date, amount: value, source, code: rowCode});
    };

    // A split receipt has one row per project. cashAmount belongs to that row,
    // so summing the rows records the bank receipt once. Advance allocations are
    // excluded because their cash was already recorded when the advance arrived.
    for (const r of rows(d.clientReceipts)) {
      if (r.sourceAdvanceId) continue;
      push('inflow', r.date, R.cashReceipt(r), 'receipt', r.code || '');
    }
    // Customer advances are independent cash receipts. Current legacy advances
    // are EGP; future records may persist cashAmount after currency conversion.
    if (!code) for (const a of rows(d.advances)) push('inflow', a.date, a.cashAmount ?? a.total, 'advance');
    for (const p of rows(d.payments)) push('designer', p.date, p.amount, 'designer-payment', p.code || '');
    // Internal time allocation affects project cost and margin, but it is not a
    // bank/cash movement. A later payroll/payment record is the cash event.
    for (const x of rows(d.projectExpenses)) if (x.cashEffect !== false) push('expense', x.date, x.amount, 'project-expense', x.code || '');
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  }

  function nextKey(key, mode) {
    if (mode === 'year') return String(Number(key) + 1).padStart(4, '0');
    const [year, month] = key.split('-').map(Number), date = new Date(Date.UTC(year, month, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  function periods(d, mode = 'month', code = '') {
    if (!['month', 'year'].includes(mode)) throw Error('فترة التدفق غير صالحة');
    const source = entries(d, code), grouped = new Map();
    for (const entry of source) {
      const key = keyFor(entry.date, mode);
      if (!grouped.has(key)) grouped.set(key, {key, inflow: 0, designer: 0, expenses: 0});
      const row = grouped.get(key);
      if (entry.kind === 'inflow') row.inflow = R.sum([{amount: row.inflow}, {amount: entry.amount}]);
      if (entry.kind === 'designer') row.designer = R.sum([{amount: row.designer}, {amount: entry.amount}]);
      if (entry.kind === 'expense') row.expenses = R.sum([{amount: row.expenses}, {amount: entry.amount}]);
    }
    const keys = [...grouped.keys()].sort();
    if (!keys.length) return [];
    // Fill empty calendar periods so the timeline does not hide a month/year
    // with no movement.
    for (let key = keys[0]; key <= keys.at(-1); key = nextKey(key, mode)) {
      if (!grouped.has(key)) grouped.set(key, {key, inflow: 0, designer: 0, expenses: 0});
    }
    let running = 0;
    return [...grouped.values()].sort((a, b) => a.key.localeCompare(b.key)).map(row => {
      const outflow = R.sum([{amount: row.designer}, {amount: row.expenses}]);
      const net = R.delta(row.inflow, outflow);
      running = R.sum([{amount: running}, {amount: net}]);
      return {...row, outflow, net, running};
    });
  }

  function model(d, mode = 'month', code = '') {
    const all = periods(d, mode, code), visible = all.slice(mode === 'month' ? -12 : -8);
    return {
      mode,
      code,
      all,
      visible,
      totals: {
        inflow: R.sum(visible, 'inflow'),
        designer: R.sum(visible, 'designer'),
        expenses: R.sum(visible, 'expenses'),
        outflow: R.sum(visible, 'outflow'),
        net: R.sum(visible, 'net')
      }
    };
  }

  return {entries, periods, model};
})(typeof module !== 'undefined' ? require('./finance-core.js') : R14);

if (typeof module !== 'undefined') module.exports = R24Cashflow;

if (typeof window !== 'undefined') {
  let r24CashflowMode = 'month';

  function r24CashflowLabel(key, mode) {
    if (mode === 'year') return key;
    const [year, month] = key.split('-').map(Number);
    return new Intl.DateTimeFormat('ar-EG', {month: 'short', year: 'numeric', timeZone: 'UTC'}).format(new Date(Date.UTC(year, month - 1, 1)));
  }

  function r24CashflowPanel() {
    const m = R24Cashflow.model(data, r24CashflowMode), max = Math.max(1, ...m.visible.flatMap(x => [x.inflow, x.outflow]));
    const periods = m.visible.map(x => `<article class="r24-flow-period">
      <strong>${esc(r24CashflowLabel(x.key, m.mode))}</strong>
      <div class="r24-flow-bars" aria-label="قبض ${fmt(x.inflow)}، مدفوع ${fmt(x.outflow)}">
        <span class="r24-flow-bar in" style="--value:${Math.max(2, x.inflow / max * 100)}%"><small>${fmt(x.inflow)}</small></span>
        <span class="r24-flow-bar out" style="--value:${Math.max(2, x.outflow / max * 100)}%"><small>${fmt(x.outflow)}</small></span>
      </div>
      <span class="${x.net < 0 ? 'r14-due' : 'r14-paid'}">الصافي: ${fmt(x.net)} ج.م</span>
    </article>`).join('');
    return `<section class="panel r24-cashflow" id="r24Cashflow" aria-label="التدفق النقدي الفعلي">
      <div class="panel-title"><div><h2>التدفق النقدي الفعلي</h2><p class="hint">القبض الفعلي ناقص دفعات المصممين ومصروفات المشاريع. المطالبات والعقود غير المحصلة لا تدخل هنا.</p></div><div class="actions" role="group" aria-label="فترة التدفق"><button type="button" class="btn ${m.mode === 'month' ? 'primary' : ''}" aria-pressed="${m.mode === 'month'}" onclick="r24CashflowSetMode('month')">شهري</button><button type="button" class="btn ${m.mode === 'year' ? 'primary' : ''}" aria-pressed="${m.mode === 'year'}" onclick="r24CashflowSetMode('year')">سنوي</button></div></div>
      <div class="r24-flow-summary"><div><small>القبض الفعلي</small><strong class="r14-paid">${money(m.totals.inflow)}</strong></div><div><small>دفعات المصممين</small><strong>${money(m.totals.designer)}</strong></div><div><small>مصروفات المشاريع</small><strong>${money(m.totals.expenses)}</strong></div><div><small>صافي الفترة</small><strong class="${m.totals.net < 0 ? 'r14-due' : 'r14-paid'}">${money(m.totals.net)}</strong></div></div>
      <div class="r24-flow-legend"><span class="in">القبض</span><span class="out">المدفوع</span></div>
      <div class="r24-flow-timeline">${periods || '<p class="empty">لا توجد حركات نقدية مؤرخة بعد.</p>'}</div>
    </section>`;
  }

  function r24CashflowSetMode(mode) {
    if (!['month', 'year'].includes(mode)) return;
    r24CashflowMode = mode;
    const current = document.getElementById('r24Cashflow');
    if (current) current.outerHTML = r24CashflowPanel();
  }

  const r24CashflowDashboard = ccDashboard;
  ccDashboard = function () { return r24CashflowDashboard() + r24CashflowPanel(); };
}
