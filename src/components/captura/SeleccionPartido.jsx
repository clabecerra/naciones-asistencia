import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useConnectionStatus } from '../../context/ConnectionStatus';
import { INK, LINE, MUTED, AUSENTE } from '../../theme';
import { nombrePartido } from '../../utils/partidos';

// Solo oficiales y amistosos tienen captura en vivo en esta etapa -- los
// internos (tipo: entrenamiento) necesitan la estructura de dos equipos
// identificados que llega con el armado de equipos de la Etapa 3.
export function SeleccionPartido({ onSeleccionar }) {
  const { reportSnapshot, clearListener } = useConnectionStatus();
  const [partidos, setPartidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = query(collection(db,'partidos'), where('tipo','in',['oficial','amistoso']), orderBy('fecha','desc'));
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      setPartidos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setError(null);
      setLoading(false);
      reportSnapshot('seleccionPartido', snap.metadata);
    }, (err) => {
      // No mostrar como "sin partidos" -- un error de consulta se ve
      // exactamente igual que una lista vacía si no se distingue (mismo
      // problema que ya se dio una vez con la nómina de asistencia).
      console.error('Error cargando partidos para captura:', err);
      setError(err.code === 'permission-denied'
        ? 'No se pudo cargar la lista de partidos: tu cuenta no tiene permiso para verla.'
        : err.code === 'failed-precondition'
        ? 'No se pudo cargar la lista de partidos: falta un índice de Firestore para esta consulta.'
        : `No se pudo cargar la lista de partidos (${err.code || 'error desconocido'}). Intenta de nuevo.`);
      setLoading(false);
    });
    return () => { unsub(); clearListener('seleccionPartido'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Un partido ya jugado no tiene nada más que capturar -- se saca de la
  // lista acá.
  const disponibles = partidos.filter((p) => p.estado !== 'suspendido' && p.estado !== 'jugado' && (p.nomina||[]).length > 0);

  return (
    <div style={{ background:'white',border:`1px solid ${LINE}`,borderRadius:12,padding:'20px 20px 24px' }}>
      <h3 style={{ margin:'0 0 4px',fontSize:16,fontWeight:700 }}>Captura en vivo</h3>
      <p style={{ margin:'0 0 14px',fontSize:12,color:MUTED }}>
        Elige el partido a capturar. Solo aparecen oficiales y amistosos con nómina definida, sin jugar todavía.
      </p>
      {loading ? (
        <div style={{ color:MUTED,fontSize:13,padding:'12px 0' }}>Cargando…</div>
      ) : error ? (
        <div style={{ textAlign:'center',color:AUSENTE,padding:'20px 0',border:`1px dashed ${AUSENTE}`,borderRadius:12 }}>
          {error}
        </div>
      ) : disponibles.length === 0 ? (
        <div style={{ color:MUTED,fontSize:13,padding:'12px 0' }}>
          Todavía no hay ningún partido con nómina lista para capturar.
        </div>
      ) : (
        <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
          {disponibles.map((p) => (
            <button key={p.id} onClick={()=>onSeleccionar(p.id)}
              style={{ textAlign:'left',border:`1px solid ${LINE}`,borderRadius:8,padding:'10px 14px',background:p.capturaIniciada?'#FBF2E3':'white',cursor:'pointer' }}>
              <span style={{ fontWeight:600,fontSize:14,color:INK }}>{nombrePartido(p)}</span>
              <span style={{ marginLeft:8,fontSize:11,padding:'2px 8px',borderRadius:999,background:'#EEF1F6',color:INK }}>{p.tipo}</span>
              {p.capturaIniciada && (
                <span style={{ marginLeft:8,fontSize:11,color:'#8A5A1E' }}>Captura en curso — toca para continuar</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
