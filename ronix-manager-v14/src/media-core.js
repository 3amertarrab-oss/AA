const R16Media=(()=>{
  function mime(bytes){
    if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)return 'image/png';
    if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
    const first=String.fromCharCode(...bytes.slice(0,12));
    if(first.startsWith('GIF87a')||first.startsWith('GIF89a'))return 'image/gif';
    if(first.startsWith('RIFF')&&first.slice(8)==='WEBP')return 'image/webp';
    throw Error('ملف الصورة لا يحتوي صورة مدعومة');
  }
  function recover(value,entries,encode){
    const data=JSON.parse(JSON.stringify(value)),missing=[],restored=[];
    for(const p of data.projects)for(const photo of p.photos||[]){
      if(String(photo.src).startsWith('data:image/'))continue;
      if(!/^project_media\/[\w .()\-]+\.(png|jpe?g|webp|gif)$/i.test(photo.src))throw Error('مسار صورة غير صالح');
      const candidates=Object.entries(entries).filter(([path])=>path===photo.src||path.endsWith('/'+photo.src));
      if(!candidates.length){missing.push({code:p.code,src:photo.src});continue}
      const bytes=candidates[0][1];
      if(candidates.some(([,b])=>b.length!==bytes.length||b.some((v,i)=>v!==bytes[i])))throw Error('الأرشيف يحتوي صورًا مختلفة بالاسم نفسه: '+photo.src);
      const source=photo.src;photo.src='data:'+mime(bytes)+';base64,'+encode(bytes);
      photo.recoveredFrom=source;restored.push({code:p.code,photoId:photo.id,source});
    }
    for(const p of data.projects)if(p.photos?.length&&!p.photos.some(ph=>ph.id===p.coverId))p.coverId=p.photos[0].id;
    return {data,restored,missing};
  }
  return {recover,mime};
})();
if(typeof module!=='undefined')module.exports=R16Media;
