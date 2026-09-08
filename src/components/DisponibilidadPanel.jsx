import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { LINE, MUTED, AUSENTE } from '../theme';

// Un solo estado: el documento existe si y solo si confirmó. No se guarda
// "no" ni "sin respuesta" -- desmarcar borra el documento. Es ayuda para
// armar la nómina, la llena una administradora a mano y puede quedar
// incompleta para un partido sin que eso bloquee nada.
//
// elegibles (opcional): ids de la lista de inscritas de la competencia,
// cuando el partido es oficial y esa competencia tiene cupo fijo. Si viene
// null, se ofrece el roster completo -- sin lista de inscritas no hay
// nada que filtrar.
export function DisponibilidadPanel({ partidoId, roster, elegibles }) {
  const [confirmadas, setConfirmadas] = useState(null);
  const [error, setError] = useState(null);
  const candidatas = elegibles ? roster.filter((j) => elegibles.includes(j.id)) : roster;

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'partidos', partidoId, 'disponibilidad'),
      (snap) => { setConfirmadas(new Set(snap.docs.map((d) => d.id))); setError(null); },
      () => setError('No se pudo cargar la disponibilidad.'),
    );
    return () => unsub();
  }, [partidoId]);

  async function alternar(jugadoraId, marcada) {
    try {
      if (marcada) {
        await deleteDoc(doc(db, 'partidos', partidoId, 'disponibilidad', jugadoraId));
      } else {
        await setDoc(doc(db, 'partidos', partidoId, 'disponibilidad', jugadoraId), {
          origen: 'administradora',
          fecha: Timestamp.now(),
        });
      }
      setError(null);
    } catch (e) {
      setError('No se pudo guardar el cambio. Intenta de nuevo.');
    }
  }

  if (confirmadas === null) {
    return <div style={{ fontSize: 13, color: MUTED, padding: '8px 0' }}>Cargando…</div>;
  }

  return (
    <div>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: MUTED }}>
        Marca solo a quienes confirmaron. Si un partido queda sin nadie marcado, la nómina se arma igual sobre el roster completo.
        {elegibles && ' Se muestra solo a las de la lista de inscritas.'}
      </p>
      <div style={{ maxHeight: 220, overflowY: 'auto', border: `1px solid ${LINE}`, borderRadius: 8, padding: '8px 12px' }}>
        {candidatas
          .slice()
          .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '') || (a.apellido || '').localeCompare(b.apellido || ''))
          .map((j) => {
            const marcada = confirmadas.has(j.id);
            return (
              <label key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={marcada} onChange={() => alternar(j.id, marcada)} />
                {j.nombre} {j.apellido}
              </label>
            );
          })}
      </div>
      {error && <p style={{ fontSize: 12, color: AUSENTE, margin: '8px 0 0' }}>{error}</p>}
    </div>
  );
}
