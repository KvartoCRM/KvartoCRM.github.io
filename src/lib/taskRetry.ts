const normalize=(value:unknown):unknown=>{
 if(Array.isArray(value))return value.map(normalize)
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,normalize(v)]))
 return value??null
}
export function sameTaskPayload(row:Record<string,unknown>,payload:Record<string,unknown>){
 if(row.deleted_at)return false
 return Object.entries(payload).every(([key,value])=>{
  const actual=key==='due_time'&&typeof row[key]==='string'?(row[key] as string).slice(0,5):row[key]
  const expected=key==='due_time'&&typeof value==='string'?value.slice(0,5):value
  return JSON.stringify(normalize(actual))===JSON.stringify(normalize(expected))
 })
}
