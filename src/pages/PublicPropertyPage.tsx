import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Download, Home, Mail, Phone } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { printCurrentPage } from '../lib/print'

interface Snapshot {
  address: string; price?: number; rooms?: number; area?: number; floor?: number; totalFloors?: number; propertyType?: string
  description?: string; repair?: string; balcony?: boolean; elevator?: boolean; parking?: boolean; heating?: string; walls?: string
  photos?: Array<{ url: string; name: string; category?: string; primary?: boolean }>
  contact?: { name?: string; phone?: string; email?: string; position?: string }
}

const safeString = (value: unknown, maximum = 5000) => typeof value === 'string' ? value.slice(0, maximum) : undefined
const safeNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined
const safeHttpsUrl = (value: unknown) => {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null
  } catch { return null }
}
const normalizeSnapshot = (value: unknown): Snapshot | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const address = safeString(source.address, 500)
  if (!address) return null
  const contactSource = source.contact && typeof source.contact === 'object' && !Array.isArray(source.contact)
    ? source.contact as Record<string, unknown> : {}
  const photos = Array.isArray(source.photos) ? source.photos.slice(0, 100).flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const photo = item as Record<string, unknown>
    const url = safeHttpsUrl(photo.url)
    return url ? [{ url, name: safeString(photo.name, 300) || 'Фото объекта', category: safeString(photo.category, 100), primary: photo.primary === true }] : []
  }) : []
  return {
    address, price: safeNumber(source.price), rooms: safeNumber(source.rooms), area: safeNumber(source.area),
    floor: safeNumber(source.floor), totalFloors: safeNumber(source.totalFloors), propertyType: safeString(source.propertyType, 100),
    description: safeString(source.description), repair: safeString(source.repair, 100), balcony: source.balcony === true,
    elevator: source.elevator === true, parking: source.parking === true, heating: safeString(source.heating, 100), walls: safeString(source.walls, 100),
    photos, contact: { name: safeString(contactSource.name, 200), phone: safeString(contactSource.phone, 80), email: safeString(contactSource.email, 320), position: safeString(contactSource.position, 200) },
  }
}

const PublicPropertyPage = () => {
  const { slug } = useParams()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true); setSnapshot(null); setIndex(0)
      if (!slug || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slug)) {
        if (active) setLoading(false)
        return
      }
      const { data } = await supabase.rpc('get_public_property_share', { p_slug: slug }).setHeader('x-lumicrm-network-only', 'true').maybeSingle()
      const row = data as { snapshot?: unknown } | null
      const value = normalizeSnapshot(row?.snapshot)
      if (active && value) {
        value.photos = [...(value.photos || [])].sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)))
        setSnapshot(value)
      }
      if (active) setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [slug])

  if (loading) return <main className="lumi-shell flex min-h-screen items-center justify-center"><p className="lumi-muted">Загружаем резюме объекта…</p></main>
  if (!snapshot) return <main className="lumi-shell flex min-h-screen items-center justify-center p-6"><section className="lumi-panel max-w-lg rounded-2xl border p-8 text-center"><Home className="lumi-muted mx-auto mb-4 h-12 w-12" /><h1 className="lumi-text text-2xl font-bold">Резюме недоступно</h1><p className="lumi-muted mt-2">Ссылка могла быть отключена агентом.</p></section></main>

  const photos = snapshot.photos || []
  return <main className="lumi-shell min-h-screen px-4 py-6 sm:px-6 lg:py-10"><div className="mx-auto max-w-6xl space-y-6"><header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="lumi-accent-text text-sm font-semibold">KvartoCRM · резюме объекта</p><h1 className="lumi-text mt-1 break-words text-3xl font-bold">{snapshot.address}</h1></div><button type="button" onClick={() => void printCurrentPage()} className="lumi-control flex items-center justify-center gap-2 rounded-xl px-4 py-3"><Download className="h-4 w-4" />Сохранить PDF</button></header>
    {photos.length > 0 && <section className="lumi-panel relative overflow-hidden rounded-3xl border"><div className="aspect-[16/9] max-h-[680px]"><img src={photos[index].url} alt={photos[index].name} className="h-full w-full object-cover" /></div>{photos.length > 1 && <><button aria-label="Предыдущее фото" type="button" onClick={() => setIndex(current => (current - 1 + photos.length) % photos.length)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-3 text-white"><ArrowLeft className="h-5 w-5" /></button><button aria-label="Следующее фото" type="button" onClick={() => setIndex(current => (current + 1) % photos.length)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-3 text-white"><ArrowRight className="h-5 w-5" /></button><span className="absolute bottom-3 right-3 rounded-full bg-black/65 px-3 py-1.5 text-sm text-white">{index + 1} / {photos.length}</span></>}</section>}
    <div className="grid gap-6 lg:grid-cols-3"><section className="lumi-panel rounded-2xl border p-6 lg:col-span-2"><h2 className="lumi-text text-xl font-semibold">Характеристики</h2><div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-[var(--lumi-border)] sm:grid-cols-3">{[['Цена', snapshot.price ? `${snapshot.price.toLocaleString('ru-RU')} ₽` : 'По запросу'], ['Комнаты', snapshot.rooms], ['Площадь', snapshot.area ? `${snapshot.area} м²` : undefined], ['Этаж', snapshot.floor ? `${snapshot.floor}/${snapshot.totalFloors || '—'}` : undefined], ['Тип', snapshot.propertyType], ['Ремонт', snapshot.repair], ['Отопление', snapshot.heating], ['Стены', snapshot.walls]].filter(([, value]) => value).map(([label, value]) => <div key={String(label)} className="lumi-panel-muted p-4"><p className="lumi-muted text-xs">{label}</p><p className="lumi-text mt-1 font-semibold">{value}</p></div>)}</div>{snapshot.description && <><h2 className="lumi-text mt-7 text-xl font-semibold">Описание</h2><p className="lumi-muted-strong mt-3 whitespace-pre-wrap leading-7">{snapshot.description}</p></>}</section><aside className="lumi-panel h-fit rounded-2xl border p-6"><h2 className="lumi-text text-xl font-semibold">Связаться с агентом</h2><p className="lumi-text mt-4 font-semibold">{snapshot.contact?.name || 'Агент'}</p><p className="lumi-muted mt-1 text-sm">{snapshot.contact?.position || 'Специалист по недвижимости'}</p><div className="mt-5 space-y-3">{snapshot.contact?.phone && <a href={`tel:${snapshot.contact.phone}`} className="lumi-control flex items-center gap-3 rounded-xl p-3"><Phone className="h-5 w-5" />{snapshot.contact.phone}</a>}{snapshot.contact?.email && <a href={`mailto:${snapshot.contact.email}`} className="lumi-control flex min-w-0 items-center gap-3 rounded-xl p-3"><Mail className="h-5 w-5 shrink-0" /><span className="truncate">{snapshot.contact.email}</span></a>}</div><p className="lumi-muted mt-5 text-xs leading-5">Контакты собственника и покупателей в резюме не публикуются.</p></aside></div></div></main>
}

export default PublicPropertyPage
