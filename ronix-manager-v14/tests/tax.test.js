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
test('malformed tax rows and mismatched totals are rejected',()=>{
 const base={code:'B',name:'Bad',client:'Client',originalContract:1000,contractCurrency:'EGP',contractRate:1,contractExtras:[],contract:1000};
 assert.throws(()=>R.validate(db({...base,taxItems:[{id:'X',name:'VAT',type:'add',mode:'percent',value:101}]})));
 assert.throws(()=>R.validate(db({...base,taxItems:[{id:'X',name:'VAT',type:'add',mode:'percent',value:14}]})))
});
