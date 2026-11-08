/* V20.9: manager/accountant review queue. Accounting impact is immediate; review is explicit. */
function r30Role(){try{return R20Cloud.state.role||'manager'}catch{return'manager'}}
function r30Pending(){return (data.reviews||[]).filter(x=>x.status==='pending')}
function r30Approve(id){
 if(r30Role()!=='manager')return alert('الاعتماد متاح للمدير فقط');
 const email=R20Cloud.state.user?.email||'';
 if(r14Change('اعتماد تعديل المحاسب',d=>{const row=(d.reviews||[]).find(x=>x.id===decodeURIComponent(id));if(!row||row.status!=='pending')throw Error('التعديل معتمد أو غير موجود');row.status='approved';row.approvedAt=new Date().toISOString();row.approvedBy=email},{reviewId:decodeURIComponent(id)})){render();notify('تم اعتماد التعديل')}
}
function r30ReviewPanel(){
 const all=(data.reviews||[]).slice().sort((a,b)=>String(b.at).localeCompare(String(a.at))),pending=all.filter(x=>x.status==='pending'),manager=r30Role()==='manager';
 if(!all.length&&!manager)return'';
 return `<section class="panel r30-review"><div class="panel-title"><div><p class="eyebrow">RONIX / TEAM REVIEW</p><h2>مراجعة تعديلات المحاسب</h2><p class="hint">تؤثر التعديلات فورًا في الحسابات، وتبقى هنا حتى يؤكد المدير أنه راجعها.</p></div><span class="r30-count ${pending.length?'pending':''}">${pending.length} بانتظار المراجعة</span></div><div class="r30-review-list">${all.slice(0,30).map(x=>`<article class="r30-review-row ${x.status}"><div><b>${esc(x.action||'تعديل')}</b><small>${esc(x.by||'المحاسب')} · <bdi>${esc(String(x.at||'').replace('T',' ').slice(0,16))}</bdi>${x.approvedAt?`<br>راجعه ${esc(x.approvedBy||'المدير')} · <bdi>${esc(String(x.approvedAt).replace('T',' ').slice(0,16))}</bdi>`:''}</small></div><span class="r30-status">${x.status==='approved'?'تمت المراجعة':'بانتظار مراجعة المدير'}</span>${manager&&x.status==='pending'?`<button class="btn r30-reviewed" onclick="r30Approve('${r14Encode(x.id)}')">✓ تمت المراجعة</button>`:''}</article>`).join('')||'<p class="empty">لا توجد تعديلات جديدة من المحاسب.</p>'}</div></section>`
}
function r30Decorate(){
 const bar=document.querySelector('#r20CloudBar>strong');if(bar&&typeof R20Cloud!=='undefined'){const role=r30Role()==='accountant'?'المحاسب':'المدير';bar.textContent=`RONIX · ${role}`;bar.dataset.role=r30Role()}
 if(page==='dashboard'&&$('content')&&!$('content').querySelector('.r30-review'))$('content').insertAdjacentHTML('afterbegin',r30ReviewPanel());
}
const r30RenderBase=render;render=function(){r30RenderBase();r30Decorate()};
r30Decorate();
