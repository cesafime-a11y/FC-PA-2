/* ── core/math.js ────────────────────────────────────────
   Funciones puras: mismo resultado siempre para la misma entrada,
   sin tocar S, F, sonido ni pantalla. Por eso son las únicas del
   motor seguras de extraer sin red de pruebas todavía.
──────────────────────────────────────────────────────────── */
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp  = (a, b, t) => a + (b - a) * t;
export const dist  = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function norm(x, y) {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  if (l2 < 1e-6) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
