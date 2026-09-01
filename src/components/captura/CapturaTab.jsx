import { useEffect, useMemo, useState } from 'react';
import { doc, collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { INK, PAPER, LINE, MUTED, AUSENTE } from '../../theme';
import { nombrePartido } from '../../utils/partidos';
import { tomarControl } from '../../utils/eventos';
import { SeleccionPartido } from './SeleccionPartido';
import { AlineacionSet } from './AlineacionSet';
import { CapturaEnVivo } from './CapturaEnVivo';
import { ResumenPartido } from './ResumenPartido';

const CONTROL_STALE_MS = 3 * 60 * 60 * 1000; // 3h sin actividad: se asume perdido (batería, señal)

// No mostrar un error de consulta como si fuera "sigue cargando" -- mismo
// problema que ya se dio con la nómina de asistencia: un permission-denied
// (o un índice de Firestore faltante) silencioso se ve igual que datos que
// todavía no llegan, si no se distingue.
function mensajeErrorCarga(err, que) {
  console.error(`Error cargando ${que}:`, err);
  if (err.code === 'permission-denied') return `No se pudo cargar ${que}: tu cuenta no tiene permiso para verlo.`;
  if (err.code === 'failed-precondition') return `No se pudo cargar ${que}: falta un índice de Firestore para esta consulta.`;
  return `No se pudo cargar ${que} (${err.code || 'error desconocido'}). Intenta de nuevo.`;
}

export function CapturaTab({ partidoIdInicial, onCambiarPartido, roster, authUser }) {
  const [partidoId, setPartidoId] = useState(partidoIdInicial || null);
  const [partido, setPartido] = useState(null);
  const [sets, setSets] = useState({});
  const [reclamando, setReclamando] = useState(false);
  const [errorCarga, setErrorCarga] = useState(null);

  useEffect(() => { setPartidoId(partidoIdInicial || null); }, [partidoIdInicial]);

  useEffect(() => {
    if (!partidoId) { setPartido(null); return; }
    const unsub = onSnapshot(doc(db,'partidos',partidoId), (snap) => {
      setPartido(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setErrorCarga(null);
    }, (err) => setErrorCarga(mensajeErrorCarga(err, 'el partido')));
    return unsub;
  }, [partidoId]);

  useEffect(() => {
    if (!partidoId) { setSets({}); return; }
    const q = query(collection(db,'partidos',partidoId,'sets'), orderBy('__name__'));
    const unsub = onSnapshot(q, (snap) => {
      const next = {};
      snap.forEach((d) => { next[d.id] = { id: d.id, ...d.data() }; });
      setSets(next);
      setErrorCarga(null);
    }, (err) => setErrorCarga(mensajeErrorCarga(err, 'los sets del partido')));
    return unsub;
  }, [partidoId]);

  const fase = useMemo(() => {
    if (!partido) return null;
    const set1 = sets['1'], set2 = sets['2'];
    if (!set1) return { kind:'alineacion', n:'1' };
    if (set1.estado === 'en_curso') return { kind:'captura', n:'1', set:set1 };
    if (!set2) return { kind:'alineacion', n:'2' };
    if (set2.estado === 'en_curso') return { kind:'captura', n:'2', set:set2 };
    return { kind:'resumen' };
  }, [partido, sets]);

  const tieneControl = partido?.capturando?.uid === authUser.uid;
  const controlDeOtra = !!partido?.capturando && !tieneControl &&
    (Date.now() - partido.capturando.desde.toMillis()) < CONTROL_STALE_MS;

  useEffect(() => {
    if (!partido || tieneControl || controlDeOtra || reclamando) return;
    setReclamando(true);
    tomarControl(partidoId, authUser).finally(() => setReclamando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partido?.id, tieneControl, controlDeOtra]);

  async function tomarControlManual() {
    setReclamando(true);
    try { await tomarControl(partidoId, authUser); } finally { setReclamando(false); }
  }

  function volver() {
    setPartidoId(null);
    onCambiarPartido?.(null);
  }

  // Eventos del set en_curso -- único listener activo a la vez, se
  // desmonta con el componente CapturaEnVivo al cambiar de fase.
  const [eventos, setEventos] = useState([]);
  useEffect(() => {
    if (fase?.kind !== 'captura') { setEventos([]); return; }
    const q = query(collection(db,'partidos',partidoId,'sets',fase.n,'eventos'), orderBy('orden','asc'));
    const unsub = onSnapshot(q, (snap) => {
      setEventos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setErrorCarga(null);
    }, (err) => setErrorCarga(mensajeErrorCarga(err, 'los eventos del set')));
    return unsub;
  }, [partidoId, fase?.kind, fase?.n]);

  if (!partidoId) {
    return <SeleccionPartido onSeleccionar={(id) => { setPartidoId(id); onCambiarPartido?.(id); }} />;
  }
  if (errorCarga) {
    return (
      <div style={{ textAlign:'center',color:AUSENTE,padding:'20px 0',border:`1px dashed ${AUSENTE}`,borderRadius:12 }}>
        {errorCarga}
      </div>
    );
  }
  if (!partido || !fase) {
    return <div style={{ color:MUTED,fontSize:13,padding:'12px 0' }}>Cargando…</div>;
  }

  return (
    <div>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8 }}>
        <div style={{ fontSize:13,color:MUTED }}>
          <button onClick={volver} style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12,textDecoration:'underline',padding:0,marginRight:8 }}>← Otro partido</button>
          {nombrePartido(partido)}
        </div>
      </div>

      {controlDeOtra && (
        <div style={{ background:'#FBF2E3',border:'1px solid #E8CFA0',color:'#8A5A1E',borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:13,display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap' }}>
          <span>{partido.capturando.nombre || 'Otra persona'} está capturando este partido — estás en solo lectura.</span>
          <button onClick={tomarControlManual} disabled={reclamando}
            style={{ padding:'6px 12px',borderRadius:6,border:'none',background:'#8A5A1E',color:'white',fontSize:12,cursor:reclamando?'default':'pointer' }}>
            Tomar control
          </button>
        </div>
      )}

      {fase.kind === 'alineacion' && (
        <AlineacionSet partidoId={partidoId} n={fase.n} partido={partido} roster={roster} puedeEditar={tieneControl}
          setAnterior={fase.n === '2' ? sets['1'] : undefined} />
      )}
      {fase.kind === 'captura' && (
        <CapturaEnVivo partidoId={partidoId} n={fase.n} set={fase.set} eventos={eventos} roster={roster} authUser={authUser} puedeEditar={tieneControl} />
      )}
      {fase.kind === 'resumen' && (
        <div style={{ background:'white',border:`1px solid ${LINE}`,borderRadius:12,padding:'20px 20px 24px' }}>
          <h3 style={{ margin:'0 0 14px',fontSize:16,fontWeight:700 }}>Partido registrado</h3>
          <ResumenPartido partidoId={partidoId} roster={roster} />
          <button onClick={volver} style={{ marginTop:14,padding:'8px 14px',borderRadius:8,border:'none',background:INK,color:PAPER,fontSize:13,cursor:'pointer' }}>
            Volver a la lista
          </button>
        </div>
      )}
    </div>
  );
}
