import {
  doc, collection, writeBatch, query, orderBy, getDocs,
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

// Firestore no borra subcolecciones solas al borrar el documento padre --
// sets/eventos quedarían huérfanos (inalcanzables desde la app, pero
// vivos en la base) si solo se borrara partidos/{id}. Recorre y borra
// todo explícito: eventos de cada set, cada set, y por último el
// partido. Solo admin (ver firestore.rules: el delete abierto de eventos
// sigue acotado al último evento de un set en_curso, para el deshacer en
// vivo -- esto es una regla aparte, más amplia, solo para admin).
//
// Un solo writeBatch, no varias tandas: un batch es atómico (todo o nada,
// también si se corta la conexión a mitad de camino, porque nada se envía
// hasta el commit final), así que no puede quedar un partido a medio
// borrar. El límite de Firestore es 500 operaciones por batch -- un
// partido real (dos sets, un puñado de eventos cada uno) queda muy por
// debajo; si algún día no cupiera, es mejor negarse con un error claro que
// partirlo en varios batches no atómicos entre sí, que es exactamente el
// escenario de "queda a medias" que se quiere evitar. Si esto llega a
// fallar (red, permisos), no hay nada que limpiar: como no se mandó nada
// hasta último momento, la base queda intacta y reintentar es seguro.
export async function borrarPartidoCompleto(partidoId) {
  const setsSnap = await getDocs(collection(db, 'partidos', partidoId, 'sets'));
  const refsABorrar = [];
  for (const setDoc of setsSnap.docs) {
    const eventosSnap = await getDocs(collection(setDoc.ref, 'eventos'));
    eventosSnap.docs.forEach((d) => refsABorrar.push(d.ref));
    refsABorrar.push(setDoc.ref);
  }
  refsABorrar.push(doc(db, 'partidos', partidoId));

  if (refsABorrar.length > 500) {
    throw new Error(
      `El partido tiene ${refsABorrar.length} documentos para borrar, más de los 500 que ` +
      'admite un borrado atómico. No se borró nada -- hay que revisar este caso a mano.'
    );
  }

  const batch = writeBatch(db);
  refsABorrar.forEach((ref) => batch.delete(ref));
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
