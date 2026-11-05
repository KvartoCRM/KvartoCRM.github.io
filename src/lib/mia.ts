import type {Client,Property} from '../types'
import {calendarParts} from './scheduling.ts'
export type MiaRecord={type:'record';clientId:string;propertyId:string;meeting:null|{date:string;notes:string};task:null|{date:string;title:string;notes:string}}
export const miaPages={today:'/work',calendar:'/work?view=calendar',tasks:'/work?view=tasks',contacts:'/contacts',properties:'/properties',deals:'/deals',history:'/work',reports:'/work'}
export function nextMonday(today:string){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+((8-d.getUTCDay())%7||7));return d.toISOString().slice(0,10)}
export function validateMiaRecord(value:unknown,clients:Client[],properties:Property[],today=calendarParts(new Date()).date):MiaRecord {
 if(!value||typeof value!=='object')throw new Error('Не удалось разобрать действие. Уточните просьбу.')
 const r=value as MiaRecord
 const validDate=(s:unknown)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s
 const text=(s:unknown,max:number)=>typeof s==='string'&&s.trim().length>0&&s.length<=max
 if(r.type!=='record'||typeof r.clientId!=='string'||typeof r.propertyId!=='string'||(!r.meeting&&!r.task))throw new Error('Нужно уточнить, какое действие записать.')
 if(r.clientId&&!clients.some(c=>c.id===r.clientId&&c.status!=='archived'))throw new Error('Контакт недоступен или находится в архиве. Уточните контакт.')
 if(r.propertyId&&!properties.some(p=>p.id===r.propertyId&&p.status!=='archived'))throw new Error('Объект недоступен. Уточните адрес.')
 if(r.meeting&&clients.find(c=>c.id===r.clientId)?.type!=='buyer')throw new Error('Укажите покупателя, который был на показе.')
 if(r.meeting&&(!r.clientId||!r.propertyId||!validDate(r.meeting.date)||r.meeting.date>today||!text(r.meeting.notes,4000)))throw new Error('Для показа нужны контакт, объект, прошедшая дата и итог.')
 if(r.task&&(!validDate(r.task.date)||r.task.date<today||!text(r.task.title,300)||typeof r.task.notes!=='string'||r.task.notes.length>4000))throw new Error('Уточните название и будущую дату задачи.')
 return r
}
