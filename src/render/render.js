/* ── render/render.js ─────────────────────────────────────
   Todo lo que dibuja: cancha, jugadores, balón, efectos, HUD
   del canvas. Lee el estado (S, F, CY, SUP) pero nunca lo
   decide — un error aquí se nota mirando la pantalla, no
   desincroniza el marcador ni la física.

   Dependencias de game.js (import circular a propósito): las
   funciones de puntería/pases (passPlan, shotPlan, etc.) se
   quedan en game.js porque son lógica de entrada del usuario,
   no de dibujo — pero drawPassTarget/drawPreview las necesitan
   para mostrar la vista previa del tiro/pase. Funciona porque
   son 'function' (hoisted): JS las tiene disponibles para todo
   el grafo de módulos antes de correr el código de cualquiera.
   Por esa misma razón, cv/radarCv se buscan con
   document.getElementById directo aquí abajo, NO con el $()
   de game.js — ese sí es un const sin hoist, y en el momento
   en que este módulo se evalúa (antes de que game.js corra su
   propio cuerpo) todavía no existe.                           */
import { clamp, lerp, norm, dist, segDist } from '../core/math.js';
import { S, F, CY, GT, GB, SUP } from '../core/state.js';
import { getRng } from '../core/rng.js';
import { REP } from '../replay/buffer.js';
import { passPlan, shotPlan, switchCandidate, screenToWorld, other } from '../game.js';

const rng = getRng();
const gauss = () => rng.gauss();

