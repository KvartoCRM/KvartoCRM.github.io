import {useEffect,useState} from 'react'
import {useAccountState} from './useAccountState'
import {relativeFilters} from '../lib/relativeFilters'

export function useListState(userId: string | undefined, scope: string) {
  const [values,setValues]=useAccountState<Record<string,string>>(userId,scope,{})
  const [now,setNow]=useState(()=>new Date())
  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60000);return()=>window.clearInterval(timer)},[])
  return [relativeFilters(values,now),setValues] as const
}
