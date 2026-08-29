import { useState } from 'react';
import { INK, PAPER, LINE, MUTED, AUSENTE } from '../../theme';
import { CASILLAS } from '../../utils/casillas';
import { relojInicial } from '../../utils/reloj';
import { crearSet } from '../../utils/eventos';

const MIN_EN_CANCHA = 6;
// La embajadora siempre está, en ambos equipos -- no es opcional. Si hay
// menos de 10 disponibles, el faltante se nota en la cancha (menos
// casillas ocupadas), nunca en la embajadora. Por eso el rival se pide
// como total (en cancha + embajadora): 7 a 10, igual rango que el propio
// equipo (6 a 9 en cancha, más 1 embajadora). Vidas iniciales quedan entre
// 8 y 11, como fija PLAN.md §5.
const MIN_RIVAL = 7;
const MAX_RIVAL = 10;

export function AlineacionSet({ partidoId, n, partido, roster, puedeEditar, setAnterior }) {
  const nomina = partido.nomina || [];
  const jugadorasNomina = roster.filter((j) => nomina.includes(j.id));

  // Set 2 arranca con la misma alineación del set 1, como punto de partida
  // editable -- rara vez cambia entera de un set a otro, y así se evita
  // repetir todo el armado a mano.
  const [alineacion, setAlineacion] = useState(() => ({
    ...Object.fromEntries(CASILLAS.map((c) => [c, ''])),
    ...(setAnterior?.alineacion || {}),
  }));
  const [embajadoraId, setEmbajadoraId] = useState(() => setAnterior?.embajadoraId || '');
  const [rivalPresentes, setRivalPresentes] = useState(() => { // total, incluida su embajadora
    const presentesAnterior = setAnterior?.rivalEnCancha?.presentes;
    return presentesAnterior != null ? presentesAnterior + 1 : 10;
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const asignadas = new Set([...Object.values(alineacion).filter(Boolean), embajadoraId].filter(Boolean));
  const enCanchaCount = Object.values(alineacion).filter(Boolean).length;

  function opcionesPara(casillaActualId) {
    return jugadorasNomina.filter((j) => j.id === casillaActualId || !asignadas.has(j.id));
  }

  async function confirmar() {
    if (enCanchaCount === 0) { setError('Asigna al menos una jugadora a una casilla.'); return; }
    if (!embajadoraId) { setError('Falta asignar la embajadora — no es opcional.'); return; }
    if (rivalPresentes < MIN_RIVAL || rivalPresentes > MAX_RIVAL) {
      setError(`Cuántas presenta el rival (con embajadora incluida) tiene que ser entre ${MIN_RIVAL} y ${MAX_RIVAL}.`);
      return;
    }
    setGuardando(true);
    try {
      // La embajadora siempre está: presentes = en cancha + ella, así que
      // en cancha = presentes - 1 y vidas = (presentes - 1) + 2.
      const vidasInicialesEquipo = enCanchaCount + 2;
      const vidasInicialesRival = rivalPresentes + 1;
      await crearSet(partidoId, n, {
        alineacion,
        embajadoraId,
        rivalEnCancha: { presentes: rivalPresentes - 1, embajadora: true },
        vidasInicialesEquipo,
        vidasInicialesRival,
        estado: 'en_curso',
        horaInicio: null,
        horaTermino: null,
        motivoTermino: null,
        ultimoOrden: 0,
        ...relojInicial(),
        tipo: partido.tipo,
        competenciaId: partido.competenciaId || '',
      }, n === '1' && !partido.capturaIniciada);
      setError(null);
    } catch (e) {
      setError('No se pudo crear el set. Intenta de nuevo.');
    } finally { setGuardando(false); }
  }

  return (
    <div style={{ background:'white',border:`1px solid ${LINE}`,borderRadius:12,padding:'20px 20px 24px' }}>
      <h3 style={{ margin:'0 0 4px',fontSize:16,fontWeight:700 }}>Alineación — set {n}</h3>
      <p style={{ margin:'0 0 14px',fontSize:12,color:MUTED }}>
        Nueve casillas, solo iniciales — delante, centro, atrás. La embajadora es obligatoria y parte afuera de la cancha.
      </p>

      {/* Embajadora: arriba de DC, sola -- no es una casilla más, y es obligatoria. */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:8,maxWidth:420,marginBottom:8 }}>
        <div />
        <div style={{ border:`1.5px solid ${INK}`,borderRadius:8,padding:'6px 8px' }}>
          <div style={{ fontSize:10,fontWeight:700,color:INK,marginBottom:3 }}>EMBAJADORA</div>
          <select disabled={!puedeEditar} value={embajadoraId} onChange={(e)=>setEmbajadoraId(e.target.value)}
            style={{ width:'100%',border:'none',fontSize:12,outline:'none',background:'transparent' }}>
            <option value="">— elegir —</option>
            {opcionesPara(embajadoraId).map((j) => <option key={j.id} value={j.id}>{j.nombre} {j.apellido}</option>)}
          </select>
        </div>
        <div />
      </div>

      <div style={{ display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:8,maxWidth:420,marginBottom:6 }}>
        {CASILLAS.map((c) => (
          <div key={c} style={{ border:`1px solid ${LINE}`,borderRadius:8,padding:'6px 8px' }}>
            <div style={{ fontSize:10,fontWeight:700,color:MUTED,marginBottom:3 }}>{c}</div>
            <select disabled={!puedeEditar} value={alineacion[c]}
              onChange={(e)=>setAlineacion({ ...alineacion, [c]: e.target.value })}
              style={{ width:'100%',border:'none',fontSize:12,outline:'none',background:'transparent' }}>
              <option value="">—</option>
              {opcionesPara(alineacion[c]).map((j) => <option key={j.id} value={j.id}>{j.nombre} {j.apellido}</option>)}
            </select>
          </div>
        ))}
      </div>
      {enCanchaCount < MIN_EN_CANCHA && (
        <p style={{ fontSize:12,color:'#8A5A1E',margin:'0 0 14px' }}>
          Alerta: menos de {MIN_EN_CANCHA} jugadoras en cancha ({enCanchaCount}).
        </p>
      )}

      <div style={{ marginBottom:14 }}>
        <label style={{ fontSize:12,fontWeight:600,color:INK,display:'block',marginBottom:4 }}>
          Rival — cuántas presenta (con embajadora incluida, siempre trae)
        </label>
        <input type="number" min={MIN_RIVAL} max={MAX_RIVAL} disabled={!puedeEditar} value={rivalPresentes}
          onChange={(e)=>setRivalPresentes(Number(e.target.value)||0)}
          style={{ width:70,padding:'8px 10px',borderRadius:8,border:`1px solid ${LINE}`,fontSize:13,outline:'none' }} />
      </div>

      {error && <p style={{ fontSize:12,color:AUSENTE,margin:'0 0 14px' }}>{error}</p>}

      <button onClick={confirmar} disabled={!puedeEditar || guardando}
        style={{ padding:'10px 18px',borderRadius:8,border:'none',background:INK,color:PAPER,fontSize:14,
          cursor:(!puedeEditar||guardando)?'default':'pointer',opacity:(!puedeEditar||guardando)?0.6:1 }}>
        {guardando ? 'Creando…' : `Empezar set ${n}`}
      </button>
    </div>
  );
}
