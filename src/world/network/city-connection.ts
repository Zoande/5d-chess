import {applyFrame,CITY_PROTOCOL,type ClientMessage,type Message,type Input} from '../../../shared/world/protocol.ts'
import type {WorldView} from '../model.ts'
import type {Position} from '../../roulette-hall-model.ts'

type Sample={seq:number;input:Input;at:number}
type Command=Extract<ClientMessage,{type:'command'}>
export class CityConnection {
  private client=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('')
  private lastFrame=0
  readonly timings={rtt:0,tick:0,projection:0}
  private socket?:WebSocket
  private epoch=''
  private id=0
  private seq=0
  private frameSeq=0
  private delay=250
  private timer?:number
  private retry?:number
  private stopped=false
  private view?:WorldView
  private ready=false
  private lastSent=''
  private samples:Sample[]=[]
  private rtt=0
  private applied=0
  private pending?:{command:Command;resolve:()=>void;reject:(e:Error)=>void}
  constructor(privateMap:string,input:()=>Input,onView:(view:WorldView,start:number,reset:boolean,sent?:Position)=>void,status:(text:string,fatal?:boolean)=>void){
    this.map=privateMap;this.input=input;this.onView=onView;this.status=status
  }
  private readonly map:string
  private readonly input:()=>Input
  private readonly onView:(view:WorldView,start:number,reset:boolean,sent?:Position)=>void
  private readonly status:(text:string,fatal?:boolean)=>void
  start(){
    this.connect()
    this.timer=window.setInterval(()=>this.move(),80)
    document.addEventListener('visibilitychange',this.visibility)
  }
  private visibility=()=>{
    if(this.ready)this.send({type:'sleep',hidden:document.hidden})
    if(!document.hidden)this.lastSent=''
  }
  private send(m:ClientMessage){this.socket!.send(JSON.stringify(m))}
  private sample(input:Input){
    const s={seq:++this.seq,input,at:Date.now()}
    this.samples.push(s);if(this.samples.length>100)this.samples.shift()
    return s
  }
  move(){
    if(this.socket&&performance.now()-this.lastFrame>15000&&this.socket.readyState<WebSocket.CLOSING){
      this.socket.close();return
    }
    if(!this.ready||document.hidden||this.socket!.bufferedAmount>8192||this.socket?.readyState!==WebSocket.OPEN||this.pending)return
    const input=this.input(),key=JSON.stringify(input)
    if(key===this.lastSent)return
    this.lastSent=key
    const {seq}=this.sample(input);this.send({type:'move',seq,input})
  }
  command(action:string,data:object){
    if(!this.ready||this.socket?.readyState!==WebSocket.OPEN||this.pending)return Promise.reject(Error('City is reconnecting. Try again shortly.'))
    const {seq,input}=this.sample(this.input())
    const command:Command={type:'command',seq,input,epoch:this.epoch,id:++this.id,action,data:{...data}}
    return new Promise<void>((resolve,reject)=>{this.pending={command,resolve,reject};this.send(command)})
  }
  private connect(){
    const url=new URL('/api/world/live',location.href)
    url.protocol=location.protocol==='https:'?'wss:':'ws:'
    url.search=new URLSearchParams({map:this.map,client:this.client,v:String(CITY_PROTOCOL)}).toString()
    const ws=new WebSocket(url);this.socket=ws;this.lastFrame=performance.now()
    ws.onmessage=event=>{
      if(this.socket!==ws||this.stopped)return
      this.lastFrame=performance.now()
      const m=JSON.parse(event.data) as Message
      if(m.type==='hello'){
        if(this.epoch!==m.epoch){this.pending?.reject(Error('City restarted. Review the current state before retrying.'));this.pending=undefined;this.id=0}
        this.epoch=m.epoch
      }else if(m.type==='frame'){
        const initial=!this.ready
        if(!m.frame.full&&m.frame.seq!==this.frameSeq+1){ws.close();return}
        this.frameSeq=m.frame.seq;this.view=applyFrame(this.view,m.frame)
        const ack=this.samples.find(s=>s.seq===m.frame.input)
        if(ack&&ack.seq>this.applied){this.applied=ack.seq;this.rtt=Math.min(2000,Date.now()-ack.at)}
        Object.assign(this.timings,{rtt:this.rtt,tick:m.frame.tickMs,projection:m.frame.projectionMs??0})
        this.ready=true;this.delay=250
        const command=this.pending?.command,action=command?.action
        const reset=!!action&&['teleport','resort-floor','exit-cave'].includes(action)||action==='floor'&&command?.data.symbol==='residences'||action==='use'&&command?.data.target==='exchange-lobby'
        const retry=initial&&this.pending
        this.onView(this.view,Date.now()-this.rtt,initial||reset,ack?.input as Position|undefined)
        if(initial){this.visibility();if(retry)this.send(retry.command)}
      }else if(m.type==='ack'&&m.id===this.pending?.command.id){
        const p=this.pending;this.pending=undefined
        if(m.status===200)p.resolve();else p.reject(Object.assign(Error(m.message),{status:m.status}))
      }
    }
    ws.onclose=e=>{
      if(this.stopped)return
      this.ready=false;this.lastSent=''
      if(e.code===4412||e.code===4401){this.stop();this.status(e.reason,true);return}
      this.status('Reconnecting to the city…')
      this.retry=window.setTimeout(()=>this.connect(),this.delay);this.delay=Math.min(4000,this.delay*2)
    }
  }
  stop(){
    this.stopped=true;this.ready=false;clearInterval(this.timer);clearTimeout(this.retry)
    document.removeEventListener('visibilitychange',this.visibility);this.socket?.close()
    this.pending?.reject(Error('City connection closed'));this.pending=undefined
  }
}
