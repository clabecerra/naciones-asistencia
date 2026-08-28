import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Users, Lock, LogOut } from 'lucide-react';
import {
  collection, query, where, orderBy, onSnapshot,
  doc, getDoc, Timestamp,
} from 'firebase/firestore';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { db, auth } from './firebase';
import { INK, PAPER, LINE, MUTED, PRESENTE, NAVY } from './theme';
import { monthLabel } from './utils/fechas';
import { LOGO_SVG } from './components/Logo';
import { LoginScreen } from './components/LoginScreen';
import { CrearMesTab } from './components/CrearMesTab';
import { CompetenciasTab } from './components/CompetenciasTab';
import { PartidosTab } from './components/PartidosTab';
import { EstadisticasTab } from './components/EstadisticasTab';
import { RegistroTab } from './components/RegistroTab';

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
  const [proximosCount, setProximosCount] = useState(null);

  const [competencias, setCompetencias]           = useState([]);
  const [competenciasLoading, setCompetenciasLoading] = useState(true);

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

  // Barra de pestañas: señal de que hay más contenido a la derecha solo
  // cuando de verdad se puede seguir desplazando (pantalla angosta con
  // varias pestañas de admin) -- no es un adorno fijo, se recalcula al
  // hacer scroll, al cambiar isAdmin (cambia la cantidad de pestañas) y
  // al redimensionar la ventana.
  const tabsScrollRef = useRef(null);
  const [tabsScrollableRight, setTabsScrollableRight] = useState(false);

  function updateTabsScrollState() {
    const el = tabsScrollRef.current;
    if (!el) { setTabsScrollableRight(false); return; }
    setTabsScrollableRight(el.scrollWidth > el.clientWidth + el.scrollLeft + 1);
  }

  useEffect(() => {
    updateTabsScrollState();
    window.addEventListener('resize', updateTabsScrollState);
    return () => window.removeEventListener('resize', updateTabsScrollState);
  }, [authUser, isAdmin]);

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
        <div style={{ position:'relative', marginBottom:16 }}>
          <div ref={tabsScrollRef} onScroll={updateTabsScrollState}
            style={{ display:'flex',gap:4,overflowX:'auto',WebkitOverflowScrolling:'touch',borderBottom:`1px solid ${LINE}` }}>
            {tabs.map((tab) => (
              <button key={tab} onClick={()=>setActiveTab(tab)}
                style={{ padding:'8px 16px',fontSize:13,fontWeight:600,border:'none',background:'none',cursor:'pointer',whiteSpace:'nowrap',flexShrink:0,
                  color:activeTab===tab?INK:MUTED, borderBottom:activeTab===tab?`2px solid ${INK}`:'2px solid transparent',marginBottom:-1 }}>
                {tabLabel[tab]}
              </button>
            ))}
          </div>
          {tabsScrollableRight && (
            <div style={{ position:'absolute', top:0, right:0, bottom:1, width:28, pointerEvents:'none',
              background:`linear-gradient(to right, transparent, ${PAPER})` }} />
          )}
        </div>

        {activeTab==='registro' && (
          <RegistroTab roster={roster} rosterLoading={rosterLoading} rosterError={rosterError}
            entrenamientos={entrenamientos} entrenamientosLoading={entrenamientosLoading}
            asistencia={asistencia} isAdmin={isAdmin} authUser={authUser}
            activeEnt={activeEnt} wedEnt={wedEnt} sunEnt={sunEnt} monthDate={monthDate} />
        )}

        {activeTab==='estadisticas' && (
          <EstadisticasTab roster={roster} rosterLoading={rosterLoading} rosterError={rosterError}
            asistencia={asistencia} activeEnt={activeEnt} wedEnt={wedEnt} sunEnt={sunEnt} />
        )}

        {/* COMPETENCIAS */}
        {activeTab==='competencias' && isAdmin && (
          <CompetenciasTab competencias={competencias} competenciasLoading={competenciasLoading} />
        )}

        {/* PARTIDOS */}
        {activeTab==='partidos' && isAdmin && (
          <PartidosTab isAdmin={isAdmin} authUser={authUser} competencias={competencias} roster={roster} />
        )}

        {/* CREAR NUEVO MES */}
        {activeTab==='crearMes' && isAdmin && (
          <CrearMesTab isAdmin={isAdmin} authUser={authUser} />
        )}
      </div>
    </div>
  );
}
