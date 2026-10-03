import {cacheSprite} from './render-cache.js?v=0.5.1';
import {WORLD,THEMES,Terrain,rng,clamp,byWeapon,PACES,launchSpeed,muzzle} from './engine.js?v=0.5.1';
import {pullFromPower,wormActing} from './interaction.js?v=0.5.1';
import {paintBackdrop,paintTerrain,paintProp,paintWorm,paintDeparture,paintGrave} from './art.js?v=0.5.1';
const TAU=Math.PI*2;
export const TEAM_COLORS=['#80f2c6','#ff93a5','#ffd181','#b6b0ff'];
function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();}
function line(c,pts,color,width=3){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
function label(c,text,x,y,size=16,color='#fff',weight=800){c.fillStyle=color;c.font=`${weight} ${size}px ui-rounded, system-ui, sans-serif`;c.textAlign='center';c.fillText(text,x,y);}
function round(c,x,y,w,h,r,color){c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
const hex=h=>h.match(/\w\w/g).map(x=>parseInt(x,16));
export class Renderer{
 constructor(canvas){this.canvas=canvas;this.c=canvas.getContext('2d',{alpha:false});if(!this.c)throw new Error('Le navigateur ne peut pas ouvrir le rendu Canvas. Ferme les autres onglets puis réessaie.');this.zoom=1;this.world={...WORLD};this.overview=false;this.manualCamera=null;this.aimingGesture=false;this.aimRadius=115;this.powerDragSpan=540;this.deathRituals=new Map();this.responses=new Map();this.quality='hd';this.trails=new Map();this.recoils=new Map();this.camera={x:800,y:450};this.aim={angle:-.7,power:.5,weapon:'rocket',targetX:900,targetY:400};this.effects=[];this.particles=[];this.texts=[];this.display=new Map();this.key=null;this.lastEvent=0;this.ops=0;this.shake=0;this.reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;this.resize=()=>{this.w=canvas.clientWidth||800;this.h=canvas.clientHeight||450;const d=Math.min(devicePixelRatio||1,this.quality==='hd'?2.75:1.75,Math.sqrt(5000000/(this.w*this.h)));canvas.width=Math.round(this.w*d);canvas.height=Math.round(this.h*d);this.dpr=d;};if(typeof ResizeObserver==='function'){this.observer=new ResizeObserver(this.resize);this.observer.observe(canvas);}else{this.observer=null;window.addEventListener('resize',this.resize);}this.resize();}
 cacheMetrics(){return {props:this.props?.length||0,sourcePixels:this.propSourcePixels||0,cachedPixels:this.propPixels||0,
  rawBytes:((this.land?.width||0)*(this.land?.height||0)+(this.back?.width||0)*(this.back?.height||0)+(this.propPixels||0))*4};}
 hasDeathRituals(){return this.deathRituals.size>0;}
 releaseLayers(){
  for(const tile of [this.land,this.back,...(this.props||[]).map(p=>p.sprite)])if(tile){tile.width=1;tile.height=1;}
  this.land=null;this.back=null;this.lc=null;this.props=[];this.propPixels=0;this.propSourcePixels=0;
 }
 destroy(){this.observer?.disconnect();window.removeEventListener('resize',this.resize);this.releaseLayers();this.trails.clear();this.display.clear();this.deathRituals.clear();this.responses.clear();this.canvas.width=1;this.canvas.height=1;this.state=null;this.key=null;this.terrain=null;}
 setState(s,key='solo'){
  if(!s)return;this.state=s;this.world={...WORLD,...s.world};
  if(this.key!==key||this.seed!==s.seed||this.land?.width!==this.world.w){this.releaseLayers();this.key=key;this.seed=s.seed;this.theme=THEMES.find(t=>t.id===s.options.theme);this.terrain=new Terrain(s.seed,s.options.theme,s.options.layout,s.options.generation,this.world);this.land=document.createElement('canvas');this.land.width=this.world.w;this.land.height=this.world.h;this.lc=this.land.getContext('2d');this.ops=0;this.lastEvent=s.elapsed>5?(s.events.at(-1)?.id||0):0;this.effects=[];this.particles=[];this.texts=[];this.display.clear();this.trails.clear();this.recoils.clear();this.deathRituals.clear();this.responses.clear();this.camera={x:this.world.w/2,y:this.world.h/2};this.manualCamera=null;this.aimingGesture=false;this.makeTerrain();this.makeProps();}
  for(let i=this.ops;i<s.ops.length;i++){const op=s.ops[i];this.terrain.apply(op);const c=this.lc;if(op.type==='circle'){c.save();c.globalCompositeOperation='source-atop';c.strokeStyle=this.theme.dirt[1]+'a0';c.lineWidth=7;c.beginPath();c.arc(op.x,op.y,op.r+1,0,TAU);c.stroke();c.globalCompositeOperation='destination-out';c.fillStyle='#000';c.beginPath();c.arc(op.x,op.y,op.r,0,TAU);c.fill();c.restore();}else{round(c,op.x,op.y,op.w,op.h,3,'#ecc18c');for(let x=op.x+3;x<op.x+op.w;x+=16)line(c,[[x,op.y+1],[x,op.y+op.h-1]],'#865e60',2);}}
  this.ops=s.ops.length;
  for(const e of s.events){if(e.id>this.lastEvent){if(e.at===undefined||s.elapsed-e.at<4){this.effect(e);this.onEvent?.(e);}this.lastEvent=e.id;}}
 }
 makeTerrain(){paintTerrain(this.lc,this.terrain,this.theme,this.seed);}
 makeProps(){
  const r=rng(this.seed+12);this.props=[];this.propPixels=0;this.propSourcePixels=0;
  // One scratch sheet; transparent margins are not retained in every cached prop.
  const tile=document.createElement('canvas');tile.width=320;tile.height=310;
  const pc=tile.getContext('2d',{willReadFrequently:true});
  let i=0;
  for(let x=30;x<this.world.w-25;x+=42+r()*80){
    const y=this.terrain.surface(x);if(y>790||y<80)continue;
    const p={x,y,scale:.75+r()*.47,v:r(),id:i++,kind:r()<.32?'hero':'ground'};
    pc.setTransform(1,0,0,1,0,0);pc.clearRect(0,0,tile.width,tile.height);
    pc.save();pc.translate(160,288);paintProp(pc,p,this.theme);pc.restore();
    const cached=cacheSprite(tile,160,288);if(!cached)continue;
    p.sprite=cached.canvas;p.offsetX=cached.offsetX;p.offsetY=cached.offsetY;
    this.propPixels+=cached.pixels;this.propSourcePixels+=cached.sourcePixels;this.props.push(p);
  }
  tile.width=1;tile.height=1;
  this.back=document.createElement('canvas');this.back.width=1600;this.back.height=900;paintBackdrop(this.back.getContext('2d'),this.theme,this.seed);
  this.stars=Array.from({length:70},()=>({x:r()*this.world.w,y:r()*750,r:1+r()*2,v:r()*6,s:.4+r()}));
 }
 effect(e){
  if(e.type==='damage'&&e.wormId!==undefined){const a=this.responses.get(e.wormId)||{};this.responses.set(e.wormId,{...a,hurt:1});}
  if(e.type==='death'){
   const w=this.state.worms.find(w=>w.id===e.wormId)||this.state.worms.find(w=>w.hp<=0&&w.name===e.name&&Math.abs(w.x-e.x)<1);
   if(w&&!this.deathRituals.has(w.id)){const max=this.reduced?.8:2.6;this.deathRituals.set(w.id,{worm:{...w},x:e.x,y:e.y,water:e.reason==='water'||e.y>=this.state.water,life:max,max,variant:e.id%4,color:TEAM_COLORS[w.team]});}
  }
if(e.type==='bump'){this.texts.push({x:e.x,y:e.y-24,text:'POC !',life:.65,max:.65,color:'#ffedba',size:17});}if(e.type==='turn'){this.manualCamera=null;this.aimingGesture=false;}if(e.type==='fire'||e.type==='jump'){const w=this.state.worms.find(w=>w.id===(e.wormId??this.state.activeId));if(w)this.recoils.set(w.id,.9);}if(e.type==='explosion'){this.effects.push({...e,life:.6,max:.6});this.shake=Math.max(this.shake,Math.min(7,e.r/13));const colors=e.weapon==='freeze'?['#dbffff','#89d2ff']:['#ffd47e','#ff956d',this.theme.dirt[0],'#eaf7e0'];for(let i=0;i<(this.reduced?10:this.quality==='hd'?42:24);i++){let a=Math.random()*TAU,v=90+Math.random()*250;this.particles.push({x:e.x,y:e.y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-100,size:2+Math.random()*6,color:colors[i%colors.length],life:.5+Math.random()*.7});}this.texts.push({x:e.x,y:e.y-e.r-10,text:e.weapon==='freeze'?'GLAGLA !':['POUF !','BOUM !','OUPS.'][e.id%3],color:e.weapon==='freeze'?'#d0f4ff':'#fff0b8',life:1.1,max:1.1,size:24});}
  if(e.type==='damage')this.texts.push({x:e.x,y:e.y,text:`−${e.amount}`,life:1.3,max:1.3,color:'#fff',size:23});
  if(['heal','teleport','freeze','splash','punch','beam'].includes(e.type))this.effects.push({...e,life:e.type==='beam'?.25:1,max:e.type==='beam'?.25:1});
  if(e.type==='heal')this.texts.push({x:e.x,y:e.y-20,text:'BISOU !',life:1.1,max:1.1,color:'#99ffc5',size:19});
 }
 screenToWorld(x,y){const r=this.canvas.getBoundingClientRect();return{x:(x-r.left-this.w/2)/this.scale+this.camera.x,y:(y-r.top-this.h/2)/this.scale+this.camera.y};}
 worldToScreen(x,y){const r=this.canvas.getBoundingClientRect();return{x:r.left+this.w/2+(x-this.camera.x)*this.scale,y:r.top+this.h/2+(y-this.camera.y)*this.scale};}
 draw(now,dt){const c=this.c,s=this.state;if(!s)return;const t=now/1000;dt=Math.min(.05,dt||.016);
  const W=this.world.w,H=this.world.h;
  this.scale=this.overview?Math.min(this.w/W,this.h/H):Math.min(this.w/1600,this.h/820)*this.zoom;
  this.aimRadius=clamp(this.h*.29,80,125);this.powerDragSpan=clamp(this.h*1.4,440,680);
  const active=s.worms.find(w=>w.id===s.activeId);let gx=W/2,gy=H/2;
  if(!this.overview&&active){
    // Keep the selected worm in the uncovered play area, not behind the rail.
    const reserved=this.h>this.w?278:(this.h<500?114:138),focusY=(80+this.h-reserved)/2;
    gx=active.x;gy=active.y+(this.h/2-focusY)/this.scale;
    if(s.projectiles.length){const p=s.projectiles[0];gx=p.x;gy=p.y+35;}
  }
  if(!s.projectiles.length&&s.phase==='over'&&this.deathRituals.size){const last=[...this.deathRituals.values()].at(-1);gx=last.x;gy=last.y-125;}
  if(this.manualCamera&&!this.overview){gx=this.manualCamera.x;gy=this.manualCamera.y;}
  const hw=this.w/this.scale/2,hh=this.h/this.scale/2;
  // Small sky margins let the aiming thumb reach either side of a worm at an edge.
  gx=clamp(gx,Math.min(hw,W/2),Math.max(W-hw,W/2));gy=clamp(gy,-4500,H+hh*.35);
  if(this.overview){gx=W/2;gy=H/2;}
  if(this.aimingGesture){gx=this.camera.x;gy=this.camera.y;}
  const follow=this.overview?1:Math.min(1,dt*(s.projectiles.length?13:6));
  this.camera.x+=(gx-this.camera.x)*follow;this.camera.y+=(gy-this.camera.y)*follow;
  c.setTransform(this.dpr,0,0,this.dpr,0,0);const grad=c.createLinearGradient(0,0,0,this.h);grad.addColorStop(0,this.theme.sky[0]);grad.addColorStop(1,this.theme.sky[1]);c.fillStyle=grad;c.fillRect(0,0,this.w,this.h);
  c.save();c.translate(this.w/2,this.h/2);c.scale(this.scale,this.scale);c.translate(-this.camera.x,-this.camera.y);if(!this.reduced)c.translate((Math.random()-.5)*this.shake,(Math.random()-.5)*this.shake);this.shake*=Math.pow(.002,dt);
  this.background(c,t);for(const p of this.props){if(Math.abs(p.x-this.camera.x)<this.w/this.scale/2+190&&this.terrain.solid(p.x,p.y+4))this.prop(c,p,t);}c.drawImage(this.land,0,0);
  for(const m of s.mines){round(c,m.x-11,m.y-5,22,9,5,'#424c50');ellipse(c,m.x,m.y-7,4,3,m.arm>0?'#ffe29b':Math.sin(t*12)>0?'#ff6767':'#962d46');}
  if(active&&s.phase==='aim'&&this.canAim)this.trajectory(c,active);
  for(const w of s.worms){
   if(w.hp<=0){if(w.y<s.water&&this.terrain.solid(w.x,w.y+5)&&!this.deathRituals.has(w.id))paintGrave(c,w,TEAM_COLORS[w.team],t);continue;}
   let d=this.display.get(w.id);if(!d){d={x:w.x,y:w.y,grounded:w.grounded};this.display.set(w.id,d);}
   const response=this.responses.get(w.id)||{hurt:0,land:0};if(w.grounded&&!d.grounded)response.land=1;
   response.hurt=Math.max(0,(response.hurt||0)-dt*1.8);response.land=Math.max(0,(response.land||0)-dt*3.4);this.responses.set(w.id,response);d.grounded=w.grounded;
   const f=Math.min(1,dt*22);d.x+=(w.x-d.x)*f;d.y+=(w.y-d.y)*f;this.worm(c,{...w,x:d.x,y:d.y},t,w.id===s.activeId,response);
  }
  const ids=new Set(s.projectiles.map(p=>p.id));for(const id of this.trails.keys())if(!ids.has(id))this.trails.delete(id);
  for(const p of s.projectiles){let trail=this.trails.get(p.id);if(!trail){trail=[];this.trails.set(p.id,trail);}const last=trail.at(-1);if(!last||Math.hypot(last.x-p.x,last.y-p.y)>5)trail.push({x:p.x,y:p.y});if(trail.length>22)trail.shift();
   if(!this.reduced)for(let j=0;j<trail.length;j++){c.globalAlpha=j/trail.length*.29;ellipse(c,trail[j].x,trail[j].y,2+(trail.length-j)*.12,2+(trail.length-j)*.12,p.weapon==='freeze'?'#c6ecff':'#fff0cd');}c.globalAlpha=1;this.projectile(c,p,t);
  }
  this.effects=this.effects.filter(e=>e.life>0);for(const e of this.effects){e.life-=dt;const k=e.life/e.max;c.save();c.globalAlpha=Math.max(0,k);
    if(e.type==='explosion'){
     if(!this.reduced){c.fillStyle=e.weapon==='freeze'?'#b4dcf58c':'#ffd193ac';c.beginPath();for(let i=0;i<26;i++){const a=i/26*TAU,rr=e.r*(i%2?1.08:1.6)*(1.45-k);const x=e.x+Math.cos(a)*rr,y=e.y+Math.sin(a)*rr;i?c.lineTo(x,y):c.moveTo(x,y);}c.closePath();c.fill();}
     ellipse(c,e.x,e.y,e.r*(1.4-k),e.r*(1.4-k),e.weapon==='freeze'?'#cff3ff':'#fff1b6');ellipse(c,e.x,e.y,e.r*.65*(1.5-k),e.r*.65*(1.5-k),e.weapon==='freeze'?'#80b6ff':'#ff9b5e');c.strokeStyle='#fff6dd';c.lineWidth=5;c.beginPath();c.arc(e.x,e.y,e.r*(2-k),0,TAU);c.stroke();}
    if(e.type==='beam'){line(c,[[e.x,e.y],[e.x2,e.y2]],e.weapon==='laser'?'#b7ffea':'#ffe1b0',e.weapon==='laser'?8:4);line(c,[[e.x,e.y],[e.x2,e.y2]],'#fff',2);}
    if(e.type==='teleport'||e.type==='heal'||e.type==='freeze'){for(let j=0;j<9;j++){let a=j/9*TAU+t*3;label(c,e.type==='heal'?'♥':'✦',e.x+Math.cos(a)*(45*(1-k)+20),e.y-20+Math.sin(a)*40-40*(1-k),20,e.type==='heal'?'#a4ffc9':'#d4eaff');}}
    if(e.type==='splash'){for(let j=0;j<12;j++){let a=Math.PI+j/12*Math.PI;ellipse(c,e.x+Math.cos(a)*(1-k)*110,e.y+Math.sin(a)*100*(1-k)+90*(1-k)**2,4,9,'#d4fffa');}}
    if(e.type==='punch'){ellipse(c,e.x+(1-k)*50*e.dir,e.y,24,19,'#ff667c');}
c.restore();}
  this.particles=this.particles.filter(p=>p.life>0);for(const p of this.particles){p.life-=dt;p.vy+=370*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;c.save();c.globalAlpha=clamp(p.life*2,0,1);ellipse(c,p.x,p.y,p.size,p.size*.8,p.color);c.restore();}
  this.water(c,s.water,t);for(const [id,d]of this.deathRituals){paintDeparture(c,d,t,this.reduced);d.life-=dt;if(d.life<=0)this.deathRituals.delete(id);}if(this.particles.length>320)this.particles.splice(0,this.particles.length-320);
  this.texts=this.texts.filter(p=>p.life>0);for(const p of this.texts){p.life-=dt;p.y-=dt*24;c.save();c.globalAlpha=clamp(p.life*3,0,1);c.strokeStyle='#182d4280';c.lineWidth=5;c.font=`900 ${p.size}px ui-rounded,system-ui`;c.textAlign='center';c.strokeText(p.text,p.x,p.y);c.fillStyle=p.color;c.fillText(p.text,p.x,p.y);c.restore();}
  c.restore();
  this.drawDepartures(c,t);
  // The accessible DOM panorama replaces the old overlapping minimap.
 }
 drawDepartures(c,t){
  if(!this.deathRituals.size)return;
  const group=[...this.deathRituals.values()],d=group.at(-1),age=d.max-d.life;
  // A small, non-modal cameo keeps the farewell visible even off camera or below the controls.
  const width=Math.min(219,this.w*.56),x=this.w-width-(this.w>600?63:12),y=this.w>600?73:132;
  c.save();const fade=Math.min(1,d.life*3);c.globalAlpha=fade;
  round(c,x,y,width,83,12,'#152c3ce8');c.strokeStyle=d.color+'75';c.lineWidth=1;c.beginPath();c.roundRect(x,y,width,83,12);c.stroke();
  c.save();c.beginPath();c.roundRect(x,y,width,83,12);c.clip();
  const alpha=age>.65,wy=y+74-(this.reduced?0:Math.min(7,Math.max(0,age-.65)*4));
  const act=wormActing({...d.worm,grounded:true},t,{reduced:this.reduced});
  paintWorm(c,{...d.worm,x:x+27,y:wy,grounded:true,input:0,vx:0,vy:0},t,false,{color:d.color,aim:this.aim,canAim:false,phase:'over',width:800,zoom:1,reduced:this.reduced,acting:act,hideLabels:true,ghost:alpha,departure:alpha?0:.25});
  if(alpha){c.strokeStyle='#ffdfa0';c.lineWidth=1.7;c.beginPath();c.ellipse(x+32,wy-60,12,3,this.reduced?0:Math.sin(t*9)*.1,0,TAU);c.stroke();}
  c.restore();c.textAlign='left';c.fillStyle=d.color;c.font='800 8px system-ui';c.fillText(group.length>1?group.length+' DÉPARTS GROUPÉS':'DERNIERS MOTS',x+62,y+18);
  c.font='800 12px ui-rounded,system-ui';c.fillStyle='#fff2d7';c.fillText(d.worm.name.slice(0,18),x+62,y+35);
  const quotes=d.water?['Sans les brassards !','Je prends un bain.','Je coule… de source.']:['Retour au compost.','Même pas… aïe.','Je conteste le score.','Je pose un congé.'];
  c.font='500 10px system-ui';c.fillStyle='#c5dbd4';c.fillText(quotes[(d.worm.id+d.variant)%quotes.length],x+62,y+54);
  c.fillStyle='#d5e6cf45';c.font='500 8px system-ui';c.fillText('La bataille continue.',x+62,y+71);c.restore();
 }
 drawMinimap(c){
  const width=Math.min(140,this.w*.20),height=width*this.world.h/this.world.w;
  const x=14,y=this.h-height-(this.w<650?165:96);
  c.save();round(c,x-5,y-5,width+10,height+10,7,'#10243bcc');
  c.globalAlpha=.75;c.drawImage(this.land,x,y,width,height);c.globalAlpha=1;
  for(const w of this.state.worms)if(w.hp>0)ellipse(c,x+w.x/this.world.w*width,y+w.y/this.world.h*height,2.1,2.1,TEAM_COLORS[w.team]);
  const sx=width/this.world.w,sy=height/this.world.h;
  c.strokeStyle='#fff7d6';c.lineWidth=1;c.strokeRect(x+clamp(this.camera.x-this.w/this.scale/2,0,this.world.w)*sx,
    y+clamp(this.camera.y-this.h/this.scale/2,0,this.world.h)*sy,
    Math.min(width,this.w/this.scale*sx),Math.min(height,this.h/this.scale*sy));c.restore();
 }
 background(c,t){
  const cover=Math.max(this.w/this.scale/1600,this.h/this.scale/900)*1.14;const parallax=clamp((this.camera.x-this.world.w/2)*.06,-80*cover,80*cover);c.drawImage(this.back,this.camera.x-800*cover-parallax,this.camera.y-450*cover,1600*cover,900*cover);if(this.reduced)return;const id=this.theme.id;
  c.save();
  for(const a of this.stars){
    const x=(a.x+t*(id==='neon'?1:5)*a.s)%(this.world.w+40)-20;
    const y=id==='ice'||id==='sakura'?(a.y+t*15*a.s)%780: id==='reef'?(a.y-t*15*a.s%780+780)%780:a.y+Math.sin(t*.5+a.v)*8;
    if(id==='jungle'||id==='volcano'){c.globalAlpha=.25+.4*Math.sin(t+a.v)**2;ellipse(c,x,y,a.r,a.r,id==='jungle'?'#ceffe5':'#ffc389');}
    else if(id==='ice'){c.globalAlpha=.42;ellipse(c,x+Math.sin(y/54)*9,y,a.r*.6,a.r*.6,'#efffff');}
    else if(id==='sakura'){c.globalAlpha=.48;c.save();c.translate(x,y);c.rotate(t*.4+a.v);ellipse(c,0,0,a.r*1.1,a.r*.55,'#ffdce5');c.restore();}
    else if(id==='reef'){c.globalAlpha=.3;c.strokeStyle='#cce9f2';c.lineWidth=1;c.beginPath();c.arc(x,y,a.r*2,0,TAU);c.stroke();}
    else if(id==='neon'){c.globalAlpha=.11;line(c,[[x,y],[x-4,y+15]],'#ccf5f3',1);}
  }
  c.restore();
 }
 prop(c,p,t){
  c.save();c.translate(p.x,p.y+3);c.scale(p.scale,p.scale);
  if(!this.reduced&&['jungle','sakura','reef'].includes(this.theme.id))c.rotate(Math.sin(t*.9+p.v*7)*.009);
  c.drawImage(p.sprite,p.offsetX,p.offsetY);c.restore();
 }
 worm(c,w,t,active,response={}){
  const recoil=this.recoils.get(w.id)||0;if(recoil>.01)this.recoils.set(w.id,recoil*.84);
  const acting=wormActing(w,t,{...response,recoil,reduced:this.reduced});
  paintWorm(c,w,t,active,{acting,color:TEAM_COLORS[w.team],aim:this.aim,canAim:this.canAim,phase:this.state.phase,zoom:this.zoom,width:this.w,reduced:this.reduced,recoil});
 }
 trajectory(c,w){const def=byWeapon[this.aim.weapon];if(!def)return;if(def.target){const x=this.aim.targetX,y=def.type==='teleport'?this.terrain.surface(x,this.aim.targetY):this.aim.targetY;c.strokeStyle='#fff7d7';c.lineWidth=3;c.beginPath();c.arc(x,y-5,20,0,TAU);c.stroke();line(c,[[x-28,y-5],[x+28,y-5]],'#fff7d7',2);line(c,[[x,y-33],[x,y+23]],'#fff7d7',2);return;}
  const a=this.aim.angle;
  if(def.speed){
    const R=this.aimRadius/this.scale,ox=w.x,oy=w.y-22,hx=ox+Math.cos(a)*R*pullFromPower(this.aim.power,100)/100,hy=oy+Math.sin(a)*R*pullFromPower(this.aim.power,100)/100;
    c.save();c.strokeStyle=this.aimingGesture?'#fff6d64f':'#fff6d621';c.lineWidth=1.2/this.scale;c.setLineDash([3/this.scale,5/this.scale]);c.beginPath();c.arc(ox,oy,R,0,TAU);c.stroke();c.setLineDash([]);
    line(c,[[ox,oy],[hx,hy]],this.aim.power>.83?'#ffb587c0':'#a9ffe2b0',2/this.scale);
    ellipse(c,hx,hy,5/this.scale,5/this.scale,this.aim.power>.83?'#ffb587':'#bbffe9');
    if(this.aimingGesture)label(c,Math.round(this.aim.power*100)+' %',hx,hy-14/this.scale,12/this.scale,'#fff9e8');
    c.restore();
  }
  if(def.type==='laser'||def.type==='shotgun'){c.setLineDash([6,9]);line(c,[[w.x,w.y-22],[w.x+Math.cos(a)*140,w.y-22+Math.sin(a)*140]],'#fff7de99',2);c.setLineDash([]);return;}if(!def.speed)return;
  let {x,y}=muzzle(this.terrain,w,a),vx=Math.cos(a)*launchSpeed(def,this.aim.power),vy=Math.sin(a)*launchSpeed(def,this.aim.power);
  let distance=0,mark=0;
  for(let t=0;t<.65;t+=1/120){
    vx+=this.state.wind*.7/120;vy+=370*this.theme.gravity*(def.gravity||1)/120;
    const n=Math.max(1,Math.ceil(Math.hypot(vx,vy)/120));let blocked=false;
    for(let k=0;k<n;k++){x+=vx/120/n;y+=vy/120/n;distance+=Math.hypot(vx,vy)/120/n;if(this.terrain.solid(x,y)){blocked=true;break;}}
    if(blocked)break;if(distance>mark){ellipse(c,x,y,2.2/this.scale,2.2/this.scale,'#fff8e8b0');mark=distance+13/this.scale;}
  }}
 projectile(c,p,t){const def=byWeapon[p.weapon];c.save();c.translate(p.x,p.y);c.rotate(Math.atan2(p.vy,p.vx));if(['rocket','mortar','airstrike','drill'].includes(p.weapon)){ellipse(c,-14,0,7+Math.random()*9,4,'#ffe398');round(c,-12,-6,25,12,5,'#c4ddd0');c.fillStyle='#ff9b85';c.beginPath();c.moveTo(8,-6);c.lineTo(18,0);c.lineTo(8,6);c.fill();line(c,[[-10,-5],[-18,-10],[-15,0],[-18,10],[-10,5]],'#96b7ac',3);}else if(p.weapon==='bee'){ellipse(c,0,0,11,8,'#ffce74');line(c,[[-2,-6],[-2,6]],'#694b51',4);ellipse(c,0,-9,7,4,'#e4fbffe0');ellipse(c,0,9,7,4,'#e4fbffe0');}else if(p.weapon==='banana'){label(c,'☽',0,9,34,'#ffe399');}else{ellipse(c,0,0,10,10,p.weapon==='freeze'?'#b4e5ff':p.weapon==='bouncer'?'#f2a3da':'#7baa96');ellipse(c,-3,-3,3,3,'#f0fbd4');round(c,-3,-14,8,6,2,'#deb778');}c.restore();if(p.fuse)label(c,String(Math.max(1,Math.ceil((p.fuse-p.life)/(PACES[this.state.options.pace]?.speed||1)))),p.x,p.y-22,15,'#fff6d9');}
 water(c,y,t){c.save();const grad=c.createLinearGradient(0,y,0,y+120);grad.addColorStop(0,this.theme.water+'ab');grad.addColorStop(1,this.theme.water);c.fillStyle=grad;c.beginPath();c.moveTo(-500,1300);for(let x=-500;x<=this.world.w+500;x+=12)c.lineTo(x,y+Math.sin(x/70+t*1.5)*3+Math.cos(x/31-t)*2);c.lineTo(this.world.w+500,1300);c.fill();c.globalAlpha=.5;for(let i=0;i<Math.ceil(this.world.w/55);i++){let x=(i*71+t*14)%(this.world.w+150)-70,yy=y+16+(i%5)*14;line(c,[[x,yy],[x+18+(i%3)*10,yy]],'#edfff5',2);}c.restore();}
}
