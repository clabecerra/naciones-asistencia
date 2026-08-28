import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Users, Lock, Download, LogOut } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  collection, query, where, orderBy, onSnapshot,
  doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, deleteField, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { db, auth } from './firebase';
import { INK, PAPER, LINE, MUTED, PRESENTE, AUSENTE, NAVY, WEEKDAY_LABELS } from './theme';
import { dateKey, parseDateInput, monthLabel, bloqueado } from './utils/fechas';
import { getStats } from './utils/estadisticas';
import { Stamp } from './components/Stamp';
import { LOGO_SVG } from './components/Logo';
import { LoginScreen } from './components/LoginScreen';
import { CrearMesTab } from './components/CrearMesTab';

const PROXIMOS_MIN = 6; // aviso admin si quedan menos entrenamientos programados que esto

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────
export default function AttendanceTracker() {
  const [authUser, setAuthUser]     = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin]       = useState(false);

  const [roster, setRoster]               = useState([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError]     = useState(null);

  const [monthDate, setMonthDate]         = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [entrenamientos, setEntrenamientos] = useState([]);
  const [entrenamientosLoading, setEntrenamientosLoading] = useState(true);
  const [asistencia, setAsistencia]       = useState({}); // { entrenamientoId: { jugadoraId: {estado, marcadoPor, actualizadoEn} } }

  const [activeTab, setActiveTab] = useState('registro');
  const [error, setError]         = useState(null);
  const [proximosCount, setProximosCount] = useState(null);

  const [competencias, setCompetencias]           = useState([]);
  const [competenciasLoading, setCompetenciasLoading] = useState(true);
  const [competenciasError, setCompetenciasError] = useState(null);
  const [nuevaComp, setNuevaComp]                 = useState({ nombre:'', fechaInicio:'', fechaTermino:'' });
  const [compEditandoId, setCompEditandoId]       = useState(null);
  const [compEdicion, setCompEdicion]             = useState({ nombre:'', fechaInicio:'', fechaTermino:'' });

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

  // Auth: sesión + rol
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        try { setIsAdmin((await getDoc(doc(db,'admins',user.uid))).exists()); }
        catch { setIsAdmin(false); }
      } else {
        setIsAdmin(false);
      }
      setAuthChecked(true);
    });
    return unsub;
  }, []);

  // Nómina: jugadoras activas del registro. Se lee jugadorasRoster, no
  // jugadoras — esa consulta de colección no se puede permitir sobre
  // jugadoras (su regla de lectura depende de docId, ver firestore.rules
  // de naciones-registro), y jugadorasRoster es justo el espejo liviano
  // pensado para esto (solo nombre, apellido, activa).
  useEffect(() => {
    if (!authUser) { setRoster([]); setRosterError(null); return; }
    setRosterLoading(true);
    setRosterError(null);
    const q = query(collection(db,'jugadorasRoster'), where('activa','==',true));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Por nombre primero, no apellido: la tabla de Registro muestra
      // "{nombre} {apellido}" y usa este orden tal cual, así que tiene que
      // coincidir con lo primero que se lee. No afecta a Estadísticas: esa
      // tabla se reordena aparte por asistencia general (más abajo).
      list.sort((a,b) => (a.nombre||'').localeCompare(b.nombre||'') || (a.apellido||'').localeCompare(b.apellido||''));
      setRoster(list);
      setRosterLoading(false);
    }, (err) => {
      // No mostrar como "sin jugadoras" — un permission-denied silencioso
      // se ve exactamente igual que una nómina vacía si no se distingue.
      console.error('Error cargando nómina:', err);
      setRosterError(err.code === 'permission-denied'
        ? 'No se pudo cargar la nómina: tu cuenta no tiene permiso para verla.'
        : 'No se pudo cargar la nómina. Intenta de nuevo.');
      setRosterLoading(false);
    });
    return unsub;
  }, [authUser]);

  // Entrenamientos del mes visible
  useEffect(() => {
    if (!authUser) { setEntrenamientos([]); return; }
    setEntrenamientosLoading(true);
    const inicio = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const fin    = new Date(monthDate.getFullYear(), monthDate.getMonth()+1, 1);
    const q = query(collection(db,'entrenamientos'),
      where('fecha','>=',Timestamp.fromDate(inicio)),
      where('fecha','<',Timestamp.fromDate(fin)),
      orderBy('fecha'));
    const unsub = onSnapshot(q, (snap) => {
      setEntrenamientos(snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, fecha: data.fecha.toDate(), estado: data.estado,
          bloqueaEn: data.bloqueaEn ? data.bloqueaEn.toDate() : null };
      }));
      setEntrenamientosLoading(false);
    }, () => setEntrenamientosLoading(false));
    return unsub;
  }, [authUser, monthDate.getFullYear(), monthDate.getMonth()]);

  // Asistencia: un listener por entrenamiento visible.
  // Dependencia por ids concatenados, no por la referencia del arreglo:
  // entrenamientos cambia de referencia en cada snapshot aunque los ids
  // sigan siendo los mismos, y no queremos recrear los listeners por eso.
  const entrenamientoIds = entrenamientos.map((e) => e.id).join(',');
  useEffect(() => {
    if (!authUser || entrenamientos.length === 0) { setAsistencia({}); return; }
    const unsubs = entrenamientos.map((ent) => onSnapshot(
      collection(db,'entrenamientos',ent.id,'asistencia'),
      (snap) => {
        const porJugadora = {};
        snap.forEach((d) => { porJugadora[d.id] = d.data(); });
        setAsistencia((prev) => ({ ...prev, [ent.id]: porJugadora }));
      }
    ));
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, entrenamientoIds]);

  // Aviso admin: cuántos entrenamientos programados quedan por delante
  useEffect(() => {
    if (!isAdmin) { setProximosCount(null); return; }
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const q = query(collection(db,'entrenamientos'), where('fecha','>=',Timestamp.fromDate(hoy)));
    const unsub = onSnapshot(q, (snap) => {
      setProximosCount(snap.docs.filter((d) => d.data().estado !== 'suspendido').length);
    });
    return unsub;
  }, [isAdmin]);

  // Competencias (admin)
  useEffect(() => {
    if (!isAdmin) { setCompetencias([]); return; }
    setCompetenciasLoading(true);
    const q = query(collection(db,'competencias'), orderBy('fechaInicio','desc'));
    const unsub = onSnapshot(q, (snap) => {
      setCompetencias(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setCompetenciasLoading(false);
    }, () => setCompetenciasLoading(false));
    return unsub;
  }, [isAdmin]);

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

  function estaBloqueado(ent) { return bloqueado(ent) && !isAdmin; }

  async function marcar(entrenamientoId, jugadoraId) {
    const ent = entrenamientos.find((e) => e.id === entrenamientoId);
    if (!ent || ent.estado === 'suspendido' || estaBloqueado(ent)) return;
    const actual = asistencia[entrenamientoId]?.[jugadoraId]?.estado;
    const ref = doc(db,'entrenamientos',entrenamientoId,'asistencia',jugadoraId);
    try {
      if (actual === undefined) {
        await setDoc(ref, { estado:'presente', marcadoPor: authUser.uid, actualizadoEn: serverTimestamp() });
      } else if (actual === 'presente') {
        await setDoc(ref, { estado:'ausente', marcadoPor: authUser.uid, actualizadoEn: serverTimestamp() });
      } else {
        await deleteDoc(ref);
      }
      setError(null);
    } catch (e) { setError('No se pudo guardar el cambio.'); }
  }

  async function marcarVaciosComoAusentes(entrenamientoId) {
    const ent = entrenamientos.find((e) => e.id === entrenamientoId);
    if (!ent || ent.estado === 'suspendido' || estaBloqueado(ent)) return;
    const marcados = asistencia[entrenamientoId] || {};
    const faltantes = roster.filter((j) => marcados[j.id] === undefined);
    try {
      await Promise.all(faltantes.map((j) => setDoc(
        doc(db,'entrenamientos',entrenamientoId,'asistencia',j.id),
        { estado:'ausente', marcadoPor: authUser.uid, actualizadoEn: serverTimestamp() }
      )));
      setError(null);
    } catch (e) { setError('No se pudo guardar el cambio.'); }
  }

  async function alternarSuspension(entrenamientoId) {
    if (!isAdmin) return;
    const ent = entrenamientos.find((e) => e.id === entrenamientoId);
    if (!ent) return;
    try {
      await updateDoc(doc(db,'entrenamientos',entrenamientoId),
        { estado: ent.estado === 'suspendido' ? 'programado' : 'suspendido' });
    } catch (e) { setError('No se pudo actualizar el entrenamiento.'); }
  }

  function downloadExcelReport() {
    const rows = roster
      .map((j) => ({ j, wed: getStats(asistencia,j.id,wedEnt), sun: getStats(asistencia,j.id,sunEnt), general: getStats(asistencia,j.id,activeEnt) }))
      .sort((a,b) => (b.general.pct??-1)-(a.general.pct??-1))
      .map(({ j, wed, sun, general }) => ({
        'Nombre': `${j.nombre} ${j.apellido}`.trim(),
        'Miércoles - Presentes': wed.presente, 'Miércoles - Ausentes': wed.ausente, 'Miércoles - %': wed.pct??'',
        'Domingo - Presentes': sun.presente, 'Domingo - Ausentes': sun.ausente, 'Domingo - %': sun.pct??'',
        'General - Presentes': general.presente, 'General - Ausentes': general.ausente, 'General - %': general.pct??'',
      }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{wch:26},{wch:20},{wch:19},{wch:10},{wch:19},{wch:18},{wch:10},{wch:18},{wch:17},{wch:10}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estadísticas');
    XLSX.writeFile(wb, `asistencia_${monthLabel(monthDate).replace(/\s+/g,'_')}.xlsx`);
  }

  function changeMonth(delta) { const d = new Date(monthDate); d.setMonth(d.getMonth()+delta); setMonthDate(d); }

  const activeEnt = entrenamientos.filter((e) => e.estado !== 'suspendido');
  const wedEnt    = activeEnt.filter((e) => e.fecha.getDay()===3);
  const sunEnt    = activeEnt.filter((e) => e.fecha.getDay()===0);

  if (!authChecked) return (
    <div style={{ background: NAVY, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      Cargando…
    </div>
  );

  if (!authUser) return <LoginScreen />;

  const tabs = isAdmin ? ['registro','estadisticas','crearMes','competencias','partidos'] : ['registro','estadisticas'];
  const tabLabel = { registro:'Registro de asistencia', estadisticas:'Estadísticas de asistencia', competencias:'Competencias', partidos:'Partidos', crearMes:'Crear mes de asistencia' };

  return (
    <div style={{ background: PAPER, minHeight: '100vh', color: INK, fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      <style>{`
        @keyframes stampPop { 0%{transform:scale(0.4) rotate(0deg);opacity:0} 60%{transform:scale(1.15) rotate(var(--rot,0deg));opacity:1} 100%{transform:scale(1) rotate(var(--rot,0deg))} }
        .stamp-pop { animation: stampPop 0.22s ease-out; }
        ::-webkit-scrollbar { height: 8px; }
        ::-webkit-scrollbar-thumb { background: ${LINE}; border-radius: 4px; }
      `}</style>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 16px 48px' }}>
        {/* HEADER */}
        <header style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', background: NAVY, borderRadius: 12, padding: '12px 20px', marginBottom: 20 }}>
            <div style={{ flexShrink: 0 }}>{LOGO_SVG}</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ffffff', opacity: 0.9 }}>
                <Users size={15} />
                <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Gestión del Equipo</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: MUTED }}>{authUser.email}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {isAdmin && <div style={{ display:'flex',alignItems:'center',gap:5,fontSize:11,color:PRESENTE }}><Lock size={11}/> Sesión administradora</div>}
              <button onClick={()=>signOut(auth)}
                style={{ display:'flex',alignItems:'center',gap:4,border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:11,textDecoration:'underline',padding:0 }}>
                <LogOut size={11}/> Cerrar sesión
              </button>
            </div>
          </div>

          {isAdmin && proximosCount !== null && proximosCount < PROXIMOS_MIN && (
            <div style={{ background:'#FBF2E3', border:`1px solid #E8CFA0`, color:'#8A5A1E', borderRadius:10, padding:'8px 12px', fontSize:12, marginBottom:14 }}>
              Quedan {proximosCount} entrenamiento{proximosCount===1?'':'s'} programado{proximosCount===1?'':'s'} por delante — conviene generar el próximo mes en "Crear nuevo mes".
            </div>
          )}

          {(activeTab === 'registro' || activeTab === 'estadisticas') && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: 22, fontWeight: 700, margin: 0 }}>{monthLabel(monthDate)}</h2>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => changeMonth(-1)} style={{ width:32,height:32,borderRadius:8,border:`1px solid ${LINE}`,background:'white',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}><ChevronLeft size={16}/></button>
                <button onClick={() => changeMonth(1)}  style={{ width:32,height:32,borderRadius:8,border:`1px solid ${LINE}`,background:'white',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}><ChevronRight size={16}/></button>
              </div>
            </div>
          )}
        </header>

        {/* PESTAÑAS */}
        <div style={{ display:'flex',gap:4,marginBottom:16,borderBottom:`1px solid ${LINE}` }}>
          {tabs.map((tab) => (
            <button key={tab} onClick={()=>setActiveTab(tab)}
              style={{ padding:'8px 16px',fontSize:13,fontWeight:600,border:'none',background:'none',cursor:'pointer',
                color:activeTab===tab?INK:MUTED, borderBottom:activeTab===tab?`2px solid ${INK}`:'2px solid transparent',marginBottom:-1 }}>
              {tabLabel[tab]}
            </button>
          ))}
        </div>

        {/* TABLA REGISTRO */}
        {activeTab==='registro' && (
          rosterLoading || entrenamientosLoading ? (
            <div style={{ textAlign:'center',color:MUTED,padding:'40px 0' }}>Cargando…</div>
          ) : rosterError ? (
            <div style={{ textAlign:'center',color:AUSENTE,padding:'40px 0',border:`1px dashed ${AUSENTE}`,borderRadius:12 }}>
              {rosterError}
            </div>
          ) : roster.length === 0 ? (
            <div style={{ textAlign:'center',color:MUTED,padding:'40px 0',border:`1px dashed ${LINE}`,borderRadius:12 }}>
              No hay jugadoras activas en el registro.
            </div>
          ) : entrenamientos.length === 0 ? (
            <div style={{ textAlign:'center',color:MUTED,padding:'40px 0',border:`1px dashed ${LINE}`,borderRadius:12 }}>
              Este mes todavía no tiene entrenamientos creados{isAdmin ? ' — usa "Crear nuevo mes" para generarlos.' : ' — pide a una administradora que los genere.'}
            </div>
          ) : (
            <>
              <div style={{ overflowX:'auto',border:`1px solid ${LINE}`,borderRadius:12,background:'white' }}>
                <table style={{ borderCollapse:'collapse',width:'100%' }}>
                  <thead>
                    <tr>
                      <th style={{ position:'sticky',left:0,zIndex:2,background:'white',textAlign:'left',padding:'10px 12px',fontSize:12,color:MUTED,fontWeight:600,borderBottom:`1px solid ${LINE}`,borderRight:`1px solid ${LINE}`,minWidth:140 }}>Nombre</th>
                      {entrenamientos.map((ent) => {
                        const suspendido = ent.estado === 'suspendido', locked = bloqueado(ent);
                        return (
                          <th key={ent.id} style={{ padding:'6px 4px',fontSize:11,fontWeight:500,textAlign:'center',minWidth:42,
                            color:suspendido?'#C2938A':MUTED, background:suspendido?'#F6E9E6':'white', borderBottom:`1px solid ${LINE}` }}>
                            <div>{WEEKDAY_LABELS[ent.fecha.getDay()]}</div>
                            <div style={{ fontFamily:'monospace',fontSize:12,color:suspendido?AUSENTE:INK,textDecoration:suspendido?'line-through':'none' }}>{ent.fecha.getDate()}</div>
                            {isAdmin ? (
                              <button onClick={()=>alternarSuspension(ent.id)} title={suspendido?'Reactivar':'Marcar como no realizado'}
                                style={{ marginTop:3,border:'none',background:'none',cursor:'pointer',padding:1,color:suspendido?AUSENTE:'#C2BBAF' }}>
                                <X size={10} strokeWidth={2.5}/>
                              </button>
                            ) : locked && !suspendido ? (
                              <div title="Plazo vencido" style={{ marginTop:3,display:'flex',justifyContent:'center',color:'#C2BBAF' }}><Lock size={10} strokeWidth={2.5}/></div>
                            ) : null}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((j) => (
                      <tr key={j.id}>
                        <td style={{ position:'sticky',left:0,zIndex:1,background:'white',padding:'8px 12px',fontSize:14,borderBottom:`1px solid ${LINE}`,borderRight:`1px solid ${LINE}`,whiteSpace:'nowrap' }}>
                          {`${j.nombre} ${j.apellido}`.trim()}
                        </td>
                        {entrenamientos.map((ent) => {
                          const suspendido = ent.estado === 'suspendido';
                          const locked = estaBloqueado(ent);
                          const status = asistencia[ent.id]?.[j.id]?.estado;
                          return (
                            <td key={ent.id} style={{ textAlign:'center',padding:'6px 4px',background:suspendido?'#FBF2F0':'white',borderBottom:`1px solid ${LINE}` }}>
                              {suspendido ? (
                                <div style={{ width:30,height:30,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto' }}>
                                  <div style={{ width:16,height:1.5,background:'#D9B6AF' }}/>
                                </div>
                              ) : (
                                <div style={{ opacity:locked?0.45:1 }} title={locked?'Plazo vencido':undefined}>
                                  <Stamp status={status} onClick={()=>marcar(ent.id,j.id)} disabled={locked}/>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ position:'sticky',left:0,zIndex:1,background:'white',padding:'8px 12px',fontSize:11,color:MUTED,borderRight:`1px solid ${LINE}`,borderTop:`1px solid ${LINE}`,whiteSpace:'nowrap' }}>Marcar vacíos ausentes</td>
                      {entrenamientos.map((ent) => {
                        const suspendido = ent.estado === 'suspendido';
                        const disabled = suspendido || estaBloqueado(ent);
                        return (
                          <td key={ent.id} style={{ textAlign:'center',padding:'4px 2px',borderTop:`1px solid ${LINE}` }}>
                            <button onClick={()=>marcarVaciosComoAusentes(ent.id)} disabled={disabled}
                              style={{ width:22,height:22,borderRadius:6,border:`1px solid ${disabled?LINE:AUSENTE}`,background:disabled?'#F5F4F1':'#F6E9E6',
                                color:disabled?'#C2BBAF':AUSENTE,display:'flex',alignItems:'center',justifyContent:'center',cursor:disabled?'default':'pointer',margin:'0 auto' }}>
                              <X size={12} strokeWidth={2.5}/>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p style={{ fontSize:12,color:MUTED,margin:'10px 2px 16px' }}>
                Toca un día para marcar: vacío → presente → ausente → vacío. Cualquiera puede corregir la marca de cualquiera. Usa la ✕ sobre la fecha para marcar el entrenamiento como no realizado (solo administradoras), o la ✕ debajo para marcar ausentes a quienes quedaron sin marca. Cada registro se bloquea 24h después de las 23:30 del día del entrenamiento.
              </p>

              {isAdmin && (
                <div style={{ textAlign:'right',marginBottom:8 }}>
                  <button onClick={downloadExcelReport}
                    style={{ display:'inline-flex',alignItems:'center',gap:4,border:`1px solid ${LINE}`,background:'white',color:INK,cursor:'pointer',fontSize:11,padding:'4px 8px',borderRadius:6 }}>
                    <Download size={11}/> Descargar reporte Excel
                  </button>
                </div>
              )}
            </>
          )
        )}

        {/* TABLA ESTADÍSTICAS */}
        {activeTab==='estadisticas' && rosterError && (
          <div style={{ textAlign:'center',color:AUSENTE,padding:'40px 0',border:`1px dashed ${AUSENTE}`,borderRadius:12 }}>
            {rosterError}
          </div>
        )}
        {activeTab==='estadisticas' && !rosterLoading && !rosterError && roster.length > 0 && (
          <div style={{ overflowX:'auto',border:`1px solid ${LINE}`,borderRadius:12,background:'white',marginTop:4,marginBottom:24 }}>
            <table style={{ borderCollapse:'collapse',width:'100%' }}>
              <thead>
                <tr>
                  <th style={{ position:'sticky',left:0,zIndex:2,background:'white',textAlign:'left',padding:'10px 12px',fontSize:12,color:MUTED,fontWeight:600,borderBottom:`1px solid ${LINE}`,borderRight:`1px solid ${LINE}`,minWidth:150 }}>Nombre</th>
                  {['Miércoles','Domingo','General'].map(label => (
                    <th key={label} colSpan={3} style={{ padding:'6px 4px',fontSize:11,fontWeight:600,color:MUTED,textAlign:'center',borderBottom:`1px solid ${LINE}`,borderLeft:`1px solid ${LINE}` }}>{label}</th>
                  ))}
                </tr>
                <tr>
                  <th style={{ position:'sticky',left:0,zIndex:1,background:'white',borderRight:`1px solid ${LINE}`,borderBottom:`1px solid ${LINE}` }}></th>
                  {['Pres.','Aus.','%','Pres.','Aus.','%','Pres.','Aus.','%'].map((label,i) => (
                    <th key={i} style={{ padding:'4px 8px',fontSize:11,fontWeight:500,color:MUTED,textAlign:'center',borderBottom:`1px solid ${LINE}`,borderLeft:i%3===0?`1px solid ${LINE}`:'none',minWidth:44 }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster
                  .map((j) => ({ j, wed:getStats(asistencia,j.id,wedEnt), sun:getStats(asistencia,j.id,sunEnt), general:getStats(asistencia,j.id,activeEnt) }))
                  .sort((a,b) => (b.general.pct??-1)-(a.general.pct??-1))
                  .map(({ j, wed, sun, general }) => (
                    <tr key={j.id}>
                      <td style={{ position:'sticky',left:0,zIndex:1,background:'white',padding:'8px 12px',fontSize:14,borderBottom:`1px solid ${LINE}`,borderRight:`1px solid ${LINE}`,whiteSpace:'nowrap' }}>{`${j.nombre} ${j.apellido}`.trim()}</td>
                      {[wed,sun,general].flatMap((s,gi) => [
                        <td key={`${gi}p`} style={{ textAlign:'center',padding:'6px 8px',fontSize:13,color:PRESENTE,borderBottom:`1px solid ${LINE}`,borderLeft:`1px solid ${LINE}` }}>{s.presente}</td>,
                        <td key={`${gi}a`} style={{ textAlign:'center',padding:'6px 8px',fontSize:13,color:AUSENTE,borderBottom:`1px solid ${LINE}` }}>{s.ausente}</td>,
                        <td key={`${gi}pct`} style={{ textAlign:'center',padding:'6px 8px',fontSize:13,fontFamily:'monospace',fontWeight:gi===2?700:600,borderBottom:`1px solid ${LINE}`,
                          color:s.pct===null?MUTED:s.pct>=75?PRESENTE:s.pct>=50?'#B07D2A':AUSENTE }}>
                          {s.pct===null?'—':`${s.pct}%`}
                        </td>,
                      ])}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* COMPETENCIAS */}
        {activeTab==='competencias' && isAdmin && (
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
        )}

        {/* PARTIDOS */}
        {activeTab==='partidos' && isAdmin && (
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
                      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8 }}>
                        <div>
                          <span style={{ fontWeight:600,fontSize:14 }}>
                            {dateKey(p.fecha.toDate())} · {p.lugar}
                            {p.rival ? ` vs ${p.rival}` : ''}
                          </span>
                          <span style={{ marginLeft:8,fontSize:11,padding:'2px 8px',borderRadius:999,background:'#EEF1F6',color:INK }}>
                            {p.tipo}
                          </span>
                          {p.competenciaId && (
                            <span style={{ marginLeft:8,fontSize:12,color:MUTED }}>{nombreCompetencia(p.competenciaId)}</span>
                          )}
                          <span style={{ marginLeft:8,fontSize:11,padding:'2px 8px',borderRadius:999,
                            background:p.estado==='suspendido'?'#F6E9E6':'#EAF2EC',color:p.estado==='suspendido'?AUSENTE:PRESENTE }}>
                            {p.estado==='suspendido'?'Suspendido':'Programado'}
                          </span>
                        </div>
                        <div style={{ display:'flex',gap:10 }}>
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
        )}

        {/* CREAR NUEVO MES */}
        {activeTab==='crearMes' && isAdmin && (
          <CrearMesTab isAdmin={isAdmin} authUser={authUser} />
        )}

        {error && <div style={{ marginTop:16,fontSize:12,color:AUSENTE,textAlign:'center' }}>{error}</div>}
      </div>
    </div>
  );
}
