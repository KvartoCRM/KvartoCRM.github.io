// Start npm run dev first. Optional argument: a private JSON backup (never committed).
// PLAYWRIGHT_MODULE may point to a file: URL for a bundled Playwright installation.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const id=(kind,n)=>kind+'0000000-0000-4000-8000-'+String(n).padStart(12,'0');
const user=id('a',1),client=id('b',1),property=id('c',1);
const fixture={format:'kvartocrm-workspace-backup',version:1,exportedAt:'2026-11-02T00:00:00Z',sourceUserId:user,profile:{id:user,first_name:'Fixture'},fileUrls:{},tables:{clients:[{id:client,user_id:user,first_name:'Fixture',last_name:''}],properties:[{id:property,user_id:user,owner_id:client,address:'Fixture address'}],tasks:Array.from({length:30},(_,i)=>({id:id('d',i+1),user_id:user,title:'Task '+i,parent_task_id:i<4?id('d',30):null})),crm_files:Array.from({length:100},(_,i)=>({id:id('e',i+1),user_id:user,property_id:property,bucket:'crm-images',name:'fixture.bin',storage_path:user+'/'+i+'.bin',size_bytes:16}))}};
const original=process.argv[2]?JSON.parse(await fs.readFile(process.argv[2],'utf8')):fixture;
const source=original.sourceUserId,dest='00000000-0000-4000-8000-000000000099';
const db=structuredClone(original.tables);for(const row of db.crm_files)row.size_bytes=16;
db.profiles=[original.profile];db.client_selections=[];db.selection_shares=[];
const savedSource=JSON.stringify(db);
let failTable='',failUpload=false,writes=0;const storage=new Map();const browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage();await page.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url()),method=req.method();
 if(url.pathname==='/__backup_test__')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body>Backup test</body></html>'});
 if(url.pathname==='/auth/v1/health')return route.fulfill({json:{ok:true}});
 if(url.pathname.startsWith('/storage/v1/object/sign/')&&method==='POST'){const paths=req.postDataJSON().paths;return route.fulfill({json:paths.map(path=>({path,signedURL:'/object/sign/mock/'+encodeURIComponent(path)+'?token=fixture'}))});}
 if(url.pathname.startsWith('/storage/v1/object/sign/')&&method==='GET')return route.fulfill({body:Buffer.from('fixture-bytes-16'),contentType:'application/octet-stream'});
 if(url.pathname.startsWith('/storage/v1/object/')&&method==='POST'){
  if(failUpload){failUpload=false;return route.fulfill({status:503,json:{message:'fixture upload failure'}})}
  storage.set(url.pathname,req.postDataBuffer());return route.fulfill({json:{Key:url.pathname}});
 }
 if(url.pathname.startsWith('/rest/v1/')){
  const table=url.pathname.slice('/rest/v1/'.length);let rows=db[table]||[];
  const select=()=>{let result=rows;for(const [k,v]of url.searchParams){if(v.startsWith('eq.'))result=result.filter(r=>String(r[k])===v.slice(3));if(v==='is.null')result=result.filter(r=>r[k]==null)}return result};
  if(method==='POST'){
   writes++;if(table===failTable){failTable='';return route.fulfill({status:503,json:{message:'fixture interrupted import'}})}
   const batch=Array.isArray(req.postDataJSON())?req.postDataJSON():[req.postDataJSON()];const key=table==='property_details'?'property_id':'id';
   for(const row of batch){assert.equal(row.user_id,dest);if(table==='tasks'&&row.parent_task_id&&!rows.some(p=>p.id===row.parent_task_id&&p.user_id===dest))return route.fulfill({status:409,json:{message:'Referenced record does not belong to this office'}});const i=rows.findIndex(x=>x[key]===row[key]);if(i>=0){assert.equal(rows[i].user_id,dest);rows[i]=structuredClone(row)}else rows.push(structuredClone(row))}db[table]=rows;return route.fulfill({status:201,json:batch});
  }
  if(method==='PATCH'){const selected=select();for(const row of selected){assert.equal(row.user_id,dest);Object.assign(row,req.postDataJSON())}return route.fulfill({json:req.headers().accept?.includes('object')?selected[0]||null:selected});}
  let result=select();const order=url.searchParams.get('order')?.split('.')[0];if(order)result=[...result].sort((a,b)=>String(a[order]).localeCompare(String(b[order])));
  const offset=Number(url.searchParams.get('offset')||0);result=result.slice(offset,offset+Math.min(10,Number(url.searchParams.get('limit')||10)));
  return route.fulfill({json:req.headers().accept?.includes('object')?result[0]||null:result});
 }
 if(url.hostname==='127.0.0.1')return route.continue();return route.abort();
});await page.goto('http://127.0.0.1:5173/__backup_test__');
const downloadPromise=page.waitForEvent('download');downloadPromise.catch(()=>{});await page.evaluate(async user=>{const module=await import('/src/lib/workspaceBackup.ts');await module.downloadWorkspaceBackup(user)},source);const download=await downloadPromise;assert.match(download.suggestedFilename(),/\.tar$/);await fs.mkdir('tmp',{recursive:true});await download.saveAs('tmp/qa-full-backup.tar');
const bytes=[...await fs.readFile('tmp/qa-full-backup.tar')];const result=await page.evaluate(async bytes=>{const {readFullArchive}=await import('/src/lib/fullArchive.ts');window.archive=await readFullArchive(new Blob([new Uint8Array(bytes)]));return{files:window.archive.files.size,tasks:window.archive.backup.tables.tasks.length,urls:Object.keys(window.archive.backup.fileUrls).length}},bytes);assert.deepEqual(result,{files:100,tasks:30,urls:0});
const restore=()=>page.evaluate(async user=>{try{const {restoreWorkspaceBackup}=await import('/src/lib/workspaceBackup.ts');return await restoreWorkspaceBackup(window.archive.backup,user,undefined,window.archive.files)}catch(e){return{error:e.message}}},dest);
failTable='tasks';assert.ok((await restore()).error);failUpload=true;const partial=await restore();assert.equal(partial.skippedFiles,1);const done=await restore();assert.equal(done.skippedFiles,0);assert.equal(done.restoredFiles,100);
const counts=Object.fromEntries(Object.entries(db).map(([t,rows])=>[t,rows.filter(r=>r.user_id===dest).length]));await restore();assert.deepEqual(Object.fromEntries(Object.entries(db).map(([t,rows])=>[t,rows.filter(r=>r.user_id===dest).length])),counts);
assert.equal(counts.tasks,30);assert.equal(counts.crm_files,100);assert.equal(db.tasks.filter(r=>r.user_id===dest&&r.parent_task_id).length,4);for(const [t,rows]of Object.entries(JSON.parse(savedSource)))assert.deepEqual(db[t].filter(r=>r.user_id!==dest),rows);
assert.equal(storage.size,100);for(const bytes of storage.values())assert.ok(bytes.toString().includes('\r\n\r\nfixture-bytes-16\r\n'));
console.log(JSON.stringify({status:'BACKUP_BROWSER_PASS',paginatedExport:true,embeddedFiles:100,restoredTasks:30,parentLinks:4,interruptedImportRecovered:true,fileFailureRecovered:true,retryNoDuplicates:true,sourceUnchanged:true,writes}));
}catch(e){console.error(e.message);process.exitCode=1}finally{await browser.close()}
