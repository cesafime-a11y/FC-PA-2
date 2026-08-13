import { FORMS, FORMS7, getForms } from './data/formations.js';
import { PLANES } from './data/plans.js';
import { DIFFS } from './data/difficulty.js';
import { NAMES_H, NAMES_A } from './data/names.js';
import { clamp, lerp, dist, norm, segDist } from './core/math.js';
import { createRng } from './core/rng.js';
import { TUNE } from './core/tune.js';

const rng = createRng();
const DIBUJOS = () => getForms(S.cfg.f7);
'use strict';
const E={},$=id=>E[id]||(E[id]=document.getElementById(id));
/* Los paneles se redibujan con innerHTML: sus nodos cambian de identidad,
   así que la caché de arriba dejaría los clics atados a nodos muertos.
   Para todo lo que se regenera hay que consultar en vivo.            */
const $v=id=>document.getElementById(id);
/* ═══════════════════════════════════════════════════════════════
   FC PA — motor de fútbol
   unidades: metros y segundos. campo 105 x 68.
   ═══════════════════════════════════════════════════════════════ */

/* Dos canchas. Todo lo demás —física, IA, reglas, fuera de juego—
   se deriva de estas medidas, así que cambiarlas cambia el juego
   entero sin tocar una línea del motor.                          */
/* superficies: cambian el aspecto y cómo corre el balón */
const SUPERFICIES={
  cesped :{lbl:'Césped natural', a:'#153320', b:'#112a1b', linea:'rgba(236,255,244,.55)', roz:.986, veta:.05},
  sintetico:{lbl:'Sintético', a:'#0f3a2a', b:'#0c3124', linea:'rgba(255,255,255,.7)',   roz:.989, veta:.03},
  seco   :{lbl:'Campo seco',  a:'#3a3524', b:'#332e1f', linea:'rgba(255,246,214,.5)',  roz:.978, veta:.08},
  nocturno:{lbl:'Nocturno',   a:'#0d2a1c', b:'#0a2317', linea:'rgba(190,255,220,.75)', roz:.986, veta:.04}
};
let SUP=SUPERFICIES.cesped;
const CANCHAS={
  f11:{W:105,H:68,GW:7.32,GH:2.44,BOX:16.5,BOXW:40.32,SIX:5.5,SIXW:18.32,SPOT:11,CIRC:9.15,MG:6},
  f7 :{W:65, H:45,GW:6.0, GH:2.0, BOX:12.0,BOXW:26.0, SIX:4.0,SIXW:12.0, SPOT:9, CIRC:6.5, MG:5}
};
let F=Object.assign({},CANCHAS.f11);
let CY=F.H/2, GT=CY-F.GW/2, GB=CY+F.GW/2;
const ESC=()=>F.W/105;      // factor de escala respecto a la cancha grande
function setCancha(tipo){
  F=Object.assign({},CANCHAS[tipo]||CANCHAS.f11);
  AFIC=null;
  CY=F.H/2; GT=CY-F.GW/2; GB=CY+F.GW/2;
  pitchCv=null;                      // el campo pre-renderizado ya no sirve
}
const DT=1/60;


const rnd=(a,b)=>rng.range(a,b);

function gauss(){let u=0,v=0;while(!u)u=rng.rand();while(!v)v=rng.rand();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}



/* ── plantillas ───────────────────────────────────────────── */



/* ── planteamientos: multiplican cómo se comporta el equipo ── */



/* Perillas de calibración. Las toco desde el banco de pruebas para
   barrer valores y quedarme con el que da marcadores creíbles.     */



/* ── estado ───────────────────────────────────────────────── */
const S={
  phase:'menu', running:false, half:1, clock:0, halfLen:210,
  score:[0,0], teams:[], players:[], ball:null, feed:[],
  cfg:{mode:'match', diff:'duro', form:'4-3-3', len:210, offside:true, fouls:true},
  training:false, drill:null, offsideOn:true,
  D:DIFFS.duro, poss:null, lastTouchTeam:null,
  cam:{x:52.5,y:CY}, shake:0, freeze:0, restart:null, offside:null,
  possTick:[0,0], stats:null, ctrl:null, switchCd:0,
  charge:0, charging:false, passHold:0, passing:false, noPress:0, deadline:0,
  mouse:{sx:0,sy:0,on:false}, view:null, zoom:1, goals:[], lastPass:null,
  hudOn:true, hintOn:true, switchLock:0, cycleT:0, recent:[],
  tune:{pow:1, cone:1, sw:1, q:1}
};

/* ── entidades ────────────────────────────────────────────── */
let UID=0;
function attrs(role,q){
  let A;
  if(role==='GK') A={pace:rnd(56,66),acc:26,ctl:rnd(52,66),pas:rnd(58,72),sho:32,tkl:44,ref:rnd(70,88),stm:rnd(78,90)};
  else if(role==='DF') A={pace:rnd(70,84),acc:rnd(27,33),ctl:rnd(58,72),pas:rnd(62,76),sho:rnd(38,54),tkl:rnd(74,89),ref:40,stm:rnd(76,88)};
  else if(role==='MF') A={pace:rnd(70,83),acc:rnd(28,34),ctl:rnd(70,84),pas:rnd(74,89),sho:rnd(58,74),tkl:rnd(62,78),ref:40,stm:rnd(82,94)};
  else A={pace:rnd(74,88),acc:rnd(30,36),ctl:rnd(70,85),pas:rnd(64,80),sho:rnd(74,90),tkl:rnd(42,60),ref:40,stm:rnd(74,86)};
  for(const k in A) if(k!=='acc') A[k]=Math.round(clamp(A[k]+(q-.5)*20,25,92));
  A.acc=Math.round(clamp(A.acc+(q-.5)*4,22,38));
  return A;
}

class Player{
  constructor(team,i,slot,name,num,q){
    this.id=++UID; this.team=team; this.i=i; this.role=slot[0];
    this.fx=slot[1]; this.fy=slot[2]; this.name=name; this.num=num;
    this.a=attrs(slot[0],q);
    this.x=0;this.y=0;this.vx=0;this.vy=0;this.face=team.dir>0?0:Math.PI;
    this.stam=100; this.md={x:0,y:0}; this.sprint=false;
    this.cool=0; this.slide=0; this.slideDir={x:0,y:0}; this.hold=0;
    this.yellow=0; this.off=false; this.react=0; this.think=0;
    this.dive=0; this.mark=null; this.runT=rnd(0,3);
    this.goals=0; this.assists=0; this.shield=0; this.ftBoost=0; this.touchT=0;
    this.regate=0; this.regCd=0; this.desq=0; this.rojo=false;
    this.mPases=0; this.mEntradas=0; this.mKm=0; this.mTiros=0;
  }
  get maxSpd(){
    const st=(.855+.145*(this.stam/100))*(this.desq>0?.86:1);
    const base=(5.15+this.a.pace/100*2.55)*st*(this.team.ai?S.D.spd:1);
    return base*(this.sprint?1.09:.73);   // trote 5.1 m/s ↔ sprint 7.7 m/s
  }
  home(){
    const t=this.team;
    return t.dir>0?{x:this.fx*F.W,y:this.fy*F.H}:{x:F.W-this.fx*F.W,y:F.H-this.fy*F.H};
  }
  hasBall(){return S.ball.owner===this;}
}

/* La plantilla vive aparte del once: 18 fichas con sus atributos.
   El once es una lista de índices dentro de la plantilla.        */
/* ── BANQUILLO Y EXPULSIONES ─────────────────────────────── */
function sustituir(t,idxCampo,fichaIdx){
  if(!t||t.cambios<=0)return false;
  const viejo=t.players[idxCampo];
  if(!viejo||t.once.includes(fichaIdx))return false;
  const D=DIBUJOS(); const sl=(D[t.form]||D[Object.keys(D)[0]])[viejo.i]||['MF',.4,.5];
  const f=t.squad[fichaIdx];
  const np=new Player(t,viejo.i,sl,f.name,f.num,.5);
  np.a=Object.assign({},f.a); np.ficha=fichaIdx;
  np.x=viejo.x; np.y=viejo.y; np.face=viejo.face; np.stam=100;
  t.players[idxCampo]=np; t.once[idxCampo]=fichaIdx;
  const gi=S.players.indexOf(viejo); if(gi>=0)S.players[gi]=np;
  if(S.ball.owner===viejo)S.ball.owner=np;
  if(S.ctrl===viejo)S.ctrl=np;
  if(t.gk===viejo)t.gk=np;
  if(t.star===viejo)t.star=np;
  t.cambios--;
  say(`🔄 ${t.tag}: entra ${np.num} ${np.name} por ${viejo.name}`, t.ai?'aw':'');
  return true;
}
function expulsar(p,motivo){
  const t=p.team; p.rojo=true;
  const gi=S.players.indexOf(p); if(gi>=0)S.players.splice(gi,1);
  const li=t.players.indexOf(p); if(li>=0){t.players.splice(li,1); t.once.splice(li,1);}
  if(S.ball.owner===p)S.ball.owner=null;
  if(t.gk===p&&t.players.length){          // sin portero: alguien se pone los guantes
    t.gk=t.players[0]; t.gk.role='GK'; t.gk.fx=.045; t.gk.fy=.5;
    say(`${t.gk.name} se pone de portero`, t.ai?'aw':'nt');
  }
  if(S.ctrl===p){S.ctrl=null;S.switchCd=0;switchPlayer();}
  S.stats.rc[ti(t)]++;
  SFX.silbato();
  say(`🟥 ROJA · ${p.num} ${p.name} — ${motivo}`,'nt');
  flash('EXPULSADO');
}
/* la IA refresca piernas y cubre bajas en las paradas */
function cambiosIA(t){
  if(!t.ai||t.cambios<=0||!S.restart)return;
  let peor=-1,ps=100;
  t.players.forEach((p,i)=>{ if(p.role!=='GK'&&p.stam<ps){ps=p.stam;peor=i;} });
  if(peor<0||ps>34)return;
  const rol=t.players[peor].role;
  let mejor=-1,ms=-1;
  t.squad.forEach((f,i)=>{
    if(t.once.includes(i)||f.role==='GK')return;
    const enc=(f.role===rol)?25:0;
    const v=(f.a.pace+f.a.ctl+f.a.pas+f.a.sho+f.a.tkl)/5+enc;
    if(v>ms){ms=v;mejor=i;}
  });
  if(mejor>=0)sustituir(t,peor,mejor);
}
function makeSquad(ai,q,seedNames){
  const names=seedNames||(ai?NAMES_A:NAMES_H);
  const roles=['GK','GK','DF','DF','DF','DF','DF','DF','MF','MF','MF','MF','MF','FW','FW','FW','FW','FW'];
  const nums=[1,13,2,3,4,5,15,16,6,8,10,14,17,7,9,11,18,19];
  return roles.map((r,i)=>({
    name:names[i%names.length]+(i>=names.length?' '+Math.floor(i/names.length+1):''),
    num:nums[i], role:r, a:attrs(r,q)
  }));
}
function makeTeam(name,tag,ai,dir,form,q,pal,squad,once,plan){
  const t={name,tag,ai,dir,form,pal,players:[],idx:ai?1:0,cambios:3,
           plan:PLANES[plan||'equilibrado'], squad:squad||makeSquad(ai,q)};
  const D0=DIBUJOS();
  // si el dibujo no existe en esta modalidad (un 4-4-2 en fútbol 7), se
  // resuelve al primero válido Y se guarda el resuelto: antes el equipo
  // conservaba un nombre de formación que no existía.
  const key=D0[form]?form:Object.keys(D0)[0];
  t.form=key;
  const slots=D0[key];
  // el once: por defecto el mejor ajuste por demarcación
  let xi=once;
  if(!xi){
    xi=[]; const usados=new Set();
    slots.forEach(sl=>{
      let best=-1,bs=-1e9;
      t.squad.forEach((f,i)=>{
        if(usados.has(i))return;
        const enc=(f.role===sl[0])?60:(f.role==='GK'||sl[0]==='GK'?-500:0);
        const val=f.a.pace+f.a.ctl+f.a.pas+f.a.sho+f.a.tkl+enc;
        if(val>bs){bs=val;best=i;}
      });
      usados.add(best); xi.push(best);
    });
  }
  t.once=xi;
  xi.forEach((fi,i)=>{
    const f=t.squad[fi], sl=slots[i];
    const p=new Player(t,i,sl,f.name,f.num,.5);
    p.a=Object.assign({},f.a);
    p.ficha=fi;
    t.players.push(p);
  });
  if(!ai){
    // tu delantero de referencia sigue siendo el 66
    const fw=t.players.filter(p=>p.role==='FW').sort((a,b)=>b.a.sho-a.a.sho)[0];
    if(fw){fw.name='Sancho';fw.num=66;fw.a.sho=93;fw.a.ctl=86;fw.a.pas=82;fw.a.pace=74;fw.a.stm=84;t.star=fw;}
  }
  t.gk=t.players[0];
  return t;
}

/* ══ TUTORIAL ═════════════════════════════════════════════
   Las mecánicas buenas están escondidas: nadie descubre solo el
   remate de primera ni el control orientado. Esto las enseña.   */
const TUTO={
  pasos:[
    {t:'MOVERTE Y ESPRINTAR', d:'W A S D para correr y el ratón para apuntar. Mantén <b>Shift</b> o <b>F</b> para esprintar.',
     meta:'corre 40 m esprintando', chk:c=>c.sprint>40},
    {t:'PASE', d:'<b>Clic derecho</b> pasa al compañero que señala el cursor. El anillo verde marca el destino.',
     meta:'3 pases', chk:c=>c.pases>=3},
    {t:'PASE FILTRADO', d:'Mantén <b>Z</b> y haz <b>clic izquierdo</b>: el balón va al hueco que apuntas, no a los pies.',
     meta:'1 filtrado', chk:c=>c.filtrados>=1},
    {t:'REGATE', d:'<b>R</b> o clic central: quiebre lateral. Deja al defensor a contrapié, pero gasta aire y falla si no hay hueco.',
     meta:'2 regates', chk:c=>c.regates>=2},
    {t:'CONTROL ORIENTADO', d:'<b>E</b> al recibir: matas el balón y lo empujas hacia el cursor con un empujón de aceleración.',
     meta:'2 controles', chk:c=>c.controles>=2},
    {t:'REMATE DE PRIMERA', d:'Con el balón viajando hacia ti, <b>clic izquierdo</b> sin controlarlo. Bien enganchado sale más fuerte y preciso que cualquier tiro.',
     meta:'1 gol de primera', chk:c=>c.primera>=1},
    {t:'TIRO ELEVADO', d:'<b>E</b> + clic izquierdo levanta el balón sobre la barrera y lo hace bajar bajo el larguero.',
     meta:'1 gol por elevación', chk:c=>c.elevados>=1}
  ],
  i:0, c:null, hecho:0
};
function tutoIniciar(){
  TUTO.i=0; TUTO.hecho=0;
  TUTO.c={sprint:0,pases:0,filtrados:0,regates:0,primera:0,controles:0,elevados:0};
}
function tutoPaso(dt){
  if(S.cfg.mode!=='tuto'||!TUTO.c)return;
  const p=S.ctrl;
  if(p&&p.sprint)TUTO.c.sprint+=Math.hypot(p.vx,p.vy)*dt;
  const paso=TUTO.pasos[TUTO.i];
  if(!paso)return;
  if(paso.chk(TUTO.c)){
    TUTO.i++; TUTO.hecho=1.6; SFX.silbato();
    if(TUTO.i>=TUTO.pasos.length){ S.running=false; S.phase='end'; onTutoFin(); }
    else flash('¡HECHO!');
  }
  if(TUTO.hecho>0)TUTO.hecho-=dt;
}
function onTutoFin(){
  flash('TUTORIAL COMPLETO');
  const g=$('endGrade'); if(g){g.textContent='✓';g.style.color='#63e6a0';}
  if($('endTitle'))$('endTitle').textContent='TUTORIAL COMPLETO';
  if($('endLine'))$('endLine').textContent='Ya conoces las siete mecánicas que deciden partidos. Ninguna sobra en dificultad Brutal.';
  if($('scorers'))$('scorers').innerHTML=TUTO.pasos.map(x=>`<div><b>✓</b>${x.t}</div>`).join('');
  $('end').classList.remove('hide');
}
function tutoTexto(){
  const paso=TUTO.pasos[TUTO.i];
  if(!paso)return 'Tutorial completado.';
  return `<b>${TUTO.i+1}/${TUTO.pasos.length} · ${paso.t}</b> — ${paso.d} <b>[${paso.meta}]</b>`;
}

/* ── sala de entrenamiento ────────────────────────────────── */
const DRILL_NAMES={d1v1:'1 VS 1',d2v2:'2 VS 2',pen:'PENALES',fk:'TIROS LIBRES',tuto:'TUTORIAL'};
function trimTeam(t,roles,n){
  const gk=t.gk;
  let rest=t.players.filter(p=>p!==gk&&roles.indexOf(p.role)>=0);
  rest.sort((a,b)=>(b===t.star?1:0)-(a===t.star?1:0));
  const quedan=[gk].concat(rest.slice(0,n));
  // el once tiene que seguir cuadrando con los jugadores: si no, una
  // sustitución acabaría cambiando al jugador equivocado.
  if(t.once&&t.once.length)
    t.once=quedan.map(p=>(p.ficha!==undefined?p.ficha:0));
  t.players=quedan;
}
function setupDrill(){
  const home=S.teams[0],away=S.teams[1],d=S.drill.type;
  if(d==='tuto'){trimTeam(home,['FW','MF','DF'],4);trimTeam(away,['DF'],2);}
  else if(d==='d2v2'){trimTeam(home,['FW','MF'],2);trimTeam(away,['DF'],2);}
  else if(d==='fk'){trimTeam(home,['FW'],1);trimTeam(away,['DF'],3);}
  else {trimTeam(home,['FW'],1);trimTeam(away,['DF'],0);}
  // BUG: los compañeros conservaban su demarcación del 11 inicial, así que un
  // central se replegaba a su banda en vez de acompañar el ataque. En un
  // ejercicio la referencia de posición tiene que ser el ejercicio, no el once.
  const att=home.players.filter(q=>q.role!=='GK');
  att.forEach((q,i)=>{
    q.fx=0.60+0.07*(i%2);
    q.fy=clamp(0.20+0.60*(att.length>1?i/(att.length-1):0.5),0.12,0.88);
    q.role=(i===0)?'FW':'MF';
  });
  const def=away.players.filter(q=>q.role!=='GK');
  def.forEach((q,i)=>{
    q.fx=0.17+0.05*(i%2);
    q.fy=clamp(0.30+0.40*(def.length>1?i/(def.length-1):0.5),0.15,0.85);
    q.role='DF';
  });
  S.players=home.players.concat(away.players);
  resetDrill();
}
function resetDrill(){
  const home=S.teams[0],away=S.teams[1],b=S.ball,d=S.drill.type;
  for(const p of S.players){
    p.vx=p.vy=0;p.md={x:0,y:0};p.slide=0;p.cool=0;p.hold=0;p.wall=false;
    p.shield=0;p.ftBoost=0;p.think=0;p.stam=Math.max(p.stam,72);
  }
  home.gk.x=1.1;home.gk.y=CY;
  away.gk.x=F.W-1.1;away.gk.y=CY;
  const att=home.players.filter(p=>p.role!=='GK');
  const def=away.players.filter(p=>p.role!=='GK');
  let bx,by;
  if(d==='pen'){
    bx=F.W-F.SPOT;by=CY;
    att[0].x=bx-1.7;att[0].y=CY;att[0].face=0;
    S.drill.hold=true;
  }else if(d==='fk'){
    bx=F.W-rnd(19,27); by=CY+rnd(-13,13);
    att[0].x=bx-1.5;att[0].y=by+.5;att[0].face=0;
    const u=norm(F.W-bx,CY-by);
    def.forEach((q,i)=>{
      const off=(i-(def.length-1)/2)*1.05;
      q.wall=true;
      q.x=bx+u.x*9.4-u.y*off; q.y=by+u.y*9.4+u.x*off;
      q.face=Math.atan2(by-q.y,bx-q.x);
    });
    S.drill.hold=true;
  }else{
    bx=F.W-rnd(28,38); by=CY+rnd(-9,9);
    att.forEach((q,i)=>{q.x=bx-1.8-i*4;q.y=by+(i?10:0);q.face=0;});
    def.forEach((q,i)=>{q.x=F.W-rnd(12,17);q.y=CY+(i?8:-8);});
    S.drill.hold=false;
  }
  b.x=bx;b.y=by;b.px=bx;b.py=by;b.pz=0;
  b.vx=b.vy=b.vz=0;b.z=0;b.spin=0;b.trail=[];b.frozen=false;
  b.isShot=false;b.block=null;b.blockT=0;
  b.owner=att[0];att[0].touchT=0;
  S.poss=home;S.lastTouchTeam=home;S.ctrl=att[0];
  S.restart=null;S.offside=null;S.lastPass=null;S.freeze=0;
  S.noPress=S.drill.hold?99:0;
  S.drill.defT=0;S.drill.t=0;
}
function drillMiss(txt){
  if(S.freeze>0)return;
  S.drill.att++;
  if(txt)say(txt,'nt');
  S.ball.frozen=true;S.freeze=1.1;S.deadline=resetDrill;
}
/* bloqueos con el cuerpo: hace que la barrera y los defensas sirvan */
function blockStep(){
  const b=S.ball;
  if(b.owner||b.frozen)return;
  const sp=Math.hypot(b.vx,b.vy);
  if(sp<13)return;
  for(const p of S.players){
    if(p.role==='GK')continue;
    if(p===b.block&&b.blockT>0)continue;
    if(b.lastTouch&&p.team===b.lastTouch.team&&!p.wall)continue;
    if(Math.abs(p.x-b.x)>.65||Math.abs(p.y-b.y)>.65||b.z>1.95)continue;
    const u=norm(b.x-p.x+gauss()*.2,b.y-p.y+gauss()*.2);
    b.vx=u.x*sp*.42; b.vy=u.y*sp*.42;
    b.vz=Math.max(b.vz*.5,.6+sp*.085);
    b.block=p;b.blockT=.35;b.lastTouch=p;S.lastTouchTeam=p.team;b.isShot=false;
    say(`Bloqueo de ${p.name}`,p.team.ai?'aw':'');
    return;
  }
}

/* ── arranque ─────────────────────────────────────────────── */
function newMatch(){
  // fútbol 7 se juega siempre en sintético; en 11 la cancha se sortea
  if(S.cfg.f7) SUP=SUPERFICIES.sintetico;
  else if(!S.cfg.sup||S.cfg.sup==='azar'){
    const ks=['cesped','cesped','cesped','seco','nocturno','sintetico'];  // el césped pesa más
    SUP=SUPERFICIES[ks[(Math.random()*ks.length)|0]];
  }
  else SUP=SUPERFICIES[S.cfg.sup]||SUPERFICIES.cesped;
  pitchCv=null;
  setCancha(S.cfg.f7?'f7':'f11');
  if(S.cfg.f7&&!FORMS7[S.cfg.form])S.cfg.form='2-3-1';
  if(!S.cfg.f7&&!FORMS[S.cfg.form])S.cfg.form='4-3-3';
  S.miOnce=null;
  S.D=DIFFS[S.cfg.diff];
  S.halfLen=S.cfg.len; S.half=1; S.clock=0; S.score=[0,0];
  S.feed=[]; S.possTick=[0,0]; S.freeze=0; S.shake=0; S.offside=null;
  S.goals=[]; S.lastPass=null; S.zoom=1; repIniciar();
  NAR.dichas=[]; NAR.ult=0;
  S.training=S.cfg.mode!=='match';
  if(S.cfg.mode==='tuto')tutoIniciar();
  S.drill=S.training?{type:S.cfg.mode,att:0,defT:0,hold:false}:null;
  S.offsideOn=S.cfg.offside&&!S.training;
  S.stats={sh:[0,0],so:[0,0],pa:[0,0],fo:[0,0],co:[0,0],yc:[0,0],rc:[0,0]};
  S.anadido=0;
  const home=makeTeam(MIEQUIPO.name,MIEQUIPO.tag,false,1,S.cfg.form,.55,
    MIEQUIPO.pal, S.miPlantilla, S.miOnce?S.miOnce.slice():null, S.miPlan);
  const rv=S.compRival||S.carRival;
  const away=rv
    ? makeTeam(rv.name,rv.tag,true,-1,rv.form,rv.q,rv.pal,null,null,rv.plan)
    : makeTeam('Rivales FC','RIV',true,-1,Math.random()<.5?'4-3-3':'4-4-2',S.D.q,
        {main:'#39d7ff',dark:'#0a2634',txt:'#062330'});
  S.teams=[home,away];
  S.players=home.players.concat(away.players);
  S.ball={x:F.W/2,y:CY,vx:0,vy:0,z:0,vz:0,spin:0,rot:0,owner:null,
          px:F.W/2,py:CY,pz:0,
          lastTouch:null,block:null,blockT:0,frozen:false,trail:[]};
  S.ctrl=home.star||home.players.filter(p=>p.role!=='GK').pop()||home.players[0];
  S.poss=null; S.lastTouchTeam=null;
  $('hTag').textContent=home.tag;
  $('aTag').textContent=away.tag;
  if(S.training){ setupDrill(); S.phase='play'; S.running=true;
    say('Entrenamiento: '+DRILL_NAMES[S.drill.type],'nt'); return; }
  kickoff(home);
  S.phase='play'; S.running=true;
  say('Rueda el balón en el '+home.name,'nt');
}
const other=t=>t===S.teams[0]?S.teams[1]:S.teams[0];
const ti=t=>t===S.teams[0]?0:1;

