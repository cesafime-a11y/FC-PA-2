/* ── core/tune.js ─────────────────────────────────────────────
   Perillas de calibración. Se tocan desde el banco de pruebas
   para barrer valores y quedarse con el que da marcadores
   creíbles. Estado calibrado actual (ago 2026):
   fútbol 11 → 2.80 ± 0.31 goles/partido (dentro de objetivo)
   fútbol 7  → 7.40 goles/partido (alto, pendiente de ajustar)
──────────────────────────────────────────────────────────────*/
export const TUNE = { blocada: 6, gkBase: .68, gkVel: 115, shotErr: 1.0, aiTiro: 1.0, arcoRef: 1.0 };
