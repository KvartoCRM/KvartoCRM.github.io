import test from 'node:test'
import assert from 'node:assert/strict'
import { accountingSnapshot, businessMetrics, emptyBusiness, inPortfolio, readAccounting, unresolvedDeals, validateAccounting } from './businessAccounting.ts'
import { parseWorkspaceBackup } from './workspaceBackupFormat.ts'
import { prepareRestoreIdentity } from './workspaceRestoreIdentity.ts'
const sale={id:'sale',status:'closed',price:5000000,created_at:'2020-01-01',checklist:[accountingSnapshot({direction:'sale',closedOn:'2026-11-01',paidOn:'2026-11-02',agencyReceived:100000,agentReceived:40000})]}
const rent={id:'rent',status:'closed',price:30000,checklist:[accountingSnapshot({direction:'rent',closedOn:'2026-11-02'})]}
const unknown={id:'unknown',status:'closed',price:9999999}
const source={...emptyBusiness,deals:[sale,rent,unknown]}
test('sale/rent are isolated by immutable direction and closing date; legacy is unresolved',()=>{
 const sales=businessMetrics(source,'sale','2026-11-01','2026-11-03')
 const rentals=businessMetrics(source,'rent','2026-11-01','2026-11-03')
 assert.equal(sales.find(m=>m.field==='price')?.value,5000000)
 assert.equal(rentals.find(m=>m.field==='price')?.value,30000)
 assert.deepEqual(unresolvedDeals(source.deals),[unknown])
 assert.equal(businessMetrics(source,'sale','2020-01-01','2020-12-31').find(m=>m.field==='price')?.value,0)
 assert.equal(sales.find(m=>m.field==='agencyIncome')?.value,null)
 assert.equal(sales.find(m=>m.field==='agencyReceived')?.value,100000)
 assert.equal(businessMetrics(source,'sale','2026-11-01','2026-11-01').find(m=>m.field==='agencyReceived')?.value,0)
})
test('cold, sold and archived objects do not inflate the portfolio; dual-role contacts are unique',()=>{
 assert.equal(inPortfolio({work_stream:'cold',status:'available'}),false)
 assert.equal(inPortfolio({work_stream:'active',status:'sold'}),false)
 assert.equal(inPortfolio({work_stream:'active',status:'archived'}),false)
 const result=businessMetrics({...emptyBusiness,clients:[{id:'a',roles:['seller','buyer'],created_at:'2026-11-01'}],properties:[{id:'p',listing_type:'sale',work_stream:'cold',status:'available'}]},'sale','','')
 assert.equal(result[0].value,1);assert.equal(result[1].value,0);assert.equal(result[2].value,1)
})
test('mortgage need is not an application; banks counted separately from borrowers',()=>{
 const data={...emptyBusiness,clients:[{id:'a',mortgage_status:true}],mortgages:[{id:'m1',client_id:'a',metadata:{bank:'A',state:'submitted',submittedOn:'2026-11-01'}},{id:'m2',client_id:'a',metadata:{bank:'B',state:'approved',submittedOn:'2026-11-02'}}]}
 assert.equal(businessMetrics({...data,mortgages:[]},'mortgage','','')[0].value,0)
 const result=businessMetrics(data,'mortgage','','');assert.equal(result[0].value,2);assert.equal(result[1].value,1);assert.equal(result[3].value,1)
})
test('accounting validates dates and distinguishes missing amount from zero',()=>{
 assert.throws(()=>validateAccounting({},'closed'))
 assert.throws(()=>validateAccounting({direction:'sale'},'closed'))
 assert.throws(()=>validateAccounting({direction:'sale',closedOn:'2026-02-30'},'closed'))
 assert.throws(()=>validateAccounting({direction:'sale',paidOn:'2026-11-02',agencyReceived:10},'active'))
 assert.throws(()=>validateAccounting({direction:'sale',agencyReceived:10},'active'))
 assert.doesNotThrow(()=>validateAccounting({direction:'rent',paidOn:'2026-11-02',agencyReceived:0,agentReceived:0},'active'))
})
test('backup and cross-account import preserve accounting and rewrite mortgage references',async()=>{
 const backup=parseWorkspaceBackup({format:'kvartocrm-workspace-backup',version:1,sourceUserId:'old',exportedAt:new Date().toISOString(),tables:{clients:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',user_id:'old'}],deals:[sale],crm_activities:[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',client_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',user_id:'old',external_key:'mortgage-application:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',metadata:{bank:'A',state:'submitted',submittedOn:'2026-11-01'}}]},fileUrls:{}})
 const copied=await prepareRestoreIdentity(backup,'new')
 assert.deepEqual(readAccounting(copied.tables.deals[0]),readAccounting(sale))
 assert.equal(copied.tables.crm_activities[0].client_id,copied.tables.clients[0].id)
 assert.equal(copied.tables.crm_activities[0].external_key,'mortgage-application:'+copied.tables.crm_activities[0].id)
})

import { businessChartData } from './businessCharts.ts'
import { reportedDealFinance } from './dealFinance.ts'
test('charts use actual applications and separate sale/rent portfolios',()=>{
 const data={...emptyBusiness,clients:[{id:'c',roles:['buyer'],mortgage_status:true,created_at:'2026-11-01'}],properties:[{id:'p',listing_type:'sale',work_stream:'active',status:'available',property_type:'Квартира'},{id:'q',listing_type:'sale',work_stream:'cold',status:'available',property_type:'Дом'}]}
 const sale=businessChartData(data,'sale','2026-11-01','2026-11-03')
 assert.equal(sale.points.reduce((s,p)=>s+p.second,0),1)
 assert.deepEqual(sale.slices,[{name:'Квартира',value:1}])
 assert.equal(businessChartData(data,'rent','','').slices.length,0)
 assert.equal(businessChartData(data,'mortgage','2026-11-01','2026-11-03').points.reduce((s,p)=>s+p.first,0),0)
 assert.equal(businessChartData(data,'sale','2026-01-01','2026-12-31').points.length,12)
})
test('new authoritative finance cannot be overwritten by a stale auxiliary activity',()=>{
 const row={checklist:[accountingSnapshot({direction:'sale'}),{id:'kvartocrm:deal-finance',agency_income:300,agent_income:0}]}
 assert.deepEqual(reportedDealFinance(row,{agencyIncome:100,agentIncome:100}),{agencyIncome:300,agentIncome:0})
})
