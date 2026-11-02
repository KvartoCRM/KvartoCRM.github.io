export const normalizeContactPhone = (value:string) => {
 const digits=value.replace(/\D/g,'')
 if(digits.length===11&&digits.startsWith('8'))return '7'+digits.slice(1)
 if(digits.length===10)return '7'+digits
 return digits.length>=7?digits:''
}
export function duplicateGroups<T extends {id:string;phone:string}>(contacts:T[]):T[][]{
 const grouped=new Map<string,T[]>()
 for(const contact of contacts){const key=normalizeContactPhone(contact.phone);if(key)grouped.set(key,[...(grouped.get(key)||[]),contact])}
 return [...grouped.values()].filter(group=>group.length>1)
}
