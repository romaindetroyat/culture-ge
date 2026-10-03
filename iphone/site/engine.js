/** Simulation partagée. Aucun DOM et aucune dépendance. Le serveur décide en ligne. */
export const WORLD = { w: 1600, h: 900, water: 825 };
export const VERSION = '0.5.1';
export const THEMES = [
  { id:'lagoon', name:'Les îles du grabuge', short:'Lagon pirate', tagline:'Palmiers, coffres et mauvaises intentions.', sky:['#0c3152','#64ccdd'], dirt:['#d8914f','#633c45'], top:'#e8dc9a', water:'#22b8c5', accent:'#77ffe0', gravity:1, icon:'◈' },
  { id:'candy', name:'Sucre & représailles', short:'Confiserie', tagline:'Un peu de douceur. Beaucoup de cratères.', sky:['#51396d','#f5a3b2'], dirt:['#b26d94','#633554'], top:'#fff0d7', water:'#c564ba', accent:'#ffd289', gravity:0.88, icon:'✿' },
  { id:'moon', name:'Une lune de trop', short:'Station lunaire', tagline:'Petite gravité, très gros problèmes.', sky:['#10142e','#4c477f'], dirt:['#83849e','#343346'], top:'#c4c5d7', water:'#6559bb', accent:'#c1b7ff', gravity:0.57, icon:'☾' },
  { id:'jungle', name:'La jungle a des dents', short:'Jungle fluo', tagline:'Les champignons ont tout vu.', sky:['#071c37','#1d6573'], dirt:['#406653','#173e46'], top:'#67c49e', water:'#169aa1', accent:'#b8ff79', gravity:1, icon:'✦' },
  { id:'ice', name:'Froid devant !', short:'Banquise', tagline:'Un accueil glacial. Des tirs chaleureux.', sky:['#30486a','#a0dfe5'], dirt:['#85b6d4','#46648f'], top:'#f1fbff', water:'#508bc4', accent:'#c2f8ff', gravity:1, icon:'❄' },
  { id:'volcano', name:'Service très chaud', short:'Volcan', tagline:'Le sol est littéralement de lave.', sky:['#2d203e','#a75f66'], dirt:['#6a4854','#2a283c'], top:'#cf876b', water:'#ff713f', accent:'#ffc272', gravity:1.08, icon:'▲' }
];
/** 12 univers × 10 topologies. Le thème ne se réduit pas au relief. */
THEMES.push(
 {id:'desert',name:'Mirages et mauvais tours',short:'Oasis antique',tagline:'Le sable garde rarement les secrets.',sky:['#26385c','#f2bd91'],dirt:['#c88655','#694c53'],top:'#f5d79b',water:'#389cab',accent:'#ffd48c',gravity:1,icon:'◇'},
 {id:'alpine',name:'Avalanche de problèmes',short:'Alpages',tagline:'Le grand air. Et quelques détonations.',sky:['#274c68','#b3dbd5'],dirt:['#7f8870','#3d5153'],top:'#9dcc90',water:'#3e9daa',accent:'#cde7a8',gravity:1,icon:'Λ'},
 {id:'sakura',name:'Fleurs de discorde',short:'Jardin sakura',tagline:'Le calme est une notion très relative.',sky:['#494474','#e6a9ae'],dirt:['#896678','#44435c'],top:'#b7d18f',water:'#847fc2',accent:'#ffc2d5',gravity:.94,icon:'✿'},
 {id:'ruins',name:'Les ruines de la paix',short:'Temple oublié',tagline:'Une civilisation a déjà essayé de s’entendre.',sky:['#193d4d','#83b5a4'],dirt:['#8b9382','#354e4d'],top:'#b4cf9c',water:'#3da999',accent:'#e4d8a6',gravity:1,icon:'Π'},
 {id:'neon',name:'District très électrique',short:'Ville néon',tagline:'Les néons brillent. Les roquettes aussi.',sky:['#111831','#644784'],dirt:['#41445e','#20283c'],top:'#90e9de',water:'#9857c8',accent:'#7effe0',gravity:.92,icon:'ϟ'},
 {id:'reef',name:'Récif des mauvaises idées',short:'Récif cosmique',tagline:'Les coraux n’avaient rien demandé.',sky:['#142c50','#518eb8'],dirt:['#89709c','#394564'],top:'#98e2db',water:'#428abd',accent:'#b9a7ff',gravity:.78,icon:'Ψ'}
);
export const LAYOUTS = [
 {id:'ridge',name:'Collines sauvages',desc:'Relief continu, bosses, abris naturels.'},
 {id:'archipelago',name:'Archipel',desc:'Des îles séparées par des passages d’eau.'},
 {id:'canyon',name:'Grand canyon',desc:'Deux falaises et des corniches au-dessus du vide.'},
 {id:'skylands',name:'Îles célestes',desc:'Un champ de plateformes suspendues, sans sol continu.'},
 {id:'fortress',name:'Forteresse',desc:'Tours, créneaux, coursives et salles creusées.'},
 {id:'caverns',name:'Grottes ouvertes',desc:'Cavités reliées, arches et puits de lumière.'},
 {id:'bridges',name:'Ponts suspendus',desc:'Des piles rocheuses reliées par des ponts fragiles.'},
 {id:'spires',name:'Pitons',desc:'De hautes aiguilles et des plateaux étroits.'},
 {id:'basin',name:'Grand cratère',desc:'Un vaste cirque érodé entouré de sommets.'},
 {id:'terraces',name:'Terrasses',desc:'De grands paliers, des escaliers et des surplombs.'}
];
export const PACES = {
 classic:{name:'Classique',speed:1,settle:.55,ai:1.3},
 lively:{name:'Vif',speed:1.3,settle:.24,ai:.58},
 turbo:{name:'Turbo',speed:1.6,settle:.16,ai:.35}
};
/** A dimension belongs to a game, NEVER to a shared mutable global. */
export function worldFor(options={},teamCount=2){
  if(options.generation===2||options.generation===3)return {...WORLD};
  const total=clamp(Number(options.worms)||3,1,8)*clamp(teamCount,2,4);
  const automatic=Math.round(clamp(1240+60*total,1360,3200)/80)*80;
  const fixed=Number(options.worldWidth);
  const w=options.sizeMode==='code'&&Number.isInteger(fixed)&&fixed>=1360&&fixed<=3200&&fixed%80===0?fixed:automatic;
  return {w,h:900,water:825};
}
export function levelCode(o){
  if(o.generation===2||o.generation===3)return `LX3:${o.theme}:${o.layout||'auto'}:${o.seed>>>0}`;
  return `LX4:${o.theme}:${o.layout||'auto'}:${o.seed>>>0}:${o.worldWidth||worldFor(o).w}`;
}
export function parseLevelCode(text){
 const m=/^LX([34]):([a-z]+):([a-z]+):(\d{1,10})(?::(\d{4}))?$/i.exec(String(text).trim());
 if(!m||!THEMES.some(t=>t.id===m[2].toLowerCase())||!LAYOUTS.some(t=>t.id===m[3].toLowerCase())||+m[4]>4294967295||
   (m[1]==='3'&&m[5])||(m[1]==='4'&&(!m[5]||+m[5]<1360||+m[5]>3200||+m[5]%80)))
   throw new Error('Code terrain invalide. Exemple : LX4:jungle:skylands:12345:1600');
 return {theme:m[2].toLowerCase(),layout:m[3].toLowerCase(),seed:+m[4],generation:+m[1],
   sizeMode:m[1]==='4'?'code':'auto',worldWidth:m[5]?+m[5]:1600};
}
// The same launch curve is used for physics, the preview and the computer player.
// Fine control at low power; a large reserve at the top of the dial.
export function launchSpeed(def,power){return (def.speed||0)*(.04+.96*clamp(Number(power)||0,.04,1)**1.6);}
export function normalizedAngle(angle){return Math.atan2(Math.sin(angle),Math.cos(angle));}
export function radialAim(dx,dy,radius=155){
 const distance=Math.hypot(dx,dy);
 return {angle:Math.atan2(dy,dx),power:clamp(distance/Math.max(40,radius),.04,1)};
}
export function muzzle(terrain,w,angle){
 const dx=Math.cos(angle),dy=Math.sin(angle),start={x:w.x,y:w.y-22};
 // Do not spawn on the other side of a thin ledge when aiming downwards.
 for(let d=1;d<=25;d++){const x=start.x+dx*d,y=start.y+dy*d;if(terrain.solid(x,y))return {x,y};}
 return {x:start.x+dx*25,y:start.y+dy*25};
}
export function resolveLevel(o){
 const r=rng((o.seed>>>0)^0x627119b3);
 const theme=THEMES.some(t=>t.id===o.theme)?o.theme:THEMES[Math.floor(r()*THEMES.length)].id;
 const layout=LAYOUTS.some(t=>t.id===o.layout)?o.layout:LAYOUTS[Math.floor(r()*LAYOUTS.length)].id;
 return {...o,theme,layout};
}
export const WEAPONS = [
  {id:'rocket', name:'Patator', glyph:'↗', category:'Balistique', desc:'Le classique. Explose au premier contact. Le vent compte.', ammo:-1, damage:48, radius:58, speed:1600, type:'impact'},
  {id:'grenade', name:'Grenade cabotine', glyph:'●', category:'Balistique', desc:'Rebondit puis explose à la fin du compte à rebours.', ammo:6, damage:58, radius:65, speed:1200, type:'timed'},
  {id:'cluster', name:'Pop-corn', glyph:'✺', category:'Balistique', desc:'Une grenade qui libère cinq petits cadeaux explosifs.', ammo:3, damage:20, radius:34, speed:1200, type:'cluster'},
  {id:'banana', name:'Banane royale', glyph:'☽', category:'Grand spectacle', desc:'Une énorme explosion, puis trois bananettes. Attention aux amis.', ammo:1, damage:65, radius:86, speed:1120, type:'banana'},
  {id:'mortar', name:'Météorite de poche', glyph:'◆', category:'Grand spectacle', desc:'Lourd, peu subtil, et très doué pour redessiner le paysage.', ammo:2, damage:72, radius:88, speed:1480, type:'impact', gravity:1.4},
  {id:'bouncer', name:'Balle zinzin', glyph:'◎', category:'Balistique', desc:'Rebondit généreusement pendant quatre secondes.', ammo:3, damage:54, radius:67, speed:1500, type:'bouncy'},
  {id:'shotgun', name:'Tromblon', glyph:'⋗', category:'Précision', desc:'Trois plombs, une portée limitée. Très efficace de près.', ammo:4, damage:17, radius:7, type:'shotgun'},
  {id:'laser', name:'Laser taupe', glyph:'ϟ', category:'Précision', desc:'Un rayon de 700 mètres de jeu qui traverse et perce la terre.', ammo:3, damage:42, radius:12, type:'laser'},
  {id:'dynamite', name:'Cadeau piégé', glyph:'▣', category:'Pièges', desc:'Déposé à tes pieds. Trois secondes pour te sauver !', ammo:2, damage:72, radius:90, type:'placed'},
  {id:'airstrike', name:'Pluie de sardines', glyph:'≋', category:'Grand spectacle', desc:'Touche le terrain pour viser. Cinq livraisons express du ciel.', ammo:1, damage:32, radius:40, type:'airstrike', target:true},
  {id:'mine', name:'Réveil explosif', glyph:'✹', category:'Pièges', desc:'Se réveille à proximité d’un ver après un court délai d’armement.', ammo:3, damage:50, radius:60, type:'mine'},
  {id:'drill', name:'Foreuse infernale', glyph:'»', category:'Précision', desc:'Creuse un tunnel dans la terre avant de détoner.', ammo:2, damage:46, radius:52, speed:1540, type:'drill'},
  {id:'punch', name:'Gant diplomatique', glyph:'➜', category:'Utilitaires', desc:'À moins de 85 mètres de jeu : une grande poussée, sans politesse.', ammo:-1, damage:24, radius:0, type:'punch'},
  {id:'heal', name:'Bisou magique', glyph:'♡', category:'Utilitaires', desc:'Rend 40 points de vie au ver actif, sans dépasser son maximum.', ammo:2, damage:0, radius:0, type:'heal'},
  {id:'teleport', name:'Téléporteur', glyph:'⌁', category:'Utilitaires', desc:'Touche un endroit du terrain pour t’y téléporter. Termine le tour.', ammo:2, damage:0, radius:0, type:'teleport', target:true},
  {id:'bridge', name:'Pont express', glyph:'▰', category:'Utilitaires', desc:'Construit une passerelle horizontale de 170 mètres devant toi.', ammo:2, damage:0, radius:0, type:'bridge'},
  {id:'freeze', name:'Congélateur', glyph:'❄', category:'Balistique', desc:'Une explosion de givre. Les victimes passent leur prochain tour actif.', ammo:2, damage:18, radius:67, speed:1540, type:'freeze'},
  {id:'bee', name:'Abeille kamikaze', glyph:'✽', category:'Grand spectacle', desc:'Se dirige progressivement vers le ver ennemi le plus proche.', ammo:2, damage:40, radius:49, speed:800, type:'homing'}
];
export const byWeapon = Object.freeze(Object.assign(Object.create(null),Object.fromEntries(WEAPONS.map(w=>[w.id,w]))));
export function rng(seed) {
  let a=seed>>>0;
  const next=()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
  next.getState=()=>a;next.setState=value=>{a=value>>>0;};return next;
}
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const finite=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
export class Terrain {
  constructor(seed=1,theme='lagoon',layout='auto',generation=3,world=WORLD) {
    const l=resolveLevel({seed,theme,layout});this.seed=seed;this.theme=l.theme;this.layout=l.layout;this.generation=generation;
    this.world=generation===4?{...world}:{...WORLD};this.data=new Uint8Array(this.world.w*this.world.h);this.ops=[];
    if(generation===2)this.buildLegacy();else if(generation===4)this.buildScaled();else this.build();
  }
  buildScaled(){
    // Normalize geography, not the characters: wider maps extend the landforms
    // and their separation. Destruction, props, weapons and bodies keep their size.
    const base=new Terrain(this.seed,this.theme,this.layout,3),w=this.world.w;
    const cols=Array.from({length:w},(_,x)=>Math.min(1599,Math.floor(x*1600/w)));
    for(let y=0;y<this.world.h;y++){const row=y*w,source=y*1600;for(let x=0;x<w;x++)this.data[row+x]=base.data[source+cols[x]];}
  }
  buildLegacy() {
    const r=rng(this.seed), phase=r()*6.28, phase2=r()*6.28;
    for(let x=0;x<this.world.w;x++) {
      let top=510+60*Math.sin(x/168+phase)+36*Math.sin(x/73+phase2)+12*Math.sin(x/29+phase);
      top+=Math.max(0,110-x)*1.8+Math.max(0,x-1490)*1.8;
      if(this.theme==='moon') top-=45*Math.cos(x/250);
      if(this.theme==='volcano') top-=120*Math.exp(-Math.pow((x-800)/220,2));
      const y0=Math.floor(top); for(let y=y0;y<this.world.h;y++)this.data[y*this.world.w+x]=1;
    }
    for(let i=0;i<7;i++){ const x=180+r()*1250,y=640+r()*95,rad=30+r()*32;this.circle(x,y,rad,0,false);}
    // Deux îlots suspendus, avec une silhouette différente selon la graine.
    for(let i=0;i<2;i++){const cx=550+i*450+(r()-.5)*80,cy=330+(r()-.5)*55;for(let x=Math.floor(cx-95);x<cx+95;x++){const u=(x-cx)/95;if(Math.abs(u)<1){let a=cy-10*Math.sqrt(1-u*u),b=cy+55*Math.sqrt(1-u*u);for(let y=Math.floor(a);y<b;y++)this.data[y*this.world.w+x]=1;}}}
  }
  /** Scanline polygones : les formes visuelles sont les formes de collision. */
  polygon(points,value=1) {
    const ys=points.map(p=>p[1]);
    for(let y=Math.max(0,Math.floor(Math.min(...ys)));y<=Math.min(this.world.h-1,Math.ceil(Math.max(...ys)));y++){
      const cuts=[];
      for(let i=0,j=points.length-1;i<points.length;j=i++){
        const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y))cuts.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      }
      cuts.sort((a,b)=>a-b);for(let i=0;i+1<cuts.length;i+=2){const x0=clamp(Math.ceil(cuts[i]),0,this.world.w),x1=clamp(Math.floor(cuts[i+1])+1,0,this.world.w);if(x1>x0)this.data.fill(value,y*this.world.w+x0,y*this.world.w+x1);}
    }
  }
  build() {
    const biome=[...this.theme].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,0);
    const r=rng(this.seed^0x71f51^biome),ph=r()*6.28,ph2=r()*6.28,id=this.layout;
    const soil=(x,base=545,amp=42)=>base+amp*Math.sin(x/(130+r0)+ph)+22*Math.sin(x/62+ph2)+8*Math.sin(x/24+ph);
    const r0=r()*90;
    const fillHeight=fn=>{for(let x=0;x<this.world.w;x++){const h=Math.floor(clamp(fn(x),80,this.world.h));for(let y=h;y<this.world.h;y++)this.data[y*this.world.w+x]=1;}};
    const isle=(cx,cy,rx,depth)=>{const points=[];const phase=r()*6.28;
      for(let i=0;i<=24;i++){const u=-1+i/12;points.push([cx+u*rx,cy+13*u*u+5*Math.sin(u*8+phase)+3*Math.sin(u*19+phase)]);}
      for(let i=24;i>=0;i--){const u=-1+i/12;points.push([cx+u*rx,cy+15+depth*Math.sqrt(Math.max(0,1-u*u))*(.86+.14*Math.cos(u*11+phase))]);}this.polygon(points);
    };
    if(id==='skylands'){
      // Trois étages décalés : chaque graine redistribue largeur et altitude.
      for(let row=0;row<3;row++)for(let col=0;col<4;col++){
        const cx=165+col*385+(r()-.5)*82+(row%2)*30,cy=300+row*176+(r()-.5)*65;
        isle(cx,cy,104+r()*49,55+r()*76);
      }
    }else if(id==='archipelago'){
      const n=4+Math.floor(r()*3),step=1530/n;
      for(let i=0;i<n;i++){const cx=50+step*(i+.5),top=420+r()*205,rx=step*(.31+r()*.10);
        const pts=[[cx-rx,900]];for(let j=0;j<=24;j++){const u=-1+j/12;pts.push([cx+u*rx,top+90*Math.abs(u)**3+8*Math.sin(u*9+ph)]);}pts.push([cx+rx,900]);this.polygon(pts);
      }
      for(let i=0;i<2;i++)isle(480+i*620+(r()-.5)*120,245+r()*80,100+r()*35,60+r()*50);
    }else if(id==='canyon'){
      const center=730+r()*140,gap=270+r()*190;
      fillHeight(x=>Math.abs(x-center)<gap/2?900:soil(x,430,36)+Math.max(0,110-x)*1.1+Math.max(0,x-1490)*1.1);
      for(let i=0;i<4;i++)isle(center+(i%2?1:-1)*(gap/2-48),510+Math.floor(i/2)*145,85+r()*40,60+r()*35);
      isle(center,270+r()*35,105+r()*40,75);
    }else if(id==='fortress'){
      fillHeight(x=>soil(x,690,20));
      const n=5+Math.floor(r()*2),step=1480/n;
      for(let i=0;i<n;i++){
        const cx=60+step*(i+.5),ww=130+r()*45,top=290+r()*210;
        this.rect(cx-ww/2,top,ww,650-top,false);
        for(let x=cx-ww/2;x<cx+ww/2-8;x+=38)this.rect(x,top-23,23,27,false);
        this.polygon([[cx-ww*.28,580],[cx-ww*.28,top+80],[cx,top+53],[cx+ww*.28,top+80],[cx+ww*.28,580]],0);
        if(i<n-1)this.rect(cx+ww/2-10,top+70,step-ww+25,24,false);
      }
    }else if(id==='bridges'){
      const n=5,step=310,tops=[];
      for(let i=0;i<n;i++){const cx=175+i*step,top=410+r()*110;tops.push([cx,top]);this.polygon([[cx-95,900],[cx-72,top+24],[cx-63,top],[cx+67,top+5],[cx+80,top+36],[cx+100,900]]);}
      for(let i=1;i<n;i++){const [x0,y0]=tops[i-1],[x1,y1]=tops[i];const pts=[];for(let j=0;j<=20;j++){const u=j/20;pts.push([x0+u*(x1-x0),y0+(y1-y0)*u+Math.sin(u*Math.PI)*48]);}for(let j=20;j>=0;j--){const u=j/20;pts.push([x0+u*(x1-x0),y0+(y1-y0)*u+Math.sin(u*Math.PI)*48+22]);}this.polygon(pts);}
      isle(790,250,126,75);
    }else if(id==='spires'){
      fillHeight(x=>soil(x,774,24));
      for(let i=0;i<9;i++){const x=100+i*175+(r()-.5)*40,top=280+r()*320,ww=48+r()*20;this.polygon([[x-ww-30,810],[x-ww,top+20],[x-ww+10,top],[x+ww-10,top+3],[x+ww,top+28],[x+ww+40,810]]);}
    }else if(id==='terraces'){
      const center=500+r()*600;
      fillHeight(x=>460+Math.floor(Math.abs(x-center)/175)*42+10*Math.sin(x/61+ph));
      for(let i=0;i<4;i++)isle(180+i*390+(r()-.5)*80,275+r()*95,95+r()*65,70);
    }else if(id==='basin'){
      const cx=640+r()*310,span=470+r()*90;
      fillHeight(x=>soil(x,360,20)+310*Math.max(0,1-((x-cx)/span)**2));
      isle(cx+(r()-.5)*200,365+r()*70,105+r()*45,85);
    }else if(id==='caverns'){
      fillHeight(x=>soil(x,330,32)+Math.max(0,100-x)*1.7+Math.max(0,x-1500)*1.7);
      for(let i=0;i<7;i++){
        const cx=180+i*205,cy=500+(i%2)*108,rx=85+r()*24;
        const pts=[];for(let j=0;j<36;j++){const a=j/36*Math.PI*2;pts.push([cx+Math.cos(a)*rx,cy+Math.sin(a)*(64+r()*9)]);}this.polygon(pts,0);
        if(i%2===0){this.polygon([[cx-22,100],[cx+22,100],[cx+35,cy+15],[cx-29,cy+15]],0);}
      }
    }else{
      fillHeight(x=>soil(x,520,65)+Math.max(0,110-x)*1.65+Math.max(0,x-1490)*1.65);
      for(let i=0;i<2+Math.floor(r()*2);i++)isle(390+i*390+(r()-.5)*90,245+r()*92,95+r()*55,70+r()*38);
    }
    // Poches d’érosion aux contours irréguliers, jamais un simple semis de ronds.
    if(!['skylands','caverns','fortress','bridges'].includes(id))for(let i=0;i<6;i++){
      const cx=140+r()*1320,cy=650+r()*125,rad=22+r()*30,pts=[];
      for(let j=0;j<24;j++){const a=j/24*Math.PI*2;pts.push([cx+Math.cos(a)*rad*(.9+r()*.2),cy+Math.sin(a)*rad*.65]);}this.polygon(pts,0);
    }
    // Même terrain pour toutes les tailles d’équipe : quelques corniches de secours
    // sont intégrées à la génération si le relief offre trop peu de zones dégagées.
    const packed=[];for(const p of this.spawnSites())if(packed.every(q=>Math.hypot(q.x-p.x,q.y-p.y)>=38))packed.push(p);
    if(packed.length<40)for(let i=0;i<8;i++)isle(115+i*195,250+(i%2)*40+(r()-.5)*14,65,38);
  }
  /** Emplacements candidats : dégagement, pente et hauteur sûrs avant placement. */
  spawnSites(water=this.world.water) {
    const sites=[];
    for(let x=34;x<this.world.w-34;x+=4)for(let y=135;y<water-44;y++){
      if(!this.solid(x,y)||!this.solid(x,y+1)||!this.solid(x,y+4)||this.solid(x,y-1)||this.solid(x,y-32))continue;
      if(Math.abs(this.surface(x-9,y-11)-y)>10||Math.abs(this.surface(x+9,y-11)-y)>10)continue;
      if(this.solid(x-10,y-18)||this.solid(x+10,y-18))continue;
      let clear=true;for(let h=2;h<32;h++)if(this.solid(x,y-h)){clear=false;break;}if(!clear)continue;
      sites.push({x,y:y-1});
    }
    return sites;
  }
  solid(x,y) { x=Math.floor(x); y=Math.floor(y); return x>=0&&x<this.world.w&&y>=0&&y<this.world.h&&this.data[y*this.world.w+x]===1; }
  surface(x,start=0) { x=clamp(Math.floor(x),0,this.world.w-1); for(let y=Math.max(0,Math.floor(start));y<this.world.h;y++)if(this.data[y*this.world.w+x])return y;return this.world.h; }
  circle(x,y,r,value=0,record=true) {
    x=Math.round(x);y=Math.round(y);r=Math.max(1,Math.round(r));
    for(let yy=Math.max(0,y-r);yy<=Math.min(this.world.h-1,y+r);yy++){const d=Math.floor(Math.sqrt(Math.max(0,r*r-(yy-y)*(yy-y))));const left=clamp(x-d,0,this.world.w),right=clamp(x+d+1,0,this.world.w);if(right>left)this.data.fill(value,yy*this.world.w+left,yy*this.world.w+right);}
    if(record)this.ops.push({type:'circle',x,y,r,value});
  }
  rect(x,y,w,h,record=true) {x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);for(let yy=Math.max(0,y);yy<Math.min(this.world.h,y+h);yy++)this.data.fill(1,yy*this.world.w+clamp(x,0,this.world.w),yy*this.world.w+clamp(x+w,0,this.world.w));if(record)this.ops.push({type:'rect',x,y,w,h});}
  apply(op) {if(op.type==='rect')this.rect(op.x,op.y,op.w,op.h);else this.circle(op.x,op.y,op.r,op.value);}
}
export function cleanOptions(o={}) {
  if(!o||typeof o!=='object'||Array.isArray(o))o={};
  return { theme:o.theme==='random'||THEMES.some(t=>t.id===o.theme)?o.theme:'lagoon',
    layout:LAYOUTS.some(t=>t.id===o.layout)?o.layout:'auto',generation:[2,3].includes(o.generation)?o.generation:4,
    sizeMode:o.sizeMode==='code'?'code':'auto',worldWidth:Number.isInteger(+o.worldWidth)&&+o.worldWidth>=1360&&+o.worldWidth<=3200&&+o.worldWidth%80===0?+o.worldWidth:undefined,
    pace:Object.hasOwn(PACES,o.pace)?o.pace:'lively',
    worms:Number.isInteger(+o.worms)&&+o.worms>=1&&+o.worms<=8?+o.worms:3,
    hp:[75,100,150,200].includes(+o.hp)?+o.hp:100,
    turnSeconds:[20,25,30,40,45,60].includes(+o.turnSeconds)?+o.turnSeconds:30,
    difficulty:['easy','normal','hard'].includes(o.difficulty)?o.difficulty:'normal',
    seed:finite(o.seed,Math.floor(Math.random()*2**32))>>>0,suddenDeath:o.suddenDeath!==false };
}
export class Game {
  constructor(options={},names=['Les Pistaches','Les Framboises']) {
    this.options=resolveLevel(cleanOptions(options));this.world=worldFor(this.options,Math.max(2,Math.min(4,names.length)));this.options.worldWidth=this.world.w;this.seed=this.options.seed;this.random=rng(this.seed+731);this.theme=THEMES.find(t=>t.id===this.options.theme);this.terrain=new Terrain(this.seed,this.theme.id,this.options.layout,this.options.generation,this.world);
    this.worms=[];this.projectiles=[];this.mines=[];this.events=[];this.eventId=0;this.entityId=0;this.turn=0;this.team=0;this.teamCursor=Array(Math.max(2,Math.min(4,names.length))).fill(-1);this.phase='aim';this.time=this.options.turnSeconds;this.wind=0;this.water=this.world.water;this.winner=null;this.settle=0;this.elapsed=0;this.retreat=0;
    this.teams=(names.length>=2?names:['Les Pistaches','Les Framboises']).slice(0,4).map((name,id)=>({id,name:String(name).slice(0,24),ammo:Object.fromEntries(WEAPONS.map(w=>[w.id,w.ammo]))}));
    const labels=[['Pistache','Biscotte','Marcel','Moustache','Moka','Brioche','Noisette','Kiki'],['Fripouille','Pépita','Gaston','Praline','Truffe','Gaufrette','Bouboule','Nono'],['Grelot','Tartine','Paprika','Zigzag','Ciboulette','Mimolette','Polo','Kiwi'],['Nimbus','Lulu','Moka','Pépin','Chouquette','Zébulon','Basile','Coco']];
    const sites=this.terrain.spawnSites();
    for(let team=0;team<this.teams.length;team++)for(let i=0;i<this.options.worms;i++){
      const n=this.teams.length,slot=team*this.options.worms+i,total=n*this.options.worms;
      const W=this.world.w,span=W*.365;
      const target=n===2?(team===0?W*.07+i*(span/Math.max(1,this.options.worms-1)):W*.93-i*(span/Math.max(1,this.options.worms-1))):W*.05+slot*(W*.90/Math.max(1,total-1));
      const minSpace=this.options.generation===4?58:36;
      let valid=sites.filter(p=>this.worms.every(w=>Math.hypot(w.x-p.x,w.y-p.y)>=minSpace));
      if(!valid.length&&this.options.sizeMode==='code')valid=sites.filter(p=>this.worms.every(w=>Math.hypot(w.x-p.x,w.y-p.y)>=32));
      const preferredY=[485,310,650,425][(i+this.seed%4)%4];
      valid.sort((a,b)=>(Math.abs(a.x-target)+Math.abs(a.y-preferredY)*.24)-(Math.abs(b.x-target)+Math.abs(b.y-preferredY)*.24)||a.y-b.y);
      let p=valid[0];
      // Le générateur possède normalement assez de places ; garde-fou pour cartes extrêmes.
      if(!p){const x=50+slot*((this.world.w-100)/Math.max(1,total-1)),y=110;this.terrain.circle(x,y-25,30);this.terrain.rect(x-20,y+1,40,22);p={x,y};}
      const {x,y}=p;
      this.worms.push({id:this.worms.length,team,name:labels[team][i],x,y,vx:0,vy:0,hp:this.options.hp,maxHp:this.options.hp,dir:x<this.world.w/2?1:-1,grounded:true,input:0,inputTTL:0,energy:230,frozen:0,fallFrom:0});
    }
    this.contactTimes={};this.nextTurn(true);
  }
  active() {return this.worms.find(w=>w.id===this.activeId);}
  emit(type,data={}) {this.events.push({id:++this.eventId,type,at:this.elapsed,...data});if(this.events.length>100)this.events.shift();}
  damage(w,amount,dx=0,dy=0) {if(w.hp<=0)return;const n=Math.min(w.hp,Math.max(0,Math.round(amount)));if(!n)return;w.hp-=n;w.vx+=dx;w.vy+=dy;w.grounded=false;this.emit('damage',{x:w.x,y:w.y-45,amount:n,team:w.team,wormId:w.id});if(w.hp<=0)this.emit('death',{x:w.x,y:w.y,name:w.name,wormId:w.id,team:w.team,reason:'impact'});}
  explode(p,def=byWeapon[p.weapon]) {
    this.terrain.circle(p.x,p.y,def.radius);this.emit('explosion',{x:p.x,y:p.y,r: def.radius,weapon:p.weapon});
    for(const w of this.worms){if(w.hp<=0)continue;let d=Math.hypot(w.x-p.x,w.y-15-p.y);if(d<def.radius+28){const k=1-d/(def.radius+28),nx=(w.x-p.x)/(d||1);this.damage(w,def.damage*(0.35+0.65*k),nx*(110+200*k),-(100+220*k));if(def.type==='freeze'&&w.hp>0){w.frozen=1;this.emit('freeze',{x:w.x,y:w.y});}}}
    // Une mine proche peut être déclenchée par une explosion.
    for(const m of this.mines)if(!m.dead&&Math.hypot(m.x-p.x,m.y-p.y)<def.radius+12)m.trigger=0.15;
  }
  nextTurn(first=false) {
    if(this.checkWinner())return;
    if(!first){for(let k=1;k<=this.teams.length;k++){const t=(this.team+k)%this.teams.length;if(this.worms.some(w=>w.team===t&&w.hp>0)){this.team=t;break;}}this.turn++;}
    let living=this.worms.filter(w=>w.team===this.team&&w.hp>0);if(!living.length)return;
    this.teamCursor[this.team]=(this.teamCursor[this.team]+1)%living.length;
    let chosen=living[this.teamCursor[this.team]];
    this.activeId=chosen.id;chosen.energy=230;chosen.input=0;chosen.inputTTL=0;
    this.phase='aim';this.time=this.options.turnSeconds;this.wind=(this.random()-.5)*70;this.settle=0;this.retreat=0;
    if(this.options.suddenDeath&&this.turn>=20){this.water=Math.max(110,this.world.water-(this.turn-19)*13);this.emit('sudden',{water:this.water});}
    if(chosen.frozen){chosen.frozen=0;this.time=1.5;this.frozenTurn=true;}else this.frozenTurn=false;
    this.emit('turn',{team:this.team,name:chosen.name,turn:this.turn,frozen:this.frozenTurn});
  }
  checkWinner() {
    const live=this.teams.map((_,t)=>this.worms.some(w=>w.hp>0&&w.team===t));
    if(live.filter(Boolean).length<=1){this.winner=live.indexOf(true);this.phase='over';return true;}return false;
  }
  command(team,c={}) {
    if(this.phase==='over'||team!==this.team)return {ok:false,error:'Ce n’est pas ton tour.'};
    const w=this.active();if(!w||w.hp<=0)return {ok:false,error:'Ver indisponible.'};
    if(c.type==='move') {if(this.frozenTurn)return {ok:false,error:'Ver gelé.'};if(this.phase!=='aim'&&this.retreat<=0)return {ok:false,error:'Tir en cours.'};w.input=clamp(finite(c.dir),-1,1);w.inputTTL=0.3;if(w.input)w.dir=Math.sign(w.input);return {ok:true};}
    if(c.type==='jump'){if(this.frozenTurn)return {ok:false,error:'Ver gelé.'};if((this.phase==='aim'||this.retreat>0)&&w.grounded&&w.energy>15){w.vy=-260;w.vx=w.dir*90;w.grounded=false;w.energy-=15;this.emit('jump',{x:w.x,y:w.y,wormId:w.id});return{ok:true};}return{ok:false,error:'Impossible de sauter ici.'};}
    if(this.phase!=='aim'||this.frozenTurn)return{ok:false,error:'Action indisponible.'};
    if(c.type==='select'){
      if(w.energy<230||w.input||!w.grounded)return{ok:false,error:'Choisis un ver avant de te déplacer.'};
      const selected=this.worms.find(z=>z.id===c.wormId&&z.team===team&&z.hp>0&&!z.frozen);
      if(!selected)return{ok:false,error:'Ver indisponible.'};
      this.activeId=selected.id;selected.energy=230;selected.input=0;selected.inputTTL=0;
      this.emit('select',{team,name:selected.name});return{ok:true};
    }
    if(c.type==='skip'){this.phase='flight';this.settle=this.pace.settle;return{ok:true};}
    if(c.type!=='fire')return{ok:false,error:'Commande inconnue.'};
    const def=byWeapon[c.weapon];if(!def)return {ok:false,error:'Arme inconnue.'};
    if(this.teams[team].ammo[def.id]===0)return{ok:false,error:'Plus de munitions.'};
    const angle=normalizedAngle(finite(c.angle,-Math.PI/4)),power=clamp(finite(c.power,.5),.04,1),tx=clamp(finite(c.targetX,w.x+200*w.dir),30,this.world.w-30),ty=clamp(finite(c.targetY,0),0,this.water-30);
    if(def.type==='teleport'){const sy=this.terrain.surface(tx,ty);if(sy>=this.water-12||this.terrain.solid(tx,sy-28)||this.worms.some(z=>z.id!==w.id&&z.hp>0&&Math.hypot(z.x-tx,z.y-sy)<35))return{ok:false,error:'Choisis une surface libre au-dessus de l’eau.'};}
    if(this.teams[team].ammo[def.id]>0)this.teams[team].ammo[def.id]--;
    w.dir=Math.cos(angle)>=0?1:-1;w.input=0;this.phase='flight';this.retreat=def.type==='placed'||def.type==='mine'?3:0;this.settle=this.pace.settle;
    const origin=muzzle(this.terrain,w,angle);
    this.emit('fire',{x:w.x,y:w.y-20,weapon:def.id,angle,wormId:w.id});
    if(def.type==='heal'){w.hp=Math.min(w.maxHp,w.hp+40);this.emit('heal',{x:w.x,y:w.y-30});}
    else if(def.type==='teleport'){this.emit('teleport',{x:w.x,y:w.y});w.x=tx;w.y=this.terrain.surface(tx,ty)-1;w.vx=w.vy=0;this.emit('teleport',{x:w.x,y:w.y});}
    else if(def.type==='bridge'){let x=w.dir>0?w.x-8:w.x-162;this.terrain.rect(x,w.y+2,170,14);this.emit('bridge',{x,y:w.y});}
    else if(def.type==='punch'){for(const z of this.worms)if(z.id!==w.id&&z.hp>0&&Math.abs(z.y-w.y)<65&&(z.x-w.x)*w.dir>0&&(z.x-w.x)*w.dir<85)this.damage(z,24,w.dir*420,-180);this.emit('punch',{x:w.x+w.dir*45,y:w.y-20,dir:w.dir});}
    else if(def.type==='laser'||def.type==='shotgun') {
      const laser=def.type==='laser',offsets=laser?[0]:[-.045,0,.045],impacts=[];
      // Les plombs d’une même salve voient le même terrain. Les cratères ne
      // sont appliqués qu’après les trois rayons, pas entre deux plombs.
      for(const off of offsets){
        let end={...origin};const hit=new Set(),a=angle+off,len=laser?700:430;
        for(let d=0;d<len;d+=laser?4:1){
          const x=origin.x+Math.cos(a)*d,y=origin.y+Math.sin(a)*d;end={x,y};
          if(x<0||x>this.world.w||y>this.world.h||y<0)break;
          if(!laser&&this.terrain.solid(x,y)){impacts.push({x,y});break;}
          let struck=false;
          for(const z of this.worms){
            if(z.id===w.id||z.hp<=0||hit.has(z.id)||Math.hypot(z.x-x,z.y-17-y)>=20)continue;
            this.damage(z,def.damage,Math.cos(a)*80,-65);hit.add(z.id);struck=true;
            if(!laser)break;
          }
          if(!laser&&struck)break;
          if(laser&&this.terrain.solid(x,y))this.terrain.circle(x,y,12);
        }
        this.emit('beam',{x:origin.x,y:origin.y,x2:end.x,y2:end.y,weapon:def.id});
      }
      for(const p of impacts)this.terrain.circle(p.x,p.y,9);
    }
    else if(def.type==='mine'){this.mines.push({id:++this.entityId,x:w.x,y:w.y-5,vy:0,arm:2.5,trigger:null,dead:false});}
    else if(def.type==='airstrike'){for(let i=0;i<5;i++)this.projectiles.push({id:++this.entityId,x:tx+(i-2)*55,y:-40-i*65,vx:35,vy:150,life:0,weapon:def.id,type:'impact',owner:w.id});}
    else if(def.type==='placed'){this.projectiles.push({id:++this.entityId,x:w.x-w.dir*16,y:w.y-10,vx:0,vy:0,life:0,fuse:3*this.pace.speed,weapon:def.id,type:'timed',owner:w.id});}
    else {this.projectiles.push({id:++this.entityId,...origin,vx:Math.cos(angle)*launchSpeed(def,power),vy:Math.sin(angle)*launchSpeed(def,power),life:0,fuse:(def.type==='bouncy'?4:clamp(finite(c.fuse,3),1,5))*this.pace.speed,weapon:def.id,type:def.type,owner:w.id,drilled:0});}
    // Resolve solid muzzle contact before the first high-speed integration step.
    const fired=this.projectiles.filter(p=>p.owner===w.id&&p.life===0);
    for(const p of fired)if(!['airstrike','dynamite'].includes(p.weapon)&&this.terrain.solid(p.x,p.y)){
      if(['impact','freeze','homing'].includes(p.type)){this.explode(p);p.dead=true;}
      else if(p.type!=='drill'){p.x=w.x;p.y=w.y-22;p.vx*=-.2;p.vy=-Math.abs(p.vy)*.2;}
    }
    this.projectiles=this.projectiles.filter(p=>!p.dead);
    return{ok:true};
  }
  get pace(){return PACES[this.options.pace]||PACES.classic;}
  tick(realDt=1/60){
    realDt=clamp(realDt,0,.05);
    const speed=this.pace.speed;
    // Worms also need short steps: explosions must not throw them through a neighbour.
    const fastest=this.worms.reduce((v,w)=>w.hp>0?Math.max(v,Math.hypot(w.vx,w.vy)+87):v,87);
    const parts=Math.max(Math.ceil(speed),Math.min(64,Math.ceil(fastest*realDt*speed/5)));
    for(let i=0;i<parts;i++)this.step(realDt*speed/parts,realDt/parts);
  }
  bodyBlocked(x,y){
    return this.terrain.solid(x,y)||this.terrain.solid(x,y-12)||this.terrain.solid(x,y-26)||
      this.terrain.solid(x-8,y-14)||this.terrain.solid(x+8,y-14);
  }
  onFloor(w){return this.terrain.solid(w.x,w.y+2);}
  /** Short swept translations used by both the terrain and contact solver. */
  displace(w,dx,dy,stepUp=false){
    const requestedX=dx,requestedY=dy,startX=w.x,startY=w.y;
    if(dy>0&&this.onFloor(w))dy=0;
    const n=Math.max(1,Math.ceil(Math.hypot(dx,dy)));let moved=0;
    for(let k=0;k<n;k++){
      let nx=w.x+dx/n,ny=w.y+dy/n;
      if(this.bodyBlocked(nx,ny)){
        let rise=0;
        if(stepUp&&Math.abs(dx)>Math.abs(dy)&&w.grounded)while(rise<=12&&this.bodyBlocked(nx,ny-rise))rise++;
        if(stepUp&&rise>0&&rise<=12)ny-=rise;else break;
      }
      w.x=nx;w.y=ny;moved++;
    }
    const length2=requestedX*requestedX+requestedY*requestedY;
    return length2>1e-12?clamp(((w.x-startX)*requestedX+(w.y-startY)*requestedY)/length2,0,1):1;
  }
  integrateWorms(dt,realDt,gravity){
    for(const w of this.worms){if(w.hp<=0)continue;
      w.inputTTL-=realDt;if(w.inputTTL<=0)w.input=0;
      let move=0;
      if(w.id===this.activeId&&(this.phase==='aim'||this.retreat>0)&&w.energy>0){move=w.input*87*dt;w.energy=Math.max(0,w.energy-Math.abs(move));}
      w.driveVX=dt>0?move/dt:0;
      const requested=move+w.vx*dt;
      if(this.displace(w,requested,0,true)<.95){w.vx*=.15;w.driveVX=0;}
      w.vx*=Math.pow(w.grounded?.008:.55,dt);
      const support=this.worms.find(z=>z.id===w.supportId&&z.hp>0&&z.y>w.y&&Math.abs(z.x-w.x)<20&&Math.abs(z.y-w.y-28)<3);
      if((!this.onFloor(w)&&!support)||w.vy<0){
        w.grounded=false;w.supportId=null;w.vy=Math.min(1300,w.vy+gravity*dt);let ny=w.y+w.vy*dt;
        if(w.vy>0){
          for(let yy=w.y;yy<=ny+1;yy+=1)if(this.terrain.solid(w.x,yy)){
            const speed=w.vy;if(speed>410)this.damage(w,(speed-410)*.1);
            ny=yy-1;w.vy=0;w.grounded=true;break;
          }
        }else if(this.terrain.solid(w.x,ny-28)){ny=w.y;w.vy=20;}
        w.y=ny;
      }else{w.vy=0;w.grounded=true;}
    }
  }
  /** Equal-mass arcade body contacts; independent of teams and turn ownership.
   * Position projection cannot push a body through the terrain. Iteration transmits
   * a shove along a chain. High-speed motion is sub-stepped by tick().
   */
  solveContacts(dt){
    const bodies=this.worms.filter(w=>w.hp>0),diameter=28;
    this.contactTimes||={};
    for(let iteration=0;iteration<6;iteration++)for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
      const a=bodies[i],b=bodies[j];let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
      if(d>diameter+.5)continue;
      const nx=d>.001?dx/d:(a.id<b.id?1:-1),ny=d>.001?dy/d:0,overlap=Math.max(0,diameter-d);
      if(overlap>.005){
        const half=(overlap+.015)/2;
        const ma=this.displace(a,-nx*half,-ny*half,true),mb=this.displace(b,nx*half,ny*half,true);
        if(ma<1)this.displace(b,nx*half*(1-ma),ny*half*(1-ma),true);
        if(mb<1)this.displace(a,-nx*half*(1-mb),-ny*half*(1-mb),true);
      }
      // Movement is a bounded motor, not an unlimited teleport through other worms.
      const avx=a.vx+(a.driveVX||0),bvx=b.vx+(b.driveVX||0);
      const rel=(bvx-avx)*nx+(b.vy-a.vy)*ny;
      if(rel<-.5){
        const impulse=Math.min(1000,-rel*.54);
        a.vx-=impulse*nx;b.vx+=impulse*nx;a.vy-=impulse*ny;b.vy+=impulse*ny;
        if(a.vy>0&&this.onFloor(a))a.vy=0;if(b.vy>0&&this.onFloor(b))b.vy=0;
        const key=a.id+':'+b.id;
        if(-rel>100&&this.elapsed-(this.contactTimes[key]??-10)>.35){
          this.contactTimes[key]=this.elapsed;this.emit('bump',{x:(a.x+b.x)/2,y:(a.y+b.y)/2-15,force:-rel});
        }
      }
      // Slow, near-vertical contacts form a stable stack, rather than vibrating.
      if(ny>.7&&Math.abs(a.vy-b.vy)<95&&b.grounded){a.supportId=b.id;a.grounded=true;a.vy=0;}
      if(ny<-.7&&Math.abs(a.vy-b.vy)<95&&a.grounded){b.supportId=a.id;b.grounded=true;b.vy=0;}
      if(!this.onFloor(a)&&a.supportId==null)a.grounded=false;
      if(!this.onFloor(b)&&b.supportId==null)b.grounded=false;
    }
    for(const w of bodies){w.vx=clamp(w.vx,-1200,1200);w.vy=clamp(w.vy,-1200,1300);}
  }
  step(dt,realDt) {
    if(this.phase==='over')return;this.elapsed+=realDt;this.flightAge=this.phase==='flight'?(this.flightAge||0)+realDt:0;this.retreat=Math.max(0,this.retreat-realDt);
    const gravity=370*this.theme.gravity;
    this.integrateWorms(dt,realDt,gravity);
    this.solveContacts(dt);
    for(const w of this.worms)if(w.hp>0&&(w.y>this.water+7||w.x<-25||w.x>this.world.w+25)){
      this.emit('splash',{x:clamp(w.x,0,this.world.w),y:this.water});w.hp=0;this.emit('death',{x:w.x,y:Math.min(w.y,this.water),name:w.name,wormId:w.id,team:w.team,reason:'water'});
    }
    const added=[];
    for(const p of this.projectiles){p.life+=dt;const def=byWeapon[p.weapon];
      if(p.type==='homing'&&p.life>.3){const source=this.worms.find(w=>w.id===p.owner);const candidates=this.worms.filter(w=>w.hp>0&&w.team!==source?.team);candidates.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));const target=candidates[0];if(target){let dx=target.x-p.x,dy=target.y-18-p.y,len=Math.hypot(dx,dy)||1;p.vx+=(dx/len*310-p.vx)*dt*1.65;p.vy+=(dy/len*310-p.vy)*dt*1.65;}}
      else{p.vx+=this.wind*dt*.7;p.vy+=gravity*(def.gravity||1)*dt;}
      let steps=Math.max(1,Math.ceil(Math.hypot(p.vx,p.vy)*dt));let hit=false;
      for(let s=0;s<steps&&!p.dead;s++){let nx=p.x+p.vx*dt/steps,ny=p.y+p.vy*dt/steps;
        if(nx<-80||nx>this.world.w+80||ny>this.water+8||p.life>24){p.dead=true;this.emit(ny>this.water?'splash':'miss',{x:clamp(nx,0,this.world.w),y:this.water});break;}
        const owner=this.worms.find(w=>w.id===p.owner);if(!owner||Math.hypot(owner.x-nx,owner.y-17-ny)>28)p.leftOwner=true;
        let terrainHit=this.terrain.solid(nx,ny),wormHit=this.worms.some(w=>w.hp>0&&(p.leftOwner||w.id!==p.owner)&&Math.hypot(w.x-nx,w.y-17-ny)<18);
        if(terrainHit&&p.type==='drill'&&p.drilled<160){this.terrain.circle(nx,ny,13);p.drilled+=Math.hypot(p.vx,p.vy)*dt/steps;terrainHit=false;}
        if(terrainHit||wormHit){if(['timed','bouncy','cluster','banana'].includes(p.type)){if(terrainHit){if(this.terrain.solid(nx,p.y))p.vx*=-.65;else p.vy=-Math.abs(p.vy)*(p.type==='bouncy'?.82:.48);p.vx*=.82;if(Math.abs(p.vy)<12)p.vy=0;}else{p.vx*=-.6;p.vy=-Math.max(60,Math.abs(p.vy)*.5);}hit=true;break;}
          else{p.x=nx;p.y=ny;this.explode(p);p.dead=true;break;}}
        p.x=nx;p.y=ny;
      }
      if(!p.dead&&['timed','bouncy','cluster','banana'].includes(p.type)&&p.life>=p.fuse){this.explode(p);p.dead=true;if(p.type==='cluster'||p.type==='banana'){let count=p.type==='cluster'?5:3;for(let i=0;i<count;i++){let a=-Math.PI*.9+i/(count-1)*Math.PI*.8;added.push({id:++this.entityId,x:p.x,y:p.y-12,vx:Math.cos(a)*(130+this.random()*90),vy:Math.sin(a)*(170+this.random()*140),life:0,weapon:p.type==='cluster'?'cluster':'grenade',type:'impact',owner:p.owner});}}}
    }
    this.projectiles=this.projectiles.filter(p=>!p.dead).concat(added);
    for(const m of this.mines){if(m.dead)continue;m.arm-=realDt;if(!this.terrain.solid(m.x,m.y+5)){m.vy+=gravity*dt;m.y+=m.vy*dt;if(this.terrain.solid(m.x,m.y+5)){while(this.terrain.solid(m.x,m.y+5)&&m.y>0)m.y--;m.vy=0;}}else m.vy=0;if(m.y>this.water){m.dead=true;continue;}if(m.arm<=0&&m.trigger===null&&this.worms.some(w=>w.hp>0&&Math.hypot(w.x-m.x,w.y-10-m.y)<46)){m.trigger=.65;this.emit('beep',{x:m.x,y:m.y});}if(m.trigger!==null){m.trigger-=realDt;if(m.trigger<=0){m.dead=true;this.explode({...m,weapon:'mine'});}}}
    this.mines=this.mines.filter(m=>!m.dead);
    if(this.phase==='aim'){this.time-=realDt;if(this.time<=0||this.active()?.hp<=0){this.phase='flight';this.settle=this.pace.settle;}}
    if(this.phase==='flight'&&!this.projectiles.length&&this.retreat<=0){const moving=this.worms.some(w=>w.hp>0&&(!w.grounded||Math.abs(w.vx)>10));const ticking=this.mines.some(m=>m.trigger!==null);if(!moving&&!ticking)this.settle-=realDt;if(this.settle<=0||this.flightAge>18)this.nextTurn();}
    if(!this.projectiles.length&&this.phase!=='over')this.checkWinner();
  }
  exportState() {
    const {random,theme,terrain,...state}=this;
    return JSON.parse(JSON.stringify({format:4,state,rngState:random.getState(),terrainOps:terrain.ops}));
  }
  static fromState(saved) {
    if(!saved||![2,3,4].includes(saved.format)||!saved.state||!Array.isArray(saved.state.teams)||!Array.isArray(saved.terrainOps))throw new Error('Sauvegarde incompatible.');
    const restoredOptions={...saved.state.options};if(saved.format<4&&!restoredOptions.generation)restoredOptions.generation=saved.format===2?2:3;
    const g=new Game(restoredOptions,saved.state.teams.map(t=>t.name));
    Object.assign(g,JSON.parse(JSON.stringify(saved.state)));
    if(saved.format===2)g.options={...g.options,generation:2,pace:'classic',layout:'ridge'};
    if(saved.format<4){g.options={...g.options,generation:restoredOptions.generation};g.world={...WORLD};}g.contactTimes||={};
    g.theme=THEMES.find(t=>t.id===g.options.theme);
    g.random=rng(saved.rngState);g.terrain=new Terrain(g.seed,g.options.theme,g.options.layout,g.options.generation,g.world);
    for(const op of saved.terrainOps)g.terrain.apply(op);
    return g;
  }
  snapshot() {return{version:VERSION,world:this.world,seed:this.seed,options:this.options,teams:this.teams,worms:this.worms,projectiles:this.projectiles,mines:this.mines,ops:this.terrain.ops,events:this.events,turn:this.turn,team:this.team,activeId:this.activeId,phase:this.phase,time:this.time,wind:this.wind,water:this.water,winner:this.winner,retreat:this.retreat,frozenTurn:this.frozenTurn,elapsed:this.elapsed};}
}
/** IA balistique : échantillonne des trajectoires et pénalise les tirs alliés. */
export function chooseAI(game) {
  const me=game.active();if(!me)return{type:'skip'};
  if(me.hp<45&&game.teams[me.team].ammo.heal>0)return{type:'fire',weapon:'heal'};
  const enemies=game.worms.filter(w=>w.hp>0&&w.team!==me.team),friends=game.worms.filter(w=>w.hp>0&&w.team===me.team);
  if(!enemies.length)return{type:'skip'};
  const skill=game.options.difficulty,def=byWeapon.rocket;
  let best={score:-1e9,angle:-Math.PI/4,power:.5};
  function candidate(a,pow){
    let {x,y}=muzzle(game.terrain,me,a),vx=Math.cos(a)*launchSpeed(def,pow),vy=Math.sin(a)*launchSpeed(def,pow);
    for(let t=0;t<12;t+=.055){
      vx+=game.wind*.7*.055;vy+=370*game.theme.gravity*.055;
      const n=Math.max(1,Math.ceil(Math.hypot(vx,vy)*.055/8));
      for(let k=0;k<n;k++){
        x+=vx*.055/n;y+=vy*.055/n;
        if(x<0||x>game.world.w||y>game.water)return;
        if(game.terrain.solid(x,y)||enemies.some(w=>Math.hypot(w.x-x,w.y-17-y)<18)){
          const nearest=Math.min(...enemies.map(w=>Math.hypot(w.x-x,w.y-17-y)));
          let score=180-nearest;
          for(const w of friends)score-=Math.max(0,95-Math.hypot(w.x-x,w.y-17-y))*1.6;
          if(score>best.score)best={score,angle:a,power:pow};return;
        }
      }
    }
  }
  // Direct downhill trajectories are always sampled (not just an upper semicircle).
  for(const enemy of enemies){const direct=Math.atan2(enemy.y-17-(me.y-22),enemy.x-me.x);for(const offset of [0,-.045,-.12])for(let pow=.16;pow<=1.001;pow+=.08)candidate(normalizedAngle(direct+offset),Math.min(1,pow));}
  const da=skill==='hard'?.095:.16,dp=skill==='hard'?.065:.095;
  for(let a=-Math.PI;a<Math.PI;a+=da)for(let pow=.14;pow<=1.001;pow+=dp)candidate(a,Math.min(1,pow));
  const near=enemies.filter(w=>Math.abs(w.y-me.y)<60&&Math.abs(w.x-me.x)<80).sort((a,b)=>Math.abs(a.x-me.x)-Math.abs(b.x-me.x))[0];
  if(near&&skill!=='easy')return{type:'fire',weapon:'punch',angle:near.x>me.x?0:-Math.PI};
  const ammo=game.teams[me.team].ammo;
  if(best.score<75&&skill!=='easy'&&ammo.airstrike>0){const target=enemies.filter(w=>game.terrain.surface(w.x)>=w.y-5).sort((a,b)=>a.hp-b.hp)[0];if(target)return{type:'fire',weapon:'airstrike',targetX:target.x-35,targetY:target.y};}
  if(best.score<65&&ammo.bee>0&&game.turn>2)return{type:'fire',weapon:'bee',angle:best.angle,power:.65};
  const err=skill==='easy'?.10:skill==='hard'?.007:.028;
  return{type:'fire',weapon:'rocket',angle:normalizedAngle(best.angle+(game.random()-.5)*err),power:clamp(best.power+(game.random()-.5)*err,.04,1)};
}
