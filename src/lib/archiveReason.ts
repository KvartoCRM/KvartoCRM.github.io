export const archiveReasons={sold:'Продано',need_closed:'Потребность закрыта',refused:'Отказ от сотрудничества',postponed:'Отложено до даты',other:'Другая причина'} as const
export type ArchiveReason={reason:keyof typeof archiveReasons;note:string;resumeDate:string}
export function validateArchiveReason(value:ArchiveReason){
 if(!Object.prototype.hasOwnProperty.call(archiveReasons,value.reason))throw new Error('Выберите причину архива.')
 if(value.reason==='other'&&!value.note.trim())throw new Error('Укажите причину в комментарии.')
 if(value.reason==='postponed'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value.resumeDate)||!Number.isFinite(Date.parse(value.resumeDate))||new Date(value.resumeDate+'T12:00:00Z').toISOString().slice(0,10)!==value.resumeDate))throw new Error('Укажите корректную дату возвращения к контакту.')
 return value
}
export function currentArchiveReason(row:Record<string,unknown>,activities:Record<string,unknown>[]){
 if(row.status!=='archived'||!row.archived_at)return null
 return activities.find(activity=>{const m=activity.metadata as Record<string,unknown>|null;return !activity.deleted_at&&m?.kind==='archive_reason'&&m.entityId===row.id&&Date.parse(String(m.archivedAt))===Date.parse(String(row.archived_at))})?.metadata||null
}
