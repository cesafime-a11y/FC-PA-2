/* ── core/state.js ────────────────────────────────────────
   El estado compartido de todo el motor: el partido en curso
   (S), las medidas de la cancha (F/CY/GT/GB, que cambian entre
   fútbol 11 y fútbol 7) y la superficie de juego (SUP).

   Por qué está aparte: casi cada función del motor —física,
   IA, reglas, render— necesita leer alguna de estas piezas.
   Si vivieran dentro de game.js, cualquier módulo nuevo que
   también las necesite (render.js, career.js, lo que sea)
   terminaría importando cosas DE game.js, y game.js a su vez
   importaría DE esos módulos — un ciclo. Aquí, todos importan
   del mismo lugar y nadie depende de nadie más.
──────────────────────────────────────────────────────────── */
import { DIFFS } from '../data/difficulty.js';

/* superficies: cambian el aspecto y cómo corre el balón */
export const SUPERFICIES={
  cesped :{lbl:'Césped natural', a:'#153320', b:'#112a1b', linea:'rgba(236,255,244,.55)', roz:.986, veta:.05},
  sintetico:{lbl:'Sintético', a:'#0f3a2a', b:'#0c3124', linea:'rgba(255,255,255,.7)',   roz:.989, veta:.03},
  seco   :{lbl:'Campo seco',  a:'#3a3524', b:'#332e1f', linea:'rgba(255,246,214,.5)',  roz:.978, veta:.08},
  nocturno:{lbl:'Nocturno',   a:'#0d2a1c', b:'#0a2317', linea:'rgba(190,255,220,.75)', roz:.986, veta:.04}
};
export let SUP=SUPERFICIES.cesped;
export function setSuperficie(sup){ SUP=sup; }

/* Dos canchas. Todo lo demás —física, IA, reglas, fuera de juego,
   render— se deriva de estas medidas, así que cambiarlas cambia
   el juego entero sin tocar una línea del motor.                */
export const CANCHAS={
  f11:{W:105,H:68,GW:7.32,GH:2.44,BOX:16.5,BOXW:40.32,SIX:5.5,SIXW:18.32,SPOT:11,CIRC:9.15,MG:6},
  f7 :{W:65, H:45,GW:6.0, GH:2.0, BOX:12.0,BOXW:26.0, SIX:4.0,SIXW:12.0, SPOT:9, CIRC:6.5, MG:5}
};
export let F=Object.assign({},CANCHAS.f11);
export let CY=F.H/2, GT=CY-F.GW/2, GB=CY+F.GW/2;
export const ESC=()=>F.W/105;      // factor de escala respecto a la cancha grande
export function setCancha(tipo){
  F=Object.assign({},CANCHAS[tipo]||CANCHAS.f11);
  CY=F.H/2; GT=CY-F.GW/2; GB=CY+F.GW/2;
}

/* ── estado del partido ──────────────────────────────────── */
export const S={
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
