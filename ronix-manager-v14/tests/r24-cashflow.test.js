const test = require('node:test');
const assert = require('node:assert/strict');
const R24 = require('../src/r24-cashflow.js');

function ledger() {
  return {
    clientReceipts: [
      {id: 'R1-A', batchId: 'R1', code: 'P1', date: '2026-01-05', amount: 60, cashAmount: 75},
      {id: 'R1-B', batchId: 'R1', code: 'P2', date: '2026-01-05', amount: 40, cashAmount: 50},
      {id: 'ADV-AL', sourceAdvanceId: 'ADV1', code: 'P1', date: '2026-01-11', amount: 30, cashAmount: 30},
      {id: 'R2', code: 'P1', date: '2026-03-01', amount: 25}
    ],
    advances: [{id: 'ADV1', date: '2026-01-07', total: 50}],
    payments: [
      {id: 'PAY1', code: 'P1', date: '2026-01-09', amount: 20},
      {id: 'PAY2', code: 'P2', date: '2026-03-09', amount: 5}
    ],
    projectExpenses: [
      {id: 'EXP1', code: 'P1', date: '2026-01-10', amount: 10},
      {id: 'EXP2', code: 'P1', date: '2026-03-10', amount: 2},
      {id: 'HOURS1', code: 'P1', date: '2026-01-12', amount: 900, expenseType: 'work-hours', cashEffect: false}
    ]
  };
}

test('cash timeline counts split receipt rows once and never counts advance allocation twice', () => {
  const january = R24.periods(ledger(), 'month')[0];
  assert.equal(january.key, '2026-01');
  assert.equal(january.inflow, 175); // 75 + 50 split receipt plus 50 advance.
  assert.equal(january.designer, 20);
  assert.equal(january.expenses, 10);
  assert.equal(january.outflow, 30);
  assert.equal(january.net, 145);
});

test('monthly timeline fills silent months and keeps a true running cash total', () => {
  const rows = R24.periods(ledger(), 'month');
  assert.deepEqual(rows.map(x => x.key), ['2026-01', '2026-02', '2026-03']);
  assert.deepEqual(rows[1], {key: '2026-02', inflow: 0, designer: 0, expenses: 0, outflow: 0, net: 0, running: 145});
  assert.equal(rows[2].inflow, 25);
  assert.equal(rows[2].outflow, 7);
  assert.equal(rows[2].running, 163);
});

test('year view aggregates actual cash receipts and actual cash payments', () => {
  const year = R24.periods(ledger(), 'year');
  assert.deepEqual(year, [{key: '2026', inflow: 200, designer: 25, expenses: 12, outflow: 37, net: 163, running: 163}]);
});

test('project filter excludes unallocated customer advances and other projects', () => {
  const p1 = R24.periods(ledger(), 'year', 'P1')[0];
  assert.deepEqual(p1, {key: '2026', inflow: 100, designer: 20, expenses: 12, outflow: 32, net: 68, running: 68});
});

test('internal work-hour cost is excluded from actual cash flow', () => {
  const entries = R24.entries(ledger());
  assert.equal(entries.some(x => x.source === 'project-expense' && x.amount === 900), false);
  assert.equal(R24.periods(ledger(), 'year')[0].expenses, 12);
});

test('dashboard model limits visible periods without losing full history', () => {
  const d = {clientReceipts: [], advances: [], payments: [], projectExpenses: []};
  for (let month = 1; month <= 14; month++) {
    const date = new Date(Date.UTC(2025, month - 1, 1));
    d.clientReceipts.push({id: 'R' + month, date: date.toISOString().slice(0, 10), amount: month});
  }
  const m = R24.model(d, 'month');
  assert.equal(m.all.length, 14);
  assert.equal(m.visible.length, 12);
  assert.equal(m.visible[0].key, '2025-03');
  assert.equal(m.visible.at(-1).key, '2026-02');
});
