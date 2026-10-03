/** Bruitages originaux synthétisés. Aucun fichier audio tiers. */
export class Sound{
 constructor(){this.enabled=true;this.music=false;this.ctx=null;this.step=0;this.timer=null;}
 async unlock(){try{if(!this.ctx){const A=window.AudioContext||window.webkitAudioContext;if(!A)return;this.ctx=new A();this.master=this.ctx.createGain();this.master.gain.value=.27;this.master.connect(this.ctx.destination);this.noise=this.ctx.createBuffer(1,this.ctx.sampleRate,this.ctx.sampleRate);const a=this.noise.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;}if(this.ctx.state==='suspended')await this.ctx.resume();}catch{}}
 tone(f,d=.15,type='sine',vol=.2,to=null,delay=0){if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;const c=this.ctx,o=c.createOscillator(),g=c.createGain(),t=c.currentTime+delay;o.type=type;o.frequency.setValueAtTime(Math.max(20,f),t);if(to)o.frequency.exponentialRampToValueAtTime(Math.max(20,to),t+d);g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(vol,t+.012);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+d+.02);}
 hiss(d=.4,f=1000,vol=.4){if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;const c=this.ctx,b=c.createBufferSource(),filter=c.createBiquadFilter(),g=c.createGain(),t=c.currentTime;b.buffer=this.noise;filter.type='lowpass';filter.frequency.setValueAtTime(f,t);filter.frequency.exponentialRampToValueAtTime(70,t+d);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+d);b.connect(filter);filter.connect(g);g.connect(this.master);b.start(t);b.stop(t+d);}
 play(e){if(!this.enabled)return;switch(e.type){case'bump':this.tone(260,.08,'triangle',.13,130);break;case'fire':
 if(e.weapon==='laser'){this.tone(1250,.19,'sawtooth',.09,160);this.tone(680,.16,'sine',.10,1800);}
 else if(e.weapon==='bee'){this.tone(150,.3,'sawtooth',.10,320);this.tone(300,.25,'triangle',.07,140,.18);}
 else if(['grenade','banana','bouncer','cluster'].includes(e.weapon)){this.tone(340,.09,'triangle',.2,670);this.tone(820,.16,'sine',.10,390,.08);}
 else{this.tone(210,.11,'sawtooth',.13,60);this.hiss(.1,1800,.23);}break;case'explosion':this.hiss(.65,1300,.8);this.tone(80,.5,'sine',.65,25);this.tone(155,.13,'triangle',.3,50);break;case'jump':this.tone(210,.17,'sine',.23,570);break;case'damage':this.tone(510,.1,'triangle',.16,190);this.tone(450,.09,'triangle',.13,200,.12);break;case'heal':[523,659,784].forEach((f,i)=>this.tone(f,.22,'sine',.22,null,i*.085));break;case'teleport':this.tone(170,.45,'sine',.2,1400);break;case'splash':this.hiss(.5,3300,.35);this.tone(270,.28,'sine',.3,65);break;case'turn':this.tone(660,.13,'sine',.14);this.tone(880,.15,'sine',.14,null,.14);break;case'beep':this.tone(1200,.1,'square',.07);break;case'freeze':this.tone(1500,.4,'sine',.12,300);break;case'death':{
 // A short comic descent followed by a ghostly upward chirp, never awaited.
 const key=1+((e.wormId||0)%4)*.065;
 if(e.reason==='water'){[290,230,180].forEach((f,i)=>this.tone(f*key,.12,'sine',.17,f*1.5,i*.11));}
 else{[440,392,311,220].forEach((f,i)=>this.tone(f*key,.17,'triangle',.13,f*.92,i*.14));}
 this.tone(440*key,.42,'sine',.11,1250,.65);this.tone(880*key,.32,'sine',.065,1650,1.04);break;}
case'punch':this.hiss(.16,700,.6);break;case'beam':this.tone(1400,.23,'sawtooth',.06,200);break;default:break;}}
 click(){this.tone(600,.08,'sine',.12,400);}
 setMusic(value){this.music=value;if(this.timer)clearInterval(this.timer);this.timer=null;if(!value)return;const melody=[523,0,659,784,0,659,587,0,440,0,587,698,0,587,523,0];this.timer=setInterval(()=>{if(!this.enabled||document.hidden)return;const f=melody[this.step%melody.length];if(f)this.tone(f,.20,'sine',.055);if(this.step%4===0)this.tone(this.step%16<8?131:110,.35,'triangle',.045);this.step++;},250);}
}
