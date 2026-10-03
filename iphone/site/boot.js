/* LOMBRIX 0.5.1 — lightweight bootstrap; no gameplay or network dependency. */
(function () {
 'use strict';
 var notice=document.getElementById('runtime-notice');
 var text=document.getElementById('runtime-message');
 var copy=document.getElementById('copy-diagnostic');
 var details='';
 function report(error) {
  var message=error && error.message ? error.message : String(error || 'Erreur non précisée');
  details='LOMBRIX 0.5.1\n'+message.slice(0,1500)+'\nNavigateur : '+navigator.userAgent;
  if(notice){notice.hidden=false;notice.dataset.state='error';}
  if(text)text.textContent='Le jeu a rencontré un problème : '+message.slice(0,240)+'. Copie le diagnostic pour signaler ce blocage.';
  if(copy)copy.hidden=false;
  console.error('LOMBRIX',error);
 }
 window.LombrixBoot={
  report:report,
  ready:function(){
   if(notice)notice.hidden=true;
   document.querySelectorAll('[data-wait-for-game]').forEach(function(button){button.disabled=false;});
   document.documentElement.dataset.lombrixReady='true';
  },
  diagnostic:function(){return details;}
 };
 window.addEventListener('error',function(event){
  if(event.error || event.message)report(event.error || event.message);
  else if(event.target && event.target.tagName==='SCRIPT')report(new Error('Un fichier du moteur n’a pas été chargé. Recharge la page depuis le serveur du jeu.'));
 },true);
 window.addEventListener('unhandledrejection',function(event){report(event.reason);});
 if(copy)copy.onclick=function(){
  if(navigator.clipboard && navigator.clipboard.writeText){
   navigator.clipboard.writeText(details).then(function(){copy.textContent='Diagnostic copié';}).catch(showText);
  }else showText();
 };
 function showText(){var field=document.getElementById('runtime-details');if(field){field.hidden=false;field.value=details;field.focus();field.select();}}
 // Older embedded browsers can omit these optional APIs. Solo should still start.
 if(!Object.hasOwn)Object.defineProperty(Object,'hasOwn',{value:function(object,key){return Object.prototype.hasOwnProperty.call(object,key);},configurable:true,writable:true});
 if(!Array.prototype.at)Object.defineProperty(Array.prototype,'at',{value:function(index){index=Math.trunc(Number(index)||0);return this[index<0?this.length+index:index];},configurable:true,writable:true});
 if(window.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect){
  Object.defineProperty(CanvasRenderingContext2D.prototype,'roundRect',{configurable:true,writable:true,value:function(x,y,w,h,radius){
   var rr=Array.isArray(radius)?radius[0]:radius;
   var q=Math.max(0,Math.min(Number(rr)||0,Math.abs(w)/2,Math.abs(h)/2));
   if(w<0){x+=w;w=-w;}if(h<0){y+=h;h=-h;}
   this.moveTo(x+q,y);this.lineTo(x+w-q,y);this.quadraticCurveTo(x+w,y,x+w,y+q);
   this.lineTo(x+w,y+h-q);this.quadraticCurveTo(x+w,y+h,x+w-q,y+h);
   this.lineTo(x+q,y+h);this.quadraticCurveTo(x,y+h,x,y+h-q);
   this.lineTo(x,y+q);this.quadraticCurveTo(x,y,x+q,y);this.closePath();
  }});
 }
})();
