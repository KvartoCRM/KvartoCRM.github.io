import {useEffect} from 'react'
import {accountKey,readAccountValue,writeAccountValue} from '../lib/accountStorage'

export function useListScroll(userId:string|undefined,scope:string,ready:boolean) {
  useEffect(()=>{
    if(!userId||!ready)return
    const element=document.querySelector<HTMLElement>('[data-workspace-scroll]')
    if(!element)return
    const key=accountKey(userId,`scroll:${scope}`)
    const position=Number(readAccountValue(key)||0)
    let armed=false
    const frame=requestAnimationFrame(()=>{if(Number.isFinite(position))element.scrollTop=Math.max(0,position);armed=true})
    const remember=()=>{if(armed)writeAccountValue(key,String(element.scrollTop))}
    element.addEventListener('scroll',remember,{passive:true})
    return()=>{cancelAnimationFrame(frame);element.removeEventListener('scroll',remember)}
  },[userId,scope,ready])
}
