import { describe, it, expect } from 'vitest';
import { FORMS, FORMS7, getForms } from '../src/data/formations.js';
import { PLANES } from '../src/data/plans.js';
import { DIFFS } from '../src/data/difficulty.js';
import { NAMES_H, NAMES_A } from '../src/data/names.js';

describe('formations.js — fútbol 11 (FORMS)', () => {
  const nombres = Object.keys(FORMS);

  it('tiene al menos una formación definida', () => {
    expect(nombres.length).toBeGreaterThan(0);
  });

  it.each(nombres)('%s tiene exactamente 11 jugadores', (nombre) => {
    expect(FORMS[nombre].length).toBe(11);
  });

  it.each(nombres)('%s tiene exactamente un portero (GK)', (nombre) => {
    const gks = FORMS[nombre].filter(([rol]) => rol === 'GK');
    expect(gks.length).toBe(1);
  });

  it.each(nombres)('%s: todas las coordenadas fx, fy caen en [0, 1]', (nombre) => {
    for (const [, fx, fy] of FORMS[nombre]) {
      expect(fx).toBeGreaterThanOrEqual(0);
      expect(fx).toBeLessThanOrEqual(1);
      expect(fy).toBeGreaterThanOrEqual(0);
      expect(fy).toBeLessThanOrEqual(1);
    }
  });

  it.each(nombres)('%s: cada rol es GK, DF, MF o FW', (nombre) => {
    for (const [rol] of FORMS[nombre]) {
      expect(['GK', 'DF', 'MF', 'FW']).toContain(rol);
    }
  });
});

describe('formations.js — fútbol 7 (FORMS7)', () => {
  const nombres = Object.keys(FORMS7);

  it('tiene al menos una formación definida', () => {
    expect(nombres.length).toBeGreaterThan(0);
  });

  it.each(nombres)('%s tiene exactamente 7 jugadores', (nombre) => {
    expect(FORMS7[nombre].length).toBe(7);
  });

  it.each(nombres)('%s tiene exactamente un portero (GK)', (nombre) => {
    const gks = FORMS7[nombre].filter(([rol]) => rol === 'GK');
    expect(gks.length).toBe(1);
  });

  it.each(nombres)('%s: todas las coordenadas fx, fy caen en [0, 1]', (nombre) => {
    for (const [, fx, fy] of FORMS7[nombre]) {
      expect(fx).toBeGreaterThanOrEqual(0);
      expect(fx).toBeLessThanOrEqual(1);
      expect(fy).toBeGreaterThanOrEqual(0);
      expect(fy).toBeLessThanOrEqual(1);
    }
  });
});

describe('getForms(isF7)', () => {
  it('con false devuelve el set de fútbol 11', () => {
    expect(getForms(false)).toBe(FORMS);
  });
  it('con true devuelve el set de fútbol 7', () => {
    expect(getForms(true)).toBe(FORMS7);
  });
});

describe('plans.js — PLANES', () => {
  const claves = Object.keys(PLANES);

  it('incluye los cinco planteamientos esperados', () => {
    expect(claves.sort()).toEqual(
      ['contra', 'defensivo', 'equilibrado', 'ofensivo', 'presion'].sort()
    );
  });

  it.each(claves)('%s trae lbl, d y los cuatro multiplicadores como número', (clave) => {
    const p = PLANES[clave];
    expect(typeof p.lbl).toBe('string');
    expect(typeof p.d).toBe('string');
    for (const campo of ['linea', 'presion', 'amplitud', 'riesgo']) {
      expect(typeof p[campo]).toBe('number');
      expect(p[campo]).toBeGreaterThan(0);
    }
  });

  it('"equilibrado" es el punto neutro: los cuatro multiplicadores valen 1', () => {
    const eq = PLANES.equilibrado;
    expect(eq.linea).toBe(1);
    expect(eq.presion).toBe(1);
    expect(eq.amplitud).toBe(1);
    expect(eq.riesgo).toBe(1);
  });
});

describe('difficulty.js — DIFFS', () => {
  const claves = Object.keys(DIFFS);

  it('incluye los tres niveles esperados', () => {
    expect(claves.sort()).toEqual(['brutal', 'duro', 'leyenda'].sort());
  });

  it.each(claves)('%s trae lbl y los seis campos numéricos', (clave) => {
    const d = DIFFS[clave];
    expect(typeof d.lbl).toBe('string');
    for (const campo of ['q', 'spd', 'acc', 'react', 'press', 'userErr']) {
      expect(typeof d[campo]).toBe('number');
    }
  });

  it('la calidad del rival (q) sube en cada escalón: duro < brutal < leyenda', () => {
    expect(DIFFS.duro.q).toBeLessThan(DIFFS.brutal.q);
    expect(DIFFS.brutal.q).toBeLessThan(DIFFS.leyenda.q);
  });

  it('la presión sube en cada escalón: duro < brutal < leyenda', () => {
    expect(DIFFS.duro.press).toBeLessThan(DIFFS.brutal.press);
    expect(DIFFS.brutal.press).toBeLessThan(DIFFS.leyenda.press);
  });

  it('el tiempo de reacción baja en cada escalón (reacciona más rápido): duro > brutal > leyenda', () => {
    expect(DIFFS.duro.react).toBeGreaterThan(DIFFS.brutal.react);
    expect(DIFFS.brutal.react).toBeGreaterThan(DIFFS.leyenda.react);
  });
});

describe('names.js', () => {
  it('NAMES_H y NAMES_A no están vacíos', () => {
    expect(NAMES_H.length).toBeGreaterThan(0);
    expect(NAMES_A.length).toBeGreaterThan(0);
  });

  it('NAMES_H no tiene nombres repetidos', () => {
    expect(new Set(NAMES_H).size).toBe(NAMES_H.length);
  });

  it('NAMES_A no tiene nombres repetidos', () => {
    expect(new Set(NAMES_A).size).toBe(NAMES_A.length);
  });

  it('todos los elementos son strings no vacíos', () => {
    for (const n of [...NAMES_H, ...NAMES_A]) {
      expect(typeof n).toBe('string');
      expect(n.length).toBeGreaterThan(0);
    }
  });
});
