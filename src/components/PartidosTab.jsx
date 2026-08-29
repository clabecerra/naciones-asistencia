import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, doc, addDoc, updateDoc, deleteField, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { INK, PAPER, LINE, MUTED, PRESENTE, AUSENTE } from '../theme';
import { dateKey, parseDateInput } from '../utils/fechas';
import { nombrePartido } from '../utils/partidos';

export function PartidosTab({ isAdmin, authUser, competencias, roster }) {
  const PARTIDO_VACIO = { competenciaId:'', fecha:'', lugar:'', tipo:'oficial', rival:'' };
  const [partidos, setPartidos]                   = useState([]);
  const [partidosLoading, setPartidosLoading]     = useState(true);
  const [partidosError, setPartidosError]         = useState(null);
  const [nuevoPartido, setNuevoPartido]           = useState(PARTIDO_VACIO);
  const [partidoEditandoId, setPartidoEditandoId] = useState(null);
  const [partidoEdicion, setPartidoEdicion]       = useState(PARTIDO_VACIO);
  const [nominaAbiertaId, setNominaAbiertaId]     = useState(null);
  const [nominaSeleccion, setNominaSeleccion]     = useState([]);
  const [nominaGuardando, setNominaGuardando]     = useState(false);
  const [nominaError, setNominaError]             = useState(null);

  // Partidos (admin)
  useEffect(() => {
    if (!isAdmin) { setPartidos([]); return; }
    setPartidosLoading(true);
    const q = query(collection(db,'partidos'), orderBy('fecha','asc'));
    const unsub = onSnapshot(q, (snap) => {
      setPartidos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPartidosLoading(false);
    }, () => setPartidosLoading(false));
    return unsub;
  }, [isAdmin]);

  // Un oficial sin competencia queda fuera de los acumulados; un
  // entrenamiento no lleva competencia; un amistoso puede tener o no.
  // Mismo criterio que ya hace cumplir firestore.rules — esto es solo para
  // no dejar tocar "Crear"/"Guardar" antes de llegar al servidor.
  function competenciaValidaParaPartido(tipo, competenciaId) {
    if (tipo === 'oficial' && !competenciaId) return false;
    return true;
  }

  async function crearPartido() {
    const { competenciaId, fecha, lugar, tipo, rival } = nuevoPartido;
    if (!fecha || !lugar.trim() || !tipo) { setPartidosError('Completa fecha, lugar y tipo.'); return; }
    if (!competenciaValidaParaPartido(tipo, competenciaId)) { setPartidosError('Un partido oficial necesita competencia.'); return; }
    try {
      const data = {
        fecha: Timestamp.fromDate(parseDateInput(fecha)),
        lugar: lugar.trim(),
        tipo,
        competenciaId: tipo === 'entrenamiento' ? '' : competenciaId,
        estado: 'programado',
        creadoPor: authUser.uid,
      };
      // rival no existe en absoluto para un entrenamiento -- no se guarda
      // ni vacío ni con un valor de relleno. La estructura real de dos
      // equipos internos llega con el armado de equipos de la Etapa 3.
      if (tipo !== 'entrenamiento') data.rival = rival.trim();
      await addDoc(collection(db,'partidos'), data);
      setNuevoPartido(PARTIDO_VACIO);
      setPartidosError(null);
    } catch (e) { setPartidosError('No se pudo crear el partido.'); }
  }

  function empezarEdicionPartido(p) {
    setPartidoEditandoId(p.id);
    setPartidoEdicion({
      competenciaId: p.competenciaId || '',
      fecha: dateKey(p.fecha.toDate()),
      lugar: p.lugar,
      tipo: p.tipo,
      rival: p.rival || '',
    });
  }

  async function guardarEdicionPartido() {
    const { competenciaId, fecha, lugar, tipo, rival } = partidoEdicion;
    if (!fecha || !lugar.trim() || !tipo) { setPartidosError('Completa fecha, lugar y tipo.'); return; }
    if (!competenciaValidaParaPartido(tipo, competenciaId)) { setPartidosError('Un partido oficial necesita competencia.'); return; }
    try {
      const data = {
        fecha: Timestamp.fromDate(parseDateInput(fecha)),
        lugar: lugar.trim(),
        tipo,
        competenciaId: tipo === 'entrenamiento' ? '' : competenciaId,
      };
      // Si se cambia a entrenamiento en la edición, se borra el rival que
      // pudiera haber quedado de antes -- no se deja un dato huérfano.
      data.rival = tipo === 'entrenamiento' ? deleteField() : rival.trim();
      await updateDoc(doc(db,'partidos',partidoEditandoId), data);
      setPartidoEditandoId(null);
      setPartidosError(null);
    } catch (e) { setPartidosError('No se pudo guardar la edición.'); }
  }

  async function alternarSuspensionPartido(p) {
    try {
      await updateDoc(doc(db,'partidos',p.id), { estado: p.estado==='suspendido' ? 'programado' : 'suspendido' });
    } catch (e) { setPartidosError('No se pudo actualizar el estado.'); }
  }

  function nombreCompetencia(competenciaId) {
    return competencias.find((c) => c.id === competenciaId)?.nombre || '';
  }

  // "programado"/"suspendido" son los únicos estados que esta pestaña
  // escribe, pero la captura en vivo puede llevar el partido a "jugado" (o
  // dejarlo con capturaIniciada mientras sigue en curso) desde la pestaña
  // Captura -- si no se refleja acá, un partido ya jugado se ve igual que
  // uno recién creado.
  function estadoBadge(p) {
    if (p.estado === 'suspendido') return { label: 'Suspendido', bg: '#F6E9E6', color: AUSENTE };
    // Morado, sin usar en ningún otro badge de la app (verde=programado,
    // rojo=suspendido, ámbar=captura en curso) -- para que "Jugado" no se
    // confunda con "Programado" a simple vista.
    if (p.estado === 'jugado') return { label: 'Jugado', bg: '#EFE7F7', color: '#6A3FA0', bold: true };
    if (p.capturaIniciada) return { label: 'Captura en curso', bg: '#FBF2E3', color: '#8A5A1E' };
    return { label: 'Programado', bg: '#EAF2EC', color: PRESENTE };
  }

  function abrirNomina(p) {
    setNominaAbiertaId(p.id);
    setNominaSeleccion(p.nomina || []);
    setNominaError(null);
  }

  function toggleNominaJugadora(uid) {
    setNominaSeleccion((prev) => prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]);
  }

  async function guardarNomina() {
    setNominaGuardando(true);
    try {
      await updateDoc(doc(db,'partidos',nominaAbiertaId), { nomina: nominaSeleccion });
      setNominaAbiertaId(null);
      setNominaError(null);
    } catch (e) {
      // No cerrar el panel: un rechazo de permisos no puede verse igual
      // que un guardado exitoso.
      setNominaError('No se pudo guardar la nómina. Intenta de nuevo.');
    } finally { setNominaGuardando(false); }
  }

  return (
          <div style={{ background:'white',border:`1px solid ${LINE}`,borderRadius:12,padding:'20px 20px 24px' }}>
            <h3 style={{ margin:'0 0 14px',fontSize:16,fontWeight:700 }}>Nuevo partido</h3>
            <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:10 }}>
              <select value={nuevoPartido.tipo}
                onChange={(e)=>setNuevoPartido({ ...nuevoPartido, tipo:e.target.value, ...(e.target.value==='entrenamiento' ? { competenciaId:'', rival:'' } : {}) })}
                style={{ padding:'9px 12px',borderRadius:8,border:`1px solid ${LINE}`,fontSize:14,outline:'none',background:'white' }}>
                <option value="oficial">Oficial</option>
                <option value="amistoso">Amistoso</option>
                <option value="entrenamiento">Entrenamiento (interno)</option>
              </select>
              {nuevoPartido.tipo !== 'entrenamiento' && (
                <select value={nuevoPartido.competenciaId} onChange={(e)=>setNuevoPartido({ ...nuevoPartido, competenciaId:e.target.value })}
                  style={{ padding:'9px 12px',borderRadius:8,border:`1px solid ${LINE}`,fontSize:14,outline:'none',background:'white' }}>
                  <option value="">
                    {nuevoPartido.tipo==='oficial' ? '— Selecciona competencia —' : 'Sin competencia'}
                  </option>
                  {competencias.filter((c)=>c.estado==='activa').map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              )}
              <input type="date" value={nuevoPartido.fecha} onChange={(e)=>setNuevoPartido({ ...nuevoPartido, fecha:e.target.value })}
                style={{ padding:'9px 12px',borderRadius:8,border:`1px solid ${LINE}`,fontSize:14,outline:'none' }} />
              <input value={nuevoPartido.lugar} onChange={(e)=>setNuevoPartido({ ...nuevoPartido, lugar:e.target.value })}
                placeholder="Lugar" style={{ flex:'1 1 160px',padding:'9px 12px',borderRadius:8,border:`1px solid ${LINE}`,fontSize:14,outline:'none' }} />
              {nuevoPartido.tipo !== 'entrenamiento' && (
                <input value={nuevoPartido.rival} onChange={(e)=>setNuevoPartido({ ...nuevoPartido, rival:e.target.value })}
                  placeholder="Rival" style={{ flex:'1 1 160px',padding:'9px 12px',borderRadius:8,border:`1px solid ${LINE}`,fontSize:14,outline:'none' }} />
              )}
              <button onClick={crearPartido}
                style={{ display:'flex',alignItems:'center',gap:4,padding:'9px 14px',borderRadius:8,border:'none',background:INK,color:PAPER,fontSize:14,cursor:'pointer' }}>
                <Plus size={15}/> Crear
              </button>
            </div>
            {partidosError && <p style={{ fontSize:12,color:AUSENTE,margin:'0 0 14px' }}>{partidosError}</p>}

            <h3 style={{ margin:'20px 0 10px',fontSize:16,fontWeight:700 }}>Partidos</h3>
            {partidosLoading ? (
              <div style={{ color:MUTED,fontSize:13,padding:'12px 0' }}>Cargando…</div>
            ) : partidos.length === 0 ? (
              <div style={{ color:MUTED,fontSize:13,padding:'12px 0' }}>Todavía no hay ninguno.</div>
            ) : (
              <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                {partidos.map((p) => (
                  <div key={p.id} style={{ border:`1px solid ${LINE}`,borderRadius:8,padding:'10px 14px' }}>
                    {partidoEditandoId === p.id ? (
                      <div style={{ display:'flex',flexWrap:'wrap',gap:8,alignItems:'center' }}>
                        <select value={partidoEdicion.tipo}
                          onChange={(e)=>setPartidoEdicion({ ...partidoEdicion, tipo:e.target.value, ...(e.target.value==='entrenamiento' ? { competenciaId:'', rival:'' } : {}) })}
                          style={{ padding:'7px 10px',borderRadius:6,border:`1px solid ${LINE}`,fontSize:13,outline:'none',background:'white' }}>
                          <option value="oficial">Oficial</option>
                          <option value="amistoso">Amistoso</option>
                          <option value="entrenamiento">Entrenamiento (interno)</option>
                        </select>
                        {partidoEdicion.tipo !== 'entrenamiento' && (
                          <select value={partidoEdicion.competenciaId} onChange={(e)=>setPartidoEdicion({ ...partidoEdicion, competenciaId:e.target.value })}
                            style={{ padding:'7px 10px',borderRadius:6,border:`1px solid ${LINE}`,fontSize:13,outline:'none',background:'white' }}>
                            <option value="">
                              {partidoEdicion.tipo==='oficial' ? '— Selecciona competencia —' : 'Sin competencia'}
                            </option>
                            {competencias.filter((c)=>c.estado==='activa' || c.id===partidoEdicion.competenciaId).map((c) => (
                              <option key={c.id} value={c.id}>{c.nombre}</option>
                            ))}
                          </select>
                        )}
                        <input type="date" value={partidoEdicion.fecha} onChange={(e)=>setPartidoEdicion({ ...partidoEdicion, fecha:e.target.value })}
                          style={{ padding:'7px 10px',borderRadius:6,border:`1px solid ${LINE}`,fontSize:13,outline:'none' }} />
                        <input value={partidoEdicion.lugar} onChange={(e)=>setPartidoEdicion({ ...partidoEdicion, lugar:e.target.value })}
                          placeholder="Lugar" style={{ flex:'1 1 140px',padding:'7px 10px',borderRadius:6,border:`1px solid ${LINE}`,fontSize:13,outline:'none' }} />
                        {partidoEdicion.tipo !== 'entrenamiento' && (
                          <input value={partidoEdicion.rival} onChange={(e)=>setPartidoEdicion({ ...partidoEdicion, rival:e.target.value })}
                            placeholder="Rival" style={{ flex:'1 1 140px',padding:'7px 10px',borderRadius:6,border:`1px solid ${LINE}`,fontSize:13,outline:'none' }} />
                        )}
                        <button onClick={guardarEdicionPartido}
                          style={{ padding:'7px 12px',borderRadius:6,border:'none',background:INK,color:'white',fontSize:12,cursor:'pointer' }}>Guardar</button>
                        <button onClick={()=>setPartidoEditandoId(null)}
                          style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12 }}>Cancelar</button>
                      </div>
                    ) : (
                      <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                        <div>
                          <span style={{ fontWeight:600,fontSize:14 }}>{nombrePartido(p)}</span>
                          <span style={{ marginLeft:8,fontSize:11,padding:'2px 8px',borderRadius:999,background:'#EEF1F6',color:INK }}>
                            {p.tipo}
                          </span>
                          {p.competenciaId && (
                            <span style={{ marginLeft:8,fontSize:12,color:MUTED }}>{nombreCompetencia(p.competenciaId)}</span>
                          )}
                          <span style={{ marginLeft:8,fontSize:11,padding:'2px 8px',borderRadius:999,fontWeight:estadoBadge(p).bold?700:400,
                            background:estadoBadge(p).bg,color:estadoBadge(p).color }}>
                            {estadoBadge(p).label}
                          </span>
                        </div>
                        <div style={{ display:'flex',gap:10,flexWrap:'wrap' }}>
                          <button onClick={()=>empezarEdicionPartido(p)}
                            style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12,textDecoration:'underline' }}>Editar</button>
                          <button onClick={()=>nominaAbiertaId===p.id ? setNominaAbiertaId(null) : abrirNomina(p)}
                            style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12,textDecoration:'underline' }}>
                            Nómina ({(p.nomina||[]).length})
                          </button>
                          <button onClick={()=>alternarSuspensionPartido(p)}
                            style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12,textDecoration:'underline' }}>
                            {p.estado==='suspendido'?'Reactivar':'Suspender'}
                          </button>
                        </div>
                      </div>
                    )}

                    {nominaAbiertaId===p.id && (
                      <div style={{ marginTop:12,paddingTop:12,borderTop:`1px solid ${LINE}` }}>
                        <div style={{ maxHeight:220,overflowY:'auto',border:`1px solid ${LINE}`,borderRadius:8,padding:'8px 12px' }}>
                          {roster
                            .slice()
                            // Por nombre primero, no apellido: la fila muestra
                            // "{nombre} {apellido}", así que el orden tiene que
                            // coincidir con lo primero que se lee, o se ve
                            // desordenado aunque no lo esté.
                            .sort((a,b) => (a.nombre||'').localeCompare(b.nombre||'') || (a.apellido||'').localeCompare(b.apellido||''))
                            .map((j) => (
                              <label key={j.id} style={{ display:'flex',alignItems:'center',gap:8,padding:'4px 0',fontSize:13,cursor:'pointer' }}>
                                <input type="checkbox" checked={nominaSeleccion.includes(j.id)} onChange={()=>toggleNominaJugadora(j.id)} />
                                {j.nombre} {j.apellido}
                              </label>
                            ))}
                        </div>
                        {nominaError && <p style={{ fontSize:12,color:AUSENTE,margin:'8px 0 0' }}>{nominaError}</p>}
                        <div style={{ display:'flex',gap:8,marginTop:10 }}>
                          <button onClick={guardarNomina} disabled={nominaGuardando}
                            style={{ padding:'7px 14px',borderRadius:6,border:'none',background:INK,color:'white',fontSize:12,
                              cursor:nominaGuardando?'default':'pointer',opacity:nominaGuardando?0.7:1 }}>
                            {nominaGuardando?'Guardando…':'Guardar'}
                          </button>
                          <button onClick={()=>setNominaAbiertaId(null)} disabled={nominaGuardando}
                            style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12 }}>Cancelar</button>
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