function placeFormation(t,kickTeam){
  for(const p of t.players){
    const h=p.home();
    let x=h.x,y=h.y;
    // comprimir en el propio campo al saque
    x=t.dir>0?Math.min(x,F.W/2-1.2):Math.max(x,F.W/2+1.2);
    if(t===kickTeam && (p.role==='FW')){
      x=t.dir>0?F.W/2-2.5:F.W/2+2.5;
    }
    p.x=x;p.y=y;p.vx=0;p.vy=0;p.md={x:0,y:0};p.slide=0;p.hold=0;
  }
}
function kickoff(kickTeam){
  const b=S.ball;
  b.x=F.W/2;b.y=CY;b.vx=0;b.vy=0;b.z=0;b.vz=0;b.spin=0;b.owner=null;b.frozen=true;b.trail=[];
  for(const t of S.teams) placeFormation(t,kickTeam);
  S.restart={type:'kickoff',team:kickTeam,pos:{x:F.W/2,y:CY},taker:null,t:0};
  S.noPress=0;
  // el que saca
  // ojo: en fútbol 7 (o con expulsados) puede no quedar ningún delantero
  const campo=kickTeam.players.filter(p=>p.role!=='GK');
  const cand=campo.filter(p=>p.role==='FW');
  const taker=cand[0]||campo[campo.length-1]||kickTeam.players[0];
  if(!taker)return;
  taker.x=F.W/2-kickTeam.dir*1.2; taker.y=CY+.6;
  S.restart.taker=taker;
  if(!kickTeam.ai) S.ctrl=taker;
}


/* ══ NARRACIÓN ════════════════════════════════════════════
   No inventa nada: todo sale de datos que el motor ya lleva.  */
const NAR={ult:0, dichas:[]};
function narrar(txt,tipo){
  if(!txt)return;
  if(NAR.dichas.includes(txt))return;
  NAR.dichas.push(txt); if(NAR.dichas.length>12)NAR.dichas.shift();
  say('🎙 '+txt, tipo||'');
  NAR.ult=S.clock;
}
function narrarGol(sc,as,scorer,own){
  if(!sc)return;
  const temporada=(CAR&&CAR.goleadores&&CAR.goleadores[sc.name])||0;
  const enPartido=sc.goals;
  const min=Math.floor((S.half-1)*45+S.clock/60)+1;
  if(own){ narrar(`${sc.name} la manda a su propia portería. Silencio en la grada.`,'nt'); return; }
  if(enPartido===3)      narrar(`¡Triplete de ${sc.name}! Se lleva el balón a casa.`,'nt');
  else if(enPartido===2) narrar(`Segundo de ${sc.name} en el partido. Está desatado.`,'nt');
  else if(temporada>=4)  narrar(`${sc.name} llega a ${temporada+1} goles esta temporada.`,'nt');
  else if(min>=85)       narrar(`¡En el 85! ${sc.name} decide el partido en el último suspiro.`,'nt');
  else if(as)            narrar(`${as.name} la pone, ${sc.name} la empuja. Jugada de manual.`,'nt');
  else                   narrar(`Gol de ${sc.name}. ${S.teams[0].tag} ${S.score[0]}-${S.score[1]} ${S.teams[1].tag}`,'nt');
}
function narrarFalta(off,t){
  const f=S.stats.fo[ti(t)];
  if(off.yellow>=1&&f>=5) narrar(`${off.name} ya va con amarilla y sigue entrando fuerte. Peligro.`,'nt');
  else if(f===5)          narrar(`Quinta falta del ${t.tag}. El árbitro empieza a cansarse.`,'');
  else if(f===10)         narrar(`Diez faltas del ${t.tag}: están rompiendo el ritmo a propósito.`,'');
}
function narrarAmbiente(dt){
  if(!S.running||S.freeze>0||S.tanda)return;
  if(S.clock-NAR.ult<70)return;                 // no atosigar
  const min=Math.floor((S.half-1)*45+S.clock/60);
  const pos=100*S.possTick[0]/Math.max(.1,S.possTick[0]+S.possTick[1]);
  const dif=S.score[0]-S.score[1];
  const remA=S.stats.sh[0], remB=S.stats.sh[1];
  const cands=[];
  if(min>=80&&dif===0) cands.push('Últimos diez minutos y el marcador sigue igualado.');
  if(min>=80&&dif===1) cands.push('Un gol arriba y el reloj corriendo. A sufrir.');
  if(min>=80&&dif===-1)cands.push('Queda poco y hay que ir a por el empate.');
  if(pos>=64)          cands.push(`El ${S.teams[0].tag} tiene el balón: ${pos.toFixed(0)}% de posesión.`);
  if(pos<=36)          cands.push(`El ${S.teams[1].tag} se ha adueñado del balón.`);
  if(remA>=8&&S.score[0]===0)cands.push(`${remA} remates y ningún gol. Falta puntería.`);
  if(remB>=6&&S.score[1]===0)cands.push('El rival lo intenta pero no encuentra la portería.');
  if(S.stats.co[0]>=4) cands.push(`Cuarto córner del ${S.teams[0].tag}. Están instalados en el área.`);
  const flojo=S.teams[0].players.filter(p=>p.stam<35).length;
  if(flojo>=4)         cands.push(`${flojo} de los tuyos están fundidos. Toca mover el banquillo.`);
  if(!cands.length)return;
  narrar(cands[(Math.random()*cands.length)|0],'');
}

/* ══ MODO CARRERA ═════════════════════════════════════════
   Tres divisiones de ocho, temporadas a doble vuelta, ascensos y
   descensos, envejecimiento, cantera y retiros. Todo persistente. */
const DIVS=['TERCERA','SEGUNDA','PRIMERA'];
const NOMBRES_CLUB=['Ferroviaria','Cementeros','Olmeca','Lobos del Sur','Marina','Astilleros',
 'Racing Valle','Minerva','Corsarios','Halcones','Cantera Roja','Dep. Sierra','Atl. Norte',
 'U. Costera','Real Bravo','Independiente','Juventud','Alfareros','Portuarios','Cóndores',
 '兵','Estrella Polar','Aurora FC','Vulcano'];
const PALCLUB=[['#39d7ff','#06202b'],['#ff5f4d','#2a0d09'],['#9dff6b','#12250a'],['#ffd166','#2b2205'],
 ['#c084fc','#1e0f2b'],['#f1f5f9','#1b1f26'],['#fb923c','#2a1408'],['#2dd4bf','#07231f'],
 ['#a3e635','#18230a'],['#60a5fa','#0b1a30'],['#f472b6','#2b0d1c'],['#facc15','#2a2205']];
let CAR=null;
function clubGenerado(i,div){
  const nm=NOMBRES_CLUB[i%NOMBRES_CLUB.length]+(i>=NOMBRES_CLUB.length?' B':'');
  const pal=PALCLUB[i%PALCLUB.length];
  const forms=['4-4-2','4-3-3','3-5-2','4-2-3-1','5-3-2','4-1-4-1','3-4-3'];
  const planes=['equilibrado','ofensivo','defensivo','presion','contra'];
  return {name:nm, tag:nm.replace(/[^A-Za-zÁÉÍÓÚÑ]/g,'').slice(0,3).toUpperCase(),
    q:clamp(.34+div*.14+rnd(-.05,.09),.28,.86),
    form:forms[(Math.random()*forms.length)|0], plan:planes[(Math.random()*planes.length)|0],
    pal:{main:pal[0],dark:pal[1],txt:pal[1]}};
}
function nuevaCarrera(){
  const divs=[];
  let idx=0;
  for(let d=0;d<3;d++){
    const eq=[];
    for(let i=0;i<8;i++) eq.push(clubGenerado(idx++,d));
    divs.push(eq);
  }
  // empiezas en Tercera, ocupando una plaza
  divs[0][0]={name:MIEQUIPO.name,tag:MIEQUIPO.tag,q:.50,yo:true,
              form:S.cfg.form,plan:S.miPlan,pal:MIEQUIPO.pal};
  CAR={temporada:1, div:0, divs, jornada:0, calendario:null, tabla:null,
       palmares:[], objetivo:'', avisos:0, ultima:null, fin:false};
  armarTemporada();
  return CAR;
}
function armarTemporada(){
  const eq=CAR.divs[CAR.div];
  const n=eq.length, idx=eq.map((_,i)=>i), jor=[];
  for(let v=0;v<2;v++){
    for(let r=0;r<n-1;r++){
      const j=[];
      for(let i=0;i<n/2;i++){const a=idx[i],b=idx[n-1-i];j.push((r+v)%2?[b,a]:[a,b]);}
      jor.push(j); idx.splice(1,0,idx.pop());
    }
  }
  CAR.calendario=jor; CAR.jornada=0; CAR.fase='liga';
  CAR.copa=null;
  CAR.tabla=eq.map(()=>({pj:0,g:0,e:0,p:0,gf:0,gc:0,pts:0}));
  CAR.goleadores={};
  CAR.objetivo=CAR.div===2?'mantener la categoría':(CAR.div===1?'pelear el ascenso':'ascender');
}
const miCar=()=>CAR.divs[CAR.div].findIndex(e=>e.yo);
function partidoCarrera(){
  if(!CAR||CAR.fin||CAR.jornada>=CAR.calendario.length)return null;
  const yo=miCar();
  const par=CAR.calendario[CAR.jornada].find(x=>x[0]===yo||x[1]===yo);
  if(!par)return null;
  return {rival:CAR.divs[CAR.div][par[0]===yo?par[1]:par[0]], local:par[0]===yo};
}
function cerrarJornadaCarrera(gf,gc){
  if(!CAR||CAR.fin)return;
  const yo=miCar(), eq=CAR.divs[CAR.div];
  for(const [a,b] of CAR.calendario[CAR.jornada]){
    let ga,gb;
    if(a===yo||b===yo){ga=(a===yo)?gf:gc;gb=(a===yo)?gc:gf;}
    else [ga,gb]=simular(eq[a].q,eq[b].q);
    const A=CAR.tabla[a],B=CAR.tabla[b];
    A.pj++;B.pj++;A.gf+=ga;A.gc+=gb;B.gf+=gb;B.gc+=ga;
    if(ga>gb){A.g++;B.p++;A.pts+=3;}else if(gb>ga){B.g++;A.p++;B.pts+=3;}
    else{A.e++;B.e++;A.pts++;B.pts++;}
  }
  // goleadores: los tuyos de verdad, los ajenos estimados
  for(const g of S.goals||[]) if(g.sc&&g.team===S.teams[0])
    CAR.goleadores[g.sc.name]=(CAR.goleadores[g.sc.name]||0)+1;
  CAR.jornada++;
  if(CAR.jornada>=CAR.calendario.length) empezarCopa();
  guardar();
}
/* ── copa de la temporada: los ocho de tu división, a partido único ── */
function empezarCopa(){
  CAR.fase='copa';
  const idx=CAR.divs[CAR.div].map((_,i)=>i);
  for(let i=idx.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;const t=idx[i];idx[i]=idx[j];idx[j]=t;}
  CAR.copa={vivos:idx, ronda:0, cr:[], historial:[], campeon:null};
  crucesCopa();
}
function crucesCopa(){
  const c=CAR.copa; c.cr=[];
  for(let i=0;i<c.vivos.length;i+=2) c.cr.push([c.vivos[i],c.vivos[i+1]]);
}
const RONDAS_CAR=['CUARTOS','SEMIFINAL','FINAL'];
function partidoCopa(){
  if(!CAR.copa||CAR.copa.campeon!==null)return null;
  const yo=miCar();
  const cr=CAR.copa.cr.find(x=>x[0]===yo||x[1]===yo);
  if(!cr)return null;
  return {rival:CAR.divs[CAR.div][cr[0]===yo?cr[1]:cr[0]], local:cr[0]===yo};
}
function cerrarRondaCopa(gf,gc){
  const c=CAR.copa, yo=miCar(), eq=CAR.divs[CAR.div];
  const sig=[];
  for(const cr of c.cr){
    let ga,gb,pen='';
    if(cr.includes(yo)){ga=(cr[0]===yo)?gf:gc;gb=(cr[0]===yo)?gc:gf;}
    else [ga,gb]=simular(eq[cr[0]].q,eq[cr[1]].q);
    if(ga===gb){
      const [p1,p2]=(cr.includes(yo)&&S.tandaRes)?S.tandaRes:tandaSimulada(eq[cr[0]].q,eq[cr[1]].q);
      pen=' (pen '+p1+'-'+p2+')'; sig.push(cr[p1>p2?0:1]);
    } else sig.push(ga>gb?cr[0]:cr[1]);
    c.historial.push({r:RONDAS_CAR[c.ronda]||'RONDA',
      a:eq[cr[0]].name,b:eq[cr[1]].name,marc:ga+'-'+gb+pen});
  }
  c.vivos=sig; c.ronda++;
  S.tandaRes=null;
  if(c.vivos.length<=1){ c.campeon=c.vivos[0]; finTemporada(); }
  else crucesCopa();
  guardar();
}
function clasificacion(){
  return CAR.tabla.map((t,i)=>({...t,i}))
    .sort((a,b)=>b.pts-a.pts||(b.gf-b.gc)-(a.gf-a.gc)||b.gf-a.gf);
}
function finTemporada(){
  const orden=clasificacion(), yo=miCar();
  const pos=orden.findIndex(t=>t.i===yo)+1;
  const campeon=CAR.divs[CAR.div][orden[0].i];
  let movimiento='se mantiene';
  const divAnt=CAR.div;
  if(pos<=2&&CAR.div<2){ CAR.div++; movimiento='ASCIENDE'; }
  else if(pos>=7&&CAR.div>0){ CAR.div--; movimiento='DESCIENDE'; }
  // moverte de división: ocupas plaza en la nueva
  if(CAR.div!==divAnt){
    const yoEq=CAR.divs[divAnt].splice(yo,1)[0];
    const otra=CAR.divs[CAR.div];
    const fuera=CAR.div>divAnt?otra.length-1:0;   // desplazas al último/primero
    const desplazado=otra.splice(fuera,1)[0];
    otra.splice(fuera,0,yoEq);
    CAR.divs[divAnt].splice(yo,0,desplazado);
  }
  const copaCamp=(CAR.copa&&CAR.copa.campeon!==null)?CAR.divs[CAR.div][CAR.copa.campeon]:null;
  const gol=Object.entries(CAR.goleadores).sort((a,b)=>b[1]-a[1])[0];
  CAR.ultima={temporada:CAR.temporada,div:DIVS[divAnt],pos,mov:movimiento,
              campeon:campeon.name,pts:CAR.tabla[yo].pts,
              gf:CAR.tabla[yo].gf,gc:CAR.tabla[yo].gc,
              pichichi:gol?gol[0]+' ('+gol[1]+')':'—',
              copa:copaCamp?copaCamp.name:'—',
              copaTuya:!!(copaCamp&&copaCamp.yo),
              campeonLiga:orden[0].i===yo,
              bajas:[], subidas:[], nuevos:[]};
  CAR.palmares.push({t:CAR.temporada,div:DIVS[divAnt],pos,mov:movimiento});
  pretemporada();
  CAR.temporada++;
  armarTemporada();
}
/* ── verano: envejecer, retirar y subir juveniles ── */
function pretemporada(){
  const bajas=[], nuevos=[], cambios=[];
  for(let i=S.miPlantilla.length-1;i>=0;i--){
    const f=S.miPlantilla[i];
    f.edad=(f.edad||24)+1;
    // la curva: hasta 27 mejoras, de 31 en adelante pierdes
    if(f.edad>=31){
      const baja=f.edad>=34?2:1;
      for(const [k] of ATRIB) f.a[k]=Math.max(30,f.a[k]-baja);
      cambios.push(f.name+' −'+baja);
    }else if(f.edad<=26){
      const k=ATRIB[(Math.random()*ATRIB.length)|0][0];
      if(f.a[k]<92){ f.a[k]++; }
    }
    if(f.edad>=36||(f.edad>=34&&valorDe(f)<58)){
      bajas.push(f.name+' ('+f.edad+')');
      S.miPlantilla.splice(i,1);
    }
  }
  // cantera: dos juveniles por verano, arquetipo al azar
  const cuantos=Math.min(2,24-S.miPlantilla.length);
  for(let i=0;i<cuantos;i++){
    const A=ARQUETIPOS[(Math.random()*ARQUETIPOS.length)|0];
    const f=fichaDeArquetipo(A.id,RASGOS[(Math.random()*RASGOS.length)|0].id,null,
      20+Math.floor(Math.random()*60));
    f.edad=16+Math.floor(Math.random()*3);
    for(const [k] of ATRIB) f.a[k]=Math.max(32,f.a[k]-Math.floor(rnd(6,14)));  // aún verdes
    f.name='J. '+['Ruiz','Mena','Ortiz','Solís','Pardo','Vidal','Rocha','Nieto','Cano','Bravo']
      [(Math.random()*10)|0];
    S.miPlantilla.push(f); nuevos.push(f.name+' ('+nomArq(f.arq)+', '+f.edad+')');
  }
  S.miOnce=null;
  if(CAR&&CAR.ultima){CAR.ultima.bajas=bajas;CAR.ultima.nuevos=nuevos;CAR.ultima.subidas=cambios;}
}

/* ══ TANDA DE PENALTIS ════════════════════════════════════
   Antes el empate en copa se resolvía con Math.random(). Ahora
   la tuya se juega de verdad, tiro a tiro, y las ajenas se
   simulan con la calidad de cada equipo, no a cara o cruz.   */
function tandaSimulada(qa,qb){
  const acierto=q=>clamp(.60+q*.28,.55,.90);
  let a=0,b=0;
  for(let i=0;i<5;i++){ if(Math.random()<acierto(qa))a++; if(Math.random()<acierto(qb))b++; }
  let g=0;
  while(a===b&&g++<20){
    const x=Math.random()<acierto(qa)?1:0, y=Math.random()<acierto(qb)?1:0;
    a+=x; b+=y;
  }
  if(a===b)a++;
  return [a,b];
}
function iniciarTanda(){
  const orden=S.teams.map(t=>t.players.filter(p=>p.role!=='GK')
    .sort((x,y)=>(y.a.sho+y.a.ctl)-(x.a.sho+x.a.ctl)));
  S.tanda={i:0,marcas:[[],[]],fin:false,ganador:null,orden,espera:0,vivo:false,t:0};
  S.running=true; S.phase='play'; S.freeze=0; S.anadido=0;
  flash('TANDA DE PENALTIS');
  say('Empate: se decide desde los once pasos','nt');
  siguientePenal();
}
const tandaTurno=()=>S.tanda.i%2;
function siguientePenal(){
  const T=S.tanda;
  if(!T||T.fin)return;
  const idx=tandaTurno(), eq=S.teams[idx];
  // el campo se despeja: solo cobrador y portero cuentan
  for(const p of S.players){
    p.vx=p.vy=0;p.md={x:0,y:0};p.slide=0;p.cool=0;p.regate=0;p.desq=0;
    if(p.role!=='GK'){ p.x=F.W/2+(p.team===eq?-8:8); p.y=2.5+ (p.i%6)*1.6; }
  }
  const lista=T.orden[idx].filter(p=>S.players.includes(p));
  const cobrador=lista[(Math.floor(T.i/2))%Math.max(1,lista.length)];
  if(!cobrador){ T.fin=true; return; }
  const gx=eq.dir>0?F.W-F.SPOT:F.SPOT;
  setPiece('penalty',eq,{x:gx,y:CY},cobrador);
  T.vivo=true; T.t=0;
  S.ctrl=(eq===S.teams[0])?cobrador:S.ctrl;
}
function marcarPenal(anotado){
  const T=S.tanda;
  if(!T||!T.vivo)return;
  T.vivo=false;
  const idx=tandaTurno();
  T.marcas[idx].push(anotado?1:0);
  SFX[anotado?'gol':'parada']();
  flash(anotado?'¡GOL!':'FALLADO');
  T.i++;
  const a=T.marcas[0].reduce((x,y)=>x+y,0), b=T.marcas[1].reduce((x,y)=>x+y,0);
  const ta=T.marcas[0].length, tb=T.marcas[1].length;
  // ¿decidida? serie de cinco y luego muerte súbita
  const restA=Math.max(0,5-ta), restB=Math.max(0,5-tb);
  let fin=false;
  if(ta>=5&&tb>=5){ if(ta===tb&&a!==b)fin=true; }
  else { if(a>b+restB||b>a+restA)fin=true; }
  if(fin){
    T.fin=true; T.ganador=(a>b)?0:1;
    S.tandaRes=[a,b];
    T.cierre=1.3;                    // el cierre corre con el reloj del juego
  }else{
    S.tanda.espera=1.1;
  }
}
function cerrarTanda(){
  const T=S.tanda; if(!T)return;
  S.tanda=null; S.restart=null;
  S.running=false; S.phase='end';
  const gan=T.ganador===0?S.teams[0]:S.teams[1];
  say(`Tanda ${S.tandaRes[0]}-${S.tandaRes[1]}: pasa ${gan.name}`,'nt');
  S.subidas=progresar();
  if(S.compRival&&COMP&&!COMP.fin){
    cerrarJornada(S.score[0]+(T.ganador===0?1:0), S.score[1]+(T.ganador===1?1:0));
    S.compRival=null;
  }
  if(S.carRival&&CAR&&!CAR.fin&&CAR.fase==='copa'){
    cerrarRondaCopa(S.score[0],S.score[1]); S.carRival=null;
  }
  guardar();
  mostrarFinal(true);
}

/* ══ COMPETICIONES ══════════════════════════════════════════
   Liga a una vuelta y copa por eliminación. Los partidos que no
   juegas se resuelven con un modelo rápido de fuerza, no con el
   motor completo: correr 20 partidos enteros sería absurdo.   */
