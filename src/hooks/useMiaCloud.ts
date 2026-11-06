import {importLocalMia} from '../lib/miaCloudMigration'
import {useCallback,useEffect,useRef,useState} from 'react'
import {miaCloud,type CloudMessage,type MiaCloudState} from '../lib/miaCloud'
const empty:MiaCloudState={version:0,messages:[],hasOlder:false,sequence:0,preferences:'',memoryEnabled:true,memoryRevision:0,pending:null,lease:null}
export function useMiaCloud(userId:string|undefined,open:boolean){
 const [state,setState]=useState(empty),[error,setError]=useState(''),[ready,setReady]=useState(false)
 const account=useRef(userId),latest=useRef(state);account.current=userId;latest.current=state
 const refresh=useCallback(async()=>{
  if(!userId)return
  try{let next=await miaCloud({op:'read'},userId);if(await importLocalMia(userId,next))next=await miaCloud({op:'read'},userId);if(account.current!==userId)return;setState(old=>next.version<old.version?old:({...next,messages:[...old.messages.filter(m=>!next.messages.some(n=>n.id===m.id)),...next.messages].sort((a,b)=>a.sequence-b.sequence),hasOlder:old.messages.length>100?old.hasOlder:next.hasOlder}));setReady(true);setError('')}catch(e){if(account.current===userId)setError(e instanceof Error?e.message:'Чат не синхронизирован.')}
 },[userId])
 useEffect(()=>{setState(empty);setReady(false);setError('');void refresh()},[refresh])
 useEffect(()=>{if(!open)return;void refresh();const timer=setInterval(()=>void refresh(),4000);const focus=()=>void refresh();window.addEventListener('focus',focus);return()=>{clearInterval(timer);window.removeEventListener('focus',focus)}},[open,refresh])
 const append=async(role:'user'|'assistant',text:string,id=crypto.randomUUID())=>{const owner=userId;const row=await miaCloud<CloudMessage>({op:'append',id,role,text},userId);if(account.current===owner)setState(old=>({...old,messages:[...old.messages.filter(m=>m.id!==row.id),row].sort((a,b)=>a.sequence-b.sequence)}));return row}
 const memory=async(preferences:string,memoryEnabled:boolean)=>{const owner=userId;await miaCloud({op:'memory',preferences,memoryEnabled,revision:latest.current.memoryRevision},userId);if(account.current===owner)await refresh()}
 const older=async()=>{const owner=userId;const next=await miaCloud({op:'read',before:latest.current.messages[0]?.sequence},userId);if(owner===account.current)setState(old=>({...old,hasOlder:next.hasOlder,messages:[...next.messages.filter(m=>!old.messages.some(n=>n.id===m.id)),...old.messages]}))}
 return {state,error,ready,refresh,append,memory,older}
}
