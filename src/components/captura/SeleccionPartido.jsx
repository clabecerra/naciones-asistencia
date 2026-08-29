import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { INK, LINE, MUTED } from '../../theme';
import { nombrePartido } from '../../utils/partidos';

// Solo oficiales y amistosos tienen captura en vivo en esta etapa -- los
// internos (tipo: entrenamiento) necesitan la estructura de dos equipos
// identificados que llega con el armado de equipos de la Etapa 3.
export function SeleccionPartido({ onSeleccionar }) {
  const [partidos, setPartidos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db,'partidos'), where('tipo','in',['oficial','amistoso']), orderBy('fecha','desc'));
    const unsub = onSnapshot(q, (snap) => {
      setPartidos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
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
