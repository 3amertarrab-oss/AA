/* Optional public rate lookup. Nothing is sent except the selected currency. */
function r19ReadRateMeta(id,currency,rate){
  const input=$(id),quote=input?._r19Quote;
  return quote&&quote.currency===currency&&quote.rate===Number(rate)?{...quote}:{mode:'manual',source:'Banque Misr (manual)',asOf:r14Today(),currency,rate:Number(rate)};
}
function r19BindRate(inputId,currencyId,onchange,existing=null,locked=false){
  const input=$(inputId),currency=$(currencyId);if(!input||!currency)return;
  const controls=document.createElement('div');controls.className='r19-rate-controls';
  const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='↻ سعر مرجعي آلي';button.id=inputId+'Update';
  const status=document.createElement('span');status.className='hint';status.id=inputId+'Status';status.setAttribute('role','status');
  const source=document.createElement('a');source.href='https://www.banquemisr.com/en/Home/CAPITAL-MARKETS/Exchange-Rates-and-Currencies';source.target='_blank';source.rel='noopener noreferrer';source.textContent='أسعار بنك مصر الرسمية';source.className='link';
  controls.append(button,source);input.after(controls,status);input._r19Revision=0;
  if(existing?.mode==='reference'&&existing.currency===currency.value&&existing.rate===Number(input.value))input._r19Quote={...existing};
  function describe(){
    button.disabled=locked||currency.value==='EGP';input.readOnly=locked;
    if(locked){status.textContent='سعر التعاقد التاريخي ثابت لوجود حركات. حدّث سعر القبض في سند جديد.';return}
    if(currency.value==='EGP'){status.textContent='1 جنيه = 1 جنيه';return}
    const q=input._r19Quote;
    if(q){
      status.textContent='سعر مرجعي بتاريخ ';
      const date=document.createElement('bdi'),pair=document.createElement('bdi');date.dir='ltr';date.textContent=q.asOf;pair.dir='ltr';pair.textContent=`1 ${q.currency} = ${q.rate} EGP`;
      status.append(date,' · ',pair,'. هذا مرجع عام وليس سعر بنك مصر؛ راجع رابط البنك ثم عدّل الخانة إذا لزم.');
    }else status.textContent='اكتب سعر بنك مصر من الرابط الرسمي، أو استخدم السعر المرجعي العام للمقارنة.';
  }
  const invalidate=()=>{input._r19Revision++;input._r19Quote=null;describe()};
  input.addEventListener('input',invalidate);currency.addEventListener('change',invalidate);
  button.onclick=async()=>{
    if(locked||currency.value==='EGP')return;
    const selected=currency.value,revision=++input._r19Revision,previous=input.value;
    button.disabled=true;status.textContent='جارٍ جلب سعر مرجعي عام للمقارنة…';
    const code=selected.toLowerCase(),urls=[`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${code}.json`,`https://latest.currency-api.pages.dev/v1/currencies/${code}.json`];
    const current=()=>input.isConnected&&$(inputId)===input&&currency.value===selected&&input._r19Revision===revision&&input.value===previous;
    let quote,error;
    for(const url of urls){
      if(!current())return;
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
      try{
        const response=await fetch(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});
        if(!response.ok)throw Error('تعذر الاتصال بمصدر السعر');
        quote=R19.parseQuote(await response.json(),selected,r14Today());break;
      }catch(e){error=e}finally{clearTimeout(timer)}
    }
    if(!current())return;
    if(quote){input.value=quote.rate;input._r19Quote=quote;onchange();describe()}
    else{button.disabled=false;status.textContent='تعذر جلب المرجع العام. بقي السعر السابق؛ افتح أسعار بنك مصر واكتبه يدويًا.';status.title=error?.message||''}
  };
  describe();
}
const r19ReceiptForm=openCustomerReceipt;
openCustomerReceipt=function(client='',batch=''){
  r19ReceiptForm(client,batch);const id=batch?decodeURIComponent(batch):null,row=id?data.clientReceipts.find(r=>(r.batchId||r.id)===id):null;
  $('crRef').parentNode.firstChild.textContent='مرجع التحويل البنكي (اختياري)';
  $('modalBody').insertAdjacentHTML('afterbegin',`<p class="notice">رقم سند القبض: <bdi>${row?esc(r19Doc('receipt',id)):'يُحدد عند الحفظ'}</bdi></p>`);
  r19BindRate('crRate','crCurrency',r15RepriceReceipt,row?.rateQuote);
};
const r19ProjectForm=editProject;
editProject=function(enc){r19ProjectForm(enc);const p=enc?getP(decodeURIComponent(enc)):null,locked=!!(p&&(claimsFor(p.code).length||receiptFor(p.code).length));r19BindRate('pRate','pCurrency',r15PreviewTotals,p?.rateQuote,locked)};
r15Changes=function(){modal('تحديث الأسعار وأرقام السندات · V19',`<ol><li>رابط أسعار بنك مصر الرسمي بجانب سعر الصرف، مع إدخال يدوي وتاريخ حفظ.</li><li>زر السعر الآلي يعطي مرجعًا عامًا للمقارنة ولا يُعرض على أنه سعر بنك مصر.</li><li>أرقام قصيرة ثابتة للمطالبات والسندات، والمبالغ معروضة دون قروش مع حفظ دقة الحساب.</li></ol><p>عند استلام عملة أجنبية راجع عادةً سعر شراء البنك، وعند شراء العملة راجع سعر البيع. اعتمد دائمًا سعر التنفيذ الفعلي الظاهر في مستند التحويل.</p>`)};
r15Help.textContent='✓ ما الجديد · V19';r15Help.onclick=r15Changes;
document.title='RONIX V19 | الحسابات وسعر الصرف';document.querySelector('.sublogo').textContent='PROJECT FINANCE · V19';document.querySelector('.sidebar-footer').innerHTML='RONIX V19 · جنيه مصري<br>حفظ محلي على هذا الجهاز والمتصفح';document.querySelector('.footer').textContent='RONIX V19 · المبالغ معروضة لأقرب وحدة دون تغيير دقة الحساب · احتفظ بنسخة احتياطية';
render();
