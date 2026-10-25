from pathlib import Path
import hashlib,json,re,shutil,zipfile
ROOT=Path(__file__).resolve().parent
BASE=ROOT.parent/'ronix-manager-v14/dist/RONIX_Manager.html'
DIST=ROOT/'dist';DIST.mkdir(exist_ok=True)
VENDOR=ROOT/'vendor';VENDOR.mkdir(exist_ok=True)
package=Path('/workspace/ronix-cloud-tools/node_modules/@supabase/supabase-js')
if not (VENDOR/'supabase.js').exists():
 shutil.copyfile(package/'dist/umd/supabase.js',VENDOR/'supabase.js')
 shutil.copyfile(package/'LICENSE',VENDOR/'supabase-LICENSE.txt')
 (VENDOR/'version.txt').write_text(json.loads((package/'package.json').read_text())['version']+'\n')
html=BASE.read_text()
html=html.replace('const KEY=r14Key;let data=r14Load();',"const KEY='ronix-v20-boot';let data=r14Empty();r14Saved=JSON.stringify(data);")
assert "const KEY='ronix-v20-boot'" in html
html=html.replace('<body>','<body class="r20-locked">',1)
html=html.replace('width=device-width,initial-scale=1','width=device-width,initial-scale=1,viewport-fit=cover',1)
html=html.replace('</head>','<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#172b45"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="RONIX"><link rel="apple-touch-icon" href="icon.png"><style>'+ (ROOT/'cloud.css').read_text()+'</style></head>',1)
html=html.replace('V19','V20').replace('*** ','').replace('تُقرأ الملفات على جهازك فقط. لا توجد بيانات عملاء مضمنة في ملف التحديث.','استورد أحدث نسخة JSON. بعد الحفظ تُزامن الحسابات والصور مع حسابك الخاص.')
html+='\n<script src="config.js"></script><script src="supabase.js"></script><script>\n'+(ROOT/'media.js').read_text()+'\n'+(ROOT/'cloud.js').read_text()+'\n</script>'
(DIST/'index.html').write_text(html)
shutil.copyfile(ROOT/'config.js',DIST/'config.js');shutil.copyfile(VENDOR/'supabase.js',DIST/'supabase.js');shutil.copyfile(VENDOR/'supabase-LICENSE.txt',DIST/'supabase-LICENSE.txt')
shutil.copyfile(ROOT.parent/'ronix-manager-v14/src/vendor/fflate-LICENSE.txt',DIST/'fflate-LICENSE.txt')
shutil.copyfile(ROOT.parent/'ronix-manager-v14/src/assets/ronix-logo-transparent.png',DIST/'icon.png')
manifest={'id':'./','name':'RONIX — حسابات المشاريع','short_name':'RONIX','start_url':'./','scope':'./','display':'standalone','lang':'ar','dir':'rtl','background_color':'#f1f4f8','theme_color':'#172b45','icons':[{'src':'icon.png','sizes':'1254x1254','type':'image/png','purpose':'any'}]}
(DIST/'manifest.webmanifest').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
setup=(ROOT/'setup-template.html').read_text().replace('__SQL_JSON__',json.dumps((ROOT/'schema.sql').read_text()).replace('</','<\\/')).replace('__PROJECT_JSON__',json.dumps('ajmguynkgsrqkxtxewsj'))
(DIST/'setup.html').write_text(setup)
shutil.copyfile(ROOT/'START-HERE.txt',DIST/'START-HERE.txt')
revision=hashlib.sha256((html+(ROOT/'config.js').read_text()).encode()).hexdigest()[:12]
sw="""const CACHE='ronix-v20-REVISION';
const ASSETS=['./','./index.html','./config.js','./supabase.js','./manifest.webmanifest','./icon.png','./setup.html'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ronix-v20-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);
 if(e.request.method!=='GET'||url.origin!==self.location.origin)return;
 const base=new URL('./',self.location.href),allowed=ASSETS.some(p=>new URL(p,base).pathname===url.pathname);
 if(!allowed)return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});
""".replace('REVISION',revision)
(DIST/'sw.js').write_text(sw)
(DIST/'_headers').write_text('/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/config.js\n  Cache-Control: no-cache\n')
with zipfile.ZipFile(ROOT/'RONIX-Cloud-V20.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted(DIST.iterdir()):z.write(p,p.name)
with zipfile.ZipFile(ROOT/'RONIX-Setup.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 z.writestr('RONIX_Setup.html',setup)
print('Built cloud package:',len(html.encode()),'HTML bytes; service worker',revision)
