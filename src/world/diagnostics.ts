// The panel is created only for world.html?debug=1.
export class CityDiagnostics {
  private panel:HTMLOutputElement
  private lastFrame=0
  private frameTimes:number[]=[]
  private updated=0
  private corrections=0
  private net={rtt:0,tick:0,projection:0}
  constructor(host:HTMLElement){
    this.panel=document.createElement('output')
    this.panel.className='world-diagnostics'
    this.panel.setAttribute('aria-live','off')
    this.panel.textContent='Measuring city frames…'
    host.append(this.panel)
    document.addEventListener('visibilitychange',this.visibility)
  }
  private visibility=()=>{this.lastFrame=0}
  network(rtt:number,tick:number,projection:number){this.net={rtt,tick,projection}}
  corrected(){this.corrections++}
  rendered(time:number,draws:number,actors:number){
    if(this.lastFrame)this.frameTimes.push(time-this.lastFrame)
    this.lastFrame=time
    if(time-this.updated<1000||!this.frameTimes.length)return
    const times=this.frameTimes.sort((a,b)=>a-b),p95=times[Math.ceil(times.length*.95)-1]
    this.panel.textContent=[
      'Frame p95 '+p95.toFixed(1)+' ms · '+draws+' draws · '+actors+' actors',
      'Simulation '+this.net.tick.toFixed(1)+' ms · snapshot '+this.net.projection.toFixed(1)+' ms',
      'Input acknowledgment '+this.net.rtt+' ms · '+this.corrections+' position corrections'
    ].join('\n')
    this.frameTimes=[];this.updated=time
  }
  close(){document.removeEventListener('visibilitychange',this.visibility);this.panel.remove()}
}
