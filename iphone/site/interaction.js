/** UI-only transfer functions. Never change authoritative weapon damage/physics. */
const uiClamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
export function powerFromPull(distance,span=540){
 const x=uiClamp(distance/Math.max(100,span),0,1);
 return .04+.96*Math.pow(x,1.65);
}
export function pullFromPower(power,span=540){
 return Math.pow(uiClamp((power-.04)/.96,0,1),1/1.65)*Math.max(100,span);
}
/** Clutched radial drag: initial touch keeps charge; lift/regrip at any edge. */
export function dragPower(startPower,startDistance,distance,span=540){
 return powerFromPull(pullFromPower(startPower,span)+distance-startDistance,span);
}
export function cameraRailMetrics(worldWidth,screenWidth,scale){
 const width=Math.max(1,worldWidth),visible=Math.min(width,screenWidth/Math.max(.001,scale));
 return {min:visible/2,max:width-visible/2,fraction:visible/width,span:Math.max(0,width-visible)};
}
/** Seeded, independent clocks. No gameplay RNG is consumed by acting. */
export function wormActing(w,t,{hurt=0,land=0,recoil=0,reduced=false}={}){
 const personality=((w.id*7+(w.team||0)*3)>>>0)%4;
 const cycle=((t+(w.id||0)*2.731)% (8.6+personality*.73));
 const progress=cycle<2.2?cycle/2.2:0;
 const gesture=reduced?0:Math.sin(progress*Math.PI);
 const mode=w.grounded===false?'fall':hurt>.01?'hurt':land>.05?'land':w.input?'walk':progress?['scratch','yawn','salute','swagger'][personality]:'idle';
 return {personality,mode,gesture:reduced?0:gesture,hurt,recoil,land,
  blink:((t*1.0+w.id*1.837)% (3.2+personality*.41))<.12,
  bob:reduced?0:Math.sin(t*(2.1+personality*.19)+w.id)*.65,
  crawl:reduced?0:Math.sin(t*13+w.id)* (w.input?1:0)};
}

/** Keep the world point under the two-finger midpoint fixed while zooming.
 * Coordinates are CSS pixels relative to the canvas, independent of DPR.
 * Only the renderer calls this: no physics or authoritative state is changed.
 */
export function pinchView(start,mid,viewport){
 const zoom=uiClamp(start.zoom*Math.max(1,mid.distance)/Math.max(1,start.distance),.5,2.6);
 const scale=start.scale*zoom/start.zoom;
 const anchorX=start.camera.x+(start.x-viewport.width/2)/start.scale;
 const anchorY=start.camera.y+(start.y-viewport.height/2)/start.scale;
 const half=viewport.width/scale/2,W=viewport.worldWidth;
 return {zoom,scale,camera:{
  x:uiClamp(anchorX-(mid.x-viewport.width/2)/scale,Math.min(half,W/2),Math.max(W-half,W/2)),
  y:uiClamp(anchorY-(mid.y-viewport.height/2)/scale,-4500,850)
 }};
}

/** Controls describe the selected weapon, not a generic gun-shaped interface. */
export function weaponControls(def){
 const type=def?.type||'impact',target=Boolean(def?.target),power=Boolean(def?.speed);
 const action=({heal:'SOIGNER',teleport:'TÉLÉPORTER',bridge:'CONSTRUIRE',mine:'POSER',placed:'POSER',punch:'POUSSER',airstrike:'FRAPPE'})[type]||'FEU !';
 const angle=!target&&type!=='heal'&&type!=='mine';
 const direction=['punch','bridge','placed'].includes(type);
 const timed=['timed','cluster','banana','bouncy'].includes(type);
 const hint=target?(type==='teleport'?'Touche ta destination, puis confirme.':'Touche le point à bombarder, puis confirme.'):
  type==='heal'?'40 PV au maximum · cette action termine le tour.':
  type==='mine'?'Pose à tes pieds · 3 secondes pour t’éloigner.':
  type==='placed'?'Choisis ton côté · pose, puis éloigne-toi.':
  type==='bridge'?'Oriente la passerelle à gauche ou à droite.':
  type==='punch'?'Choisis le côté de la poussée · portée courte.':
  !power?'Direction au doigt · portée fixe, pas de charge.':null;
 return {action,power,angle,target,direction,timed,hint};
}
