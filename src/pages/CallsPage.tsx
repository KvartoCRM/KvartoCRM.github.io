import { useEffect, useMemo, useState } from 'react'
import { Calendar, Download, ExternalLink, Eye, Pencil, Phone, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import { printCurrentPage } from '../lib/print'
import { useCallActivities } from '../hooks/useCallActivities'
import type { CallMetadata, CallType, WorkCall } from '../lib/callActivityMapping'
import { safeExternalUrl } from '../lib/safeExternalUrl'

const CALL_TYPES: Array<{ value: CallType; label: string }> = [
  { value: 'cold', label: 'Холодные' },
  { value: 'warm', label: 'Тёплые' },
  { value: 'inbound', label: 'Входящие' },
  { value: 'selection', label: 'По подбору' },
]

const initialForm = (): CallMetadata & { date: string; time: string; source: string; meeting_outcome: string; comments: string } => ({
  call_type: 'cold', status: 'Состоялся', source: 'Авито', contact_method: 'Телефон', contact_name: '', phone: '', address: '',
  property_type: 'Квартира', demand: '', unsuitable: '', property_url: '', area: '', floor: '', price: '',
  date: new Date().toISOString().slice(0, 10), time: new Date().toTimeString().slice(0, 5), contacted_at: '', next_contact_at: '',
  meeting_at: '', meeting_outcome: '', comments: '', second_touch_at: '', second_comment: '',
})

type CallForm = ReturnType<typeof initialForm>

const localDateTimeValue = (value: string | null | undefined) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const formFromCall = (call: WorkCall): CallForm => {
  const defaults = initialForm()
  const metadata = call.metadata || {}
  const occurredAt = localDateTimeValue(call.occurred_at)
  return {
    ...defaults,
    ...metadata,
    call_type: metadata.call_type || 'cold',
    contact_name: metadata.contact_name || call.title.replace(/^Звонок:\s*/i, ''),
    date: occurredAt.slice(0, 10) || defaults.date,
    time: occurredAt.slice(11, 16) || defaults.time,
    source: call.source || '',
    meeting_outcome: call.outcome || '',
    comments: call.notes || '',
    contacted_at: localDateTimeValue(metadata.contacted_at),
    next_contact_at: localDateTimeValue(metadata.next_contact_at),
    meeting_at: localDateTimeValue(metadata.meeting_at),
    second_touch_at: localDateTimeValue(metadata.second_touch_at),
  }
}

const displayDateTime = (value: string | null | undefined) => {
  if (!value) return 'Не указано'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU')
}

const CallsPage = () => {
  const { user } = useAuth()
  const { data: calls = [], isPending: loading, error: loadError, refetch, saveCall, removeCall, mutationPending: saving } = useCallActivities(user?.id)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedCall, setSelectedCall] = useState<WorkCall | null>(null)
  const [activeType, setActiveType] = useState<CallType | 'all'>('all')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState('')
  const draftKey = user ? `lumicrm-call-draft:${user.id}` : ''

  useEffect(() => {
    if (!isModalOpen || !draftKey || editingId) return
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(form))
    } catch {
      // The form remains usable when private storage is unavailable.
    }
  }, [draftKey, editingId, form, isModalOpen])

  const filtered = useMemo(() => calls.filter(call => {
    const metadata = call.metadata || {}
    if (activeType !== 'all' && metadata.call_type !== activeType) return false
    const haystack = [call.title, metadata.contact_name, metadata.phone, metadata.address, call.notes].join(' ').toLowerCase()
    return haystack.includes(search.trim().toLowerCase())
  }), [activeType, calls, search])

  const setField = (key: keyof CallForm, value: string) => setForm(current => ({ ...current, [key]: value }))

  const openCreate = () => {
    setEditingId(null)
    let draft = initialForm()
    try {
      const stored = draftKey ? sessionStorage.getItem(draftKey) : null
      if (stored) draft = { ...draft, ...JSON.parse(stored) as Partial<CallForm> }
    } catch {
      // Ignore a damaged or unavailable draft.
    }
    setForm(draft)
    setError('')
    setIsModalOpen(true)
  }

  const openEdit = (call: WorkCall) => {
    setSelectedCall(null)
    setEditingId(call.id)
    setForm(formFromCall(call))
    setError('')
    setIsModalOpen(true)
  }

  const closeForm = (discardDraft = true) => {
    if (discardDraft && draftKey && !editingId) sessionStorage.removeItem(draftKey)
    setIsModalOpen(false)
    setEditingId(null)
    setForm(initialForm())
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) return
    setError('')
    const occurredAt = new Date(`${form.date}T${form.time || '12:00'}`).toISOString()
    const metadata: CallMetadata = {
      call_type: form.call_type, status: form.status, contact_method: form.contact_method, contact_name: form.contact_name,
      phone: form.phone, address: form.address, property_type: form.property_type, demand: form.demand,
      unsuitable: form.unsuitable, property_url: form.property_url, area: form.area, floor: form.floor, price: form.price,
      contacted_at: form.contacted_at, next_contact_at: form.next_contact_at, meeting_at: form.meeting_at,
      second_touch_at: form.second_touch_at, second_comment: form.second_comment,
    }
    const payload = {
      title: form.contact_name.trim() || form.phone.trim() || 'Звонок',
      occurred_at: occurredAt,
      dueAt: form.next_contact_at ? new Date(form.next_contact_at).toISOString() : null,
      source: form.source || null,
      outcome: form.meeting_outcome || null,
      notes: form.comments || null,
      metadata,
    }
    try {
      await saveCall(payload, editingId || undefined)
    } catch (saveError) {
      const details = saveError && typeof saveError === 'object' && 'message' in saveError
        ? String(saveError.message)
        : ''
      const action = editingId ? 'Не удалось обновить звонок' : 'Не удалось сохранить звонок'
      setError(details ? `${action}: ${details}` : action)
      return
    }
    closeForm(true)
  }

  const remove = async (id: string) => {
    if (!user) return
    setError('')
    try {
      await removeCall(id)
    } catch {
      setError('Не удалось переместить звонок в корзину')
    }
  }

  const field = (key: keyof CallForm, label: string, type = 'text', placeholder = '') => (
    <label className="lumi-muted-strong block min-w-0 text-sm font-medium">{label}
      <input type={type} value={String(form[key])} onChange={event => setField(key, event.target.value)} placeholder={placeholder} className="lumi-control mt-2 w-full min-w-0 rounded-xl px-4 py-3 outline-none" />
    </label>
  )

  return (
    <div className="min-w-0 space-y-6 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="lumi-text text-3xl font-bold">Звонки</h1><p className="lumi-muted mt-1">Журнал выполненной работы, отдельно от календаря.</p></div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><button type="button" onClick={() => void printCurrentPage()} className="lumi-control flex items-center justify-center gap-2 rounded-xl px-4 py-3"><Download className="h-4 w-4" />PDF</button><button type="button" onClick={openCreate} className="lumi-gradient-button flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold"><Plus className="h-5 w-5" />Записать звонок</button></div>
      </div>

      <div className="lumi-panel flex min-w-0 flex-col gap-3 rounded-2xl border p-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 lg:pb-0">
          <button type="button" onClick={() => setActiveType('all')} className={`shrink-0 rounded-xl px-4 py-2 text-sm ${activeType === 'all' ? 'lumi-accent-bg' : 'lumi-control'}`}>Все · {calls.length}</button>
          {CALL_TYPES.map(type => <button type="button" key={type.value} onClick={() => setActiveType(type.value)} className={`shrink-0 rounded-xl px-4 py-2 text-sm ${activeType === type.value ? 'lumi-accent-bg' : 'lumi-control'}`}>{type.label} · {calls.filter(call => call.metadata?.call_type === type.value).length}</button>)}
        </div>
        <label className="relative min-w-0 flex-1 lg:ml-auto lg:max-w-sm"><Search className="lumi-muted absolute left-3 top-2.5 h-5 w-5" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Имя, телефон или адрес" className="lumi-control w-full rounded-xl py-2.5 pl-10 pr-4 outline-none" /></label>
      </div>

      {(error || loadError) && <div className="flex flex-col gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-400 sm:flex-row sm:items-center sm:justify-between"><span>{error || 'Не удалось обновить журнал из облака. Показана копия с устройства.'}</span>{loadError && <button type="button" onClick={() => void refetch()} className="lumi-control inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"><RefreshCw className="h-4 w-4" />Повторить</button>}</div>}
      {loading ? <p className="lumi-muted py-12 text-center">Загружаем журнал…</p> : filtered.length === 0 ? (
        <div className="lumi-panel lumi-muted flex flex-col items-center rounded-2xl border py-16 text-center"><Phone className="mb-3 h-12 w-12" /><p className="lumi-text font-semibold">Записей пока нет</p><p className="mt-1 text-sm">После звонка внесите результат — он попадёт в аналитику и план.</p></div>
      ) : (
        <div data-print-list className="grid min-w-0 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {filtered.map(call => {
            const meta = call.metadata || {}
            const typeLabel = CALL_TYPES.find(type => type.value === meta.call_type)?.label || 'Звонок'
            const propertyUrl = safeExternalUrl(meta.property_url)
            return <article data-print-item key={call.id} className="lumi-panel lumi-content-auto min-w-0 rounded-2xl border p-5">
              <div className="flex items-start gap-3"><div className="lumi-accent-soft rounded-xl p-2.5"><Phone className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="lumi-accent-text text-xs font-semibold uppercase">{typeLabel}</p><h2 className="lumi-text mt-1 truncate text-lg font-semibold">{meta.contact_name || call.title}</h2><p className="lumi-muted mt-1 truncate text-sm">{meta.phone || 'Телефон не указан'}</p></div><button type="button" onClick={() => void remove(call.id)} className="rounded-lg bg-red-500/10 p-2 text-red-500" title="Удалить"><Trash2 className="h-4 w-4" /></button></div>
              <div className="lumi-border mt-4 grid gap-2 border-t pt-4 text-sm"><p className="lumi-muted flex items-center gap-2"><Calendar className="h-4 w-4" />{call.occurred_at ? new Date(call.occurred_at).toLocaleString('ru-RU') : 'Дата не указана'}</p>{meta.address && <p className="lumi-muted truncate">{meta.address}</p>}{meta.price && <p className="lumi-text font-medium">{Number(meta.price).toLocaleString('ru-RU')} ₽</p>}{call.outcome && <p className="lumi-muted">Итог встречи: {call.outcome}</p>}{call.notes && <p className="lumi-muted line-clamp-3">{call.notes}</p>}{propertyUrl && <a href={propertyUrl} target="_blank" rel="noreferrer" className="lumi-accent-text inline-flex items-center gap-1">Открыть объявление <ExternalLink className="h-3.5 w-3.5" /></a>}</div>
              <div data-print-hidden className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => setSelectedCall(call)} className="lumi-control inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm"><Eye className="h-4 w-4" />Подробнее</button><button type="button" onClick={() => openEdit(call)} className="lumi-control inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm"><Pencil className="h-4 w-4" />Изменить</button></div>
            </article>
          })}
        </div>
      )}

      <Modal isOpen={Boolean(selectedCall)} onClose={() => setSelectedCall(null)} title="Карточка звонка">
        {selectedCall && (() => {
          const metadata = selectedCall.metadata || {}
          const propertyUrl = safeExternalUrl(metadata.property_url)
          const details = [
            ['Тип звонка', CALL_TYPES.find(type => type.value === metadata.call_type)?.label || 'Не указан'],
            ['Дата и время', displayDateTime(selectedCall.occurred_at)],
            ['Статус', metadata.status],
            ['Источник', selectedCall.source],
            ['Способ связи', metadata.contact_method],
            [metadata.call_type === 'selection' ? 'Покупатель' : 'Собственник', metadata.contact_name || selectedCall.title],
            ['Телефон', metadata.phone],
            ['Адрес', metadata.address],
            ['Тип объекта', metadata.property_type],
            ['Спрос', metadata.demand],
            ['Почему не подходит', metadata.unsuitable],
            ['Площадь', metadata.area],
            ['Этаж', metadata.floor],
            ['Цена', metadata.price ? `${Number(metadata.price).toLocaleString('ru-RU')} ₽` : ''],
            ['Когда связался', displayDateTime(metadata.contacted_at)],
            ['Следующий контакт', displayDateTime(metadata.next_contact_at)],
            ['Встреча', displayDateTime(metadata.meeting_at)],
            ['Итог встречи', selectedCall.outcome],
            ['Комментарии', selectedCall.notes],
            ['Второе касание', displayDateTime(metadata.second_touch_at)],
            ['Второй комментарий', metadata.second_comment],
          ].filter(([, value]) => value && value !== 'Не указано')
          return <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">{details.map(([label, value]) => <div key={label} className="lumi-panel-muted min-w-0 rounded-xl border p-4"><p className="lumi-muted text-xs">{label}</p><p className="lumi-text mt-1 break-words font-medium">{value}</p></div>)}</div>
            {propertyUrl && <a href={propertyUrl} target="_blank" rel="noreferrer" className="lumi-accent-text inline-flex items-center gap-2">Открыть объявление <ExternalLink className="h-4 w-4" /></a>}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={() => setSelectedCall(null)} className="lumi-control rounded-xl px-5 py-3">Закрыть</button><button type="button" onClick={() => openEdit(selectedCall)} className="lumi-gradient-button inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold"><Pencil className="h-4 w-4" />Редактировать</button></div>
          </div>
        })()}
      </Modal>

      <Modal isOpen={isModalOpen} onClose={() => closeForm(false)} closeOnBackdrop={false} title={editingId ? 'Редактировать звонок' : 'Записать выполненный звонок'}>
        <form onSubmit={save} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="lumi-muted-strong text-sm font-medium">Тип звонка<select value={form.call_type} onChange={event => setForm(current => ({ ...current, call_type: event.target.value as CallType }))} className="lumi-control mt-2 w-full rounded-xl px-4 py-3">{CALL_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
            {field('date', 'Дата', 'date')}{field('time', 'Время', 'time')}{field('status', 'Статус')}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{field('source', 'Источник', 'text', 'Авито, Циан…')}{field('contact_method', 'Способ связи')}{field('contact_name', form.call_type === 'selection' ? 'Покупатель' : 'Собственник')}{field('phone', 'Телефон', 'tel')}{field('address', 'Адрес')}{field('property_type', form.call_type === 'inbound' ? 'Тип / спрос' : 'Тип объекта')}</div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{form.call_type === 'inbound' ? field('demand', 'Спрос') : form.call_type === 'selection' ? field('unsuitable', 'Почему не подходит') : null}{field('area', 'Площадь')}{field('floor', 'Этаж')}{field('price', 'Цена', 'number')}</div>
          {field('property_url', 'Ссылка на квартиру', 'url', 'https://…')}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{field('contacted_at', 'Когда связался', 'datetime-local')}{field('next_contact_at', 'Следующий контакт', 'datetime-local')}{field('meeting_at', 'Встреча', 'datetime-local')}</div>
          <label className="lumi-muted-strong block text-sm font-medium">Итог встречи<input value={form.meeting_outcome} onChange={event => setField('meeting_outcome', event.target.value)} className="lumi-control mt-2 w-full rounded-xl px-4 py-3" /></label>
          <label className="lumi-muted-strong block text-sm font-medium">Комментарии<textarea value={form.comments} onChange={event => setField('comments', event.target.value)} rows={3} className="lumi-control mt-2 w-full resize-none rounded-xl px-4 py-3" /></label>
          {form.call_type !== 'inbound' && <div className="grid gap-4 sm:grid-cols-2">{field('second_touch_at', 'Второе касание', 'datetime-local')}{field('second_comment', 'Второй комментарий')}</div>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={() => closeForm(true)} disabled={saving} className="lumi-control rounded-xl px-5 py-3 disabled:opacity-60">Отмена</button><button type="submit" disabled={saving} className="lumi-gradient-button rounded-xl px-6 py-3 font-semibold disabled:opacity-60">{saving ? 'Сохраняем…' : editingId ? 'Сохранить изменения' : 'Сохранить звонок'}</button></div>
        </form>
      </Modal>
    </div>
  )
}

export default CallsPage
