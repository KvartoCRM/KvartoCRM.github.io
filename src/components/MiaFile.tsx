import {useState} from 'react'
import {getMiaFile} from '../lib/miaAttachments'
import type {MiaAttachment} from '../lib/miaCloud'
export default function MiaFile({file,userId}:{file:MiaAttachment;userId:string}){
 const [preview,setPreview]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const open=async()=>{setBusy(true);setError('');try{const f=await getMiaFile(file.id,userId);if(f.mime.startsWith('image/'))setPreview(f.data);else {const blob=await(await fetch(f.data)).blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}}catch(e){setError(e instanceof Error?e.message:'Файл недоступен.')}finally{setBusy(false)}}
 return <div className="my-2 min-w-0"><button disabled={busy} onClick={()=>void open()} className="lumi-accent-text break-all text-left text-sm">📎 {file.name}{busy?' · загрузка…':''}</button>{preview&&<button aria-label="Свернуть фото" onClick={()=>setPreview('')}><img src={preview} alt={file.name} className="mt-2 max-h-64 max-w-full rounded-lg object-contain"/></button>}{error&&<p role="alert" className="text-sm text-amber-400">{error}</p>}</div>
}
