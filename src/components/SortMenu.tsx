import { useRef, useState } from 'react'
import { ArrowDownUp, Check, ChevronDown } from 'lucide-react'
import AnchoredPopover from './AnchoredPopover'

export default function SortMenu({ options, value, direction, onChange }: {
  options: Array<{ value: string; label: string }>; value: string; direction: string;
  onChange: (field: string, direction: string) => void;
}) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const choose = (field: string, order: string) => { onChange(field, order); setOpen(false); anchor.current?.focus() }
  return <>
    <button ref={anchor} type="button" aria-expanded={open} onClick={() => setOpen(current => !current)} className="lumi-control inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm"><ArrowDownUp className="h-4 w-4" />Сортировать<ChevronDown className="h-3 w-3" /></button>
    <AnchoredPopover open={open} anchorRef={anchor} onClose={() => setOpen(false)} width={280} ariaLabel="Сортировка" className="p-2">
      <div role="group" aria-label="Поле сортировки">{options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => choose(option.value, direction)} className="lumi-nav-item flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm"><Check className={`h-4 w-4 ${value === option.value ? 'lumi-accent-text' : 'invisible'}`} />{option.label}</button>)}</div>
      <div className="lumi-border mt-2 border-t pt-2" role="group" aria-label="Направление сортировки">{[['asc', 'По возрастанию'], ['desc', 'По убыванию']].map(([order, label]) => <button key={order} type="button" aria-pressed={direction === order} onClick={() => choose(value, order)} className="lumi-nav-item flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm"><Check className={`h-4 w-4 ${direction === order ? 'lumi-accent-text' : 'invisible'}`} />{label}</button>)}</div>
    </AnchoredPopover>
  </>
}
