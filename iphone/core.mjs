/** Same LOMBRIX 0.5.1 room rules, with a Fetch adapter instead of Node HTTP. */
import {Game,cleanOptions,THEMES,VERSION} from './site/engine.js';
const randomUUID=()=>crypto.randomUUID();
function randomBytes(n){const data=crypto.getRandomValues(new Uint8Array(n));data.readUInt32LE=()=>new DataView(data.buffer).getUint32(0,true);data.toString=encoding=>encoding==='hex'?Array.from(data,b=>b.toString(16).padStart(2,'0')).join(''):String(data);return data;}
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code=()=>Array.from(randomBytes(6),b=>ALPHABET[b%ALPHABET.length]).join('');
const nick=v=>String(v||'').replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,22)||'Capitaine';
const cookieName=c=>`lombrix_${c}`;
const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(s=>s.trim().split('=')));
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
class APIError extends Error {constructor(status,message){super(message);this.status=status;}}
function json(res,status,data,headers={}) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));}
async function body(req) {
  if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new APIError(415,'Format JSON requis.');
  if(Number(req.headers['content-length']||0)>8192)throw new APIError(413,'Message trop volumineux.');
  const chunks=[];let size=0;const reader=req.raw.body?.getReader();
  if(reader)for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();throw new APIError(413,'Message trop volumineux.');}chunks.push(value);}
  const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
  try{const d=JSON.parse(new TextDecoder().decode(all)||'{}');if(!d||Array.isArray(d)||typeof d!=='object')throw 0;return d;}catch{throw new APIError(400,'Message JSON invalide.');}
}

