import { useState } from 'react';
import { Plus } from 'lucide-react';
import { doc, addDoc, collection, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { INK, PAPER, LINE, MUTED, PRESENTE, AUSENTE } from '../theme';
import { dateKey, parseDateInput } from '../utils/fechas';

export function CompetenciasTab({ competencias, competenciasLoading }) {
  const [competenciasError, setCompetenciasError] = useState(null);
  const [nuevaComp, setNuevaComp]                 = useState({ nombre:'', fechaInicio:'', fechaTermino:'' });
  const [compEditandoId, setCompEditandoId]       = useState(null);
  const [compEdicion, setCompEdicion]             = useState({ nombre:'', fechaInicio:'', fechaTermino:'' });

  async function crearCompetencia() {
    const nombre = nuevaComp.nombre.trim();
    if (!nombre || !nuevaComp.fechaInicio || !nuevaComp.fechaTermino) {
      setCompetenciasError('Completa nombre y las dos fechas.');
      return;
    }
    try {
      await addDoc(collection(db,'competencias'), {
        nombre,
        fechaInicio: Timestamp.fromDate(parseDateInput(nuevaComp.fechaInicio)),
        fechaTermino: Timestamp.fromDate(parseDateInput(nuevaComp.fechaTermino)),
        estado: 'activa',
      });
      setNuevaComp({ nombre:'', fechaInicio:'', fechaTermino:'' });
      setCompetenciasError(null);
    } catch (e) { setCompetenciasError('No se pudo crear la competencia.'); }
  }

  function empezarEdicionCompetencia(c) {
    setCompEditandoId(c.id);
    setCompEdicion({
      nombre: c.nombre,
      fechaInicio: dateKey(c.fechaInicio.toDate()),
      fechaTermino: dateKey(c.fechaTermino.toDate()),
    });
  }

  async function guardarEdicionCompetencia() {
    const nombre = compEdicion.nombre.trim();
    if (!nombre || !compEdicion.fechaInicio || !compEdicion.fechaTermino) {
      setCompetenciasError('Completa nombre y las dos fechas.');
      return;
    }
    try {
      await updateDoc(doc(db,'competencias',compEditandoId), {
        nombre,
        fechaInicio: Timestamp.fromDate(parseDateInput(compEdicion.fechaInicio)),
        fechaTermino: Timestamp.fromDate(parseDateInput(compEdicion.fechaTermino)),
      });
      setCompEditandoId(null);
      setCompetenciasError(null);
    } catch (e) { setCompetenciasError('No se pudo guardar la edición.'); }
  }

  // cerrada no es un borrado: solo deja de ofrecerse al crear un partido
  // nuevo. Sigue existiendo igual para estadísticas y para los partidos
  // que ya la tengan asignada.
  async function alternarCierreCompetencia(c) {
    try {
      await updateDoc(doc(db,'competencias',c.id), { estado: c.estado==='cerrada' ? 'activa' : 'cerrada' });
    } catch (e) { setCompetenciasError('No se pudo actualizar el estado.'); }
  }

  return (
          <div style={{ background:'white',border:`1px solid ${LINE}`,borderRadius:12,padding:'20px 20px 24px' }}>
            <h3 style={{ margin:'0 0 14px',fontSize:16,fontWeight:700 }}>Nueva competencia</h3>
            <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:10 }}>
              <input value={nuevaComp.nombre} onChange={(e)=>setNuevaComp({...nuevaComp,nombre:e.target.value})}
                placeholder="Nombre" style={{ flex:'1 1 200px',padding:'9px 12px',borderRadius:8,border:`1px solid ${LINE}`,fontSize:14,outline:'none' }} />
              <input type="date" value={nuevaComp.fechaInicio} onChange={(e)=>setNuevaComp({...nuevaComp,fechaInicio:e.target.value})}
                style={{ padding:'9px 12px',borderRadius:8,border:`1px solid ${LINE}`,fontSize:14,outline:'none' }} />
              <input type="date" value={nuevaComp.fechaTermino} onChange={(e)=>setNuevaComp({...nuevaComp,fechaTermino:e.target.value})}
                style={{ padding:'9px 12px',borderRadius:8,border:`1px solid ${LINE}`,fontSize:14,outline:'none' }} />
              <button onClick={crearCompetencia}
                style={{ display:'flex',alignItems:'center',gap:4,padding:'9px 14px',borderRadius:8,border:'none',background:INK,color:PAPER,fontSize:14,cursor:'pointer' }}>
                <Plus size={15}/> Crear
              </button>
            </div>
            {competenciasError && <p style={{ fontSize:12,color:AUSENTE,margin:'0 0 14px' }}>{competenciasError}</p>}

            <h3 style={{ margin:'20px 0 10px',fontSize:16,fontWeight:700 }}>Competencias</h3>
            {competenciasLoading ? (
              <div style={{ color:MUTED,fontSize:13,padding:'12px 0' }}>Cargando…</div>
            ) : competencias.length === 0 ? (
              <div style={{ color:MUTED,fontSize:13,padding:'12px 0' }}>Todavía no hay ninguna.</div>
            ) : (
              <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                {competencias.map((c) => (
                  <div key={c.id} style={{ border:`1px solid ${LINE}`,borderRadius:8,padding:'10px 14px' }}>
                    {compEditandoId === c.id ? (
                      <div style={{ display:'flex',flexWrap:'wrap',gap:8,alignItems:'center' }}>
                        <input value={compEdicion.nombre} onChange={(e)=>setCompEdicion({...compEdicion,nombre:e.target.value})}
                          style={{ flex:'1 1 200px',padding:'7px 10px',borderRadius:6,border:`1px solid ${LINE}`,fontSize:13,outline:'none' }} />
                        <input type="date" value={compEdicion.fechaInicio} onChange={(e)=>setCompEdicion({...compEdicion,fechaInicio:e.target.value})}
                          style={{ padding:'7px 10px',borderRadius:6,border:`1px solid ${LINE}`,fontSize:13,outline:'none' }} />
                        <input type="date" value={compEdicion.fechaTermino} onChange={(e)=>setCompEdicion({...compEdicion,fechaTermino:e.target.value})}
                          style={{ padding:'7px 10px',borderRadius:6,border:`1px solid ${LINE}`,fontSize:13,outline:'none' }} />
                        <button onClick={guardarEdicionCompetencia}
                          style={{ padding:'7px 12px',borderRadius:6,border:'none',background:INK,color:'white',fontSize:12,cursor:'pointer' }}>Guardar</button>
                        <button onClick={()=>setCompEditandoId(null)}
                          style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12 }}>Cancelar</button>
                      </div>
                    ) : (
                      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8 }}>
                        <div>
                          <span style={{ fontWeight:600,fontSize:14 }}>{c.nombre}</span>
                          <span style={{ marginLeft:8,fontSize:12,color:MUTED }}>
                            {dateKey(c.fechaInicio.toDate())} – {dateKey(c.fechaTermino.toDate())}
                          </span>
                          <span style={{ marginLeft:8,fontSize:11,padding:'2px 8px',borderRadius:999,
                            background:c.estado==='cerrada'?'#F6E9E6':'#EAF2EC',color:c.estado==='cerrada'?AUSENTE:PRESENTE }}>
                            {c.estado==='cerrada'?'Cerrada':'Activa'}
                          </span>
                        </div>
                        <div style={{ display:'flex',gap:10 }}>
                          <button onClick={()=>empezarEdicionCompetencia(c)}
                            style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12,textDecoration:'underline' }}>Editar</button>
                          <button onClick={()=>alternarCierreCompetencia(c)}
                            style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12,textDecoration:'underline' }}>
                            {c.estado==='cerrada'?'Reabrir':'Cerrar'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
  );
}
