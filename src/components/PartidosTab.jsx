import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, doc, addDoc, updateDoc, arrayUnion, arrayRemove, deleteField, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useConnectionStatus } from '../context/ConnectionStatus';
import { INK, PAPER, LINE, MUTED, PRESENTE, AUSENTE } from '../theme';
import { dateKey, parseDateInput } from '../utils/fechas';
import { nombrePartido } from '../utils/partidos';
import { DisponibilidadPanel } from './DisponibilidadPanel';
import { FormacionPreviaPanel } from './FormacionPreviaPanel';
import { borrarPartidoCompleto } from '../utils/eventos';
import { estaEnFormacion } from '../utils/formacion';

export function PartidosTab({ isAdmin, authUser, competencias, roster }) {
  const { reportSnapshot, clearListener } = useConnectionStatus();
  const PARTIDO_VACIO = { competenciaId:'', fecha:'', lugar:'', tipo:'oficial', rival:'' };
  const [partidos, setPartidos]                   = useState([]);
  const [partidosLoading, setPartidosLoading]     = useState(true);
  const [partidosError, setPartidosError]         = useState(null);
  const [nuevoPartido, setNuevoPartido]           = useState(PARTIDO_VACIO);
  const [partidoEditandoId, setPartidoEditandoId] = useState(null);
  const [partidoEdicion, setPartidoEdicion]       = useState(PARTIDO_VACIO);
  // Disponibilidad, nómina y formación son pasos de una misma cadena: solo
  // uno de los tres se muestra abierto a la vez por partido.
  const [panelAbierto, setPanelAbierto]           = useState(null); // { id, tipo: 'disponibilidad'|'nomina'|'formacion' }
  const [nominaError, setNominaError]             = useState(null);
  const [nominaSacarConfirmar, setNominaSacarConfirmar] = useState(null); // { partidoId, jugadoraId } — está en la formación, pide confirmar antes de sacarla
  const [dispConfirmadas, setDispConfirmadas]     = useState({}); // partidoId -> cantidad confirmada
  const [menuAbiertoId, setMenuAbiertoId]         = useState(null);
  const [eliminarConfirmId, setEliminarConfirmId] = useState(null);
  const [eliminando, setEliminando]               = useState(false);
  const [eliminarError, setEliminarError]         = useState(null);

  // Partidos (admin)
  useEffect(() => {
    if (!isAdmin) { setPartidos([]); return; }
    setPartidosLoading(true);
    const q = query(collection(db,'partidos'), orderBy('fecha','asc'));
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      setPartidos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPartidosLoading(false);
      reportSnapshot('partidos', snap.metadata);
    }, () => setPartidosLoading(false));
    return () => { unsub(); clearListener('partidos'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Contador del chip de disponibilidad: solo confirmadas, no un total
  // sobre el roster -- con un solo estado (existe = confirmó) "12/25" no
  // aportaría nada que "12" no diga ya.
  // Guarda el set de ids confirmadas, no solo la cantidad: el chip muestra
  // el número, y el panel de nómina lo usa para listar primero a quienes
  // confirmaron.
  const partidoIds = partidos.map((p) => p.id).join(',');
  useEffect(() => {
    const unsubs = partidos.map((p) =>
      onSnapshot(collection(db,'partidos',p.id,'disponibilidad'), (snap) => {
        setDispConfirmadas((prev) => ({ ...prev, [p.id]: new Set(snap.docs.map((d) => d.id)) }));
      }, () => {}));
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partidoIds]);

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

  async function confirmarEliminarPartido() {
    if (!eliminarConfirmId) return;
    setEliminando(true);
    try {
      await borrarPartidoCompleto(eliminarConfirmId);
      setEliminarConfirmId(null);
      setEliminarError(null);
    } catch (e) {
      // No cerrar la confirmación: un rechazo de permisos no puede verse
      // igual que un borrado exitoso.
      setEliminarError('No se pudo eliminar el partido. Intenta de nuevo.');
    } finally { setEliminando(false); }
  }

  function nombreCompetencia(competenciaId) {
    return competencias.find((c) => c.id === competenciaId)?.nombre || '';
  }

  // Lista de inscritas de la competencia de un partido oficial, o null si
  // no aplica (partido no oficial, sin competencia, o competencia sin
  // cupo fijo definido) -- null es "sin filtro", roster completo.
  function inscritasDe(p) {
    if (p.tipo !== 'oficial') return null;
    return competencias.find((c) => c.id === p.competenciaId)?.inscritas || null;
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

  function alternarPanel(tipo, p) {
    setMenuAbiertoId(null);
    if (tipo === 'nomina') { setNominaError(null); setNominaSacarConfirmar(null); }
    setPanelAbierto((prev) => (prev?.id === p.id && prev?.tipo === tipo) ? null : { id: p.id, tipo });
  }

  // Cada casillero escribe al toque, como disponibilidad -- no hay botón
  // "Guardar" que recordar apretar. Al sacar a alguien que la formación
  // previa ya da por convocada (una casilla o de embajadora), pide
  // confirmar antes: la formación quedaría apuntando a alguien que ya no
  // juega si se saca sin avisar.
  async function marcarNomina(partido, jugadoraId, estabaMarcada, forzar) {
    try {
      if (estabaMarcada) {
        if (!forzar && estaEnFormacion(partido, jugadoraId)) {
          setNominaSacarConfirmar({ partidoId: partido.id, jugadoraId });
          return;
        }
        setNominaSacarConfirmar(null);
        await updateDoc(doc(db,'partidos',partido.id), { nomina: arrayRemove(jugadoraId) });
      } else {
        await updateDoc(doc(db,'partidos',partido.id), { nomina: arrayUnion(jugadoraId) });
      }
      setNominaError(null);
    } catch (e) {
      setNominaError('No se pudo guardar el cambio. Intenta de nuevo.');
    }
  }

  // Todas las confirmadas adentro de una, para desmarcar después a las que
  // no van -- suele ser más rápido que marcar una por una. Si nadie
  // registró disponibilidad para este partido, no hay "confirmadas" que
  // marcar -- ahí cae a baseRoster (las inscritas si la competencia tiene
  // lista, si no el roster completo), mismo criterio que el resto de la
  // cadena cuando no hay disponibilidad detrás.
  async function marcarTodaLaNomina(partido, confirmadasSet, baseRoster) {
    const ids = confirmadasSet.size > 0 ? [...confirmadasSet] : baseRoster.map((j) => j.id);
    try {
      await updateDoc(doc(db,'partidos',partido.id), { nomina: ids });
      setNominaError(null);
    } catch (e) {
      setNominaError('No se pudo guardar el cambio. Intenta de nuevo.');
    }
  }

  const chipStyle = {
    flex: 1, display:'flex', flexDirection:'column', alignItems:'center', gap:2,
    padding:'6px 4px', borderRadius:8, border:`1px solid ${LINE}`, background:PAPER,
    fontSize:11, color:INK, cursor:'pointer', minWidth:0,
  };
  const linkStyle = { border:'none', background:'none', color:MUTED, cursor:'pointer', fontSize:12, textDecoration:'underline' };

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
                        <div style={{ display:'flex',gap:8,alignItems:'stretch' }}>
                          <button onClick={()=>alternarPanel('disponibilidad', p)} style={chipStyle}>
                            <span style={{ fontWeight:600 }}>Disponib.</span>
                            <span style={{ color:MUTED }}>{dispConfirmadas[p.id]?.size ?? '—'} sí</span>
                          </button>
                          <button onClick={()=>alternarPanel('nomina', p)} style={chipStyle}>
                            <span style={{ fontWeight:600 }}>Nómina</span>
                            <span style={{ color:MUTED }}>{(p.nomina||[]).length}</span>
                          </button>
                          <button onClick={()=>alternarPanel('formacion', p)} style={chipStyle}>
                            <span style={{ fontWeight:600 }}>Formación</span>
                            <span style={{ color:MUTED }}>{p.formacionPrevia ? 'lista' : '—'}</span>
                          </button>
                          <button onClick={()=>setMenuAbiertoId(menuAbiertoId===p.id ? null : p.id)}
                            aria-label="Más acciones"
                            style={{ width:34,flexShrink:0,borderRadius:8,border:`1px solid ${LINE}`,background:'white',fontSize:16,color:INK,cursor:'pointer' }}>
                            ⋮
                          </button>
                        </div>
                      </div>
                    )}

                    {menuAbiertoId===p.id && (
                      <div style={{ marginTop:10,paddingTop:10,borderTop:`1px solid ${LINE}`,display:'flex',gap:10,flexWrap:'wrap' }}>
                        <button onClick={()=>{ empezarEdicionPartido(p); setMenuAbiertoId(null); }} style={linkStyle}>Editar</button>
                        <button onClick={()=>{ alternarSuspensionPartido(p); setMenuAbiertoId(null); }} style={linkStyle}>
                          {p.estado==='suspendido'?'Reactivar':'Suspender'}
                        </button>
                        {/* Eliminar: la pestaña Partidos ya es solo-admin,
                            pero se deja el chequeo explícito acá también —
                            es la única acción irreversible de esta pantalla. */}
                        {isAdmin && (
                          <button onClick={()=>{ setEliminarConfirmId(p.id); setEliminarError(null); setMenuAbiertoId(null); }}
                            style={{ ...linkStyle,color:AUSENTE }}>
                            Eliminar
                          </button>
                        )}
                      </div>
                    )}

                    {eliminarConfirmId===p.id && (
                      <div style={{ marginTop:12,paddingTop:12,borderTop:`1px solid ${LINE}` }}>
                        <p style={{ fontSize:13,color:AUSENTE,fontWeight:600,margin:'0 0 10px' }}>
                          Esto eliminará todos los datos asociados al partido (alineación, eventos, resultado).
                          No se puede deshacer.
                        </p>
                        {eliminarError && <p style={{ fontSize:12,color:AUSENTE,margin:'0 0 10px' }}>{eliminarError}</p>}
                        <div style={{ display:'flex',gap:8 }}>
                          <button onClick={confirmarEliminarPartido} disabled={eliminando}
                            style={{ padding:'7px 14px',borderRadius:6,border:'none',background:AUSENTE,color:'white',fontSize:12,
                              cursor:eliminando?'default':'pointer',opacity:eliminando?0.7:1 }}>
                            {eliminando ? 'Eliminando…' : 'Confirmar eliminación'}
                          </button>
                          <button onClick={()=>{ setEliminarConfirmId(null); setEliminarError(null); }} disabled={eliminando}
                            style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12 }}>Cancelar</button>
                        </div>
                      </div>
                    )}

                    {panelAbierto?.id===p.id && panelAbierto.tipo==='disponibilidad' && (
                      <div style={{ marginTop:12,paddingTop:12,borderTop:`1px solid ${LINE}` }}>
                        <DisponibilidadPanel partidoId={p.id} roster={roster} elegibles={inscritasDe(p)} />
                      </div>
                    )}

                    {panelAbierto?.id===p.id && panelAbierto.tipo==='formacion' && (
                      <div style={{ marginTop:12,paddingTop:12,borderTop:`1px solid ${LINE}` }}>
                        <FormacionPreviaPanel partidoId={p.id} partido={p} roster={roster} onCerrar={()=>setPanelAbierto(null)} />
                      </div>
                    )}

                    {panelAbierto?.id===p.id && panelAbierto.tipo==='nomina' && (() => {
                      // Por nombre primero, no apellido: la fila muestra
                      // "{nombre} {apellido}", así que el orden tiene que
                      // coincidir con lo primero que se lee, o se ve
                      // desordenado aunque no lo esté.
                      const ordenar = (a,b) => (a.nombre||'').localeCompare(b.nombre||'') || (a.apellido||'').localeCompare(b.apellido||'');
                      const inscritas = inscritasDe(p);
                      const elegibleRoster = inscritas ? roster.filter((j) => inscritas.includes(j.id)) : roster;
                      const fueraDeInscritas = inscritas ? roster.filter((j) => !inscritas.includes(j.id)).sort(ordenar) : [];
                      const confirmadasSet = dispConfirmadas[p.id] || new Set();
                      const confirmadas = elegibleRoster.filter((j) => confirmadasSet.has(j.id)).sort(ordenar);
                      const sinConfirmar = elegibleRoster.filter((j) => !confirmadasSet.has(j.id)).sort(ordenar);
                      const enNomina = p.nomina || [];
                      const fila = (j) => {
                        const marcada = enNomina.includes(j.id);
                        const pidiendoConfirmar = nominaSacarConfirmar?.partidoId===p.id && nominaSacarConfirmar?.jugadoraId===j.id;
                        return (
                          <div key={j.id}>
                            <label style={{ display:'flex',alignItems:'center',gap:8,padding:'4px 0',fontSize:13,cursor:'pointer' }}>
                              <input type="checkbox" checked={marcada} onChange={()=>marcarNomina(p, j.id, marcada)} />
                              {j.nombre} {j.apellido}
                            </label>
                            {pidiendoConfirmar && (
                              <div style={{ margin:'0 0 6px 24px',fontSize:11,color:'#8A5A1E' }}>
                                Está en la formación ya cargada.{' '}
                                <button onClick={()=>marcarNomina(p, j.id, true, true)}
                                  style={{ border:'none',background:'none',color:'#8A5A1E',textDecoration:'underline',cursor:'pointer',fontSize:11,padding:0 }}>
                                  Sacarla igual
                                </button>
                                {' · '}
                                <button onClick={()=>setNominaSacarConfirmar(null)}
                                  style={{ border:'none',background:'none',color:MUTED,textDecoration:'underline',cursor:'pointer',fontSize:11,padding:0 }}>
                                  Cancelar
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      };
                      // Fuera de la lista de inscritas: sigue marcable, nunca
                      // oculta -- las excepciones (lesión durante el torneo,
                      // etc.) existen y esta pantalla no decide por el DT,
                      // solo avisa.
                      const filaExcepcion = (j) => {
                        const marcada = enNomina.includes(j.id);
                        return (
                          <div key={j.id}>
                            <label style={{ display:'flex',alignItems:'center',gap:8,padding:'4px 0',fontSize:13,cursor:'pointer' }}>
                              <input type="checkbox" checked={marcada} onChange={()=>marcarNomina(p, j.id, marcada)} />
                              {j.nombre} {j.apellido}
                            </label>
                            {marcada && (
                              <div style={{ margin:'0 0 6px 24px',fontSize:11,color:'#8A5A1E' }}>No está inscrita en la competencia — excepción.</div>
                            )}
                          </div>
                        );
                      };
                      return (
                      <div style={{ marginTop:12,paddingTop:12,borderTop:`1px solid ${LINE}` }}>
                        <button onClick={()=>marcarTodaLaNomina(p, confirmadasSet, elegibleRoster)}
                          style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12,textDecoration:'underline',padding:0,marginBottom:8 }}>
                          {confirmadasSet.size > 0 ? 'Marcar todas las confirmadas' : 'Marcar todo el equipo'}
                        </button>
                        <div style={{ maxHeight:260,overflowY:'auto',border:`1px solid ${LINE}`,borderRadius:8,padding:'8px 12px' }}>
                          {confirmadas.length === 0 ? (
                            sinConfirmar.map(fila)
                          ) : (
                            <>
                              <div style={{ fontSize:10,fontWeight:700,color:PRESENTE,margin:'2px 0 4px',textTransform:'uppercase' }}>
                                Confirmaron disponibilidad
                              </div>
                              {confirmadas.map(fila)}
                              <div style={{ fontSize:10,fontWeight:700,color:MUTED,margin:'10px 0 4px',textTransform:'uppercase' }}>
                                Resto del Equipo
                              </div>
                              {sinConfirmar.map(fila)}
                            </>
                          )}
                          {fueraDeInscritas.length > 0 && (
                            <>
                              <div style={{ fontSize:10,fontWeight:700,color:'#8A5A1E',margin:'10px 0 4px',textTransform:'uppercase' }}>
                                Fuera de la lista de inscritas
                              </div>
                              {fueraDeInscritas.map(filaExcepcion)}
                            </>
                          )}
                        </div>
                        {nominaError && <p style={{ fontSize:12,color:AUSENTE,margin:'8px 0 0' }}>{nominaError}</p>}
                      </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
  );
}
