import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { INK, LINE, MUTED } from '../../theme';
import { dateKey } from '../../utils/fechas';

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

  const disponibles = partidos.filter((p) => p.estado !== 'suspendido' && (p.nomina||[]).length > 0);

  return (
    <div style={{ background:'white',border:`1px solid ${LINE}`,borderRadius:12,padding:'20px 20px 24px' }}>
      <h3 style={{ margin:'0 0 4px',fontSize:16,fontWeight:700 }}>Captura en vivo</h3>
      <p style={{ margin:'0 0 14px',fontSize:12,color:MUTED }}>
        Elige el partido a capturar. Solo aparecen oficiales y amistosos con nómina definida.
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
              <span style={{ fontWeight:600,fontSize:14,color:INK }}>
                {dateKey(p.fecha.toDate())} · {p.lugar}{p.rival ? ` vs ${p.rival}` : ''}
              </span>
              <span style={{ marginLeft:8,fontSize:11,padding:'2px 8px',borderRadius:999,background:'#EEF1F6',color:INK }}>{p.tipo}</span>
              {p.estado==='jugado' && (
                // Morado, igual que en la pestaña Partidos -- distinto del
                // verde de "programado" para que no se confundan a simple vista.
                <span style={{ marginLeft:8,fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:999,background:'#EFE7F7',color:'#6A3FA0' }}>Jugado</span>
              )}
              {p.capturaIniciada && p.estado!=='jugado' && (
                <span style={{ marginLeft:8,fontSize:11,color:'#8A5A1E' }}>Captura en curso — toca para continuar</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
