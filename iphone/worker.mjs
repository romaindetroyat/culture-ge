/** HTTP/HTTPS entrypoint. Only /api requests enter the stateful game actor. */
import {createApp} from './core.mjs';
import {Game,VERSION} from './site/engine.js';
const security={
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; worker-src 'self'"
};
export default {
  async fetch(request,env){
    const u=new URL(request.url);
    if(u.pathname==='/health')return Response.json({ok:true,service:'LOMBRIX',version:VERSION,hosting:'cloudflare-durable-object'}, {headers:security});
    if(u.pathname.startsWith('/api/'))return env.GAMES.get(env.GAMES.idFromName('lombrix-v051-authority')).fetch(request);
    const result=await env.ASSETS.fetch(request);
    const response=new Response(result.body,result);for(const [k,v] of Object.entries(security))response.headers.set(k,v);
    if(u.pathname==='/sw.js')response.headers.set('Cache-Control','no-cache');
    return response;
  }
};

/** One serialized authority for private rooms. All physics remains server-side. */
export class GameAuthority {
  constructor(ctx,env){
    this.ctx=ctx;this.env=env;this.app=createApp({autotick:false,maxRooms:20,dataFile:null});this.queue=Promise.resolve();this.last=Date.now();this.saved=0;this.keys=new Set();this.fraction=0;
    this.ready=ctx.blockConcurrencyWhile(async()=>{
      const records=await ctx.storage.list({prefix:'r:'});
      for(const [key,saved]of records){
        if(!saved||Date.now()-saved.touched>7*86400000){await ctx.storage.delete(key);continue;}
        saved.players=saved.players.map(p=>({...p,peers:new Set(),visible:false,pollSeen:0}));
        saved.matches=saved.matches.map(m=>({...m,game:Game.fromState(m.game),missing:new Map(),pause:null}));
        this.app.rooms.set(saved.code,saved);this.keys.add(key);
      }
    });
  }
  fetch(request){
    // Serialize across async body reads and durable writes, not just CPU work.
    const task=this.queue.then(()=>this.handle(request));this.queue=task.catch(()=>{});return task;
  }
  async persist(){
    const live=new Set();
    for(const room of this.app.rooms.values()){
      const key='r:'+room.code;live.add(key);
      const saved={...room,players:room.players.map(({peers,...p})=>({...p,pollSeen:0,visible:false})),matches:room.matches.map(({missing,...m})=>({...m,game:m.game.exportState()}))};
      await this.ctx.storage.put(key,saved);
    }
    for(const key of this.keys)if(!live.has(key))await this.ctx.storage.delete(key);
    this.keys=live;this.saved=Date.now();
  }
  tick(now){
    // A sleeping actor doesn't fast-forward a battle while phones are offline.
    const delta=Math.min(5000,Math.max(0,now-this.last));this.last=now;
    this.fraction+=delta;let t=now-this.fraction;
    while(this.fraction>=1000/60){t+=1000/60;this.app.advance(t,1/60);this.fraction-=1000/60;}
  }
  async handle(request){
    await this.ready;
    const url=new URL(request.url);
    if(/\/events$/.test(url.pathname))return Response.json({error:'Cette édition utilise la synchronisation HTTP.'},{status:404});
    this.tick(Date.now());
    const headers={...Object.fromEntries(request.headers),host:url.host};
    const req={raw:request,method:request.method,url:url.pathname+url.search,headers,socket:{encrypted:true,remoteAddress:request.headers.get('CF-Connecting-IP')||'local',setTimeout(){}},on(){}};
    let status=200,done=false,content='',out=new Headers(security);
    const res={headersSent:false,destroyed:false,writableLength:0,setHeader(k,v){out.set(k,v);},writeHead(s,h={}){status=s;for(const [k,v]of Object.entries(h))out.set(k,v);this.headersSent=true;},end(s){content=s??'';done=true;},write(s){content+=s;},flushHeaders(){},destroy(){this.destroyed=true;}};
    try{
      await this.app.server.handler(req,res);
      if(!done)throw new Error('Réponse inachevée');
      if(request.method==='POST'||Date.now()-this.saved>1000)await this.persist();
      if(this.app.rooms.size&&!await this.ctx.storage.getAlarm())await this.ctx.storage.setAlarm(Date.now()+2*60*60*1000);
      return new Response(content,{status,headers:out});
    }catch(error){console.error('Game authority:',error.message);return Response.json({error:'Synchronisation indisponible. Réessaie dans quelques secondes.'},{status:503,headers:security});}
  }
  async alarm(){
    await this.ready;const task=this.queue.then(async()=>{this.tick(Date.now());await this.persist();if(this.app.rooms.size)await this.ctx.storage.setAlarm(Date.now()+2*60*60*1000);});this.queue=task.catch(()=>{});await task;
  }
}
