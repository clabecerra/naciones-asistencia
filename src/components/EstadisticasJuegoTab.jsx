import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useConnectionStatus } from '../context/ConnectionStatus';
import { INK, LINE, MUTED } from '../theme';
import { nombrePartido } from '../utils/partidos';
import { ResumenPartido } from './captura/ResumenPartido';

// Por ahora, por partido -- lo que antes era "Ver resumen" dentro de
// Partidos, movido a su propia pestaña porque ahí quedaba muy escondido.
// Acumulados entre partidos quedan para cuando se necesiten.
export function EstadisticasJuegoTab({ roster, competencias }) {
  const { reportSnapshot, clearListener } = useConnectionStatus();
  const [partidos, setPartidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [partidoId, setPartidoId] = useState(null);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db,'partidos'), orderBy('fecha','desc'));
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      const jugados = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.estado === 'jugado');
      setPartidos(jugados);
      setLoading(false);
      reportSnapshot('estadisticasJuego:partidos', snap.metadata);
    }, () => setLoading(false));
    return () => { unsub(); clearListener('estadisticasJuego:partidos'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function nombreCompetencia(competenciaId) {
    return competencias.find((c) => c.id === competenciaId)?.nombre || '';
  }

  if (partidoId) {
    return (
      <div style={{ background:'white',border:`1px solid ${LINE}`,borderRadius:12,padding:'20px 20px 24px' }}>
        <button onClick={()=>setPartidoId(null)}
          style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12,textDecoration:'underline',padding:0,marginBottom:14 }}>
          ← Otro partido
        </button>
        <ResumenPartido partidoId={partidoId} roster={roster} />
      </div>
    );
  }

  return (
    <div style={{ background:'white',border:`1px solid ${LINE}`,borderRadius:12,padding:'20px 20px 24px' }}>
      <h3 style={{ margin:'0 0 14px',fontSize:16,fontWeight:700 }}>Estadísticas de juego</h3>
      {loading ? (
        <div style={{ color:MUTED,fontSize:13,padding:'12px 0' }}>Cargando…</div>
      ) : partidos.length === 0 ? (
        <div style={{ color:MUTED,fontSize:13,padding:'12px 0' }}>Todavía no hay partidos jugados.</div>
      ) : (
        <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
          {partidos.map((p) => (
            <button key={p.id} onClick={()=>setPartidoId(p.id)}
              style={{ textAlign:'left',border:`1px solid ${LINE}`,borderRadius:8,padding:'10px 14px',background:'white',cursor:'pointer',fontSize:14,color:INK }}>
              <span style={{ fontWeight:600 }}>{nombrePartido(p)}</span>
              <span style={{ marginLeft:8,fontSize:11,padding:'2px 8px',borderRadius:999,background:'#EEF1F6',color:INK }}>
                {p.tipo}
              </span>
              {p.competenciaId && (
                <span style={{ marginLeft:8,fontSize:12,color:MUTED }}>{nombreCompetencia(p.competenciaId)}</span>
              )}
              <span style={{ marginLeft:8,fontSize:11,padding:'2px 8px',borderRadius:999,fontWeight:700,background:'#EFE7F7',color:'#6A3FA0' }}>
                Jugado
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
