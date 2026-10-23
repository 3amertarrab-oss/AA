// Bootstrap runs before the preserved V13 screens. No sample client data shipped.
const r14Encode = value => encodeURIComponent(value).replace(/'/g,'%27');
const r14Key = 'ronix_projects_designers_v1';
let r14Disk = null, r14Saved = null, r14BootIssue = '', r14Failures = 0;
const r14Empty = () => R14.normalize({projects:[],assignments:[],payments:[]});
function r14Load() {
  try {
    r14Disk=localStorage.getItem(r14Key);
    const result=r14Disk?R14.validate(JSON.parse(r14Disk)):r14Empty();
    r14Saved=JSON.stringify(result);return result;
  } catch(e) {
    r14BootIssue='تعذر فتح البيانات المحفوظة: '+e.message;
    const result=r14Empty();r14Saved=JSON.stringify(result);return result;
  }
}
function r14Id(prefix='ID'){return prefix+'-'+crypto.randomUUID()}
function r14Today(){const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
// Defined before the original compatibility alias; V13 referenced a missing function.
function openReceipt(){}