export function resize(){
  const dpr=Math.min(DPRCAP,devicePixelRatio||1);
  cvW=cv.clientWidth;cvH=cv.clientHeight;
  cv.width=Math.round(cvW*dpr);cv.height=Math.round(cvH*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  SCbase=clamp(Math.min(cvW/56,cvH/38),5,20);
  SC=SCbase*S.zoom;
  S.rectsT=0;
}
addEventListener('resize',resize);

function camClamp(){
  const vw=cvW/SC, vh=cvH/SC;
  const minX=vw/2-F.MG, maxX=F.W+F.MG-vw/2;
  const minY=vh/2-F.MG, maxY=F.H+F.MG-vh/2;
  return {x:minX>maxX?F.W/2:clamp(S.cam.x,minX,maxX),
          y:minY>maxY?CY:clamp(S.cam.y,minY,maxY)};
}
const zsort=[];
const _ang=(a,b,t)=>{let d=b-a;while(d>Math.PI)d-=6.283185;while(d<-Math.PI)d+=6.283185;return a+d*t;};
const ipx=p=>{const a=S.alpha||0;return p.px===undefined?p.x:p.px+(p.x-p.px)*a;};
const ipy=p=>{const a=S.alpha||0;return p.py===undefined?p.y:p.py+(p.y-p.py)*a;};
const ipf=p=>{const a=S.alpha||0;return p.pface===undefined?p.face:_ang(p.pface,p.face,a);};
export function render(){
  if(S.zoomPunch===undefined)S.zoomPunch=0;
  S.zoomPunch*=0.93;
  SC=SCbase*S.zoom*(1+S.zoomPunch);
  // en la repetición la cámara sigue al balón GRABADO y no tiembla:
  // el temblor del gol dejaba la jugada ilegible
  if(S.celeb&&S.celeb.sc){
    S.cam.x=lerp(S.cam.x,S.celeb.sc.x,0.07);
    S.cam.y=lerp(S.cam.y,S.celeb.sc.y,0.07);
  }
  if(REP.activa){
    const rr=REP.activa;
    const j0=Math.min(rr.i,rr.frames.length-1), j1=Math.min(j0+1,rr.frames.length-1);
    const aa=clamp(rr.t-rr.i,0,1), FA=rr.frames[j0], FB=rr.frames[j1];
    const nb=S.players.length*3;
    const f=[FA[nb]+(FB[nb]-FA[nb])*aa, FA[nb+1]+(FB[nb+1]-FA[nb+1])*aa];
    if(rr.snap){ S.cam.x=f[0]; S.cam.y=f[1]; rr.snap=false; }
    else { S.cam.x=lerp(S.cam.x,f[0],0.18); S.cam.y=lerp(S.cam.y,f[1],0.18); }
    S.shake=0;
  }
  const c=camClamp();
  S.view={x:c.x,y:c.y,sc:SC};
  let ox=0,oy=0;
  if(S.shake>0&&!REP.activa){ox=gauss()*S.shake*7;oy=gauss()*S.shake*7;}
  ctx.clearRect(0,0,cvW,cvH);
  ctx.save();
  ctx.translate(cvW/2+ox,cvH/2+oy);
  ctx.scale(SC,SC);
  ctx.translate(-c.x,-c.y);
  drawPitch();
  dibujarAficion();
  drawAmbiente();
  drawBallShadow();
  for(const p of zsort)drawShadow(p);
  const vw=cvW/SC/2+2, vh=cvH/SC/2+2;
  if(repDibujar()){ ctx.restore(); drawRepBanner(); return; }
  zsort.length=0;
  for(const p of S.players)
    if(Math.abs(p.x-c.x)<vw&&Math.abs(p.y-c.y)<vh)zsort.push(p);   // recorte por cámara
  zsort.sort((a,b)=>a.y-b.y);
  ctx.font='bold .62px Archivo, sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  for(const p of zsort)drawPlayer(p);
  drawBall();
  dibujarFiesta();
  drawAids();
  ctx.restore();
  dibujarCartelGol();
  drawCharge();
}
function drawPitchTo(ctx){
  const L=-F.MG,R=F.W+F.MG,T=-F.MG,B=F.H+F.MG;
  ctx.fillStyle='#0e2418';ctx.fillRect(L,T,R-L,B-T);
  // franjas de corte
  const franjas=Math.round(F.W/7.5);
  for(let i=0;i<franjas;i++){
    ctx.fillStyle=i%2?'#153venue':'#112a1b';
    ctx.fillStyle=i%2?SUP.a:SUP.b;
    ctx.fillRect(i*(F.W/franjas),0,F.W/franjas,F.H);
  }
  // vetas del corte, para que el césped no sea plano
  ctx.globalAlpha=SUP.veta;
  for(let y=0;y<F.H;y+=0.55){
    ctx.fillStyle=(Math.round(y*7)%2)?'#ffffff':'#000000';
    ctx.fillRect(0,y,F.W,0.28);
  }
  ctx.globalAlpha=1;
  ctx.strokeStyle=SUP.linea;ctx.lineWidth=.12;ctx.lineJoin='round';
  ctx.strokeRect(0,0,F.W,F.H);
  ctx.beginPath();ctx.moveTo(F.W/2,0);ctx.lineTo(F.W/2,F.H);ctx.stroke();
  ctx.beginPath();ctx.arc(F.W/2,CY,F.CIRC,0,7);ctx.stroke();
  ctx.beginPath();ctx.arc(F.W/2,CY,.25,0,7);ctx.fillStyle='rgba(236,255,244,.55)';ctx.fill();
  for(const s of [0,1]){
    const x=s?F.W:0, d=s?-1:1;
    ctx.strokeRect(s?F.W-F.BOX:0,CY-F.BOXW/2,F.BOX,F.BOXW);
    ctx.strokeRect(s?F.W-F.SIX:0,CY-F.SIXW/2,F.SIX,F.SIXW);
    ctx.beginPath();ctx.arc(x+d*F.SPOT,CY,.22,0,7);ctx.fill();
    ctx.beginPath();
    const a=Math.acos((F.BOX-F.SPOT)/F.CIRC);
    ctx.arc(x+d*F.SPOT,CY,F.CIRC,s?Math.PI-a:-a,s?Math.PI+a:a);ctx.stroke();
    // esquinas
    for(const yy of [0,F.H]){
      ctx.beginPath();ctx.arc(x,yy,1,0,7);ctx.stroke();
    }
  }
}
/* Las porterías van en su propia función: la grada se pinta encima del
   margen y antes se las comía. Ahora se repintan al final.          */
function dibujarPorterias(ctx){
  for(const s of [0,1]){
    ctx.save();
    // fondo de red, para que se lea sobre el hormigón de la grada
    ctx.fillStyle='rgba(10,14,18,.72)';
    ctx.fillRect(s?F.W:-2.1,GT-.15,2.1,F.GW+.3);
    ctx.strokeStyle='rgba(255,255,255,.20)';ctx.lineWidth=.05;
    for(let i=0;i<=8;i++){
      const yy=GT+i*(F.GW/8);
      ctx.beginPath();ctx.moveTo(s?F.W:0,yy);ctx.lineTo(s?F.W+2:-2,yy);ctx.stroke();
    }
    for(let i=0;i<=5;i++){
      const xx=(s?F.W:0)+(s?1:-1)*i*.4;
      ctx.beginPath();ctx.moveTo(xx,GT);ctx.lineTo(xx,GB);ctx.stroke();
    }
    // postes y travesaño, bien marcados
    ctx.strokeStyle='#ffffff';ctx.lineWidth=.20;ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(s?F.W:0,GT);ctx.lineTo(s?F.W+2:-2,GT);
    ctx.moveTo(s?F.W:0,GB);ctx.lineTo(s?F.W+2:-2,GB);
    ctx.moveTo(s?F.W+2:-2,GT);ctx.lineTo(s?F.W+2:-2,GB);
    ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=.24;
    ctx.beginPath();ctx.moveTo(s?F.W:0,GT);ctx.lineTo(s?F.W:0,GB);ctx.stroke();
    ctx.restore();
  }
}
let pitchCv=null;const PSC=16;
function dibujarGrada(g){
  const M=F.MG, W=F.W, H=F.H;
  let sem=987654321;
  const rnd2=()=>((sem=(sem*1103515245+12345)&0x7fffffff)/0x7fffffff);
  // foso de hormigón, más claro cerca del campo y oscuro al fondo
  const bandas=[[0.00,'#151a20'],[0.35,'#10151a'],[0.70,'#0a0e12'],[1.00,'#06090c']];
  const franja=(x,y,w,h,t)=>{ g.fillStyle=bandas.find(b=>t<=b[0])[1]||'#06090c'; g.fillRect(x,y,w,h); };
  const filas=Math.max(5,Math.floor(M/0.62));
  const cols=['#e8e8ee','#d8dde6','#c94f6d','#4f7dc9','#e0b23c','#5fb27a','#8a6fc9','#d97a3c','#9aa4b2'];
  // grada escalonada: cada fila un peldaño más oscuro y algo más comprimido
  for(let f=0;f<filas;f++){
    const t=f/filas, off=f*(M/filas);
    const tono=bandas[Math.min(bandas.length-1,Math.floor(t*bandas.length))][1];
    g.fillStyle=tono;
    g.fillRect(-M+off*0.5,-M+off,W+2*M-off,M/filas+0.02);
    g.fillRect(-M+off*0.5,H+M-off-M/filas,W+2*M-off,M/filas+0.02);
    g.fillRect(-M+off,-M+off*0.5,M/filas+0.02,H+2*M-off);
    g.fillRect(W+M-off-M/filas,-M+off*0.5,M/filas+0.02,H+2*M-off);
    // borde del peldaño
    g.fillStyle='rgba(255,255,255,.035)';
    g.fillRect(-M+off*0.5,-M+off,W+2*M-off,.05);
    g.fillRect(-M+off*0.5,H+M-off-M/filas,W+2*M-off,.05);
  }
  // público: dos puntos por persona (cabeza y torso) y densidad alta
  const gente=(x,y,t)=>{
    const c=cols[(rnd2()*cols.length)|0];
    g.globalAlpha=(.45+rnd2()*.5)*(1-t*.35);
    g.fillStyle=c; g.fillRect(x,y+.13,.30,.26);
    g.fillStyle='#2b2118'; g.globalAlpha*=.85;
    g.fillRect(x+.05,y,.20,.15);
  };
  for(let f=0;f<filas;f++){
    const t=f/filas, off=f*(M/filas)+M/filas*.35;
    const paso=.46+t*.06;
    for(let x=-M+off*0.5+.3;x<W+M-off*0.5-.3;x+=paso){
      if(rnd2()<.10)continue;                       // huecos: no está lleno
      gente(x,-M+off,t); gente(x,H+M-off-.42,t);
    }
    for(let y=-M+off*0.5+.3;y<H+M-off*0.5-.3;y+=paso){
      if(rnd2()<.10)continue;
      gente(-M+off,y,t); gente(W+M-off-.32,y,t);
    }
  }
  g.globalAlpha=1;
  // tifos: telas de color colgadas de la barandilla
  const tifo=(x,y,w,h,c)=>{ g.globalAlpha=.55; g.fillStyle=c; g.fillRect(x,y,w,h);
    g.globalAlpha=.9; g.fillStyle='rgba(255,255,255,.25)'; g.fillRect(x,y,w,.06); g.globalAlpha=1; };
  const cLocal=(S.teams&&S.teams[0])?S.teams[0].pal.main:'#ff2f8e';
  const cVisit=(S.teams&&S.teams[1])?S.teams[1].pal.main:'#39d7ff';
  for(let i=0;i<5;i++){
    tifo(W*0.12+i*W*0.16, -M*0.30, W*0.09, .5, i%2?cLocal:'#ffffff');
    tifo(W*0.14+i*W*0.16, H+M*0.30-.5, W*0.09, .5, i%2?cVisit:'#ffffff');
  }
  // valla perimetral y foco de luz sobre el césped
  g.strokeStyle='rgba(255,255,255,.16)';g.lineWidth=.10;
  g.strokeRect(-M*0.30,-M*0.30,W+M*0.60,H+M*0.60);
  g.strokeStyle='rgba(255,255,255,.07)';g.lineWidth=.06;
  g.strokeRect(-M*0.62,-M*0.62,W+M*1.24,H+M*1.24);
}
function buildPitch(){
  pitchCv=document.createElement('canvas');
  pitchCv.width=Math.round((F.W+2*F.MG)*PSC);
  pitchCv.height=Math.round((F.H+2*F.MG)*PSC);
  const g=pitchCv.getContext('2d');
  g.setTransform(PSC,0,0,PSC,F.MG*PSC,F.MG*PSC);
  drawPitchTo(g);
  dibujarGrada(g);
  dibujarPorterias(g);   // encima de la grada: si no, se las come
}
function drawPitch(){
  if(!pitchCv)buildPitch();
  ctx.drawImage(pitchCv,-F.MG,-F.MG,F.W+2*F.MG,F.H+2*F.MG);
}
/* viñeta y luz de estadio: cuestan una elipse por frame y dan mucho */
/* La grada va pre-renderizada (barata), pero encima dibujo una capa viva:
   destellos que parpadean y, al marcar, una ola que recorre el estadio.  */
let AFIC=null;
function prepararAficion(){
  AFIC=[]; let sem=24680;
  const r=()=>((sem=(sem*1103515245+12345)&0x7fffffff)/0x7fffffff);
  const M=F.MG, W=F.W, H=F.H;
  const meter=(x,y)=>AFIC.push({x,y,f:r()*6.283,v:.7+r()*1.6,
    // ángulo alrededor del estadio, para la ola
    a:Math.atan2(y-H/2,x-W/2)});
  for(let i=0;i<260;i++){
    const lado=(r()*4)|0, t=r();
    if(lado===0)meter(-M+t*(W+2*M), -M+r()*M*.92);
    else if(lado===1)meter(-M+t*(W+2*M), H+M-r()*M*.92);
    else if(lado===2)meter(-M+r()*M*.92, -M+t*(H+2*M));
    else meter(W+M-r()*M*.92, -M+t*(H+2*M));
  }
}
function dibujarAficion(){
  if(!AFIC)prepararAficion();
  const t=S.t||(S.t=0);
  const fiesta=(S.celeb?1:0)+(FIESTA.t>0?.6:0);
  for(const p of AFIC){
    let br=.18+.22*Math.sin(p.f+t*p.v);
    if(fiesta){
      // ola: recorre el anillo del estadio
      const fase=(t*3.2)%6.283;
      let d=Math.abs(((p.a+6.283)%6.283)-fase);
      if(d>3.14)d=6.283-d;
      br+=Math.max(0,1-d*1.6)*.75*fiesta;
    }
    if(br<=.2)continue;
    ctx.globalAlpha=Math.min(.85,br);
    ctx.fillStyle=fiesta&&br>.6?'#ffffff':'#cfd6e0';
    ctx.fillRect(p.x,p.y,.34,.30);
  }
  ctx.globalAlpha=1;
}
function drawAmbiente(){
  const g=ctx.createRadialGradient(F.W/2,F.H/2,F.H*0.25,F.W/2,F.H/2,F.W*0.72);
  if(!g||!g.addColorStop)return;
  g.addColorStop(0,'rgba(255,255,240,.045)');
  g.addColorStop(1,'rgba(0,0,0,.30)');
  ctx.fillStyle=g;
  ctx.fillRect(-F.MG,-F.MG,F.W+2*F.MG,F.H+2*F.MG);
}
function drawShadow(p){
  const v=Math.hypot(p.vx,p.vy);
  ctx.fillStyle='rgba(0,0,0,.34)';
  ctx.beginPath();ctx.ellipse(ipx(p)+.18,ipy(p)+.34,.62+v*.012,.32,0,0,7);ctx.fill();
}
function drawBallShadow(){
  const b=S.ball, a=S.alpha||0;
  const bx=(b.px===undefined?b.x:b.px+(b.x-b.px)*a);
  const by=(b.py===undefined?b.y:b.py+(b.y-b.py)*a);
  const bz=(b.pz===undefined?b.z:b.pz+(b.z-b.pz)*a);
  const s=clamp(1-bz*.14,.35,1);
  ctx.fillStyle='rgba(0,0,0,'+(.35*s)+')';
  ctx.beginPath();ctx.ellipse(bx+bz*.16,by+.22+bz*.1,.26*s,.15*s,0,0,7);ctx.fill();
}
function drawPlayer(p){
  const pal=p.team.pal;
  const isCtrl=(p===S.ctrl);
  ctx.save();
  ctx.translate(ipx(p),ipy(p));
  if(p.slide>0){
    // BARRIDA: cuerpo tendido con pierna estirada, surco en el césped y
    // césped levantado. Antes era una elipse plana de la versión vieja.
    const ang=Math.atan2(p.slideDir.y,p.slideDir.x);
    const av=1-clamp(p.slide/.55,0,1);           // 0 al lanzarse, 1 al frenar
    ctx.rotate(ang);
    // surco: dos rayas de tierra por detrás
    ctx.strokeStyle='rgba(30,22,14,.35)';ctx.lineWidth=.16;ctx.lineCap='round';
    for(const off of [-.22,.22]){
      ctx.beginPath();ctx.moveTo(-1.9-av*1.4,off);ctx.lineTo(-.2,off*.7);ctx.stroke();
    }
    // estela de velocidad
    ctx.strokeStyle='rgba(255,255,255,.13)';ctx.lineWidth=.09;
    for(const off of [-.42,0,.42]){
      ctx.beginPath();ctx.moveTo(-1.3-av,off);ctx.lineTo(-.55,off);ctx.stroke();
    }
    const base=p.role==='GK'?'#ffd166':pal.main;
    // sombra pegada al suelo
    ctx.fillStyle='rgba(0,0,0,.34)';
    ctx.beginPath();ctx.ellipse(-.1,.24,1.0,.36,0,0,7);ctx.fill();
    // pierna de apoyo, doblada bajo el cuerpo
    ctx.strokeStyle=p.role==='GK'?'#c99a2e':pal.dark;ctx.lineWidth=.30;
    ctx.beginPath();ctx.moveTo(-.15,.10);ctx.lineTo(-.62,.34);ctx.stroke();
    // pierna que ataca el balón, completamente estirada
    ctx.strokeStyle=base;ctx.lineWidth=.26;
    ctx.beginPath();ctx.moveTo(-.05,-.02);ctx.lineTo(1.02,-.10);ctx.stroke();
    ctx.fillStyle='#f2f2f0';
    ctx.beginPath();ctx.arc(1.06,-.10,.15,0,7);ctx.fill();      // bota
    // tronco tumbado
    const gr2=ctx.createLinearGradient(0,-.42,0,.42);
    if(gr2&&gr2.addColorStop){gr2.addColorStop(0,base);gr2.addColorStop(1,p.role==='GK'?'#c99a2e':pal.dark);}
    ctx.beginPath();ctx.ellipse(-.34,.02,.62,.40,0,0,7);
    ctx.fillStyle=(gr2&&gr2.addColorStop)?gr2:base;ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,.35)';ctx.lineWidth=.07;ctx.stroke();
    // cabeza
    ctx.fillStyle='#e8c9a0';
    ctx.beginPath();ctx.arc(-.86,.06,.24,0,7);ctx.fill();
    // brazo de equilibrio
    ctx.strokeStyle=base;ctx.lineWidth=.17;
    ctx.beginPath();ctx.moveTo(-.45,-.22);ctx.lineTo(-.95,-.55);ctx.stroke();
    ctx.restore();
    // césped levantado (fuera de la rotación, en coordenadas del campo)
    ctx.save();ctx.translate(ipx(p),ipy(p));
    for(let i=0;i<5;i++){
      const a=ang+Math.PI+(i-2)*.28;
      const d=.6+av*1.5+i*.08;
      ctx.globalAlpha=.30*(1-av);
      ctx.fillStyle='#2f4a24';
      ctx.fillRect(Math.cos(a)*d,Math.sin(a)*d-av*.3,.20,.16);
    }
    ctx.globalAlpha=1;ctx.restore();
    return;
  }
  // cuerpo (se apaga cuando el jugador está fundido)
  ctx.globalAlpha=p.stam<35?.55+p.stam/35*.45:1;
  // volumen: base oscura + degradado de camiseta
  ctx.beginPath();ctx.arc(0,.07,.58,0,7);
  ctx.fillStyle='rgba(0,0,0,.35)';ctx.fill();
  const base=p.role==='GK'?'#ffd166':pal.main;
  const gr=ctx.createLinearGradient(0,-.56,0,.56);
  if(gr&&gr.addColorStop){gr.addColorStop(0,base);gr.addColorStop(1,p.role==='GK'?'#c99a2e':pal.dark);}
  ctx.beginPath();ctx.arc(0,0,.56,0,7);
  ctx.fillStyle=(gr&&gr.addColorStop)?gr:base;ctx.fill();
  // inclinación al correr y giro del cuerpo
  const vel=Math.hypot(p.vx,p.vy);
  if(vel>1.2){
    const fase=(p.paso=(p.paso||0)+vel*0.06)%6.283;
    ctx.save();ctx.rotate(p.face);
    ctx.strokeStyle='rgba(0,0,0,.28)';ctx.lineWidth=.13;
    ctx.beginPath();
    ctx.moveTo(-.1,-.36);ctx.lineTo(-.34-Math.sin(fase)*.22,-.46);
    ctx.moveTo(-.1, .36);ctx.lineTo(-.34+Math.sin(fase)*.22, .46);
    ctx.stroke();ctx.restore();
  }
  ctx.beginPath();ctx.arc(-.16,-.18,.20,0,7);
  ctx.fillStyle='rgba(255,255,255,.16)';ctx.fill();
  ctx.globalAlpha=1;
  ctx.lineWidth=.11;ctx.strokeStyle=p.role==='GK'?'#7a5b12':pal.dark;ctx.stroke();
  // cuña de orientación
  ctx.beginPath();
  ctx.moveTo(Math.cos(p.face)*.86,Math.sin(p.face)*.86);
  ctx.lineTo(Math.cos(p.face+2.5)*.46,Math.sin(p.face+2.5)*.46);
  ctx.lineTo(Math.cos(p.face-2.5)*.46,Math.sin(p.face-2.5)*.46);
  ctx.closePath();ctx.fillStyle=p.role==='GK'?'#7a5b12':pal.dark;
  ctx.globalAlpha=.75;ctx.fill();ctx.globalAlpha=1;
  // dorsal
  if(SC>9){
    ctx.fillStyle=p.role==='GK'?'#3a2c06':pal.txt;
    ctx.fillText(String(p.num),0,.03);
  }
  // rastro de zancada: lo dejan TODOS los que esprintan, no solo tú
  const vsp=Math.hypot(p.vx,p.vy);
  if(p.sprint&&vsp>4.8){
    const u=norm(-p.vx,-p.vy);
    const inten=clamp((vsp-4.8)/3,0,1);
    // estelas fantasma del propio cuerpo
    for(let i=1;i<=3;i++){
      ctx.globalAlpha=.13*inten*(1-i/4);
      ctx.fillStyle=p.role==='GK'?'#ffd166':pal.main;
      ctx.beginPath();ctx.arc(u.x*i*.55,u.y*i*.55,.52-i*.05,0,7);ctx.fill();
    }
    // polvo levantado en la pisada
    ctx.globalAlpha=.20*inten;
    ctx.fillStyle=SUP.b;
    for(let i=0;i<3;i++){
      const a=Math.atan2(u.y,u.x)+(i-1)*.5;
      const d=.6+i*.22+((p.paso||0)%1)*.3;
      ctx.beginPath();ctx.arc(Math.cos(a)*d,Math.sin(a)*d,.13+i*.04,0,7);ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  if(isCtrl&&p.sprint&&Math.hypot(p.vx,p.vy)>4.5){
    // estela: para que el sprint se note sin mirar la barra
    const u=norm(-p.vx,-p.vy);
    ctx.strokeStyle='rgba(255,255,255,.30)';ctx.lineWidth=.13;
    for(let i=1;i<=3;i++){
      ctx.beginPath();
      ctx.moveTo(u.x*(.75+i*.42)-u.y*.30, u.y*(.75+i*.42)+u.x*.30);
      ctx.lineTo(u.x*(1.05+i*.42)-u.y*.30, u.y*(1.05+i*.42)+u.x*.30);
      ctx.moveTo(u.x*(.75+i*.42)+u.y*.30, u.y*(.75+i*.42)-u.x*.30);
      ctx.lineTo(u.x*(1.05+i*.42)+u.y*.30, u.y*(1.05+i*.42)-u.x*.30);
      ctx.stroke();
    }
  }
  if(isCtrl){
    ctx.strokeStyle='#fff';ctx.lineWidth=.09;
    ctx.beginPath();ctx.arc(0,0,.86,0,7);ctx.stroke();
    // arco de resistencia
    ctx.strokeStyle=p.stam>35?'#9dffbe':'#ff6b6b';ctx.lineWidth=.15;
    ctx.beginPath();ctx.arc(0,0,1.05,-Math.PI/2,-Math.PI/2+p.stam/100*6.283);ctx.stroke();
    ctx.fillStyle='#fff';
    ctx.beginPath();ctx.moveTo(0,-1.65);ctx.lineTo(-.34,-2.15);ctx.lineTo(.34,-2.15);ctx.closePath();ctx.fill();
  }
  if(p.yellow&&SC>9){
    ctx.fillStyle='#ffd166';ctx.fillRect(.55,-.95,.3,.42);
  }
  ctx.restore();
}
function drawBall(){
  const b=S.ball, a=S.alpha||0;
  const bx=(b.px===undefined?b.x:b.px+(b.x-b.px)*a);
  const by=(b.py===undefined?b.y:b.py+(b.y-b.py)*a);
  const bz=(b.pz===undefined?b.z:b.pz+(b.z-b.pz)*a);
  const y=by-bz*.42;
  const r=.16+bz*.012;
  // estela
  ctx.strokeStyle='rgba(255,255,255,.16)';ctx.lineWidth=.09;
  ctx.beginPath();
  b.trail.forEach((t,i)=>{const yy=t.y-t.z*.42;i?ctx.lineTo(t.x,yy):ctx.moveTo(t.x,yy);});
  ctx.stroke();
  ctx.save();ctx.translate(bx,y);ctx.rotate(b.rot);
  ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.fillStyle='#fdfdfb';ctx.fill();
  ctx.lineWidth=.05;ctx.strokeStyle='rgba(0,0,0,.55)';ctx.stroke();
  ctx.fillStyle='rgba(20,20,20,.85)';
  ctx.beginPath();ctx.arc(0,0,r*.34,0,7);ctx.fill();
  for(let i=0;i<3;i++){
    const a=i*2.094;
    ctx.beginPath();ctx.arc(Math.cos(a)*r*.7,Math.sin(a)*r*.7,r*.2,0,7);ctx.fill();
  }
  ctx.restore();
}
function drawAids(){
  // marca del saque
  if(S.restart){
    const r=S.restart;
    ctx.strokeStyle='rgba(255,255,255,.5)';ctx.lineWidth=.09;
    ctx.setLineDash([.4,.4]);
    ctx.beginPath();ctx.arc(r.pos.x,r.pos.y,9.15,0,7);ctx.stroke();
    ctx.setLineDash([]);
  }
  // línea de fuera de juego
  if(S.offside&&S.offsideOn){
    const t=S.offside.team,opp=other(t);
    const xs=opp.players.map(q=>t.dir>0?q.x:F.W-q.x).sort((a,c)=>c-a);
    const line=xs[1]!==undefined?xs[1]:xs[0];
    const wx=t.dir>0?line:F.W-line;
    ctx.strokeStyle='rgba(255,209,102,.45)';ctx.lineWidth=.1;
    ctx.setLineDash([.7,.5]);
    ctx.beginPath();ctx.moveTo(wx,0);ctx.lineTo(wx,F.H);ctx.stroke();
    ctx.setLineDash([]);
  }
  drawTiming();
  drawPassTarget();
  drawPreview();
  drawAim();
}
function drawAim(){
  if(!S.mouse.on||!S.ctrl||!S.running)return;
  const w=screenToWorld(S.mouse.sx,S.mouse.sy),p=S.ctrl;
  ctx.strokeStyle='rgba(255,255,255,.10)';ctx.lineWidth=.07;
  ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(w.x,w.y);ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,.62)';ctx.lineWidth=.085;
  ctx.beginPath();ctx.arc(w.x,w.y,.62,0,7);ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w.x-1.25,w.y);ctx.lineTo(w.x-.9,w.y);
  ctx.moveTo(w.x+.9,w.y);ctx.lineTo(w.x+1.25,w.y);
  ctx.moveTo(w.x,w.y-1.25);ctx.lineTo(w.x,w.y-.9);
  ctx.moveTo(w.x,w.y+.9);ctx.lineTo(w.x,w.y+1.25);
  ctx.stroke();
}
let aidN=0,aidPlan=null,aidCand=null;
function drawPassTarget(){
  const p=S.ctrl;
  if(!p||!S.running)return;
  if(--aidN<=0){
    aidN=4;
    aidPlan=p.hasBall()?passPlan(p,!!ACT.through):null;
    aidCand=p.hasBall()?null:switchCandidate();
  }
  if(p.hasBall()){
    const plan=aidPlan;
    if(!plan)return;
    ctx.setLineDash([.32,.28]);
    ctx.strokeStyle=plan.space?'rgba(255,209,102,.7)':'rgba(157,255,190,.8)';
    ctx.lineWidth=.1;
    if(plan.tgt){ctx.beginPath();ctx.arc(plan.tgt.x,plan.tgt.y,1.12,0,7);ctx.stroke();}
    ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(plan.x,plan.y);ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(plan.x-.5,plan.y-.5);ctx.lineTo(plan.x+.5,plan.y+.5);
    ctx.moveTo(plan.x+.5,plan.y-.5);ctx.lineTo(plan.x-.5,plan.y+.5);
    ctx.stroke();
    return;
  }
  // a quién saltarías con Q
  const cand=aidCand;
  if(!cand)return;
  ctx.strokeStyle='rgba(255,255,255,.45)';ctx.lineWidth=.09;
  ctx.beginPath();
  ctx.moveTo(cand.x,cand.y-1.5);ctx.lineTo(cand.x-.42,cand.y-2.1);
  ctx.lineTo(cand.x+.42,cand.y-2.1);ctx.closePath();ctx.stroke();
}
function drawTiming(){
  const p=S.ctrl,b=S.ball;
  if(!p||!S.running||b.owner||b.frozen)return;
  const d=dist(p,b);
  if(d>4.2||b.z>2.3)return;
  const q=clamp(1-Math.abs(d-1.15)/1.9,0,1);
  ctx.strokeStyle='rgba(255,209,102,'+(.18+q*.62)+')';
  ctx.lineWidth=.08+q*.11;
  ctx.beginPath();ctx.arc(p.x,p.y,1.15,0,7);ctx.stroke();
}
function drawPreview(){
  const p=S.ctrl;
  if(!p||!S.charging||!p.hasBall())return;
  const pl=shotPlan(p,clamp(S.charge/.95,.18,1),{});
  const ang=Math.atan2(pl.ay-p.y,pl.ax-p.x);
  let x=p.x,y=p.y,z=0,vx=Math.cos(ang)*pl.spd,vy=Math.sin(ang)*pl.spd,vz=pl.vz,spin=pl.spin;
  const dt=1/60, dip=pl.dip;
  ctx.beginPath();ctx.moveTo(x,y);
  let land=null;
  for(let i=0;i<80;i++){
    const sp0=Math.hypot(vx,vy);
    vz-=(9.81+dip*sp0)*dt; z+=vz*dt;
    if(z<=0){z=0; if(!land)land={x,y};
      if(Math.abs(vz)>.5){vz=-vz*clamp(.45+sp0*.008,.45,.78);vx*=.84;vy*=.84;}else vz=0;}
    const sp=Math.hypot(vx,vy);
    if(sp>1&&Math.abs(spin)>.05){const u=norm(vx,vy);vx+=-u.y*spin*sp*.055*dt;vy+=u.x*spin*sp*.055*dt;}
    x+=vx*dt;y+=vy*dt;
    ctx.lineTo(x,y-z*.42);
    if(x<-1.5||x>F.W+1.5||y<-1.5||y>F.H+1.5)break;
  }
  ctx.strokeStyle='rgba(255,47,142,.55)';ctx.lineWidth=.11;
  ctx.setLineDash([.55,.4]);ctx.stroke();ctx.setLineDash([]);
  if(land){
    ctx.strokeStyle='rgba(255,47,142,.4)';ctx.lineWidth=.08;
    ctx.beginPath();ctx.arc(land.x,land.y,.5,0,7);ctx.stroke();
  }
}
/* celebración: sacudida, zoom, confeti y ola en la grada */
const FIESTA={t:0, color:'#ff2f8e', bits:[], propio:true};
export function celebrar(color,propio){
  FIESTA.t=2.6; FIESTA.color=color; FIESTA.propio=propio; FIESTA.bits=[];
  for(let i=0;i<90;i++){
    const a=Math.random()*6.283, v=6+Math.random()*22;
    FIESTA.bits.push({x:S.ball.x,y:S.ball.y,
      vx:Math.cos(a)*v,vy:Math.sin(a)*v-6,vz:2+Math.random()*7,z:0,
      g:0.55+Math.random()*.4,r:Math.random()*6.283});
  }
}
export function pasoFiesta(dt){
  if(FIESTA.t<=0)return;
  FIESTA.t-=dt;
  for(const b of FIESTA.bits){
    b.vz-=22*dt; b.z+=b.vz*dt;
    if(b.z<0){b.z=0;b.vz*=-.4;b.vx*=.7;b.vy*=.7;}
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.vx*=.965; b.vy*=.965; b.r+=dt*7;
  }
}
function dibujarFiesta(){
  if(FIESTA.t<=0)return;
  const k=clamp(FIESTA.t/2.6,0,1);
  for(const b of FIESTA.bits){
    ctx.save();
    ctx.translate(b.x,b.y-b.z*.4); ctx.rotate(b.r);
    ctx.globalAlpha=k;
    ctx.fillStyle=FIESTA.color;
    ctx.fillRect(-.22,-.14,.44,.28);
    ctx.restore();
  }
  ctx.globalAlpha=1;
}
function dibujarCartelGol(){
  const c=S.celeb; if(!c)return;
  const k=clamp(c.t/2.6,0,1), ent=clamp((2.6-c.t)*4,0,1);
  const w=Math.min(520,cvW*.72), x=cvW/2-w/2, y=cvH*0.16-(1-ent)*30;
  ctx.globalAlpha=ent*(k>.15?1:k/.15);
  const col=c.team.pal?c.team.pal.main:'#ffffff';
  ctx.fillStyle='rgba(6,10,14,.88)';ctx.fillRect(x,y,w,64);
  ctx.fillStyle=col;ctx.fillRect(x,y,6,64);
  ctx.fillStyle=col;
  ctx.font='900 34px Archivo Black, Archivo, sans-serif';
  ctx.textAlign='left';ctx.textBaseline='middle';
  ctx.fillText(c.own?'EN PROPIA':'¡GOOOL!',x+20,y+22);
  ctx.fillStyle='#e8f2ec';ctx.font='700 15px Archivo, sans-serif';
  ctx.fillText((c.sc?c.sc.num+'  '+c.sc.name:'—')+'   ·   '+
    Math.floor((S.half-1)*45+S.clock/60)+"'",x+20,y+48);
  ctx.textAlign='right';
  ctx.font='900 26px Archivo Black, Archivo, sans-serif';
  ctx.fillStyle='#e8f2ec';
  ctx.fillText(S.teams[0].tag+'  '+S.score[0]+' - '+S.score[1]+'  '+S.teams[1].tag,x+w-18,y+34);
  ctx.globalAlpha=1;
}
function drawRepBanner(){
  const r=REP.activa; if(!r)return;
  const w=Math.min(300,cvW*.5), x=cvW/2-w/2, y=24;
  ctx.fillStyle='rgba(6,14,10,.85)';ctx.fillRect(x,y,w,30);
  ctx.fillStyle='#ff2f8e';ctx.fillRect(x,y,4,30);
  ctx.fillStyle='#e8f2ec';ctx.font='700 13px Archivo, sans-serif';
  ctx.textAlign='left';ctx.textBaseline='middle';
  ctx.fillText('◉ '+r.txt+' — repetición',x+14,y+15);
  const p=r.i/Math.max(1,r.frames.length);
  ctx.fillStyle='rgba(255,47,142,.6)';ctx.fillRect(x,y+28,w*p,2);
}
function drawCharge(){
  if(!S.charging&&!S.passing)return;
  const p=S.ctrl;if(!p)return;
  const v=S.charging?clamp(S.charge/.95,0,1):clamp(S.passHold/.55,0,1);
  const w=180,h=7,x=cvW/2-w/2,y=cvH-42;
  ctx.fillStyle='rgba(6,14,10,.8)';ctx.fillRect(x-2,y-2,w+4,h+4);
  ctx.fillStyle=S.charging?'#ff2f8e':'#9dffbe';ctx.fillRect(x,y,w*v,h);
  ctx.fillStyle='rgba(255,255,255,.25)';
  ctx.fillRect(x+w*.72,y,1.5,h);
}