export function createApp({autotick=true,graceMs=90000,maxRooms=20,dataFile=null}={}) {
  const rooms=new Map(),limits=new Map();let clock=0;
  function saveNow() {} // Durable storage belongs to the enclosing actor.
  const saveTimer=null;

  function rate(key,max=90,period=60000){const now=Date.now();let l=limits.get(key);if(!l||now-l.at>period){l={at:now,n:0};limits.set(key,l);}if(++l.n>max)throw new APIError(429,'Un peu trop de demandes. Réessaie dans un instant.');}
  function player(name) {return{id:randomUUID(),token:randomBytes(32).toString('hex'),name:nick(name),ready:false,peers:new Set(),visible:true,pollSeen:0,lastSeq:0,seen:Date.now()};}
  function setCookie(req,res,r,p){const secure=!!req.socket.encrypted||req.headers['x-forwarded-proto']==='https';res.setHeader('Set-Cookie',`${cookieName(r.code)}=${p.token}; HttpOnly; SameSite=Lax; Path=/api/rooms/${r.code}; Max-Age=604800${secure?'; Secure':''}`);}
  function auth(req,r){const t=cookies(req)[cookieName(r.code)];const p=r.players.find(p=>equal(t,p.token));if(!p)throw new APIError(401,'Rejoins ce salon pour continuer.');p.seen=Date.now();r.touched=Date.now();return p;}
  const online=p=>!!p&&p.visible&&(p.peers.size>0||Date.now()-(p.pollSeen||0)<5000);
  function round(r,ids){
    const groups=r.kind==='tournament'?Array.from({length:ids.length/2},(_,i)=>ids.slice(i*2,i*2+2)):[ids];
    const list=[];
    for(const members of groups){
      const opts={...r.options,seed:r.rounds.length===0?r.options.seed:randomBytes(4).readUInt32LE()};
      if(r.kind==='tournament'&&r.rounds.length>0&&r.options.theme!=='random')opts.theme=THEMES[(THEMES.findIndex(t=>t.id===r.options.theme)+r.rounds.length)%THEMES.length].id;
      const m={id:randomUUID(),round:r.rounds.length,players:members,game:new Game(opts,members.map(id=>r.players.find(p=>p.id===id).name)),status:'playing',winner:null,reason:null,missing:new Map(),pause:null,finishedAt:null};
      r.matches.push(m);list.push(m.id);
    }
    r.rounds.push(list);
  }
  function start(r){r.matches=[];r.rounds=[];r.champion=null;r.status='playing';r.nextRoundAt=null;const ids=r.players.map(p=>p.id); // Mélange cryptographique des têtes de série.
    for(let i=ids.length-1;i>0;i--){const j=randomBytes(4).readUInt32LE()%(i+1);[ids[i],ids[j]]=[ids[j],ids[i]];}round(r,ids);}
  function viewedMatch(r,p){return r.matches.find(m=>m.status==='playing'&&m.players.includes(p.id))||r.matches.find(m=>m.players.includes(p.id)&&m.finishedAt&&Date.now()-m.finishedAt<4500)||r.matches.find(m=>m.status==='playing')||r.matches.at(-1)||null;}
  function roomView(r,p){const match=viewedMatch(r,p);return{code:r.code,kind:r.kind,capacity:r.capacity,status:r.status,options:r.options,hostId:r.hostId,you:p.id,players:r.players.map(q=>({id:q.id,name:q.name,ready:q.ready,online:online(q)})),rounds:r.rounds,matches:r.matches.map(m=>({id:m.id,round:m.round,players:m.players,status:m.status,winner:m.winner,reason:m.reason})),champion:r.champion,matchId:match?.id||null,myTeam:match?match.players.indexOf(p.id):-1,pause:match?.pause||null,nextRoundAt:r.nextRoundAt};}
  function event(peer,name,data){if(peer.res.destroyed)return;if(peer.res.writableLength>1024*1024){peer.res.destroy();return;}peer.res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);}
  function send(r,p,peer,full=false){const v=roomView(r,p),view=JSON.stringify(v);if(full||view!==peer.view){event(peer,'room',v);peer.view=view;}
    const m=viewedMatch(r,p);if(!m)return;const reset=full||peer.match!==m.id;if(reset){peer.ops=0;peer.events=0;peer.match=m.id;}
    const {ops,events,...s}=m.game.snapshot();const packet={...s,key:m.id,reset,opsFrom:peer.ops,ops:ops.slice(peer.ops),opsCount:ops.length,events:events.filter(e=>e.id>peer.events)};event(peer,'game',packet);peer.ops=ops.length;peer.events=m.game.eventId;
  }
  function broadcast(r){for(const p of r.players)for(const peer of p.peers)send(r,p,peer);}
  function finish(r,m,winner,reason=null){m.status='finished';m.winner=winner;m.reason=reason;m.finishedAt=Date.now();m.pause=null;}
  function advance(now=Date.now(),dt=1/60){clock++;
    for(const [key,r]of rooms){if(now-r.touched>2*60*60*1000&&!r.players.some(online)){for(const p of r.players)for(const peer of p.peers)peer.res.end();rooms.delete(key);continue;}
      if(r.status!=='playing')continue;
      for(const m of r.matches){if(m.status!=='playing')continue;const missing=m.players.filter((id,team)=>m.game.worms.some(w=>w.team===team&&w.hp>0)&&!online(r.players.find(p=>p.id===id)));
        for(const id of m.players)if(!missing.includes(id))m.missing.delete(id);
        for(const id of missing)if(!m.missing.has(id))m.missing.set(id,now);
        if(missing.length){const first=Math.min(...m.missing.values()),left=Math.max(0,Math.ceil((graceMs-(now-first))/1000));m.pause={names:missing.map(id=>r.players.find(p=>p.id===id).name),seconds:left};
          if(now-first>graceMs&&m.players.some(id=>!missing.includes(id)&&online(r.players.find(p=>p.id===id)))){
            for(const id of missing){const team=m.players.indexOf(id);m.game.worms.filter(w=>w.team===team).forEach(w=>w.hp=0);m.missing.delete(id);}
            m.pause=null;
            if(m.game.checkWinner())finish(r,m,m.game.winner<0?null:m.players[m.game.winner],'forfeit');
          }continue;
        }
        m.pause=null;m.game.tick(dt);
        if(m.game.phase==='over'){
          if(m.game.winner===-1&&r.kind==='tournament'){m.game=new Game({...r.options,seed:randomBytes(4).readUInt32LE()},m.players.map(id=>r.players.find(p=>p.id===id).name));m.id=randomUUID();r.rounds[m.round]=r.matches.filter(x=>x.round===m.round).map(x=>x.id);for(const p of r.players)for(const peer of p.peers)peer.match=null;}
          else finish(r,m,m.game.winner===-1?null:m.players[m.game.winner]);
        }
      }
      const current=r.matches.filter(m=>m.round===r.rounds.length-1);
      if(current.length&&current.every(m=>m.status==='finished')){
        if(current.length===1){r.champion=current[0].winner;r.status='finished';}
        else if(!r.nextRoundAt)r.nextRoundAt=now+5000;
        else if(now>=r.nextRoundAt){round(r,current.map(m=>m.winner));r.nextRoundAt=null;}
      }
    }
    if(clock%5===0)for(const r of rooms.values())broadcast(r);
    if(clock%600===0){for(const r of rooms.values())for(const p of r.players)for(const peer of p.peers)peer.res.write(': heartbeat\n\n');for(const [k,v]of limits)if(now-v.at>120000)limits.delete(k);}
  }
  const server={handler:async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; worker-src 'self'");
    try{
      const url=new URL(req.url,'http://localhost'),pathname=url.pathname;
      if(pathname==='/health')return json(res,200,{ok:true,service:'LOMBRIX',version:VERSION});
      if(pathname.startsWith('/api/')){
        const origin=req.headers.origin;if(origin&&new URL(origin).host!==req.headers.host)throw new APIError(403,'Origine non autorisée.');
        const ip=req.socket.remoteAddress; // Pas de confiance aveugle dans X-Forwarded-For.
        if(pathname==='/api/rooms'&&req.method==='POST'){
          rate(`create:${ip}`,15);if(rooms.size>=maxRooms)throw new APIError(503,'Tous les salons sont occupés. Réessaie plus tard.');const d=await body(req);const p=player(d.name);p.ready=true;let c;do{c=code();}while(rooms.has(c));const r={code:c,kind:d.kind==='tournament'?'tournament':'duel',capacity:d.kind==='tournament'?(d.capacity===8?8:4):([2,3,4].includes(Number(d.capacity))?Number(d.capacity):2),options:cleanOptions(d.options||{}),players:[p],hostId:p.id,status:'lobby',matches:[],rounds:[],champion:null,touched:Date.now(),nextRoundAt:null};rooms.set(c,r);setCookie(req,res,r,p);return json(res,201,{room:roomView(r,p)});
        }
        const found=pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})(?:\/(join|events|sync|ready|start|action|presence|rematch|leave))?$/);if(!found)throw new APIError(404,'Chemin inconnu.');const r=rooms.get(found[1]);if(!r)throw new APIError(404,'Ce salon a expiré ou ce code est incorrect.');const action=found[2];
        if(action==='join'&&req.method==='POST'){
          rate(`join:${ip}`,80);const d=await body(req),token=cookies(req)[cookieName(r.code)];let p=r.players.find(p=>equal(token,p.token));if(!p){if(r.status!=='lobby')throw new APIError(409,'La partie a déjà commencé.');if(r.players.length>=r.capacity)throw new APIError(409,'Ce salon est complet.');p=player(d.name);r.players.push(p);}r.touched=Date.now();setCookie(req,res,r,p);broadcast(r);return json(res,200,{room:roomView(r,p)});
        }
        const p=auth(req,r);
        if(action==='sync'&&req.method==='GET'){
          rate(`sync:${p.id}`,25,1000);p.pollSeen=Date.now();p.visible=url.searchParams.get('visible')!=='0';
          const m=viewedMatch(r,p);let packet=null;
          if(m){
            const s=m.game.snapshot();
            const knownKey=url.searchParams.get('key'),requested=Number(url.searchParams.get('ops'));
            const reset=knownKey!==m.id||!Number.isSafeInteger(requested)||requested<0||requested>s.ops.length;
            const from=reset?0:requested,seenEvent=reset?0:Math.max(0,Number(url.searchParams.get('event'))||0);
            packet={...s,key:m.id,reset,opsFrom:from,ops:s.ops.slice(from),opsCount:s.ops.length,events:s.events.filter(e=>e.id>seenEvent)};
          }
          return json(res,200,{room:roomView(r,p),game:packet,serverNow:Date.now()});
        }
        if(action==='events'&&req.method==='GET'){
          if(p.peers.size>=2){const old=p.peers.values().next().value;event(old,'replaced',{});old.res.end();p.peers.delete(old);}
          res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();res.write('retry: 1500\n\n');req.socket.setTimeout(0);p.visible=true;const peer={res,ops:0,events:0,match:null,view:null};p.peers.add(peer);send(r,p,peer,true);broadcast(r);req.on('close',()=>{p.peers.delete(peer);broadcast(r);});return;
        }
        if(!action&&req.method==='GET')return json(res,200,{room:roomView(r,p)});
        if(req.method!=='POST')throw new APIError(405,'Méthode non autorisée.');rate(`player:${p.id}`,45,1000);const d=await body(req);
        if(action==='ready'){if(r.status!=='lobby')throw new APIError(409,'Partie déjà commencée.');p.ready=d.ready!==false;}
        else if(action==='start'){if(p.id!==r.hostId)throw new APIError(403,'Seul le créateur peut lancer.');if(r.status!=='lobby')throw new APIError(409,'Partie déjà commencée.');if(r.players.length!==r.capacity||!r.players.every(p=>p.ready))throw new APIError(409,'Tous les joueurs doivent être présents et prêts.');start(r);}
        else if(action==='rematch'){if(p.id!==r.hostId||r.status!=='finished')throw new APIError(403,'La revanche sera disponible à la fin pour le créateur.');r.status='lobby';r.options.seed=randomBytes(4).readUInt32LE();r.matches=[];r.rounds=[];r.champion=null;r.players.forEach(q=>q.ready=q.id===r.hostId);}
        else if(action==='presence'){p.visible=d.visible!==false;}
        else if(action==='action'){
          const m=r.matches.find(m=>m.id===d.matchId&&m.status==='playing');if(!m||!m.players.includes(p.id))throw new APIError(403,'Tu ne joues pas dans cette manche.');if(m.pause||m.players.some((id,team)=>m.game.worms.some(w=>w.team===team&&w.hp>0)&&!online(r.players.find(q=>q.id===id))))throw new APIError(409,'Partie en pause : reconnexion en cours.');if(d.turn!==m.game.turn)throw new APIError(409,'Ce tour est terminé.');if(!Number.isSafeInteger(d.seq)||d.seq<=p.lastSeq)throw new APIError(409,'Commande ancienne ou déjà reçue.');const c=d.command;if(!c||typeof c!=='object'||Array.isArray(c))throw new APIError(400,'Commande invalide.');const result=m.game.command(m.players.indexOf(p.id),c);if(!result.ok)throw new APIError(409,result.error);p.lastSeq=d.seq;return json(res,200,{ok:true});
        }
        else if(action==='leave'){
          for(const peer of p.peers){event(peer,'left',{});peer.res.end();}p.peers.clear();p.visible=false;p.pollSeen=0;
          if(r.status==='lobby'){r.players=r.players.filter(q=>q.id!==p.id);if(r.hostId===p.id){r.hostId=r.players[0]?.id;if(r.players[0])r.players[0].ready=true;}if(!r.players.length)rooms.delete(r.code);}
        }
        else throw new APIError(404,'Action inconnue.');broadcast(r);return json(res,200,{ok:true,room:roomView(r,p)});
      }
      throw new APIError(404,'Chemin inconnu.');
    }catch(e){if(res.headersSent){res.end();return;}if(!e.status)console.error(e);json(res,e.status||500,{error:e.status?e.message:'Le serveur a rencontré une erreur.'});}
  },closeAllConnections(){},close(done){done?.();}};
  let last=performance.now(),acc=0;
  const timer=autotick?setInterval(()=>{const now=performance.now();acc+=Math.min(.25,(now-last)/1000);last=now;while(acc>=1/60){advance(Date.now(),1/60);acc-=1/60;}},1000/60):null;
  server.keepAliveTimeout=65000;server.headersTimeout=70000;
  function close(){if(timer)clearInterval(timer);if(saveTimer)clearInterval(saveTimer);saveNow();for(const r of rooms.values())for(const p of r.players)for(const peer of p.peers)peer.res.end();server.closeAllConnections();return new Promise(resolve=>server.close(resolve));}
  return {server,rooms,advance,close,roomView,saveNow};
}