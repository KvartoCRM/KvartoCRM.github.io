import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useAccountState } from '../hooks/useAccountState'

type View = { id: string; name: string; values: Record<string,string> }
export default function SavedListViews({ scope, values, onApply }: { scope: string; values: Record<string,string>; onApply: (values: Record<string,string>) => void }) {
  const { user } = useAuth()
  const [views, setViews] = useAccountState<View[]>(user?.id, `views:${scope}`, [])
  const [name, setName] = useState('')
  const [selected, setSelected] = useState('')
  const safeViews = views.filter(view => view && typeof view.id === 'string' && typeof view.name === 'string' && view.values && typeof view.values === 'object').slice(0,12)
  return <div className="lumi-border space-y-2 border-b pb-3">
    <label className="lumi-muted-strong block text-xs font-medium">Сохранённые виды<select aria-label="Сохранённый вид" className="lumi-control mt-1.5 w-full rounded-lg px-3 py-2 text-sm" value={selected} onChange={e => {setSelected(e.target.value); const view = safeViews.find(v => v.id === e.target.value); if(view) onApply(Object.fromEntries(Object.entries(view.values).filter(([,v]) => typeof v === 'string'))) }}><option value="">Выбрать вид</option>{safeViews.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}</select></label>
    <div className="flex gap-2"><input aria-label="Название нового вида" maxLength={60} className="lumi-control min-w-0 flex-1 rounded-lg px-3 py-2 text-sm" placeholder="Например, покупатели из Авито" value={name} onChange={e => setName(e.target.value)} /><button type="button" disabled={!name.trim() || safeViews.length >= 12} className="lumi-control rounded-lg px-3 py-2 text-sm disabled:opacity-40" onClick={() => { const id=crypto.randomUUID(); setViews([...safeViews,{id,name:name.trim(),values:{...values}}]);setSelected(id);setName('') }}>Сохранить</button></div>
    {selected && <button type="button" className="text-xs text-red-400" onClick={() => {setViews(safeViews.filter(v => v.id !== selected));setSelected('') }}>Удалить выбранный вид</button>}
    <p className="lumi-muted text-xs">Настройки сохраняются для этого аккаунта на этом устройстве. До 12 видов.</p>
  </div>
}
