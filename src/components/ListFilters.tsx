import { useState, type ReactNode } from 'react'
import SortMenu from './SortMenu'

export type FilterField = { key: string; label: string; type?: 'text' | 'date' | 'time' | 'number'; options?: Array<{ value: string; label: string }> }
export const filterOptions = (values: Array<string | undefined | null>) => [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'ru')).map(value => ({ value, label: value }))

export default function ListFilters({ fields, values, onChange, onReset, count, total, children, sortOptions = [], defaultSort = 'created', defaultDirection = 'desc' }: {
  fields: FilterField[]; values: Record<string, string>; onChange: (key: string, value: string) => void;
  onReset: () => void; count: number; total: number; children?: ReactNode;
  sortOptions?: Array<{ value: string; label: string }>; defaultSort?: string; defaultDirection?: string;
}) {
  const [expanded, setExpanded] = useState(false)
  const activeCount = fields.filter(field => Boolean(values[field.key])).length
  return <section aria-label="Фильтры списка" className="lumi-panel space-y-3 rounded-2xl border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="lumi-text rounded-lg py-1 text-sm font-semibold">{expanded ? 'Скрыть фильтры' : 'Фильтры'}{activeCount > 0 ? ` · ${activeCount}` : ''}</button><div className="flex items-center gap-3"><span aria-live="polite" className="lumi-muted text-sm">Найдено {count} из {total}</span><button type="button" onClick={onReset} className="lumi-accent-text rounded-lg px-2 py-1 text-sm">Сбросить всё</button></div></div>
    {sortOptions.length > 0 && <div className="flex flex-wrap items-center gap-3"><SortMenu options={sortOptions} value={values.sort || defaultSort} direction={values.direction || defaultDirection} onChange={(field, direction) => { onChange('sort', field); onChange('direction', direction) }} /><span className="lumi-muted text-xs">{sortOptions.find(option => option.value === (values.sort || defaultSort))?.label} · {(values.direction || defaultDirection) === 'asc' ? 'по возрастанию' : 'по убыванию'}</span></div>}
    {expanded && children}
    {expanded && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{fields.map(field => <label key={field.key} className="lumi-muted-strong min-w-0 text-xs font-medium">{field.label}
      {field.options ? <select value={values[field.key] || ''} onChange={event => onChange(field.key, event.target.value)} className="lumi-control mt-1.5 w-full min-w-0 rounded-lg px-3 py-2.5 text-sm"><option value="">Все</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        : <input type={field.type || 'text'} min={field.type === 'number' ? '0' : undefined} value={values[field.key] || ''} onChange={event => onChange(field.key, event.target.value)} className="lumi-control mt-1.5 w-full min-w-0 rounded-lg px-3 py-2.5 text-sm" />}
    </label>)}</div>}
  </section>
}
