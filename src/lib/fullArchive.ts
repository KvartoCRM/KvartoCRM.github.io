import { parseWorkspaceBackup, type WorkspaceBackup } from './workspaceBackupFormat.ts'

const encoder = new TextEncoder(), decoder = new TextDecoder()
export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
const hash = async (blob: Blob) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('')
const header = (name:string,size:number) => {
  const block=new Uint8Array(512)
  const put=(offset:number,value:string)=>block.set(encoder.encode(value),offset)
  put(0,name);put(100,'0000600\0');put(108,'0000000\0');put(116,'0000000\0');put(124,size.toString(8).padStart(11,'0')+'\0');put(136,'00000000000\0');block.fill(32,148,156);put(156,'0');put(257,'ustar\0');put(263,'00')
  put(148,block.reduce((sum,value)=>sum+value,0).toString(8).padStart(6,'0')+'\0 ')
  return block
}
export async function buildFullArchive(backup: WorkspaceBackup, files: Map<string,Blob>) {
  const entries: {path:string;blob:Blob;sha256:string}[]=[]
  const clean = {...backup,fileUrls:{}}
  const data = new Blob([JSON.stringify(clean)],{type:'application/json'})
  if (data.size > 50 * 1024 * 1024) throw new Error('Записи занимают больше 50 МБ. Архив не создан.')
  entries.push({path:'workspace.json',blob:data,sha256:await hash(data)})
  for(const record of backup.tables.crm_files || []) {
    const id=String(record.id)
    if(!/^[\da-f-]{36}$/i.test(id)) throw new Error('Некорректный идентификатор файла в копии.')
    const blob=files.get(id)
    if(!blob)throw new Error(`Не удалось включить файл: ${String(record.name || id)}. Полный архив не создан.`)
    entries.push({path:`files/${id}`,blob,sha256:await hash(blob)})
  }
  const manifest=new Blob([JSON.stringify({format:'kvartocrm-full-archive',version:1,entries:entries.map(e=>({path:e.path,size:e.blob.size,sha256:e.sha256}))})])
  if (manifest.size > 1024 * 1024) throw new Error('Слишком много файлов для одного архива. Архив не создан.')
  const parts:BlobPart[]=[]
  for(const entry of [{path:'manifest.json',blob:manifest},...entries])parts.push(header(entry.path,entry.blob.size),entry.blob,new Uint8Array((512-entry.blob.size%512)%512))
  parts.push(new Uint8Array(1024))
  const archive=new Blob(parts,{type:'application/x-tar'})
  if(archive.size>MAX_ARCHIVE_BYTES)throw new Error('Архив превышает 512 МБ. Экспорт остановлен; уменьшите объём или создайте копию средствами базы.')
  return archive
}
export async function readFullArchive(file: Blob): Promise<{backup:WorkspaceBackup;files:Map<string,Blob>}> {
  if(file.size>MAX_ARCHIVE_BYTES)throw new Error('Архив больше 512 МБ.')
  const entries=new Map<string,Blob>()
  let offset=0, ended=false
  while(offset+512<=file.size){
    const block=new Uint8Array(await file.slice(offset,offset+512).arrayBuffer())
    if(block.every(v=>!v)){ended=true;break}
    const text=(start:number,end:number)=>decoder.decode(block.slice(start,end)).replace(/\0.*$/s,'').trim()
    const name=text(0,100),size=parseInt(text(124,136),8),checksum=parseInt(text(148,156),8)
    const actual=block.reduce((sum,v,i)=>sum+(i>=148&&i<156?32:v),0)
    if(checksum!==actual||!Number.isSafeInteger(size)||size<0||offset+512+size>file.size||!['0',''].includes(text(156,157)))throw new Error('Повреждён заголовок архива.')
    if(!/^(manifest\.json|workspace\.json|files\/[\da-f-]{36})$/i.test(name)||entries.has(name))throw new Error('Архив содержит неизвестный или повторяющийся путь.')
    entries.set(name,file.slice(offset+512,offset+512+size));offset+=512+Math.ceil(size/512)*512
  }
  if(!ended)throw new Error('Архив оборван.')
  const manifestBlob=entries.get('manifest.json'),workspace=entries.get('workspace.json')
  if(!manifestBlob||!workspace||manifestBlob.size>1024*1024||workspace.size>50*1024*1024)throw new Error('Отсутствует или повреждён манифест архива.')
  const manifest=JSON.parse(await manifestBlob.text())
  if(manifest.format!=='kvartocrm-full-archive'||manifest.version!==1||!Array.isArray(manifest.entries))throw new Error('Неподдерживаемый архив.')
  const checked=new Set<string>()
  for(const entry of manifest.entries){
    if(!entry||typeof entry.path!=='string'||checked.has(entry.path))throw new Error('Повтор в манифесте.')
    const blob=entries.get(entry.path)
    if(!blob||blob.size!==entry.size||await hash(blob)!==entry.sha256)throw new Error(`Контрольная сумма не совпала: ${entry.path}. Восстановление отменено.`)
    checked.add(entry.path)
  }
  if(checked.size!==entries.size-1||!checked.has('workspace.json'))throw new Error('Состав архива не совпадает с манифестом.')
  const backup=parseWorkspaceBackup(await workspace.text()), files=new Map<string,Blob>()
  for(const row of backup.tables.crm_files||[]){const blob=entries.get(`files/${row.id}`);if(!blob)throw new Error(`В архиве нет файла ${row.name || row.id}`);files.set(String(row.id),blob)}
  return {backup,files}
}
