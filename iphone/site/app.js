import {Game,THEMES,WEAPONS,byWeapon,chooseAI,clamp,VERSION,LAYOUTS,PACES,resolveLevel,levelCode,parseLevelCode,cleanOptions,worldFor,radialAim} from './engine.js?v=0.5.1';
import {Renderer,TEAM_COLORS} from './renderer.js?v=0.5.1';
import {dragPower,cameraRailMetrics,pinchView,weaponControls} from './interaction.js?v=0.5.1';
import {Sound} from './audio.js?v=0.5.1';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storage={get(k,d=null){try{return JSON.parse(localStorage.getItem(k))??d;}catch{return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}},remove(k){try{localStorage.removeItem(k);}catch{}}};
const sound=new Sound(),renderer=new Renderer($('game-canvas'));
let options=storage.get('lombrix-options',{theme:'lagoon',layout:'auto',worms:3,hp:100,turnSeconds:30,pace:'lively',difficulty:'normal',suddenDeath:true});
if(!options||typeof options!=='object'||Array.isArray(options))options={};
if(!options.pace){options.pace='lively';options.turnSeconds=30;}
options=cleanOptions(options.generation===4?options:{...options,generation:4,sizeMode:'auto'});
// Level seeds are not credentials; an offline reader may omit Web Crypto.
const newSeed=()=>{try{if(globalThis.crypto?.getRandomValues)return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];}catch{}return Math.floor(Math.random()*4294967296)>>>0;};
let mapPreview=null,heroRenderer=null,heroSeed=325902,heroChange=0,launchPending=false;
if(options.theme!=='random'&&!THEMES.some(t=>t.id===options.theme))options.theme='lagoon';
let screen='home',localGame=null,snapshot=null,room=null,source=null,connected=false,gameKey=null,ops=[],lastTurn=-1;
let weapon='rocket',fuse=3,moveDir=0,moveInterval=null,soloPaused=false,aiTurn=-1,aiWait=0,accumulator=0,lastFrame=performance.now(),nextHud=0;
let lastSoloSave=0;
let arsenalOpen=false,arsenalCategory='Rapide',railPointer=null;
const railMarkers=new Map();let railWorldWidth=null,cacheStamp='';
let actionSeq=Date.now()*1000,firePending=false,toastTimer,bannerTimer,wakeLock=null,dialogKind='',lastLobby='',ended=new Set();
renderer.quality=storage.get('lombrix-quality','hd');renderer.resize();
sound.enabled=storage.get('lombrix-sound',true);sound.music=storage.get('lombrix-music',false);
const savedName=storage.get('lombrix-name','');$('nickname').value=typeof savedName==='string'?savedName.slice(0,22):'';
const name=()=>($('nickname').value.trim().slice(0,22)||'Capitaine Biscotte');
$('nickname').addEventListener('change',()=>storage.set('lombrix-name',name()));
function safeHistory(path){try{if(location.protocol==='https:'||location.protocol==='http:')history.replaceState(null,'',path);}catch{}}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4300);}
function banner(message){$('turn-banner').textContent=message;$('turn-banner').hidden=false;clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>$('turn-banner').hidden=true,1150);}
function setScreen(which){if(screen===which)return;screen=which;for(const id of ['home','lobby','battle'])$(id).hidden=id!==which;document.body.classList.toggle('in-game',which==='battle');if(which==='battle'){requestAnimationFrame(()=>renderer.resize());keepAwake();}else{stopMove();wakeLock?.release().catch(()=>{});wakeLock=null;window.scrollTo(0,0);if(which==='home'){refreshSoloResume();drawHero();}}}
async function keepAwake(){try{if('wakeLock'in navigator&&document.visibilityState==='visible'&&!wakeLock)wakeLock=await navigator.wakeLock.request('screen');}catch{}}
async function audioStart(){try{await sound.unlock();if(sound.music&&!sound.timer)sound.setMusic(true);}catch(error){console.warn('Son indisponible, le jeu continue.',error);}}
function disposeMapPreview(){if(mapPreview){mapPreview.destroy();mapPreview=null;}}
function disposeHero(){heroChange++;if(heroRenderer){heroRenderer.destroy();heroRenderer=null;}}
function dialog(title,html,kind='general'){
 cancelAimGesture();closeArsenal();
 if(kind!=='configure')disposeMapPreview();
 dialogKind=kind;$('dialog-label').textContent=title;$('dialog-body').innerHTML=html;
 const modal=$('dialog');
 if(!modal.open){
  let native=false;if(typeof modal.showModal==='function')try{modal.showModal();native=true;}catch{}
  if(!native){modal.setAttribute('open','');modal.open=true;modal.classList.add('dialog-fallback');document.body.classList.add('fallback-modal');}
 }
 if(localGame)soloPaused=true;stopMove();modal.scrollTop=0;
}
function closeDialog(){
 const modal=$('dialog');
 if(modal.open){if(modal.classList.contains('dialog-fallback')||typeof modal.close!=='function'){modal.removeAttribute('open');modal.open=false;}else modal.close();}
 modal.classList.remove('dialog-fallback');document.body.classList.remove('fallback-modal');
 disposeMapPreview();soloPaused=false;dialogKind='';
}
$('close-dialog').onclick=closeDialog;
$('dialog').addEventListener('close',()=>{if(!$('dialog').open){disposeMapPreview();soloPaused=false;dialogKind='';}});
$('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
async function api(path,data){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);try{const r=await fetch(path,{method:data===undefined?'GET':'POST',credentials:'same-origin',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:controller.signal,cache:'no-store'});let result;try{result=await r.json();}catch{throw new Error('Le serveur de jeu ne répond pas. Le mode solo reste disponible.');}if(!r.ok)throw new Error(result.error||'Demande refusée.');return result;}catch(e){if(e.name==='AbortError')throw new Error('La connexion est trop lente. Réessaie après le rétablissement du réseau.');if(e instanceof TypeError)throw new Error('Serveur injoignable. Une connexion internet est nécessaire pour jouer à plusieurs.');throw e;}finally{clearTimeout(timeout);}}
async function roomAction(action,data={}){if(!room)return;const result=await api(`/api/rooms/${room.code}/${action}`,data);if(result.room)receiveRoom(result.room);return result;}
function worldArt(theme,i){return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 90" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="sky${i}" x2="0" y2="1"><stop stop-color="${theme.sky[0]}"/><stop offset="1" stop-color="${theme.sky[1]}"/></linearGradient></defs><path fill="url(#sky${i})" d="M0 0H200V90H0z"/><circle cx="154" cy="23" r="${i===2?16:12}" fill="#fff1c64a"/><path d="M0 76Q30 28 72 54T145 45T200 69V90H0" fill="${theme.dirt[1]}" opacity=".6"/><path d="M0 82Q30 48 70 67T125 57T200 76V90H0" fill="${theme.dirt[0]}"/><path d="M0 82Q30 48 70 67T125 57T200 76" stroke="${theme.top}" stroke-width="3" fill="none"/><text x="44" y="55" fill="${theme.accent}" font-size="31" font-family="sans-serif">${theme.icon}</text></svg>`;}
function drawWorlds(){$('worlds').innerHTML=THEMES.map((t,i)=>`<button class="world-card ${options.theme===t.id?'selected':''}" data-theme="${t.id}" aria-pressed="${options.theme===t.id}"><div class="world-art">${worldArt(t,i)}</div><div class="world-name">${t.short}<span class="check">✓</span></div></button>`).join('');$('world-caption').textContent=(THEMES.find(t=>t.id===options.theme)?.short||'MONDE SURPRISE').toUpperCase();$('worlds').querySelectorAll('button').forEach(b=>b.onclick=()=>{options.theme=b.dataset.theme;storage.set('lombrix-options',options);drawWorlds();sound.click();});drawHero();}
drawWorlds();
function selectField(id,label,values,current){return`<div class="form-field"><label for="${id}">${label}</label><select id="${id}">${values.map(([value,text])=>`<option value="${value}" ${String(current)===String(value)?'selected':''}>${text}</option>`).join('')}</select></div>`;}
function drawHero(){
 const canvas=$('hero-canvas');if(!canvas)return;
 const change=++heroChange;requestAnimationFrame(()=>{if(change!==heroChange||screen!=='home'||dialogKind==='configure'||launchPending)return;try{
  heroRenderer||=new Renderer(canvas);heroRenderer.reduced=true;heroRenderer.overview=true;
  const demo=new Game({...options,seed:heroSeed,worms:3,layout:options.layout||'auto'},['Pistaches','Fripouilles']);
  heroRenderer.resize();heroRenderer.setState(demo.snapshot(),'hero-'+change);heroRenderer.canAim=false;heroRenderer.draw(1000,.016);
  $('hero-level-label').textContent=demo.theme.short+' · '+LAYOUTS.find(l=>l.id===demo.options.layout).name;
 }catch(error){disposeHero();$('hero-level-label').textContent='Aperçu indisponible · Le mode solo reste accessible';console.warn('Aperçu',error);}
 });
}
if($('hero-shuffle'))$('hero-shuffle').onclick=()=>{heroSeed=newSeed();drawHero();sound.click();};
function configure(kind){
 audioStart();storage.set('lombrix-name',name());const online=kind!=='solo';
 disposeMapPreview();disposeHero();
 const initial={...options,seed:newSeed()};let loadedLevel=null;
 dialog(online?'CHACUN SUR SON TÉLÉPHONE':'LA FABRIQUE À BATAILLES',`
 <h2>${kind==='tournament'?'Le tournoi des petites terreurs.':online?'Un lien. Des amis. Du grabuge.':'Ton terrain. Tes règles.'}</h2>
 <p>${online?'Chaque joueur rejoint le même terrain sur son propre appareil.':'12 univers, 10 reliefs et une nouvelle géographie à chaque graine.'}</p>
 <form id="config-form">
 <div class="level-preview"><canvas id="level-canvas" aria-label="Aperçu du terrain généré"></canvas><div class="level-overlay"><span id="preview-title"></span><span id="preview-subtitle"></span></div></div>
 <div class="generator-actions"><button type="button" class="secondary-button" id="shuffle-level">↻ Autre terrain</button><button type="button" class="secondary-button" id="surprise-level">✦ Surprise totale</button><span id="preview-count"></span></div>
 <div class="form-grid">
 ${selectField('opt-theme','UNIVERS',[["random","Surprise · Univers aléatoire"],...THEMES.map(t=>[t.id,t.short])],initial.theme)}
 ${selectField('opt-layout','TYPE DE RELIEF',[["auto","Surprise · Relief aléatoire"],...LAYOUTS.map(t=>[t.id,t.name])],initial.layout)}
 ${selectField('opt-worms','VERS PAR ÉQUIPE',Array.from({length:8},(_,i)=>[i+1,`${i+1} ${i===0?'ver · Duel éclair':i===2?'vers · Classique':i===7?'vers · Grande mêlée':'vers'}`]),initial.worms)}
 ${selectField('opt-pace','RYTHME DU JEU',[["classic","Classique · ×1"],["lively","Vif · ×1,3"],["turbo","Turbo · ×1,6"]],initial.pace)}
 ${selectField('opt-hp','POINTS DE VIE',[[75,'75 · Escarmouche'],[100,'100 · Standard'],[150,'150 · Costauds'],[200,'200 · Très costauds']],initial.hp)}
 ${selectField('opt-time','CHRONOMÈTRE DU TOUR',[[20,'20 secondes'],[25,'25 secondes'],[30,'30 secondes'],[40,'40 secondes'],[45,'45 secondes'],[60,'60 secondes']],initial.turnSeconds)}
 ${kind==='solo'?selectField('opt-difficulty','ADVERSAIRE', [['easy','Tranquille'],['normal','Malin'],['hard','Très malin']],initial.difficulty):''}
 ${kind==='tournament'?selectField('opt-capacity','PARTICIPANTS',[[4,'4 joueurs · Demi-finales et finale'],[8,'8 joueurs · Quarts, demies, finale']],4):kind==='duel'?selectField('opt-capacity','JOUEURS DANS LE COMBAT',[[2,'2 joueurs · Duel'],[3,'3 joueurs · Chacun pour soi'],[4,'4 joueurs · Mêlée']],2):''}
 ${selectField('opt-sudden','MONTÉE DES EAUX', [['yes','Oui · À partir du 21e tour'],['no','Non']],initial.suddenDeath?'yes':'no')}
 <div class="form-field"><label for="opt-seed">GRAINE DU TERRAIN</label><input id="opt-seed" type="number" min="0" max="4294967295" step="1" required value="${initial.seed}"></div>
 </div>
 <details class="level-share"><summary>Rejouer ou partager exactement un terrain</summary><p>Le code contient l’univers, le relief, la graine et la largeur exacte. Changer les effectifs réactive la taille automatique.</p><div class="code-row"><input id="opt-code" aria-label="Code du terrain" spellcheck="false"><button id="copy-level" type="button" class="secondary-button">Copier</button><button id="load-level" type="button" class="secondary-button">Charger</button></div></details>
 <p class="input-note" id="pace-note">Le rythme accélère les mouvements et les trajectoires ; le chronomètre reste en secondes réelles. L’aperçu représente le terrain effectivement utilisé.</p>
 <div class="dialog-actions"><button class="primary" id="confirm-config" type="submit">${online?'Créer le salon privé':'Au combat !'} <span>→</span></button></div></form>`,'configure');
 const read=()=>({theme:$('opt-theme').value,layout:$('opt-layout').value,seed:Number($('opt-seed').value)>>>0,generation:loadedLevel?.generation||4,sizeMode:loadedLevel?.sizeMode||'auto',worldWidth:loadedLevel?.worldWidth,worms:+$('opt-worms').value,pace:$('opt-pace').value,hp:+$('opt-hp').value,turnSeconds:+$('opt-time').value,difficulty:$('opt-difficulty')?.value||options.difficulty||'normal',suddenDeath:$('opt-sudden').value==='yes'});
 function preview(){
  if(!$('level-canvas')||dialogKind!=='configure'||!$('dialog').open)return;try{const o=read(),n=kind==='duel'?+($('opt-capacity')?.value||2):2,g=new Game(o,Array.from({length:n},(_,i)=>i?'Équipe '+(i+1):name()));
  mapPreview||=new Renderer($('level-canvas'));mapPreview.reduced=true;mapPreview.overview=true;mapPreview.resize();mapPreview.setState(g.snapshot(),'config-'+JSON.stringify(o));mapPreview.canAim=false;mapPreview.draw(1000,.016);
  $('preview-title').textContent=g.theme.short;$('preview-subtitle').textContent=LAYOUTS.find(t=>t.id===g.options.layout).name;
  $('preview-count').textContent=`${g.worms.length} vers au total · ${g.world.w} × ${g.world.h} · ${loadedLevel?'taille du code':'taille automatique'}`;
  $('opt-code').value=levelCode(g.options);
  }catch(error){disposeMapPreview();$('preview-title').textContent='Aperçu indisponible';$('preview-subtitle').textContent='Tu peux lancer la bataille avec ces réglages.';console.warn('Aperçu terrain',error);}
 }
 for(const id of ['opt-theme','opt-layout','opt-worms','opt-pace','opt-hp','opt-seed','opt-capacity'])$(id)?.addEventListener('change',()=>{if(['opt-theme','opt-layout','opt-worms','opt-capacity'].includes(id))loadedLevel=null;preview();});
 $('shuffle-level').onclick=()=>{loadedLevel=null;$('opt-seed').value=newSeed();preview();sound.click();};
 $('surprise-level').onclick=()=>{loadedLevel=null;$('opt-theme').value='random';$('opt-layout').value='auto';$('opt-seed').value=newSeed();preview();sound.click();};
 $('copy-level').onclick=async()=>{try{await navigator.clipboard.writeText($('opt-code').value);toast('Code terrain copié.');}catch{$('opt-code').select();toast('Le code est sélectionné : copie-le.');}};
 $('load-level').onclick=()=>{try{const o=parseLevelCode($('opt-code').value);loadedLevel=o;$('opt-theme').value=o.theme;$('opt-layout').value=o.layout;$('opt-seed').value=o.seed;preview();}catch(e){toast(e.message);}};
 requestAnimationFrame(preview);
 $('config-form').onsubmit=async e=>{
  e.preventDefault();options=read();storage.set('lombrix-options',options);drawWorlds();
  if(!online){launchSolo(false);return;}
  $('confirm-config').disabled=true;try{const r=await api('/api/rooms',{name:name(),kind,capacity:+($('opt-capacity')?.value||2),options});closeDialog();connectRoom(r.room);}catch(e){toast(e.message);if($('confirm-config'))$('confirm-config').disabled=false;}
 };
}
// Quick play does not depend on a modal, a preview, the audio promise or a server.
function launchSolo(freshSeed=true){
 if(launchPending)return;
 launchPending=true;const button=$('solo');button.disabled=true;button.setAttribute('aria-busy','true');
 audioStart();storage.set('lombrix-name',name());
 if(freshSeed)options=cleanOptions({...options,seed:newSeed(),generation:4,sizeMode:'auto'});
 disposeMapPreview();disposeHero();closeDialog();
 // Yield for one paint so the press/loading feedback appears before level creation.
 requestAnimationFrame(()=>setTimeout(()=>{
  try{startSolo();window.LombrixBoot?.ready();}
  catch(error){localGame=null;snapshot=null;soloPaused=false;setScreen('home');window.LombrixBoot?.report(error);}
  finally{launchPending=false;button.disabled=false;button.removeAttribute('aria-busy');}
 },0));
}
$('solo').onclick=()=>launchSolo(true);
$('configure-solo').onclick=()=>{try{configure('solo');}catch(error){window.LombrixBoot?.report(error);}};
$('create-duel').onclick=()=>configure('duel');$('create-tournament').onclick=()=>configure('tournament');
function joinDialog(code=''){dialog('INVITATION ENTRE AMIS',`<h2>On t’attend de pied…<br>enfin, de ver ferme.</h2><p>Entre le code de 6 caractères reçu avec ton invitation.</p><form id="join-form"><div class="form-grid"><div class="form-field"><label for="join-name">TON NOM DE GUERRE</label><input id="join-name" maxlength="22" value="${esc(name())}" autocomplete="nickname" required></div><div class="form-field"><label for="join-code">CODE DU SALON</label><input id="join-code" maxlength="6" minlength="6" value="${esc(code)}" placeholder="ABC234" autocapitalize="characters" autocorrect="off" spellcheck="false" required></div></div><div class="dialog-actions"><button class="primary" id="join-submit">Rejoindre sur cet appareil →</button></div></form>`,'join');$('join-form').onsubmit=async e=>{e.preventDefault();audioStart();const code=$('join-code').value.trim().toUpperCase();if(!/^[A-Z2-9]{6}$/.test(code)){toast('Le code contient 6 lettres ou chiffres.');return;}$('join-submit').disabled=true;try{const n=$('join-name').value.trim();const r=await api(`/api/rooms/${code}/join`,{name:n});$('nickname').value=n;storage.set('lombrix-name',n);closeDialog();connectRoom(r.room);}catch(e){toast(e.message);if($('join-submit'))$('join-submit').disabled=false;}};}
$('join-room').onclick=()=>joinDialog();
function connectRoom(r){localGame=null;soloPaused=false;snapshot=null;gameKey=null;ops=[];lastTurn=-1;ended.clear();room=r;storage.set('lombrix-last-room',r.code);safeHistory(`/?room=${r.code}`);setScreen('lobby');receiveRoom(r);openStream();}
/** Short polling: works through HTTPS tunnels which do not support SSE.
 * Never overlap poll requests; each response is a canonical server snapshot. */
function openStream(){
 if(!room)return;source?.close();connected=false;
 let alive=true,timer=null,lastEvent=0;
 const code=room.code,transport={readyState:0,close(){alive=false;clearTimeout(timer);this.readyState=2;}};source=transport;
 async function poll(){
  if(!alive||source!==transport||!room||room.code!==code)return;
  try{
   const query=new URLSearchParams({key:gameKey||'',ops:String(ops.length),event:String(lastEvent),visible:document.hidden?'0':'1'});
   const packet=await api(`/api/rooms/${code}/sync?${query}`);
   if(!alive||source!==transport)return;
   connected=true;transport.readyState=1;receiveRoom(packet.room);
   if(packet.game){if(packet.game.reset)lastEvent=0;for(const e of packet.game.events)lastEvent=Math.max(lastEvent,e.id);receiveGame(packet.game);}
   refreshHud();
  }catch(error){
   if(!alive||source!==transport)return;connected=false;transport.readyState=0;refreshHud();
   if(!snapshot&&screen==='lobby')$('lobby-hint').textContent='Connexion en attente. '+error.message;
  }
  if(alive&&source===transport)timer=setTimeout(poll,!connected?1500:document.hidden?2500:room?.status==='lobby'?600:90);
 }
 poll();
}
function receiveRoom(r){room=r;if(screen==='lobby')renderLobby();if(r.status==='lobby'&&screen==='battle'){closeDialog();snapshot=null;gameKey=null;setScreen('lobby');renderLobby();}refreshHud();if(dialogKind==='bracket')showBracket();}
function receiveGame(p){if(p.version!==VERSION){source?.close();connected=false;toast('Une nouvelle version du moteur est disponible. Ferme puis rouvre le jeu.');return;}if(p.reset||p.key!==gameKey){ops=[];gameKey=p.key;snapshot=null;lastTurn=-1;weapon='rocket';if(dialogKind==='result'||dialogKind==='bracket')closeDialog();renderer.key=null;}
 if(p.opsFrom!==ops.length){connected=false;openStream();return;}ops.push(...p.ops);snapshot={...p,ops};renderer.setState(snapshot,p.key);if(!(room?.status==='finished'&&screen==='lobby'&&ended.has(p.key)))setScreen('battle');refreshHud();handleEnd();}
function bracketHTML(r){if(!r.rounds.length)return'';return`<div class="bracket">${r.rounds.map((ids,i)=>`<div class="bracket-round"><h4>${ids.length===1?'FINALE':ids.length===2?'DEMI-FINALES':'QUARTS DE FINALE'}</h4>${ids.map(id=>{const m=r.matches.find(m=>m.id===id);if(!m)return'';return`<div class="bracket-match">${m.players.map(p=>`<div class="bracket-player ${m.winner===p?'winner':''}">${esc(r.players.find(x=>x.id===p)?.name||'Joueur')}<span>${m.winner===p?'★':''}</span></div>`).join('')}<small>${m.status==='playing'?'En cours':m.reason==='forfeit'?'Terminé par forfait':m.winner?'Terminé':'Match nul'}</small></div>`;}).join('')}</div>`).join('')}</div>`;}
function showBracket(){if(!room)return;dialog('LE TABLEAU DES HOSTILITÉS',`<h2>${room.kind==='tournament'?'Tournoi privé':'Duel privé'} · ${room.code}</h2><p>${room.champion?`${esc(room.players.find(p=>p.id===room.champion)?.name)} remporte ${room.kind==='tournament'?'le tournoi':'le duel'} !`:room.nextRoundAt?'Le prochain tour se prépare.':'Les vainqueurs rejoignent automatiquement la manche suivante.'}</p>${bracketHTML(room)}<div class="dialog-actions"><button class="primary" id="back-to-game">Retour à la partie</button></div>`,'bracket');$('back-to-game').onclick=closeDialog;}
function renderLobby(){if(!room)return;const r=room,stamp=JSON.stringify(r);if(stamp===lastLobby&&screen==='lobby')return;lastLobby=stamp;$('room-code').textContent=r.code;$('lobby-kind').textContent=r.kind==='tournament'?`TOURNOI PRIVÉ · ${r.capacity} JOUEURS`:'LE CLUB DES MAUVAISES INTENTIONS';$('lobby-title').innerHTML=r.status==='finished'?'Un peu de calme.<br><span>Avant la revanche.</span>':'Le calme avant<br><span>les cratères.</span>';
 const seats=Array.from({length:r.capacity},(_,i)=>{const p=r.players[i];return p?`<div class="player"><div class="player-avatar" style="color:${TEAM_COLORS[i%4]}">${esc(p.name.slice(0,1).toUpperCase())}</div><div><strong>${esc(p.name)}${p.id===r.you?' · toi':''}</strong><small>${p.id===r.hostId?'Créateur du salon · ':''}${p.online?'Connecté':'Connexion en attente'}</small></div><span class="ready-badge">${p.ready?'✓ PRÊT':'EN ATTENTE'}</span></div>`:`<div class="player empty"><div class="player-avatar">＋</div><div><strong>Place libre</strong><small>Un adversaire manque à l’appel.</small></div></div>`;});$('players').innerHTML=seats.join('');const t=THEMES.find(t=>t.id===r.options.theme);$('lobby-options').textContent=`${t?.short||'Univers surprise'} · ${LAYOUTS.find(l=>l.id===r.options.layout)?.name||'Relief surprise'} · ${r.options.worms} vers / équipe · ${worldFor(r.options,r.kind==='tournament'?2:r.capacity).w} × 900 · ${r.options.hp} PV · ${r.options.turnSeconds} s · ${PACES[r.options.pace]?.name||'Classique'}`;
 const me=r.players.find(p=>p.id===r.you),host=r.you===r.hostId;$('ready').hidden=r.status!=='lobby'||host;$('ready').textContent=me?.ready?'✓ Je suis prêt · annuler':'Je suis prêt';$('start-room').hidden=!host||r.status!=='lobby';$('start-room').disabled=r.players.length!==r.capacity||!r.players.every(p=>p.ready&&p.online);$('lobby-hint').textContent=r.status==='finished'?(r.champion?`${r.players.find(p=>p.id===r.champion)?.name} remporte ${r.kind==='tournament'?'le tournoi':'le duel'}.`:'Égalité parfaite. Personne ne veut l’admettre.'):r.players.length<r.capacity?`Encore ${r.capacity-r.players.length} ${r.capacity-r.players.length>1?'joueurs attendus':'joueur attendu'}. Partage le lien d’invitation.`:host?'La bataille démarre quand tous les joueurs sont prêts et connectés.':'Appuie sur « Je suis prêt ». Le créateur lancera la bataille.';
 $('lobby-bracket').innerHTML=bracketHTML(r)+(r.status==='finished'&&host?'<button id="prepare-rematch" class="primary">Préparer la revanche →</button>':'');if($('prepare-rematch'))$('prepare-rematch').onclick=async()=>{try{await roomAction('rematch');}catch(e){toast(e.message);}};
}
$('ready').onclick=async()=>{audioStart();try{await roomAction('ready',{ready:!room.players.find(p=>p.id===room.you)?.ready});}catch(e){toast(e.message);}};
$('start-room').onclick=async()=>{audioStart();try{await roomAction('start');}catch(e){toast(e.message);}};
function inviteURL(){return `${location.origin}/?room=${room.code}`;}
async function copyInvite(){const link=inviteURL();try{await navigator.clipboard.writeText(link);toast('Lien copié. Ton ami l’ouvre sur son propre téléphone.');}catch{dialog('LE LIEN DU DUEL',`<h2>Partage cette invitation.</h2><p>Copie le lien ci-dessous et envoie-le à tes amis.</p><div class="form-grid"><div class="form-field form-wide"><input id="invite-url" readonly value="${esc(link)}"></div></div>`);$('invite-url').select();}}
$('copy-link').onclick=copyInvite;$('share').onclick=async()=>{const data={title:'LOMBRIX · Une petite bataille ?',text:`Rejoins mon ${room.kind==='tournament'?'tournoi':'duel'} LOMBRIX ! Chacun sur son téléphone. Code : ${room.code}`,url:inviteURL()};if(navigator.share){try{await navigator.share(data);}catch(e){if(e.name!=='AbortError')await copyInvite();}}else await copyInvite();};
function leaveDialog(){dialog('ON PLIE BAGAGE ?',`<h2>Quitter ${room?'le salon':'la partie'} ?</h2><p>${room&&room.status==='playing'?'Une absence de plus de 90 secondes entraîne un forfait si un autre joueur reste connecté.':'Tu pourras toujours revenir pour un autre duel.'}</p><div class="dialog-actions"><button class="primary" id="stay">Rester</button><button class="primary danger" id="quit">Quitter</button></div>`);$('stay').onclick=closeDialog;$('quit').onclick=async()=>{saveSolo();if(room)try{await roomAction('leave');}catch{}source?.close();source=null;room=null;localGame=null;snapshot=null;gameKey=null;lastLobby='';connected=false;storage.remove('lombrix-last-room');safeHistory('/');closeDialog();setScreen('home');};}
$('leave-lobby').onclick=leaveDialog;$('lobby-back').onclick=leaveDialog;
/** Un point d’entrée commun pour une partie neuve ou restaurée. */
function adoptSolo(game){
 cancelAimGesture({restore:false});closeArsenal();stopMove();disposeMapPreview();disposeHero();
 source?.close();source=null;room=null;connected=false;ops=[];
 localGame=game;snapshot=game.snapshot();gameKey=`solo-${Date.now()}`;
 renderer.key=null;renderer.setState(snapshot,gameKey);ended.clear();
 lastTurn=-1;aiTurn=-1;aiWait=0;accumulator=0;lastFrame=performance.now();
 soloPaused=false;weapon='rocket';firePending=false;
 renderer.overview=false;renderer.zoom=1;renderer.manualCamera=null;
 $('angle').value=45;$('power').value=50;
 storage.remove('lombrix-last-room');setScreen('battle');refreshHud();safeHistory('/');
}
function startSolo(){
 const game=new Game(options,[name(),'Les Fripouilles']);
 adoptSolo(game);saveSolo();
 if(!storage.get('lombrix-howto')){storage.set('lombrix-howto',true);/* Persistent, non-obstructive aiming hint lives in the panorama caption. */}
}
function myTeam(){return localGame?0:room?.myTeam??-1;}
function canPlay(){return !!snapshot&&snapshot.phase!=='over'&&snapshot.team===myTeam()&&!snapshot.frozenTurn&&(localGame?true:connected&&!room?.pause);}
function canFire(){return canPlay()&&snapshot.phase==='aim'&&!firePending;}
async function command(c){if(!snapshot)return;const moving=c.type==='move';if(localGame){const result=localGame.command(0,c);if(!result.ok&&!moving)toast(result.error);return result;}
 if(!room||!connected){if(!moving)toast('La partie attend la reconnexion.');return;}try{return await roomAction('action',{matchId:gameKey,turn:snapshot.turn,seq:++actionSeq,command:c});}catch(e){if(!moving)toast(e.message);return{ok:false};}}
function setAim(){const angle=-Number($('angle').value)*Math.PI/180,power=Number($('power').value)/100;renderer.aim={...renderer.aim,angle,power,weapon};$('angle-value').textContent=`${$('angle').value}°`;$('power-value').textContent=`${$('power').value} %`; $('power-value').classList.toggle('power-reserve',power>.83);$('aim-tip').textContent=weaponControls(byWeapon[weapon]).hint||(power>.85?'RÉSERVE LONGUE PORTÉE':'Glisse pour viser · éloigne pour charger');}
$('angle').oninput=setAim;$('power').oninput=setAim;
function refreshHud(){if(!snapshot)return;const s=snapshot,turn=s.turn,team=myTeam();if(lastTurn!==turn){closeArsenal();cancelAimGesture({restore:false});lastTurn=turn;if(s.team===team){$('angle').value=s.worms.find(w=>w.id===s.activeId)?.dir===-1?135:45;const w=s.worms.find(w=>w.id===s.activeId);renderer.aim.targetX=clamp((w?.x||800)+(w?.dir||1)*300,20,(s.world?.w||1600)-20);renderer.aim.targetY=450;}stopMove();}
 for(let i=0;i<4;i++){const tag=['a','b','c','d'][i];const panel=$(`team-${tag}-name`).closest('.team-panel');panel.hidden=!s.teams[i];if(!s.teams[i])continue;panel.classList.toggle('active-team',s.team===i);const hp=s.worms.filter(w=>w.team===i).reduce((a,w)=>a+w.hp,0),max=s.options.hp*s.options.worms;$(`team-${tag}-name`).textContent=s.teams[i].name;$(`team-${tag}-hp`).textContent=hp;$(`team-${tag}-bar`).style.width=`${hp/max*100}%`;}
 document.querySelector('.battle-top').classList.toggle('multi-team',s.teams.length>2);
 const active=s.worms.find(w=>w.id===s.activeId);$('timer').textContent=s.phase==='flight'?'•••':s.phase==='over'?'★':Math.ceil(s.time);$('turn-label').textContent=s.frozenTurn?'GELÉ !':s.phase==='over'?'TERMINÉ':s.team===team?'À TOI':'ADVERSAIRE';$('wind').textContent=`VENT ${s.wind>=0?'→':'←'} ${Math.round(Math.abs(s.wind))}`;$('round-info').textContent=`TOUR ${s.turn+1}${s.turn>=20&&s.options.suddenDeath?' · EAUX MONTANTES':''}`;$('connection').textContent=localGame?`SOLO · ${PACES[s.options.pace]?.name.toUpperCase()||'IA'}`:connected?'EN LIGNE':'RECONNEXION';
 if($('battle-level'))$('battle-level').textContent=`${THEMES.find(t=>t.id===s.options.theme)?.short} · ${LAYOUTS.find(l=>l.id===s.options.layout)?.name||'Terrain classique'} · ${s.world?.w||1600} × 900`;
 let ammo=s.teams[team>=0?team:s.team]?.ammo[weapon];if(ammo===0&&s.phase==='aim'){weapon='rocket';ammo=-1;}const def=byWeapon[weapon];$('weapon-glyph').textContent=def.glyph;$('weapon-name').textContent=def.name;$('ammo-count').textContent=ammo<0?'∞':ammo;$('energy').style.width=`${(active?.energy||0)/230*100}%`;
 const play=canPlay(),fire=canFire(),profile=weaponControls(def);
 $('fire').disabled=!fire;$('fire-label').textContent=profile.action;$('fire').classList.toggle('context-action',profile.action!=='FEU !');
 $('fire-icon').textContent=def.target?'◎':def.type==='heal'?'♡':'↗';
 $('fire').setAttribute('aria-label',profile.action+' · '+def.name);
 $('angle').disabled=!fire||!profile.angle;$('power').disabled=!fire||!profile.power;
 $('angle-control').hidden=!profile.angle;$('power-control').hidden=!profile.power;
 $('angle-caption').textContent=profile.direction?'CÔTÉ':'ANGLE';
 $('action-help').hidden=profile.power;$('action-help-title').textContent=def.target?'CIBLE AU DOIGT':profile.direction?'DIRECTION':profile.angle?'PORTÉE FIXE':'ACTION DIRECTE';
 $('action-help-text').textContent=profile.hint||def.desc;
 $('fuse-hint').hidden=!profile.timed;$('fuse-hint').textContent=profile.timed?' · '+fuse+' s':'';for(const id of ['move-left','move-right','jump'])$(id).disabled=!(play&&(s.phase==='aim'||s.retreat>0));$('arsenal').disabled=team<0;renderer.canAim=fire&&!arsenalOpen;setAim();refreshCameraRail();if(arsenalOpen&&!fire)closeArsenal();
 $('spectator-bar').hidden=s.phase==='over'||(play&&s.phase==='aim');$('spectator-bar').textContent=team<0?'Tu regardes une autre manche du tournoi.':s.phase==='flight'?(s.retreat>0?'Vite, éloigne-toi du cadeau !':'On regarde les dégâts…'):localGame?'Les Fripouilles préparent leur sale coup.':`${s.teams[s.team].name} joue. Prépare ta riposte.`;
 const paused=!localGame&&(!connected||room?.pause);$('network-pause').hidden=!paused;if(paused)$('network-pause').innerHTML=!connected?'<strong>Connexion interrompue</strong>Reconnexion automatique… Le serveur conserve le terrain.':`<strong>Une petite pause réseau</strong>${esc(room.pause.names.join(', '))} doit revenir.<br>Forfait dans ${room.pause.seconds} s pour les joueurs absents.`;
}
$('fire').onclick=async()=>{audioStart();closeArsenal();if(!canFire())return;firePending=true;renderer.aimingGesture=false;renderer.manualCamera=null;$('fire').disabled=true;stopMove();const result=await command({type:'fire',weapon,angle:renderer.aim.angle,power:renderer.aim.power,fuse,targetX:renderer.aim.targetX,targetY:renderer.aim.targetY});firePending=false;if(result?.ok){sound.click();closeDialog();}refreshHud();};
function stopMove(){const wasMoving=!!moveDir;moveDir=0;if(moveInterval){clearInterval(moveInterval);moveInterval=null;}if(wasMoving&&snapshot&&canPlay())command({type:'move',dir:0});}
function startMove(dir){if(!canPlay())return;closeArsenal();stopMove();moveDir=dir;command({type:'move',dir});moveInterval=setInterval(()=>{if(moveDir&&canPlay())command({type:'move',dir:moveDir});else stopMove();},100);}
for(const [id,dir]of [['move-left',-1],['move-right',1]]){const b=$(id);b.addEventListener('pointerdown',e=>{e.preventDefault();audioStart();b.setPointerCapture(e.pointerId);startMove(dir);});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>{if(moveDir===dir)stopMove();});}
$('jump').onclick=()=>{closeArsenal();audioStart();command({type:'jump'});};
const pointers=new Map();let pinchStart=null,multiGesture=false,gestureBackup=null;
const gameCanvas=$('game-canvas');
function restoreGesture(){if(gestureBackup){$('angle').value=gestureBackup.angle;$('power').value=gestureBackup.power;renderer.aim.targetX=gestureBackup.targetX;renderer.aim.targetY=gestureBackup.targetY;setAim();}}
/** Les interruptions ne doivent laisser ni doigt fantôme ni caméra figée. */
function cancelAimGesture({restore=true}={}){
 if(!pointers.size){renderer.aimingGesture=false;return;}
 if(restore&&!multiGesture)restoreGesture();
 const ids=[...pointers.keys()];pointers.clear();pinchStart=null;gestureBackup=null;
 multiGesture=false;renderer.aimingGesture=false;
 for(const id of ids)try{if(gameCanvas.hasPointerCapture(id))gameCanvas.releasePointerCapture(id);}catch{}
}
function startPinch(){
 const p=[...pointers.values()];restoreGesture();multiGesture=true;renderer.aimingGesture=false;
 if(renderer.overview){renderer.overview=false;renderer.zoom=clamp(renderer.scale/Math.min(renderer.w/1600,renderer.h/820),.5,2.6);renderer.scale=Math.min(renderer.w/1600,renderer.h/820)*renderer.zoom;}
 pinchStart={distance:Math.max(5,Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)),zoom:renderer.zoom,
  x:(p[0].x+p[1].x)/2-gameCanvas.getBoundingClientRect().left,y:(p[0].y+p[1].y)/2-gameCanvas.getBoundingClientRect().top,camera:{...renderer.camera},scale:renderer.scale};
}
gameCanvas.addEventListener('pointerdown',e=>{
 if($('dialog').open||screen!=='battle'||e.button>0)return;e.preventDefault();if(arsenalOpen){closeArsenal();return;}gameCanvas.setPointerCapture(e.pointerId);
 if(pointers.size===0){multiGesture=false;const shooter=snapshot.worms.find(w=>w.id===snapshot.activeId),origin=renderer.worldToScreen(shooter.x,shooter.y-22);gestureBackup={angle:$('angle').value,power:$('power').value,targetX:renderer.aim.targetX,targetY:renderer.aim.targetY,origin,startDistance:Math.hypot(e.clientX-origin.x,e.clientY-origin.y)};}
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===2)startPinch();else if(pointers.size===1){renderer.aimingGesture=canFire();aimAt(e);}
});
gameCanvas.addEventListener('pointermove',e=>{
 if(!pointers.has(e.pointerId))return;e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size>=2&&pinchStart){
  const p=[...pointers.values()],cx=(p[0].x+p[1].x)/2,cy=(p[0].y+p[1].y)/2;
  const rect=gameCanvas.getBoundingClientRect();
  const next=pinchView(pinchStart,{x:cx-rect.left,y:cy-rect.top,distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)},
   {width:renderer.w,height:renderer.h,worldWidth:renderer.world.w});
  renderer.zoom=next.zoom;renderer.scale=next.scale;
  // Direct manipulation has no follow lag: keep the landmark between the fingers.
  renderer.manualCamera={...next.camera};renderer.camera={...next.camera};
 }else if(!multiGesture)aimAt(e);
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])gameCanvas.addEventListener(type,e=>{
 if(!pointers.has(e.pointerId))return;
 if((type==='pointercancel'||type==='lostpointercapture')&&!multiGesture)restoreGesture();
 if(type==='pointerup'&&!multiGesture)aimAt(e);
 pointers.delete(e.pointerId);
 if(pointers.size<2)pinchStart=null;
 if(pointers.size===0){renderer.aimingGesture=false;gestureBackup=null;multiGesture=false;}
});
function aimAt(e){
 if(!canFire()||$('dialog').open||pointers.size>1||multiGesture)return;
 const p=renderer.screenToWorld(e.clientX,e.clientY),W=snapshot.world?.w||1600;
 renderer.aim.targetX=clamp(p.x,30,W-30);renderer.aim.targetY=clamp(p.y,0,snapshot.water-30);
 const def=byWeapon[weapon],profile=weaponControls(def);
 if(!profile.angle&&!profile.target)return;
 if(!def.target){
  const w=snapshot.worms.find(w=>w.id===snapshot.activeId),origin=renderer.worldToScreen(w.x,w.y-22),dx=e.clientX-origin.x,dy=e.clientY-origin.y;
  if(profile.angle&&Math.hypot(dx,dy)>7){$('angle').value=Math.round(-Math.atan2(dy,dx)*180/Math.PI*2)/2;if(def.speed&&gestureBackup){const b=gestureBackup;const d=Math.hypot(e.clientX-b.origin.x,e.clientY-b.origin.y);$('power').value=Math.round(dragPower(Number(b.power)/100,b.startDistance,d,renderer.powerDragSpan)*100);}}
 }
 setAim();
}
$('zoom-in').onclick=()=>{renderer.overview=false;renderer.manualCamera=null;renderer.zoom=clamp(renderer.zoom+.35,.5,2.6);};
$('zoom-out').onclick=()=>{renderer.overview=false;renderer.zoom=clamp(renderer.zoom-.35,.5,2.6);};
$('zoom-fit').onclick=()=>{renderer.overview=!renderer.overview;renderer.manualCamera=null;renderer.aimingGesture=false;};
// A non-modal belt anchored to the weapon control. The world remains visible.
function weaponIcon(id){
 const rocket='<path d="M8 27L25 10Q30 5 32 8Q35 12 29 17L12 34Z" fill="#afdac8"/><path d="M25 10L29 17L33 9Z" fill="#ffb18c"/><path d="M9 26L4 31L10 30M13 33L8 38L11 31"/><path d="M8 33L3 38" stroke="#ffd087"/>';
 const orb='<circle cx="20" cy="24" r="11" fill="#94bda2"/><path d="M16 12V8H23V13M23 8Q30 3 32 9"/><path d="M13 19L25 29M13 26L24 16" opacity=".4"/>';
 const paths={rocket,grenade:orb,cluster:orb+'<circle cx="6" cy="12" r="3" fill="#ffcc8e"/><circle cx="35" cy="28" r="3" fill="#ffcc8e"/>',
 banana:'<path d="M10 7Q7 26 31 28Q25 38 12 30Q0 22 10 7Z" fill="#ffe08c"/><path d="M10 7L12 3M30 28L34 26"/>',
 mortar:'<path d="M20 8L34 19L30 32L15 36L6 25L10 12Z" fill="#d6aa96"/><path d="M20 8L27 1M13 10L14 2M9 16L2 10" stroke="#ffcb7e"/>',
 bouncer:'<circle cx="20" cy="21" r="14" fill="#cda5dc"/><path d="M8 13Q28 16 31 30M6 26Q21 9 29 11" stroke="#ffe8c4"/>',
 shotgun:'<path d="M6 16H35V23H17L13 34H7L10 23H6Z" fill="#abbbc7"/><path d="M26 15V24M30 15V24"/>',
 laser:'<path d="M4 16H27L32 21L27 26H4Z" fill="#a5d9d4"/><path d="M32 21H40M7 27L10 35H15L17 27" stroke="#b6ffe0"/>',
 dynamite:'<rect x="7" y="14" width="27" height="22" rx="3" fill="#e89595"/><path d="M7 23H34M20 14V36M20 14Q7 0 11 5Q17 3 20 14Q34 1 31 6Q31 11 20 14" stroke="#ffdfa6"/>',
 airstrike:'<path d="M19 3V18L4 27V31L19 27V35L14 38H26L22 34V27L37 31V27L22 18V3Z" fill="#b4d2d8"/>',
 mine:'<path d="M5 29Q5 17 20 17Q35 17 35 29Z" fill="#97afb7"/><circle cx="20" cy="15" r="5" fill="#ff958e"/><path d="M8 33H32"/>',
 drill:'<path d="M5 19L19 5L26 12L12 26Z" fill="#a6b9c9"/><path d="M12 26L35 36L26 12Z" fill="#e5d8ae"/><path d="M16 27L26 18M22 30L29 25M26 32L31 30"/>',
 punch:'<path d="M10 28L7 21Q3 15 8 12Q11 10 13 16V9Q18 3 22 9Q26 5 29 11Q35 9 35 17V25L27 32H12Z" fill="#f2a79d"/><path d="M12 32V37H27V32" fill="#a1e6ca"/>',
 teleport:'<ellipse cx="20" cy="22" rx="14" ry="18" fill="#7c819e"/><ellipse cx="20" cy="22" rx="8" ry="13" fill="#a8ecd6"/><path d="M16 22H24M20 18V26"/>',
 heal:'<rect x="7" y="12" width="28" height="25" rx="5" fill="#c3dcce"/><path d="M15 12V7H27V12M21 19V31M15 25H27" stroke="#e67e8c" stroke-width="4"/>',
 bridge:'<path d="M4 32V12M36 32V12M4 17Q20 35 36 17M4 21H36M12 22V31M20 23V34M28 22V31" stroke="#dfb88d" stroke-width="3"/>',
 freeze:'<path d="M20 3V39M4 12L36 30M4 30L36 12M14 6L20 11L26 6M14 36L20 31L26 36M5 19L12 17L11 9M29 33L28 25L35 24" stroke="#ace5ff" stroke-width="2.5"/>',
 bee:'<ellipse cx="20" cy="23" rx="14" ry="10" fill="#ffe199"/><path d="M15 15V32M24 14V32" stroke="#795969" stroke-width="4"/><ellipse cx="13" cy="11" rx="6" ry="8" fill="#d8f5ff"/><ellipse cx="24" cy="10" rx="6" ry="7" fill="#d8f5ff"/>'};
 return `<svg viewBox="0 0 42 42" aria-hidden="true" fill="none" stroke="#3c425b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[id]||rocket}</svg>`;
}
function closeArsenal(){arsenalOpen=false;$('battle')?.classList.remove('arsenal-is-open');if($('arsenal-belt'))$('arsenal-belt').hidden=true;$('arsenal')?.setAttribute('aria-expanded','false');}
function contextWeaponList(){
 if(arsenalCategory!=='Rapide')return WEAPONS.filter(w=>w.category===arsenalCategory);
 const me=snapshot.worms.find(w=>w.id===snapshot.activeId),nearest=Math.min(...snapshot.worms.filter(w=>w.hp>0&&w.team!==myTeam()).map(w=>Math.hypot(w.x-me.x,w.y-me.y)));
 const ids=[weapon,'rocket',nearest<140?'punch':'grenade',nearest<420?'shotgun':'airstrike',me.hp<me.maxHp*.65?'heal':'teleport','drill','banana'];
 return [...new Set(ids)].map(id=>byWeapon[id]);
}
function renderArsenal(){
 if(!snapshot)return;const ammo=snapshot.teams[Math.max(0,myTeam())].ammo,me=snapshot.worms.find(w=>w.id===snapshot.activeId);
 $('arsenal-context').textContent=`${me.name} · ${me.hp} PV · choix sans pause`;
 $('arsenal-tabs').innerHTML=['Rapide',...new Set(WEAPONS.map(w=>w.category))].map(category=>`<button type="button" data-category="${category}" aria-pressed="${category===arsenalCategory}">${category}</button>`).join('');
 $('arsenal-weapons').innerHTML=contextWeaponList().map(w=>`<button type="button" class="belt-weapon ${weapon===w.id?'selected':''}" data-weapon="${w.id}" aria-label="${esc(w.name)} · ${ammo[w.id]<0?'illimité':ammo[w.id]+' munitions'}" title="${esc(w.desc)}" aria-pressed="${weapon===w.id}" ${ammo[w.id]===0?'disabled':''}>${weaponIcon(w.id)}<span>${esc(w.name)}</span><b>${ammo[w.id]<0?'∞':ammo[w.id]}</b></button>`).join('');
 $('weapon-description').textContent=byWeapon[weapon].desc;
 $('arsenal-fuse').hidden=!['timed','cluster','banana','bouncy'].includes(byWeapon[weapon].type);
 $('arsenal-fuse').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.fuse===fuse)));
 $('arsenal-tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{arsenalCategory=b.dataset.category;renderArsenal();});
 $('arsenal-weapons').querySelectorAll('button').forEach(b=>b.onclick=()=>{weapon=b.dataset.weapon;sound.click();closeArsenal();refreshHud();});
}
function arsenalDialog(){
 if(!canFire())return;cancelAimGesture();stopMove();arsenalOpen=!arsenalOpen;$('battle').classList.toggle('arsenal-is-open',arsenalOpen);$('arsenal-belt').hidden=!arsenalOpen;$('arsenal').setAttribute('aria-expanded',String(arsenalOpen));
 if(arsenalOpen){$('toast').hidden=true;arsenalCategory='Rapide';renderArsenal();}refreshHud();
}
$('arsenal').onclick=arsenalDialog;$('arsenal-close').onclick=()=>{closeArsenal();refreshHud();};
$('arsenal-fuse').querySelectorAll('button').forEach(b=>b.onclick=()=>{fuse=+b.dataset.fuse;renderArsenal();});
// Horizontal exploration never changes aim, selected worm or zoom.
function refreshCameraRail(){
 if(!snapshot||!renderer.scale)return;const active=snapshot.worms.find(w=>w.id===snapshot.activeId),point=active?renderer.worldToScreen(active.x,active.y-22):{x:0,y:0};$('game-canvas').dataset.view=JSON.stringify({x:renderer.camera.x,y:renderer.camera.y,zoom:renderer.zoom,scale:renderer.scale,aimX:point.x,aimY:point.y,deaths:renderer.deathRituals.size,active:snapshot.activeId});const rail=$('camera-range'),W=renderer.world.w,metrics=cameraRailMetrics(W,renderer.w,renderer.scale);
 rail.disabled=metrics.span<1;const center=clamp(renderer.camera.x,metrics.min,metrics.max);
 if(railPointer===null)rail.value=metrics.span?Math.round((center-metrics.min)/metrics.span*1000):500;
 rail.setAttribute('aria-valuetext',Math.round(center)+' sur '+W+' unités');
 const thumb=$('camera-window');thumb.style.width=metrics.fraction*100+'%';thumb.style.left=(center/W-metrics.fraction/2)*100+'%';
 // Keep the marker nodes; rebuilding them 12 times/s caused unnecessary DOM churn.
 const living=new Set();
 for(const w of snapshot.worms){if(w.hp<=0)continue;living.add(w.id);
  let marker=railMarkers.get(w.id);if(!marker){marker=document.createElement('i');marker.dataset.wormMarker=String(w.id);$('camera-markers').append(marker);railMarkers.set(w.id,marker);}
  const left=(w.x/W*100).toFixed(3)+'%';if(marker.style.left!==left)marker.style.left=left;
  marker.style.setProperty('--team',TEAM_COLORS[w.team]);marker.classList.toggle('active',w.id===snapshot.activeId);
  marker.title=w.name+' · '+w.hp+' PV';
 }
 for(const [id,marker] of railMarkers)if(!living.has(id)){marker.remove();railMarkers.delete(id);}
 if(railWorldWidth!==W){railWorldWidth=W;$('camera-ticks').innerHTML=Array.from({length:7},(_,i)=>`<span style="left:${i/6*100}%">${Math.round(W*i/6)}</span>`).join('');}
 if(cacheStamp!==gameKey){cacheStamp=gameKey;$('game-canvas').dataset.cache=JSON.stringify(renderer.cacheMetrics());}
 $('camera-follow').setAttribute('aria-pressed',String(!renderer.manualCamera));$('camera-mode').textContent=renderer.manualCamera?'EXPLORATION':'SUIVI';
 $('camera-strip').classList.toggle('exploring',!!renderer.manualCamera);
}
function panRail(){
 cancelAimGesture();closeArsenal();if(renderer.overview){renderer.overview=false;renderer.zoom=1;renderer.scale=Math.min(renderer.w/1600,renderer.h/820);}
 const m=cameraRailMetrics(renderer.world.w,renderer.w,renderer.scale),x=m.min+Number($('camera-range').value)/1000*m.span;
 renderer.manualCamera={x,y:renderer.camera.y};renderer.camera.x=x;refreshCameraRail();
}
$('camera-range').addEventListener('input',panRail);
$('camera-range').addEventListener('pointerdown',e=>{railPointer=e.pointerId;cancelAimGesture();stopMove();});
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('camera-range').addEventListener(type,()=>railPointer=null);
$('camera-follow').onclick=()=>{cancelAimGesture();renderer.overview=false;renderer.manualCamera=null;refreshCameraRail();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&arsenalOpen){closeArsenal();refreshHud();$('arsenal').focus();}});
function settingsDialog(){dialog('QUELQUES RÉGLAGES',`<h2>Chacun son petit confort.</h2><div class="setting-row"><div>Bruitages<small>Explosions, sauts et petits sons absurdes.</small></div><button id="sound-toggle" class="toggle ${sound.enabled?'on':''}">${sound.enabled?'Activés':'Coupés'}</button></div><div class="setting-row"><div>Musique légère<small>Une boucle synthétique originale, discrète.</small></div><button id="music-toggle" class="toggle ${sound.music?'on':''}">${sound.music?'Activée':'Coupée'}</button></div><p class="input-note">Le son est activé par un geste sur l’écran. Vérifie le volume de l’iPhone. Les préférences de réduction des animations sont respectées.</p><div class="dialog-actions"><button class="primary" id="settings-done">C’est parfait</button></div>`,'settings');$('sound-toggle').onclick=async()=>{sound.enabled=!sound.enabled;storage.set('lombrix-sound',sound.enabled);audioStart();settingsDialog();sound.click();};$('music-toggle').onclick=async()=>{audioStart();sound.setMusic(!sound.music);storage.set('lombrix-music',sound.music);settingsDialog();};const q=document.createElement('div');q.className='form-field';q.innerHTML=selectField('render-quality','QUALITÉ GRAPHIQUE', [['hd','Haute définition'],['balanced','Équilibrée · effets réduits']],renderer.quality);$('settings-done').parentElement.before(q);$('render-quality').onchange=()=>{renderer.quality=$('render-quality').value;renderer.resize();storage.set('lombrix-quality',renderer.quality);};$('settings-done').onclick=closeDialog;}
$('settings').onclick=settingsDialog;
function helpDialog(){dialog('UNE BATAILLE, PAS UN MODE D’EMPLOI',`<h2>Le mauvais esprit en 4 gestes.</h2><div class="rules-grid"><div class="rule"><strong>01 · Bouge un peu.</strong><p>◀ et ▶ pour marcher, ↟ pour sauter. La petite barre verte représente ta réserve de mouvement.</p></div><div class="rule"><strong>02 · Choisis ton arme.</strong><p>Touche l’arme actuelle : sa ceinture apparaît au-dessus des commandes, sans pause. Un appui équipe. Les catégories donnent accès aux 18 armes ; la sélection rapide dépend de la distance à l’ennemi et de ta santé.</p></div><div class="rule"><strong>03 · Trouve le bon angle.</strong><p>La direction règle l’angle sur 360°, même vers le bas. Poser le doigt conserve la puissance ; éloigne-le pour charger, rapproche-le pour réduire. Au bord de l’écran, relève et reprends le geste : la charge reste acquise. La barre graduée parcourt le terrain sans dézoomer ; ses points colorés repèrent les vers. ◎ recentre. Deux doigts déplacent et zooment la vue.</p></div><div class="rule"><strong>04 · FEU !</strong><p>Relâcher le doigt ne tire pas : confirme avec FEU. La réserve haute puissance porte loin. Les vers se bousculent, même entre alliés : attention aux chutes en chaîne.</p></div></div><p>Après un piège, tu as 3 secondes pour t’éloigner. Le tir ami est actif. À partir du 21e tour, l’eau monte si l’option est activée.</p><p class="input-note">Sur ordinateur : flèches gauche/droite = marcher · Espace = sauter · Entrée = tirer · E = arsenal. En ligne, chacun utilise son propre appareil ; le chronomètre continue pendant l’ouverture des menus.</p><div class="dialog-actions"><button class="primary" id="help-done">Même pas peur →</button></div>`,'help');$('help-done').onclick=closeDialog;}
$('help').onclick=helpDialog;
function installDialog(){dialog('UN VRAI RACCOURCI SUR TON IPHONE',`<h2>Les vers prennent leurs quartiers.</h2><p>Ouvre l’adresse du jeu dans <strong>Safari</strong>, puis le menu <strong>Partager</strong> et <strong>Sur l’écran d’accueil</strong>. Laisse « Ouvrir comme app web » activé lorsque cette option est proposée.</p><div class="rules-grid"><div class="rule"><strong>Pour le solo</strong><p>Après un premier chargement complet en HTTPS, le jeu met ses fichiers en cache pour jouer sans réseau.</p></div><div class="rule"><strong>Pour les amis</strong><p>Une connexion internet reste nécessaire. Chaque joueur ouvre le même lien de salon, depuis son iPhone.</p></div></div><p class="input-note">En version de développement, une adresse locale du Mac n’est pas accessible à un ami à distance. Le serveur doit être hébergé sur une adresse HTTPS publique.</p><div class="dialog-actions"><button class="primary" id="install-done">Compris</button></div>`,'install');$('install-done').onclick=closeDialog;}
$('install-help').onclick=installDialog;
function selectWormDialog(){
 if(!canFire()){toast('Tu choisiras ton ver au début de ton tour.');return;}
 const living=snapshot.worms.filter(w=>w.hp>0&&w.team===myTeam());
 dialog('ÉQUIPE DE CHOC','<h2>Qui prend les commandes ?</h2><p>Le choix est possible avant tout déplacement.</p><div class="menu-list">'+living.map(w=>`<button data-select-worm="${w.id}" ${w.frozen?'disabled':''}>${esc(w.name)} · ${w.hp} PV${w.id===snapshot.activeId?' · actif':''}</button>`).join('')+'</div>','select');
 document.querySelectorAll('[data-select-worm]').forEach(b=>b.onclick=async()=>{const result=await command({type:'select',wormId:Number(b.dataset.selectWorm)});if(result?.ok)closeDialog();});
}
$('game-menu').onclick=()=>{dialog('PETITE PAUSE ENTRE DEUX CRATÈRES',`<h2>${localGame?'Partie en pause.':'La bataille continue.'}</h2><p>${localGame?'Prends ton temps, les Fripouilles aussi.':'En ligne, le tour continue pendant les menus. Chacun reste maître de son équipe.'}</p><div class="menu-list"><button id="menu-resume">↗ Reprendre la bataille</button><button id="menu-select">◎ Choisir mon ver</button>${localGame?'<button id="menu-new-level">↻ Nouveau terrain et règles</button>':''}<button id="menu-level-code">◇ Code de ce terrain</button><button id="menu-skip">→ Passer mon tour</button>${room?'<button id="menu-bracket">♜ Voir le tableau du salon</button>':''}<button id="menu-help">? Comment jouer</button><button id="menu-sound">♫ Son et musique</button><button id="menu-quit" class="danger">Quitter la partie</button></div>`,'menu');$('menu-resume').onclick=closeDialog;if($('menu-new-level'))$('menu-new-level').onclick=()=>configure('solo');$('menu-level-code').onclick=()=>{dialog('TERRAIN REPRODUCTIBLE',`<h2>Le même champ de bataille.</h2><p>Copie ce code et charge-le dans la fabrique à batailles.</p><input class="level-code-readonly" id="current-level-code" readonly value="${esc(levelCode(snapshot.options))}">`,'code');$('current-level-code').select();};$('menu-select').onclick=selectWormDialog;$('menu-skip').onclick=()=>{if(!canFire()){toast('Tu pourras passer quand ce sera ton tour.');return;}command({type:'skip'});closeDialog();};if($('menu-bracket'))$('menu-bracket').onclick=showBracket;$('menu-help').onclick=helpDialog;$('menu-sound').onclick=settingsDialog;$('menu-quit').onclick=leaveDialog;};
function handleEnd(){if(!snapshot||snapshot.phase!=='over'||renderer.hasDeathRituals()||ended.has(gameKey))return;ended.add(gameKey);stopMove();if(localGame)storage.remove('lombrix-saved-solo');const s=snapshot,won=s.winner===myTeam(),draw=s.winner===-1,champion=room?.status==='finished'&&room.champion?room.players.find(p=>p.id===room.champion)?.name:null;dialog('LES POUSSIÈRES RETOMBENT',`<div class="winner-art">${draw?'☯':won?'♜':'✦'}</div><h2 class="center">${champion?`${esc(champion)} remporte ${room.kind==='tournament'?'le tournoi':'le duel'} !`:draw?'Tout le monde a perdu.':won?'Victoire sans modestie !':'Une défaite très injuste.'}</h2><p class="center">${draw?'C’est une autre façon de faire la paix.':won?'Tes vers réclament une statue. Et un goûter.':'Le vent, sûrement. Ou la gravité. Absolument pas toi.'}</p><div class="result-score">${s.teams.map((t,i)=>`<div style="color:${TEAM_COLORS[i]}">${esc(t.name)}<b>${s.worms.filter(w=>w.team===i).reduce((n,w)=>n+w.hp,0)} PV</b></div>`).join('')}</div>${room&&room.status!=='finished'?'<p>Le tournoi continue. La prochaine manche sera ouverte automatiquement quand les duels de ce tour seront terminés.</p>':''}<div class="dialog-actions"><button class="primary" id="result-action">${localGame?'Nouveau terrain !':room?.status==='finished'?'Retour au salon':'Voir le tableau'} →</button>${localGame?'<button class="secondary-button" id="same-level">Rejouer ce terrain</button>':''}</div>`,'result');$('result-action').onclick=()=>{closeDialog();if(localGame){options.seed=newSeed();startSolo();}else if(room.status==='finished'){setScreen('lobby');lastLobby='';renderLobby();}else showBracket();};if($('same-level'))$('same-level').onclick=()=>{closeDialog();startSolo();};if(won){sound.tone(523,.2,'sine',.2);sound.tone(659,.2,'sine',.2,null,.18);sound.tone(784,.4,'sine',.2,null,.36);}}
renderer.onEvent=e=>{sound.play(e);if(e.type==='turn'&&screen==='battle')banner(e.frozen?`${e.name} a oublié sa polaire.`:e.team===myTeam()?`À toi, ${e.name} !`:`${e.name} prépare un sale coup.`);if(e.type==='sudden')toast('L’eau monte. Il va falloir conclure.');};
document.addEventListener('keydown',e=>{if(screen!=='battle'||$('dialog').open||e.repeat||e.target.matches('input,select,textarea'))return;if(['ArrowLeft','ArrowRight',' ','Enter'].includes(e.key))e.preventDefault();if(e.key==='ArrowLeft')startMove(-1);if(e.key==='ArrowRight')startMove(1);if(e.key===' ')command({type:'jump'});if(e.key==='Enter')$('fire').click();if(e.key.toLowerCase()==='e')arsenalDialog();});
document.addEventListener('keyup',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight')stopMove();});
window.addEventListener('blur',()=>{closeArsenal();railPointer=null;cancelAimGesture();stopMove();saveSolo();if(localGame)soloPaused=true;});window.addEventListener('focus',()=>{if(localGame&&!$('dialog').open)soloPaused=false;});
window.addEventListener('resize',()=>{closeArsenal();railPointer=null;cancelAimGesture();});
document.addEventListener('visibilitychange',()=>{closeArsenal();railPointer=null;cancelAimGesture();stopMove();const visible=document.visibilityState==='visible';if(localGame)soloPaused=!visible||$('dialog').open;if(room)fetch(`/api/rooms/${room.code}/presence`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({visible}),keepalive:true}).catch(()=>{});if(!visible)saveSolo();if(visible){if(screen==='battle'){wakeLock=null;keepAwake();}sound.unlock();if(room)openStream();}else{wakeLock=null;}});
window.addEventListener('offline',()=>{connected=false;refreshHud();});window.addEventListener('online',()=>{if(room)openStream();});
function animate(now){const dt=Math.min(.1,(now-lastFrame)/1000);lastFrame=now;
 if(screen==='battle'){
  if(localGame&&!soloPaused&&!document.hidden){accumulator+=dt;while(accumulator>=1/60){localGame.tick(1/60);accumulator-=1/60;}
   if(localGame.team===1&&localGame.phase==='aim'&&!localGame.frozenTurn){if(aiTurn!==localGame.turn){aiTurn=localGame.turn;aiWait=localGame.pace.ai;}aiWait-=dt;if(aiWait<=0){localGame.command(1,chooseAI(localGame));aiWait=100;}}
   snapshot=localGame.snapshot();renderer.setState(snapshot,gameKey);handleEnd();if(now-lastSoloSave>2500){lastSoloSave=now;saveSolo();}
  }
  renderer.draw(now,dt);handleEnd();if(now>nextHud){refreshHud();nextHud=now+80;}
 }
 requestAnimationFrame(animate);
}
function saveSolo(){if(localGame&&localGame.phase!=='over')storage.set('lombrix-saved-solo',localGame.exportState());}
function refreshSoloResume(){
 const saved=storage.get('lombrix-saved-solo');let button=$('resume-solo');
 if(!saved||saved.state?.phase==='over'){button?.remove();return;}
 if(!button){button=document.createElement('button');button.id='resume-solo';button.className='quiet';$('solo').parentElement.after(button);}
 button.textContent='↗ Reprendre ma partie solo';
 button.onclick=()=>{
  // Relire au clic : une partie a pu être jouée et sauvegardée depuis l’accueil.
  try{
   const current=storage.get('lombrix-saved-solo');
   if(!current)throw new Error('Sauvegarde absente');
   const game=Game.fromState(current);
   if(game.phase==='over')throw new Error('Partie terminée');
   audioStart();closeDialog();options=cleanOptions(game.options);adoptSolo(game);
  }catch(error){storage.remove('lombrix-saved-solo');refreshSoloResume();toast('Sauvegarde indisponible. Tu peux lancer une nouvelle partie.');}
 };
}
refreshSoloResume();
window.addEventListener('pagehide',saveSolo);
requestAnimationFrame(animate);
window.LombrixBoot?.ready();
if('serviceWorker'in navigator&&window.isSecureContext){navigator.serviceWorker.register('/sw.js').catch(()=>{});}
(async()=>{const explicit=new URLSearchParams(location.search).get('room');const code=String(explicit||storage.get('lombrix-last-room','')).toUpperCase();if(!code||!/^[A-Z2-9]{6}$/.test(code))return;try{const r=await api(`/api/rooms/${code}`);connectRoom(r.room);}catch{if(explicit)joinDialog(code);else storage.remove('lombrix-last-room');}})();