const RIVALES=[
 {name:'Halcones FC',tag:'HAL',q:.50,form:'4-4-2',plan:'defensivo',pal:{main:'#39d7ff',dark:'#0a2634',txt:'#062330'}},
 {name:'Cantera Roja',tag:'CAN',q:.58,form:'4-3-3',plan:'presion',pal:{main:'#ff5f4d',dark:'#2a0d09',txt:'#2a0d09'}},
 {name:'Dep. Sierra',tag:'SIE',q:.54,form:'3-5-2',plan:'equilibrado',pal:{main:'#9dff6b',dark:'#12250a',txt:'#12250a'}},
 {name:'Atl. Norte',tag:'NOR',q:.62,form:'4-2-3-1',plan:'ofensivo',pal:{main:'#ffd166',dark:'#2b210a',txt:'#2b210a'}},
 {name:'U. Costera',tag:'COS',q:.52,form:'5-3-2',plan:'contra',pal:{main:'#c084fc',dark:'#1e0f2b',txt:'#1e0f2b'}},
 {name:'Real Bravo',tag:'BRA',q:.66,form:'4-1-4-1',plan:'presion',pal:{main:'#f1f5f9',dark:'#1b1f26',txt:'#1b1f26'}},
 {name:'Ferroviaria',tag:'FER',q:.56,form:'3-4-3',plan:'ofensivo',pal:{main:'#fb923c',dark:'#2a1408',txt:'#2a1408'}},
 {name:'Cementeros',tag:'CEM',q:.48,form:'5-3-2',plan:'defensivo',pal:{main:'#94a3b8',dark:'#1c2128',txt:'#1c2128'}},
 {name:'Olmeca CF',tag:'OLM',q:.60,form:'4-4-2 rombo',plan:'equilibrado',pal:{main:'#2dd4bf',dark:'#07231f',txt:'#07231f'}},
 {name:'Lobos del Sur',tag:'LOB',q:.64,form:'4-3-3',plan:'presion',pal:{main:'#a3e635',dark:'#18230a',txt:'#18230a'}},
 {name:'Marina FC',tag:'MAR',q:.51,form:'4-4-2',plan:'contra',pal:{main:'#60a5fa',dark:'#0b1a30',txt:'#0b1a30'}},
 {name:'Astilleros',tag:'AST',q:.57,form:'4-2-3-1',plan:'equilibrado',pal:{main:'#f472b6',dark:'#2b0d1c',txt:'#2b0d1c'}},
 {name:'Racing Valle',tag:'VAL',q:.53,form:'3-5-2',plan:'ofensivo',pal:{main:'#facc15',dark:'#2a2205',txt:'#2a2205'}},
 {name:'Minerva',tag:'MIN',q:.68,form:'4-1-4-1',plan:'presion',pal:{main:'#e2e8f0',dark:'#15181d',txt:'#15181d'}},
 {name:'Corsarios',tag:'COR',q:.49,form:'5-3-2',plan:'defensivo',pal:{main:'#f97316',dark:'#2a1206',txt:'#2a1206'}},
 {name:'Halconcillos',tag:'HAC',q:.45,form:'4-4-2',plan:'defensivo',pal:{main:'#c4b5fd',dark:'#1b1630',txt:'#1b1630'}}
];
const YO={name:'Anti-Atléticos',tag:'ANT',q:.55,yo:true,
          pal:{main:'#ff2f8e',dark:'#12100f',txt:'#12100f'}};
/* tu club: nombre, siglas y colores, editables antes de jugar */
const MIEQUIPO={name:'Anti-Atléticos',tag:'ANT',
  pal:{main:'#ff2f8e',dark:'#12100f',txt:'#12100f'}};
const PALETAS=[
 ['#ff2f8e','#12100f'],['#39d7ff','#06202b'],['#4fd98b','#08210f'],['#ffd166','#2b2205'],
 ['#ff5f4d','#2a0d09'],['#c084fc','#1c0f2b'],['#f1f5f9','#14171c'],['#fb923c','#2a1408'],
 ['#2dd4bf','#07231f'],['#a3e635','#18230a'],['#60a5fa','#0b1a30'],['#f472b6','#2b0d1c']
];
let COMP=null;
function simular(qa,qb){
  const fa=55+qa*45+4, fb=55+qb*45;
  const la=clamp(.5+(fa-fb)/34,.2,3.6), lb=clamp(.5+(fb-fa)/34,.2,3.6);
  const poi=l=>{let k=0,pr=Math.exp(-l),ac=pr,u=Math.random();
    while(u>ac&&k<9){k++;pr*=l/k;ac+=pr;}return k;};
  return [poi(la),poi(lb)];
}
function nuevaLiga(nEq){
  const N=Math.max(4,Math.min(16,(nEq||6)));
  const pool=RIVALES.slice().sort(()=>Math.random()-.5);
  const eq=[{...YO,name:MIEQUIPO.name,tag:MIEQUIPO.tag,pal:MIEQUIPO.pal}]
    .concat(pool.slice(0,N-1).map(r=>({...r})));
  const n=eq.length, idx=eq.map((_,i)=>i), jor=[];
  for(let r=0;r<n-1;r++){
    const j=[];
    for(let i=0;i<n/2;i++){const a=idx[i],b=idx[n-1-i];j.push(r%2?[b,a]:[a,b]);}
    jor.push(j); idx.splice(1,0,idx.pop());
  }
  COMP={tipo:'liga',eq,jor,jornada:0,fin:false,
        tabla:eq.map(()=>({pj:0,g:0,e:0,p:0,gf:0,gc:0,pts:0})),historial:[]};
  return COMP;
}
function nuevaCopa(nEq){
  const N=[4,8,16].includes(nEq)?nEq:8;
  const otros=RIVALES.slice().sort(()=>Math.random()-.5).slice(0,N-1).map(r=>({...r}));
  for(let i=otros.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));
    const t=otros[i];otros[i]=otros[j];otros[j]=t;}
  const eq=[{...YO,name:MIEQUIPO.name,tag:MIEQUIPO.tag,pal:MIEQUIPO.pal}].concat(otros);
  COMP={tipo:'copa',eq,ronda:0,vivos:eq.map((_,i)=>i),fin:false,historial:[]};
  cruces(); return COMP;
}
function cruces(){ COMP.cr=[]; for(let i=0;i<COMP.vivos.length;i+=2) COMP.cr.push([COMP.vivos[i],COMP.vivos[i+1]]); }
const miIdx=()=>COMP.eq.findIndex(e=>e.yo);
function partidoDeHoy(){
  if(!COMP||COMP.fin)return null;
  const yo=miIdx();
  if(COMP.tipo==='liga'){
    const par=COMP.jor[COMP.jornada].find(x=>x[0]===yo||x[1]===yo);
    return {rival:COMP.eq[par[0]===yo?par[1]:par[0]],local:par[0]===yo};
  }
  const c=COMP.cr.find(x=>x[0]===yo||x[1]===yo);
  if(!c)return null;
  return {rival:COMP.eq[c[0]===yo?c[1]:c[0]],local:c[0]===yo};
}
const RONDAS=['OCTAVOS','CUARTOS','SEMIFINAL','FINAL'];
function nombreRonda(){ return COMP.tipo==='copa'?RONDAS[Math.max(0,4-Math.log2(COMP.vivos.length)-1)+0]||'RONDA':''; }
function cerrarJornada(gf,gc){
  if(!COMP||COMP.fin)return;
  const yo=miIdx();
  if(COMP.tipo==='liga'){
    for(const [a,b] of COMP.jor[COMP.jornada]){
      let ga,gb;
      if(a===yo||b===yo){ga=(a===yo)?gf:gc;gb=(a===yo)?gc:gf;}
      else [ga,gb]=simular(COMP.eq[a].q,COMP.eq[b].q);
      const A=COMP.tabla[a],B=COMP.tabla[b];
      A.pj++;B.pj++;A.gf+=ga;A.gc+=gb;B.gf+=gb;B.gc+=ga;
      if(ga>gb){A.g++;B.p++;A.pts+=3;}else if(gb>ga){B.g++;A.p++;B.pts+=3;}
      else{A.e++;B.e++;A.pts++;B.pts++;}
      COMP.historial.push({j:COMP.jornada+1,a:COMP.eq[a].tag,b:COMP.eq[b].tag,r:ga+'-'+gb});
    }
    COMP.jornada++;
    if(COMP.jornada>=COMP.jor.length)COMP.fin=true;
  }else{
    const sig=[];
    for(const c of COMP.cr){
      let ga,gb,pens='';
      if(c.includes(yo)){ga=(c[0]===yo)?gf:gc;gb=(c[0]===yo)?gc:gf;}
      else [ga,gb]=simular(COMP.eq[c[0]].q,COMP.eq[c[1]].q);
      if(ga===gb){
        const [p1,p2]=(c.includes(yo)&&S.tandaRes)?S.tandaRes
                     :tandaSimulada(COMP.eq[c[0]].q,COMP.eq[c[1]].q);
        pens=' (pen '+p1+'-'+p2+')'; sig.push(c[p1>p2?0:1]); }
      else sig.push(ga>gb?c[0]:c[1]);
      COMP.historial.push({j:COMP.ronda+1,a:COMP.eq[c[0]].tag,b:COMP.eq[c[1]].tag,r:ga+'-'+gb+pens});
    }
    COMP.vivos=sig; COMP.ronda++;
    if(COMP.vivos.length<=1)COMP.fin=true; else cruces();
  }
}

/* ══ REPETICIONES ═════════════════════════════════════════
   Buffer circular con los últimos 8 s de juego a 20 Hz.
   No guardo el estado entero: solo lo que hace falta dibujar. */
