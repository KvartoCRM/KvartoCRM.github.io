import {useEffect,useRef,useState} from 'react'
import {Capacitor,registerPlugin} from '@capacitor/core'
import {Mic,Square} from 'lucide-react'

type Recognition = {lang:string;continuous:boolean;interimResults:boolean;onresult:((event:{results:ArrayLike<{isFinal:boolean;0:{transcript:string}}>})=>void)|null;onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void;abort:()=>void}
const nativeVoice=registerPlugin<{recognize:()=>Promise<{text:string}>}>('VoiceInput')
export default function VoiceInputButton({onText,disabled=false}:{onText:(text:string)=>void;disabled?:boolean}){
 const [recording,setRecording]=useState(false),[error,setError]=useState('')
 const recognition=useRef<Recognition|null>(null),generation=useRef(0),callback=useRef(onText)
 callback.current=onText
 useEffect(()=>()=>{generation.current++;recognition.current?.abort()},[])
 useEffect(()=>{if(disabled)recognition.current?.stop()},[disabled])
 async function start(){
  if(recording){recognition.current?.stop();return}
  setError('');const current=++generation.current
  if(Capacitor.getPlatform()==='android'){
   setRecording(true)
   try{const result=await nativeVoice.recognize();if(current===generation.current&&result.text.trim())callback.current(result.text.trim())}
   catch{if(current===generation.current)setError('Речь не записана. Проверьте доступность голосового ввода на телефоне.')}
   finally{if(current===generation.current)setRecording(false)}
   return
  }
  const browser=window as unknown as {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition}
  const Constructor=browser.SpeechRecognition||browser.webkitSpeechRecognition
  if(!Constructor){setError('Этот браузер не поддерживает распознавание. Можно использовать микрофон экранной клавиатуры.');return}
  const session=new Constructor();recognition.current=session
  session.lang='ru-RU';session.continuous=false;session.interimResults=false
  session.onresult=event=>{if(current!==generation.current)return;const text=Array.from(event.results).filter(result=>result.isFinal).map(result=>result[0].transcript).join(' ').trim();if(text)callback.current(text)}
  session.onerror=event=>{if(current!==generation.current)return;setError(event.error==='not-allowed'?'Разрешите доступ к микрофону в настройках браузера.':event.error==='no-speech'?'Речь не распознана. Попробуйте ещё раз.':event.error==='aborted'?'':'Не удалось распознать речь. Проверьте соединение и повторите.')}
  session.onend=()=>{if(current===generation.current){setRecording(false);recognition.current=null}}
  try{session.start();setRecording(true)}catch{setError('Не удалось включить микрофон.');setRecording(false)}
 }
 return <div className="min-w-0"><button type="button" disabled={disabled||(recording&&Capacitor.getPlatform()==='android')} onClick={()=>void start()} aria-label={recording?'Остановить запись':'Надиктовать текст'} aria-pressed={recording} title="Речь распознаётся сервисом браузера или телефона. Проверьте текст перед отправкой." className="lumi-control inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm disabled:opacity-50">{recording?<Square size={18}/>:<Mic size={18}/>}<span>{recording?'Стоп':'Голос'}</span></button>{error&&<p role="alert" className="mt-1 max-w-64 text-xs text-amber-400">{error}</p>}</div>
}
