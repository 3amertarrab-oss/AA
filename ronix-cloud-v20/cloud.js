/* V20 adapter: one durable pending transaction, server compare-and-swap, private user cache. */
const R20Cloud=(()=>{
  const cfg=window.RONIX_CLOUD_CONFIG;
  const client=supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'ronix-v20-auth'}});
  const S={user:null,key:'',disk:null,env:null,ready:false,busy:false,conflict:false,error:'',notice:'',epoch:0};
  const bar=document.createElement('div');bar.id='r20CloudBar';bar.innerHTML='<strong>RONIX · متصل بحسابك</strong><span id="r20SyncState" role="status"></span><div class="actions"><button class="btn" id="r20Refresh">تحديث / مزامنة</button><button class="btn" id="r20Backup">نسخة احتياطية</button><button class="btn" id="r20Recovery">نسخ التعارض</button><button class="btn" id="r20Logout">خروج</button></div><div id="r20Conflict" hidden><p>توجد نسخة أحدث من جهاز آخر. تعديلات هذا الجهاز محفوظة ولم تُكتب فوق الحسابات المشتركة.</p><button class="btn" id="r20KeepLocal">تنزيل تعديلاتي</button><button class="btn primary" id="r20UseServer">حفظ نسخة من تعديلاتي وفتح أحدث حسابات</button></div>';
  document.querySelector('.main').prepend(bar);
  const menuButton=document.createElement('button');menuButton.id='r20Menu';menuButton.className='btn r20-mobile-only';menuButton.textContent='☰ الأقسام';menuButton.setAttribute('aria-expanded','false');bar.prepend(menuButton);
  const shade=document.createElement('div');shade.id='r20MenuShade';shade.hidden=true;document.body.append(shade);
  function setMenu(open){document.querySelector('.side').classList.toggle('r20-open',open);menuButton.setAttribute('aria-expanded',String(open));shade.hidden=!open}
  menuButton.onclick=()=>setMenu(menuButton.getAttribute('aria-expanded')!=='true');shade.onclick=()=>setMenu(false);
  const oldGo=go;go=function(...args){oldGo(...args);setMenu(false)};
  const gate=document.createElement('section');gate.id='r20Gate';gate.innerHTML=`<div class="r20-login"><img src="${R14_LOGO}" alt="RONIX"><h1>حسابات RONIX</h1><p>نفس الحساب على اللابتوب والآيفون</p><form id="r20LoginForm"><label>البريد الإلكتروني<input id="r20Email" type="email" autocomplete="username" required></label><label>كلمة المرور<input id="r20Password" type="password" autocomplete="current-password" required></label><button class="btn primary" type="submit">دخول</button></form><p id="r20LoginStatus" role="status"></p><a href="setup.html" target="_blank" rel="noopener">إعداد المشروع لأول مرة</a><p class="hint">استخدم حساب RONIX الذي أنشأته في Authentication داخل Supabase.</p></div>`;document.body.append(gate);
  function key(uid){return 'ronix-v20-ledger:'+uid}
  function normalize(value){return R19.sync(R18Clients.sync(R14.validate(value)))}
  function readEnvelope(raw,uid){
    if(!raw)return null;const x=JSON.parse(raw);
    if(x.owner!==uid||!Number.isSafeInteger(x.revision)||x.revision<0||typeof x.dirty!=='boolean'||(x.dirty&&typeof x.mutation!=='string'))throw Error('النسخة المحلية لا تخص حساب الدخول أو غير صالحة');
    x.payload=normalize(x.payload);return x;
  }
  function adopt(env){S.env=env;data=R14.copy(env.payload);r14Saved=JSON.stringify(data);r14Disk=r14Saved;r14BootIssue=''}
  function write(env){
    if(localStorage.getItem(S.key)!==S.disk)throw Error('تغيرت النسخة في نافذة أخرى. اضغط تحديث قبل التسجيل.');
    const raw=JSON.stringify(env);localStorage.setItem(S.key,raw);S.disk=raw;adopt(env);
  }
  function status(){
    const el=$('r20SyncState');if(!el)return;
    el.textContent=S.conflict?'تعارض يحتاج مراجعة':S.busy?'جارٍ المزامنة…':S.error||S.notice||(!navigator.onLine?'دون اتصال — آخر نسخة على الجهاز':S.env?.dirty?'حفظ محلي — بانتظار المزامنة':S.ready?'تمت المزامنة · النسخة '+S.env.revision:'جارٍ فتح الحساب…');
    el.dataset.state=S.conflict||S.error?'error':S.env?.dirty||!navigator.onLine?'pending':'ok';
    $('r20Conflict').hidden=!S.conflict;$('r20Refresh').disabled=S.busy;$('r20UseServer').disabled=S.busy;
  }
  function errorText(error){
    const msg=String(error?.message||error||'');
    if(/RONIX_ACCESS_DENIED/.test(msg))return 'هذا البريد غير مفعّل للبرنامج. أضفه في صفحة إعداد المشروع.';
    if(/PGRST202|Could not find the function|schema cache/.test(msg)||error?.code==='PGRST202')return 'إعداد قاعدة البيانات غير مكتمل. افتح «إعداد المشروع» وشغّل ملف SQL أولًا.';
    if(/Invalid login credentials/.test(msg))return 'راجع البريد وكلمة المرور لحساب RONIX.';
    if(/quota|storage|exceeded/i.test(msg))return 'مساحة الحفظ المحلية غير كافية؛ البيانات السابقة باقية. نزّل نسخة احتياطية.';
    return msg.includes('تغيرت النسخة')?msg:'تعذر الاتصال أو إتمام المزامنة. بيانات هذا الجهاز باقية؛ أعد المحاولة.';
  }
  async function rpc(name,args={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{const result=await client.rpc(name,args).abortSignal(controller.signal);if(result.error)throw result.error;return result.data}finally{clearTimeout(timer)}
  }
  async function loadRemote(){
    const owner=S.user.id,result=await rpc('ronix_load');
    if(!Number.isSafeInteger(result?.revision)||result.revision<0)throw Error('نسخة الخادم غير صالحة');
    const payload=result.payload===null?r14Empty():await R20Media.unpack(result.payload,owner,async path=>{
      const r=await client.storage.from('ronix-files').download(path);if(r.error)throw r.error;return r.data.arrayBuffer();
    });
    return {owner,revision:result.revision,payload:normalize(payload),dirty:false,mutation:null};
  }
  async function archive(env){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open('ronix-v20-recovery',1);req.onupgradeneeded=()=>req.result.createObjectStore('versions',{keyPath:'id'});req.onerror=()=>reject(req.error);
      req.onsuccess=()=>{const db=req.result,tx=db.transaction('versions','readwrite');tx.objectStore('versions').put({id:crypto.randomUUID(),at:new Date().toISOString(),owner:env.owner,env:R14.copy(env)});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}};
    });
  }
  async function recovery(){
    try{
      const rows=await new Promise((resolve,reject)=>{const req=indexedDB.open('ronix-v20-recovery',1);req.onupgradeneeded=()=>req.result.createObjectStore('versions',{keyPath:'id'});req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,q=db.transaction('versions').objectStore('versions').getAll();q.onsuccess=()=>{db.close();resolve(q.result)};q.onerror=()=>reject(q.error)}});
      modal('نسخ التعارض المحفوظة',`<p>هذه نسخ محلية للمراجعة. لا تُرفع فوق الحسابات تلقائيًا.</p><div id="r20RecoveryRows"></div>`);
      for(const row of rows.filter(x=>x.owner===S.user.id).sort((a,b)=>b.at.localeCompare(a.at))){const b=document.createElement('button');b.className='btn';b.textContent='تنزيل '+new Date(row.at).toLocaleString('ar-EG');b.onclick=()=>download('RONIX_Recovery_'+row.at.replace(/[:.]/g,'-')+'.json',JSON.stringify(row.env.payload,null,2),'application/json');$('r20RecoveryRows').append(b)}
      if(!$('r20RecoveryRows').childElementCount)$('r20RecoveryRows').textContent='لا توجد نسخ تعارض.';
    }catch(e){alert('تعذر فتح نسخ التعارض المحلية')}
  }
  async function flush(){
    if(!S.ready||!S.env?.dirty||S.busy||S.conflict)return;
    if(!navigator.onLine){status();return}
    const epoch=S.epoch,env=R14.copy(S.env);S.busy=true;S.error='';status();
    try{
      const packed=await R20Media.pack(env.payload,env.owner,async(path,bytes,mime)=>{
        if(epoch!==S.epoch)throw Error('تغير الحساب');
        const r=await client.storage.from('ronix-files').upload(path,bytes,{contentType:mime,upsert:false});
        if(r.error&&String(r.error.statusCode)!=='409'&&!/already exists|Duplicate/i.test(r.error.message||''))throw r.error;
      });
      if(epoch!==S.epoch)return;
      const result=await rpc('ronix_commit',{expected_revision:env.revision,mutation_id:env.mutation,next_payload:packed});
      if(epoch!==S.epoch)return;
      if(result.status==='conflict'){S.conflict=true;return}
      if(result.status!=='saved'||!Number.isSafeInteger(result.revision)||result.revision<=env.revision)throw Error('استجابة حفظ غير صالحة');
      write({...env,revision:result.revision,dirty:false,mutation:null});S.notice='';
    }catch(e){if(epoch===S.epoch)S.error=errorText(e)}finally{if(epoch===S.epoch){S.busy=false;status()}}
  }
  async function refresh(){
    if(!S.user||S.busy)return;
    // A newer local envelope can belong to another open tab of this same account.
    const disk=localStorage.getItem(S.key);
    if(disk!==S.disk){
      if($('overlay').classList.contains('open')){S.error='أغلق نموذج الإدخال ثم اضغط تحديث لتحميل تغيير النافذة الأخرى.';status();return}
      const env=readEnvelope(disk,S.user.id);S.disk=disk;if(env){adopt(env);S.conflict=false;render()}
    }
    if(S.env?.dirty){await flush();return}
    if(!navigator.onLine){status();return}
    const epoch=S.epoch;S.busy=true;S.error='';S.notice='';status();
    try{
      const head=await rpc('ronix_head');if(epoch!==S.epoch)return;
      if(head!==S.env?.revision){
        if($('overlay').classList.contains('open')){S.notice='وصلت تعديلات من جهاز آخر؛ حفظ النموذج سيُبقي تعديلك للمراجعة.';return}
        const env=await loadRemote();if(epoch!==S.epoch)return;write(env);render();
      }
    }catch(e){if(epoch===S.epoch)S.error=errorText(e)}finally{if(epoch===S.epoch){S.busy=false;status()}}
  }
  async function useServer(){
    if(!S.conflict||S.busy)return;
    const epoch=S.epoch;S.busy=true;status();
    try{
      const remote=await loadRemote();if(epoch!==S.epoch)return;
      await archive(S.env);if(epoch!==S.epoch)return;
      write(remote);S.conflict=false;S.error='';S.notice='';closeModal();render();notify('حُفظت تعديلاتك في «نسخ التعارض»، وفُتحت أحدث حسابات مشتركة.');
    }catch(e){if(epoch===S.epoch)S.error=errorText(e)}finally{if(epoch===S.epoch){S.busy=false;status()}}
  }
  function persist(next,action='حفظ',details={}){
    try{
      if(!S.ready||!S.user)throw Error('سجّل الدخول أولًا');
      if(S.conflict)throw Error('راجع تعارض الحسابات أولًا');
      if(S.env?.dirty||S.busy)throw Error('توجد عملية بانتظار المزامنة. اضغط تحديث / مزامنة قبل تسجيل حركة أخرى.');
      if(S.error)throw Error('اضغط تحديث قبل حفظ حركة جديدة');
      const linked=R16.reconcile(next),checked=normalize(linked.data);checked.schemaVersion=19;checked.currency='EGP';
      const before=JSON.parse(r14Saved).claimSettlements||[];
      if(JSON.stringify(before)!==JSON.stringify(checked.claimSettlements))checked.auditTrail.push({id:r14Id('AUD'),at:new Date().toISOString(),action:'تحديث ربط التحصيل بالمطالبات',before,after:R14.copy(checked.claimSettlements)});
      checked.auditTrail.push({id:r14Id('AUD'),at:new Date().toISOString(),action,...details});
      write({...S.env,payload:checked,dirty:true,mutation:crypto.randomUUID()});status();queueMicrotask(flush);return true;
    }catch(e){r14Failures++;data=JSON.parse(r14Saved);alert('لم تُحفظ الحركة الجديدة: '+(e?.message||e));status();return false}
  }
  function lock(){
    S.epoch++;S.ready=false;S.busy=false;S.user=null;S.env=null;S.disk=null;S.conflict=false;S.error='';S.notice='';
    data=r14Empty();r14Saved=JSON.stringify(data);projectFocus='';designerFocus='';closeModal();setMenu(false);document.body.classList.add('r20-locked');gate.hidden=false;$('r20Password').value='';render();
  }
  async function boot(session){
    if(!session?.user)return;const epoch=++S.epoch;S.user=session.user;S.key=key(session.user.id);S.ready=false;S.error='';S.conflict=false;
    try{
      S.disk=localStorage.getItem(S.key);const cached=readEnvelope(S.disk,S.user.id);if(cached)adopt(cached);
      if(!cached){const env=await loadRemote();if(epoch!==S.epoch)return;write(env)}
      else if(navigator.onLine){const head=await rpc('ronix_head');if(epoch!==S.epoch)return;if(!cached.dirty&&head!==cached.revision){const env=await loadRemote();if(epoch!==S.epoch)return;write(env)}}
      if(epoch!==S.epoch)return;S.ready=true;gate.hidden=true;document.body.classList.remove('r20-locked');$('r20Password').value='';render();status();if(S.env.dirty)await flush();
    }catch(e){if(epoch===S.epoch){$('r20LoginStatus').textContent=errorText(e);S.error=errorText(e);status()}}
  }
  $('r20LoginForm').onsubmit=async e=>{
    e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;$('r20LoginStatus').textContent='جارٍ تسجيل الدخول…';
    try{const r=await client.auth.signInWithPassword({email:$('r20Email').value.trim(),password:$('r20Password').value});if(r.error)throw r.error;await boot(r.data.session)}catch(err){$('r20LoginStatus').textContent=errorText(err)}finally{button.disabled=false}
  };
  $('r20Logout').onclick=async()=>{
    if(S.busy||S.env?.dirty){alert('زامن العملية المعلقة قبل الخروج؛ يمكنك تنزيل نسخة احتياطية الآن.');return}
    const oldKey=S.key,r=await client.auth.signOut({scope:'local'});if(r.error){S.error=errorText(r.error);status();return}if(oldKey)localStorage.removeItem(oldKey);lock();
  };
  $('r20Refresh').onclick=refresh;$('r20Backup').onclick=()=>backup();$('r20Recovery').onclick=recovery;$('r20KeepLocal').onclick=()=>backup();$('r20UseServer').onclick=useServer;
  r14Persist=persist;
  backup=function(){download('RONIX_V20_Backup_'+r14Today()+'.json',JSON.stringify({...data,schemaVersion:19,currency:'EGP',exportedAt:new Date().toISOString()},null,2),'application/json');notify('نُزّلت نسخة الحسابات بالصور والمستندات')};
  addEventListener('online',()=>{status();refresh()});addEventListener('offline',status);
  addEventListener('storage',e=>{if(S.user&&e.key===S.key){S.error='تغيرت البيانات في نافذة أخرى. اضغط تحديث.';status()}});
  addEventListener('beforeunload',e=>{if(S.env?.dirty){e.preventDefault();e.returnValue=''}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S.ready)refresh()});
  setInterval(()=>{if(!document.hidden&&S.ready&&!S.conflict&&!$('overlay').classList.contains('open'))refresh()},15000);
  client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'&&S.user)queueMicrotask(lock)});
  r15Changes=function(){modal('RONIX V20 · الحسابات المشتركة','<p>الحساب نفسه على الجهازين، مزامنة بعد الحفظ، وصور ومستندات خاصة. تظهر الحالة أعلى الشاشة. عند التعارض تبقى تعديلات الجهاز في نسخة قابلة للتنزيل قبل فتح حسابات الخادم.</p><p>سعر الصرف: افتح رابط بنك مصر الرسمي واكتب سعر التنفيذ الفعلي. زر السعر الآلي مرجع عام للمقارنة فقط.</p><p>للتثبيت على الآيفون: افتح الرابط في Safari ثم مشاركة ← إضافة إلى الشاشة الرئيسية.</p><p>الدخول الحالي بالبريد وكلمة المرور؛ دخول Google لم يُفعّل بعد.</p>')};r15Help.textContent='✓ ما الجديد · V20';r15Help.onclick=r15Changes;
  r14Help=function(){modal('العمل على حسابك المشترك','<ol><li>على جهازك الأول استورد أحدث JSON من التقارير، وانتظر ظهور «تمت المزامنة» أعلى الشاشة.</li><li>افتح الرابط على الجهاز الآخر وسجّل الدخول بالحساب نفسه. لا تستورد نسخة قديمة هناك.</li><li>تُزامن الحركة والصور بعد حفظها. توجد عملية واحدة معلقة في كل مرة؛ عند انقطاع الإنترنت تبقى محفوظة على الجهاز حتى المزامنة.</li><li>عند التعارض نزّل تعديلك أو احتفظ به في «نسخ التعارض»، ثم افتح أحدث حسابات مشتركة وراجع الفروق.</li><li>نزّل نسخة JSON بعد جلسة العمل. بياناتها وصورها متوافقة مع V19.</li></ol>')};help.onclick=r14Help;
  document.title='RONIX | حساباتي';document.querySelector('.sublogo').textContent='PROJECT FINANCE · V20';document.querySelector('.sidebar-footer').textContent='RONIX V20 · حسابات مشتركة';document.querySelector('.footer').textContent='المبالغ معروضة دون قروش؛ راجع حالة المزامنة واحتفظ بنسخة احتياطية.';
  if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
  client.auth.getSession().then(r=>{if(r.data?.session)boot(r.data.session);else if(r.error)$('r20LoginStatus').textContent=errorText(r.error)});
  return {refresh,flush,status,client,state:S};
})();