const REP={hz:2, seg:8, buf:[], max:0, activa:null};   // captura a 30 Hz
function repIniciar(){
  REP.max=Math.round(60/REP.hz*REP.seg);
  REP.buf.length=0; REP.activa=null;
}
function repCapturar(){
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
function repReproducir(txt){
  if(REP.buf.length<20)return 0;
  // los últimos 3.5 s de juego, a cámara lenta
  // copia real: los búferes se reciclan, y guardar referencias
  // haría que la repetición se corrompiera mientras se ve
  const fr=REP.buf.slice(-105).map(f=>f.slice());
  REP.activa={frames:fr,i:0,t:0,txt:txt||'REPETICIÓN',vel:0.65,snap:true};
  return fr.length/((60/REP.hz)*0.65)+0.8;      // cuánto dura, en segundos
}
function repPaso(dt){
  const r=REP.activa; if(!r)return;
  r.t+=dt*(60/REP.hz)*r.vel;
  if(r.t<0)r.t=0;
  r.i=Math.floor(r.t);
  if(r.i>=r.frames.length){REP.activa=null;}
}
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

/* ══ SONIDO ═════════════════════════════════════════════════
   Todo sintetizado con WebAudio: ni un archivo externo.     */
const SND={ctx:null, on:true, vol:.5};
function audio(){
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
const SFX={
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

/* ══ GUARDADO ═════════════════════════════════════════════
   Todo en el navegador. Si el entorno lo bloquea (algunos
   visores lo hacen), el juego sigue funcionando sin guardar. */
const SAVE={clave:'pressing-alto-v1', ok:true, aviso:''};
function guardar(){
  try{
    const d={
      club:MIEQUIPO, plantilla:S.miPlantilla, once:S.miOnce, plan:S.miPlan,
      cfg:{form:S.cfg.form,f7:S.cfg.f7,sup:S.cfg.sup,diff:S.cfg.diff,len:S.cfg.len,
           offside:S.cfg.offside,fouls:S.cfg.fouls},
      comp:COMP?{tipo:COMP.tipo,eq:COMP.eq,jor:COMP.jor,jornada:COMP.jornada,
                 tabla:COMP.tabla,vivos:COMP.vivos,ronda:COMP.ronda,cr:COMP.cr,
                 fin:COMP.fin,historial:COMP.historial}:null,
      nLiga:S.nLiga, nCopa:S.nCopa, sonido:SND.on, car:CAR, binds:BINDS,
      hist:S.historico||{pj:0,g:0,e:0,p:0,gf:0,gc:0}
    };
    localStorage.setItem(SAVE.clave,JSON.stringify(d));
    SAVE.ok=true; SAVE.aviso='guardado';
    return true;
  }catch(e){ SAVE.ok=false; SAVE.aviso='este entorno no permite guardar'; return false; }
}
function cargar(){
  try{
    const raw=localStorage.getItem(SAVE.clave);
    if(!raw)return false;
    const d=JSON.parse(raw);
    if(d.club){MIEQUIPO.name=d.club.name;MIEQUIPO.tag=d.club.tag;MIEQUIPO.pal=d.club.pal;}
    if(d.plantilla&&d.plantilla.length)S.miPlantilla=d.plantilla;
    if(d.once)S.miOnce=d.once;
    if(d.plan)S.miPlan=d.plan;
    if(d.cfg)Object.assign(S.cfg,d.cfg);
    if(d.comp)COMP=d.comp;
    if(d.car)CAR=d.car;
    if(d.nLiga)S.nLiga=d.nLiga;
    if(d.nCopa)S.nCopa=d.nCopa;
    if(d.sonido!==undefined)SND.on=d.sonido;
    if(d.binds){ BINDS=Object.assign({},BINDS_DEF,d.binds); MAP=buildMap(); }
    S.historico=d.hist||{pj:0,g:0,e:0,p:0,gf:0,gc:0};
    return true;
  }catch(e){ SAVE.ok=false; SAVE.aviso='no se pudo leer lo guardado'; return false; }
}
function borrarGuardado(){
  try{ localStorage.removeItem(SAVE.clave); }catch(e){}
}

/* ══ CANTERA ══════════════════════════════════════════════
   Crear jugadores repartiendo un presupuesto, no a barra libre:
   así crear es una decisión de diseño y no rompe el equilibrio. */
/* ══ ARQUETIPOS ═══════════════════════════════════════════
   Un jugador no es cinco números sueltos: es una idea. Eliges
   la idea y los números vienen puestos. El detalle sigue ahí
   para quien lo quiera mirar.                              */
const ARQUETIPOS=[
 {id:'fantasma',n:'EL FANTASMA',rol:'FW',d:'Aparece donde nadie lo esperaba. Letal de primera intención, no te ayuda a defender.',
  a:{pace:72,ctl:86,pas:80,sho:93,tkl:42,ref:40,stm:82}},
 {id:'rematador',n:'REMATADOR',rol:'FW',d:'Vive del área. Si le llega, la mete.',
  a:{pace:74,ctl:78,pas:64,sho:90,tkl:44,ref:40,stm:76}},
 {id:'ariete',n:'ARIETE',rol:'FW',d:'Poste de referencia. Aguanta el balón de espaldas y remata de cabeza.',
  a:{pace:63,ctl:80,pas:70,sho:84,tkl:60,ref:40,stm:80}},
 {id:'velocista',n:'VELOCISTA',rol:'FW',d:'Te desborda por fuera. Punta enorme, frágil en el cuerpo a cuerpo.',
  a:{pace:93,ctl:76,pas:66,sho:74,tkl:38,ref:40,stm:78}},
 {id:'regateador',n:'REGATEADOR',rol:'FW',d:'Uno contra uno constante. Control exquisito, pierde muchos balones.',
  a:{pace:82,ctl:92,pas:72,sho:76,tkl:36,ref:40,stm:74}},
 {id:'organizador',n:'ORGANIZADOR',rol:'MF',d:'El que ve el pase antes que nadie. Poco gol.',
  a:{pace:66,ctl:86,pas:92,sho:62,tkl:60,ref:40,stm:82}},
 {id:'motor',n:'MOTOR',rol:'MF',d:'Corre por dos. Aguante brutal, nada sobresaliente.',
  a:{pace:80,ctl:74,pas:76,sho:64,tkl:76,ref:40,stm:95}},
 {id:'llegador',n:'LLEGADOR',rol:'MF',d:'Medio que aparece en el área en el segundo tiempo.',
  a:{pace:78,ctl:78,pas:76,sho:82,tkl:64,ref:40,stm:88}},
 {id:'pivote',n:'PIVOTE',rol:'MF',d:'Destructor delante de la defensa. Corta todo, crea poco.',
  a:{pace:68,ctl:72,pas:74,sho:52,tkl:90,ref:40,stm:86}},
 {id:'tirador',n:'TIRADOR',rol:'MF',d:'Especialista a balón parado y disparo lejano.',
  a:{pace:66,ctl:82,pas:84,sho:88,tkl:56,ref:40,stm:78}},
 {id:'muro',n:'MURO',rol:'DF',d:'No le pasa nadie. Lento con el balón en los pies.',
  a:{pace:62,ctl:60,pas:60,sho:38,tkl:93,ref:40,stm:82}},
 {id:'librero',n:'LIBRERO',rol:'DF',d:'Central que saca jugando. Sale limpio desde atrás.',
  a:{pace:70,ctl:80,pas:84,sho:48,tkl:80,ref:40,stm:82}},
 {id:'lateral',n:'CARRILERO',rol:'DF',d:'Sube y baja la banda los noventa minutos.',
  a:{pace:86,ctl:74,pas:76,sho:56,tkl:74,ref:40,stm:92}},
 {id:'gato',n:'EL GATO',rol:'GK',d:'Reflejos imposibles bajo palos. Con los pies, un desastre.',
  a:{pace:58,ctl:52,pas:52,sho:30,tkl:44,ref:93,stm:84}},
 {id:'portero_libero',n:'PORTERO-LÍBERO',rol:'GK',d:'Sale de su área y saca jugando como un central.',
  a:{pace:68,ctl:74,pas:82,sho:34,tkl:52,ref:76,stm:84}}
];
const RASGOS=[
 {id:'ninguno',n:'Sin rasgo',d:'—',efecto:{}},
 {id:'zurdo',n:'Zurdo',d:'Golpeo más limpio con la pierna mala del rival.',efecto:{ctl:3,pas:2}},
 {id:'cabeceador',n:'Cabeceador',d:'Gana los balones por alto.',efecto:{sho:3,tkl:3}},
 {id:'balon_parado',n:'Balón parado',d:'Faltas y penaltis.',efecto:{sho:4,pas:2}},
 {id:'temperamental',n:'Temperamental',d:'Va a todas. Más entrada, más tarjetas.',efecto:{tkl:5,ctl:-2}},
 {id:'incansable',n:'Incansable',d:'No se funde nunca.',efecto:{stm:6,pace:1}}
];
const ATRIB=[['pace','VELOCIDAD'],['ctl','CONTROL'],['pas','PASE'],['sho','TIRO'],['tkl','ENTRADA']];
const COSTES={
  GK:{pace:1.2,ctl:1.0,pas:1.0,sho:1.6,tkl:1.4,ref:0.6},
  DF:{pace:1.0,ctl:1.1,pas:1.1,sho:1.5,tkl:0.7,ref:1.5},
  MF:{pace:1.0,ctl:0.9,pas:0.8,sho:1.1,tkl:1.0,ref:1.5},
  FW:{pace:0.9,ctl:0.9,pas:1.2,sho:0.7,tkl:1.5,ref:1.6}
};
function fichaDeArquetipo(arqId,rasgoId,nombre,dorsal){
  const A=ARQUETIPOS.find(x=>x.id===arqId)||ARQUETIPOS[0];
  const R=RASGOS.find(x=>x.id===rasgoId)||RASGOS[0];
  const a=Object.assign({acc:31},A.a);
  for(const k in R.efecto) a[k]=clamp((a[k]||60)+R.efecto[k],25,94);
  // pequeña variación para que no salgan clones
  for(const k of ['pace','ctl','pas','sho','tkl','ref','stm'])
    a[k]=clamp(Math.round(a[k]+rnd(-3,3)),25,94);
  return {name:nombre||A.n.toLowerCase(), num:dorsal||20, role:A.rol,
          arq:A.id, rasgo:R.id, edad:17+Math.floor(rnd(0,4)),
          a, exp:{pace:0,ctl:0,pas:0,sho:0,tkl:0}, creado:true,
          hist:{pj:0,goles:0,asis:0}};
}
const CANTERA={presupuesto:150, min:40, max:90, arq:'fantasma', rasgo:'ninguno',
  nuevo:{name:'Cantera', num:20, role:'MF', a:{pace:55,ctl:55,pas:55,sho:55,tkl:55,ref:40,stm:78,acc:31}}};
function gastoDe(f){
  const c=COSTES[f.role]||COSTES.MF;
  return Math.round(ATRIB.reduce((a,[k])=>a+(f.a[k]-CANTERA.min)*c[k],0));
}
function restante(){ return CANTERA.presupuesto-gastoDe(CANTERA.nuevo); }
function ficharCantera(){
  if(restante()<0)return false;
  if(S.miPlantilla.length>=24)return false;
  const f=CANTERA.nuevo;
  const nuevo={name:f.name.trim()||'Cantera', num:f.num, role:f.role,
    a:Object.assign({},f.a), creado:true};
  S.miPlantilla.push(nuevo);
  guardar();
  return true;
}

/* ── entrada ──────────────────────────────────────────────── */
const K={};
const ACT={up:0,down:0,left:0,right:0,sprint:0,pass:0,shoot:0,through:0,finesse:0,low:0,switch:0,slide:0,thru_mod:0,hud:0,regate:0};
/* Teclado remapeable: cada acción tiene una tecla asignada en BINDS,
   y MAP (tecla → acción) se reconstruye cada vez que cambia algo.
   El Shift para esprintar queda fijo aparte, no se pisa al remapear. */
const ACCIONES=[
  {a:'up',etq:'Arriba'},{a:'down',etq:'Abajo'},{a:'left',etq:'Izquierda'},{a:'right',etq:'Derecha'},
  {a:'sprint',etq:'Esprintar'},{a:'pass',etq:'Presionar / pase de primera'},
  {a:'through',etq:'Centro elevado / control orientado'},{a:'thru_mod',etq:'Pase filtrado (mantener)'},
  {a:'slide',etq:'Barrida'},{a:'switch',etq:'Cambiar de jugador'},{a:'regate',etq:'Regate'},
  {a:'low',etq:'Tiro raso'},{a:'finesse',etq:'Tiro colocado'},{a:'hud',etq:'Mostrar/ocultar HUD'}
];
const BINDS_DEF={up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD',sprint:'KeyF',pass:'KeyQ',
  through:'KeyE',thru_mod:'KeyZ',slide:'KeyX',switch:'KeyC',regate:'KeyR',low:'KeyV',
  finesse:'KeyG',hud:'KeyT'};
let BINDS=Object.assign({},BINDS_DEF);
function buildMap(){
  const m={ShiftLeft:'sprint',ShiftRight:'sprint'};
  for(const a in BINDS) if(BINDS[a]) m[BINDS[a]]=a;
  return m;
}
let MAP=buildMap();
function codeLabel(code){
  if(!code)return '—';
  if(code.startsWith('Key'))return code.slice(3);
  if(code.startsWith('Digit'))return code.slice(5);
  const esp={ShiftLeft:'Shift Izq',ShiftRight:'Shift Der',Space:'Espacio',
    ControlLeft:'Ctrl Izq',ControlRight:'Ctrl Der',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→'};
  return esp[code]||code;
}
let reasignando=null;
function pintarControles(){
  const box=$v('controlesBox'); if(!box)return;
  box.innerHTML=`<p class="ayuda">Pulsa "Reasignar" y luego la tecla que quieras usar. <b>Esc</b> cancela. El Shift para esprintar queda fijo aparte.</p>`+
    ACCIONES.map(x=>`<div class="fila" style="cursor:default">
        <span class="nom">${x.etq}</span>
        <span class="val" style="font-family:'JetBrains Mono';min-width:78px;text-align:right">
          ${reasignando===x.a?'…':`<b style="color:var(--home)">${codeLabel(BINDS[x.a])}</b>`}</span>
        <button class="opt" data-reasignar="${x.a}" style="margin-left:10px;padding:4px 10px;font-size:10.5px">
          ${reasignando===x.a?'Cancelar':'Reasignar'}</button>
      </div>`).join('')+
    `<button class="opt" id="bResetControles" style="margin-top:14px">Restaurar controles por defecto</button>`;
  box.querySelectorAll('[data-reasignar]').forEach(b=>b.onclick=()=>{
    reasignando=(reasignando===b.dataset.reasignar)?null:b.dataset.reasignar;
    pintarControles();
  });
  const br=$v('bResetControles');
  if(br)br.onclick=()=>{ BINDS=Object.assign({},BINDS_DEF); MAP=buildMap(); guardar(); pintarControles(); };
}
/* Captura la siguiente tecla en fase de captura, ANTES que el listener
   normal del juego (que va sin capture, en fase de burbuja) — así al
   reasignar no se dispara de paso la acción vieja de esa tecla.       */
addEventListener('keydown',e=>{
  if(!reasignando)return;
  e.preventDefault(); e.stopPropagation();
  if(e.code==='Escape'||e.code==='ShiftLeft'||e.code==='ShiftRight'){ reasignando=null; pintarControles(); return; }
  for(const a in BINDS) if(BINDS[a]===e.code && a!==reasignando) delete BINDS[a];
  BINDS[reasignando]=e.code;
  MAP=buildMap();
  guardar();
  reasignando=null;
  pintarControles();
},true);
/* Si estás escribiendo en un campo de texto, el juego no toca el teclado.
   Antes W, A, S, D, Q, E... iban a las acciones del partido y nunca llegaban
   al input: por eso podías borrar el nombre del club pero no escribir otro. */
function escribiendo(e){
  const el=e.target||document.activeElement;
  if(!el)return false;
  const t=(el.tagName||'').toUpperCase();
  return t==='INPUT'||t==='TEXTAREA'||el.isContentEditable;
}
addEventListener('keydown',e=>{
  if(escribiendo(e))return;
  if(e.code==='Escape'){togglePause();return;}
  const a=MAP[e.code]; if(a){e.preventDefault(); if(!K[e.code]){K[e.code]=1;ACT[a]=1;onPress(a);} }
});
addEventListener('keyup',e=>{
  if(escribiendo(e))return;
  const a=MAP[e.code]; if(a){e.preventDefault(); K[e.code]=0;
    // sólo apagar si ninguna otra tecla del mismo acto sigue pulsada
    let on=false; for(const c in MAP) if(MAP[c]===a && K[c]) on=true;
    if(!on){ACT[a]=0; onRelease(a);}}
});
// mouse: puntería + acciones
{
  const el=$('cv');
  el.addEventListener('mousemove',e=>{
    const r=el.getBoundingClientRect();
    S.mouse.sx=e.clientX-r.left; S.mouse.sy=e.clientY-r.top; S.mouse.on=true;
  });
  el.addEventListener('mousedown',e=>{
    if(!S.running)return;
    e.preventDefault();
    if(e.button===0){
      if(ACT.thru_mod){ const p=S.ctrl; if(p&&p.hasBall())doPass(p,true); else onPress('shoot'); }
      else {ACT.shoot=1;onPress('shoot');}
    }
    else if(e.button===2){ACT.pass=1;onPress('pass');}
    else if(e.button===1){const p=S.ctrl; if(p&&p.hasBall())doRegate(p); else switchPlayer();}
  });
  addEventListener('mouseup',e=>{
    if(e.button===0&&ACT.shoot){ACT.shoot=0;onRelease('shoot');}
    else if(e.button===2&&ACT.pass){ACT.pass=0;onRelease('pass');}
  });
  el.addEventListener('contextmenu',e=>e.preventDefault());
  el.addEventListener('wheel',e=>{
    e.preventDefault();
    S.zoom=clamp(S.zoom*(1-e.deltaY*0.0011),.7,1.75);
  },{passive:false});
}
// táctil
let stickId=null,stickO={x:0,y:0};
const touchOn=matchMedia('(pointer:coarse)').matches;
if(touchOn) $('touch').classList.add('on');
const stickEl=$('stick'), knob=stickEl.querySelector('i');
$('cv').addEventListener('pointerdown',e=>{
  if(!S.running||e.clientX>innerWidth*.55)return;
  stickId=e.pointerId;stickO={x:e.clientX,y:e.clientY};
  stickEl.style.display='block';stickEl.style.left=(e.clientX-59)+'px';stickEl.style.top=(e.clientY-59)+'px';
});
addEventListener('pointermove',e=>{
  if(e.pointerId!==stickId)return;
  let dx=e.clientX-stickO.x,dy=e.clientY-stickO.y;const l=Math.hypot(dx,dy);
  const m=Math.min(l,44); if(l>0){dx=dx/l*m;dy=dy/l*m;}
  knob.style.transform=`translate(${dx}px,${dy}px)`;
  const n=l>10?norm(dx,dy):{x:0,y:0};
  ACT.left=n.x<-.3?1:0;ACT.right=n.x>.3?1:0;ACT.up=n.y<-.3?1:0;ACT.down=n.y>.3?1:0;
  touchDir=l>10?n:null;
});
addEventListener('pointerup',e=>{
  if(e.pointerId!==stickId)return; stickId=null;touchDir=null;
  stickEl.style.display='none';knob.style.transform='';
  ACT.left=ACT.right=ACT.up=ACT.down=0;
});
let touchDir=null;
document.querySelectorAll('.pads button').forEach(b=>{
  const k=b.dataset.k;
  b.addEventListener('pointerdown',e=>{e.preventDefault();ACT[k]=1;onPress(k);});
  b.addEventListener('pointerup',e=>{e.preventDefault();ACT[k]=0;onRelease(k);});
  b.addEventListener('pointercancel',()=>{ACT[k]=0;onRelease(k);});
});

function inputDir(){
  if(touchDir) return touchDir;
  const x=(ACT.right?1:0)-(ACT.left?1:0), y=(ACT.down?1:0)-(ACT.up?1:0);
  return (x||y)?norm(x,y):null;
}
function onPress(a){
  if(!S.running||S.freeze>0)return;
  const p=S.ctrl; if(!p)return;
  if(a==='shoot'&&S.restart&&S.restart.type==='penalty'&&S.restart.taker===p){
    S.charging=true;S.charge=0;return;
  }
  if(a==='shoot'){
    // clic izquierdo: con balón carga el tiro; sin balón SOLO remate de primera.
    // Barrerse iba aquí y arruinaba los remates al recibir un pase.
    if(p.hasBall()){S.charging=true;S.charge=0;}
    else volley(p);
  }
  if(a==='slide'){ if(!p.hasBall()) slideTackle(p); }
  if(a==='regate'){ if(p.hasBall()) doRegate(p); }
  if(a==='pass'){
    if(p.hasBall()){S.passing=true;S.passHold=0;}
    else firstTimePass(p);
  }
  if(a==='through'){ if(p.hasBall()) doPass(p,true); else if(!firstTouch(p)) switchPlayer(); }
  if(a==='switch') switchPlayer();
  if(a==='hud') S.hudOn=!S.hudOn;
}
function onRelease(a){
  const p=S.ctrl; if(!p)return;
  if(a==='shoot'&&S.charging){
    S.charging=false;
    if(S.restart&&S.restart.type==='penalty'&&S.restart.taker===p) ejecutarPenal(clamp(S.charge/.95,.35,1));
    else if(p.hasBall()) doShot(p,clamp(S.charge/.95,.18,1));
    S.charge=0;
  }
  if(a==='pass'&&S.passing){ S.passing=false; if(p.hasBall()) doPass(p,false,clamp(S.passHold/.5,.35,1)); S.passHold=0; }
}
function switchCandidate(){
  const t=S.teams[0], b=S.ball;
  let ref;
  if(S.mouse.on) ref=screenToWorld(S.mouse.sx,S.mouse.sy);
  else{
    const d=inputDir(), p=S.ctrl||b;
    ref=d?{x:p.x+d.x*16,y:p.y+d.y*16}:b;
  }
  let best=null,bd=1e9;
  for(const p of t.players){
    if(p===S.ctrl)continue;
    if(p.role==='GK'&&dist(p,b)>16)continue;
    if(S.recent.indexOf(p)>=0)continue;
    const d=dist(p,ref); if(d<bd){bd=d;best=p;}
  }
  if(!best&&S.recent.length){S.recent=[];return switchCandidate();}
  return best;
}
function switchPlayer(){
  if(S.switchCd>0)return;
  const best=switchCandidate();
  if(!best)return;
  S.recent.push(best); if(S.recent.length>3)S.recent.shift();
  S.cycleT=.9; S.switchCd=.16; S.switchLock=1.5;
  S.ctrl=best;
}

/* ── puntería con mouse ───────────────────────────────────── */
function screenToWorld(sx,sy){
  const v=S.view||{x:F.W/2,y:CY,sc:SC};
  return {x:(sx-cvW/2)/v.sc+v.x, y:(sy-cvH/2)/v.sc+v.y};
}
function isHuman(p){return p===S.ctrl&&!p.team.ai;}
function aimPoint(p){
  if(isHuman(p)&&S.mouse.on) return screenToWorld(S.mouse.sx,S.mouse.sy);
  const d=isHuman(p)?inputDir():null;
  if(d) return {x:p.x+d.x*22,y:p.y+d.y*22};
  return {x:p.x+Math.cos(p.face)*22,y:p.y+Math.sin(p.face)*22};
}
function aimVec(p){const a=aimPoint(p);return norm(a.x-p.x,a.y-p.y);}

/* ── remate de primera y control orientado ────────────────── */
function volley(p){
  const b=S.ball;
  if(b.owner||b.frozen)return false;
  const d=dist(p,b);
  if(d>2.7||b.z>2.3)return false;
  const q=clamp(1-Math.abs(d-1.05)/1.7,0,1);
  b.owner=p;
  doShot(p,clamp(.60+q*.40,.5,1),{firstTime:true,q});
  p.stam=clamp(p.stam-2.5,8,100);
  return true;
}
function firstTouch(p){
  const b=S.ball;
  if(b.owner||b.frozen)return false;
  const d=dist(p,b);
  if(d>3.3||b.z>2.0)return false;
  const q=clamp(1-Math.abs(d-1.25)/2.0,0,1);
  const quality=clamp(q*(.55+p.a.ctl/210),0,1);
  const a=aimVec(p);
  let ang=Math.atan2(a.y,a.x), push;
  if(quality<.36){ ang+=gauss()*.55; push=6.2+Math.random()*3; }
  else { push=2.3+quality*4.4; ang+=gauss()*(.20-quality*.15); }
  b.x=lerp(b.x,p.x,.55); b.y=lerp(b.y,p.y,.55); b.z=0; b.vz=0;
  b.vx=Math.cos(ang)*push; b.vy=Math.sin(ang)*push; b.spin=0;
  b.block=null; b.blockT=0; b.isShot=false;
  b.lastTouch=p; S.lastTouchTeam=p.team; S.poss=p.team;
  p.cool=0; p.ftBoost=.55; p.shield=.85;
  if(TUTO.c&&isHuman(p)&&quality>.4)TUTO.c.controles++;
  if(quality>.62) say(`Control orientado de ${p.num} ${p.name}`);
  else if(quality<.36) say(`Se le va largo a ${p.name}`);
  return true;
}

/* ── acciones ─────────────────────────────────────────────── */
function pressureOn(p){
  let pr=0;
  for(const q of other(p.team).players){
    const d=dist(p,q); if(d<4.5) pr+=(4.5-d)/4.5;
  }
  return clamp(pr,0,2.2);
}
function releaseBall(p){
  S.ball.dip=0;
  if(S.training&&S.drill.hold){S.drill.hold=false;S.noPress=0;}
  const b=S.ball; b.owner=null; b.block=p; b.blockT=.4; b.lastTouch=p; b.frozen=false;
  S.lastTouchTeam=p.team; p.cool=.12;
}
function passTarget(p,through){
  const t=p.team, b=S.ball;
  const aim=isHuman(p)?aimVec(p):{x:Math.cos(p.face),y:Math.sin(p.face)};
  const ap=isHuman(p)?aimPoint(p):null;
  let best=null,bs=-1e9;
  for(const q of t.players){
    if(q===p)continue;
    const d=dist(p,q); if(d<2.2||d>48)continue;
    const u=norm(q.x-p.x,q.y-p.y);
    const align=u.x*aim.x+u.y*aim.y;
    const fwd=u.x*t.dir;
    let risk=0;
    for(const o of other(t).players){
      const sd=segDist(o.x,o.y,p.x,p.y,q.x,q.y);
      if(sd<2.6) risk+=(2.6-sd)*(1+ (through?.8:0));
    }
    let sc=align*4 + fwd*(through?3.2:1.1) - d*.045 - risk*2.4;
    if(q.role==='GK') sc-=6;
    if(through) sc += (q.role==='FW'?1.6:0);
    // premiar al que está desmarcado
    let near=1e9; for(const o of other(t).players) near=Math.min(near,dist(q,o));
    sc += clamp(near-3,0,7)*.35;
    if(ap && align<-.15) sc-=7;
    if(ap) sc += clamp(7-Math.hypot(q.x-ap.x,q.y-ap.y),0,7)*1.35;
    if(sc>bs){bs=sc;best=q;}
  }
  return best;
}
function humanPassTarget(p,through){
  const ap=aimPoint(p);
  const aLen=Math.hypot(ap.x-p.x,ap.y-p.y);
  if(aLen<1.5)return null;
  const ax=(ap.x-p.x)/aLen, ay=(ap.y-p.y)/aLen;
  const opp=other(p.team);
  let best=null,bs=-1e9;
  for(const q of p.team.players){
    if(q===p)continue;
    const dx=q.x-p.x, dy=q.y-p.y, d=Math.hypot(dx,dy);
    if(d<1.6||d>60)continue;
    const along=dx*ax+dy*ay;
    if(along<1)continue;                       // está detrás del cursor
    const perp=Math.abs(-dx*ay+dy*ax);
    const ang=Math.atan2(perp,along);
    const dCur=Math.hypot(q.x-ap.x,q.y-ap.y);
    if(ang>0.42*S.tune.cone&&dCur>4.5*S.tune.cone)continue;   // fuera del cono y lejos del cursor
    let sc=-dCur*1.15-ang*16;
    if(dCur<3.2*S.tune.cone)sc+=14;            // el cursor está prácticamente encima
    for(const o of opp.players){
      const sd=segDist(o.x,o.y,p.x,p.y,q.x,q.y);
      if(sd<2.3)sc-=(2.3-sd)*(through?5:3.4);
    }
    if(q.role==='GK')sc-=9;
    if(sc>bs){bs=sc;best=q;}
  }
  return best;
}
function passPlan(p,through){
  const t=p.team;
  if(isHuman(p)){
    const ap=aimPoint(p);
    let tgt=humanPassTarget(p,through);
    // Sin nadie en el cono ya NO se manda al hueco: se busca al mejor compañero
    // en esa mitad del campo. El pase al espacio solo sale con Z (filtrado).
    if(!tgt){
      const aim=aimVec(p);
      let mejor=null,bs=-1e9;
      for(const q of t.players){
        if(q===p||q.role==='GK')continue;
        const dx=q.x-p.x,dy=q.y-p.y,d=Math.hypot(dx,dy);
        if(d<2||d>55)continue;
        const al=(dx*aim.x+dy*aim.y)/d;
        if(al<0)continue;                       // detrás del cursor, ni de broma
        let sc=al*10-d*.05;
        for(const o of other(t).players)
          if(segDist(o.x,o.y,p.x,p.y,q.x,q.y)<2.2)sc-=4;
        if(sc>bs){bs=sc;mejor=q;}
      }
      tgt=mejor;
      if(!tgt){
        if(!through)return null;                // sin destino claro: despeje
        return {tgt:null,space:true,x:clamp(ap.x,1.5,F.W-1.5),y:clamp(ap.y,1.5,F.H-1.5)};
      }
    }
    const d0=dist(p,tgt);
    const tt=clamp(d0/Math.max(9,5.5+d0*.95),0,1.5);
    const lead=through?tt*1.8:tt;
    return {tgt,space:false,x:clamp(tgt.x+tgt.vx*lead,1,F.W-1),y:clamp(tgt.y+tgt.vy*lead,1,F.H-1)};
  }
  const tgt=passTarget(p,through);
  if(!tgt)return null;
  const d0=dist(p,tgt);
  const tt=clamp(d0/Math.max(9,5.5+d0*.95),0,1.5);
  const lead=through?tt*1.8:tt;
  return {tgt,space:false,x:clamp(tgt.x+tgt.vx*lead,1,F.W-1),y:clamp(tgt.y+tgt.vy*lead,1,F.H-1)};
}
function doPass(p,through,power,opts){
  opts=opts||{};
  const b=S.ball, t=p.team;
  const plan=passPlan(p,through);
  if(!plan){ // despeje
    const u=norm(t.dir,rnd(-.5,.5));
    releaseBall(p); b.vx=u.x*22*ESC();b.vy=u.y*22*ESC();b.vz=5.5;
    return;
  }
  let d=Math.hypot(plan.x-p.x,plan.y-p.y);
  if(through) d*=1.2;
  const pr=pressureOn(p);
  const errBase=(1.18-p.a.pas/110)*(0.036+pr*0.026)*(t.ai?1/S.D.acc:S.D.userErr)*(opts.errMul||1);
  const ang=Math.atan2(plan.y-p.y,plan.x-p.x)+gauss()*errBase;
  const spd=clamp(6.8+d*1.02,13*ESC(),34)*S.tune.pow*(power?lerp(.9,1.4,power):1.05)*(1+gauss()*.022);
  releaseBall(p);
  b.vx=Math.cos(ang)*spd; b.vy=Math.sin(ang)*spd;
  b.vz= through? clamp(d*.085,0,4.2) : (d>26?2.2:0.15);
  b.spin=gauss()*.5;
  b.dip=0;
  b.isShot=false;
  S.stats.pa[ti(t)]++;
  p.mPases++;
  if(TUTO.c&&isHuman(p)){TUTO.c.pases++; if(through)TUTO.c.filtrados++;}
  SFX.pase();
  S.lastPass={by:p,team:t};
  markOffside(p,plan.tgt);
  if(!t.ai){
    // saltar a quien vaya a llegar antes al destino del balón
    let best=null,bt=1e9;
    for(const q of t.players){
      if(q===p||q.role==='GK')continue;
      const v=Math.hypot(q.x-plan.x,q.y-plan.y)/Math.max(3.5,q.maxSpd);
      if(v<bt){bt=v;best=q;}
    }
    if(best&&S.tune.sw>0){S.ctrl=best;S.switchCd=.3;S.switchLock=.4;}
  }
  if(t.ai) p.think=.25;
}
function firstTimePass(p){
  const b=S.ball;
  if(b.owner||b.frozen)return false;
  const d=dist(p,b);
  if(d>2.8||b.z>2.2)return false;
  const q=clamp(1-Math.abs(d-1.1)/1.8,0,1);
  b.owner=p;
  doPass(p,false,.8,{errMul:q>.6?1.2-q*.45:2.1-q});
  p.stam=clamp(p.stam-1.5,10,100);
  if(q>.62) say(`Pase de primera de ${p.name}`);
  return true;
}
function shotPlan(p,charge,opts){
  opts=opts||{};
  const t=p.team,b=S.ball;
  const gx=t.dir>0?F.W:0;
  let ax,ay;
  const hum=isHuman(p);
  if(hum&&S.mouse.on){ const w=aimPoint(p); ax=w.x; ay=w.y; }
  else if(hum&&inputDir()){ ax=gx; ay=CY+inputDir().y*3.2; }
  else { ax=gx; ay=CY+(t.ai?(S.tanda?rnd(-3.1,3.1):rnd(-2.6,2.6)):0); }
  const dGoal=Math.hypot(gx-p.x,CY-p.y);
  let mode='normal';
  if(hum){
    if(ACT.low)mode='low';
    else if(ACT.through)mode='chip';
    else if(ACT.finesse)mode='finesse';
  }
  else if(dGoal>26&&Math.random()<.18)mode='finesse';
  let spd=(17.5+charge*18.5)*(0.9+p.a.sho/400);
  let vz=(1.05+charge*2.1)*clamp(dGoal/20,.32,1.15);
  let errMul=1, spin=0, dip=0;
  const lat=hum?inputDir():null;
  if(lat) spin=lat.y*.55;
  if(mode==='chip'){
    spd*=.66;
    if(dGoal>15){
      // resolver la parábola: 2.45 m sobre la barrera y bajo el larguero en la línea
      const tw=9.15/spd, tg=dGoal/spd;
      const hW=2.45, hG=clamp(1.7-charge*.8,.7,1.7);
      let g=(hG-hW*tg/tw)/(.5*tg*(tw-tg));
      g=clamp(g,9.81,26);
      vz=clamp((hW+.5*g*tw*tw)/tw,3,12);
      dip=clamp((g-9.81)/spd,0,.5);
      errMul=.75;
    }else{ vz=5.2+charge*3.8; dip=.115; errMul=1.05; }
  }
  if(mode==='finesse'){ spd*=.85; vz*=.6; errMul=.66; spin+=(p.y>CY?-1:1)*.85; }
  if(mode==='low'){ spd*=1.06; vz=.05; errMul=.88; }
  if(opts.firstTime){
    spd*=1.08+opts.q*.12;
    errMul*=(opts.q>.6? 1.10-opts.q*.45 : 2.1-opts.q);
    if(b.z>.6)vz*=1.45;
  }
  return {ax,ay,dGoal,spd,vz,spin,mode,errMul,dip};
}
function doShot(p,charge,opts){
  opts=opts||{};
  const b=S.ball,t=p.team;
  const pl=shotPlan(p,charge,opts);
  const pr=pressureOn(p);
  const acc=(t.ai?S.D.acc:1/S.D.userErr);
  const err=(1.35-p.a.sho/105)*(0.024+pl.dGoal*0.0016)*(1+pr*.45)/acc*pl.errMul*TUNE.shotErr;
  const ang=Math.atan2(pl.ay-p.y,pl.ax-p.x)+gauss()*err;
  const spd=pl.spd*(1+gauss()*.025);
  releaseBall(p);
  b.vx=Math.cos(ang)*spd; b.vy=Math.sin(ang)*spd;
  b.vz=clamp(pl.vz+gauss()*.26*pl.errMul*(pl.mode==='low'?.25:1),0,11);
  b.spin=pl.spin+gauss()*.3;
  b.dip=pl.dip;
  b.esPenal=!!(S.tanda||opts.penal);
  b.tutoPrimera=!!opts.firstTime; b.tutoElevado=(pl.mode==='chip');
  S.stats.sh[ti(t)]++;
  p.mTiros++;
  b.isShot=true; b.soContado=false;
  SFX.golpe();
  p.cool=.26;
  markOffside(p,null);
  const tag=opts.firstTime?(opts.q>.62?'¡de primera!':'de primera, forzado')
    :(pl.mode==='chip'?'por encima':(pl.mode==='finesse'?'colocado':(pl.mode==='low'?'raso':'')));
  say(`${p.num} ${p.name} remata${tag?' · '+tag:''}`, t.ai?'aw':'');
}
/* ── REGATE ───────────────────────────────────────────────
   Un quiebre lateral corto. No es magia: cuesta aire, deja al
   defensor a contrapié si lo pasas, y falla si no hay hueco.  */
const REG={dur:.34, vel:9.6, cd:1.35, coste:9, desq:.42};
function doRegate(p){
  if(!p.hasBall()||p.regCd>0||p.regate>0||p.stam<18)return false;
  const b=S.ball;
  // hacia dónde: lo que pidas con las teclas; si no, al lado contrario del rival más cercano
  let dx,dy;
  const inp=isHuman(p)?inputDir():null;
  let rival=null,rd=1e9;
  for(const o of other(p.team).players){const d=dist(p,o); if(d<rd){rd=d;rival=o;}}
  if(inp){dx=inp.x;dy=inp.y;}
  else if(rival&&rd<6){
    const u=norm(rival.x-p.x,rival.y-p.y);
    const lado=(u.x*Math.sin(p.face)-u.y*Math.cos(p.face))>0?-1:1;
    dx=-u.y*lado; dy=u.x*lado;
  } else { dx=Math.cos(p.face+1.2); dy=Math.sin(p.face+1.2); }
  const u=norm(dx,dy);
  // ¿hay hueco? si tienes a alguien encima justo en esa dirección, el quiebre se te va
  for(const o of other(p.team).players){
    if(dist(p,o)>1.9)continue;
    const v=norm(o.x-p.x,o.y-p.y);
    if(v.x*u.x+v.y*u.y>.55){
      releaseBall(p);
      b.vx=u.x*7+gauss();b.vy=u.y*7+gauss();
      p.regCd=REG.cd; p.stam=clamp(p.stam-REG.coste,10,100);
      if(isHuman(p))say(`${p.name} se estrella: no había hueco`);
      return false;
    }
  }
  p.regate=REG.dur; p.regDir=u; p.shield=REG.dur+.18;
  if(TUTO.c&&isHuman(p))TUTO.c.regates++;
  p.regCd=REG.cd; p.stam=clamp(p.stam-REG.coste,10,100);
  // a quien dejas atrás se le va el cuerpo
  for(const o of other(p.team).players){
    if(dist(p,o)<3.6&&o.slide<=0) o.desq=REG.desq;
  }
  SFX.pase();
  return true;
}
function slideTackle(p){
  if(p.slide>0||p.cool>0)return;
  const b=S.ball;
  const d=inputDir()||{x:Math.cos(p.face),y:Math.sin(p.face)};
  p.slide=.55; p.slideDir=d; p.cool=1.15; p.faltaHecha=false;
  p.stam=clamp(p.stam-4,10,100); SFX.entrada();
  p.vx=d.x*10.5;p.vy=d.y*10.5;
}

/* ── fuera de juego ───────────────────────────────────────── */
function markOffside(passer,tgt){
  S.offside=null;
  if(!S.offsideOn)return;
  const t=passer.team, opp=other(t), b=S.ball;
  // línea del penúltimo defensor
  const xs=opp.players.map(q=>t.dir>0?q.x:F.W-q.x).sort((a,c)=>c-a);
  const line=xs[1]!==undefined?xs[1]:xs[0];
  const bx=t.dir>0?b.x:F.W-b.x;
  const ref=Math.max(line,bx,F.W/2);
  const set=[];
  for(const q of t.players){
    if(q===passer)continue;
    const qx=t.dir>0?q.x:F.W-q.x;
    if(qx>ref+.35) set.push(q);
  }
  if(set.length) S.offside={team:t,set};
}

/* ── física del balón ─────────────────────────────────────── */
function ballStep(dt){
  const b=S.ball;
  if(b.frozen||b.owner)return;
  if(b.z>0.015||b.vz>0){
    const sp0=Math.hypot(b.vx,b.vy);
    b.vz-=(9.81+(b.dip||0)*sp0)*dt;      // dip: caída extra del balón golpeado con rosca
    b.z+=b.vz*dt;
    // resistencia del aire cuadrática: un disparo de 30 m/s frena mucho más
    // que un pase de 10. Antes ambos perdían el mismo porcentaje.
    // OJO: esto estaba multiplicado por dt*60 en vez de por dt, así que
    // frenaba 60 veces de más y un disparo moría en medio segundo.
    const drag=1-(0.0055*sp0+0.02)*dt;
    b.vx*=drag; b.vy*=drag;
    b.vz*=1-(0.0040*Math.abs(b.vz)+0.02)*dt;
    if(b.z<=0){
      b.z=0;
      if(Math.abs(b.vz)>.5){
        const rest=clamp(.45+sp0*.008,.45,.78);
        b.vz=-b.vz*rest;
        // al botar, parte del efecto lateral se convierte en trayectoria:
        // un balón con rosca "muerde" el césped y se abre
        const u=norm(b.vx,b.vy);
        b.vx=b.vx*.84 - u.y*b.spin*1.1;
        b.vy=b.vy*.84 + u.x*b.spin*1.1;
        b.spin*=.55;
      }
      else { b.vz=0; }
    }
    // efecto magnus lateral
    const sp=Math.hypot(b.vx,b.vy);
    if(sp>1&&Math.abs(b.spin)>.05){
      const u=norm(b.vx,b.vy);
      b.vx+=-u.y*b.spin*sp*.055*dt*60*dt;
      b.vy+= u.x*b.spin*sp*.055*dt*60*dt;
    }
  }else{
    const sp=Math.hypot(b.vx,b.vy);
    const fr=Math.pow(SUP.roz-Math.min(sp,30)*0.00004,dt*60);
    b.vx*=fr;b.vy*=fr;
    if(sp<.22){b.vx=0;b.vy=0;}
    if(Math.abs(b.spin)>.02){
      const u=norm(b.vx,b.vy);
      b.vx+=-u.y*b.spin*sp*.02;
      b.vy+= u.x*b.spin*sp*.02;
      b.spin*=.97;
    }
  }
  b.x+=b.vx*dt; b.y+=b.vy*dt;
  b.rot+=Math.hypot(b.vx,b.vy)*dt*1.6;
  if(b.blockT>0){b.blockT-=dt; if(b.blockT<=0)b.block=null;}
  if(!lowFX){b.trail.push({x:b.x,y:b.y,z:b.z});if(b.trail.length>13)b.trail.shift();}
  else if(b.trail.length)b.trail.length=0;
}

/* ── porterías, salidas, goles ────────────────────────────── */
function checkBounds(){
  const b=S.ball;

  if(S.freeze>0||b.frozen)return;
  // portería: cruce de la línea entre este frame y el anterior
  for(const side of [0,1]){
    const gx=side?F.W:0;
    const crossed=side ? (b.px<gx && b.x>=gx) : (b.px>gx && b.x<=gx);
    if(!crossed)continue;
    const f=clamp((gx-b.px)/((b.x-b.px)||1e-6),0,1);
    const yy=b.py+(b.y-b.py)*f, zz=b.pz+(b.z-b.pz)*f;
    if(yy>GT-.14&&yy<GB+.14){
      if(zz<F.GH+.06){
        if(Math.abs(yy-GT)<.14||Math.abs(yy-GB)<.14){
          b.x=gx+(side?-.32:.32); b.y=yy;
          const sp=Math.hypot(b.vx,b.vy);
          b.vx*=-.62;b.vy*=.7;b.spin*=-.4;
          b.vz=Math.max(b.vz,sp*.10);
          SFX.poste(); say('¡Al poste!','nt'); S.shake=.4; return;
        }
        goal(side?S.teams.find(t2=>t2.dir>0):S.teams.find(t2=>t2.dir<0));
        return;
      }else if(zz<F.GH+.30){
        b.x=gx+(side?-.32:.32);
        b.vz=-Math.abs(b.vz)*.55; b.vx*=-.55; b.dip=0;
        SFX.poste(); say('¡Al larguero!','nt'); S.shake=.4; return;
      }
    }
  }
  // en la tanda, cualquier final que no sea gol es penalti fallado.
  // Ojo: esto tiene que ir DESPUÉS del cruce de la línea de gol, o los
  // goles nunca se detectan (me pasó: 18 penaltis, ninguno dentro).
  if(S.tanda&&S.tanda.vivo&&!S.restart){
    if(b.x<-.1||b.x>F.W+.1||b.y<-.1||b.y>F.H+.1){ marcarPenal(false); return; }
    if(b.owner&&b.owner.role==='GK'){ marcarPenal(false); return; }
    if(Math.hypot(b.vx,b.vy)<0.4&&S.tanda.t>1.2){ marcarPenal(false); return; }
    return;
  }
  // línea de fondo
  if(b.x<-.1||b.x>F.W+.1){
    if(S.training){drillMiss('Fuera');return;}
    const side=b.x>F.W?1:0;
    const defTeam=S.teams.find(t=>(t.dir>0)!==(side===1))||S.teams[0];
    // el equipo que defiende ese arco es el que ataca al lado contrario
    const defending=S.teams.find(t=>(t.dir>0? F.W:0)!==(side?F.W:0));
    const last=S.lastTouchTeam;
    if(last && last!==defending){ goalKick(defending); }
    else { corner(other(defending), side, b.y<CY?0:F.H); }
    return;
  }
  // banda
  if(b.y<-.1||b.y>F.H+.1){
    if(S.training){drillMiss('Fuera');return;}
    const tt=S.lastTouchTeam?other(S.lastTouchTeam):S.teams[0];
    throwIn(tt,{x:clamp(b.x,1,F.W-1),y:b.y<0?0:F.H});
  }
}
function goal(scorer){
  if(S.tanda){ marcarPenal(true); return; }
  const i=ti(scorer);
  S.score[i]++;
  const sc=S.ball.lastTouch;
  if(S.ball.isShot&&!S.ball.soContado)S.stats.so[i]++;
  let as=null;
  const own=!!(sc&&sc.team!==scorer);
  if(sc&&TUTO.c&&sc===S.ctrl){
    if(S.ball.tutoPrimera)TUTO.c.primera++;
    if(S.ball.tutoElevado)TUTO.c.elevados++;
  }
  if(sc&&!own){
    sc.goals++;
    if(S.lastPass&&S.lastPass.team===scorer&&S.lastPass.by!==sc){as=S.lastPass.by;as.assists++;}
  }
  S.goals.push({min:Math.floor((S.half-1)*45+S.clock/60)+1,team:scorer,sc,as,own});
  sumarDescuento(30);                       // celebración y saque de centro
  S.lastPass=null;
  say(`⚽ GOL${own?' EN PROPIA de ':' de '}${sc?sc.num+' '+sc.name:'—'}${as?' · asist. '+as.name:''}`,
      scorer.ai?'aw':'nt');
  narrarGol(sc,as,scorer,own);
  flash(own&&!scorer.ai?'¡GOOOL!':(scorer.ai?'GOL DEL RIVAL':'¡GOOOL!'));
  (scorer.ai?SFX.encontra():SFX.gol());
  celebrar(scorer.pal?scorer.pal.main:'#ffffff', !scorer.ai);
  S.shake=scorer.ai?1.0:1.9;                 // el tuyo se celebra más
  S.zoomPunch=scorer.ai?0.06:0.16;
  // La repetición arrancaba en el mismo instante del gol y se comía la
  // celebración. Ahora: 2.6 s de fiesta y DESPUÉS la repetición.
  S.celeb={t:2.6, sc, own, team:scorer, txt:own?'EN PROPIA':'GOL'};
  S.freeze=2.6;
  if(S.training){S.drill.att++;S.deadline=resetDrill;}
  else S.deadline=()=>{ kickoff(other(scorer)); };
  S.ball.frozen=true;
}
function goalKick(team){
  const gx=team.dir>0?F.SIX:F.W-F.SIX;
  setPiece('goalkick',team,{x:gx,y:CY+rnd(-4,4)},team.gk);
  say('Saque de puerta '+team.tag, team.ai?'aw':'');
}
function corner(team,side,y){
  S.stats.co[ti(team)]++;
  const x=side?F.W-.35:.35;
  let taker=null,bd=1e9;
  for(const p of team.players){ if(p.role==='GK')continue;
    const d=Math.hypot(p.x-x,p.y-y); if(d<bd){bd=d;taker=p;} }
  setPiece('corner',team,{x,y:y<CY?.35:F.H-.35},taker);
  say('Córner para '+team.tag, team.ai?'aw':'nt');
}
function throwIn(team,pos){
  let taker=null,bd=1e9;
  for(const p of team.players){ if(p.role==='GK')continue;
    const d=dist(p,pos); if(d<bd){bd=d;taker=p;} }
  setPiece('throwin',team,{x:pos.x,y:clamp(pos.y,.3,F.H-.3)},taker);
}
function freeKick(team,pos,note){
  let taker=null,bd=1e9;
  for(const p of team.players){ if(p.role==='GK')continue;
    const d=dist(p,pos); if(d<bd){bd=d;taker=p;} }
  setPiece('freekick',team,{x:clamp(pos.x,2,F.W-2),y:clamp(pos.y,2,F.H-2)},taker);
  if(note)say(note,team.ai?'aw':'nt');
}
function sumarDescuento(seg){ S.anadido=Math.min(180,(S.anadido||0)+seg); }
function setPiece(type,team,pos,taker){
  sumarDescuento(type==='penalty'?30:4);
  const b=S.ball;
  b.x=pos.x;b.y=pos.y;b.vx=0;b.vy=0;b.z=0;b.vz=0;b.spin=0;b.owner=null;b.frozen=true;b.trail=[];
  S.restart={type,team,pos:{x:pos.x,y:pos.y},taker,t:0};
  S.offside=null; S.noPress=0;
  if(type==='penalty'&&taker){
    taker.x=pos.x-team.dir*2.2; taker.y=pos.y; taker.vx=taker.vy=0;
    taker.face=Math.atan2(CY-taker.y,(team.dir>0?F.W:0)-taker.x);
  }
  despejarDistancia();
  if(!team.ai&&taker) S.ctrl=taker;
}
/* El árbitro hace sitio: con el juego parado, los rivales se colocan
   a distancia reglamentaria en el acto. Antes tardaban dos segundos
   en retirarse y para entonces el saque ya estaba dado. */
function despejarDistancia(){
  const r=S.restart; if(!r)return;
  const opp=other(r.team);
  if(r.type==='penalty'){
    const defiende=opp;                       // el área es la que defiende el rival
    for(const p of S.players){
      if(p===r.taker)continue;
      if(p.role==='GK'&&p.team===defiende)continue;
      // todos fuera del área y por detrás del balón
      let intentos=0;
      while((insideBox(p,defiende)||dist(p,r.pos)<9.5)&&intentos++<40){
        const u=norm(p.x-r.pos.x+gauss()*.5,p.y-r.pos.y+gauss()*.5);
        p.x=clamp(r.pos.x-Math.abs(u.x)*(9.5+intentos*.6)*r.team.dir,2,F.W-2);
        p.y=clamp(r.pos.y+u.y*(9.5+intentos*.4),2,F.H-2);
      }
      p.vx=p.vy=0;p.md={x:0,y:0};
    }
    return;
  }
  for(const p of opp.players){
    if(p.role==='GK')continue;
    const d=dist(p,r.pos);
    if(d>=9.6)continue;
    let ux,uy;
    if(d<.4){ const a=Math.random()*6.283; ux=Math.cos(a); uy=Math.sin(a); }
    else { const u=norm(p.x-r.pos.x,p.y-r.pos.y); ux=u.x; uy=u.y; }
    p.x=clamp(r.pos.x+ux*9.8,1.2,F.W-1.2);
    p.y=clamp(r.pos.y+uy*9.8,1.2,F.H-1.2);
    p.vx=p.vy=0; p.md={x:0,y:0}; p.slide=0;
  }
}
/* El penalti no es un saque cualquiera: el balón NO pasa a los pies del
   ejecutor. Antes sí, y por eso podías (tú o la IA) conducirlo hasta
   dentro de la portería. Ahora hay un golpeo y punto.            */
function ejecutarPenal(charge){
  const r=S.restart;
  if(!r||r.type!=='penalty')return false;
  const p=r.taker, b=S.ball;
  b.frozen=false; b.owner=p;            // solo el instante del golpeo
  S.restart=null;
  S.retreat={team:p.team,taker:p,t:2.2,tras:0,radio:11};
  S.noPress=2.0;
  doShot(p,clamp(charge||.8,.35,1),{});
  return true;
}
function takeRestart(){
  const r=S.restart; if(!r)return;
  if(r.type==='penalty')return;          // ese se ejecuta con ejecutarPenal
  const p=r.taker, b=S.ball;
  b.frozen=false; b.owner=p; S.poss=p.team;
  S.noPress=r.type==='kickoff'?.5:2.0;
  // El rival no puede echársete encima nada más sacar: mantiene distancia
  // mientras tengas el balón, y se acerca de forma progresiva al jugarlo.
  if(r.type!=='kickoff')
    // tiempo justo para sacar, no para pasear: 2.5 s y 7 m
    S.retreat={team:p.team, taker:p, t:2.5, tras:0, radio:r.type==='penalty'?11:7.0};
  S.restart=null;
}

/* ── faltas ───────────────────────────────────────────────── */
function foul(offender,victim){
  if(!S.cfg.fouls)return false;
  const t=offender.team;
  S.stats.fo[ti(t)]++;
  SFX.silbato();
  narrarFalta(offender,t);
  sumarDescuento(12);
  const spd=Math.hypot(offender.vx,offender.vy);
  // la falta es penalti si ocurre en el área que defiende QUIEN LA COMETE
  const inBox=insideBox(victim,t);
  offender.cool=1.4; offender.slide=0; offender.vx*=.2;offender.vy*=.2;
  // AVISO CLARO: sin esto, tus propias faltas se sentían como perder el balón
  const miaFalta=(t===S.teams[0]);
  flash(miaFalta?'FALTA TUYA':'FALTA A TU FAVOR');
  S.shake=Math.max(S.shake,.35);
  if(inBox){
    say(`¡Penalti! Falta de ${offender.num} ${offender.name}`,'nt');
    flash('PENALTI');
    // el punto está en la portería que defiende el infractor
    const gx=t.dir>0?F.SPOT:F.W-F.SPOT;
    let taker=null,bs=-1;
    for(const p of other(t).players){ if(p.a.sho>bs&&p.role!=='GK'){bs=p.a.sho;taker=p;} }
    setPiece('penalty',other(t),{x:gx,y:CY},taker);
  }else{
    freeKick(other(t),{x:victim.x,y:victim.y},`Falta de ${offender.num} ${offender.name}`);
  }
  if(spd>11.5&&Math.random()<.07){
    expulsar(offender,'entrada temeraria');
  }else if(spd>7.5&&Math.random()<.45){
    offender.yellow++; S.stats.yc[ti(t)]++;
    setTimeout(()=>flash(miaFalta?'AMARILLA TUYA':'AMARILLA AL RIVAL'),650);
    say(`🟨 Amarilla para ${offender.num} ${offender.name}`,'nt');
    if(offender.yellow>=2) expulsar(offender,'doble amarilla');
  }
  return true;
}
/* Una barrida que se lleva al hombre por delante es falta, aunque él no
   sea el que lleva el balón. Antes solo se pitaba durante un duelo con el
   portador, y por eso las entradas del jugador casi nunca se sancionaban. */
function faltasPorContacto(dt){
  if(!S.cfg.fouls||S.restart||S.freeze>0)return false;
  for(const o of S.players){
    if(o.slide<=0||o.faltaHecha)continue;
    const vel=Math.hypot(o.vx,o.vy);
    for(const v of other(o.team).players){
      if(v.slide>0)continue;
      if(dist(o,v)>1.38)continue;      // los cuerpos nunca se acercan a menos de 1.06 m
      // ¿llegó primero al balón? entonces la entrada es limpia
      if(dist(o,S.ball)<1.45)continue;        // llegó al balón primero: entrada limpia
      o.faltaHecha=true;
      // cuanto más lanzada la entrada, más clara la infracción
      if(Math.random()<clamp(.20+vel*.030,.20,.78)){
        if(foul(o,v))return true;
      }
      break;
    }
  }
  return false;
}
function insideBox(p,defTeam){
  // ¿está p dentro del área que defiende defTeam?
  const gx=defTeam.dir>0?0:F.W;
  const inX=defTeam.dir>0? p.x<F.BOX : p.x>F.W-F.BOX;
  return inX && Math.abs(p.y-CY)<F.BOXW/2;
}

/* ── posesión y duelos ────────────────────────────────────── */
function possessionStep(dt){
  const b=S.ball;
  if(b.frozen)return;
  if(b.owner){
    const p=b.owner;
    if(p.slide>0||p.cool>.9){ releaseBall(p); return; }
    // conducción
    const sp=Math.hypot(p.vx,p.vy);
    const lead=.72+sp*(p.sprint?.19:.12);
    const tx=p.x+Math.cos(p.face)*lead, ty=p.y+Math.sin(p.face)*lead;
    b.x=lerp(b.x,tx,1-Math.pow(.0009,dt));
    b.y=lerp(b.y,ty,1-Math.pow(.0009,dt));
    b.vx=p.vx;b.vy=p.vy;b.z=0;b.vz=0;
    b.rot+=sp*dt*2;
    b.lastTouch=p; S.lastTouchTeam=p.team; S.poss=p.team;
    // toque largo por mal control
    // CONTROL: conducir sin nadie encima ya no te quita el balón porque sí.
    // Lo que ocurre es un toque largo que puedes recuperar corriendo;
    // la pérdida de verdad solo llega con un rival encima.
    p.touchT=(p.touchT||0)+dt;
    if(p.touchT>.55){
      p.touchT=0;
      const pr=pressureOn(p);
      const err=(1.05-p.a.ctl/100)*(sp>5.6?1.10:.50)*(1+pr*1.15);
      if(Math.random()<err*.14){
        const largo=pr<.5;
        releaseBall(p);
        const desvio=largo?.10:.34;
        const u=norm(Math.cos(p.face)+gauss()*desvio,Math.sin(p.face)+gauss()*desvio);
        const fuerza=largo?(sp*.55+2.6):(4.5+sp);
        b.vx=u.x*fuerza;b.vy=u.y*fuerza;
        b.blockT=largo?.12:.35;                 // si se te va largo, puedes ir por él
        if(largo&&!p.team.ai&&p===S.ctrl)say(`Se le va largo a ${p.name}`);
      }
    }
    // duelos
    for(const o of other(p.team).players){
      const d=dist(p,o);
      if(S.restart)continue;                    // nadie disputa un balón parado
      if(d<(o.slide>0?1.7:1.45)&&(o.cool<=0||o.slide>0)&&S.noPress<=0&&p.shield<=0){
        // proteger el balón pesa mucho más: cuerpo, control y orientación cuentan
        const enFrente=Math.cos(Math.atan2(p.y-o.y,p.x-o.x)-o.face)>.2;
        const win=(o.a.tkl*(enFrente?1:.55)+(o.slide>0?20:0))
                / (o.a.tkl+p.a.ctl*1.45+p.a.pace*.35+30);
        if(Math.random()<win*dt*(o.slide>0?4.0:2.1)){
          releaseBall(p);
          const u=norm(o.team.dir*.6+gauss()*.4, gauss()*.5);
          b.vx=u.x*6;b.vy=u.y*6; b.block=p;b.blockT=.35;
          b.lastTouch=o; S.lastTouchTeam=o.team;
          o.cool=.18;
          o.mEntradas++;
          if(!o.team.ai){S.ctrl=o;S.switchCd=.4;}
        }else if(o.slide>0&&d<1.25&&Math.random()<dt*4.5){
          if(foul(o,p))return;
        }
      }
    }
    return;
  }
  // recuperar suelto
  let best=null,bd=1e9;
  for(const p of S.players){
    if(p===b.block&&b.blockT>0)continue;
    if(p.cool>0||p.slide>0)continue;
    // en saque de banda, puerta, córner, falta o penalti nadie más puede tocarlo
    if(S.restart&&p!==S.restart.taker)continue;
    let reach=p.role==='GK'?1.55:.95;
    if(p.role==='GK'){
      const gx=p.team.dir>0?0:F.W;
      if(Math.abs(b.x-gx)<F.SIX+1.5&&Math.abs(b.y-CY)<F.SIXW/2+1.2)reach=2.7;  // manda en su área chica
    }
    const d=dist(p,b);
    if(d<reach&&b.z<(p.role==='GK'?2.5:1.05)&&d<bd){bd=d;best=p;}
  }
  if(best){
    // fuera de juego
    if(S.offside&&S.offside.set.includes(best)&&S.offside.team===best.team){
      const t=S.offside.team;
      say(`🚩 Fuera de juego: ${best.num} ${best.name}`,'nt');
      flash('FUERA DE JUEGO');
      S.offside=null;
      freeKick(other(t),{x:best.x,y:best.y});
      return;
    }
    if(S.offside&&S.offside.team!==best.team) S.offside=null;
    if(S.offside&&!S.offside.set.includes(best)) S.offside=null;
    const speed=Math.hypot(b.vx,b.vy);
    // antes solo intervenía por encima de 13 m/s: un pase lento hacia su
    // portería entraba sin que el portero moviera un dedo.
    if(best.role==='GK'&&speed>5){
      const gx=best.team.dir>0?0:F.W;
      const tt=(gx-b.x)/(b.vx||1e-6);
      const onTarget=tt>0&&tt<2&&Math.abs(b.y+b.vy*tt-CY)<F.GW/2+.6;
      if(onTarget&&b.isShot&&!b.soContado&&S.lastTouchTeam&&S.lastTouchTeam!==best.team){S.stats.so[ti(S.lastTouchTeam)]++;b.soContado=true;}
      // en fútbol 7 la portería es menor pero el portero la cubre igual de
      // bien, así que su base sube para no convertirlo en un festival
      const base=TUNE.gkBase+(S.cfg.f7?0.10:0);
      let ok=clamp(base+best.a.ref/175*TUNE.arcoRef-speed/TUNE.gkVel,.12,.95);
      if(b.esPenal)ok*=.42;      // desde los once pasos la ventaja es del tirador
      if(Math.random()>=ok){
        // no llega: el balón sigue su camino
        b.block=best; b.blockT=.3;
        return;
      }
      if(Math.random()<.55){
        b.owner=best;best.hold=1.2;b.vx=b.vy=b.vz=0;b.z=0;
        SFX.parada(); say(`Atajada de ${best.name}`,best.team.ai?'aw':'');
        S.poss=best.team;S.lastTouchTeam=best.team;
      }else{
        // desvía a un costado
        const away=norm(best.team.dir*1.1,(b.y<CY?-1:1)*1.5+gauss()*.5);
        const pw=clamp(speed*.42,5,14);
        b.vx=away.x*pw+gauss()*1.5; b.vy=away.y*pw;
        b.vz=clamp(4.2+speed*.16,4.2,10);
        b.block=best;b.blockT=.5;b.lastTouch=best;
        S.lastTouchTeam=best.team;
        say(`Rechaza ${best.name}`,best.team.ai?'aw':'');
      }
      return;
    }
    if(S.lastPass&&S.lastPass.team!==best.team)S.lastPass=null;
    b.owner=best; b.lastTouch=best; S.lastTouchTeam=best.team; S.poss=best.team;
    b.isShot=false; best.touchT=0;
    if(best.shield<=0)best.shield=.35;          // no te lo roban en el mismo toque
    if(!best.team.ai&&S.switchCd<=0){S.ctrl=best;}
  }
}

/* ── IA ───────────────────────────────────────────────────── */
function nearestToBall(team,skipGK=true){
  let best=null,bd=1e9;
  for(const p of team.players){
    if(skipGK&&p.role==='GK')continue;
    const d=dist(p,S.ball); if(d<bd){bd=d;best=p;}
  }
  return best;
}
function interceptPoint(p){
  const b=S.ball;
  let t=0,px=b.x,py=b.y,vx=b.vx,vy=b.vy;
  for(let i=0;i<26;i++){
    const dt=.06; px+=vx*dt;py+=vy*dt;vx*=.93;vy*=.93;t+=dt;
    if(Math.hypot(px-p.x,py-p.y)<p.maxSpd*t) break;
  }
  return {x:clamp(px,0,F.W),y:clamp(py,0,F.H)};
}
function gkTarget(gk){
  const b=S.ball, gx=gk.team.dir>0?.6:F.W-.6;
  const toB={x:b.x-gx,y:b.y-CY};
  const d=Math.hypot(toB.x,toB.y)||1;
  let out=clamp(d*.16,.8,7*ESC());
  // en un penalti el portero no se mueve de la línea hasta el golpeo
  if(S.restart&&S.restart.type==='penalty'&&gk.team!==S.restart.team)
    return {x:gx,y:clamp(b.y,CY-2.2,CY+2.2)};
  if(S.training&&S.drill.hold)return {x:gx,y:clamp(b.y,CY-2.4,CY+2.4)};
  const attackerClose=insideBox({x:b.x,y:b.y},gk.team)&&!b.owner;
  if(attackerClose) out=Math.min(out+3,11);
  if(b.owner&&b.owner.team!==gk.team&&insideBox(b.owner,gk.team)&&d<13) out=Math.min(out+2.5,10);
  const u={x:toB.x/d,y:toB.y/d};
  let tx=gx+u.x*out, ty=CY+u.y*out*.85;
  // anticipar disparo
  const toward=(gk.team.dir>0? b.vx<-6 : b.vx>6);
  if(toward){
    const tt=(gx-b.x)/(b.vx||1e-6);
    if(tt>0&&tt<1.6){ ty=clamp(b.y+b.vy*tt,GT-1.4,GB+1.4); tx=gx+ (gk.team.dir>0?.4:-.4); }
  }
  return {x:clamp(tx,gk.team.dir>0?.3:F.W-14,gk.team.dir>0?14:F.W-.3), y:clamp(ty,CY-13,CY+13)};
}
function aiTarget(p){
  const t=p.team, b=S.ball, opp=other(t);
  if(p.role==='GK') return gkTarget(p);
  const h=p.home();
  const prog=t.dir>0? b.x/F.W : 1-b.x/F.W;
  const weHave=S.poss===t;
  const pl=t.plan||PLANES.equilibrado;
  // el plan mueve el bloque entero, no solo su reacción al balón
  let push=(prog-.5)*(weHave?36:27)*pl.linea + (pl.linea-1)*26;
  let tx=h.x+t.dir*push;
  let ty=h.y+(b.y-h.y)*(weHave?.20:.34);
  ty=CY+(ty-CY)*pl.amplitud;                    // amplitud del bloque
  if(weHave){
    // desmarques
    p.runT+=DT;
    const w=Math.sin(p.runT*.7+p.i)*(p.role==='FW'?5.5:3.2);
    ty+=w;
    if(p.role==='FW'){
      tx+=t.dir*6;
      // no pasarse de la línea del penúltimo
      if(S.offsideOn){
        const xs=opp.players.map(q=>t.dir>0?q.x:F.W-q.x).sort((a,c)=>c-a);
        const line=xs[1]!==undefined?xs[1]:xs[0];
        const lim=t.dir>0?line-.6:F.W-line+.6;
        tx=t.dir>0?Math.min(tx,lim):Math.max(tx,lim);
      }
    }
    if(p.role==='DF') tx=t.dir>0?Math.min(tx,F.W*.62):Math.max(tx,F.W*.38);
  }else{
    // marcaje: cubrir al rival más cercano en su zona
    // el par a marcar se recalcula 6 veces por segundo, no 60:
    // a esa distancia nadie cambia de sitio en 160 ms
    p.markT=(p.markT||0)-1;
    if(p.markT<=0||!p.markRef||!S.players.includes(p.markRef)){
      p.markT=10;
      let mm=null,bb=1e9;
      for(const q of opp.players){
        if(q.role==='GK')continue;
        const dx=q.x-h.x, dy=q.y-h.y, d2=dx*dx+dy*dy;
        if(d2<bb&&d2<361){bb=d2;mm=q;}
      }
      p.markRef=mm;
    }
    const m=p.markRef, bd=m?dist(m,h):1e9;
    if(m&&(p.role==='DF'||prog<.45)){
      const gx=t.dir>0?0:F.W;
      const u=norm(gx-m.x,CY-m.y);
      tx=lerp(tx,m.x+u.x*2.0,.62);
      ty=lerp(ty,m.y+u.y*2.0,.62);
    }
    // línea defensiva coherente
    if(p.role==='DF'){
      const alt=(t.plan?t.plan.linea:1);
      const limit=t.dir>0? Math.min(b.x+2,F.W*(.42+.13*alt)): Math.max(b.x-2,F.W*(1-(.42+.13*alt)));
      tx=t.dir>0?Math.min(tx,limit):Math.max(tx,limit);
    }
  }
  return {x:clamp(tx,1.2,F.W-1.2),y:clamp(ty,1.2,F.H-1.2)};
}
function aiPlayer(p,dt){
  const b=S.ball,t=p.team,opp=other(t);
  if(p.wall){p.md={x:0,y:0};p.sprint=false;p.face=Math.atan2(b.y-p.y,b.x-p.x);return;}
  // repliegue obligatorio tras un saque: el radio se disuelve al jugarse el balón
  if(S.retreat&&t!==S.retreat.team&&p.role!=='GK'){
    const R=S.retreat;
    const rad=R.radio*(R.tras>0?clamp(1-R.tras/0.9,0,1):1);
    const d=dist(p,b);
    if(d<rad){
      const u=(d<.4)?{x:Math.cos(p.i),y:Math.sin(p.i)}:norm(p.x-b.x,p.y-b.y);
      steerTo(p,{x:clamp(b.x+u.x*(rad+1.2),1.2,F.W-1.2),
                 y:clamp(b.y+u.y*(rad+1.2),1.2,F.H-1.2)},false);
      p.sprint=false;
      return;
    }
  }
  p.react=Math.max(0,p.react-dt);
  p.think=Math.max(0,p.think-dt);
  p.sprint=false;
  // saque de banda / falta a favor
  if(S.restart){
    const r=S.restart;
    if(p===r.taker){
      const d=dist(p,r.pos);
      if(d>.75){ steerTo(p,r.pos,true); }
      else{
        p.md={x:0,y:0};
        r.t+=dt;
        p.face=Math.atan2(CY-p.y,(t.dir>0?F.W:0)-p.x);
        if(r.type==='penalty'){
          if(r.t>1.3&&(t.ai||r.t>4.5)) ejecutarPenal(rnd(.6,1));
          return;
        }
        if(r.t>(t.ai?.75:3.5)){
          takeRestart();
          if(t.ai) setTimeout(()=>{},0);
        }
      }
      return;
    }
    // los demás se colocan; rivales guardan distancia
    const tg=aiTarget(p);
    if(r.team!==t){
      const d=dist(p,r.pos);
      if(d<9.9){
        const u=norm(p.x-r.pos.x,p.y-r.pos.y);
        tg.x=r.pos.x+u.x*10.2; tg.y=r.pos.y+u.y*10.2;
      }
    }else if(r.type==='corner'&&p.role!=='GK'){
      const gx=t.dir>0?F.W-9:9;
      tg.x=gx+rnd(-3,3); tg.y=CY+rnd(-9,9);
    }
    steerTo(p,tg,false);
    return;
  }
  // con balón
  if(b.owner===p){
    if(p.think>0){p.md={x:0,y:0};return;}
    if(p.role==='GK'){
      if(p.hold>0){p.md={x:0,y:0};return;}
      doPass(p,true,1); return;                 // saque largo y elevado
    }
    const gx=t.dir>0?F.W:0;
    const dg=Math.hypot(gx-p.x,CY-p.y);
    const pr=pressureOn(p);
    const angleOK=Math.abs(p.y-CY)<24;
    // ¿disparo?
    const shootRange=((p.role==='FW'?23:17)+p.a.sho*.075)*ESC();
    const openAngle=Math.abs(p.y-CY)<9+dg*.42;
    if(dg<shootRange&&angleOK&&openAngle&&(pr<1.15||dg<11)&&
       Math.random()<dt*(0.9+Math.max(0,24-dg)*.16)*TUNE.aiTiro){
      doShot(p,clamp(.42+dg/40,.3,1)); return;
    }
    // ¿pase?
    const wantPass=pr>0.75||Math.random()<dt*1.25;
    if(wantPass){
      const through=Math.random()<(.32*(t.plan?t.plan.riesgo:1))&&dg>25;
      doPass(p,through, .8); return;
    }
    // conducir hacia zona de peligro
    let ax=gx-p.x, ay=CY-p.y;
    // esquivar al más cercano
    let near=null,nd=1e9;
    for(const o of opp.players){const d=dist(p,o);if(d<nd){nd=d;near=o;}}
    if(near&&nd<2.4&&p.regCd<=0&&Math.random()<dt*0.8&&p.a.ctl>76){ if(doRegate(p))return; }
    if(near&&nd<4.2){
      const away=norm(p.x-near.x,p.y-near.y);
      ax+=away.x*16; ay+=away.y*16;
    }
    const u=norm(ax,ay);
    p.md=u; p.sprint=nd>2.6&&p.stam>26;
    return;
  }
  // sin balón
  const mine=S.poss===t;
  const chaser=nearestToBall(t);
  if(!mine||!b.owner){
    if(p===chaser&&p.react<=0){
      const bo=b.owner;
      if(bo&&bo.team!==t&&p.cool<=0&&p.slide<=0&&S.noPress<=0){
        const dd=dist(p,bo);
        const risky=insideBox(p,t)?.22:1;
        const desperate=(p.role==='DF'&&dd<2.2)?1.5:1;
        if(dd<2.7&&dd>.9&&Math.random()<dt*.75*S.D.press*risky*desperate){
          const u=norm(bo.x+bo.vx*.15-p.x,bo.y+bo.vy*.15-p.y);
          p.slide=.55;p.slideDir=u;p.cool=1.15;p.faltaHecha=false;
          p.vx=u.x*10.5;p.vy=u.y*10.5;
          p.stam=clamp(p.stam-4,10,100);
          return;
        }
      }
      const ip=interceptPoint(p);
      steerTo(p,ip,true,S.D.press*(t.plan?t.plan.presion:1));
      return;
    }
    // segundo hombre: coberturas
    let second=null,sd=1e9;
    for(const q of t.players){ if(q===chaser||q.role==='GK')continue;
      const d=dist(q,b); if(d<sd){sd=d;second=q;} }
    if(p===second&&sd<22){
      const gx=t.dir>0?0:F.W;
      const u=norm(gx-b.x,CY-b.y);
      steerTo(p,{x:b.x+u.x*6.5,y:b.y+u.y*6.5},true);
      return;
    }
  }
  steerTo(p,aiTarget(p),false);
}
function steerTo(p,tg,urgent,mult=1){
  const dx=tg.x-p.x,dy=tg.y-p.y,d=Math.hypot(dx,dy);
  if(d<(urgent?.35:1.1)){p.md={x:0,y:0};p.sprint=false;return;}
  p.md=norm(dx,dy);
  p.sprint=(urgent&&d>2.2&&p.stam>18)||(d>11&&p.stam>34);
  if(mult>1&&urgent)p.sprint=p.stam>10;
}

/* ── movimiento ───────────────────────────────────────────── */
function movePlayer(p,dt){
  // posición previa: el dibujado interpola entre ticks para que el
  // movimiento sea fluido en pantallas de 120 y 144 Hz
  p.px=p.x; p.py=p.y; p.pface=p.face;
  if(p.slide>0){
    p.slide-=dt;
    p.vx*=Math.pow(.05,dt); p.vy*=Math.pow(.05,dt);
    p.x+=p.vx*dt;p.y+=p.vy*dt;
    p.x=clamp(p.x,-2,F.W+2);p.y=clamp(p.y,-2,F.H+2);
    return;
  }
  p.cool=Math.max(0,p.cool-dt);
  if(p.hold>0)p.hold-=dt;
  if(p.shield>0)p.shield-=dt;
  if(p.ftBoost>0)p.ftBoost-=dt;
  if(p.regCd>0)p.regCd-=dt;
  if(p.desq>0)p.desq-=dt;
  if(p.regate>0){
    p.regate-=dt;
    p.vx=p.regDir.x*REG.vel; p.vy=p.regDir.y*REG.vel;
    p.x+=p.vx*dt; p.y+=p.vy*dt;
    p.x=clamp(p.x,-1.5,F.W+1.5); p.y=clamp(p.y,-1.5,F.H+1.5);
    p.face=Math.atan2(p.regDir.y,p.regDir.x);
    p.stam=clamp(p.stam-6*dt,10,100);
    return;
  }
  const want=p.maxSpd*(p.ftBoost>0?1.07:1);
  const tvx=p.md.x*want, tvy=p.md.y*want;
  let acc=p.a.acc*(p.hasBall()?.86:1)*(p.ftBoost>0?1.55:1)*(p.desq>0?.60:1);
  if(!p.md.x&&!p.md.y)acc*=1.5;
  let dvx=tvx-p.vx, dvy=tvy-p.vy;
  // Inercia real: girar en seco a toda velocidad no puede costar lo mismo
  // que acelerar en línea recta. Cuanto más cerrado el cambio y más rápido
  // vas, menos agarre tienes.
  const v0=Math.hypot(p.vx,p.vy);
  if(v0>1.5&&(tvx||tvy)){
    const cos=(p.vx*tvx+p.vy*tvy)/(v0*Math.hypot(tvx,tvy)||1);
    const cierre=(1-cos)*.5;                       // 0 recto, 1 media vuelta
    acc*=1-clamp(cierre*(v0/9.5)*0.62,0,.55);
  }
  const dl=Math.hypot(dvx,dvy), mx=acc*dt;
  if(dl>mx){dvx=dvx/dl*mx;dvy=dvy/dl*mx;}
  p.vx+=dvx;p.vy+=dvy;
  p.x+=p.vx*dt;p.y+=p.vy*dt;
  p.x=clamp(p.x,-1.5,F.W+1.5); p.y=clamp(p.y,-1.5,F.H+1.5);
  const sp=Math.hypot(p.vx,p.vy);
  if(sp>.4){const a=Math.atan2(p.vy,p.vx);
    let d=a-p.face; while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI;
    p.face+=d*Math.min(1,dt*11);}
  // al estar casi parado, el jugador mira hacia el punto de mira
  if(p===S.ctrl&&!p.team.ai&&S.mouse.on&&sp<1.3){
    const w=screenToWorld(S.mouse.sx,S.mouse.sy);
    const a=Math.atan2(w.y-p.y,w.x-p.x);
    let d=a-p.face; while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI;
    p.face+=d*Math.min(1,dt*13);
  }
  // resistencia: el sprint es lo caro, trotar casi no cuesta y andar recupera
  let drain;
  if(p.sprint&&sp>4.2) drain=2.45-p.a.stm*.010;
  else if(sp>2.8) drain=.22;
  else if(sp>.7) drain=-1.5;
  else drain=-3.8;
  p.mKm+=Math.hypot(p.vx,p.vy)*dt/1000;
  p.stam=clamp(p.stam-drain*dt,10,100);
}
function separate(){
  for(let i=0;i<S.players.length;i++)for(let j=i+1;j<S.players.length;j++){
    const a=S.players[i],b=S.players[j];
    const dx=b.x-a.x,dy=b.y-a.y;
    if(dx>1.06||dx<-1.06||dy>1.06||dy<-1.06)continue;   // descarte sin raíz
    const d=Math.hypot(dx,dy);
    if(d<1.06&&d>0.001){
      const push=(1.06-d)/2, u={x:dx/d,y:dy/d};
      a.x-=u.x*push;a.y-=u.y*push;b.x+=u.x*push;b.y+=u.y*push;
    }
  }
}

/* ── control del usuario ──────────────────────────────────── */
function userStep(dt){
  const p=S.ctrl; if(!p)return;
  S.switchCd=Math.max(0,S.switchCd-dt);
  if(S.charging)S.charge=Math.min(1.05,S.charge+dt);
  if(S.passing)S.passHold=Math.min(.8,S.passHold+dt);
  if(S.restart&&S.restart.type==='penalty'&&S.restart.taker===p){
    // carrerilla corta: puedes moverte, pero no rebasar el punto de penalti
    const dir=p.team.dir;
    const lim=S.restart.pos.x-dir*0.9;
    S.restart.t+=dt;
    const d=inputDir(); p.md=d||{x:0,y:0}; p.sprint=false;
    movePlayer(p,dt);
    if(dir>0)p.x=Math.min(p.x,lim); else p.x=Math.max(p.x,lim);
    p.face=Math.atan2(CY-p.y,(dir>0?F.W:0)-p.x);
    if(S.charging)S.charge=Math.min(1.05,S.charge+dt);
    if(S.restart.t>12)ejecutarPenal(.8);   // que no se quede colgado
    return;
  }
  if(S.restart&&S.restart.team===S.teams[0]&&S.restart.taker===p){
    const d=dist(p,S.restart.pos);
    if(d>.7){ steerTo(p,S.restart.pos,true); movePlayer(p,dt); return; }
    S.restart.t+=dt;
    if(S.restart.t>.35) takeRestart();
  }
  const dir=inputDir();
  p.md=dir||{x:0,y:0};
  p.sprint=!!ACT.sprint&&p.stam>6;
  // presionar cuando no tienes el balón
  if(ACT.pass&&!p.hasBall()){
    const ip=interceptPoint(p);
    p.md=norm(ip.x-p.x,ip.y-p.y); p.sprint=p.stam>10;
  }
  if(dir&&!p.hasBall()&&S.ball.owner&&S.ball.owner.team===p.team){}
  movePlayer(p,dt);
  // autocambio: al que de verdad llega antes al balón
  S.switchLock=Math.max(0,S.switchLock-dt);
  if(S.cycleT>0){S.cycleT-=dt; if(S.cycleT<=0)S.recent=[];}
  if(S.switchCd<=0&&S.switchLock<=0&&!S.charging&&!S.passing&&!p.hasBall()&&p.slide<=0&&!S.restart){
    const b=S.ball;
    if(!b.owner||b.owner.team!==p.team){
      const rx=b.x+b.vx*.45, ry=b.y+b.vy*.45;
      const tm=q=>Math.hypot(q.x-rx,q.y-ry)/Math.max(3.5,q.maxSpd);
      let best=null,bt=1e9;
      for(const q of S.teams[0].players){
        if(q.role==='GK'&&dist(q,b)>15)continue;
        const v=tm(q); if(v<bt){bt=v;best=q;}
      }
      const marg=[1.3,.45,.12][S.tune.sw];
      if(best&&best!==p&&bt+marg<tm(p)){S.ctrl=best;S.switchCd=.3;}
    }else if(b.owner&&b.owner.team===p.team){
      S.ctrl=b.owner; S.switchCd=.2;
    }
  }
}

/* ── bucle ────────────────────────────────────────────────── */
function step(dt){
  if(S.freeze>0){
    S.freeze-=dt; S.t=(S.t||0)+dt;
    pasoFiesta(dt);
    if(S.celeb){
      S.celeb.t-=dt;
      if(S.celeb.t<=0){                     // acabada la fiesta, va la repetición
        const d=repReproducir(S.celeb.txt);
        S.celeb=null;
        S.freeze=d||1.0;
      }
    } else repPaso(dt);
    if(S.freeze<=0&&S.deadline){const f=S.deadline;S.deadline=null;f();}
    return;
  }
  S.noPress=Math.max(0,S.noPress-dt);
  if(S.tanda){
    const T=S.tanda;
    if(T.vivo)T.t+=dt;
    if(T.vivo&&T.t>7)marcarPenal(false);           // si nadie tira, fallado
    if(T.fin){ T.cierre-=dt; if(T.cierre<=0)cerrarTanda(); }
    else if(!T.vivo){
      T.espera-=dt;
      if(T.espera<=0)siguientePenal();
    }
  }
  repCapturar();
  if(S.retreat){
    const r=S.retreat;
    r.t-=dt;
    if(S.ball.owner!==r.taker) r.tras+=dt;      // ya se jugó el balón
    if(r.t<=0||r.tras>0.9) S.retreat=null;
  }
  if(S.restart&&!S.restart.hechoCambio){S.restart.hechoCambio=1;
    for(const t of S.teams)cambiosIA(t);}
  tutoPaso(dt);
  narrarAmbiente(dt);
  // posición previa del balón (para el cruce de líneas)
  S.ball.px=S.ball.x; S.ball.py=S.ball.y; S.ball.pz=S.ball.z;
  // el balón parado sirve para recuperar aire
  if(S.restart) for(const p of S.players) p.stam=clamp(p.stam+2.4*dt,0,100);
  // reloj
  if(!S.training){
    if(!S.restart||S.restart.type!=='kickoff'){
      S.clock+=dt*(2700/S.halfLen);
    }else S.clock+=dt*(2700/S.halfLen)*.3;
    if(!S.tanda&&S.clock>=2700+S.anadido){
      if(S.half===1) halfTime(); else fullTime();
      return;
    }
  }else{
    S.drill.t+=dt;
    const lim=(S.drill.type==='pen'||S.drill.type==='fk')?(S.drill.hold?25:5):14;
    if(S.drill.t>lim){drillMiss('Siguiente intento');return;}
    const o=S.ball.owner;
    if(o&&o.team===S.teams[1]){
      S.drill.defT+=dt;
      if(S.drill.defT>1.5)drillMiss(o.role==='GK'?'Atajada del portero':'Recuperación rival');
    }else S.drill.defT=0;
  }
  // posesión estadística
  if(S.poss) S.possTick[ti(S.poss)]+=dt;
  // usuario
  userStep(dt);
  // IA
  for(const p of S.players){
    if(p===S.ctrl&&!p.team.ai) continue;
    aiPlayer(p,dt);
    movePlayer(p,dt);
  }
  separate();
  if(faltasPorContacto(dt))return;
  possessionStep(dt);
  ballStep(dt);
  blockStep();
  checkBounds();
  // cámara
  const b=S.ball;
  const look=b.owner?{x:b.x+b.owner.team.dir*4.5,y:b.y}:{x:b.x+b.vx*.35,y:b.y+b.vy*.35};
  S.cam.x=lerp(S.cam.x,look.x,1-Math.pow(.002,dt));
  S.cam.y=lerp(S.cam.y,look.y,1-Math.pow(.004,dt));
  if(S.shake>0)S.shake=Math.max(0,S.shake-dt*1.6);
  pasoFiesta(dt);
}
function halfTime(){
  SFX.silbato();
  S.half=2;S.clock=0;S.anadido=0;
  for(const t of S.teams) t.dir*=-1;
  const kick=S.teams[1];
  kickoff(kick);
  flash('DESCANSO');
  say(`Descanso: ${S.teams[0].tag} ${S.score[0]}-${S.score[1]} ${S.teams[1].tag}`,'nt');
  for(const p of S.players) p.stam=clamp(p.stam+62,0,100);
  S.freeze=2.2;
}
function fullTime(){
  SFX.silbato();
  S.historico=S.historico||{pj:0,g:0,e:0,p:0,gf:0,gc:0};
  const hi=S.historico; hi.pj++; hi.gf+=S.score[0]; hi.gc+=S.score[1];
  if(S.score[0]>S.score[1])hi.g++; else if(S.score[0]<S.score[1])hi.p++; else hi.e++;
  if(S.carRival&&CAR&&!CAR.fin&&CAR.fase==='copa'&&S.score[0]===S.score[1]){
    iniciarTanda(); return;
  }
  if(S.compRival&&COMP&&COMP.tipo==='copa'&&!COMP.fin&&S.score[0]===S.score[1]){
    iniciarTanda(); return;                       // no hay empates en eliminatoria
  }
  S.running=false;S.phase='end';
  S.subidas=progresar();
  if(S.compRival&&COMP&&!COMP.fin){cerrarJornada(S.score[0],S.score[1]);S.compRival=null;}
  if(S.carRival&&CAR&&!CAR.fin){
    if(CAR.fase==='copa')cerrarRondaCopa(S.score[0],S.score[1]);
    else cerrarJornadaCarrera(S.score[0],S.score[1]);
    S.carRival=null;
  }
  guardar();
  mostrarFinal(false);
}
/* ══ PROGRESIÓN ═══════════════════════════════════════════
   Los atributos no se compran: suben por lo que el jugador hizo
   en el campo, con techo por edad y desgaste si no juega.     */
const TECHO=92, SUBIDA=100;      // puntos de experiencia por +1
function progresar(){
  const t=S.teams[0]; if(!t||!S.miPlantilla)return [];
  const subidas=[];
  for(const p of t.players){
    const f=S.miPlantilla[p.ficha]; if(!f)continue;
    f.exp=f.exp||{pace:0,ctl:0,pas:0,sho:0,tkl:0};
    f.hist=f.hist||{pj:0,goles:0,asis:0};
    f.edad=f.edad||24;
    f.hist.pj++; f.hist.goles+=p.goals; f.hist.asis+=p.assists;
    // cuánto aprende: la juventud rinde más y hay techo por edad
    const joven=clamp((30-f.edad)/12,0.15,1.25);
    const gana=(k,v)=>{ f.exp[k]=(f.exp[k]||0)+v*joven; };
    gana('sho',p.goals*38+p.mTiros*4);
    gana('pas',p.mPases*1.6+p.assists*30);
    gana('tkl',p.mEntradas*9);
    gana('ctl',p.mPases*0.7+p.mTiros*2+p.goals*8);
    gana('pace',p.mKm*22);
    for(const k of ['pace','ctl','pas','sho','tkl']){
      while(f.exp[k]>=SUBIDA&&f.a[k]<TECHO){
        f.exp[k]-=SUBIDA; f.a[k]++;
        subidas.push({nom:f.name,at:k,val:f.a[k]});
      }
      if(f.a[k]>=TECHO)f.exp[k]=Math.min(f.exp[k],SUBIDA*0.9);
    }
  }
  // los suplentes que no jugaron pierden algo de punta
  const jugaron=new Set(t.players.map(p=>p.ficha));
  S.miPlantilla.forEach((f,i)=>{
    if(jugaron.has(i))return;
    f.sinJugar=(f.sinJugar||0)+1;
    if(f.sinJugar>=4){ f.sinJugar=0;
      f.a.pace=Math.max(40,f.a.pace-1); }
  });
  return subidas;
}
function mostrarFinal(porTanda){
  const h=S.score[0],a=S.score[1];
  $('endH').textContent=h+(porTanda&&S.tandaRes?' ('+S.tandaRes[0]+')':'');
  $('endA').textContent=a+(porTanda&&S.tandaRes?' ('+S.tandaRes[1]+')':'');
  $('endHT').textContent=S.teams[0].tag;
  $('endAT').textContent=S.teams[1].tag;
  const t=$('endTitle');
  if(porTanda&&S.tandaRes){
    const gan=S.tandaRes[0]>S.tandaRes[1];
    t.textContent=gan?'PASAS EN LOS PENALTIS':'ELIMINADO EN LOS PENALTIS';
  } else t.textContent=h>a?'VICTORIA':h<a?'DERROTA':'EMPATE';
  t.style.color=h>a?'var(--home)':h<a?'var(--away)':'var(--ink)';
  const pos=Math.round(100*S.possTick[0]/Math.max(.1,S.possTick[0]+S.possTick[1]));
  $('scorers').innerHTML=scorersHTML()+
    ((S.subidas&&S.subidas.length)?
      '<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px">'+
      S.subidas.slice(0,8).map(x=>`<div><b>▲</b>${x.nom} · ${
        ({pace:'velocidad',ctl:'control',pas:'pase',sho:'tiro',tkl:'entrada'})[x.at]} ${x.val}</div>`).join('')+
      (S.subidas.length>8?`<div style="opacity:.6">y ${S.subidas.length-8} más…</div>`:'')+'</div>'
      :'');
  const star=S.teams[0].star;
  const line=star?` ${star.name}: ${star.goals} gol(es), ${star.assists} asist.`:'';
  $('endLine').textContent=
    `${pos}% de posesión · ${S.stats.sh[0]} remates · ${S.stats.pa[0]} pases completados · ${S.stats.fo[0]} faltas.${line} Dificultad ${S.D.lbl}.`;
  $('end').classList.remove('hide');
}

/* ── HUD ──────────────────────────────────────────────────── */
function say(txt,cls){
  const f=$('feed');
  const min=Math.floor((S.half-1)*45+S.clock/60)+1;
  const d=document.createElement('div');
  if(cls)d.className=cls;
  d.innerHTML=`<b>${min}'</b>${txt}`;
  f.appendChild(d);
  while(f.children.length>5)f.removeChild(f.firstChild);
  setTimeout(()=>{if(d.parentNode)d.parentNode.removeChild(d);},7000);
}
let flashT=null;
function flash(txt){
  const e=$('flash');
  e.textContent=txt;e.classList.remove('on');void e.offsetWidth;e.classList.add('on');
}
function threat(){
  if(!S.poss)return 0;
  const t=S.poss,b=S.ball;
  const gx=t.dir>0?F.W:0;
  const d=Math.hypot(b.x-gx,b.y-CY);
  let v=clamp(1-(d-5)/42,0,1);
  v*=1-Math.abs(b.y-CY)/34*.5;
  let blockers=0;
  for(const o of other(t).players){
    if(o.role==='GK')continue;
    if(segDist(o.x,o.y,b.x,b.y,gx,CY)<4.5) blockers++;
  }
  v*=clamp(1-blockers*.10,.12,1);
  return clamp(v,0,1);
}
let hudT=0;
function setTxt(id,v){const e=$(id);if(e&&e._v!==v){e._v=v;e.textContent=v;}}
function hud(dt){
  hudT+=dt; if(hudT<.1)return; hudT=0;
  if(S.training){
    setTxt('clock',S.score[0]+' / '+S.drill.att);
    setTxt('period',DRILL_NAMES[S.drill.type]);
  }else{
    const base=(S.half-1)*45;
    const mm=Math.floor(base+Math.min(S.clock,2700)/60), ss=Math.floor(S.clock%60);
    const extra=S.clock>2700?Math.floor((S.clock-2700)/60)+1:0;
    setTxt('clock', extra
      ? (base+45)+'+'+extra
      : String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0'));
    setTxt('period',(S.half===1?'1.ª PARTE':'2.ª PARTE')+
      (S.anadido>0?(' · +'+Math.ceil(S.anadido/60)):''));
  }
  setTxt('hGoals',S.score[0]);
  setTxt('aGoals',S.score[1]);
  const th=threat(), mine=S.poss===S.teams[0];
  const f=$('thrFill');
  f.style.width=(th*100).toFixed(0)+'%';
  f.style.background=mine?'var(--home)':'var(--away)';
  setTxt('thrTxt',S.poss?(S.poss.tag+' '+Math.round(th*100)):'—');
  const tot=Math.max(.1,S.possTick[0]+S.possTick[1]);
  setTxt('sPosH',Math.round(100*S.possTick[0]/tot));
  setTxt('sPosA',Math.round(100*S.possTick[1]/tot));
  const st=S.stats;
  setTxt('sShH',st.sh[0]);setTxt('sShA',st.sh[1]);
  setTxt('sSoH',st.so[0]);setTxt('sSoA',st.so[1]);
  setTxt('sPaH',st.pa[0]);setTxt('sPaA',st.pa[1]);
  setTxt('sFoH',st.fo[0]);setTxt('sFoA',st.fo[1]);
  setTxt('sYcH',st.yc[0]);setTxt('sYcA',st.yc[1]);
  setTxt('sCoH',st.co[0]);setTxt('sCoA',st.co[1]);
  const p=S.ctrl;
  if(p){
    setTxt('pNum',p.num);
    setTxt('pName',p.name.toUpperCase());
    setTxt('pPos',{GK:'POR',DF:'DEF',MF:'MED',FW:'DEL'}[p.role]);
    $('pStam').style.width=p.stam+'%';
    setTxt('aPac',Math.round(p.a.pace));
    setTxt('aCtl',Math.round(p.a.ctl));
    setTxt('aPas',Math.round(p.a.pas));
    setTxt('aSho',Math.round(p.a.sho));
    setTxt('pGls',p.goals);
  }
  if(!S.hintOn){
    $('hint').style.display='none';
  } else {
    $('hint').style.display='';
    if(S.tanda){
      const T=S.tanda, m=i=>T.marcas[i].map(x=>x?'●':'○').join(' ')||'—';
      setTxt('clock',T.marcas[0].reduce((a,b)=>a+b,0)+' - '+T.marcas[1].reduce((a,b)=>a+b,0));
      setTxt('period','PENALTIS · tira '+S.teams[tandaTurno()].tag);
      $('hint').innerHTML='<b>'+S.teams[0].tag+'</b> '+m(0)+' &nbsp;·&nbsp; <b>'+S.teams[1].tag+'</b> '+m(1)+
        (tandaTurno()===0?' &nbsp;— <b>clic izq</b> para tirar':' &nbsp;— tira el rival');
    } else $('hint').innerHTML=hintText();
  }
  hudFade();
  drawRadar();
}
let HUDEL=null;
function hudFade(){
  if(!HUDEL) HUDEL=['board','minimap','card','feed','hint']
    .map(i=>$(i)).filter(Boolean);
  if(!S.view)return;
  if(!S.hudOn){ for(const el of HUDEL) el.style.opacity=0; return; }
  const w2sx=x=>(x-S.view.x)*S.view.sc+cvW/2;
  const w2sy=y=>(y-S.view.y)*S.view.sc+cvH/2;
  const b=S.ball, pts=[{x:w2sx(b.x),y:w2sy(b.y-b.z*.42)}];
  if(S.ctrl)pts.push({x:w2sx(S.ctrl.x),y:w2sy(S.ctrl.y)});
  S.rectsT=(S.rectsT||0)-1;
  const refresh=S.rectsT<=0; if(refresh)S.rectsT=5;
  for(const el of HUDEL){
    if(refresh||!el._r)el._r=el.getBoundingClientRect();
    const r=el._r;
    let near=false;
    for(const p of pts){
      if(p.x>r.left-46&&p.x<r.right+46&&p.y>r.top-46&&p.y<r.bottom+46){near=true;break;}
    }
    el.style.opacity=near?.1:1;
  }
}
function hintText(){
  if(S.cfg.mode==='tuto'&&TUTO.c)return tutoTexto();
  const p=S.ctrl,b=S.ball;
  if(!p)return '';
  if(S.restart&&S.restart.taker===p)return 'Camina hasta el balón para poner en juego';
  if(p.hasBall())return '<b>clic izq</b> tiro (mantén) · <b>clic der</b> pase (al hueco si apuntas a espacio vacío) · <b>Z</b>+clic filtrado · <b>E</b> elevado · <b>V</b> raso · <b>G</b> colocado';
  if(!b.owner&&!b.frozen&&dist(p,b)<3.3)
    return '<b>clic izq</b> remate de primera · <b>clic der</b> pase de primera · <b>E</b> control orientado';
  if(b.owner&&b.owner.team!==p.team)
    return '<b>Q</b> presionar · <b>X</b> barrida · <b>C</b> cambiar (la flecha marca a quién)';
  return '<b>C</b> cambiar jugador · <b>F</b> sprint · <b>rueda</b> zoom · <b>T</b> ocultar HUD';
}
function drawRadar(){
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

/* ── render ───────────────────────────────────────────────── */
const cv=$('cv'),ctx=cv.getContext('2d');
const radarCv=$('radar'),rctx=radarCv.getContext('2d');
let cvW=0,cvH=0,SC=12,SCbase=12,DPRCAP=1.5,lowFX=false,FPS=60;
function resize(){
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
function render(){
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
function celebrar(color,propio){
  FIESTA.t=2.6; FIESTA.color=color; FIESTA.propio=propio; FIESTA.bits=[];
  for(let i=0;i<90;i++){
    const a=Math.random()*6.283, v=6+Math.random()*22;
    FIESTA.bits.push({x:S.ball.x,y:S.ball.y,
      vx:Math.cos(a)*v,vy:Math.sin(a)*v-6,vz:2+Math.random()*7,z:0,
      g:0.55+Math.random()*.4,r:Math.random()*6.283});
  }
}
function pasoFiesta(dt){
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
let acc=0,last=performance.now(),fpsN=0,fpsT=0;
function frame(now){
  requestAnimationFrame(frame);
  let dt=(now-last)/1000;last=now;
  if(dt>.25)dt=.25;
  fpsN++;fpsT+=dt;
  if(fpsT>=1){
    FPS=fpsN/fpsT;fpsN=0;fpsT=0;
    if(FPS<45&&DPRCAP>1&&S.tune.q<2){DPRCAP=1;resize();}
    else if(FPS<38&&!lowFX&&S.tune.q<2)lowFX=true;
  }
  if(S.running&&S.phase==='play'&&!S.pausedFlag){
    acc+=dt;
    let n=0;
    while(acc>=DT&&n<6){step(DT);acc-=DT;n++;}
    S.alpha=clamp(acc/DT,0,1);
    hud(dt);
  }
  if(S.teams.length)render();
}
requestAnimationFrame(frame);

/* ── menús ────────────────────────────────────────────────── */
function group(id,key,multi){
  const el=$(id);
  el.addEventListener('click',e=>{
    const b=e.target.closest('.opt'); if(!b)return;
    if(multi){
      const on=b.getAttribute('aria-pressed')==='true';
      b.setAttribute('aria-pressed',String(!on));
      S.cfg[b.dataset.v]=!on;
    }else{
      [...el.children].forEach(c=>c.setAttribute('aria-pressed','false'));
      b.setAttribute('aria-pressed','true');
      S.cfg[key]=key==='len'?parseInt(b.dataset.v,10):b.dataset.v;
    }
  });
}
group('optMode','mode');group('optDiff','diff');group('optForm','form');group('optLen','len');group('optRules',null,true);

/* ══ NAVEGACIÓN, ALINEACIÓN Y COMPETICIONES ═══════════════ */
const PANES=['pMain','pJugar','pAmis','pComp','pEntr','pConf','pPlantel','pCar'];
function irA(id){
  PANES.forEach(k=>{const e=$(k); if(e)e.classList.toggle('hide',k!==id);});
  if(id==='pConf')pintarConf();
  if(id==='pPlantel')pintarPlantel();
  if(id==='pCar')pintarCarrera();
  if(id==='pComp')pintarComp();
}
document.querySelectorAll('[data-ir]').forEach(b=>b.onclick=()=>irA(b.dataset.ir));
cargar();      // recupera club, plantilla, ajustes y competición en curso

S.miPlantilla=makeSquad(false,.55);
S.nLiga=6; S.nCopa=8; S.cfg.f7=false;
S.miOnce=null; S.miPlan='equilibrado';
let selTit=-1;
const valorDe=f=>Math.round((f.a.pace+f.a.ctl+f.a.pas+f.a.sho+f.a.tkl)/5);
function onceActual(){
  if(S.miOnce)return S.miOnce;
  const D=DIBUJOS();
  const slots=D[S.cfg.form]||D[Object.keys(D)[0]], us=new Set(), xi=[];
  slots.forEach(sl=>{
    let b=-1,bs=-1e9;
    S.miPlantilla.forEach((f,i)=>{
      if(us.has(i))return;
      const enc=(f.role===sl[0])?60:(f.role==='GK'||sl[0]==='GK'?-500:0);
      const v=valorDe(f)*5+enc; if(v>bs){bs=v;b=i;}
    });
    us.add(b); xi.push(b);
  });
  S.miOnce=xi; return xi;
}
function pintarConf(){
  const fo=$v('optForm');
  fo.innerHTML=Object.keys(DIBUJOS()).map(f=>
    `<button class="opt" data-v="${f}" aria-pressed="${f===S.cfg.form?'true':'false'}">${f}</button>`).join('');
  fo.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{S.cfg.form=b.dataset.v;S.miOnce=null;pintarConf();});
  const nav=$v('confTabs');
  if(nav&&nav.querySelectorAll)nav.querySelectorAll('.tab').forEach(b=>b.onclick=()=>irTab(b.dataset.tab));
  irTab(tabActiva);
  pintarCantera();
  pintarControles();
  const gb2=$v('bGuardar'), bb=$v('bBorrar'), sm=$v('saveMsg');
  if(gb2)gb2.onclick=()=>{ const ok=guardar();
    sm.textContent=ok?'Partida guardada en este navegador.':'No se pudo guardar: '+SAVE.aviso; };
  if(bb)bb.onclick=()=>{ borrarGuardado(); sm.textContent='Partida borrada. Se aplicará al recargar.'; };
  if(sm&&!sm.textContent)sm.textContent=SAVE.ok?'Se guarda solo al terminar cada partido.':SAVE.aviso;
  const su=$v('optSup');
  if(su){
    su.innerHTML=Object.keys(SUPERFICIES).map(k=>
      `<button class="opt" data-v="${k}" aria-pressed="${S.cfg.sup===k?'true':'false'}">${SUPERFICIES[k].lbl}</button>`).join('')
      +`<button class="opt" data-v="azar" aria-pressed="${(!S.cfg.sup||S.cfg.sup==='azar')?'true':'false'}">Al azar<small>en fútbol 7 siempre sintético</small></button>`;
    if(su.querySelectorAll)su.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{
      S.cfg.sup=b.dataset.v;
      if(SUPERFICIES[b.dataset.v])SUP=SUPERFICIES[b.dataset.v];
      pitchCv=null; pintarConf();});
  }
  const mo=$v('optMod');
  if(mo&&mo.querySelectorAll){ mo.querySelectorAll('.opt').forEach(b=>{
    b.setAttribute('aria-pressed',String((b.dataset.v==='1')===!!S.cfg.f7));
    b.onclick=()=>{ S.cfg.f7=b.dataset.v==='1';
      S.cfg.form=S.cfg.f7?'2-3-1':'4-3-3'; S.miOnce=null; pintarConf(); };});}
  const inN=$v('inNombre'), inT=$v('inTag');
  if(inN){
    inN.value=MIEQUIPO.name; inT.value=MIEQUIPO.tag;
    inN.oninput=()=>{MIEQUIPO.name=inN.value; pintarPrev();};
    inN.onblur=()=>{ if(!inN.value.trim()){MIEQUIPO.name='Anti-Atléticos';inN.value=MIEQUIPO.name;pintarPrev();} };
    inT.oninput=()=>{MIEQUIPO.tag=inT.value.toUpperCase().slice(0,4); pintarPrev();};
    inT.onblur=()=>{ if(!inT.value.trim()){MIEQUIPO.tag='ANT';inT.value=MIEQUIPO.tag;pintarPrev();} };
  }
  const pb=$v('paletaBox');
  if(pb){
    pb.innerHTML=PALETAS.map((c,i)=>
      `<button class="swatch" data-i="${i}" style="background:${c[0]}" ${c[0]===MIEQUIPO.pal.main?'data-on="1"':''}></button>`).join('');
    pb.querySelectorAll('.swatch').forEach(b=>b.onclick=()=>{
      const c=PALETAS[+b.dataset.i];
      MIEQUIPO.pal={main:c[0],dark:c[1],txt:c[1]};
      pintarConf();
    });
  }
  pintarPrev();
  const so=$v('optSnd');
  if(so&&so.querySelectorAll){ so.querySelectorAll('.opt').forEach(b=>{
      b.setAttribute('aria-pressed', String((b.dataset.v==='1')===SND.on));
      b.onclick=()=>{SND.on=b.dataset.v==='1'; if(SND.on)audio(); pintarConf();};});}
  const po=$v('optPlan');
  po.innerHTML=Object.keys(PLANES).map(k=>
    `<button class="opt" data-v="${k}" aria-pressed="${k===S.miPlan?'true':'false'}">${PLANES[k].lbl}<small>${PLANES[k].d}</small></button>`).join('');
  po.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{S.miPlan=b.dataset.v;pintarConf();});
  const xi=onceActual(), slots=DIBUJOS()[S.cfg.form]||[];
  const fila=(f,i,pos,sel)=>`<div class="fila ${sel?'sel':''}" data-i="${i}">
      <span class="pos">${pos}</span><span class="dor">${f.num}</span>
      <span class="nom">${f.name}</span><span class="val">${valorDe(f)}</span></div>`;
  pintarOnce('onceBox');
}
function pintarOnce(destino){
  const xi=onceActual(), slots=DIBUJOS()[S.cfg.form]||[];
  const fila=(f,i,pos,sel)=>`<div class="fila ${sel?'sel':''}" data-i="${i}">
      <span class="pos">${pos}</span><span class="dor">${f.num}</span>
      <span class="nom">${f.name}</span><span class="val">${valorDe(f)}</span></div>`;
  const box=$v(destino); if(!box)return;
  box.innerHTML=
    `<div class="lista"><h5>ONCE INICIAL · ${S.cfg.form}</h5>`+
      xi.map((fi,k)=>fila(S.miPlantilla[fi],k,slots[k][0],selTit===k)).join('')+`</div>
     <div class="lista"><h5>SUPLENTES</h5>`+
      S.miPlantilla.map((f,i)=>xi.includes(i)?'':fila(f,i,f.role,false)).join('')+`</div>`;
  const cajas=box.children;
  if(cajas&&cajas[0]&&cajas[1]){
    [...cajas[0].querySelectorAll('.fila')].forEach(el=>el.onclick=()=>{
      selTit=(selTit===+el.dataset.i)?-1:+el.dataset.i; pintarOnce(destino);});
    [...cajas[1].querySelectorAll('.fila')].forEach(el=>el.onclick=()=>{
      if(selTit<0)return; S.miOnce[selTit]=+el.dataset.i; selTit=-1;
      guardar(); pintarOnce(destino); pintarFichas&&pintarFichas();});
  }
}
function pintarPrev(){
  const el=$v('clubPrev'); if(!el)return;
  el.innerHTML=`<span class="chip" style="background:${MIEQUIPO.pal.main}"></span>
    <b style="color:${MIEQUIPO.pal.main}">${MIEQUIPO.tag}</b> ${MIEQUIPO.name}`;
}
/* ── pestañas de configuración ── */
const TABS=['tClub','tPlant','tTac','tPart','tDatos','tControles'];
let tabActiva='tClub';
function irTab(id){
  tabActiva=id;
  TABS.forEach(k=>{const e=$v(k); if(e)e.classList.toggle('hide',k!==id);});
  const nav=$v('confTabs');
  if(nav&&nav.querySelectorAll)nav.querySelectorAll('.tab').forEach(b=>
    b.setAttribute('aria-pressed',String(b.dataset.tab===id)));
}
/* ── apartado PLANTEL ── */
const PTABS=['jPlant','jOnce','jCant'];
let ptabActiva='jPlant';
function irPTab(id){
  ptabActiva=id;
  PTABS.forEach(k=>{const e=$v(k); if(e)e.classList.toggle('hide',k!==id);});
  const nav=$v('planTabs');
  if(nav&&nav.querySelectorAll)nav.querySelectorAll('.tab').forEach(b=>
    b.setAttribute('aria-pressed',String(b.dataset.ptab===id)));
}
const nomArq=id=>{const a=ARQUETIPOS.find(x=>x.id===id);return a?a.n:'CLÁSICO';};
function pintarFichas(){
  const box=$v('fichasBox'); if(!box)return;
  const xi=onceActual();
  box.innerHTML=S.miPlantilla.map((f,i)=>{
    const tit=xi.includes(i);
    const h=f.hist||{pj:0,goles:0,asis:0};
    const barras=ATRIB.map(([k,l])=>
      `<div class="atb"><span>${l.slice(0,3)}</span>
         <i style="width:${clamp((f.a[k]-30)/62*100,3,100)}%"></i><b>${f.a[k]}</b></div>`).join('');
    return `<div class="ficha ${tit?'tit':''}">
      <div class="fh"><span class="fnum">${f.num}</span>
        <div><div class="fnom">${f.name}</div>
        <div class="farq">${nomArq(f.arq)} · ${f.role} · ${f.edad||24} años${tit?' · TITULAR':''}</div></div>
        <div class="fval">${valorDe(f)}</div></div>
      <div class="fbars">${barras}</div>
      <div class="fhist">${h.pj} partidos · ${h.goles} goles · ${h.asis} asistencias</div>
    </div>`;
  }).join('');
}
function pintarPlantel(){
  const nav=$v('planTabs');
  if(nav&&nav.querySelectorAll)nav.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{irPTab(b.dataset.ptab);pintarPlantel();});
  irPTab(ptabActiva);
  pintarFichas();
  pintarOnce('onceBox2');
  pintarCantera();
}
function pintarCantera(){
  const box=$v('canteraBox'); if(!box)return;
  const sel=CANTERA.arq, selR=CANTERA.rasgo;
  const prev=fichaDeArquetipo(sel,selR,CANTERA.nombre,CANTERA.dorsal);
  box.innerHTML=
    `<div class="arqgrid">`+ARQUETIPOS.map(a=>
      `<button class="arq ${a.id===sel?'on':''}" data-arq="${a.id}">
         <b>${a.n}</b><span class="ar">${a.rol}</span><span class="ad">${a.d}</span></button>`).join('')+`</div>
     <h3 style="margin-top:20px">Rasgo</h3>
     <div class="opts">`+RASGOS.map(r=>
      `<button class="opt" data-rasgo="${r.id}" aria-pressed="${r.id===selR?'true':'false'}">${r.n}<small>${r.d}</small></button>`).join('')+`</div>
     <h3 style="margin-top:20px">Ficha</h3>
     <div class="club">
       <div class="cfield"><small>NOMBRE</small><input id="cvNom" maxlength="14" value="${CANTERA.nombre||''}" placeholder="${prev.name}"></div>
       <div class="cfield" style="max-width:90px"><small>DORSAL</small><input id="cvNum" maxlength="2" value="${CANTERA.dorsal||20}"></div>
     </div>
     <div class="ficha" style="margin-top:10px">
       <div class="fh"><span class="fnum">${prev.num}</span>
         <div><div class="fnom">${CANTERA.nombre||prev.name}</div>
         <div class="farq">${nomArq(prev.arq)} · ${prev.role} · ${prev.edad} años</div></div>
         <div class="fval">${valorDe(prev)}</div></div>
       <div class="fbars">`+ATRIB.map(([k,l])=>
         `<div class="atb"><span>${l.slice(0,3)}</span><i style="width:${clamp((prev.a[k]-30)/62*100,3,100)}%"></i><b>${prev.a[k]}</b></div>`).join('')+`</div>
     </div>
     <button class="go" id="bFichar" style="margin-top:12px" ${S.miPlantilla.length>=24?'disabled':''}>
       ${S.miPlantilla.length>=24?'PLANTILLA LLENA (24)':'AÑADIR A LA PLANTILLA ('+S.miPlantilla.length+'/24)'}</button>`;
  if(!box.querySelectorAll)return;
  box.querySelectorAll('[data-arq]').forEach(b=>b.onclick=()=>{CANTERA.arq=b.dataset.arq;pintarCantera();});
  box.querySelectorAll('[data-rasgo]').forEach(b=>b.onclick=()=>{CANTERA.rasgo=b.dataset.rasgo;pintarCantera();});
  const nm=$v('cvNom'), nu=$v('cvNum');
  if(nm)nm.oninput=()=>{CANTERA.nombre=nm.value;};
  if(nu)nu.oninput=()=>{CANTERA.dorsal=clamp(parseInt(nu.value)||20,1,99);};
  const bf=$v('bFichar');
  if(bf)bf.onclick=()=>{
    if(S.miPlantilla.length>=24)return;
    S.miPlantilla.push(fichaDeArquetipo(CANTERA.arq,CANTERA.rasgo,CANTERA.nombre,CANTERA.dorsal));
    CANTERA.nombre=''; S.miOnce=null; guardar(); pintarPlantel();
  };
}
/* ── pantalla de carrera ── */
function pintarCarrera(){
  const box=$v('carBox'); if(!box)return;
  if(!CAR){
    box.innerHTML=`<p class="ayuda">Empiezas en <b>Tercera</b> con tu plantilla actual. Cada temporada son 14 jornadas a doble vuelta y después la <b>copa</b> de tu división. Los dos primeros ascienden, los dos últimos bajan. En verano tus jugadores envejecen, algunos se retiran y suben dos juveniles.</p>
      <button class="go" id="bNuevaCar">EMPEZAR CARRERA</button>`;
    if(box.querySelector)$v('bNuevaCar').onclick=()=>{nuevaCarrera();guardar();pintarCarrera();};
    return;
  }
  const yo=miCar(), orden=clasificacion(), eq=CAR.divs[CAR.div];
  const pos=orden.findIndex(t=>t.i===yo)+1;
  const enCopa=CAR.fase==='copa';
  const h=enCopa?partidoCopa():partidoCarrera();
  const U=CAR.ultima;
  let html=`<div class="carhead">
      <div><small>TEMPORADA</small><b>${CAR.temporada}</b></div>
      <div><small>DIVISIÓN</small><b>${DIVS[CAR.div]}</b></div>
      <div><small>POSICIÓN</small><b>${pos}.º</b></div>
      <div><small>${enCopa?'COPA':'JORNADA'}</small><b>${enCopa
        ?(RONDAS_CAR[CAR.copa.ronda]||'—')
        :Math.min(CAR.jornada+1,CAR.calendario.length)+'/'+CAR.calendario.length}</b></div>
      <div class="obj"><small>OBJETIVO DEL CLUB</small><b>${CAR.objetivo}</b></div>
    </div>`;
  // ceremonia de traspaso de temporada
  if(U&&CAR.jornada===0&&CAR.fase==='liga'){
    const medalla=U.campeonLiga?'🏆':(U.mov==='ASCIENDE'?'▲':U.mov==='DESCIENDE'?'▼':'—');
    html+=`<div class="ceremonia ${U.mov==='ASCIENDE'?'sube':U.mov==='DESCIENDE'?'baja':''}">
      <div class="cmedal">${medalla}</div>
      <div class="cbody">
        <div class="ctit">TEMPORADA ${U.temporada} · ${U.div}</div>
        <div class="cmov">${U.pos}.º puesto — ${U.mov==='ASCIENDE'?'ASCIENDES DE CATEGORÍA'
          :U.mov==='DESCIENDE'?'DESCIENDES':'te mantienes'}</div>
        <div class="rgrid">
          <div><small>CAMPEÓN DE LIGA</small><b>${U.campeon}</b></div>
          <div><small>COPA</small><b>${U.copaTuya?'¡TUYA!':U.copa}</b></div>
          <div><small>PUNTOS</small><b>${U.pts}</b></div>
          <div><small>GOLES</small><b>${U.gf}:${U.gc}</b></div>
          <div><small>MÁXIMO GOLEADOR</small><b>${U.pichichi}</b></div>
        </div>
        ${U.bajas.length?'<p class="ayuda"><b>Cuelgan las botas:</b> '+U.bajas.join(', ')+'</p>':''}
        ${U.nuevos.length?'<p class="ayuda"><b>Suben de la cantera:</b> '+U.nuevos.join(', ')+'</p>':''}
        ${U.subidas.length?'<p class="ayuda"><b>Acusan la edad:</b> '+U.subidas.join(', ')+'</p>':''}
      </div></div>`;
  }
  if(enCopa){
    html+='<h3 class="secttl">COPA · '+(RONDAS_CAR[CAR.copa.ronda]||'')+'</h3>';
    html+='<table class="liga">'+CAR.copa.cr.map(c=>
      `<tr class="${c.includes(yo)?'yo':''}"><td></td><td>${eq[c[0]].name} — ${eq[c[1]].name}</td></tr>`).join('')+'</table>';
    if(CAR.copa.historial.length)
      html+='<p class="ayuda">'+CAR.copa.historial.slice(-4).map(x=>
        x.r+': '+x.a+' '+x.marc+' '+x.b).join(' · ')+'</p>';
  }else{
    html+='<h3 class="secttl">CLASIFICACIÓN</h3>';
    html+='<table class="liga"><tr><th>#</th><th>EQUIPO</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>PTS</th></tr>'+
      orden.map((t,k)=>`<tr class="${eq[t.i].yo?'yo':''}${k<2?' asc':''}${k>=6?' desc':''}">
        <td>${k+1}</td><td>${eq[t.i].name}</td><td>${t.pj}</td><td>${t.g}</td><td>${t.e}</td>
        <td>${t.p}</td><td>${t.gf}</td><td>${t.gc}</td><td>${t.pts}</td></tr>`).join('')+'</table>';
  }
  const gol=Object.entries(CAR.goleadores||{}).sort((a,b)=>b[1]-a[1]).slice(0,3);
  if(gol.length)html+='<p class="ayuda"><b>Tus goleadores:</b> '+gol.map(g=>g[0]+' '+g[1]).join(' · ')+'</p>';
  if(CAR.palmares.length)html+='<p class="ayuda"><b>Historial:</b> '+
    CAR.palmares.slice(-6).map(x=>'T'+x.t+' '+x.div+' '+x.pos+'.º ('+x.mov+')').join(' · ')+'</p>';
  html+=h?`<p class="sub" style="margin-top:12px">${enCopa?(RONDAS_CAR[CAR.copa.ronda]||'Copa'):'Jornada '+(CAR.jornada+1)}: ${h.local?'recibes a':'visitas a'} <b>${h.rival.name}</b></p>
      <button class="go" id="bJugarCar">JUGAR</button>
      <button class="go ghost" id="bSimCar">SIMULAR</button>`
    :'<button class="go" id="bSimCar">CONTINUAR</button>';
  box.innerHTML=html;
  if(!box.querySelector)return;
  const bj=$v('bJugarCar');
  if(bj)bj.onclick=()=>{ S.carRival=h.rival; S.compRival=null; S.cfg.mode='match';
    $('menu').classList.add('hide'); resize(); newMatch(); };
  const bs=$v('bSimCar');
  if(bs)bs.onclick=()=>{
    const r=h?simular(.5,h.rival.q):[0,0];
    if(CAR.fase==='copa')cerrarRondaCopa(r[0],r[1]); else cerrarJornadaCarrera(r[0],r[1]);
    pintarCarrera();
  };
}
function pintarComp(){
  const box=$v('compBox');
  if(!COMP||COMP.fin){
    const fin=(COMP&&COMP.fin)?('<p class="sub">'+(COMP.tipo==='copa'
      ?'Campeón: <b>'+COMP.eq[COMP.vivos[0]].name+'</b>':'Liga terminada.')+'</p>'):'';
    box.innerHTML=fin+`
      <div class="grp"><label>EQUIPOS EN LA LIGA</label><div class="opts" id="nLiga">
        ${[4,6,8,10,12,16].map(k=>`<button class="opt" data-v="${k}" aria-pressed="${k===S.nLiga?'true':'false'}">${k}</button>`).join('')}
      </div></div>
      <div class="grp"><label>EQUIPOS EN LA COPA</label><div class="opts" id="nCopa">
        ${[4,8,16].map(k=>`<button class="opt" data-v="${k}" aria-pressed="${k===S.nCopa?'true':'false'}">${k}</button>`).join('')}
      </div></div>
      <div class="modos">
      <button class="modo" id="bLiga"><b>LIGA</b><span>Todos contra todos a una vuelta. Tú juegas tus partidos; el resto se resuelve solo.</span></button>
      <button class="modo" id="bCopa"><b>COPA</b><span>Eliminación directa. Empate en el 90 = penaltis.</span></button></div>`;
    $v('nLiga').querySelectorAll('.opt').forEach(b=>b.onclick=()=>{S.nLiga=+b.dataset.v;pintarComp();});
    $v('nCopa').querySelectorAll('.opt').forEach(b=>b.onclick=()=>{S.nCopa=+b.dataset.v;pintarComp();});
    $v('bLiga').onclick=()=>{nuevaLiga(S.nLiga);pintarComp();};
    $v('bCopa').onclick=()=>{nuevaCopa(S.nCopa);pintarComp();};
    return;
  }
  const h=partidoDeHoy();
  let html='';
  if(COMP.tipo==='liga'){
    const orden=COMP.tabla.map((t,i)=>({...t,i})).sort((a,b)=>
      b.pts-a.pts||(b.gf-b.gc)-(a.gf-a.gc)||b.gf-a.gf);
    html+=`<p class="sub">Jornada ${COMP.jornada+1} de ${COMP.jor.length} — ${h.local?'recibes a':'visitas a'} <b>${h.rival.name}</b></p>`;
    html+='<table class="liga"><tr><th>#</th><th>EQUIPO</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>PTS</th></tr>'+
      orden.map((t,k)=>`<tr class="${COMP.eq[t.i].yo?'yo':''}"><td>${k+1}</td><td>${COMP.eq[t.i].name}</td><td>${t.pj}</td><td>${t.g}</td><td>${t.e}</td><td>${t.p}</td><td>${t.gf}</td><td>${t.gc}</td><td>${t.pts}</td></tr>`).join('')+'</table>';
  }else{
    html+=`<p class="sub">${['Cuartos','Semifinal','Final'][COMP.ronda]||'Ronda'} — ${h?('juegas contra <b>'+h.rival.name+'</b>'):'quedaste eliminado'}</p>`;
    html+='<table class="liga">'+COMP.cr.map(c=>`<tr><td></td><td>${COMP.eq[c[0]].name} — ${COMP.eq[c[1]].name}</td></tr>`).join('')+'</table>';
  }
  if(COMP.historial.length)
    html+='<p class="sub" style="font-family:JetBrains Mono;font-size:10.5px">'+
      COMP.historial.slice(-6).map(x=>x.a+' '+x.r+' '+x.b).join(' · ')+'</p>';
  html+=`<div class="grp" style="margin-top:14px"><label>DURACIÓN POR PARTE</label>
    <div class="opts" id="nLen">${[120,210,330,480].map(v=>
      `<button class="opt" data-v="${v}" aria-pressed="${v===S.cfg.len?'true':'false'}">${v/60} min</button>`).join('')}</div></div>`;
  html+='<button class="go" id="bJugarComp">'+(h?'JUGAR ESTE PARTIDO':'PASAR JORNADA')+'</button>';
  box.innerHTML=html;
  const nl=$v('nLen');
  if(nl&&nl.querySelectorAll)nl.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{
    S.cfg.len=+b.dataset.v; guardar(); pintarComp();});
  $v('bJugarComp').onclick=()=>{
    if(!h){cerrarJornada(0,0);pintarComp();return;}
    S.compRival=h.rival; S.cfg.mode='match';
    $('menu').classList.add('hide'); resize(); newMatch();
  };
}
$('btnEntr').onclick=()=>{
  S.compRival=null;
  $('menu').classList.add('hide'); $('end').classList.add('hide');
  resize(); newMatch();
};
$('btnGo').onclick=()=>{
  S.compRival=null; S.cfg.mode='match';
  $('menu').classList.add('hide');
  $('end').classList.add('hide');
  resize(); newMatch();
};
$('btnAgain').onclick=()=>{
  $('end').classList.add('hide');
  $('menu').classList.remove('hide');
  S.phase='menu';
  irA(COMP&&!COMP.fin?'pComp':'pMain');   // vuelves a tu liga o copa, no al limbo
};
$('btnResume').onclick=togglePause;
$('btnQuit').onclick=()=>{
  S.pausedFlag=false;S.running=false;S.phase='menu';
  $('pause').classList.add('hide');
  $('menu').classList.remove('hide');
  if(S.compRival&&COMP&&!COMP.fin){cerrarJornada(0,3);S.compRival=null;}
  irA(COMP&&!COMP.fin?'pComp':'pMain');
};
let subSel=-1;
function pintarCambios(){
  const box=$v('subsBox'), t=S.teams&&S.teams[0];
  if(!box||!t)return;
  $v('pCambios').textContent=t.cambios;
  const fila=(nom,num,rol,st,i,sel,extra)=>`<div class="fila ${sel?'sel':''}" data-i="${i}">
      <span class="pos">${rol}</span><span class="dor">${num}</span>
      <span class="nom">${nom}</span><span class="val">${extra}</span></div>`;
  box.innerHTML=
    '<div class="lista"><h5>EN EL CAMPO</h5>'+
      t.players.map((p,i)=>fila(p.name,p.num,p.role,p.stam,i,subSel===i,
        Math.round(p.stam)+'%')).join('')+'</div>'+
    '<div class="lista"><h5>BANQUILLO</h5>'+
      t.squad.map((f,i)=>t.once.includes(i)?'':
        fila(f.name,f.num,f.role,100,i,false,
          Math.round((f.a.pace+f.a.ctl+f.a.pas+f.a.sho+f.a.tkl)/5))).join('')+'</div>';
  const c=box.children;
  if(c&&c[0]&&c[1]){
    [...c[0].querySelectorAll('.fila')].forEach(el=>el.onclick=()=>{
      subSel=(subSel===+el.dataset.i)?-1:+el.dataset.i; pintarCambios();});
    [...c[1].querySelectorAll('.fila')].forEach(el=>el.onclick=()=>{
      if(subSel<0)return;
      if(sustituir(t,subSel,+el.dataset.i)){subSel=-1;pintarCambios();}
    });
  }
}
function scorersHTML(){
  return S.goals.map(g=>`<div><b>${g.min}'</b>${g.sc?g.sc.num+' '+g.sc.name:'—'}<span>${g.team.tag}</span>${g.own?' · en propia':(g.as?' · asist. '+g.as.name:'')}</div>`).join('')
    ||'<div style="opacity:.45">Sin goles todavía</div>';
}
/* ── ALINEACIÓN visual en pausa: cancha mini + banquillo, con
   arrastre por puntero (mouse y táctil por igual). Reemplaza
   a la lista de CAMBIOS de antes; usa la misma sustituir().  */
let dragTok=null, dragOrigen=null, dragGhost=null, ultimoCambioIdx=-1;
function moverGhost(e){ if(dragGhost){dragGhost.style.left=e.clientX+'px'; dragGhost.style.top=e.clientY+'px';} }
function wireDrag(el,origen,num,esGK){
  el.addEventListener('pointerdown',e=>{
    const t=S.teams[0]; if(!t||t.cambios<=0)return;
    e.preventDefault();
    dragOrigen=origen; dragTok=el;
    try{el.setPointerCapture(e.pointerId);}catch(err){}
    el.style.opacity='.35';
    dragGhost=document.createElement('div');
    dragGhost.className='drag-ghost'+(esGK?' gk':'');
    dragGhost.textContent=num;
    document.body.appendChild(dragGhost);
    moverGhost(e);
  });
  el.addEventListener('pointermove',e=>{ if(dragTok===el) moverGhost(e); });
  const soltar=e=>{
    if(dragTok!==el)return;
    el.style.opacity='';
    if(dragGhost){dragGhost.remove();dragGhost=null;}
    const bajo=document.elementFromPoint(e.clientX,e.clientY);
    intentarSoltar(bajo);
    dragTok=null; dragOrigen=null;
    pintarAlineacion();
  };
  el.addEventListener('pointerup',soltar);
  el.addEventListener('pointercancel',soltar);
}
function intentarSoltar(destinoEl){
  if(!dragOrigen)return;
  const t=S.teams[0]; if(!t)return;
  const campoEl=destinoEl&&destinoEl.closest?destinoEl.closest('.lineup-token'):null;
  const bancoEl=destinoEl&&destinoEl.closest?destinoEl.closest('.bench-token'):null;
  let idxCampo=null, fichaIdx=null;
  if(dragOrigen.tipo==='banco'&&campoEl){ idxCampo=+campoEl.dataset.campoIdx; fichaIdx=dragOrigen.ficha; }
  else if(dragOrigen.tipo==='campo'&&bancoEl){ idxCampo=dragOrigen.idx; fichaIdx=+bancoEl.dataset.fichaIdx; }
  else return;
  if(sustituir(t,idxCampo,fichaIdx)){ ultimoCambioIdx=idxCampo; guardar(); }
}
function pintarAlineacion(){
  const t=S.teams&&S.teams[0]; if(!t)return;
  const pitch=$v('lineupPitch'), bench=$v('lineupBench');
  if(!pitch||!bench)return;
  const cb=$v('pCambios'); if(cb)cb.textContent=t.cambios;
  const sinCambios=t.cambios<=0;
  pitch.classList.toggle('sin-cambios',sinCambios);
  bench.classList.toggle('sin-cambios',sinCambios);
  pitch.innerHTML='<div class="midline"></div><div class="midcircle"></div>';
  t.players.forEach((p,i)=>{
    const el=document.createElement('div');
    el.className='lineup-token'+(p.role==='GK'?' gk':'')+(i===ultimoCambioIdx?' swap':'');
    el.style.left=(clamp(p.fx,0,1)*100)+'%';
    el.style.top=(clamp(p.fy,0,1)*100)+'%';
    el.textContent=p.num;
    el.dataset.campoIdx=i;
    const lbl=document.createElement('span');
    lbl.className='lbl'; lbl.textContent=p.name.split(' ')[0];
    el.appendChild(lbl);
    wireDrag(el,{tipo:'campo',idx:i},p.num,p.role==='GK');
    pitch.appendChild(el);
  });
  ultimoCambioIdx=-1;
  bench.innerHTML='';
  const banquillo=t.squad.map((f,i)=>({f,i})).filter(x=>!t.once.includes(x.i));
  if(!banquillo.length){ bench.innerHTML='<span class="bench-empty">Sin suplentes disponibles</span>'; return; }
  banquillo.forEach(({f,i})=>{
    const el=document.createElement('div');
    el.className='bench-token'+(f.role==='GK'?' gk':'');
    el.textContent=f.num;
    el.title=f.name;
    el.dataset.fichaIdx=i;
    wireDrag(el,{tipo:'banco',ficha:i},f.num,f.role==='GK');
    bench.appendChild(el);
  });
}
function pintarPauseJugador(){
  const box=$v('pauseJugador'); if(!box)return;
  const p=S.ctrl;
  if(!p){ box.innerHTML=''; return; }
  const barras=[['VEL',p.a.pace],['CTR',p.a.ctl],['PAS',p.a.pas],['TIR',p.a.sho]]
    .map(([l,v])=>`<div class="atb"><span>${l}</span><i style="width:${clamp((v-30)/62*100,3,100)}%"></i><b>${Math.round(v)}</b></div>`).join('');
  box.innerHTML=`<div class="ficha" style="margin:0">
      <div class="fh"><span class="fnum">${p.num}</span>
        <div><div class="fnom">${p.name}</div>
        <div class="farq">${({GK:'PORTERO',DF:'DEFENSA',MF:'MEDIOCAMPO',FW:'DELANTERO'})[p.role]||p.role}</div></div>
        <div class="fval">⚽ ${p.goals}</div></div>
      <div class="fbars">${barras}</div>
    </div>`;
}
// ajustes en vivo desde la pausa
(function(){
  const SW=['perezoso','normal','agresivo'], Q=['bajo','normal','alto'];
  function bind(id,lbl,fn){
    const el=$(id); if(!el)return;
    const go=()=>{const v=+el.value; if(Number.isFinite(v))fn(v);};
    el.addEventListener('input',go); go();
  }
  bind('tPow','tvPow',v=>{S.tune.pow=v/100; $('tvPow').textContent=v+'%';});
  bind('tCone','tvCone',v=>{
    S.tune.cone=v/100;
    $('tvCone').textContent=v<70?'exacta':v<140?'normal':'muy asistida';
  });
  bind('tSw','tvSw',v=>{S.tune.sw=v; $('tvSw').textContent=SW[v];});
  bind('tQ','tvQ',v=>{
    S.tune.q=v; $('tvQ').textContent=Q[v];
    DPRCAP=[1,1.5,2][v]||1.5; lowFX=(v===0);
    if(typeof resize==='function')resize();
  });
  const oh=$('optHint');
  if(oh) oh.addEventListener('click',e=>{
    const b=e.target.closest('.opt'); if(!b)return;
    [...oh.children].forEach(c=>c.setAttribute('aria-pressed','false'));
    b.setAttribute('aria-pressed','true');
    S.hintOn = b.dataset.v==='1';
  });
})();
function togglePause(){
  if(!S.running)return;
  S.pausedFlag=!S.pausedFlag;
  if(S.pausedFlag){
    hudT=1; hud(0);
    const t0=S.teams[0],t1=S.teams[1];
    $('pauseScore').innerHTML=
      `<span style="color:var(--home)">${t0.tag} ${S.score[0]}</span>`+
      `<span style="color:var(--ink-dim);font-size:20px"> · </span>`+
      `<span style="color:var(--away)">${S.score[1]} ${t1.tag}</span>`;
    $('pauseMin').textContent=
      `${Math.floor((S.half-1)*45+S.clock/60)}' · ${S.half===1?'1.ª':'2.ª'} parte · dificultad ${S.D.lbl}`;
    $('pauseScorers').innerHTML=scorersHTML();
    pintarPauseJugador();
    pintarAlineacion();
  }
  $('pause').classList.toggle('hide',!S.pausedFlag);
}
resize();
