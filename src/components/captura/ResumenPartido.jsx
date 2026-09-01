import { useEffect, useState } from 'react';
import { doc, collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { INK, LINE, MUTED, PRESENTE, AUSENTE } from '../../theme';
import { estadoDelSet } from '../../utils/setReducer';
import { tallarEventos, jugadorasEnFormacion } from '../../utils/resumenPartido';
import { describirEvento } from '../../utils/eventoTexto';

function mensajeErrorCarga(err, que) {
  console.error(`Error cargando ${que}:`, err);
  if (err.code === 'permission-denied') return `No se pudo cargar ${que}: tu cuenta no tiene permiso para verlo.`;
  return `No se pudo cargar ${que} (${err.code || 'error desconocido'}). Intenta de nuevo.`;
}

export function ResumenPartido({ partidoId, roster }) {
  const [partido, setPartido] = useState(null);
  const [sets, setSets] = useState({});
  const [eventosPorSet, setEventosPorSet] = useState({});
  const [error, setError] = useState(null);
  const [verEventos, setVerEventos] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db,'partidos',partidoId), (snap) => {
      setPartido(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setError(null);
    }, (err) => setError(mensajeErrorCarga(err, 'el partido')));
    return unsub;
  }, [partidoId]);

  useEffect(() => {
    const q = query(collection(db,'partidos',partidoId,'sets'), orderBy('__name__'));
    const unsub = onSnapshot(q, (snap) => {
      const next = {};
      snap.forEach((d) => { next[d.id] = { id: d.id, ...d.data() }; });
      setSets(next);
      setError(null);
    }, (err) => setError(mensajeErrorCarga(err, 'los sets del partido')));
    return unsub;
  }, [partidoId]);

  const setIds = Object.keys(sets).sort();
  const setIdsKey = setIds.join(',');
  useEffect(() => {
    if (setIds.length === 0) return;
    const unsubs = setIds.map((setId) => onSnapshot(
      query(collection(db,'partidos',partidoId,'sets',setId,'eventos'), orderBy('orden','asc')),
      (snap) => setEventosPorSet((prev) => ({ ...prev, [setId]: snap.docs.map((d) => ({ id: d.id, ...d.data() })) })),
      (err) => setError(mensajeErrorCarga(err, 'los eventos del partido'))
    ));
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partidoId, setIdsKey]);

  if (error) {
    return <div style={{ textAlign:'center',color:AUSENTE,padding:'20px 0',border:`1px dashed ${AUSENTE}`,borderRadius:12 }}>{error}</div>;
  }
  if (!partido || setIds.some((id) => !eventosPorSet[id])) {
    return <div style={{ color:MUTED,fontSize:13,padding:'12px 0' }}>Cargando…</div>;
  }

  function nombre(id) {
    const j = roster.find((x) => x.id === id);
    return j ? `${j.nombre} ${j.apellido}`.trim() : id;
  }

  const todosLosEventos = setIds.flatMap((id) => eventosPorSet[id] || []);
  const { porJugadora, paseIncompleto, tiroAtrapado } = tallarEventos(todosLosEventos);
  const enFormacion = jugadorasEnFormacion(setIds.map((id) => sets[id]));

  const nomina = partido.nomina || [];
  const jugoLaFormacion = nomina.filter((id) => enFormacion.has(id));
  const noEntro = nomina.filter((id) => !enFormacion.has(id));

  return (
    <div>
      {/* Advertencia fija, no descartable: esto es referencia, no conteo
          exacto -- el registro en vivo puede haberse quedado corto. */}
      <div style={{ background:'#FBF2E3',border:'1px solid #E8CFA0',color:'#8A5A1E',borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:12 }}>
        Estos datos vienen del registro en vivo durante el partido y pueden estar incompletos
        si no se alcanzó a capturar todas las jugadas — es una referencia, no un conteo exacto.
      </div>

      {/* Marcador: informativo, no un error -- va a diferir del oficial
          casi siempre porque sabemos que faltan jugadas. Sin rojo ni tono
          de alerta. */}
      <div style={{ marginBottom:16 }}>
        {setIds.map((id) => {
          const calc = estadoDelSet(eventosPorSet[id] || [], sets[id]);
          const oficial = partido.resultadoOficial?.[id];
          return (
            <div key={id} style={{ fontSize:13,color:INK,marginBottom:4 }}>
              <strong>Set {id}:</strong> calculado {calc.vidasEquipo} / {calc.vidasRival}
              {oficial ? <span style={{ color:MUTED }}> — oficial {oficial.equipo} / {oficial.rival}</span> : null}
            </div>
          );
        })}
      </div>

      {/* Por jugadora -- solo quienes tuvieron alineación en algún set. */}
      <h4 style={{ margin:'0 0 8px',fontSize:13,color:MUTED,fontWeight:600 }}>Jugó</h4>
      {jugoLaFormacion.length === 0 ? (
        <p style={{ fontSize:12,color:MUTED }}>Sin alineación registrada.</p>
      ) : (
        <div style={{ overflowX:'auto',border:`1px solid ${LINE}`,borderRadius:10,marginBottom:16 }}>
          <table style={{ borderCollapse:'collapse',width:'100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign:'left',padding:'8px 12px',fontSize:11,color:MUTED,fontWeight:600,borderBottom:`1px solid ${LINE}` }}>Nombre</th>
                <th style={{ padding:'8px 10px',fontSize:11,color:PRESENTE,fontWeight:600,borderBottom:`1px solid ${LINE}` }}>Quemadas hechas</th>
                <th style={{ padding:'8px 10px',fontSize:11,color:AUSENTE,fontWeight:600,borderBottom:`1px solid ${LINE}` }}>Quemadas recibidas</th>
                <th style={{ padding:'8px 10px',fontSize:11,color:PRESENTE,fontWeight:600,borderBottom:`1px solid ${LINE}` }}>Recepciones</th>
              </tr>
            </thead>
            <tbody>
              {jugoLaFormacion.map((id) => {
                const s = porJugadora.get(id) || { quemadasHechas:0, quemadasRecibidas:0, recepciones:0 };
                return (
                  <tr key={id}>
                    <td style={{ padding:'6px 12px',fontSize:13,borderBottom:`1px solid ${LINE}`,whiteSpace:'nowrap' }}>{nombre(id)}</td>
                    <td style={{ textAlign:'center',padding:'6px 10px',fontSize:13,borderBottom:`1px solid ${LINE}` }}>{s.quemadasHechas}</td>
                    <td style={{ textAlign:'center',padding:'6px 10px',fontSize:13,borderBottom:`1px solid ${LINE}` }}>{s.quemadasRecibidas}</td>
                    <td style={{ textAlign:'center',padding:'6px 10px',fontSize:13,borderBottom:`1px solid ${LINE}` }}>{s.recepciones}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ padding:'6px 12px',fontSize:13,fontWeight:700,color:INK,borderTop:`2px solid ${LINE}` }}>Total</td>
                <td style={{ textAlign:'center',padding:'6px 10px',fontSize:13,fontWeight:700,color:INK,borderTop:`2px solid ${LINE}` }}>
                  {jugoLaFormacion.reduce((acc,id) => acc + (porJugadora.get(id)?.quemadasHechas || 0), 0)}
                </td>
                <td style={{ textAlign:'center',padding:'6px 10px',fontSize:13,fontWeight:700,color:INK,borderTop:`2px solid ${LINE}` }}>
                  {jugoLaFormacion.reduce((acc,id) => acc + (porJugadora.get(id)?.quemadasRecibidas || 0), 0)}
                </td>
                <td style={{ textAlign:'center',padding:'6px 10px',fontSize:13,fontWeight:700,color:INK,borderTop:`2px solid ${LINE}` }}>
                  {jugoLaFormacion.reduce((acc,id) => acc + (porJugadora.get(id)?.recepciones || 0), 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Aparte, sin columnas de números: un cero acá significaría "no
          jugó", no "jugó y no hizo nada" -- por eso ni se muestra. */}
      {noEntro.length > 0 && (
        <>
          <h4 style={{ margin:'0 0 8px',fontSize:13,color:MUTED,fontWeight:600 }}>En nómina, no entró a la cancha</h4>
          <p style={{ fontSize:13,color:MUTED,marginBottom:16 }}>{noEntro.map((id) => nombre(id)).join(', ')}</p>
        </>
      )}

      <h4 style={{ margin:'0 0 8px',fontSize:13,color:MUTED,fontWeight:600 }}>Equipo</h4>
      <p style={{ fontSize:13,color:INK,marginBottom:16 }}>
        Pases incompletos: <strong>{paseIncompleto}</strong> — Tiros atrapados: <strong>{tiroAtrapado}</strong>
      </p>

      <button onClick={()=>setVerEventos((v)=>!v)}
        style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12,textDecoration:'underline',padding:0 }}>
        {verEventos ? 'Ocultar eventos' : 'Ver eventos'}
      </button>

      {verEventos && setIds.map((setId) => (
        <div key={setId} style={{ marginTop:10 }}>
          <h5 style={{ margin:'0 0 6px',fontSize:12,color:MUTED,fontWeight:600 }}>Set {setId}</h5>
          {(eventosPorSet[setId] || []).length === 0 ? (
            <p style={{ fontSize:12,color:MUTED,marginBottom:10 }}>Sin eventos.</p>
          ) : (
            <div style={{ overflowX:'auto',border:`1px solid ${LINE}`,borderRadius:10,marginBottom:10 }}>
              <table style={{ borderCollapse:'collapse',width:'100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign:'left',padding:'6px 10px',fontSize:11,color:MUTED,fontWeight:600,borderBottom:`1px solid ${LINE}` }}>Tiempo</th>
                    <th style={{ textAlign:'left',padding:'6px 10px',fontSize:11,color:MUTED,fontWeight:600,borderBottom:`1px solid ${LINE}` }}>Jugadora</th>
                    <th style={{ textAlign:'left',padding:'6px 10px',fontSize:11,color:MUTED,fontWeight:600,borderBottom:`1px solid ${LINE}` }}>Jugada</th>
                  </tr>
                </thead>
                <tbody>
                  {(eventosPorSet[setId] || []).map((ev) => {
                    const { jugadoraId, verbo } = describirEvento(ev, sets[setId]?.embajadoraId);
                    return (
                      <tr key={ev.id}>
                        <td style={{ padding:'5px 10px',fontSize:12,color:MUTED,borderBottom:`1px solid ${LINE}`,whiteSpace:'nowrap' }}>Min {ev.minuto ?? '—'}</td>
                        <td style={{ padding:'5px 10px',fontSize:13,borderBottom:`1px solid ${LINE}`,whiteSpace:'nowrap' }}>{jugadoraId ? nombre(jugadoraId) : '—'}</td>
                        <td style={{ padding:'5px 10px',fontSize:13,borderBottom:`1px solid ${LINE}` }}>{verbo}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
