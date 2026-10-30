export function relativeFilters(values: Record<string,string>, now = new Date()) {
  if (!['today','week','next7'].includes(values.period)) return values
  const start = new Date(now);start.setHours(12,0,0,0)
  if(values.period === 'week')start.setDate(start.getDate()-((start.getDay()+6)%7))
  const end=new Date(start);if(values.period !== 'today')end.setDate(end.getDate()+6)
  const date=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  return {...values,from:date(start),to:date(end)}
}
