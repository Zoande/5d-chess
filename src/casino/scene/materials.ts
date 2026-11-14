import * as T from 'three'

function texture(kind:'felt'|'wood'|'cloth') {
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512
 const ctx=canvas.getContext('2d')!,image=ctx.createImageData(512,512)
 let seed=719;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){
  const i=(y*512+x)*4,n=random(),grain=kind==='wood'?Math.sin(x*.09+Math.sin(y*.014)*7+Math.sin(x*.009)*9)*14:kind==='felt'?((x+y)%3===0?5:-2):Math.sin(x*Math.PI)*9
  const v=kind==='wood'?100+grain+n*23:145+grain+n*50
  image.data[i]=image.data[i+1]=image.data[i+2]=v;image.data[i+3]=255
 }
 ctx.putImageData(image,0,0)
 const map=new T.CanvasTexture(canvas);map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(kind==='felt'?7:3,kind==='wood'?2:5);map.anisotropy=4
 return map
}
export function materials(){
 const felt=texture('felt'),wood=texture('wood'),cloth=texture('cloth')
 return {
  felt:new T.MeshStandardMaterial({color:0x123e35,roughness:.96,bumpMap:felt,bumpScale:.007,roughnessMap:felt}),
  wood:new T.MeshStandardMaterial({color:0x29150f,roughness:.48,metalness:.02,map:wood,bumpMap:wood,bumpScale:.004}),
  ebony:new T.MeshStandardMaterial({color:0x090e0f,roughness:.57,metalness:.1}),
  brass:new T.MeshStandardMaterial({color:0xb89450,metalness:.87,roughness:.3}),
  gold:new T.MeshStandardMaterial({color:0xe8b84c,metalness:.92,roughness:.26}),
  darkGold:new T.MeshStandardMaterial({color:0x6d5127,metalness:.85,roughness:.47}),
  ivory:new T.MeshStandardMaterial({color:0xeee2c7,metalness:.02,roughness:.31}),
  ink:new T.MeshStandardMaterial({color:0x121a1b,roughness:.65}),
  sleeve:new T.MeshStandardMaterial({color:0x252e29,roughness:.95,bumpMap:cloth,bumpScale:.002}),
  shirt:new T.MeshStandardMaterial({color:0xa29479,roughness:.92}),
  trousers:new T.MeshStandardMaterial({color:0x161f20,roughness:.98,bumpMap:cloth,bumpScale:.002}),
  leather:new T.MeshStandardMaterial({color:0x0c1112,roughness:.47}),
  skin:new T.MeshStandardMaterial({color:0x99745b,roughness:.75}),
  robe:new T.MeshPhysicalMaterial({color:0x010303,roughness:1,specularIntensity:.04,bumpMap:cloth,bumpScale:.009}),
  glove:new T.MeshPhysicalMaterial({color:0x020404,roughness:1,specularIntensity:.06}),
  void:new T.MeshBasicMaterial({color:0x000202}),
  eyes:new T.MeshStandardMaterial({color:0xfff4d6,emissive:0xe9f2d8,emissiveIntensity:1.7,roughness:.4}),
  wax:new T.MeshStandardMaterial({color:0xa79973,roughness:.9}),
 }
}
export type Materials=ReturnType<typeof materials>
export function label(text:string,size=512,color='#e5c98c',background='transparent') {
 const canvas=document.createElement('canvas');canvas.width=size;canvas.height=Math.round(size*.35)
 const ctx=canvas.getContext('2d')!
 const draw=(value:string)=>{ctx.clearRect(0,0,canvas.width,canvas.height);if(background!=='transparent'){ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height)}ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`500 ${Math.round(size*.20)}px Georgia,serif`;const fontSize=Math.round(size*.20*Math.min(1,size*.9/Math.max(1,ctx.measureText(value).width)));ctx.font=`500 ${fontSize}px Georgia,serif`;ctx.fillStyle=color;ctx.fillText(value,canvas.width/2,canvas.height/2)}
 draw(text);const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4
 return {map,update:(value:string)=>{draw(value);map.needsUpdate=true}}
}
