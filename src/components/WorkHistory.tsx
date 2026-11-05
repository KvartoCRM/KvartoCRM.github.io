import { useMemo, useState, type ReactNode } from 'react'
import { useWorkHistory } from '../hooks/useWorkHistory'
import { Link } from 'react-router-dom'
import { CalendarDays, CheckCircle2, Phone, RefreshCw, MessageSquare } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useClientRecords } from '../hooks/useClientRecords'
import { contactName } from '../lib/contactPresentation'
import { filterWorkHistory, historyDate } from '../lib/workHistory'
import Modal from './Modal'
const labels = { call: 'Звонок', meeting: 'Встреча', task: 'Задача',note:'Заметка',message:'Сообщение' }
function HistoryFrame({embedded,onClose,children}:{embedded?:boolean;onClose:()=>void;children:ReactNode}){return embedded?<section>{children}</section>:<Modal isOpen title="История дел" onClose={onClose}>{children}</Modal>}
const displayDate = (date: string) => date ? new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}) : 'Дата не сохранена'
export default function WorkHistory({onClose,clientId,embedded}:{onClose:()=>void;clientId?:string;embedded?:boolean}) {
  const {user}=useAuth(), {data:clients=[]}=useClientRecords(user?.id)
  const [kind,setKind]=useState(''),[date,setDate]=useState(''),[search,setSearch]=useState(''),[limit,setLimit]=useState(30)
  const query=useWorkHistory(user?.id)
  const entries=useMemo(()=>filterWorkHistory((query.data||[]).filter(row=>!clientId||row.clientId===clientId).map(row=>({...row,contact:row.contact||clients.find(c=>c.id===row.clientId)&&contactName(clients.find(c=>c.id===row.clientId)!)})),kind,date,search),[query.data,clients,kind,date,search,clientId])
  const reset=()=>{setKind('');setDate('');setSearch('');setLimit(30)}
  return <HistoryFrame embedded={embedded} onClose={onClose}>
    <div className="space-y-4">
      <p className="lumi-muted text-sm">Звонки, итоги встреч, выполненные задачи, заметки и сообщения. Время указано по Москве.</p>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="lumi-text min-w-0 text-sm sm:col-span-2">Поиск<input data-autofocus value={search} onChange={e=>{setSearch(e.target.value);setLimit(30)}} placeholder="Контакт, заметка или название" className="lumi-control mt-1 w-full min-w-0 rounded-xl p-3"/></label>
        <label className="lumi-text min-w-0 text-sm">Тип записи<select aria-label="Тип записи" value={kind} onChange={e=>{setKind(e.target.value);setLimit(30)}} className="lumi-control mt-1 w-full min-w-0 rounded-xl p-3"><option value="">Все дела</option><option value="call">Звонки</option><option value="meeting">Встречи</option><option value="task">Задачи</option><option value="note">Заметки</option><option value="message">Сообщения</option></select></label>
        <label className="lumi-text min-w-0 text-sm">Дата<input type="date" value={date} onChange={e=>{setDate(e.target.value);setLimit(30)}} className="lumi-control mt-1 w-full min-w-0 rounded-xl p-3"/></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="lumi-muted text-xs">{entries.length} записей{!date?' · за всё время':''}</span><div className="flex gap-2">{(kind||date||search)&&<button onClick={reset} className="lumi-accent-text rounded-lg px-3 py-2 text-sm">Сбросить</button>}<button onClick={()=>void query.refetch()} disabled={query.isFetching} className="lumi-control inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm"><RefreshCw className="h-4 w-4"/>Обновить</button></div></div>
      {query.isPending&&<p role="status" className="lumi-muted py-6 text-center">Загружаем историю…</p>}
      {query.isError&&<p role="alert" className="rounded-xl border border-red-500/30 p-4 text-sm text-red-400">Не удалось загрузить полную историю. Нажмите «Обновить», чтобы повторить.{query.data?' Ниже показаны ранее загруженные записи.':''}</p>}
      {!query.isPending&&!query.isError&&!entries.length&&<p className="lumi-muted py-8 text-center">{kind||date||search?'По этим условиям записей нет.':'В истории пока нет завершённых дел.'}</p>}
      <div className="space-y-3">{entries.slice(0,limit).map((row,index)=>{const Icon=row.kind==='call'?Phone:row.kind==='meeting'?CalendarDays:row.kind==='task'?CheckCircle2:MessageSquare;const next=historyDate(row.next);return <div key={row.id}>
        {(index===0||entries[index-1].date!==row.date)&&<h3 className="lumi-muted mb-3 mt-5 text-sm font-semibold">{displayDate(row.date)}</h3>}
        <article className="lumi-panel-muted min-w-0 rounded-xl border p-4" data-history-kind={row.kind}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="lumi-accent-text inline-flex items-center gap-2"><Icon className="h-4 w-4"/>{labels[row.kind]}{row.time&&` · ${row.time}`}</span>{row.outcome&&<span className="lumi-accent-soft max-w-full break-words rounded-lg px-2 py-1">{row.outcome}</span>}</div>
          <h4 className="lumi-text mt-3 break-words font-semibold">{row.title}</h4>
          {row.dateNote&&<p className="lumi-muted mt-1 text-xs">{row.dateNote}</p>}
          {row.contact&&<p className="lumi-accent-text mt-2 break-words text-sm">{row.contact}{row.phone?` · ${row.phone}`:''}</p>}
          {row.location&&<p className="lumi-muted mt-2 break-words text-sm">{row.location}</p>}
          {row.reaction&&<p className="lumi-text mt-3 text-sm">Реакция: {row.reaction}</p>}
          <p className="lumi-text mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{row.notes||'Комментарий не добавлен.'}</p>
          {next.date&&<p className="lumi-muted mt-3 text-sm">Следующий контакт: {displayDate(next.date)} {next.time}</p>}
          {(row.clientId||row.propertyId)&&<div className="mt-3 flex flex-wrap gap-3 text-sm">{row.clientId&&<Link onClick={onClose} to={`/contacts?client=${encodeURIComponent(row.clientId)}`} className="lumi-accent-text py-2">Карточка контакта</Link>}{row.propertyId&&<Link onClick={onClose} to={`/properties/${encodeURIComponent(row.propertyId)}`} className="lumi-accent-text py-2">Объект</Link>}</div>}
        </article></div>})}</div>
      {entries.length>limit&&<button onClick={()=>setLimit(n=>n+30)} className="lumi-control w-full rounded-xl p-3">Показать ещё ({entries.length-limit})</button>}
      {!embedded&&<button onClick={onClose} className="lumi-control w-full rounded-xl p-3">Закрыть</button>}
    </div>
  </HistoryFrame>
}
