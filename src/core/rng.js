/* ── core/rng.js ──────────────────────────────────────────────
   Generador de azar con semilla (mulberry32). Reemplaza a
   Math.random() en todo el motor.

   Por qué importa: con Math.random() cada partido es irrepetible,
   lo que hace casi imposible depurar un bug puntual ("se descuadró
   el marcador en el minuto 60") o correr las sondas de forma
   determinista. Con una semilla, la MISMA semilla produce SIEMPRE
   la misma partida — clave también para el día que quieras
   sincronizar dos jugadores por red: ambos lados solo necesitan
   compartir la semilla, no cada evento.

   Uso:
     import { createRng } from './rng.js';
     const rng = createRng(12345);       // semilla fija = reproducible
     const rng2 = createRng();           // sin semilla = usa la hora actual

     rng.rand()          // reemplazo directo de Math.random()      → [0,1)
     rng.range(a, b)     // reemplazo directo de tu rnd(a,b)        → [a,b)
     rng.gauss()         // reemplazo directo de tu gauss()         → campana
     rng.pick(array)     // reemplazo de arr[(Math.random()*arr.length)|0]
     rng.shuffle(array)  // reemplazo de tu Fisher-Yates in-place (línea 1458)
     rng.chance(p)       // reemplazo de Math.random() < p (patrón más común)
────────────────────────────────────────────────────────────── */

export function createRng(seed = Date.now() >>> 0) {
  let s = seed >>> 0;

  // mulberry32: rápido, buena distribución, suficiente para un juego.
  function rand() {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function range(a, b) {
    return a + rand() * (b - a);
  }

  function gauss() {
    let u = 0, v = 0;
    while (!u) u = rand();
    while (!v) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function pick(arr) {
    return arr[(rand() * arr.length) | 0];
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function chance(p) {
    return rand() < p;
  }

  return { rand, range, gauss, pick, shuffle, chance, getSeed: () => seed, setSeed: (n) => { s = n >>> 0; } };
}