/* ── loop ─────────────────────────────────────────────────── */

const cv=document.getElementById('cv'),ctx=cv.getContext('2d');
const radarCv=document.getElementById('radar'),rctx=radarCv.getContext('2d');
export let cvW=0,cvH=0,SC=12,SCbase=12,DPRCAP=1.5,lowFX=false,FPS=60;
let fpsN=0,fpsT=0;
/* FPS/DPRCAP/lowFX viven aquí (son del render), así que la lógica
   que los mide y ajusta también — game.js solo llama a esto cada
   cuadro con el dt, no puede tocar estas variables directamente
   (son un import de solo lectura desde su lado).                */
export function actualizarFPS(dt){
  fpsN++; fpsT+=dt;
  if(fpsT>=1){
    FPS=fpsN/fpsT; fpsN=0; fpsT=0;
    if(FPS<45&&DPRCAP>1&&S.tune.q<2){DPRCAP=1;resize();}
    else if(FPS<38&&!lowFX&&S.tune.q<2)lowFX=true;
  }
}
/* el slider de calidad gráfica (en Ajustes) también necesita escribir
   estas dos — mismo motivo, no puede asignarlas directo desde game.js */
export function setCalidad(v){
  DPRCAP=[1,1.5,2][v]||1.5; lowFX=(v===0);
}
/* game.js no puede tocar AFIC/pitchCv directo (son privadas de acá) —
   cuando cambia la cancha o la superficie, llama a esto para que el
   campo y el público se vuelvan a dibujar en vez de usar la caché vieja. */
