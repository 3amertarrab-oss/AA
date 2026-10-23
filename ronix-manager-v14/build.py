from pathlib import Path
import re, shutil, zipfile, base64

ROOT=Path(__file__).resolve().parent
ORIGINAL=ROOT.parent/'original/ronix_app/RONIX_Manager.html'
SOURCE=ROOT/'src/v13-base.html'
base=(SOURCE if SOURCE.exists() else ORIGINAL).read_text()
# Keep the actual V13 application, without distributing the user's embedded records.
base=re.sub(r'^const seed=.*$', 'const seed=r14Empty();', base, flags=re.M)
base=re.sub(r'^const excelPhotoSeed=.*$', 'const excelPhotoSeed={};', base, flags=re.M)
base=re.sub(r"const KEY='ronix_projects_designers_v1';let data;.*?data\.clientReceipts=Array\.isArray\(data\.clientReceipts\)\?data\.clientReceipts:\[\];", "const KEY=r14Key;let data=r14Load();",base,count=1)
assert 'let data=r14Load()' in base
base=base.replace('maximumFractionDigits:0','minimumFractionDigits:2,maximumFractionDigits:2')
base=base.replace('encodeURIComponent(', 'r14Encode(')
base=base.replace("new Date().toISOString().slice(0,10)", 'r14Today()')
base=base.replace("x.status!=='ملغاة'", 'R14.active(x)')
base=base.replace("step=\"1\"", 'step="0.01"')
base=base.replace("getP(r.code)?.client||''", "r.client||getP(r.code)?.client||''")
base=base.replace('over.reduce((a,c)=>a+Number(c.total||0),0)','over.reduce((a,c)=>a+R14.remaining(data,c),0)')
# Remove external font dependencies for completely local operation.
base=re.sub(r'<link\b[^>]*href=["\']https?://[^>]+>', '', base)
base=base.replace('إجمالي المطالبات</small>','مطالبات صادرة / معتمدة</small>')
base=base.replace('المطالبات ليست إيصالات قبض. الفرق بين إجمالي المطالبات والتحصيل هو رصيد المطالبات غير المحصّل، وقد يشمل مطالبات غير مستحقة بعد.','المطالبة مستقلة عن القبض. افتح «مطابقة» لربط السندات بالمطالبة وعرض المسدد والمتبقي.')
base=base.replace('المقدمات غير الموزعة لا تدخل في التحصيل المخصص.','المقدمات وأجزاء السندات غير الموزعة لا تدخل في التحصيل المخصص.')
# Extend the existing dated statement without changing its separate opening-balance semantics.
base=base.replace("for(let a of clientAdvances(n))if(a.date<=to)", "for(let r of data.clientReceipts)if(!r.code&&r.client===n&&r.date<=to)rows.push({date:r.date,ref:r.ref||r.id,code:'—',type:'قبض غير موزع (معلومة: '+money(r.amount)+')',debit:0,credit:0});for(let a of clientAdvances(n))if(a.date<=to)")
base=base.replace("type:'مقدمة غير موزعة (معلومة)'", "type:'قبض مقدمة (معلومة: '+money(a.total)+')'")
base=base.replace("exportTabs(tabs,name){download(name+'.xls'", "exportTabs(tabs,name='RONIX_Export'){download(name+'.xls'")
# Once captured, the sanitized base is the source of truth; transforms above
# are only used to create it on the first build from the private upload.
if SOURCE.exists():
    base=SOURCE.read_text()
core=(ROOT/'src/finance-core.js').read_text()
storage=(ROOT/'src/storage.js').read_text()
vendor=ROOT/'src/vendor'
vendor.mkdir(exist_ok=True)
if not (vendor/'fflate-0.8.2.js').exists():
    shutil.copyfile(ROOT.parent/'tools/node_modules/fflate/umd/index.js',vendor/'fflate-0.8.2.js')
    shutil.copyfile(ROOT.parent/'tools/node_modules/fflate/LICENSE',vendor/'fflate-LICENSE.txt')
fflate=(vendor/'fflate-0.8.2.js').read_text()
if not SOURCE.exists():
    SOURCE.write_text(base)
logo='data:image/webp;base64,'+base64.b64encode((ROOT/'src/assets/ronix-logo.webp').read_bytes()).decode('ascii')
ui=(ROOT/'src/finance-ui.js').read_text()
base=base.replace('</head>', '<style>\n'+(ROOT/'src/finance-ui.css').read_text()+'\n</style></head>',1)
base=base.replace('<script>', '<script>\n'+core+'\n'+storage+'\n'+ui+'\nconst R14_LOGO="'+logo+'";\n</script><script>',1)
scripts='\n'.join((ROOT/'src'/n).read_text() for n in ['upgrade.js','import.js'])
extra='<style>.r14-welcome{border:2px solid #b58a48}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #d4a454;outline-offset:2px}.tablewrap{max-width:100%}.modal{max-width:min(1100px,96vw)}.modal .formgrid label{min-width:0}</style>'
base+='\n'+extra+'\n<script>\n'+fflate+'\n</script><script>\n'+scripts+'\n</script>\n'
(ROOT/'dist/RONIX_Manager.html').write_text(base)
shutil.copyfile(vendor/'fflate-LICENSE.txt',ROOT/'dist/fflate-LICENSE.txt')
print('Built',len(base.encode()),'bytes')
