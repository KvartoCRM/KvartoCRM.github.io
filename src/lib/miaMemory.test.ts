import test from 'node:test'
import assert from 'node:assert/strict'
import {rememberInstruction,workHabits,fitMiaContext} from './miaMemory.ts'
import type {Task} from '../types/index.ts'
test('memory only stores explicit remember requests without silently truncating facts',()=>{assert.equal(rememberInstruction('Запомни: отвечай коротко'),'отвечай коротко');assert.equal(rememberInstruction('Поставь задачу завтра'),null);assert.equal(rememberInstruction('запомни '+ 'а'.repeat(1500))?.length,1500)})
test('work observations distinguish completed late, overdue and missing deadlines',()=>{const rows=[{title:'Позвонить',dueDate:'2026-11-04',isCompleted:false},{title:'Позвонить',dueDate:'2026-11-07',isCompleted:false},{title:'Отчёт',dueDate:'2026-11-04',isCompleted:true,completedAt:'2026-11-05T08:00:00Z'},{title:'Проверить',isCompleted:false}] as Task[];const r=workHabits(rows,'2026-11-06');assert.equal(r.overdue,1);assert.equal(r.completed,1);assert.equal(r.completedAfterDueDate,1);assert.equal(r.frequentTasks[0].count,2)})

test('long chat keeps newest request and marks reduced selection',()=>{const source={conversation:Array.from({length:10},(_,i)=>({text:i===9?'latest request':'x'.repeat(2000)})),contacts:Array.from({length:100},(_,i)=>({id:i,name:'x'.repeat(200)}))};const fitted=JSON.parse(fitMiaContext(source));assert.ok(JSON.stringify(fitted).length<=15000);assert.equal(fitted.conversation.at(-1).text,'latest request');assert.ok(fitted.selectionNote);assert.equal(source.conversation.length,10)})
