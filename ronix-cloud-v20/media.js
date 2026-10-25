/* Content-addressed private files; financial JSON never embeds public download links. */
const R20Media=(()=>{
  const types={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','application/pdf':'pdf'};
  async function hash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')}
  function parse(uri){
    const m=/^data:(image\/png|image\/jpeg|image\/webp|application\/pdf);base64,([A-Za-z0-9+/=\s]+)$/.exec(uri);
    if(!m)throw Error('صيغة صورة أو مستند غير مدعومة');
    const bytes=Uint8Array.from(atob(m[2]),c=>c.charCodeAt(0));
    if(bytes.length>5242880)throw Error('المستند يتجاوز 5 ميجابايت');return {mime:m[1],bytes};
  }
  function encode(bytes,mime){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return 'data:'+mime+';base64,'+btoa(binary)}
  async function walk(value,transform){
    const replacement=await transform(value);if(replacement!==undefined)return replacement;
    if(Array.isArray(value)){const out=[];for(const x of value)out.push(await walk(x,transform));return out}
    if(value&&typeof value==='object'){const out={};for(const [k,v] of Object.entries(value))Object.defineProperty(out,k,{value:await walk(v,transform),enumerable:true,writable:true,configurable:true});return out}
    return value;
  }
  async function pack(snapshot,owner,upload){
    const seen=new Map();
    return walk(snapshot,async value=>{
      if(typeof value!=='string'||!value.startsWith('data:'))return;
      if(seen.has(value))return seen.get(value);
      const {mime,bytes}=parse(value),digest=await hash(bytes),path=owner+'/'+digest+'.'+types[mime];
      await upload(path,bytes,mime);const ref={$ronixBlob:path,mime};seen.set(value,ref);return ref;
    });
  }
  async function unpack(snapshot,owner,download){
    const seen=new Map();
    return walk(snapshot,async value=>{
      if(!value||typeof value!=='object'||!Object.hasOwn(value,'$ronixBlob'))return;
      const path=value.$ronixBlob,mime=value.mime;
      if(typeof path!=='string'||!types[mime]||!path.startsWith(owner+'/')||!new RegExp('^[a-f0-9]{64}\\.'+types[mime]+'$').test(path.slice(owner.length+1)))throw Error('مرجع مستند لا يخص هذا الحساب أو غير صالح');
      if(seen.has(path))return seen.get(path);
      const bytes=new Uint8Array(await download(path));if(bytes.length>5242880||await hash(bytes)!==path.slice(owner.length+1,owner.length+65))throw Error('تعذر التحقق من سلامة المستند');
      const uri=encode(bytes,mime);seen.set(path,uri);return uri;
    });
  }
  return {pack,unpack,hash};
})();
if(typeof module!=='undefined')module.exports=R20Media;
