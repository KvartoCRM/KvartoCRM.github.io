import {validateMiaPlan} from './miaActionSchema.ts'
import {miaPages} from './mia.ts'
export function checkedMiaAction(value:unknown){
 if(value==null)return null
 if(typeof value!=='object'||Array.isArray(value))throw new Error('mia должна быть объектом или null')
 const a=structuredClone(value) as Record<string,unknown>
 if(a.type==='commands')return validateMiaPlan(a)
 if(a.type==='navigate'){
  if(typeof a.page!=='string'||!Object.prototype.hasOwnProperty.call(miaPages,a.page))throw new Error('Неизвестная страница: '+String(a.page))
 }else if(a.type==='lookup'){
  if(!['contacts','properties','owners','history','tasks','events','activities','analytics','archive','trash','deals'].includes(String(a.entity)))throw new Error('Неизвестный тип поиска')
 }else if(a.type!=='record')throw new Error('Неизвестный тип ответа. Используй commands, navigate, lookup, record или null.')
 return a
}
export const isSocialReply=(text:string)=>/^(спасибо[! .]*|понятно[! .]*|а,? понял[! .]*|ок[! .]*|[\p{Extended_Pictographic}\uFE0F\u200D\s]+)$/iu.test(text.trim())
