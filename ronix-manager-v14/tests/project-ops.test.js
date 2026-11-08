const test=require('node:test');
const assert=require('node:assert/strict');
const R24ProjectOps=require('../src/project-ops-core.js');

test('work hours multiply by hourly cost with piastre rounding',()=>{
 assert.equal(R24ProjectOps.workAmount('7.5','120'),900);
 assert.equal(R24ProjectOps.workAmount('1.125','99.99'),112.49);
 assert.throws(()=>R24ProjectOps.workAmount('0','100'),/أكبر من صفر/);
 assert.throws(()=>R24ProjectOps.workAmount('1.0001','100'),/غير صالحة/);
});

test('work rows and totals include only work-hour expenses for the project',()=>{
 const rows=[
  {code:'P1',expenseType:'work-hours',workHours:2,hourlyRate:100,amount:200},
  {code:'P1',category:'ساعات عمل',workHours:1.5,hourlyRate:80,amount:120},
  {code:'P1',category:'نقل',amount:50},
  {code:'P2',expenseType:'work-hours',workHours:4,hourlyRate:100,amount:400}
 ];
 assert.deepEqual(R24ProjectOps.totals(rows,'P1'),{count:2,hours:3.5,amount:320});
});

test('project close state and owner permission are explicit',()=>{
 assert.equal(R24ProjectOps.isClosed({state:'نشط'}),false);
 assert.equal(R24ProjectOps.isClosed({state:'مغلق'}),true);
 assert.equal(R24ProjectOps.isClosed({state:'نشط',closedAt:'2026-11-01'}),true);
 assert.equal(R24ProjectOps.isClosed({state:'مقفل نهائيًا',accountClosedAt:'2026-11-08T12:00:00Z'}),true);
 assert.equal(R24ProjectOps.canClose('3AMERTARRAB@GMAIL.COM'),true);
 assert.equal(R24ProjectOps.canClose('other@example.com'),false);
});
