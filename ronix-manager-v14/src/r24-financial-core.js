/* RONIX V24 financial statements.
 *
 * This module projects the operational ledgers into balanced double-entry
 * journals.  It never mutates the source data and it never calls a report
 * "ready" until the accounting setup and legacy review are complete.
 */
const R24Financial = ((R) => {
  const DEFAULT_ACCOUNTS = Object.freeze([
    {id:'1100',code:'1100',name:'الصندوق والبنوك',type:'asset',group:'cash'},
    {id:'1200',code:'1200',name:'العملاء',type:'asset',group:'receivable'},
    {id:'1300',code:'1300',name:'مقدمات للمصممين',type:'asset',group:'designer-advance'},
    {id:'1400',code:'1400',name:'الأصول الثابتة',type:'asset',group:'fixed-asset'},
    {id:'1490',code:'1490',name:'مجمع الإهلاك',type:'asset',group:'contra-asset',contra:true},
    {id:'2100',code:'2100',name:'دفعات مقدمة من العملاء',type:'liability',group:'client-advance'},
    {id:'2200',code:'2200',name:'مستحقات المصممين',type:'liability',group:'designer-payable'},
    {id:'2250',code:'2250',name:'أجور مستحقة',type:'liability',group:'wages-payable'},
    {id:'2300',code:'2300',name:'الموردون',type:'liability',group:'supplier-payable'},
    {id:'2400',code:'2400',name:'ضرائب مستحقة',type:'liability',group:'tax-payable'},
    {id:'2500',code:'2500',name:'قروض والتزامات تمويلية',type:'liability',group:'loan'},
    {id:'3100',code:'3100',name:'رأس المال',type:'equity',group:'capital'},
    {id:'3200',code:'3200',name:'أرباح مرحلة',type:'equity',group:'retained-earnings'},
    {id:'4100',code:'4100',name:'إيرادات المشاريع',type:'revenue',group:'project-revenue'},
    {id:'4200',code:'4200',name:'أرباح فروق العملة',type:'revenue',group:'fx-gain'},
    {id:'5100',code:'5100',name:'تكلفة المصممين',type:'expense',group:'project-cost'},
    {id:'5200',code:'5200',name:'مصروفات المشاريع',type:'expense',group:'project-cost'},
    {id:'5300',code:'5300',name:'تكلفة ساعات العمل',type:'expense',group:'project-cost'},
    {id:'6100',code:'6100',name:'مصروفات إدارية وعمومية',type:'expense',group:'operating-expense'},
    {id:'7100',code:'7100',name:'خسائر فروق العملة',type:'expense',group:'fx-loss'}
  ]);

  const ACCOUNT = Object.freeze({
    cash:'1100',receivable:'1200',designerAdvance:'1300',clientAdvance:'2100',
    designerPayable:'2200',wagesPayable:'2250',supplierPayable:'2300',
    revenue:'4100',fxGain:'4200',designerCost:'5100',projectExpense:'5200',
    laborCost:'5300',adminExpense:'6100',fxLoss:'7100'
  });
  // JavaScript's ISO parser does not treat year 0000 consistently.  Keep the
  // default reporting window valid in browsers as well as Node.
  const ISO_MIN='1900-01-01',ISO_MAX='9999-12-31';
  const copy=v=>JSON.parse(JSON.stringify(v));
  const cents=v=>R.cents(v||0);
  const money=v=>cents(v)/100;
  const add=(a,b)=>(cents(a)+cents(b))/100;
  const subtract=(a,b)=>(cents(a)-cents(b))/100;
  const rounded=v=>money(Number(v||0).toFixed(2));
  const sum=(rows,key)=>R.sum(rows,key||'amount');
  const dateOK=v=>R.dateOK(String(v||''));
  const inRange=(date,from,to)=>String(date)>=from&&String(date)<=to;
  const before=(date,from)=>String(date)<from;
  const issue=(code,message,severity='error',source='')=>({code,message,severity,source});

  function accounts(data={}){
    const rows=[...DEFAULT_ACCOUNTS.map(copy),...((data.accounts||[]).map(copy))],seen=new Set(),out=[];
    for(const row of rows){const id=String(row.id||row.code||'').trim();if(!id||seen.has(id))continue;seen.add(id);out.push({...row,id,code:String(row.code||id),name:String(row.name||id)})}
    return out;
  }
  const accountMap=data=>new Map(accounts(data).map(x=>[x.id,x]));
  const cashAccount=(row,settings,map)=>{
    const candidate=String(row?.cashAccountId||settings.defaultCashAccountId||ACCOUNT.cash);
    return map.get(candidate)?.group==='cash'?candidate:ACCOUNT.cash;
  };
  function line(account,debit=0,credit=0,dimensions={}){
    debit=rounded(debit);credit=rounded(credit);
    if(debit<0||credit<0||(debit&&credit))throw Error('طرف قيد غير صالح');
    return {account:String(account),debit,credit,...dimensions};
  }
  function entry(id,date,description,source,lines,extra={}){
    const debit=sum(lines,'debit'),credit=sum(lines,'credit');
    if(cents(debit)!==cents(credit))throw Error('قيد غير متوازن: '+id);
    return {id:String(id),date:String(date),description:String(description||''),source,lines,...extra};
  }
  function claimCurrency(c){return String(c.currency||c.claimCurrency||'EGP')}
  function claimRate(c){return Number(c.exchangeRate||c.claimRate||1)}
  function rowCurrency(c,row){return String(row?.currency||claimCurrency(c))}
  function rowRate(c,row){return Number(row?.claimRate||claimRate(c)||1)}
  function rowOriginal(c,row){return row?.originalAmount!=null?money(row.originalAmount):rowCurrency(c,row)==='EGP'?money(row.amount):R.unfx(row.amount,rowRate(c,row))}
  function claimBook(c,value=c.total){return c.reportingTotal!=null&&value===c.total?money(c.reportingTotal):claimCurrency(c)==='EGP'?money(value):R.fx(value,claimRate(c))}
  function claimRowBook(c,row){return row.accountingAmount!=null?money(row.accountingAmount):row.reportingAmount!=null?money(row.reportingAmount):row.originalAmount!=null?R.fx(row.originalAmount,rowRate(c,row)):claimBook(c,row.amount)}
  function activeClaim(c){return typeof R.active==='function'?R.active(c):['صادرة','معتمدة'].includes(c.status)}
  function recognitionDate(c){return c.recognitionDate||c.approvedDate||c.date}

  function manualEntries(data,map,issues){
    const rows=data.manualJournals||data.journalEntries||[],out=[];
    for(const raw of rows){
      if(raw.status==='draft'||raw.status==='reversed')continue;
      if(!raw.id||!dateOK(raw.date)){issues.push(issue('manual-date','قيد يدوي بلا معرف أو تاريخ صالح','error',raw.id||''));continue}
      const lines=[];
      for(const x of raw.lines||[]){
        const account=String(x.account||x.accountId||'');
        if(!map.has(account)){issues.push(issue('manual-account','حساب غير معروف في القيد '+raw.id,'error',raw.id));continue}
        try{lines.push(line(account,x.debit||0,x.credit||0,{code:x.code||'',client:x.client||'',designer:x.designer||'',currency:x.currency||'EGP',foreignAmount:x.foreignAmount||0,rate:x.rate||1}))}catch(e){issues.push(issue('manual-line',e.message,'error',raw.id))}
      }
      try{if(lines.length)out.push(entry('MAN:'+raw.id,raw.date,raw.description||'قيد يدوي',{kind:'manual',id:raw.id},lines,{kind:raw.kind||raw.type||'manual',cashFlowCategory:raw.cashFlowCategory||raw.cashFlow||'operating'}))}catch(e){issues.push(issue('manual-unbalanced',e.message,'error',raw.id))}
    }
    return out;
  }

  function claimEntries(data,issues){
    const out=[];
    for(const c of data.claims||[]){
      if(!activeClaim(c))continue;
      const date=recognitionDate(c);if(!dateOK(date)){issues.push(issue('claim-date','مطالبة فعالة بلا تاريخ اعتراف صالح','error',c.id));continue}
      const rows=R.claimRows(c);
      for(const [index,row] of rows.entries()){
        let amount;try{amount=claimRowBook(c,row)}catch(e){issues.push(issue('claim-rate','سعر أو مبلغ مطالبة غير صالح','error',c.id));continue}
        if(amount<=0)continue;
        const dims={code:row.code||c.code||'',client:R.claimClient(data,c),currency:rowCurrency(c,row),foreignAmount:rowOriginal(c,row),rate:rowRate(c,row)};
        out.push(entry(`CLAIM:${c.id}:${index}`,date,'إثبات مطالبة '+c.id,{kind:'claim',id:c.id},[
          line(ACCOUNT.receivable,amount,0,dims),line(ACCOUNT.revenue,0,amount,dims)
        ]));
      }
    }
    return out;
  }

  function receiptEntries(data,settings,map,issues){
    const out=[],groups=new Map();
    for(const r of data.clientReceipts||[]){if(r.sourceAdvanceId)continue;const id=r.batchId||r.id;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r)}
    for(const [id,rows] of groups){
      const first=rows[0],date=first.date;if(!dateOK(date)){issues.push(issue('receipt-date','سند قبض بلا تاريخ صالح','error',id));continue}
      let cash;try{cash=sum(rows,r=>R.cashReceipt(r))}catch(e){issues.push(issue('receipt-amount','قيمة قبض غير صالحة','error',id));continue}
      if(cash<=0)continue;const client=R.receiptClient(data,first),account=cashAccount(first,settings,map);
      out.push(entry('RECEIPT:'+id,date,'قبض من العميل '+client,{kind:'receipt',id},[
        line(account,cash,0,{client}),line(ACCOUNT.clientAdvance,0,cash,{client})
      ],{cashFlowCategory:'operating'}));
    }
    for(const a of data.advances||[]){
      if(!dateOK(a.date)){issues.push(issue('advance-date','دفعة مقدمة بلا تاريخ صالح','error',a.id));continue}
      const cash=a.cashAmount??a.total;if(Number(cash)<=0)continue;const account=cashAccount(a,settings,map),client=R.normName(a.client);
      out.push(entry('ADVANCE:'+a.id,a.date,'دفعة مقدمة من العميل '+client,{kind:'advance',id:a.id},[
        line(account,cash,0,{client}),line(ACCOUNT.clientAdvance,0,cash,{client})
      ],{cashFlowCategory:'operating'}));
    }
    return out;
  }

  function settlementNative(data,c,row,s,r){
    if(s.originalAmount!=null)return money(s.originalAmount);
    if(r?.projectAmount!=null&&Number(r.amount))return rounded(Number(r.projectAmount)*Number(s.amount)/Number(r.amount));
    if(rowCurrency(c,row)==='EGP')return money(s.amount);
    const project=(data.projects||[]).find(x=>x.code===s.code),rate=project?R.projectRate(project):rowRate(c,row);
    return R.unfx(s.amount,rate);
  }
  function settlementEntries(data,issues){
    const out=[];
    for(const [index,s] of (data.claimSettlements||[]).entries()){
      const c=(data.claims||[]).find(x=>x.id===s.claimId),r=(data.clientReceipts||[]).find(x=>x.id===s.receiptId);
      if(!c||!r||!activeClaim(c))continue;const date=s.date||r.date;if(!dateOK(date)){issues.push(issue('settlement-date','تسوية مطالبة بلا تاريخ صالح','error',s.claimId));continue}
      const row=R.claimRows(c).find(x=>x.code===s.code)||R.claimRows(c)[0];
      let book,cash,native;try{
        native=settlementNative(data,c,row,s,r);
        book=s.reportingAmount!=null?money(s.reportingAmount):row?.originalAmount!=null?R.fx(native,rowRate(c,row)):money(s.amount);
        cash=s.cashAmount!=null?money(s.cashAmount):(cents(r.amount)?rounded(Number(R.cashReceipt(r))*Number(s.amount)/Number(r.amount)):book);
      }catch(e){issues.push(issue('settlement-amount','قيمة تسوية مطالبة غير صالحة','error',s.claimId));continue}
      const dims={code:s.code||r.code||'',client:R.claimClient(data,c),currency:rowCurrency(c,row),foreignAmount:native,rate:rowRate(c,row)};
      const lines=[line(ACCOUNT.clientAdvance,cash,0,dims),line(ACCOUNT.receivable,0,book,dims)];
      const difference=subtract(cash,book);
      if(difference>0)lines.push(line(ACCOUNT.fxGain,0,difference,dims));
      if(difference<0)lines.push(line(ACCOUNT.fxLoss,-difference,0,dims));
      out.push(entry(`SETTLE:${s.claimId}:${s.receiptId}:${index}`,date,'تسوية مطالبة '+s.claimId,{kind:'settlement',id:s.claimId,receiptId:s.receiptId},lines));
    }
    return out;
  }

  const designerKey=x=>String(x.code||'')+'\u0000'+String(x.designer||'');
  function designerEntries(data,settings,map,issues){
    const out=[],events=[];
    for(const a of data.assignments||[]){
      // Archiving hides an assignment from day-to-day operations; it must not
      // erase an accrued cost or its payable from the accounting history.
      const date=a.recognizedDate||a.accruedDate||a.approvedDate;
      if(!date){if(Number(a.fee||0)>0&&a.accountingStatus!=='commitment')issues.push(issue('assignment-unreviewed','أتعاب مصمم بلا تاريخ اعتماد: '+a.designer,'error',a.id||designerKey(a)));continue}
      if(!dateOK(date)){issues.push(issue('assignment-date','تاريخ اعتماد أتعاب غير صالح','error',a.id||designerKey(a)));continue}
      events.push({kind:'accrual',date,id:a.id||designerKey(a),row:a,amount:a.fee||0,key:designerKey(a)});
    }
    for(const p of data.payments||[]){if(!dateOK(p.date)){issues.push(issue('payment-date','دفعة مصمم بلا تاريخ صالح','error',p.id));continue}events.push({kind:'payment',date:p.date,id:p.id,row:p,amount:p.amount||0,key:designerKey(p)})}
    events.sort((a,b)=>{const dated=String(a.date).localeCompare(String(b.date));if(dated)return dated;const kind=Number(a.kind==='payment')-Number(b.kind==='payment');return kind||String(a.id).localeCompare(String(b.id))});
    const state=new Map();
    for(const e of events){const s=state.get(e.key)||{payable:0,advance:0},r=e.row,dims={code:r.code||'',designer:r.designer||''};
      if(e.kind==='accrual'){
        const amount=money(e.amount);if(amount<=0)continue;
        out.push(entry('FEE:'+e.id,e.date,'اعتماد أتعاب '+r.designer,{kind:'designer-fee',id:e.id},[
          line(ACCOUNT.designerCost,amount,0,dims),line(ACCOUNT.designerPayable,0,amount,dims)
        ]));s.payable=add(s.payable,amount);
        const offset=Math.min(cents(s.payable),cents(s.advance))/100;
        if(offset>0){out.push(entry('FEE-OFFSET:'+e.id,e.date,'تسوية مقدمة مصمم '+r.designer,{kind:'designer-offset',id:e.id},[
          line(ACCOUNT.designerPayable,offset,0,dims),line(ACCOUNT.designerAdvance,0,offset,dims)
        ]));s.payable=subtract(s.payable,offset);s.advance=subtract(s.advance,offset)}
      }else{
        const amount=money(e.amount);if(amount<=0)continue;const applied=Math.min(cents(s.payable),cents(amount))/100,advance=subtract(amount,applied),account=cashAccount(r,settings,map),lines=[];
        if(applied)lines.push(line(ACCOUNT.designerPayable,applied,0,dims));
        if(advance)lines.push(line(ACCOUNT.designerAdvance,advance,0,dims));
        lines.push(line(account,0,amount,dims));
        out.push(entry('PAYMENT:'+e.id,e.date,'دفع للمصمم '+r.designer,{kind:'designer-payment',id:e.id},lines,{cashFlowCategory:'operating'}));
        s.payable=subtract(s.payable,applied);s.advance=add(s.advance,advance);
      }
      state.set(e.key,s);
    }
    return out;
  }

  function expenseEntries(data,settings,map,issues,to=ISO_MAX){
    const out=[];
    for(const x of data.projectExpenses||[]){
      if(x.expenseType==='work-hours'||(x.category==='ساعات عمل'&&x.workHours!=null))continue;
      if(!dateOK(x.date)){issues.push(issue('expense-date','مصروف مشروع بلا تاريخ صالح','error',x.id));continue}
      if(x.date<=to&&x.accountingReviewed!==true&&(x.paymentStatus==null||x.accountId==null))issues.push(issue('expense-unreviewed','مصروف قديم يحتاج تحديد الحساب وحالة الدفع: '+(x.category||x.id),'error',x.id));
      const amount=money(x.amount);if(amount<=0)continue;
      const account=String(x.accountId||ACCOUNT.projectExpense),dims={code:x.code||'',payee:x.payee||''};
      if(!map.has(account)){issues.push(issue('expense-account','حساب مصروف غير معروف','error',x.id));continue}
      const paid=x.cashEffect!==false&&x.paymentStatus!=='unpaid'&&x.paymentStatus!=='accrued',credit=paid?cashAccount(x,settings,map):String(x.payableAccountId||ACCOUNT.supplierPayable);
      out.push(entry('EXPENSE:'+x.id,x.date,'مصروف مشروع '+(x.category||''),{kind:'project-expense',id:x.id},[
        line(account,amount,0,dims),line(credit,0,amount,dims)
      ],{cashFlowCategory:paid?'operating':''}));
    }
    for(const x of data.generalExpenses||[]){
      if(!dateOK(x.date)){issues.push(issue('general-expense-date','مصروف عام بلا تاريخ صالح','error',x.id));continue}
      const amount=money(x.amount);if(amount<=0)continue;const account=String(x.accountId||ACCOUNT.adminExpense),paid=x.paymentStatus!=='unpaid'&&x.paymentStatus!=='accrued',credit=paid?cashAccount(x,settings,map):String(x.payableAccountId||ACCOUNT.supplierPayable);
      out.push(entry('GENERAL-EXPENSE:'+x.id,x.date,'مصروف إداري '+(x.category||''),{kind:'general-expense',id:x.id},[line(account,amount),line(credit,0,amount)],{cashFlowCategory:paid?'operating':''}));
    }
    return out;
  }

  function laborEntries(data,settings,map,issues){
    const out=[];
    const rows=[...(data.laborEntries||[]),...(data.projectExpenses||[]).filter(x=>x.expenseType==='work-hours'||(x.category==='ساعات عمل'&&x.workHours!=null))];
    for(const x of rows){
      const hours=x.hours??x.workHours;
      if(!x.id||!dateOK(x.date)||!Number.isFinite(Number(hours))||Number(hours)<0||!Number.isFinite(Number(x.hourlyRate))||Number(x.hourlyRate)<0){issues.push(issue('labor-invalid','سجل ساعات غير صالح','error',x.id||''));continue}
      const calculated=rounded(Number(hours)*Number(x.hourlyRate)),amount=x.amount==null?calculated:money(x.amount);
      if(cents(amount)!==cents(calculated)){issues.push(issue('labor-total','تكلفة الساعات لا تساوي الساعات × سعر الساعة','error',x.id));continue}
      if(!amount)continue;const paid=x.cashEffect===true||x.paymentStatus==='paid',credit=paid?cashAccount(x,settings,map):String(x.payableAccountId||ACCOUNT.wagesPayable),dims={code:x.code||'',employee:x.employee||x.worker||x.payee||''};
      out.push(entry('LABOR:'+x.id,x.date,'ساعات عمل مشروع '+(x.code||''),{kind:'labor',id:x.id},[line(ACCOUNT.laborCost,amount,0,dims),line(credit,0,amount,dims)],{cashFlowCategory:paid?'operating':''}));
    }
    return out;
  }

  function readiness(data,settings,map,entries,issues,to=ISO_MAX){
    if(!data.accountingSettings)issues.push(issue('settings-missing','لم يكتمل إعداد المحاسبة والعملة الوظيفية','error'));
    if(String(settings.baseCurrency||'EGP')!=='EGP')issues.push(issue('base-currency','القوائم الحالية تتطلب أن تكون العملة الوظيفية EGP','error'));
    const hasOpening=(data.manualJournals||data.journalEntries||[]).some(x=>(x.kind||x.type)==='opening'&&x.status!=='draft'&&x.status!=='reversed');
    if(!hasOpening&&settings.openingComplete!==true)issues.push(issue('opening-missing','لم تُعتمد الأرصدة الافتتاحية أو الإقرار بأنها صفر','error'));
    const defaultCash=String(settings.defaultCashAccountId||'');if(!defaultCash||map.get(defaultCash)?.group!=='cash')issues.push(issue('cash-account-missing','لم يُحدد حساب الصندوق أو البنك الافتراضي','error'));
    const projects=new Map((data.projects||[]).map(p=>[p.code,p]));
    for(const r of data.clientReceipts||[]){const p=projects.get(r.code);if(!p||R.projectCurrency(p)==='EGP'||(dateOK(r.date)&&r.date>to))continue;if(r.projectSettlementRate==null||r.projectAmount==null||r.cashAmount==null)issues.push(issue('foreign-receipt-unconfirmed','تحصيل مشروع أجنبي يحتاج تأكيد مبلغ العملة الأصلية والنقد وسعر التسوية: '+r.id,'error',r.id))}
    for(const c of data.claims||[]){const date=recognitionDate(c);if(dateOK(date)&&date>to)continue;for(const row of R.claimRows(c)){const p=projects.get(row.code);if(!p||R.projectCurrency(p)==='EGP')continue;if(row.originalAmount==null||row.claimRate==null||row.rateSource==='legacy'||row.rateConfirmed===false||row.legacyCurrencyUnconfirmed)issues.push(issue('foreign-claim-unconfirmed','مطالبة مشروع أجنبي تحتاج تأكيد العملة الأصلية وسعر الإصدار: '+c.id,'error',c.id))}}
    const ids=new Set();for(const e of entries.filter(x=>x.date<=to)){if(ids.has(e.id))issues.push(issue('entry-duplicate','معرف قيد مكرر: '+e.id,'error',e.id));ids.add(e.id);const debit=sum(e.lines,'debit'),credit=sum(e.lines,'credit');if(cents(debit)!==cents(credit))issues.push(issue('entry-unbalanced','قيد غير متوازن: '+e.id,'error',e.id));for(const x of e.lines)if(!map.has(x.account))issues.push(issue('entry-account','حساب غير معروف في القيد '+e.id,'error',e.id))}
    return issues;
  }

  function build(data,options={}){
    data=data||{};const settings=data.accountingSettings||{},map=accountMap(data),issues=[],to=options.to||ISO_MAX;
    const entries=[
      ...manualEntries(data,map,issues),...claimEntries(data,issues),...receiptEntries(data,settings,map,issues),
      ...settlementEntries(data,issues),...designerEntries(data,settings,map,issues),...expenseEntries(data,settings,map,issues,to),
      ...laborEntries(data,settings,map,issues)
    ].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id).localeCompare(String(b.id)));
    readiness(data,settings,map,entries,issues,to);
    return {accounts:[...map.values()],entries,issues,ready:!issues.some(x=>x.severity==='error')};
  }

  function closingRateRecord(data,currency,to,beforeExclusive=''){
    const value=data.closingRates;
    if(Array.isArray(value)){
      const rows=value.filter(x=>x&&x.currency===currency&&dateOK(x.date)&&x.date<=to&&(!beforeExclusive||x.date<beforeExclusive)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
      return rows[0]?{rate:Number(rows[0].rate),date:rows[0].date}:null;
    }
    const row=value&&value[currency];if(row==null||beforeExclusive)return null;
    if(typeof row==='object'){
      const date=dateOK(row.date)?row.date:to;if(date>to)return null;
      return {rate:Number(row.rate),date};
    }
    return {rate:Number(row),date:to};
  }
  function foreignBalanceAt(data,c,row,asOf){
    if(recognitionDate(c)>asOf)return {native:0,carrying:0};
    const settlements=(data.claimSettlements||[]).filter(s=>s.claimId===c.id&&s.code===row.code).filter(s=>{const receipt=(data.clientReceipts||[]).find(r=>r.id===s.receiptId);return String(s.date||receipt?.date||'')<=asOf});
    let settledNative=0,settledBook=0;
    for(const s of settlements){const receipt=(data.clientReceipts||[]).find(r=>r.id===s.receiptId),native=settlementNative(data,c,row,s,receipt);settledNative=add(settledNative,native);settledBook=add(settledBook,s.reportingAmount!=null?money(s.reportingAmount):R.fx(native,rowRate(c,row)))}
    return {native:Math.max(0,subtract(rowOriginal(c,row),settledNative)),carrying:Math.max(0,subtract(claimRowBook(c,row),settledBook))};
  }
  function revaluationLines(difference,dims){return difference>0?[line(ACCOUNT.receivable,difference,0,dims),line(ACCOUNT.fxGain,0,difference,dims)]:[line(ACCOUNT.fxLoss,-difference,0,dims),line(ACCOUNT.receivable,0,-difference,dims)]}
  function previousDate(date){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)}
  function revaluationEntries(data,from,to,issues){
    const out=[];
    for(const c of data.claims||[]){
      if(!activeClaim(c)||recognitionDate(c)>to)continue;
      for(const [index,row] of R.claimRows(c).entries()){
        const currency=rowCurrency(c,row);if(currency==='EGP')continue;
        const priorRate=closingRateRecord(data,currency,to,from),currentRate=closingRateRecord(data,currency,to);
        const priorAsOf=previousDate(from);let priorBalance,currentBalance;
        try{priorBalance=priorRate?foreignBalanceAt(data,c,row,priorAsOf):{native:0,carrying:0};currentBalance=foreignBalanceAt(data,c,row,to)}
        catch(e){issues.push(issue('revaluation-settlement','تعذر حساب الرصيد الأجنبي للمطالبة '+c.id,'error',c.id));continue}
        let priorAdjustment=0;
        if(priorRate&&(cents(priorBalance.native)||cents(priorBalance.carrying))){
          if(!Number.isFinite(priorRate.rate)||priorRate.rate<=0){issues.push(issue('closing-rate-missing','سعر إقفال '+currency+' غير صالح في '+priorRate.date,'error',c.id));continue}
          priorAdjustment=subtract(R.fx(priorBalance.native,priorRate.rate),priorBalance.carrying);
          if(cents(priorAdjustment)){
            const dims={code:row.code||'',client:R.claimClient(data,c),currency,foreignAmount:priorBalance.native,rate:priorRate.rate};
            out.push(entry(`REVALUE-OPEN:${c.id}:${index}:${from}:${priorRate.date}`,priorAsOf,'رصيد إعادة تقييم سابق لمطالبة '+c.id,{kind:'revaluation-opening',id:c.id},revaluationLines(priorAdjustment,dims)));
          }
        }
        let currentAdjustment=0;
        if(cents(currentBalance.native)||cents(currentBalance.carrying)){
          if(!currentRate||!Number.isFinite(currentRate.rate)||currentRate.rate<=0){issues.push(issue('closing-rate-missing','سعر إقفال '+currency+' غير مسجل حتى '+to,'error',c.id));continue}
          currentAdjustment=subtract(R.fx(currentBalance.native,currentRate.rate),currentBalance.carrying);
        }
        // The opening revaluation is already part of the opening balance.  The
        // period receives only the movement to the current cumulative amount.
        const movement=subtract(currentAdjustment,priorAdjustment);if(!cents(movement))continue;
        const rate=currentRate?.rate||priorRate?.rate||rowRate(c,row),dims={code:row.code||'',client:R.claimClient(data,c),currency,foreignAmount:currentBalance.native,rate};
        out.push(entry(`REVALUE:${c.id}:${index}:${to}`,to,'حركة إعادة تقييم رصيد مطالبة '+c.id,{kind:'revaluation',id:c.id},revaluationLines(movement,dims)));
      }
    }
    return out;
  }

  function signature(entries,from,to,context={}){
    const accountDefinitions=(context.accounts||[]).map(x=>[String(x.id),String(x.code||''),String(x.name||''),String(x.type||''),String(x.group||''),!!x.contra]).sort((a,b)=>a[0].localeCompare(b[0])),settings=context.settings||{};
    const signedEntries=entries.filter(e=>e.date<=to).map(e=>[e.id,e.date,e.kind||'',e.cashFlowCategory||'',e.lines.map(x=>[x.account,x.debit,x.credit])]);
    const text=JSON.stringify(signedEntries)+'|'+from+'|'+to+'|'+JSON.stringify({accounts:accountDefinitions,baseCurrency:settings.baseCurrency||'EGP',defaultCashAccountId:settings.defaultCashAccountId||''});
    let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}
    return 'R24-'+(hash>>>0).toString(16).padStart(8,'0');
  }

  const normalBalance=(a,debit,credit)=>a.type==='asset'||a.type==='expense'?subtract(debit,credit):subtract(credit,debit);
  function accountRows(accounts,entries,from,to){
    return accounts.map(a=>{const prior=entries.filter(e=>before(e.date,from)).flatMap(e=>e.lines).filter(x=>x.account===a.id),period=entries.filter(e=>inRange(e.date,from,to)).flatMap(e=>e.lines).filter(x=>x.account===a.id),all=[...prior,...period],debit=sum(all,'debit'),credit=sum(all,'credit'),periodDebit=sum(period,'debit'),periodCredit=sum(period,'credit');return {...a,opening:normalBalance(a,sum(prior,'debit'),sum(prior,'credit')),debit,credit,periodDebit,periodCredit,balance:normalBalance(a,debit,credit)}}).filter(x=>cents(x.debit)||cents(x.credit));
  }
  function trialBalance(rows){
    const debit=sum(rows,'debit'),credit=sum(rows,'credit'),periodDebit=sum(rows,'periodDebit'),periodCredit=sum(rows,'periodCredit');
    return {rows:rows.map(x=>({...x,balanceDebit:x.type==='asset'||x.type==='expense'?Math.max(0,x.balance):Math.max(0,-x.balance),balanceCredit:x.type==='asset'||x.type==='expense'?Math.max(0,-x.balance):Math.max(0,x.balance)})),debit,credit,periodDebit,periodCredit,difference:subtract(debit,credit),balanced:cents(debit)===cents(credit)};
  }
  function incomeStatement(rows){
    const revenueRows=rows.filter(x=>x.type==='revenue'),expenseRows=rows.filter(x=>x.type==='expense'),costRows=expenseRows.filter(x=>x.group==='project-cost'),fxGainRows=revenueRows.filter(x=>x.group==='fx-gain'),projectRevenueRows=revenueRows.filter(x=>x.group!=='fx-gain'),fxLossRows=expenseRows.filter(x=>x.group==='fx-loss'),operatingRows=expenseRows.filter(x=>x.group!=='project-cost'&&x.group!=='fx-loss');
    const movement=x=>x.type==='revenue'?subtract(x.periodCredit,x.periodDebit):subtract(x.periodDebit,x.periodCredit);
    const total=list=>sum(list.map(x=>({amount:movement(x)})));
    const projectRevenue=total(projectRevenueRows),projectCosts=total(costRows),grossProfit=subtract(projectRevenue,projectCosts),operatingExpenses=total(operatingRows),fxGain=total(fxGainRows),fxLoss=total(fxLossRows),netProfit=add(subtract(grossProfit,operatingExpenses),subtract(fxGain,fxLoss));
    return {revenueRows:projectRevenueRows.map(x=>({...x,amount:movement(x)})),projectRevenue,expenseRows:expenseRows.map(x=>({...x,amount:movement(x)})),costRows:costRows.map(x=>({...x,amount:movement(x)})),projectCosts,grossProfit,operatingRows:operatingRows.map(x=>({...x,amount:movement(x)})),operatingExpenses,fxGain,fxLoss,netProfit};
  }
  function cumulativeProfit(rows){return sum(rows.filter(x=>x.type==='revenue').map(x=>({amount:x.balance}))) - sum(rows.filter(x=>x.type==='expense').map(x=>({amount:x.balance}))) }
  function balanceSheet(rows){
    const assets=rows.filter(x=>x.type==='asset').map(x=>({...x,amount:x.balance})),liabilities=rows.filter(x=>x.type==='liability').map(x=>({...x,amount:x.balance})),equity=rows.filter(x=>x.type==='equity').map(x=>({...x,amount:x.balance})),currentEarnings=rounded(cumulativeProfit(rows));
    const totalAssets=sum(assets),totalLiabilities=sum(liabilities),bookEquity=sum(equity),totalEquity=add(bookEquity,currentEarnings),difference=subtract(totalAssets,add(totalLiabilities,totalEquity));
    return {assets,totalAssets,liabilities,totalLiabilities,equity,currentEarnings,totalEquity,difference,balanced:cents(difference)===0};
  }
  function cashFlow(accounts,entries,from,to){
    const cashIds=new Set(accounts.filter(x=>x.group==='cash').map(x=>x.id)),cashChange=e=>sum(e.lines.filter(x=>cashIds.has(x.account)).map(x=>({amount:subtract(x.debit,x.credit)}))),openingEntries=entries.filter(e=>before(e.date,from)||(e.kind==='opening'&&e.date===from)),periodEntries=entries.filter(e=>inRange(e.date,from,to)&&e.kind!=='opening'),openingCash=sum(openingEntries.map(e=>({amount:cashChange(e)}))),rows=periodEntries.map(e=>({...e,amount:cashChange(e),category:e.cashFlowCategory||'operating'})).filter(x=>cents(x.amount)),category=k=>sum(rows.filter(x=>x.category===k),'amount'),operating=category('operating'),investing=category('investing'),financing=category('financing'),netChange=sum([{amount:operating},{amount:investing},{amount:financing}]),closingCash=add(openingCash,netChange),ledgerClosingCash=sum(entries.filter(e=>e.date<=to).map(e=>({amount:cashChange(e)}))),difference=subtract(closingCash,ledgerClosingCash);
    return {rows,openingCash,operating,investing,financing,netChange,closingCash,ledgerClosingCash,difference,reconciled:cents(difference)===0};
  }
  function report(data,{from=ISO_MIN,to=ISO_MAX}={}){
    if(!dateOK(from)||!dateOK(to)||from>to)throw Error('فترة القوائم غير صالحة');
    const built=build(data,{to}),issues=[...built.issues],entries=[...built.entries,...revaluationEntries(data,from,to,issues)].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id).localeCompare(String(b.id))),rows=accountRows(built.accounts,entries,from,to),trial=trialBalance(rows),income=incomeStatement(rows),position=balanceSheet(rows),flow=cashFlow(built.accounts,entries,from,to);
    if(!trial.balanced)issues.push(issue('trial-unbalanced','ميزان المراجعة غير متوازن','error'));
    if(!position.balanced)issues.push(issue('position-unbalanced','قائمة المركز المالي غير متوازنة','error'));
    if(!flow.reconciled)issues.push(issue('cash-unreconciled','التدفق النقدي لا يطابق رصيد النقدية','error'));
    const ready=!issues.some(x=>x.severity==='error'),reportSignature=signature(entries,from,to,{accounts:built.accounts,settings:data.accountingSettings||{}}),closed=(data.fiscalClosings||[]).find(x=>x.from===from&&x.to===to&&x.status==='closed');
    return {from,to,ready,certified:ready&&closed?.signature===reportSignature,signature:reportSignature,issues,entries,trialBalance:trial,incomeStatement:income,balanceSheet:position,cashFlow:flow};
  }

  function weightedProjectRate(data,code){
    const rows=(data.clientReceipts||[]).filter(r=>r.code===code&&!r.sourceAdvanceId),native=sum(rows,r=>r.projectAmount??R.unfx(r.amount,r.bookRate||1)),cash=sum(rows,r=>R.cashReceipt(r));
    return {native,cash,rate:native?Number((cash/native).toFixed(6)):0};
  }

  return {DEFAULT_ACCOUNTS,ACCOUNT,accounts,build,report,weightedProjectRate,signature};
})(typeof module!=='undefined'?require('./finance-core.js'):R14);
if(typeof module!=='undefined')module.exports=R24Financial;
