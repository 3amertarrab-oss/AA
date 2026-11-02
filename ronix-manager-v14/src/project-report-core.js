/* Project dossier calculations and lifecycle events. Pure: no DOM, storage, or network. */
const R25Project = ((R, Links) => {
  const rows = value => Array.isArray(value) ? value : [];
  const dateOK = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
  const amount = value => R.cents(value || 0) / 100;
  const claimRows = (d, code) => rows(d.claims).flatMap(claim => R.claimRows(claim)
    .filter(row => row.code === code)
    .map(row => ({claim, row})));

  function model(d, code) {
    const project = rows(d.projects).find(row => row.code === code);
    if (!project) throw Error('المشروع غير موجود');
    const linked = Links.project(d, code);
    const claims = claimRows(d, code);
    const activeClaims = claims.filter(item => R.active(item.claim));
    const recognizedRevenue = R.sum(activeClaims, item => item.row.accountingAmount ?? item.row.amount ?? 0);
    const receipts = rows(d.clientReceipts).filter(row => row.code === code);
    const assignments = rows(d.assignments).filter(row => row.code === code);
    const designerPayments = rows(d.payments).filter(row => row.code === code);
    const expenses = rows(d.projectExpenses).filter(row => row.code === code);
    const actualCashExpenses = R.sum(expenses.filter(row => row.cashEffect !== false));
    const actualCashIn = R.sum(receipts, R.cashReceipt);
    const actualDesignerCash = R.sum(designerPayments);
    const recordedExpenses = R.sum(expenses);
    const totalCost = linked.cost;
    const currency = R.projectCurrency(project);
    const originalContract = R.originalContract(project);
    const contractRate = R.projectRate(project);
    return {
      project, currency, originalContract, contractRate,
      contractValue: amount(project.contract),
      contractItems: rows(project.contractItems), claims, activeClaims, receipts,
      assignments, designerPayments, expenses,
      claimValue: linked.claims,
      recognizedRevenue,
      claimPaid: linked.matched,
      claimDue: linked.claimDue,
      contractSettlement: linked.received,
      contractRemaining: linked.contractBalance,
      actualCashIn,
      designerCommitments: linked.designers.fees,
      actualDesignerCash,
      actualCashExpenses,
      recordedExpenses,
      totalCost,
      expectedMargin: R.delta(project.contract, totalCost),
      currentResult: R.delta(recognizedRevenue, totalCost),
      actualProfit: R.delta(R.delta(actualCashIn, actualDesignerCash), recordedExpenses),
      cashNet: R.delta(R.delta(actualCashIn, actualDesignerCash), actualCashExpenses),
      warnings: Links.review(d).filter(row => row.code === code)
    };
  }

  function timeline(d, code) {
    const m = model(d, code), out = [], push = event => out.push({date:'', category:'other', flow:'neutral', amount:0, ...event});
    const p = m.project, start = p.projectDate || p.startDate || p.date || p.createdDate || '';
    push({date:dateOK(start) ? start : '', category:'contract', title:'إنشاء عقد المشروع', detail:`قيمة العقد ${m.contractValue}`, amount:m.contractValue, ref:p.code});
    for (const {claim, row} of m.claims) push({date:dateOK(claim.date) ? claim.date : '', category:'claim', title:`مطالبة ${R.status(claim)}`, detail:claim.note || '', amount:amount(row.accountingAmount ?? row.amount), ref:claim.id});
    for (const receipt of m.receipts) push({date:dateOK(receipt.date) ? receipt.date : '', category:'receipt', flow:'in', title:'دفعة عميل', detail:receipt.method || receipt.ref || '', amount:amount(R.cashReceipt(receipt)), ref:receipt.batchId || receipt.id});
    for (const assignment of m.assignments) {
      const date = assignment.recognizedDate || assignment.accruedDate || assignment.approvedDate || '';
      push({date:dateOK(date) ? date : '', category:'designer', title:'تكليف مصمم', detail:assignment.designer || assignment.kind || '', amount:amount(assignment.fee), ref:assignment.id || ''});
    }
    for (const payment of m.designerPayments) push({date:dateOK(payment.date) ? payment.date : '', category:'designer-payment', flow:'out', title:'دفعة مصمم', detail:payment.designer || payment.method || '', amount:amount(payment.amount), ref:payment.id || payment.ref || ''});
    for (const expense of m.expenses) {
      const work = expense.expenseType === 'work-hours' || expense.category === 'ساعات عمل';
      push({date:dateOK(expense.date) ? expense.date : '', category:work ? 'work' : 'expense', flow:expense.cashEffect === false ? 'neutral' : 'out', title:work ? 'ساعات عمل' : 'مصروف مشروع', detail:work ? `${expense.workHours || 0} ساعة · ${expense.payee || expense.workDescription || ''}` : (expense.category || expense.notes || ''), amount:amount(expense.amount), ref:expense.id || expense.ref || ''});
    }
    if (dateOK(p.closedAt)) push({date:p.closedAt, category:'status', title:'إغلاق المشروع', detail:p.closedBy || '', ref:p.code});
    return out.sort((a,b) => String(b.date).localeCompare(String(a.date)) || a.title.localeCompare(b.title));
  }

  return {model, timeline};
})(typeof module !== 'undefined' ? require('./finance-core.js') : R14,
   typeof module !== 'undefined' ? require('./accounting-links.js') : R16);

if (typeof module !== 'undefined') module.exports = R25Project;
