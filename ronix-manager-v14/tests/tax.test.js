const test=require('node:test'),assert=require('node:assert/strict'),R=require('../src/finance-core.js');
function db(project){return R.normalize({projects:[project],assignments:[],payments:[]})}
test('VAT percentage and fixed withholding remain separate and reconcile contract total',()=>{
 const p={code:'T',name:'Taxed',client:'Client',originalContract:1000,contractCurrency:'EGP',contractRate:1,contractExtras:[{id:'E',name:'Extra',date:'2026-10-26',amount:100}],taxItems:[{id:'VAT',name:'VAT',type:'add',mode:'percent',value:14},{id:'WHT',name:'Withholding',type:'deduct',mode:'fixed',value:20}],contract:1234};
 assert.equal(R.projectSubtotal(p),1100);assert.equal(R.projectTaxAmount(p,p.taxItems[0]),154);assert.equal(R.projectTaxAmount(p,p.taxItems[1]),-20);assert.equal(R.projectTaxTotal(p),134);assert.equal(R.projectOriginalTotal(p),1234);assert.equal(R.validate(db(p)).projects[0].contract,1234)
});
test('foreign-currency taxes convert once at the historical project rate',()=>{
 const p={code:'F',name:'FX',client:'Client',originalContract:1000,contractCurrency:'SAR',contractRate:14,contractExtras:[],taxItems:[{id:'VAT',name:'VAT',type:'add',mode:'percent',value:14}],contract:15960};
 assert.equal(R.projectOriginalTotal(p),1140);assert.equal(R.projectBookTotal(p),15960);assert.equal(R.validate(db(p)).projects[0].contract,15960)
});
test('VO supports sequential percentage and fixed increases and discounts',()=>{
 const p={code:'VO',name:'Variation',client:'Client',originalContract:1000,contractCurrency:'EGP',contractRate:1,contractExtras:[
  {id:'V1',name:'زيادة أولى',date:'2026-11-08',type:'increase',mode:'percent',value:10},
  {id:'V2',name:'خصم',date:'2026-11-08',type:'discount',mode:'fixed',value:50},
  {id:'V3',name:'زيادة ثانية',date:'2026-11-08',type:'increase',mode:'percent',value:10}
 ],taxItems:[],contract:1155};
 const rows=R.projectVariations(p);assert.deepEqual(rows.map(x=>x.impact),[100,-50,105]);assert.deepEqual(rows.map(x=>x.runningTotal),[1100,1050,1155]);assert.equal(R.projectSubtotal(p),1155);assert.equal(R.validate(db(p)).projects[0].contract,1155)
});
test('malformed tax rows and mismatched totals are rejected',()=>{
 const base={code:'B',name:'Bad',client:'Client',originalContract:1000,contractCurrency:'EGP',contractRate:1,contractExtras:[],contract:1000};
 assert.throws(()=>R.validate(db({...base,taxItems:[{id:'X',name:'VAT',type:'add',mode:'percent',value:101}]})));
 assert.throws(()=>R.validate(db({...base,taxItems:[{id:'X',name:'VAT',type:'add',mode:'percent',value:14}]})))
});

test('statement item equals quantity times unit price and survives validation',()=>{
 const d=db({code:'P',name:'Project',client:'Client',contract:1000,photos:[],statementItems:[{id:'ST1',date:'2026-10-27',description:'تركيب قواعد',quantity:4.5,unitPrice:100,amount:450,note:'متر'}]});
 assert.equal(R.validate(d).projects[0].statementItems[0].amount,450);
 d.projects[0].statementItems[0].amount=451;
 assert.throws(()=>R.validate(d),/قيمة بند المستخلص/);
});
