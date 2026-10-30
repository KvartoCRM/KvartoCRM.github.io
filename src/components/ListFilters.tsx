import { useRef, useState, type ReactNode } from 'react'
import SortMenu from './SortMenu'
import SavedListViews from './SavedListViews'
import AnchoredPopover from './AnchoredPopover'
import { SlidersHorizontal, ChevronDown, X } from 'lucide-react'

export type FilterField = { key: string; label: string; type?: 'text' | 'date' | 'time' | 'number'; options?: Array<{ value: string; label: string }> }
export const filterOptions = (values: Array<string | undefined | null>) => [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'ru')).map(value => ({ value, label: value }))

export default function ListFilters({ fields, values, onChange, onReset, count, total, children, search, scope, onApply, sortOptions = [], defaultSort = 'created', defaultDirection = 'desc' }: {
  fields: FilterField[]; values: Record<string, string>; onChange: (key: string, value: string) => void;
  onReset: () => void; count: number; total: number; children?: ReactNode; search?: ReactNode;
  sortOptions?: Array<{ value: string; label: string }>; defaultSort?: string; defaultDirection?: string;
  scope?: string; onApply?: (values: Record<string,string>) => void;
}) {
  const [expanded, setExpanded] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const activeCount = fields.filter(field => Boolean(values[field.key])).length
  const changed = activeCount > 0 || Boolean(values.$search) || Boolean(values.$role && values.$role !== 'all') || Boolean(values.sort && values.sort !== defaultSort) || Boolean(values.direction && values.direction !== defaultDirection)
  const close = () => { setExpanded(false); anchor.current?.focus() }
  const changeField = (key: string, value: string) => { if (key === 'from' || key === 'to') onChange('period',''); onChange(key,value) }
  return <section aria-label="Фильтры списка" className="flex min-w-0 flex-wrap items-center gap-2">
    {search}
    <button ref={anchor} type="button" aria-expanded={expanded} aria-haspopup="dialog" onClick={() => setExpanded(value => !value)} className="lumi-control inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm"><SlidersHorizontal className="h-4 w-4" />Фильтры{activeCount > 0 && <span className="lumi-accent-text font-semibold">{activeCount}</span>}<ChevronDown className="h-3 w-3" /></button>
    {sortOptions.length > 0 && <SortMenu options={sortOptions} value={values.sort || defaultSort} direction={values.direction || defaultDirection} onChange={(field, direction) => { onChange('sort', field); onChange('direction', direction) }} />}
    <span aria-live="polite" className="lumi-muted whitespace-nowrap text-xs" title="Количество найденных записей">{count} из {total}</span>
    {changed && <button type="button" onClick={onReset} className="lumi-accent-text rounded-lg px-2 py-1 text-xs">Сбросить</button>}
    <AnchoredPopover open={expanded} anchorRef={anchor} onClose={() => setExpanded(false)} align="left" width={440} ariaLabel="Условия фильтрации" className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3"><h2 className="lumi-text text-sm font-semibold">Фильтры</h2><button type="button" onClick={close} aria-label="Закрыть фильтры" className="lumi-control rounded-lg p-1.5"><X className="h-4 w-4" /></button></div>
      {children}
      {scope && onApply && <SavedListViews scope={scope} values={values} onApply={onApply} />}
      {fields.some(field => field.key === 'from') && <label className="lumi-muted-strong block text-xs font-medium">Быстрый период<select aria-label="Быстрый период" value={values.period || ''} onChange={e => {onChange('period',e.target.value);onChange('from','');onChange('to','')}} className="lumi-control mt-1.5 w-full rounded-lg px-3 py-2 text-sm"><option value="">Произвольные даты</option><option value="today">Сегодня</option><option value="week">Эта неделя</option><option value="next7">Ближайшие 7 дней</option></select></label>}
      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">{fields.map(field => <label key={field.key} className="lumi-muted-strong min-w-0 text-xs font-medium">{field.label}
        {field.options ? <select aria-label={field.label} value={values[field.key] || ''} onChange={event => onChange(field.key, event.target.value)} className="lumi-control mt-1.5 w-full min-w-0 rounded-lg px-3 py-2.5 text-sm"><option value="">Все</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          : <input aria-label={field.label} type={field.type || 'text'} min={field.type === 'number' ? '0' : undefined} value={values[field.key] || ''} onChange={event => changeField(field.key, event.target.value)} className="lumi-control mt-1.5 w-full min-w-0 rounded-lg px-3 py-2.5 text-sm" />}
      </label>)}</div>
      <div className="lumi-border flex items-center justify-between gap-3 border-t pt-3"><button type="button" onClick={onReset} className="lumi-accent-text text-sm">Сбросить всё</button><button type="button" onClick={close} className="lumi-gradient-button rounded-lg px-4 py-2 text-sm">Показать · {count}</button></div>
    </AnchoredPopover>
  </section>
}
