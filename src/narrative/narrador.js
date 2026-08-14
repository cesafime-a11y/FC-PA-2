/* ── narrative/narrador.js ──────────────────────────────────
   Solo decide QUÉ decir, nunca CUÁNDO ni CÓMO mostrarlo. No
   toca S, CAR, say() ni nada del motor — recibe los datos que
   necesita como parámetros planos y devuelve texto (o null si
   no hay nada que decir). Por eso es la pieza más fácil de
   probar de todo el motor: mismos datos de entrada, mismo
   texto de salida, siempre — sin necesidad de simular un
   partido completo para verificarlo.
──────────────────────────────────────────────────────────── */

export function textoGol({scorerName, ownGoal, goalsInMatch, goalsTemporada, minuto, assistName, tagLocal, tagVisita, scoreLocal, scoreVisita}){
  if(ownGoal) return `${scorerName} la manda a su propia portería. Silencio en la grada.`;
  if(goalsInMatch===3)      return `¡Triplete de ${scorerName}! Se lleva el balón a casa.`;
  if(goalsInMatch===2)      return `Segundo de ${scorerName} en el partido. Está desatado.`;
  if(goalsTemporada>=4)     return `${scorerName} llega a ${goalsTemporada+1} goles esta temporada.`;
  if(minuto>=85)            return `¡En el 85! ${scorerName} decide el partido en el último suspiro.`;
  if(assistName)            return `${assistName} la pone, ${scorerName} la empuja. Jugada de manual.`;
  return `Gol de ${scorerName}. ${tagLocal} ${scoreLocal}-${scoreVisita} ${tagVisita}`;
}

export function textoFalta({offenderName, offenderYellow, foulsCount, teamTag}){
  if(offenderYellow>=1 && foulsCount>=5)
    return {txt:`${offenderName} ya va con amarilla y sigue entrando fuerte. Peligro.`, tipo:'nt'};
  if(foulsCount===5)
    return {txt:`Quinta falta del ${teamTag}. El árbitro empieza a cansarse.`, tipo:''};
  if(foulsCount===10)
    return {txt:`Diez faltas del ${teamTag}: están rompiendo el ritmo a propósito.`, tipo:''};
  return null;
}

export function candidatosAmbiente({minuto, diferencia, posesionLocal, tagLocal, tagVisita, remLocal, remVisita, scoreLocal, scoreVisita, cornersLocal, jugadoresCansados}){
  const cands=[];
  if(minuto>=80&&diferencia===0)  cands.push('Últimos diez minutos y el marcador sigue igualado.');
  if(minuto>=80&&diferencia===1)  cands.push('Un gol arriba y el reloj corriendo. A sufrir.');
  if(minuto>=80&&diferencia===-1) cands.push('Queda poco y hay que ir a por el empate.');
  if(posesionLocal>=64)           cands.push(`El ${tagLocal} tiene el balón: ${posesionLocal.toFixed(0)}% de posesión.`);
  if(posesionLocal<=36)           cands.push(`El ${tagVisita} se ha adueñado del balón.`);
  if(remLocal>=8&&scoreLocal===0) cands.push(`${remLocal} remates y ningún gol. Falta puntería.`);
  if(remVisita>=6&&scoreVisita===0) cands.push('El rival lo intenta pero no encuentra la portería.');
  if(cornersLocal>=4)             cands.push(`Cuarto córner del ${tagLocal}. Están instalados en el área.`);
  if(jugadoresCansados>=4)        cands.push(`${jugadoresCansados} de los tuyos están fundidos. Toca mover el banquillo.`);
  return cands;
}