export function invalidarCachesCancha(){
  AFIC=null; pitchCv=null;
}

export function drawRadar(){
  const w=radarCv.width,h=radarCv.height;
  rctx.clearRect(0,0,w,h);
  rctx.fillStyle='#0a1a12';rctx.fillRect(0,0,w,h);
  rctx.strokeStyle='rgba(255,255,255,.14)';rctx.lineWidth=1;
  rctx.strokeRect(6,6,w-12,h-12);
  rctx.beginPath();rctx.moveTo(w/2,6);rctx.lineTo(w/2,h-6);rctx.stroke();
  rctx.beginPath();rctx.arc(w/2,h/2,(h-12)*.135,0,7);rctx.stroke();
  const X=x=>6+(x/F.W)*(w-12), Y=y=>6+(y/F.H)*(h-12);
  for(const p of S.players){
    rctx.fillStyle=p.team.ai?'#39d7ff':'#ff2f8e';
    rctx.beginPath();rctx.arc(X(p.x),Y(p.y),p===S.ctrl?5:3.2,0,7);rctx.fill();
    if(p===S.ctrl){rctx.strokeStyle='#fff';rctx.lineWidth=1.4;rctx.stroke();}
  }
  const b=S.ball;
  rctx.fillStyle='#fff';rctx.beginPath();rctx.arc(X(b.x),Y(b.y),2.6,0,7);rctx.fill();
}

