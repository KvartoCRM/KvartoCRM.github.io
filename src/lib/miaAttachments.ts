import {miaCloud,type MiaAttachment} from './miaCloud'
export const attachmentAccept='.jpg,.jpeg,.png,.webp,.pdf,.docx,.txt,.md,.csv,.json'
export async function imageData(file:Blob,max=1200,quality=.8){
 const bitmap=await createImageBitmap(file),scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Не удалось обработать фото.');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return canvas.toDataURL('image/jpeg',quality)
}
const asData=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('Файл не прочитан.'));r.readAsDataURL(blob)})
export async function uploadMiaFile(file:File,userId:string):Promise<MiaAttachment>{
 if(file.size>2*1024*1024||!file.size)throw new Error('Выберите непустой файл до 2 МБ.');
 const ext=file.name.split('.').pop()?.toLowerCase()||'';
 const mime=['jpg','jpeg','png','webp'].includes(ext)?'image/jpeg':ext==='pdf'?'application/pdf':ext==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':['txt','md','csv','json'].includes(ext)?'text/plain':'';
 if(!mime)throw new Error('Поддерживаются фото, PDF, DOCX, TXT, MD, CSV и JSON.');
 const data=mime==='image/jpeg'?await imageData(file):await asData(new Blob([await file.arrayBuffer()],{type:mime}));
 return miaCloud<MiaAttachment>({op:'file_put',id:crypto.randomUUID(),name:file.name,size:file.size,data},userId)
}
export async function getMiaFile(id:string,userId:string){return miaCloud<MiaAttachment&{data:string}>({op:'file_get',id},userId)}
export async function attachmentContext(files:MiaAttachment[],userId:string){
 const images:string[]=[],texts:{name:string;text:string}[]=[];
 for(const f of files){const stored=await getMiaFile(f.id,userId),blob=await(await fetch(stored.data)).blob();let text='';
  if(f.mime.startsWith('image/')){images.push(stored.data);continue}
  if(f.mime==='application/pdf'){const pdf=await import('pdfjs-dist');pdf.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).href;const task=pdf.getDocument({data:await blob.arrayBuffer()}),doc=await task.promise;try{for(let page=1;page<=doc.numPages;page++){if(page>80||text.length>40000)throw new Error('PDF слишком длинный. Пришлите нужные страницы отдельным файлом.');const data=await(await doc.getPage(page)).getTextContent();text+=data.items.map(i=>'str'in i?i.str:'').join(' ')+'\n'}}finally{await task.destroy()}}
  else if(f.mime.includes('wordprocessingml')){const mammoth=await import('mammoth');text=(await mammoth.extractRawText({arrayBuffer:await blob.arrayBuffer()})).value}
  else text=await blob.text();
  if(text.length>40000)throw new Error('Документ слишком длинный. Пришлите нужный фрагмент.');
  texts.push({name:f.name,text:text.trim()||'Текст не извлечён. Возможно, это скан. Попроси прислать нужную страницу как изображение.'});
 }
 return {images,texts}
}
