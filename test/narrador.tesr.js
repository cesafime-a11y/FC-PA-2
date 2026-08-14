import { describe, it, expect } from 'vitest';
import { textoGol, textoFalta, candidatosAmbiente } from '../src/narrative/narrador.js';

describe('textoGol', () => {
  it('gol normal sin asistencia ni triplete', () => {
    expect(textoGol({scorerName:'Sancho',ownGoal:false,goalsInMatch:1,goalsTemporada:2,
      minuto:40,assistName:null,tagLocal:'ANT',tagVisita:'HAL',scoreLocal:1,scoreVisita:0}))
      .toBe('Gol de Sancho. ANT 1-0 HAL');
  });

  it('gol en propia puerta, sin importar los demás datos', () => {
    expect(textoGol({scorerName:'Cheto',ownGoal:true,goalsInMatch:1,goalsTemporada:0,
      minuto:10,assistName:null,tagLocal:'ANT',tagVisita:'HAL',scoreLocal:0,scoreVisita:1}))
      .toBe('Cheto la manda a su propia portería. Silencio en la grada.');
  });

  it('triplete en el partido tiene prioridad sobre lo demás', () => {
    expect(textoGol({scorerName:'Sancho',ownGoal:false,goalsInMatch:3,goalsTemporada:8,
      minuto:70,assistName:'Memo',tagLocal:'ANT',tagVisita:'HAL',scoreLocal:3,scoreVisita:1}))
      .toBe('¡Triplete de Sancho! Se lleva el balón a casa.');
  });

  it('con asistencia (y nada más prioritario) menciona a quien la dio', () => {
    expect(textoGol({scorerName:'Rulo',ownGoal:false,goalsInMatch:1,goalsTemporada:1,
      minuto:33,assistName:'Memo',tagLocal:'ANT',tagVisita:'HAL',scoreLocal:1,scoreVisita:0}))
      .toBe('Memo la pone, Rulo la empuja. Jugada de manual.');
  });

  it('minuto 85+ tiene prioridad sobre la asistencia', () => {
    expect(textoGol({scorerName:'Rulo',ownGoal:false,goalsInMatch:1,goalsTemporada:1,
      minuto:88,assistName:'Memo',tagLocal:'ANT',tagVisita:'HAL',scoreLocal:1,scoreVisita:0}))
      .toBe('¡En el 85! Rulo decide el partido en el último suspiro.');
  });
});

describe('textoFalta', () => {
  it('con amarilla previa y 5+ faltas del equipo, avisa del peligro', () => {
    expect(textoFalta({offenderName:'Kique',offenderYellow:1,foulsCount:6,teamTag:'ANT'}))
      .toEqual({txt:'Kique ya va con amarilla y sigue entrando fuerte. Peligro.', tipo:'nt'});
  });

  it('quinta falta exacta del equipo, sin amarilla', () => {
    expect(textoFalta({offenderName:'Kique',offenderYellow:0,foulsCount:5,teamTag:'ANT'}))
      .toEqual({txt:'Quinta falta del ANT. El árbitro empieza a cansarse.', tipo:''});
  });

  it('décima falta exacta del equipo', () => {
    expect(textoFalta({offenderName:'Kique',offenderYellow:0,foulsCount:10,teamTag:'ANT'}))
      .toEqual({txt:'Diez faltas del ANT: están rompiendo el ritmo a propósito.', tipo:''});
  });

  it('una falta cualquiera que no cae en ningún umbral no dice nada', () => {
    expect(textoFalta({offenderName:'Kique',offenderYellow:0,foulsCount:2,teamTag:'ANT'})).toBeNull();
  });
});

describe('candidatosAmbiente', () => {
  it('junta varios candidatos válidos a la vez', () => {
    const c = candidatosAmbiente({minuto:82,diferencia:1,posesionLocal:70,tagLocal:'ANT',
      tagVisita:'HAL',remLocal:9,remVisita:2,scoreLocal:2,scoreVisita:1,cornersLocal:5,jugadoresCansados:4});
    expect(c).toContain('Un gol arriba y el reloj corriendo. A sufrir.');
    expect(c).toContain('El ANT tiene el balón: 70% de posesión.');
    expect(c).toContain('Cuarto córner del ANT. Están instalados en el área.');
    expect(c).toContain('4 de los tuyos están fundidos. Toca mover el banquillo.');
    expect(c.length).toBe(4);
  });

  it('sin ningún umbral cumplido, devuelve una lista vacía', () => {
    const c = candidatosAmbiente({minuto:20,diferencia:0,posesionLocal:50,tagLocal:'ANT',
      tagVisita:'HAL',remLocal:2,remVisita:1,scoreLocal:0,scoreVisita:0,cornersLocal:0,jugadoresCansados:0});
    expect(c).toEqual([]);
  });

  it('los remates sin gol solo cuentan si el marcador de ese lado sigue en cero', () => {
    const c = candidatosAmbiente({minuto:20,diferencia:0,posesionLocal:50,tagLocal:'ANT',
      tagVisita:'HAL',remLocal:9,remVisita:0,scoreLocal:1,scoreVisita:0,cornersLocal:0,jugadoresCansados:0});
    expect(c).not.toContain(expect.stringContaining('Falta puntería'));
  });
});