/* repDibujar se muda aquí desde Repeticiones — es la única función
   de ese sistema que necesita el canvas, así que pertenece con el
   resto de lo que dibuja, no con lo que solo guarda datos.        */
const _lerpAng=(a,b,t)=>{let d=b-a;while(d>Math.PI)d-=6.283185;while(d<-Math.PI)d+=6.283185;return a+d*t;};
function repDibujar(){
  const r=REP.activa; if(!r)return false;
  // Fotogramas grabados a 30 Hz reproducidos a 60+: sin interpolar se ve
  // a saltos. Mezclamos cada par de fotogramas con la fracción exacta.
  const i0=Math.min(r.i,r.frames.length-1);
  const i1=Math.min(i0+1,r.frames.length-1);
  const al=clamp(r.t-r.i,0,1);
  const A=r.frames[i0], B=r.frames[i1];
  const f=r.mix||(r.mix=new Float32Array(A.length));
  for(let k=0;k<A.length;k++)f[k]=A[k]+(B[k]-A[k])*al;
  const n=S.players.length;
  for(let i=0;i<n;i++){
    if(A[i*3+2]===-99||B[i*3+2]===-99){f[i*3+2]=-99;continue;}
    f[i*3+2]=_lerpAng(A[i*3+2],B[i*3+2],al);
  }
  for(let i=0;i<n;i++){
    const p=S.players[i];
    if(f[i*3+2]===-99)continue;
    ctx.save(); ctx.translate(f[i*3],f[i*3+1]);
    const pal=p.team.pal;
    ctx.beginPath();ctx.arc(0,0,.56,0,7);
    ctx.fillStyle=p.role==='GK'?'#ffd166':pal.main;ctx.fill();
    ctx.lineWidth=.11;ctx.strokeStyle=p.role==='GK'?'#7a5b12':pal.dark;ctx.stroke();
    const fa=f[i*3+2];
    ctx.beginPath();
    ctx.moveTo(Math.cos(fa)*.86,Math.sin(fa)*.86);
    ctx.lineTo(Math.cos(fa+2.5)*.46,Math.sin(fa+2.5)*.46);
    ctx.lineTo(Math.cos(fa-2.5)*.46,Math.sin(fa-2.5)*.46);
    ctx.closePath();ctx.fillStyle=pal.dark;ctx.globalAlpha=.75;ctx.fill();ctx.globalAlpha=1;
    ctx.restore();
  }
  const bx=f[n*3], by=f[n*3+1], bz=f[n*3+2];
  ctx.fillStyle='rgba(0,0,0,.3)';
  ctx.beginPath();ctx.ellipse(bx+bz*.16,by+.22,.26,.15,0,0,7);ctx.fill();
  ctx.beginPath();ctx.arc(bx,by-bz*.42,.17,0,7);ctx.fillStyle='#fdfdfb';ctx.fill();
  ctx.lineWidth=.05;ctx.strokeStyle='rgba(0,0,0,.55)';ctx.stroke();
  return true;
}
