/* ── replay/buffer.js ─────────────────────────────────────
   Buffer circular con los últimos ~8 s de juego a 30 Hz. Solo
   guarda y reproduce posiciones — nada de dibujar (eso vive en
   render.js, porque necesita el canvas). Se separó primero
   porque tanto game.js como render.js lo necesitan, y así
   ninguno de los dos termina importando al otro.
──────────────────────────────────────────────────────────── */
import { S } from '../core/state.js';

export const REP={hz:2, seg:8, buf:[], max:0, activa:null};   // captura a 30 Hz

export function repIniciar(){
  REP.max=Math.round(60/REP.hz*REP.seg);
  REP.buf.length=0; REP.activa=null;
}

export function repCapturar(){
  if(S.tickN===undefined)S.tickN=0;
  S.tickN++;
  if(S.tickN%REP.hz)return;
  const n=S.players.length;
  const necesario=n*3+4;
  let f;
  if(REP.buf.length>=REP.max){ f=REP.buf.shift(); if(f.length!==necesario)f=new Float32Array(necesario); }
  else f=new Float32Array(necesario);
  for(let i=0;i<n;i++){
    const p=S.players[i];
    f[i*3]=p.x; f[i*3+1]=p.y; f[i*3+2]=p.alive===false?-99:p.face;
  }
  f[n*3]=S.ball.x; f[n*3+1]=S.ball.y; f[n*3+2]=S.ball.z;
  f[n*3+3]=S.ball.owner?S.players.indexOf(S.ball.owner):-1;
  REP.buf.push(f);
}

export function repReproducir(txt){
  if(REP.buf.length<20)return 0;
  // los últimos 3.5 s de juego, a cámara lenta
  // copia real: los búferes se reciclan, y guardar referencias
  // haría que la repetición se corrompiera mientras se ve
  const fr=REP.buf.slice(-105).map(f=>f.slice());
  REP.activa={frames:fr,i:0,t:0,txt:txt||'REPETICIÓN',vel:0.65,snap:true};
  return fr.length/((60/REP.hz)*0.65)+0.8;      // cuánto dura, en segundos
}

export function repPaso(dt){
  const r=REP.activa; if(!r)return;
  r.t+=dt*(60/REP.hz)*r.vel;
  if(r.t<0)r.t=0;
  r.i=Math.floor(r.t);
  if(r.i>=r.frames.length){REP.activa=null;}
}
