import type {Task} from '../types/index.ts'
import {calendarParts} from './scheduling.ts'
export function rememberInstruction(text:string):string|null {
 const match=text.trim().match(/^запомни\s*[: ,]\s*([\s\S]+)$/i)
 return match?match[1].trim():null
}
export function workHabits(tasks:Task[],today:string){
 const completed=tasks.filter(t=>t.isCompleted||t.status==='done')
 const overdue=tasks.filter(t=>!t.isCompleted&&t.status!=='done'&&t.dueDate&&t.dueDate<today)
 const counts=new Map<string,number>()
 for(const task of tasks){const title=task.title.trim().toLocaleLowerCase('ru-RU');counts.set(title,(counts.get(title)||0)+1)}
 return {totalTasks:tasks.length,completed:completed.length,overdue:overdue.length,completedAfterDueDate:completed.filter(t=>t.dueDate&&t.completedAt&&Number.isFinite(Date.parse(t.completedAt))&&calendarParts(new Date(t.completedAt)).date>t.dueDate).length,frequentTasks:[...counts].filter(([,n])=>n>1).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([title,count])=>({title:title.slice(0,150),count})),note:'Наблюдения по текущим задачам, не оценка личности. Частые задачи считаются по одинаковым названиям. Причины просрочек неизвестны.'}
}

export function fitMiaContext(source:Record<string,unknown>,budget=15000):string{
 const context=structuredClone(source)
 let result=JSON.stringify(context)
 for(const key of ['conversation','result','properties','contacts','owners','evidence']){
  const value=context[key]
  const entries=key==='result'&&value&&typeof value==='object'&&!Array.isArray(value)?(value as Record<string,unknown>).rows:value
  if(!Array.isArray(entries))continue
  while(result.length>budget&&entries.length>(key==='conversation'?1:0)){
   if(key==='conversation')entries.shift();else entries.pop()
   context.selectionNote='Контекст сокращён. Это часть базы и беседы; для недостающих фактов используй поиск или уточнение.'
   result=JSON.stringify(context)
  }
 }
 if(result.length>budget)throw new Error('Слишком длинное сообщение. Разделите его на несколько частей.')
 return result
}
