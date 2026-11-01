/* Project status and work-hour arithmetic. Pure helpers; no storage or DOM. */
const R24ProjectOps=(()=>{
  const OWNER_EMAIL='3amertarrab@gmail.com';
  const closedStates=new Set(['مغلق','منتهي','مكتمل','closed','completed','finished']);
  const normalize=value=>String(value??'').trim().toLowerCase();
  function isClosed(project){return !!project&&(!!project.closedAt||closedStates.has(normalize(project.state)))}
  function canClose(email,owner=OWNER_EMAIL){return normalize(email)===normalize(owner)}
  function scaled(value,places,label){
    const raw=String(value??'').trim();
    if(!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(raw))throw Error(`${label} غير صالحة`);
    const [whole,fraction='']=raw.split('.'),out=BigInt(whole)*(10n**BigInt(places))+BigInt(fraction.padEnd(places,'0'));
    if(out<=0n)throw Error(`${label} يجب أن تكون أكبر من صفر`);
    return out;
  }
  function workAmount(hours,hourlyRate){
    const h=scaled(hours,3,'عدد الساعات'),rate=scaled(hourlyRate,2,'تكلفة الساعة');
    const cents=(h*rate+500n)/1000n;
    if(cents>10000000000000n)throw Error('تكلفة الساعات تتجاوز الحد المدعوم');
    return Number(cents)/100;
  }
  function workRows(rows,code=''){return (rows||[]).filter(x=>(!code||x.code===code)&&(x.expenseType==='work-hours'||(x.category==='ساعات عمل'&&x.workHours!=null)))}
  function totals(rows,code=''){
    const selected=workRows(rows,code),hours=selected.reduce((n,x)=>n+Number(x.workHours||0),0),amountCents=selected.reduce((n,x)=>n+BigInt(Math.round(Number(x.amount||0)*100)),0n);
    return {count:selected.length,hours:Number(hours.toFixed(3)),amount:Number(amountCents)/100};
  }
  return {OWNER_EMAIL,isClosed,canClose,workAmount,workRows,totals};
})();
if(typeof module!=='undefined')module.exports=R24ProjectOps;
