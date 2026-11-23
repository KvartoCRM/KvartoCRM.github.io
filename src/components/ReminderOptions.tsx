export default function ReminderOptions({ value, onChange, scheduled }: {
  value: number[]; onChange: (value: number[]) => void; scheduled: boolean
}) {
  return <fieldset className="lumi-panel-muted rounded-xl border p-4">
    <legend className="lumi-text px-1 text-sm font-semibold">Напоминания</legend>
    <p className="lumi-muted text-sm">В назначенное время уведомление придёт автоматически.</p>
    <div className="mt-3 flex flex-wrap gap-4">
      {[[1440, 'За сутки'], [60, 'За час'], [5, 'За 5 минут']].map(([minutes, label]) =>
        <label key={minutes} className="lumi-text flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value.includes(Number(minutes))}
            onChange={e => onChange(e.target.checked ? [...value, Number(minutes)] : value.filter(v => v !== minutes))}/>
          {label}
        </label>)}
    </div>
    {!scheduled && <p className="lumi-muted mt-2 text-sm">Укажите дату и время задачи, чтобы получать уведомления.</p>}
  </fieldset>
}
