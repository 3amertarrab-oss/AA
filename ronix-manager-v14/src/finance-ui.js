function r19Doc(kind,id){return R19.number(data,kind,id)}
function r19Ref(kind,id,ref=''){return R19.reference(data,kind,id,ref)}
// Presentation only: keep financial values and export data unchanged.
function r14Paid(value, currency=false){return `<span class="r14-paid">${currency?money(value):fmt(value)}</span>`}
function r14Due(value, currency=false){return `<span class="r14-due">${currency?money(value):fmt(value)}</span>`}
function r14MetricTone(label){
  const paid=['دفعات تزيد على الأتعاب','التحصيل','التحصيل المخصص','المحصّل','المحصّل المخصص','المدفوع للمصممين','مدفوع للمصممين','دفعات المصممين','إجمالي القبض الفعلي','قبض فعلي','قبض مخصص للمشاريع','مخصص للمشاريع','مسدد بمطابقة السندات'];
  const due=['مستحق للمصممين','المتبقي من العقود','رصيد الأتعاب','متبقي التعاقدات','متبقي العقد','متبقي العقود','رصيد تجاوز الاستحقاق','متبقي بعد كامل قبض العميل','متبقي دون مطابقة','إجمالي المطلوب سداده'];
  return paid.includes(label)?'r14-paid':due.includes(label)?'r14-due':'';
}

function r14ProofStore(kind){if(!['payment','receipt'].includes(kind))throw Error('نوع مستند غير صالح');return kind==='payment'?'paymentAttachments':'receiptAttachments'}
function r14ProofFile(kind,id){const store=data[r14ProofStore(kind)];return Object.hasOwn(store,id)?store[id]:null}
function r14ReceiptProofKey(row){const batch=row.batchId||row.id;return row.sourceAdvanceId&&(r14ProofFile('receipt',row.sourceAdvanceId)||!r14ProofFile('receipt',batch))?row.sourceAdvanceId:batch}
