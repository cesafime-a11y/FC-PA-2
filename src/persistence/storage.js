/* ── persistence/storage.js ──────────────────────────────────
   Envoltura genérica sobre localStorage con manejo de errores.
   No sabe nada del juego — recibe el "storage" como parámetro
   en vez de usar `localStorage` directo, así se puede probar
   con un storage falso sin depender de que exista un navegador
   real corriendo las pruebas.
──────────────────────────────────────────────────────────── */

export function guardarLocal(storage, clave, datos){
  try{
    storage.setItem(clave, JSON.stringify(datos));
    return {ok:true, aviso:'guardado'};
  }catch(e){
    return {ok:false, aviso:'este entorno no permite guardar'};
  }
}

export function cargarLocal(storage, clave){
  try{
    const raw = storage.getItem(clave);
    if(!raw) return {ok:true, datos:null, aviso:''};
    return {ok:true, datos:JSON.parse(raw), aviso:''};
  }catch(e){
    return {ok:false, datos:null, aviso:'no se pudo leer lo guardado'};
  }
}

export function borrarLocal(storage, clave){
  try{ storage.removeItem(clave); return true; }catch(e){ return false; }
}
