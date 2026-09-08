import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { INK, PAPER, LINE, MUTED, AUSENTE } from '../theme';
import { CASILLAS } from '../utils/casillas';

// Duplicado a propósito del editor de casillas de captura/AlineacionSet.jsx
// en vez de compartido: ese archivo se usa en partidos reales, y tocarlo
// para extraer un componente común es un riesgo que no se pidió.
//
// No incluye cuántas presenta el rival: eso se sabe recién el día del
// partido (a veces al llegar el equipo contrario a la cancha), no algo que
// la formación previa pueda anticipar -- y puede variar entre el set 1 y
// el set 2, así que sigue viviendo solo en AlineacionSet.jsx, por set.

// Paso previo a la captura: guarda formacionPrevia como campo plano del
// partido, no un set real -- no crea sets/1 ni dispara capturaIniciada.
// La captura la precarga y sigue siendo editable ahí hasta último momento.
export function FormacionPreviaPanel({ partidoId, partido, roster, onCerrar }) {
  const nomina = partido.nomina || [];
  const jugadorasNomina = roster.filter((j) => nomina.includes(j.id));
  const previa = partido.formacionPrevia || null;

  const [alineacion, setAlineacion] = useState(() => ({
    ...Object.fromEntries(CASILLAS.map((c) => [c, ''])),
    ...(previa?.alineacion || {}),
  }));
  const [embajadoraId, setEmbajadoraId] = useState(() => previa?.embajadoraId || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const asignadas = new Set([...Object.values(alineacion).filter(Boolean), embajadoraId].filter(Boolean));
  const suplentes = jugadorasNomina
    .filter((j) => !asignadas.has(j.id))
    .sort((a, b) => (a.nombre||'').localeCompare(b.nombre||'') || (a.apellido||'').localeCompare(b.apellido||''));

  // Igual que en la casilla actual, o que todavía no esté en otra --
  // siempre sumamos a la asignada aunque ya no esté en la nómina, para no
  // hacerla desaparecer del selector sin avisar (ver noEstaEnNomina).
  function opcionesPara(casillaActualId) {
    const base = jugadorasNomina.filter((j) => j.id === casillaActualId || !asignadas.has(j.id));
    if (casillaActualId && !base.some((j) => j.id === casillaActualId)) {
      const fuera = roster.find((j) => j.id === casillaActualId);
      if (fuera) return [fuera, ...base];
    }
    return base;
  }

  function noEstaEnNomina(id) {
    return !!id && !nomina.includes(id);
  }

  if (nomina.length === 0) {
    return (
      <div style={{ fontSize: 13, color: MUTED, padding: '8px 0' }}>
        Todavía no hay nómina para este partido — arma la nómina antes de definir la formación.
      </div>
    );
  }

  async function guardar() {
    setGuardando(true);
    try {
      await updateDoc(doc(db, 'partidos', partidoId), {
        formacionPrevia: { alineacion, embajadoraId },
      });
      setError(null);
      onCerrar?.();
    } catch (e) {
      setError('No se pudo guardar la formación. Intenta de nuevo.');
    } finally { setGuardando(false); }
  }

  return (
    <div>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: MUTED }}>
        La captura parte con esto cargado y sigue siendo editable ahí hasta último momento.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, maxWidth: 420, marginBottom: 8 }}>
        <div />
        <div style={{ border: `1.5px solid ${INK}`, borderRadius: 8, padding: '6px 8px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: INK, marginBottom: 3 }}>EMBAJADORA</div>
          <select value={embajadoraId} onChange={(e) => setEmbajadoraId(e.target.value)}
            style={{ width: '100%', border: 'none', fontSize: 12, outline: 'none', background: 'transparent' }}>
            <option value="">— elegir —</option>
            {opcionesPara(embajadoraId).map((j) => <option key={j.id} value={j.id}>{j.nombre} {j.apellido}</option>)}
          </select>
          {noEstaEnNomina(embajadoraId) && (
            <div style={{ fontSize: 10, color: AUSENTE, marginTop: 2 }}>Ya no está en la nómina</div>
          )}
        </div>
        <div />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, maxWidth: 420, marginBottom: 12 }}>
        {CASILLAS.map((c) => (
          <div key={c} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: '6px 8px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 3 }}>{c}</div>
            <select value={alineacion[c]} onChange={(e) => setAlineacion({ ...alineacion, [c]: e.target.value })}
              style={{ width: '100%', border: 'none', fontSize: 12, outline: 'none', background: 'transparent' }}>
              <option value="">—</option>
              {opcionesPara(alineacion[c]).map((j) => <option key={j.id} value={j.id}>{j.nombre} {j.apellido}</option>)}
            </select>
            {noEstaEnNomina(alineacion[c]) && (
              <div style={{ fontSize: 10, color: AUSENTE, marginTop: 2 }}>Ya no está en la nómina</div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 4, textTransform: 'uppercase' }}>
          Suplentes
        </div>
        {suplentes.length === 0 ? (
          <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>Toda la nómina quedó en cancha o de embajadora.</p>
        ) : (
          <p style={{ fontSize: 13, margin: 0 }}>{suplentes.map((j) => `${j.nombre} ${j.apellido}`).join(', ')}</p>
        )}
      </div>

      {error && <p style={{ fontSize: 12, color: AUSENTE, margin: '0 0 14px' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={guardar} disabled={guardando}
          style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: INK, color: PAPER, fontSize: 13,
            cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.7 : 1 }}>
          {guardando ? 'Guardando…' : 'Guardar formación'}
        </button>
        <button onClick={onCerrar} disabled={guardando}
          style={{ border: 'none', background: 'none', color: MUTED, cursor: 'pointer', fontSize: 12 }}>Cerrar</button>
      </div>
    </div>
  );
}
