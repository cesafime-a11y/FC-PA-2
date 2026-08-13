import { describe, it, expect } from 'vitest';
import { createRng } from '../src/core/rng.js';

describe('createRng — determinismo', () => {
  it('la misma semilla produce siempre la misma secuencia', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    expect(a.rand()).toBe(b.rand());
    expect(a.rand()).toBe(b.rand());
    expect(a.rand()).toBe(b.rand());
  });

  it('semillas distintas producen secuencias distintas', () => {
    const a = createRng(12345);
    const b = createRng(999);
    expect(a.rand()).not.toBe(b.rand());
  });

  it('reproduce el mismo primer valor para una semilla fija conocida', () => {
    const r = createRng(12345);
    expect(r.rand()).toBeCloseTo(0.9797282677609473, 12);
  });
});

describe('rand()', () => {
  it('siempre cae en [0, 1)', () => {
    const r = createRng(1);
    for (let i = 0; i < 500; i++) {
      const v = r.rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('range(a, b)', () => {
  it('siempre cae dentro de [a, b)', () => {
    const r = createRng(2);
    for (let i = 0; i < 500; i++) {
      const v = r.range(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
    }
  });

  it('reproduce un valor conocido con semilla fija', () => {
    const r = createRng(7);
    expect(r.range(10, 20)).toBeCloseTo(10.117047531530261, 10);
  });
});

describe('gauss()', () => {
  it('siempre da un número finito', () => {
    const r = createRng(3);
    for (let i = 0; i < 500; i++) {
      expect(Number.isFinite(r.gauss())).toBe(true);
    }
  });

  it('promedia cerca de 0 en una muestra grande (campana centrada)', () => {
    const r = createRng(4);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) sum += r.gauss();
    expect(sum / n).toBeCloseTo(0, 1);
  });
});

describe('pick(arr)', () => {
  it('siempre devuelve un elemento que está en el arreglo', () => {
    const r = createRng(5);
    const arr = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 200; i++) {
      expect(arr).toContain(r.pick(arr));
    }
  });
});

describe('shuffle(arr)', () => {
  it('conserva los mismos elementos, solo reordenados', () => {
    const r = createRng(6);
    const original = [1, 2, 3, 4, 5, 6, 7, 8];
    const mezclado = r.shuffle([...original]);
    expect(mezclado.length).toBe(original.length);
    expect([...mezclado].sort()).toEqual([...original].sort());
  });

  it('reproduce el mismo resultado con la misma semilla', () => {
    const a = createRng(42).shuffle([1, 2, 3, 4, 5]);
    const b = createRng(42).shuffle([1, 2, 3, 4, 5]);
    expect(a).toEqual(b);
  });

  it('reproduce el resultado exacto conocido para la semilla 42', () => {
    const r = createRng(42);
    expect(r.shuffle([1, 2, 3, 4, 5])).toEqual([1, 5, 3, 2, 4]);
  });
});

describe('chance(p)', () => {
  it('con p=0 nunca da verdadero', () => {
    const r = createRng(8);
    for (let i = 0; i < 200; i++) expect(r.chance(0)).toBe(false);
  });

  it('con p=1 siempre da verdadero', () => {
    const r = createRng(9);
    for (let i = 0; i < 200; i++) expect(r.chance(1)).toBe(true);
  });

  it('con p=0.5 cae razonablemente cerca de la mitad en una muestra grande', () => {
    const r = createRng(10);
    let count = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (r.chance(0.5)) count++;
    expect(count / n).toBeCloseTo(0.5, 1);
  });
});

describe('getSeed / setSeed', () => {
  it('getSeed devuelve la semilla original con la que se creó', () => {
    const r = createRng(2026);
    expect(r.getSeed()).toBe(2026);
  });

  it('setSeed reinicia el estado interno: misma secuencia que un rng nuevo con esa semilla', () => {
    const r = createRng(1);
    r.rand(); r.rand(); r.rand();       // avanza el estado
    r.setSeed(555);
    const fresh = createRng(555);
    expect(r.rand()).toBe(fresh.rand());
  });
});
