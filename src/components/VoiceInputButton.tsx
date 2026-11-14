import {useEffect,useRef,useState} from 'react'
import {Capacitor,registerPlugin} from '@capacitor/core'
import {Mic,Square} from 'lucide-react'
import {supabase} from '../lib/supabase'
import {transcribeVoice} from '../lib/voiceTranscription'
const nativeVoice=registerPlugin<{recognize:()=>Promise<{text:string}>}>('VoiceInput')
export default function VoiceInputButton({onText,disabled=false}:{onText:(text:string)=>void;disabled?:boolean}){
 const [phase,setPhase]=useState<'idle'|'starting'|'recording'|'processing'>('idle'),[error,setError]=useState(''),[retry,setRetry]=useState(false)
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),generation=useRef(0),callback=useRef(onText),timer=useRef<ReturnType<typeof setTimeout>>(),request=useRef<AbortController|null>(null),saved=useRef<{blob:Blob;userId:string}|null>(null)
 callback.current=onText
 function release(){clearTimeout(timer.current);stream.current?.getTracks().forEach(track=>track.stop());stream.current=null}
 useEffect(()=>()=>{generation.current++;request.current?.abort();if(recorder.current?.state==='recording')recorder.current.stop();release();saved.current=null},[])
 useEffect(()=>{if(disabled&&recorder.current?.state==='recording')recorder.current.stop()},[disabled])
 async function process(current:number){if(current!==generation.current)return;const audio=saved.current;if(!audio)return;setPhase('processing');setError('');setRetry(false);request.current=new AbortController();try{const text=await transcribeVoice(audio.blob,audio.userId,request.current.signal);if(current===generation.current){callback.current(text);saved.current=null}}catch(e){if(current===generation.current){setError(e instanceof Error?e.message:'Не удалось обработать запись.');setRetry(true)}}finally{if(current===generation.current)setPhase('idle')}}
 function cancel(){generation.current++;request.current?.abort();if(recorder.current?.state==='recording')recorder.current.stop();release();saved.current=null;setPhase('idle');setError('');setRetry(false)}
 async function start(){
  if(phase==='recording'){recorder.current?.stop();return}
  if(phase!=='idle')return
  const current=++generation.current;setError('');setRetry(false);saved.current=null;setPhase('starting')
  if(Capacitor.getPlatform()==='android'){
   try{const result=await nativeVoice.recognize();if(current===generation.current&&result.text.trim())callback.current(result.text.trim())}
   catch{if(current===generation.current)setError('На телефоне недоступен системный голосовой ввод. Проверьте настройки распознавания речи.')}
   finally{if(current===generation.current)setPhase('idle')}
   return
  }
  try{
   if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('Браузер не поддерживает запись микрофона. Используйте голосовой ввод клавиатуры.')
   const {data}=await supabase.auth.getSession();if(!data.session)throw new Error('Войдите в CRM перед записью.')
   const microphone=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}})
   if(current!==generation.current){microphone.getTracks().forEach(track=>track.stop());return}
   stream.current=microphone
   const mimeType=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type))
   const session=new MediaRecorder(microphone,{...(mimeType?{mimeType}:{}),audioBitsPerSecond:32000}),chunks:Blob[]=[];let size=0,failed=false
   recorder.current=session
   session.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);size+=event.data.size;if(size>2000000&&session.state==='recording')session.stop()}}
   session.onerror=()=>{failed=true;if(current===generation.current){release();}if(current===generation.current){setError('Запись микрофона прервалась. Проверьте устройство и попробуйте снова.');setPhase('idle')}}
   session.onstop=()=>{if(current!==generation.current||failed)return;release();const blob=new Blob(chunks,{type:session.mimeType});if(blob.size<32){setError('Микрофон не записал звук. Проверьте выбранное устройство.');setPhase('idle');return}saved.current={blob,userId:data.session!.user.id};void process(current)}
   session.start(1000);setPhase('recording');timer.current=setTimeout(()=>{if(session.state==='recording')session.stop()},120000)
  }catch(e){if(current!==generation.current)return;release();const name=e instanceof Error?e.name:'';setError(name==='NotAllowedError'?'Разрешите сайту доступ к микрофону через значок слева от адреса.':name==='NotFoundError'?'Микрофон не найден. Подключите его и повторите.':name==='NotReadableError'?'Микрофон занят или недоступен. Проверьте его в настройках Windows.':e instanceof Error?e.message:'Не удалось включить микрофон.');setPhase('idle')}
 }
 return <div className="min-w-0 space-y-1"><div className="flex flex-wrap items-center gap-2"><button type="button" disabled={disabled||phase==='starting'||phase==='processing'} onClick={()=>void start()} aria-label={phase==='recording'?'Остановить запись':'Надиктовать текст'} aria-pressed={phase==='recording'} className="lumi-control inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm disabled:opacity-50">{phase==='recording'?<Square size={18}/>:<Mic size={18}/>}<span>{phase==='recording'?'Стоп':phase==='processing'?'Распознаю…':phase==='starting'?'Подключаю…':'Голос'}</span></button>{(phase!=='idle'||retry)&&<button type="button" className="lumi-muted p-2 text-xs" onClick={cancel}>Отменить</button>}{retry&&<button type="button" disabled={disabled} className="lumi-accent-text p-2 text-xs" onClick={()=>void process(generation.current)}>Повторить обработку</button>}</div>{Capacitor.getPlatform()!=='android'&&<p className="lumi-muted max-w-sm text-xs">До 2 минут. После «Стоп» звук передаётся Cloudflare для распознавания. Текст можно исправить.</p>}{error&&<p role="alert" className="max-w-sm text-xs text-amber-400">{error}</p>}</div>
}
