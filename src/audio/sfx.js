/* ── audio/sfx.js ──────────────────────────────────────────
   Todo sintetizado con WebAudio: ni un archivo externo.
   Es la pieza más aislada de todo el motor — no depende de
   S, F, jugadores ni nada del juego, solo del AudioContext
   del navegador. Por eso fue la primera en salir de game.js.
──────────────────────────────────────────────────────────── */
export const SND={ctx:null, on:true, vol:.5};

export function audio(){
  if(!SND.ctx){
    try{ SND.ctx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ SND.on=false; }
  }
  if(SND.ctx&&SND.ctx.state==='suspended')SND.ctx.resume();
  return SND.ctx;
}

function tono(f0,f1,dur,tipo,vol,curva){
  if(!SND.on)return; const c=audio(); if(!c)return;
  const o=c.createOscillator(), g=c.createGain();
  o.type=tipo||'sine'; o.frequency.setValueAtTime(f0,c.currentTime);
  if(f1&&f1!==f0)o.frequency[curva==='exp'?'exponentialRampToValueAtTime':'linearRampToValueAtTime'](f1,c.currentTime+dur);
  g.gain.setValueAtTime(0,c.currentTime);
  g.gain.linearRampToValueAtTime((vol||.3)*SND.vol,c.currentTime+.008);
  g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+dur);
  o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime+dur+.02);
}
function ruido(dur,vol,f,q){
  if(!SND.on)return; const c=audio(); if(!c)return;
  const n=Math.floor(c.sampleRate*dur), b=c.createBuffer(1,n,c.sampleRate), d=b.getChannelData(0);
  for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
  const src=c.createBufferSource(); src.buffer=b;
  const flt=c.createBiquadFilter(); flt.type='bandpass'; flt.frequency.value=f||900; flt.Q.value=q||1;
  const g=c.createGain(); g.gain.value=(vol||.25)*SND.vol;
  src.connect(flt).connect(g).connect(c.destination); src.start();
}

export const SFX={
  golpe:()=>{tono(180,60,.11,'triangle',.45,'exp');ruido(.07,.22,1400,1.2);},
  pase:()=>{tono(150,80,.07,'triangle',.22,'exp');ruido(.04,.10,1100,1.2);},
  poste:()=>{tono(1180,760,.35,'square',.20,'exp');},
  parada:()=>{ruido(.10,.28,600,.8);},
  entrada:()=>{ruido(.16,.30,320,.7);tono(90,50,.14,'sine',.25,'exp');},
  silbato:()=>{tono(2100,2350,.16,'square',.16);setTimeout(()=>tono(2350,2050,.20,'square',.16),120);},
  gol:()=>{ruido(1.5,.30,700,.6);tono(330,660,.5,'sawtooth',.14,'exp');
           setTimeout(()=>tono(440,880,.6,'sawtooth',.12,'exp'),180);},
  encontra:()=>{tono(220,110,.7,'sawtooth',.16,'exp');ruido(.9,.14,400,.5);}
};
