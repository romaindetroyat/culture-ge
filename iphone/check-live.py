import asyncio,json,os,time,traceback
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('live-checks');OUT.mkdir(exist_ok=True)
URL=json.loads(Path('deployment.json').read_text()).get('url')
results=[]
async def run():
 async with async_playwright() as p:
  for engine in ['webkit','chromium']:
   browser=await getattr(p,engine).launch(headless=True)
   ctx=await browser.new_context(viewport={'width':844,'height':390},device_scale_factor=2,is_mobile=True,has_touch=True)
   pg=await ctx.new_page();errors=[];pg.on('pageerror',lambda e:errors.append(str(e)))
   pg.set_default_timeout(18000)
   try:
    r=await pg.goto(URL+'/',wait_until='networkidle',timeout=60000)
    if r.status!=200:
     results.append({'engine':engine,'step':'public-load','status':'fail','http':r.status,'text':(await pg.locator('body').inner_text())[:2500]});continue
    await pg.wait_for_function("document.documentElement.dataset.lombrixReady==='true'")
    await pg.locator('#solo').tap();await pg.locator('#battle').wait_for(state='visible');await pg.wait_for_timeout(1400)
    assert await pg.locator('#fire').is_enabled()
    await pg.screenshot(path=str(OUT/(engine+'-solo.png')))
    await pg.locator('#arsenal').tap();await pg.locator('[data-category="Utilitaires"]').tap();await pg.locator('[data-weapon="heal"]').tap();await pg.locator('#fire').tap()
    await pg.wait_for_function("document.querySelector('#round-info').textContent==='TOUR 3'",timeout=45000)
    assert await pg.locator('#fire').is_enabled()
    assert not errors,errors
    results.append({'engine':engine,'step':'solo-start-action-AI-return','status':'pass'})
    await pg.evaluate('navigator.serviceWorker.ready')
    await pg.reload(wait_until='networkidle');await pg.wait_for_function("document.documentElement.dataset.lombrixReady==='true'")
    await ctx.set_offline(True);await pg.reload(wait_until='domcontentloaded');await pg.wait_for_function("document.documentElement.dataset.lombrixReady==='true'");await pg.locator('#solo').tap();await pg.locator('#battle').wait_for(state='visible');results.append({'engine':engine,'step':'offline-solo-shell','status':'pass'});await ctx.set_offline(False)
   except Exception as e:
    results.append({'engine':engine,'step':'solo','status':'fail','error':str(e),'pageErrors':errors});await pg.screenshot(path=str(OUT/(engine+'-failure.png')))
   finally:await ctx.close()
   if engine=='webkit':
    contexts=[]
    try:
     for _ in range(2):contexts.append(await browser.new_context(viewport={'width':844,'height':390},device_scale_factor=2,is_mobile=True,has_touch=True))
     pages=[await c.new_page() for c in contexts]
     for q in pages:
      q.set_default_timeout(20000);await q.goto(URL+'/',wait_until='networkidle');await q.wait_for_function("document.documentElement.dataset.lombrixReady==='true'")
     a,b=pages
     await a.locator('#nickname').fill('Alice recette');await a.locator('#create-duel').tap();await a.locator('#opt-worms').select_option('2');await a.locator('#opt-time').select_option('60');await a.locator('#confirm-config').tap();await a.locator('#lobby').wait_for(state='visible')
     code=(await a.locator('#room-code').inner_text()).strip()
     await b.goto(URL+'/?room='+code,wait_until='domcontentloaded');await b.locator('#join-name').fill('Bob recette');await b.locator('#join-submit').tap();await b.locator('#lobby').wait_for(state='visible');await b.locator('#ready').tap();await a.wait_for_timeout(900);await a.locator('#start-room').tap()
     for q in pages:await q.locator('#battle').wait_for(state='visible')
     await a.wait_for_timeout(1200)
     active=a if await a.locator('#fire').is_enabled() else b;other=b if active==a else a
     assert not await other.locator('#fire').is_enabled()
     await active.locator('#arsenal').tap();await active.locator('[data-category="Utilitaires"]').tap();await active.locator('[data-weapon="heal"]').tap();await active.locator('#fire').tap()
     for q in pages:await q.wait_for_function("document.querySelector('#round-info').textContent==='TOUR 2'",timeout=30000)
     assert await other.locator('#fire').is_enabled()
     await other.reload(wait_until='domcontentloaded');await other.locator('#battle').wait_for(state='visible',timeout=30000)
     await other.screenshot(path=str(OUT/'webkit-online.png'))
     results.append({'engine':'webkit','step':'two-independent-guests-invite-ready-start-action-turn-reload','status':'pass','roomCode':code})
     # Leave the test room instead of keeping a hidden active session.
     for q in pages:await q.evaluate("async code=>fetch('/api/rooms/'+code+'/leave',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})",code)
    except Exception as e:results.append({'engine':'webkit','step':'two-guests-online','status':'fail','error':str(e),'trace':traceback.format_exc()})
    finally:
     for c in contexts:await c.close()
   await browser.close()
  Path('browser-results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2))
asyncio.run(run())
