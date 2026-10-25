/* Customer directory, preserving the legacy name-based ledger without merging accounts. */
const R18Clients=((R)=>{
  const clean=v=>String(v??'').trim().replace(/\s+/g,' ');
  const key=v=>clean(v).normalize('NFC').toLocaleLowerCase('en');
  function sourceNames(d){return [...new Set([
    ...d.customers.map(c=>c.name),...d.projects.map(p=>p.client),...d.claims.map(c=>c.client),
    ...d.clientReceipts.map(r=>r.client),...d.advances.map(a=>a.client),...d.openingBalances.map(o=>o.client),
    ...d.trashRecords.flatMap(x=>x.projects.map(p=>p.client))
  ].map(R.normName).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'))}
  function newId(name,used){
    let h=2166136261;for(const ch of name){h^=ch.codePointAt(0);h=Math.imul(h,16777619)>>>0}
    const base='C-'+h.toString(16);let id=base,i=1;while(used.has(id))id=base+'-'+i++;return id;
  }
  function sync(value){
    const d=R.validate(value),names=new Set(d.customers.map(c=>R.normName(c.name))),ids=new Set(d.customers.map(c=>c.id));
    for(const name of sourceNames(d))if(!names.has(name)){
      const id=newId(name,ids);ids.add(id);names.add(name);d.customers.push({id,name,phone:'',email:'',note:''});
    }
    return d;
  }
  function resolveName(value,raw){
    const d=sync(value),exact=R.normName(raw),name=clean(raw);if(!name)throw Error('اختر عميلًا من القائمة أو اكتب اسم عميل جديد');
    const same=d.customers.find(c=>c.name===exact);if(same)return same.name;
    const similar=d.customers.filter(c=>key(c.name)===key(name));
    if(similar.length>1)throw Error('توجد أسماء عملاء متشابهة في البيانات القديمة؛ اختر العميل المطلوب من القائمة');
    return similar[0]?.name||name;
  }
  function save(value,record){
    const d=sync(value),old=record.id?d.customers.find(c=>c.id===record.id):null;
    if(record.id&&!old)throw Error('العميل غير موجود');
    const name=old&&R.normName(record.name)===old.name?old.name:clean(record.name);
    if(!name)throw Error('اسم العميل مطلوب');
    if((!old||name!==old.name)&&d.customers.some(c=>c!==old&&(c.name===name||key(c.name)===key(name))))throw Error('يوجد عميل بهذا الاسم؛ اختره بدل إنشاء حساب مكرر');
    const next={...old,id:old?.id||newId(name,new Set(d.customers.map(c=>c.id))),name,phone:String(record.phone||'').trim(),email:String(record.email||'').trim(),note:String(record.note||'').trim()};
    if(old){
      const previous=old.name;
      // Rename all current references in one transaction. Historical snapshots remain unchanged.
      if(name!==previous){
        for(const table of ['projects','claims','clientReceipts','advances','openingBalances'])for(const row of d[table])if(R.normName(row.client)===previous)row.client=name;
        for(const x of d.trashRecords)for(const p of x.projects)if(R.normName(p.client)===previous)p.client=name;
      }
      d.customers[d.customers.indexOf(old)]=next;
    }else d.customers.push(next);
    return R.validate(d);
  }
  return {clean,key,sourceNames,sync,resolveName,save};
})(typeof module!=='undefined'?require('./finance-core.js'):R14);
if(typeof module!=='undefined')module.exports=R18Clients;
