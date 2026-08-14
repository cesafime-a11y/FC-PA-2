import { describe, it, expect } from 'vitest';
import { guardarLocal, cargarLocal, borrarLocal } from '../src/persistence/storage.js';

// storage falso en memoria — no depende de que exista un navegador real
function fakeStorage(){
  const m = {};
  return {
    setItem: (k, v) => { m[k] = v; },
    getItem: k => (k in m ? m[k] : null),
    removeItem: k => { delete m[k]; },
  };
}

describe('guardarLocal / cargarLocal — caso normal', () => {
  it('guarda un objeto y lo recupera igual', () => {
    const s = fakeStorage();
    const r = guardarLocal(s, 'x', { a: 1, b: 'dos' });
    expect(r).toEqual({ ok: true, aviso: 'guardado' });
    expect(cargarLocal(s, 'x')).toEqual({ ok: true, datos: { a: 1, b: 'dos' }, aviso: '' });
  });

  it('cargar una clave que nunca se guardó no es un error, solo no hay datos', () => {
    const s = fakeStorage();
    expect(cargarLocal(s, 'nunca-existio')).toEqual({ ok: true, datos: null, aviso: '' });
  });

  it('borrar quita los datos y una carga posterior ya no los encuentra', () => {
    const s = fakeStorage();
    guardarLocal(s, 'x', { a: 1 });
    expect(borrarLocal(s, 'x')).toBe(true);
    expect(cargarLocal(s, 'x').datos).toBeNull();
  });

  it('dos claves distintas no se pisan entre sí', () => {
    const s = fakeStorage();
    guardarLocal(s, 'club', { nombre: 'ANT' });
    guardarLocal(s, 'carrera', { temporada: 3 });
    expect(cargarLocal(s, 'club').datos).toEqual({ nombre: 'ANT' });
    expect(cargarLocal(s, 'carrera').datos).toEqual({ temporada: 3 });
  });
});

describe('guardarLocal / cargarLocal — entorno que bloquea el guardado', () => {
  const storageRoto = {
    setItem: () => { throw new Error('bloqueado'); },
    getItem: () => { throw new Error('bloqueado'); },
  };

  it('guardar en un storage roto no truena — avisa que no se pudo', () => {
    expect(guardarLocal(storageRoto, 'x', { a: 1 }))
      .toEqual({ ok: false, aviso: 'este entorno no permite guardar' });
  });

  it('cargar de un storage roto tampoco truena', () => {
    expect(cargarLocal(storageRoto, 'x'))
      .toEqual({ ok: false, datos: null, aviso: 'no se pudo leer lo guardado' });
  });
});

describe('cargarLocal — datos corruptos', () => {
  it('un JSON inválido guardado no truena la carga, avisa del error', () => {
    const s = fakeStorage();
    s.setItem('x', '{esto no es json válido');
    expect(cargarLocal(s, 'x'))
      .toEqual({ ok: false, datos: null, aviso: 'no se pudo leer lo guardado' });
  });
});

describe('borrarLocal', () => {
  it('borrar una clave que no existe no truena, solo no hace nada', () => {
    const s = fakeStorage();
    expect(borrarLocal(s, 'nunca-existio')).toBe(true);
  });

  it('en un storage roto, borrar devuelve false en vez de tronar', () => {
    const storageRoto = { removeItem: () => { throw new Error('bloqueado'); } };
    expect(borrarLocal(storageRoto, 'x')).toBe(false);
  });
});
