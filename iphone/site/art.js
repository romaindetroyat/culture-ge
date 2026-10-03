/** Direction artistique procédurale originale. Calques fixes pré-rendus pour le mobile. */
import {rng,clamp,WORLD} from './engine.js?v=0.5.1';
const ART_TAU=Math.PI*2;
function artOval(c,x,y,rx,ry,col){c.fillStyle=col;c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,ART_TAU);c.fill();}
function artPath(c,points,fill,stroke=null,width=2){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function artLine(c,points,color,width=2){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
function artBox(c,x,y,w,h,r,fill,stroke=null){c.fillStyle=fill;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();if(stroke){c.lineWidth=2;c.strokeStyle=stroke;c.stroke();}}
function artGlow(c,x,y,r,col){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,col);g.addColorStop(1,col.slice(0,7)+'00');c.fillStyle=g;c.fillRect(x-r,y-r,2*r,2*r);}
function artCloud(c,x,y,scale,col){c.save();c.translate(x,y);c.scale(scale,scale);artOval(c,0,0,80,19,col);artOval(c,-30,-12,29,26,col);artOval(c,8,-20,38,34,col);artOval(c,49,-10,27,22,col);c.restore();}
function artPine(c,x,y,h,color){artLine(c,[[x,y],[x,y-h]],'#405556',Math.max(2,h*.025));for(let k=0;k<4;k++){const a=h*(1-k*.18),w=h*(.32-k*.047);artPath(c,[[x-w,y-k*h*.18],[x,y-a],[x+w,y-k*h*.18],[x,y-k*h*.18-6]],color);}}
function artMountain(c,cx,y,w,h,col,snow=false){artPath(c,[[cx-w,y],[cx-w*.48,y-h*.56],[cx-w*.21,y-h*.43],[cx,y-h],[cx+w*.31,y-h*.7],[cx+w,y]],col);artPath(c,[[cx,y-h],[cx+w*.31,y-h*.7],[cx+w,y],[cx+w*.05,y-h*.2]],'#111e3222');if(snow)artPath(c,[[cx-w*.15,y-h*.6],[cx,y-h],[cx+w*.22,y-h*.78],[cx+w*.11,y-h*.66],[cx,y-h*.77],[cx-w*.06,y-h*.63]],'#e6f4f1aa');}
/** Closed smooth outline through irregular control points (visuals only). */
function softShape(c,pts,fill,stroke=null,lw=1){
 c.beginPath();const n=pts.length;
 c.moveTo((pts[n-1][0]+pts[0][0])/2,(pts[n-1][1]+pts[0][1])/2);
 for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n];c.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2);}
 c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}
}
function organicBlob(c,r,x,y,rx,ry,fill,stroke=null){
 const pts=[];for(let i=0;i<15;i++){const a=i/15*ART_TAU,k=.78+r()*.28;pts.push([x+Math.cos(a)*rx*k,y+Math.sin(a)*ry*k]);}softShape(c,pts,fill,stroke);
}
function twig(c,x,y,ex,ey,w,col,bend=0){c.strokeStyle=col;c.lineWidth=w;c.lineCap='round';c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+bend,y+(ey-y)*.45,ex-bend,ey+(y-ey)*.18,ex,ey);c.stroke();}
function leaf(c,x,y,a,l,col,vein=false){c.save();c.translate(x,y);c.rotate(a);c.beginPath();c.moveTo(0,0);c.bezierCurveTo(l*.38,-l*.44,l*.78,-l*.25,l,0);c.bezierCurveTo(l*.53,l*.37,l*.13,l*.29,0,0);c.fillStyle=col;c.fill();if(vein){twig(c,0,0,l*.87,0,.65,'#d9f0b269',0);}c.restore();}
function flower(c,x,y,s,col,rotation=0){c.save();c.translate(x,y);c.rotate(rotation);for(let i=0;i<5;i++){c.rotate(ART_TAU/5);c.fillStyle=col;c.beginPath();c.moveTo(0,0);c.bezierCurveTo(-s,-s*.7,-s*.75,-s*1.8,0,-s*1.45);c.bezierCurveTo(s*.9,-s*1.8,s,-s*.5,0,0);c.fill();}artOval(c,0,0,s*.28,s*.28,'#f6d38f');c.restore();}
function fern(c,r,x,y,size,palette){
 for(let k=0;k<7;k++){
  const a=-Math.PI+.17+k*.45,ex=x+Math.cos(a)*size,ey=y+Math.sin(a)*size*.94;
  twig(c,x,y,ex,ey,1.1,palette[1],(k-3)*size*.18);
  for(let j=1;j<12;j++){const u=j/12,bx=x+(ex-x)*u+(k-3)*size*.075*Math.sin(u*Math.PI),by=y+(ey-y)*u;
   const len=size*.24*Math.sin(u*Math.PI)+2;
   leaf(c,bx,by,a-1.08,len,palette[(j+k)%palette.length],true);leaf(c,bx,by,a+1.05,len*.94,palette[(j+k+1)%palette.length],true);
  }
 }
}
function canopy(c,r,x,y,w,h,palette,blossoms=false){
 organicBlob(c,r,x,y,w,h,palette[0]);
 // Many small asymmetric leaf/flower groups, not large overlapping circles.
 for(let k=0;k<16;k++){const a=r()*ART_TAU,d=Math.sqrt(r()),cx=x+Math.cos(a)*w*d*.85,cy=y+Math.sin(a)*h*d*.9;
  organicBlob(c,r,cx,cy,12+r()*18,8+r()*13,palette[1+k%2]);
 }
 for(let i=0;i<185;i++){const a=r()*ART_TAU,d=Math.sqrt(r()),xx=x+Math.cos(a)*w*d*.96,yy=y+Math.sin(a)*h*d*.96;
  if(blossoms)flower(c,xx,yy,1.5+r()*2.6,palette[1+i%3],r()*6);
  else leaf(c,xx,yy,r()*ART_TAU,3+r()*9,palette[(yy<y&&i%3)?3:i%palette.length],i%4===0);
 }
}
function grownTree(c,r,height,id,far=false){
 const blossom=id==='sakura',reef=id==='reef',pine=id==='alpine',jungle=['jungle','ruins'].includes(id);
 const bark=far?'#213e532b':blossom?'#6c465e':reef?'#b680a9':'#655748';
 const highlight=far?'#61888130':blossom?'#b48b90':reef?'#e4b3ce':'#a39767';
 const lean=(r()-.5)*height*.35,endX=lean,endY=-height*.92;
 const branches=[];
 twig(c,0,0,endX,endY,far?7:13,bark,height*.06);twig(c,-3,-3,endX-2,endY,far?1.3:2,highlight,height*.06);
 for(let j=0;j<6;j++){
  const u=.3+j*.1,bx=lean*u,by=-height*u,dir=j%2?1:-1,ex=bx+dir*height*(.17+r()*.25),ey=by-height*(.18+r()*.15);
  twig(c,bx,by,ex,ey,(far?3:5.8)*(1-j*.08),bark,dir*12);twig(c,bx-1,by,ex-1,ey,1,highlight,dir*12);
  for(let k=0;k<2;k++){const xx=ex+(r()-.5)*height*.28,yy=ey-height*.12*(k+1);twig(c,ex,ey,xx,yy,far?1.3:2.5,bark,7);branches.push([xx,yy]);}
 }
 const pal=blossom?['#9d617f','#d78ba7','#f1b3c0','#ffe0d9']:reef?['#667394','#8e9fc1','#c5badb','#d6e4e7']:['#235b58','#358469','#55a27d','#92c596'];
 if(far){for(const [x,y]of branches)organicBlob(c,r,x,y,height*.16,height*.09,id==='sakura'?'#b99aaa88':'#365e7399');}
 else if(pine){
  for(let j=0;j<13;j++){const y=-height+j*height/15,w=height*(j+2)/25;twig(c,0,y,-w,y+17,3,bark);twig(c,0,y,w,y+21,3,bark);
   for(let k=0;k<35;k++){const x=(r()-.5)*w*2,yy=y+12+Math.abs(x)*.12;leaf(c,x,yy,-1.4+(r()-.5)*1.9,8+r()*12,pal[k%4]);}
  }
 }else{
  for(const [x,y]of branches)canopy(c,r,x,y,height*(.12+r()*.045),height*.10,pal,blossom);
  canopy(c,r,endX,endY-7,height*.23,height*.125,pal,blossom);
 }
 if(!far){
  for(let i=0;i<8;i++){const x=(r()-.5)*15,y=-r()*height*.7;twig(c,x,y,x+(r()-.5)*5,y+12,1,bark==='none'?'#555':highlight,3);}
  for(const dir of [-1,1])twig(c,0,-9,dir*(19+r()*15),1,3.2,bark,dir*10);
  if(jungle){for(let k=0;k<3;k++){let x=lean+(k-1)*25,y=-height*.85;twig(c,x,y,x-15,y+height*.42,1.1,'#91b278',k%2?14:-12);for(let i=0;i<5;i++)leaf(c,x+Math.sin(i)*7,y+i*12,1.7+i,8,'#76ae79');}}
 }
}
function cloudWash(c,r,x,y,scale,col){
 c.save();c.translate(x,y);c.scale(scale,scale);organicBlob(c,r,0,0,150,20,col);
 for(let k=0;k<8;k++)organicBlob(c,r,(k-3)*24,-9-r()*19,40,20+r()*7,col);c.restore();
}
function naturalRidge(c,r,theme,y,amp,freq,phase,layer){
 const W=1600,pts=[[-40,1000]],contour=[];
 for(let x=-40;x<=1640;x+=9){const yy=y-amp*(.43+.3*Math.sin(x/freq+phase)+.15*Math.sin(x/(freq*.42)+phase*2)+.08*Math.sin(x/23+phase));contour.push([x,yy]);}
 pts.push(...contour,[1640,1000]);
 const colors=theme.id==='sakura'?['#9c99b478','#748cae90','#536d8bb0']:theme.id==='desert'?['#d0a49570','#bd8f8390','#966e72ac']:theme.id==='ice'?['#bdced777','#80afc9aa','#669aafaa']:['#597a9560','#3a687c95','#295768ba'];
 const g=c.createLinearGradient(0,y-amp,0,850);g.addColorStop(0,colors[layer]);g.addColorStop(1,theme.sky[1]+'10');artPath(c,pts,g);
 // Erosion paths avoid the broad flat triangular facets of the previous backdrop.
 for(let k=0;k<40;k++){const n=Math.floor(r()*contour.length),[x,yy]=contour[n];twig(c,x,yy+8,x+(r()-.5)*80,yy+70+r()*180,.5+r()*3,theme.id==='ice'?'#e4faf329':'#e0decc13',r()*40);}
 if(theme.id==='ice'||theme.id==='alpine')for(let k=0;k<contour.length;k+=4){const [x,yy]=contour[k];if(yy<y-amp*.58)twig(c,x,yy+1,x+7,yy+12,3,'#eef4e760',4);}
}
export function paintBackdrop(c,theme,seed){
 const r=rng(seed^0x719bad),id=theme.id;
 const sky=c.createLinearGradient(0,0,0,900);sky.addColorStop(0,theme.sky[0]);sky.addColorStop(.68,theme.sky[1]);sky.addColorStop(1,theme.dirt[1]);c.fillStyle=sky;c.fillRect(0,0,1600,900);
 const night=['jungle','moon','volcano','neon','reef'].includes(id),sx=1100+r()*160,sy=112+r()*60;
 artGlow(c,sx,sy,230,night?'#bba3e32a':'#ffe9b247');artOval(c,sx,sy,night?46:42,night?46:42,night?'#d0d5e2a0':'#fff0c0cb');
 if(night)for(let i=0;i<180;i++){c.globalAlpha=.2+r()*.6;artOval(c,r()*1600,r()*500,.3+r()*1.1,.3+r()*1.1,'#eef3dd');}c.globalAlpha=1;
 if(id==='moon'||id==='reef'){for(let k=0;k<12;k++)organicBlob(c,r,sx+(r()-.5)*55,sy+(r()-.5)*55,2+r()*11,2+r()*7,'#575c8749');c.save();c.translate(sx,sy);c.rotate(-.3);c.strokeStyle='#c2cfea55';c.lineWidth=5;c.beginPath();c.ellipse(0,0,97,14,0,0,ART_TAU);c.stroke();c.restore();}
 for(let k=0;k<6;k++)cloudWash(c,r,r()*1600,140+r()*270,.4+r()*.7,night?'#bbd7e00b':'#fff6e41a');
 if(id==='neon'){
  for(let layer=0;layer<2;layer++)for(let i=0;i<19;i++){
   const x=i*96-50+r()*35,w=38+r()*70,y=270+r()*260+layer*100;artBox(c,x,y,w,900-y,3,layer?'#243451':'#494461');
   const roof=y-5-r()*25;artBox(c,x+w*.4,roof,2,y-roof,1,'#92bcc76e');
   for(let yy=y+18;yy<760;yy+=16)for(let xx=x+9;xx<x+w-7;xx+=12)if(r()>.38)artBox(c,xx,yy,4+r()*3,6,1,i%3?'#8bbfc454':'#e6b69566');
   twig(c,x+4,y+4,x+w-5,y+5,1.4,i%2?'#a6e3d452':'#d08fc765');
  }
 }else{
  for(let layer=0;layer<3;layer++)naturalRidge(c,r,theme,500+layer*115,layer===0?230:150,150+layer*48,r()*6,layer);
 }
 if(id==='volcano'){
  const pts=[[380,640],[495,573],[578,408],[665,333],[702,295],[722,306],[748,297],[792,365],[855,476],[965,590],[1060,680]];
  softShape(c,pts,'#49394fc0');twig(c,712,306,800,536,7,'#ed92776b',-29);twig(c,712,306,800,536,2,'#ffe0a786',-29);
  artGlow(c,723,306,92,'#ff9e5437');for(let i=0;i<7;i++)cloudWash(c,r,726+i*10,282-i*28,.2+i*.045,'#cab4b216');
 }
 if(['sakura','jungle','ruins','alpine','lagoon'].includes(id)){
  for(let layer=0;layer<2;layer++)for(let i=0;i<14;i++){c.save();const x=i*132+r()*75,y=660+layer*80;c.translate(x,y);c.globalAlpha=layer?.52:.32;grownTree(c,r,100+r()*140,id,true);c.restore();}
 }
 // Mist ribbons, reflected light, distant wildlife: depth without busy foreground UI.
 for(let k=0;k<5;k++){const y=500+k*52;cloudWash(c,r,400+r()*1000,y,2,theme.sky[1]+'0b');}
 if(['lagoon','sakura','alpine','desert'].includes(id))for(let i=0;i<7;i++){const x=180+r()*900,y=220+r()*130;twig(c,x-6,y+2,x,y,1,'#243e5555',2);twig(c,x,y,x+7,y+3,1,'#243e5555',-2);}
 if(id==='ice'){c.save();c.globalCompositeOperation='screen';for(let k=0;k<3;k++)for(let x=200;x<1400;x+=8){const y=110+Math.sin(x/210+k)*39+k*26;const g=c.createLinearGradient(0,y,0,y+150);g.addColorStop(0,'#89ecc400');g.addColorStop(.3,k%2?'#c2a4e90a':'#8ae9c411');g.addColorStop(1,'#89ecc400');c.fillStyle=g;c.fillRect(x,y,20,170);}c.restore();}
 const haze=c.createLinearGradient(0,430,0,850);haze.addColorStop(0,theme.sky[1]+'00');haze.addColorStop(1,theme.water+'3b');c.fillStyle=haze;c.fillRect(0,430,1600,470);
 const vignette=c.createRadialGradient(800,400,350,800,400,1050);vignette.addColorStop(0,'#14233c00');vignette.addColorStop(1,'#14233c46');c.fillStyle=vignette;c.fillRect(0,0,1600,900);
}
export function paintTerrain(c,terrain,theme,seed){
 const W=terrain.world.w,H=terrain.world.h,d=terrain.data,img=c.createImageData(W,H),rgba=img.data;
 const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),a=rgb(theme.dirt[0]),b=rgb(theme.dirt[1]),rim=rgb(theme.top),depth=new Int16Array(W);
 const hard=['ruins','neon'].includes(theme.id)||terrain.layout==='fortress';
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const pos=y*W+x;if(!d[pos]){depth[x]=0;continue;}const dep=++depth[x];
  const blend=clamp(dep/290,0,1),n=((Math.imul(x+seed,73856093)^Math.imul(y+7,19349663))>>>0)%19-9;
  const strata=Math.sin((y+12*Math.sin(x/75))/22)*3;
  const side=x>8&&!d[pos-8]?-21:x<W-6&&!d[pos+5]?-9:0;
  const edge=dep<8,ridge=dep<16;const k=pos*4;
  let joint=0;if(hard&&(y%43<2||(x+(Math.floor(y/43)%2)*42)%84<2))joint=-16;
  for(let ch=0;ch<3;ch++){let v=edge?rim[ch]:a[ch]*(1-blend)+b[ch]*blend;v+=n*.32+strata+side+joint+(ridge&&!edge?-15:0);rgba[k+ch]=clamp(v,0,255);}rgba[k+3]=255;
 }
 c.putImageData(img,0,0);c.save();c.globalCompositeOperation='source-atop';const r=rng(seed+0x919);
 for(let i=0;i<Math.round(W*.3625);i++){
  const x=r()*W,y=200+r()*700,s=2+r()*9;artOval(c,x,y,s*1.3,s*.65,i%3?'#101e3026':'#fff6dc13');if(i%3===0)artLine(c,[[x-s,y],[x+s*.5,y-s*.45]],'#fff0cd19',1);
 }
 // Root networks, shell impressions and small erosion marks, clipped to terrain.
 for(let k=0;k<Math.floor(W/55);k++){
  const x=r()*W,y=terrain.surface(x);if(y>800||y<70)continue;
  const id=theme.id;
  if(['jungle','lagoon','ruins','sakura','alpine'].includes(id)){
   for(let j=0;j<2;j++){const sx=x+(r()-.5)*17,ey=y+20+r()*100,ex=sx+(r()-.5)*75;
    twig(c,sx,y+3,ex,ey,1+r()*1.4,'#192d374b',(r()-.5)*40);
    twig(c,sx-1,y+3,ex-1,ey,.5,'#dfd5a94a',(r()-.5)*30);
    for(let n=1;n<4;n++){const u=n/4;twig(c,sx+(ex-sx)*u,y+(ey-y)*u,ex+(r()-.5)*28,y+(ey-y)*u+12,.6,'#c4c39b41',8);}
   }
  }
  for(let n=0;n<8;n++){const xx=x+(r()-.5)*80,yy=y+14+r()*115;organicBlob(c,r,xx,yy,2+r()*7,2+r()*4,n%3?'#172a3726':'#fff0d828');}
  if(k%7===0){const yy=y+85+r()*90;c.strokeStyle='#e8dab330';c.lineWidth=1.4;c.beginPath();for(let a=0;a<12;a+=.14){const xx=x+Math.cos(a)*a,py=yy+Math.sin(a)*a*.7;a?c.lineTo(xx,py):c.moveTo(xx,py);}c.stroke();}
 }
 // Veines minérales ou strates courbes, avec ombre sous la couche supérieure.
 for(let k=0;k<12;k++){
  const pts=[];for(let x=0;x<=W;x+=12)pts.push([x,270+k*52+17*Math.sin(x/160+k)+7*Math.sin(x/46)]);
  artLine(c,pts,theme.id==='neon'?'#a1eee01b':theme.id==='volcano'?'#f58a742d':'#edd8b415',2);
 }
 c.restore();
}
/** Objets peints en sprites locaux, pas de ressources réseau. */
function legacyPaintProp(c,p,theme){
 const r=rng(p.id*977+Math.floor(p.v*10000)),v=p.id%4,id=theme.id;
 c.save();c.lineCap='round';c.lineJoin='round';artOval(c,0,2,31,6,'#1324352b');
 if(['lagoon','desert'].includes(id)&&(v!==0||id==='lagoon'&&v===3)){
  artLine(c,[[0,0],[4,-35],[16,-78],[20,-128]],'#3d4551',16);artLine(c,[[0,-3],[5,-38],[16,-80],[20,-128]],'#b98d65',11);
  for(let k=0;k<8;k++)artLine(c,[[1+k*2,-12-k*14],[10+k*1.4,-8-k*14]],'#725d5366',2);
  for(let k=0;k<7;k++){const a=-Math.PI+k*Math.PI/6,dx=Math.cos(a)*84,dy=-Math.sin(Math.abs(a))*40;
   c.fillStyle=k%2?'#358c70':'#63b77f';c.strokeStyle='#245756';c.lineWidth=1.7;c.beginPath();c.moveTo(20,-127);c.quadraticCurveTo(20+dx*.65,-164+dy,20+dx,-118+dy*.4);c.quadraticCurveTo(20+dx*.5,-127+dy*.5,20,-127);c.fill();c.stroke();artLine(c,[[20,-127],[20+dx*.64,-139+dy*.4]],'#b2d98770',1.4);
  }for(let k=0;k<3;k++)artOval(c,14+k*7,-121+(k%2)*5,6,8,'#806749');
 }else if(id==='lagoon'){
  artBox(c,-28,-29,56,31,5,'#775342','#3d4150');artBox(c,-29,-35,58,16,5,'#c59564','#624852');
  for(const x of [-18,14])artBox(c,x,-34,5,36,1,'#edc483');artBox(c,-4,-21,9,11,2,'#ffdda0');artOval(c,1,-16,1.5,2,'#685746');
 }else if(id==='desert'){
  artBox(c,-9,-100,18,105,8,'#679686','#385764');artLine(c,[[-3,-5],[-3,-91]],'#bed3a358',2);artLine(c,[[-6,-41],[-32,-43],[-34,-68]],'#679686',12);artLine(c,[[8,-53],[28,-56],[28,-80]],'#679686',12);artOval(c,-1,-105,8,5,'#e59b8d');
 }else if(id==='jungle'||id==='reef'){
  if(v===1||v===3){
   const h=id==='reef'?73:85,col=id==='reef'?'#db94ce':v===1?'#b58fe0':'#6bd4b8';
   artPath(c,[[-8,0],[-3,-h+8],[11,-h],[17,0]],'#a8c8b1','#44566b');artLine(c,[[2,-3],[6,-h+9]],'#f2ebca88',3);
   c.fillStyle=col;c.strokeStyle='#4d5972';c.lineWidth=2.2;c.beginPath();c.moveTo(-43,-h+10);c.quadraticCurveTo(-28,-h-38,5,-h-32);c.quadraticCurveTo(34,-h-32,49,-h+10);c.quadraticCurveTo(4,-h+28,-43,-h+10);c.fill();c.stroke();
   artOval(c,4,-h+11,43,7,'#e5dbcb');for(let i=0;i<10;i++){const x=-31+i*7;artLine(c,[[x,-h+11],[8,-h+17]],'#a68c9b88',1);}
   for(let i=0;i<7;i++)artOval(c,-28+r()*58,-h-17+r()*19,3+r()*4,2+r()*3,'#ffefd2aa');
   artGlow(c,7,-h+21,37,id==='reef'?'#89e9ed33':'#a6f9d72a');
  }else if(id==='reef'){
   for(let i=0;i<7;i++){const x=(i-3)*10,h=45+r()*65;artLine(c,[[0,0],[x,-h*.45],[x*1.6,-h]],i%2?'#bc8ec5':'#86d2d0',7);artLine(c,[[x,-h*.45],[x-17,-h*.7]],'#b493ca',5);artOval(c,x*1.6,-h,5,6,'#ead5ed');}
  }else{
   for(let i=0;i<7;i++){const x=(i-3)*14,y=-48-r()*55;artLine(c,[[0,0],[x,y]],'#77ae82',2);for(let k=1;k<6;k++){const u=k/6;artPath(c,[[x*u,y*u],[x*u-16*(1-u),y*u-6],[x*(u+.13),y*(u+.13)],[x*u+16*(1-u),y*u-4]],i%2?'#73ba8d':'#3c967d');}}
  }
 }else if(id==='candy'){
  if(v===0){artBox(c,-29,-59,59,64,9,'#866070','#60465e');for(let a=0;a<3;a++)for(let b=0;b<3;b++)artBox(c,-23+a*18,-53+b*18,15,15,3,'#b08082');artLine(c,[[-24,-47],[25,-47]],'#f4c5a652',3);}
  else if(v===2){artLine(c,[[0,0],[0,-99],[3,-113],[19,-119],[31,-111],[32,-91]],'#f9e5d5',13);for(let i=0;i<6;i++)artLine(c,[[-4,-14-i*15],[4,-20-i*15]],'#e589a9',8);}
  else{artLine(c,[[0,0],[0,-89]],'#cfaeab',10);artLine(c,[[-2,0],[-2,-89]],'#fff5de',4);artOval(c,0,-105,33,33,'#ffcb9f');artOval(c,0,-106,29,29,v===1?'#db84aa':'#82c1b4');c.strokeStyle='#fff1d4';c.lineWidth=6;c.beginPath();for(let a=0;a<16;a+=.08){const rr=a*1.6,x=Math.cos(a)*rr,y=-106+Math.sin(a)*rr;a?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();artOval(c,-12,-122,9,4,'#ffffff44');}
 }else if(id==='ice'){
  for(let i=0;i<3;i++){const x=(i-1)*23,h=65+r()*55;artPath(c,[[x-18,0],[x-16,-h*.65],[x,-h],[x+19,-h*.27],[x+25,0]],i%2?'#acdfea':'#83bddf','#5d8aaa');artPath(c,[[x,-h],[x+4,0],[x+23,0],[x+19,-h*.27]],'#e5f8f269');artLine(c,[[x-13,-h*.65],[x,-h+4]],'#efffff',2);}
  artOval(c,0,-1,42,7,'#e7f7ef');
 }else if(id==='alpine'){
  artPine(c,0,0,145+v*13,'#28685e');for(let k=0;k<4;k++){const y=-k*25,w=43-k*8;artPath(c,[[-w,y-8],[0,y-60],[w,y-8],[0,y-25]],k%2?'#5da078':'#4b896e');artLine(c,[[-w+5,y-9],[0,y-55],[w-9,y-18]],'#c8dab86a',2);}artBox(c,-4,-5,8,11,1,'#79694f');
 }else if(id==='sakura'){
  if(v===0){artBox(c,-42,-115,9,120,1,'#855468','#47475b');artBox(c,33,-115,9,120,1,'#855468','#47475b');artBox(c,-61,-120,121,11,4,'#d89188','#65465f');artBox(c,-46,-96,92,8,2,'#be7d80');artPath(c,[[-67,-126],[-45,-120],[46,-120],[68,-127],[63,-113],[-62,-113]],'#654d6a');}
  else{artLine(c,[[0,0],[3,-55],[-12,-112]],'#6c566a',14);artLine(c,[[1,-60],[33,-100],[40,-119]],'#6c566a',8);artLine(c,[[-8,-86],[-45,-115]],'#6c566a',7);for(let i=0;i<24;i++){const a=r()*ART_TAU,rr=r()*52;artOval(c,Math.cos(a)*rr,-116+Math.sin(a)*rr*.56,15+r()*12,10+r()*10,i%3===0?'#e8a6bc':i%3===1?'#ffc5cb':'#bf88b1');}for(let i=0;i<18;i++)artOval(c,(r()-.5)*106,-132+r()*40,2,2,'#ffece0');}
 }else if(id==='ruins'){
  const height=82+v*16;artBox(c,-18,-height,36,height+5,2,'#9ca895','#4c6664');
  artBox(c,-25,-height-10,50,14,3,'#c3c6a7','#587267');artBox(c,-24,-4,48,9,1,'#bbc1a4');
  for(let i=0;i<4;i++)artLine(c,[[-11+i*8,-height+3],[-11+i*8,-9]],'#617d795e',2);
  artLine(c,[[15,-height-10],[-18,-height*.68],[8,-height*.32],[-21,0]],'#529776',4);
  for(let i=0;i<6;i++)artOval(c,Math.sin(i*2)*16,-i*16,7,4,'#8ebb81');
 }else if(id==='neon'){
  if(v===1){artLine(c,[[0,0],[0,-155]],'#5e7191',6);artLine(c,[[-33,-121],[31,-121]],'#7db8bc',3);artBox(c,-33,-131,66,27,5,'#455274','#80e8e5');for(let i=0;i<4;i++)artBox(c,-25+i*14,-123,8,10,2,'#96f5df');artGlow(c,0,-117,62,'#67f1d329');}
  else{artBox(c,-33,-79,66,82,5,'#414d6a','#7b84aa');artBox(c,-25,-68,51,35,3,'#182d4a');for(let i=0;i<5;i++)artLine(c,[[-19,-61+i*6],[13+(i%2)*6,-61+i*6]],i%2?'#84e2d1':'#cc9ae1',2);artBox(c,-22,-22,14,9,2,'#eecc85');artBox(c,10,-22,14,9,2,'#b788de');artLine(c,[[-25,0],[-25,-79],[25,-79]],'#95e1dc',2);}
 }else if(id==='moon'){
  if(v===0){artLine(c,[[-25,0],[0,-52],[26,0]],'#9298b3',5);c.save();c.translate(0,-58);c.rotate(-.45);artPath(c,[[-38,-20],[-25,4],[0,20],[25,4],[38,-20]],'#b2b6cd','#5c6687');artLine(c,[[0,16],[0,-21],[23,-50]],'#e9dfe0',3);artOval(c,25,-51,4,4,'#a2f0d4');c.restore();}
  else if(v===2){artBox(c,-47,-48,94,53,7,'#7784a4','#3f4d70');artOval(c,0,-47,46,32,'#98b2c8');artBox(c,-46,-48,92,10,1,'#6a7496');artBox(c,-11,-29,22,34,9,'#303b62');for(const x of [-30,29]){artOval(c,x,-27,8,8,'#384f76');artOval(c,x,-28,5,5,'#a1ecde');}}
  else{artPath(c,[[-32,1],[-38,-20],[-15,-39],[20,-30],[36,2]],'#9095b3','#535d80');artPath(c,[[-15,-39],[-12,-2],[36,2],[20,-30]],'#c2bdd033');artOval(c,-13,-24,9,5,'#59658366');}
 }else if(id==='volcano'){
  for(let i=0;i<3;i++){const x=(i-1)*24,h=55+r()*48;artPath(c,[[x-20,3],[x-13,-h+12],[x+1,-h],[x+19,3]],'#554a63','#303747');artPath(c,[[x+1,-h],[x+3,0],[x+19,3]],'#786071');artLine(c,[[x,-h+17],[x-4,-h*.5],[x+3,-12]],'#ef9e75',2);}artGlow(c,0,-30,57,'#f9926836');
 }
 c.restore();
}
function weatheredRock(c,r,x,y,s,theme){
 const id=theme.id,pal=id==='ice'?['#acd5dc','#e0f0eb','#739eb6']:id==='volcano'?['#574950','#8c655e','#292f42']:id==='moon'?['#8b8b9c','#c5b7b3','#5a5975']:['#818577','#b3b19c','#4c605a'];
 organicBlob(c,r,x,y-s*.34,s,s*.61,pal[0],pal[2]);organicBlob(c,r,x-s*.08,y-s*.45,s*.75,s*.33,pal[1]+'80');
 for(let k=0;k<16;k++){const xx=x+(r()-.5)*s*1.5,yy=y-r()*s*.5;artOval(c,xx,yy,.5+r()*1.6,.6,pal[k%3]);}
 for(let k=0;k<3;k++)twig(c,x+(r()-.5)*s,y-s*.75,x+(r()-.5)*s,y-s*.12,1,pal[2]+'70',s*.12);
 if(id==='volcano')twig(c,x-s*.2,y-s*.75,x+s*.18,y,1.3,'#edb17f8a',s*.2);
}
export function paintProp(c,p,theme){
 const r=rng((p.id*977+Math.floor(p.v*1e6))>>>0),id=theme.id;
 const greenery=['jungle','lagoon','ruins','sakura','alpine'].includes(id),hero=p.kind==='hero';
 c.save();
 if(hero&&['sakura','jungle','alpine'].includes(id))grownTree(c,r,145+r()*44,id);
 else if(hero&&id==='ruins'){legacyPaintProp(c,{...p,id:0},theme);fern(c,r,15,1,34,['#416f56','#6eab76','#a0c27d']);}
 else if(hero&&['lagoon','desert','neon','candy'].includes(id)){
  legacyPaintProp(c,{...p,id:Math.floor(p.v*16)},theme);
 }else if(hero&&id==='reef'){
  for(let j=0;j<4;j++){c.save();c.translate((j-1.5)*18,0);c.scale(.3,.5+r()*.3);grownTree(c,r,130,'reef');c.restore();}
 }else if(hero&&['volcano','ice','moon'].includes(id)){
  if(id==='moon'&&p.v>.6)legacyPaintProp(c,{...p,id:0},theme);
  else{weatheredRock(c,r,-20,0,28+r()*12,theme);weatheredRock(c,r,9,0,40+r()*20,theme);weatheredRock(c,r,43,0,18,theme);}
 }else{
  if(greenery){
   if(p.v>.45)fern(c,r,0,0,34+r()*30,id==='sakura'?['#748f78','#92b487','#bcd5a0']:['#377565','#589b76','#91bd83']);
   else for(let j=0;j<30;j++){const x=(r()-.5)*75,h=8+r()*26;twig(c,x,1,x+(r()-.5)*18,-h,.8+r(),j%2?'#75a681':'#aac894',(r()-.5)*10);if(j%5===0)flower(c,x,-h,2+r()*2,id==='sakura'?'#ffd2d6':j%2?'#e7c79a':'#d2bbdf');}
   if(p.v>.7)weatheredRock(c,r,-17,2,11,theme);
  }else if(id==='reef'){
   for(let j=0;j<14;j++){const x=(r()-.5)*64,h=15+r()*35;twig(c,x,2,x+(r()-.5)*24,-h,2.5,j%2?'#8fccc4':'#b0acd3',15);artOval(c,x,-h,2,2,'#e5d1e4');}
  }else if(id==='candy'){
   for(let j=0;j<6;j++){const x=(r()-.5)*60;organicBlob(c,r,x,-5-r()*12,5+r()*9,8+r()*6,['#e8afb8','#f8d7ac','#9dd6c0'][j%3]);}
  }else if(id==='desert'){
   weatheredRock(c,r,-17,1,12,theme);for(let j=0;j<14;j++)twig(c,12,0,12+(r()-.5)*50,-12-r()*23,.8,'#d6bd83',5);
  }else if(id==='neon'){
   weatheredRock(c,r,1,1,14,theme);twig(c,-30,1,24,-3,1.5,'#7387a4',8);
   for(let j=0;j<3;j++)artBox(c,-20+j*9,-4,5,4,1,j%2?'#d9b994':'#8dd1cf');
  }else weatheredRock(c,r,0,2,12+r()*21,theme);
 }
 if(hero&&greenery){
  fern(c,r,-24,0,20+r()*14,['#4d866a','#86b17d','#b4cb91']);
  if(['jungle','sakura','ruins'].includes(id))for(let j=0;j<3;j++){const x=24+j*8,h=10+r()*18;twig(c,x,0,x+2,-h,1.8,'#d3c8a4',3);organicBlob(c,r,x+2,-h,5+j,3,['#d09cae','#d0b097','#9ecab8'][j]);artOval(c,x+1,-h-1,1,1,'#fff3d6');}
 }
 c.restore();
}
export function paintWorm(c,w,t,active,ctx){
 const {color,aim,canAim,phase,zoom,width,reduced,recoil=0,acting={},hideLabels=false,ghost=false,departure=0}=ctx;
 const mode=departure?'depart':acting.mode||'idle',gesture=acting.gesture||0,crawl=acting.crawl||0,bob=acting.bob||0;
 const fall=mode==='fall',hurt=mode==='hurt',yawn=mode==='yawn',scratch=mode==='scratch',salute=mode==='salute',swagger=mode==='swagger';
 const pulse=(acting.land||0),lean=fall?Math.sin(t*9+w.id)*.12:hurt?-.16*w.dir:swagger?gesture*.09*w.dir:0;
 c.save();c.translate(w.x,w.y);if(!ghost)artOval(c,0,1,20*(1+pulse*.2),4,'#15273c38');
 if(active&&!hideLabels){c.strokeStyle=color+'b9';c.lineWidth=1.5;c.beginPath();c.ellipse(0,0,25,7,0,0,ART_TAU);c.stroke();artPath(c,[[-5,-82+bob],[5,-82+bob],[0,-75+bob]],color);}
 c.translate(0,bob-crawl*.6);c.rotate(clamp(w.vx/1800,-.18,.18)+lean-recoil*w.dir*.16);
 const stretch=fall?1.08:yawn?1+gesture*.08:1-pulse*.16;
 c.scale((1+recoil*.1+pulse*.16),stretch-recoil*.1);
 const skin=c.createLinearGradient(-22,-2,25,-47);skin.addColorStop(0,ghost?'#99cfcdae':'#c77785');skin.addColorStop(.45,ghost?'#ddf4ecda':'#f2b39e');skin.addColorStop(1,ghost?'#ffffffed':'#ffe1b4');
 const tail=-24-crawl*4,tailUp=crawl>0?-crawl*3:0;
 c.fillStyle=skin;c.strokeStyle=ghost?'#defffeb9':'#59435b';c.lineWidth=ghost?1.3:2.1;c.beginPath();c.moveTo(tail,tailUp);c.bezierCurveTo(tail-6,-9,-15,-10,-8,-23);c.bezierCurveTo(-8,-29,-11,-36,-7,-44);c.bezierCurveTo(-2,-57,23,-55,25,-42);c.bezierCurveTo(27,-27,20,-14,12,-7);c.bezierCurveTo(3,2,-10-crawl,6,tail,tailUp);c.fill();c.stroke();
 for(let i=0;i<5;i++){const x=-17+i*4+crawl*(1-i/5),y=-3-i*4;twig(c,x,y,x+16,y-1,1.4,ghost?'#8cbcb64a':'#b46f806d',2);}
 twig(c,tail+4,-4,-3,-24,2.4,ghost?'#ffffff80':'#ffe8c78c',-2);
 c.save();c.translate(5,-38);c.scale(w.dir,1);
 artBox(c,-13,-14,34,7,3,color,'#59465b');
 c.beginPath();c.moveTo(-13,-12);c.quadraticCurveTo(-20,-11,-24,-4+Math.sin(t*4+w.id)*2);c.lineTo(-19,0+Math.sin(t*4+w.id)*2);c.lineTo(-13,-7);c.fillStyle=color;c.fill();c.strokeStyle='#59465b';c.lineWidth=1.1;c.stroke();
 const blink=reduced?false:acting.blink||hurt,yawning=yawn&&gesture>.4;
 const gaze=active&&canAim?Math.cos(aim.angle)*w.dir*2:fall?Math.sin(t*6)*1.7:swagger?gesture*2:1.2;
 for(const [i,x]of [0,11].entries()){
  if(departure>.5){artLine(c,[[x-3,-5],[x+3,1]],'#52435b',1.8);artLine(c,[[x+3,-5],[x-3,1]],'#52435b',1.8);continue;}
  const eyeH=blink?1.1:yawning?3.7:fall?10.1:8.8;
  artOval(c,x,-1,i?6.8:7.1,eyeH,'#fff9e8');if(!blink){artOval(c,x+gaze,-.6+(fall?2:0),2.7,Math.min(eyeH*.68,4.1),'#30384e');artOval(c,x+gaze+1,-2,1,1.3,'#fff');}
 }
 const brow=fall?-3:hurt?2:active&&canAim?1.8:yawning?-1.8:0;
 twig(c,-6,-12,4,-11+brow,1.8,'#614358',0);twig(c,9,-11+brow,18,-12,1.8,'#614358',0);
 artOval(c,-7,8,4,2,'#db839166');artOval(c,17,8,3,1.8,'#db839166');
 if(fall||yawning||departure<.5&&departure>0){artOval(c,9,12,fall?5:3.8,fall?7:5+gesture*2,'#68425b');artOval(c,9,15,3,2,'#ef9da8');}
 else if(hurt||departure>.5){twig(c,4,13,16,13,1.8,'#795066',2);}
 else{c.strokeStyle='#704254';c.lineWidth=1.8;c.beginPath();c.moveTo(2,11);c.quadraticCurveTo(9,17+gesture*2,18,10);c.stroke();artBox(c,6,12,6,2.8,.9,'#fff4dc');}
 if(hurt&&!reduced){artOval(c,-10,4,2.2,1.3,'#c45b7548');}
 c.restore();
 // Arms have their own poses; the tail undulates instead of walking on feet.
 function hand(side,x,y){const shoulderX=side<0?-3:18,shoulderY=-22;
  twig(c,shoulderX,shoulderY,x,y,6,'#61465a',side*6);twig(c,shoulderX,shoulderY,x,y,4.1,ghost?'#daf3ec':'#edb09d',side*6);
  artOval(c,x,y,4.8,4.2,ghost?'#edf8ef':'#ffd3ac');twig(c,x-2,y+3,x+3,y+2,2,color,0);
 }
 if(fall){const a=reduced?1.2:t*14+w.id;hand(-1,-13-Math.cos(a)*10,-22-Math.sin(a)*13);hand(1,25+Math.cos(a)*10,-22+Math.sin(a)*13);}
 else if(scratch){hand(-1,-15,-15);hand(1,25-gesture*5,-17-gesture*35+Math.sin(t*16)*gesture*2);}
 else if(yawn){hand(-1,-12,-17);hand(1,23-gesture*10,-15-gesture*12);}
 else if(salute){hand(-1,-10,-15);hand(1,25-gesture*8,-17-gesture*28);}
 else if(swagger){hand(-1,-10-gesture*7,-18+gesture*5);hand(1,25+gesture*2,-16+gesture*3);}
 else{hand(-1,-6,-13);hand(1,20,-17);}
 if(w.frozen){artBox(c,-26,-61,57,64,7,'#b9eafa60','#e0faff');twig(c,-20,-52,-5,-26,1.5,'#ffffff8f',12);}
 if(active&&phase==='aim'&&!w.frozen&&!hideLabels){
  const a=canAim?aim.angle:w.dir>0?-.7:-2.4,weapon=aim.weapon;c.save();c.translate(9,-24);c.rotate(a);
  if(['grenade','cluster','bouncer','freeze','banana'].includes(weapon)){
   if(weapon==='banana'){c.strokeStyle='#ffe7a0';c.lineWidth=7;c.beginPath();c.arc(14,-4,11,.1,2.7);c.stroke();}
   else{artOval(c,16,-1,8,8,weapon==='freeze'?'#c1ecff':weapon==='bouncer'?'#e0adce':'#8dbd9d');artBox(c,13,-11,6,4,1,'#d2c2a0');}
  }else if(['heal','teleport','bridge','mine','dynamite'].includes(weapon)){
   artBox(c,8,-8,20,16,3,weapon==='heal'?'#e0e8d0':'#cba5b6','#475267');if(weapon==='heal'){artLine(c,[[18,-5],[18,5]],'#d77787',3);artLine(c,[[13,0],[23,0]],'#d77787',3);}
  }else{
   const metal=c.createLinearGradient(0,-8,0,8);metal.addColorStop(0,'#c4d3c5');metal.addColorStop(1,'#47637b');artBox(c,-8,-7,38,14,4,metal,'#354259');artBox(c,26,-9,8,18,3,weapon==='laser'?'#a7ffdf':'#a1b7b8','#3d4c64');artBox(c,4,-10,8,4,2,'#f2c490');
  }
  artOval(c,10,7,6,5,'#f9c3a6');twig(c,4,10,14,10,3,color);c.restore();
 }
 c.restore();if(hideLabels)return;
 c.save();c.translate(w.x,w.y);artBox(c,-22,-69,44,17,6,'#122a3ae8');c.fillStyle=color;c.font='800 12px ui-rounded,system-ui';c.textAlign='center';c.fillText(w.hp,0,-56);
 if(active||zoom>1.45||width>1100){c.font='700 11px ui-rounded,system-ui';c.lineWidth=3;c.strokeStyle='#183147b8';c.strokeText(w.name,0,-88);c.fillStyle='#fff5df';c.fillText(w.name,0,-88);}c.restore();
}
export function paintGrave(c,w,color,t=0){
 c.save();c.translate(w.x,w.y);c.rotate(-.12);twig(c,0,0,0,-21,3,'#897b6d');artBox(c,-16,-30,32,17,3,'#c7c1a4','#6c6672');
 c.fillStyle='#626170';c.font='800 7px system-ui';c.textAlign='center';c.fillText('PAUSE',0,-19);twig(c,-13,-28,11,-28,1,'#eee7c7');
 artBox(c,-11,-9,22,4,2,color);flower(c,13,-3,3.5,'#ede9d2',0);c.restore();
}
export function paintDeparture(c,d,t,reduced=false){
 const age=d.max-d.life,w={...d.worm,x:d.x,y:d.y,grounded:true,input:0,vx:0,vy:0},color=d.color;
 const base={color,aim:{angle:0,weapon:'rocket'},canAim:false,phase:'flight',zoom:1,width:800,reduced,hideLabels:true};
 if(reduced){
  c.save();c.globalAlpha=clamp(d.life/.5,0,1);artBox(c,d.x-42,d.y-53,84,20,5,'#183342ee');c.fillStyle='#fff0d1';c.font='700 9px system-ui';c.textAlign='center';c.fillText(d.worm.name+' · KO',d.x,d.y-40);c.restore();return;
 }
 if(age<.8&&!d.water){
  c.save();c.translate(w.x,w.y);c.rotate(Math.max(0,age-.3)*2*w.dir);c.translate(-w.x,-w.y);paintWorm(c,w,t,false,{...base,departure:age+.01});c.restore();
 }
 if(d.water&&age<.8){for(let k=0;k<5;k++){c.strokeStyle='#d9f6f7';c.lineWidth=1.2;c.beginPath();c.arc(d.x+(k-2)*8,d.y-9-age*55-(k%2)*8,2+k%3,0,ART_TAU);c.stroke();}twig(c,d.x+3,d.y,d.x+6+Math.sin(t*24)*5,d.y-20,4,'#f8cab1',8);}
 if(age>.55){
  const u=age-.55,gx=d.x+Math.sin(u*3+w.id)*6,gy=d.y-20-u*47;
  c.save();c.globalAlpha=Math.min(.9,u*4)*Math.min(1,d.life/.7);
  // Two little wings and a wobbly halo; the bandana survives the career change.
  for(const dir of [-1,1]){c.save();c.translate(gx+dir*8,gy-22);c.rotate(dir*(.3+Math.sin(t*18)*.23));c.scale(dir,1);softShape(c,[[0,0],[10,-18],[27,-22],[21,-9],[29,-14],[24,-1],[12,6]],'#eff9e8dc','#8bafb885',1);c.restore();}
  paintWorm(c,{...w,x:gx,y:gy},t,false,{...base,ghost:true,acting:{mode:'salute',gesture:1,blink:false,bob:0}});
  c.strokeStyle='#ffe2a3';c.lineWidth=2.4;c.beginPath();c.ellipse(gx+6,gy-68,14,4,Math.sin(u*7)*.17,0,ART_TAU);c.stroke();
  c.restore();
  if(age>1&&d.life>.4){
   const quotes=d.water?['Je prends un bain.','Sans les brassards !','Je coule… de source.']:['Je reviens en compost.','C’était mon dernier mot.','Je demande un recomptage.','Même pas… aïe.'];
   const text=quotes[(w.id+d.variant)%quotes.length];c.font='700 11px ui-rounded,system-ui';const width=c.measureText(text).width+18;
   const x=gx-width/2,y=gy-105;c.save();c.globalAlpha=Math.min(1,d.life*2);artBox(c,x,y,width,22,7,'#fff0dce8');c.fillStyle='#514859';c.textAlign='center';c.fillText(text,gx,y+15);c.restore();
  }
 }
 if(age>.65&&age<1.4){const u=(age-.65)/.75;c.save();c.globalAlpha=1-u;for(let i=0;i<7;i++){const a=i*ART_TAU/7;artOval(c,d.x+Math.cos(a)*u*35,d.y-15+Math.sin(a)*u*22,4*(1-u)+1,3*(1-u)+1,'#e8ddcbbc');}c.restore();}
}
