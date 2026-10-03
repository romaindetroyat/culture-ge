const CACHE='lombrix-v0.5.1-r1';
const SHELL=['/','/index.html','/style.css?v=0.5.1','/boot.js?v=0.5.1','/app.js?v=0.5.1','/engine.js?v=0.5.1','/interaction.js?v=0.5.1','/render-cache.js?v=0.5.1','/art.js?v=0.5.1','/renderer.js?v=0.5.1','/audio.js?v=0.5.1','/manifest.webmanifest','/assets/mascots.svg','/assets/icon.svg','/assets/icon-192.png','/assets/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));});
// Never activate a different game engine in a running match.
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('lombrix-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/')||u.pathname==='/health')return;
 // The HTML and its versioned modules come from one installed shell, including offline.
 if(e.request.mode==='navigate'){e.respondWith(caches.open(CACHE).then(c=>c.match('/index.html')).then(hit=>hit||fetch(e.request)));return;}
 if(SHELL.includes(u.pathname+u.search)||SHELL.includes(u.pathname))e.respondWith(caches.open(CACHE).then(c=>c.match(e.request)).then(hit=>hit||fetch(e.request)));});
