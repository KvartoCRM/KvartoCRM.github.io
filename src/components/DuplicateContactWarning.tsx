import { useAuth } from '../context/AuthContext'
import { useClientRecords } from '../hooks/useClientRecords'
import { normalizeContactPhone } from '../lib/contactDuplicates'
import { contactName } from '../lib/contactPresentation'
export default function DuplicateContactWarning({phone,exceptId}:{phone:string;exceptId?:string}){
 const {user}=useAuth(),query=useClientRecords(user?.id),key=normalizeContactPhone(phone)
 const matches=(query.data||[]).filter(c=>c.id!==exceptId&&key&&normalizeContactPhone(c.phone)===key)
 return matches.length?<p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm lumi-text">Этот номер уже есть: {matches.map(contactName).join(', ')}. Это может быть другой человек с общим телефоном. Проверьте запись перед сохранением.</p>:null
}
