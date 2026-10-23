// Presentation only: keep financial values and export data unchanged.
function r14Paid(value, currency=false){return `<span class="r14-paid">${currency?money(value):fmt(value)}</span>`}
function r14Due(value, currency=false){return `<span class="r14-due">${currency?money(value):fmt(value)}</span>`}
function r14MetricTone(label){
  const paid=['التحصيل','التحصيل المخصص','المحصّل','المحصّل المخصص','المدفوع للمصممين','مدفوع للمصممين','دفعات المصممين','إجمالي القبض الفعلي','قبض فعلي','قبض مخصص للمشاريع','مخصص للمشاريع','مسدد بمطابقة السندات'];
  const due=['المتبقي من العقود','رصيد الأتعاب','متبقي التعاقدات','متبقي العقد','متبقي العقود','رصيد تجاوز الاستحقاق','متبقي بعد كامل قبض العميل','متبقي دون مطابقة','إجمالي المطلوب سداده'];
  return paid.includes(label)?'r14-paid':due.includes(label)?'r14-due':'';
}
