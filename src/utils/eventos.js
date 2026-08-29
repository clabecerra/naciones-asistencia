import {
  doc, collection, writeBatch, query, orderBy,
  getDocFromServer, getDocsFromServer, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export function setRef(partidoId, setId) {
  return doc(db, 'partidos', partidoId, 'sets', setId);
}
export function eventosRef(partidoId, setId) {
  return collection(db, 'partidos', partidoId, 'sets', setId, 'eventos');
}

// Crea el set (1 o 2). Si es el primero del partido, marca capturaIniciada
// en el mismo batch — a partir de ahí tipo/competenciaId del partido quedan
// congelados (ver firestore.rules).
export async function crearSet(partidoId, setId, setData, marcarCapturaIniciada) {
  const batch = writeBatch(db);
  batch.set(setRef(partidoId, setId), setData);
  if (marcarCapturaIniciada) {
    batch.update(doc(db, 'partidos', partidoId), { capturaIniciada: true });
  }
  await batch.commit();
}

// orden siempre ultimoOrdenActual+1 -- las reglas lo exigen así (evita
// huecos/duplicados) y es lo mismo que necesita deshacerUltimoEvento para
// saber cuál es "el último" sin poder consultar dentro de la regla.
export async function crearEvento(partidoId, setId, ultimoOrdenActual, eventoData) {
  const batch = writeBatch(db);
  const orden = ultimoOrdenActual + 1;
  batch.set(doc(eventosRef(partidoId, setId)), { ...eventoData, orden });
  batch.update(setRef(partidoId, setId), { ultimoOrden: orden });
  await batch.commit();
}

export async function deshacerUltimoEvento(partidoId, setId, eventoId, ordenActual) {
  const batch = writeBatch(db);
  batch.delete(doc(eventosRef(partidoId, setId), eventoId));
  batch.update(setRef(partidoId, setId), { ultimoOrden: Math.max(0, ordenActual - 1) });
  await batch.commit();
}

export async function cerrarSet(partidoId, setId, cierreSet, resultadoOficialSet, tambienPartidoJugado) {
  const batch = writeBatch(db);
  batch.update(setRef(partidoId, setId), cierreSet);
  const partidoUpdate = { [`resultadoOficial.${setId}`]: resultadoOficialSet };
  if (tambienPartidoJugado) partidoUpdate.estado = 'jugado';
  batch.update(doc(db, 'partidos', partidoId), partidoUpdate);
  await batch.commit();
}

export async function tomarControl(partidoId, authUser) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'partidos', partidoId), {
    capturando: { uid: authUser.uid, nombre: authUser.email || '', desde: Timestamp.now() },
  });
  await batch.commit();
}

// Recuperación tras un fallo al registrar o deshacer un evento: releer
// directo del servidor (nunca del caché local, que pudo quedar con el
// mismo estado desincronizado que causó el rechazo) antes de reintentar.
export async function resincronizarSet(partidoId, setId) {
  const [setSnap, eventosSnap] = await Promise.all([
    getDocFromServer(setRef(partidoId, setId)),
    getDocsFromServer(query(eventosRef(partidoId, setId), orderBy('orden', 'asc'))),
  ]);
  return {
    set: setSnap.exists() ? { id: setSnap.id, ...setSnap.data() } : null,
    eventos: eventosSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}
