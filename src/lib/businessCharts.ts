import { inferContactRoles } from './contactRoles.ts'
import { inPortfolio, mortgageData, mortgageStates, type BusinessSource } from './businessAccounting.ts'
export function businessChartData(source: BusinessSource, mode: 'sale'|'rent'|'mortgage', from: string, to: string) {
 const records=mode==='mortgage'?source.mortgages:source.clients
 const dates=records.map(r=>String(mode==='mortgage'?mortgageData(r).submittedOn:r.created_at||'').slice(0,10)).filter(Boolean).sort()
 const end=to||new Date().toLocaleDateString('sv-SE')
 const start=from||dates[0]||end
 const startDate=new Date(start+'T12:00:00'),endDate=new Date(end+'T12:00:00')
 const span=(endDate.getTime()-startDate.getTime())/86400000
 const monthly=span>100,weekly=span>40&&!monthly
 const key=(value:string)=>{if(monthly)return value.slice(0,7);const d=new Date(value+'T12:00:00');if(weekly)d.setDate(d.getDate()-((d.getDay()+6)%7));return d.toLocaleDateString('sv-SE')}
 const groups=new Map<string,{label:string;first:number;second:number;people:Set<unknown>}>()
 // Bound all-time ranges to sane calendar years; malformed imported dates cannot lock the UI.
 if(Number.isFinite(span)&&span>=0&&span<365*200)for(const d=new Date(startDate);d<=endDate;d.setDate(d.getDate()+1)){
  const id=key(d.toLocaleDateString('sv-SE'));if(!groups.has(id))groups.set(id,{label:monthly?new Date(id+'-01T12:00:00').toLocaleDateString('ru-RU',{month:'short',year:'2-digit'}):new Date(id+'T12:00:00').toLocaleDateString('ru-RU',{day:'2-digit',month:'short'}),first:0,second:0,people:new Set()})
 }
 for(const row of records){const value=String(mode==='mortgage'?mortgageData(row).submittedOn:row.created_at||'').slice(0,10);if(value<start||value>end)continue;const group=groups.get(key(value));if(!group)continue
  if(mode==='mortgage'){group.first++;group.people.add(row.client_id);group.second=group.people.size}
  else{const roles=inferContactRoles(row);if(roles.includes(mode==='sale'?'seller':'landlord'))group.first++;if(roles.includes(mode==='sale'?'buyer':'tenant'))group.second++}
 }
 const slices=mode==='mortgage'?Object.entries(mortgageStates).map(([state,name])=>({name,value:source.mortgages.filter(r=>mortgageData(r).state===state&&mortgageData(r).submittedOn>=start&&mortgageData(r).submittedOn<=end).length})):Array.from(new Set(source.properties.filter(p=>inPortfolio(p)&&p.listing_type===mode).map(p=>String(p.property_type||'Не указан')))).map(name=>({name,value:source.properties.filter(p=>inPortfolio(p)&&p.listing_type===mode&&String(p.property_type||'Не указан')===name).length}))
 return {points:[...groups.values()].map(({label,first,second})=>({label,first,second})),slices:slices.filter(s=>s.value>0),grouping:monthly?'По месяцам':weekly?'По неделям':'По дням'}
}
