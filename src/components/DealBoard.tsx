import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Deal } from '../types'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import Modal from './Modal'

const stages = [['preparation','Подготовка'],['documents','Документы'],['approval','Согласование'],['registration','Регистрация'],['settlement','Расчёты'],['completed','Завершены'],['lost','Потеряны']] as const
export default function DealBoard({deals,properties,onOpen,onSaved}:{deals:Deal[];properties:{id:string;address:string}[];onOpen:(deal:Deal)=>void;onSaved:()=>void}) {
  const {user}=useAuth()
  const [change,setChange]=useState<{deal:Deal;stage:Deal['stage']}|null>(null)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false)
  const save=async()=>{
    if(!change||!user||busy)return
    setBusy(true);setError('')
    try{
      if(change.stage==='completed'&&(change.deal.agencyIncome===undefined||change.deal.agentIncome===undefined))throw new Error('Для завершения укажите финансы в карточке сделки.')
      const status=change.stage==='completed'?'closed':change.stage==='lost'?'cancelled':'active'
      const result=await supabase.from('deals').update({stage:change.stage,status}).eq('id',change.deal.id).eq('user_id',user.id).eq('updated_at',change.deal.updatedAt).is('deleted_at',null).select('id').setHeader('x-lumicrm-network-only','true').maybeSingle()
      if(result.error)throw result.error
      if(!result.data)throw new Error('Сделка уже изменена. Обновите список и повторите.')
      setChange(null);onSaved()
    }catch(e){setError(e instanceof Error?e.message:'Не удалось изменить этап. Повторите после обновления списка.')}finally{setBusy(false)}
  }
  return <><div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">{stages.map(([stage,label])=>{const items=deals.filter(d=>(d.stage||'preparation')===stage);return <section key={stage} className="lumi-panel-muted min-w-0 rounded-2xl p-3"><h2 className="lumi-text mb-3 flex justify-between font-semibold">{label}<span className="lumi-muted text-sm">{items.length}</span></h2><div className="space-y-3">{items.map(deal=>{const overdue=deal.nextActionAt&&new Date(deal.nextActionAt)<new Date()&&deal.status!=='closed'&&deal.status!=='cancelled';return <article key={deal.id} className={`lumi-panel rounded-xl border p-3 ${overdue?'border-amber-500/60':''}`}><button onClick={()=>onOpen(deal)} className="lumi-text block w-full break-words text-left font-semibold">{properties.find(p=>p.id===deal.propertyId)?.address||'Объект сделки'}</button><p className="lumi-text my-2 text-lg font-semibold">{deal.price?.toLocaleString('ru-RU')||'Цена не указана'}{deal.price?' ₽':''}</p><p className="lumi-muted text-xs">{deal.responsibleName||'Ответственный не назначен'}</p><p className="lumi-text mt-3 text-sm">{deal.nextAction||'Следующий шаг не назначен'}</p>{deal.nextActionAt&&<time className={`mt-1 block text-xs ${overdue?'text-amber-500':'lumi-muted'}`}>{overdue?'Просрочено · ':''}{new Date(deal.nextActionAt).toLocaleString('ru-RU')}</time>}<p className="lumi-muted mt-2 text-xs">Чек-лист: {(deal.checklist||[]).filter(i=>i.completed).length}/{deal.checklist?.length||0}</p><select aria-label={`Этап: ${properties.find(p=>p.id===deal.propertyId)?.address||deal.id}`} value={stage} onChange={e=>{setChange({deal,stage:e.target.value as Deal['stage']});setError('')}} className="lumi-control mt-3 w-full rounded-lg p-2 text-sm">{stages.map(([id,title])=><option key={id} value={id}>{title}</option>)}</select><Link className="lumi-accent-text mt-3 inline-block text-xs" to={`/properties/${deal.propertyId}`}>Объект и документы</Link></article>})}{!items.length&&<p className="lumi-muted py-4 text-center text-xs">Нет сделок на этом этапе</p>}</div></section>})}</div><Modal isOpen={Boolean(change)} onClose={()=>!busy&&setChange(null)} title="Изменить этап сделки">{change&&<div className="space-y-4"><p className="lumi-text">Новый этап: {stages.find(([id])=>id===change.stage)?.[1]}</p>{change.deal.checklist?.some(i=>!i.completed)&&<div className="rounded-xl bg-amber-500/10 p-3"><p className="lumi-text text-sm">Не завершены пункты чек-листа:</p><ul className="lumi-muted mt-2 text-sm">{change.deal.checklist.filter(i=>!i.completed).map(i=><li key={i.id}>• {i.title}</li>)}</ul></div>}{error&&<p role="alert" className="text-red-400">{error}</p>}<div className="flex gap-2"><button disabled={busy} onClick={()=>void save()} className="lumi-gradient-button rounded-xl px-4 py-3">{busy?'Сохраняем…':'Подтвердить этап'}</button><button disabled={busy} onClick={()=>{onOpen(change.deal);setChange(null)}} className="lumi-control rounded-xl px-4 py-3">Открыть карточку</button></div></div>}</Modal></>
}
