/* Display numbers and FX quotes; source IDs, balances and stored money stay exact. */
const R19 = ((R) => {
  const prefixes={claim:'CL',receipt:'RC',payment:'PV',advance:'AD',expense:'EX'};
  function sync(value){
    const d=R.validate(value),groups={
      claim:d.claims,
      receipt:d.clientReceipts.filter(r=>!r.sourceAdvanceId).map(r=>({...r,id:r.batchId||r.id})),
      payment:[...d.payments,...d.deletedPayments.map(x=>x.payment)],
      advance:d.advances,expense:d.projectExpenses
    };
    for(const [kind,rows] of Object.entries(groups)){
      const registered=new Set(d.documentNumbers.filter(x=>x.kind===kind).map(x=>x.id));
      let last=d.documentNumbers.filter(x=>x.kind===kind).reduce((n,x)=>Math.max(n,x.number),0);
      const ordered=rows.slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.id).localeCompare(String(b.id)));
      for(const row of ordered)if(!registered.has(row.id)){
        if(last>=999999999)throw Error('تجاوز تسلسل أرقام المستندات الحد المسموح');
        d.documentNumbers.push({kind,id:row.id,number:++last});registered.add(row.id);
      }
    }
    return d;
  }
  function number(d,kind,id){
    if(kind==='receipt'){
      const row=d.clientReceipts.find(r=>r.id===id||(r.batchId||r.id)===id);
      if(row?.sourceAdvanceId)return number(d,'advance',row.sourceAdvanceId);
      if(row)id=row.batchId||row.id;
    }
    const entry=d.documentNumbers.find(x=>x.kind===kind&&x.id===id);
    return entry?prefixes[kind]+'-'+String(entry.number).padStart(4,'0'):String(id||'—');
  }
  function reference(d,kind,id,ref=''){
    const short=number(d,kind,id);
    // Old automatic references sometimes contain another internal ID. Keep bank references intact.
    const internal=d.documentNumbers.some(x=>x.id===ref)||d.clientReceipts.some(r=>r.id===ref);
    return ref&&!internal&&ref!==id&&ref!==short?short+' · '+ref:short;
  }
  function formatAmount(v){
    const n=Number(v||0),rounded=Math.sign(n)*Math.floor(Math.abs(n)+0.5);
    return (Object.is(rounded,-0)?0:rounded).toLocaleString('en-US',{maximumFractionDigits:0});
  }
  function parseQuote(payload,currency,today){
    if(!['USD','SAR','AED','EUR','GBP','QAR'].includes(currency))throw Error('عملة غير مدعومة للتحديث');
    const date=payload?.date,raw=payload?.[currency.toLowerCase()]?.egp;
    if(!R.dateOK(date)||!R.dateOK(today))throw Error('تاريخ مصدر السعر غير صالح');
    const age=(Date.parse(today)-Date.parse(date))/86400000;
    if(age<0||age>7)throw Error('السعر المنشور قديم أو تاريخه غير صالح؛ أدخل سعر البنك يدويًا');
    if(typeof raw!=='number'||!Number.isFinite(raw)||raw<=0||raw>1000000)throw Error('المصدر لم يعط سعرًا صالحًا لهذه العملة');
    const rate=R.rate(Number(raw.toFixed(6)));
    return {mode:'reference',source:'Currency API',asOf:date,currency,rate};
  }
  return {prefixes,sync,number,reference,formatAmount,parseQuote};
})(typeof module!=='undefined'?require('./finance-core.js'):R14);
if(typeof module!=='undefined')module.exports=R19;
