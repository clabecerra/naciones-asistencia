import { useEffect, useMemo, useState } from 'react';
import { Play, Pause, Undo2 } from 'lucide-react';
import { updateDoc, Timestamp } from 'firebase/firestore';
import { INK, PAPER, LINE, MUTED, PRESENTE, AUSENTE } from '../../theme';
import { CASILLAS } from '../../utils/casillas';
import { estadoDelSet } from '../../utils/setReducer';
import { segundosTranscurridos, minutoActual, iniciarReloj, pausarReloj, formatoReloj } from '../../utils/reloj';
import { setRef, crearEvento, deshacerUltimoEvento, cerrarSet, resincronizarSet } from '../../utils/eventos';

function mensajeError(e, accion) {
  if (e?.code === 'permission-denied') {
    return accion === 'deshacer'
      ? 'El contador del set se desincronizó y el servidor rechazó el deshacer.'
      : 'El contador del set se desincronizó y el servidor rechazó la jugada.';
  }
  return accion === 'deshacer' ? 'No se pudo deshacer la jugada.' : 'No se pudo registrar la jugada.';
}

export function CapturaEnVivo({ partidoId, n, set, eventos, roster, authUser, puedeEditar, hayEscriturasPendientes }) {
  const [accionJugadora, setAccionJugadora] = useState(null); // { id, dentro }
  const [pendienteEmbRival, setPendienteEmbRival] = useState(null); // jugadoraId en espera del toggle
  const [escribiendo, setEscribiendo] = useState(false);
  const [writeError, setWriteError] = useState(null);
  const [recuperando, setRecuperando] = useState(false);
  const [cierre, setCierre] = useState(null); // { motivo, equipo, rival }
  const [, forceTick] = useState(0);
  const [destellos, setDestellos] = useState([]); // [{key, targetId}] -- confirmación visual, transitoria
  const [ultimaAccion, setUltimaAccion] = useState(null); // {texto} -- indicador permanente

  const estado = useMemo(() => estadoDelSet(eventos, set), [eventos, set]);
  const bloqueado = !puedeEditar || escribiendo || !!writeError;
  // Sin reloj iniciado no hay minuto que anotar en el evento -- se puede
  // deshacer o terminar el set (por si el set se creó de más), pero no
  // registrar jugadas ni hacer entrar a una embajadora.
  const relojNoIniciado = !set.horaInicio;
  const noPuedeRegistrar = bloqueado || relojNoIniciado;

  function nombre(id) {
    const j = roster.find((x) => x.id === id);
    return j ? `${j.nombre} ${j.apellido}`.trim() : '';
  }

  // Texto corto ("quién y qué") y a quién le corresponde el destello, a
  // partir de los mismos datos que ya arma cada acción -- una sola fuente
  // para el indicador permanente y para el destello, sin repetir la
  // lógica en cada botón.
  function describirEvento(ev) {
    if (ev.tipo === 'lanzamiento') {
      const jugadoraId = ev.lanzadora !== 'RIVAL' ? ev.lanzadora : ev.receptora;
      const verbo = ev.resultado === 'recepcion' ? 'atrapó' : (ev.lanzadora === 'RIVAL' ? 'la quemaron' : 'quemó');
      return { targetId: jugadoraId, texto: `${nombre(jugadoraId)}: ${verbo}` };
    }
    if (ev.tipo === 'ingreso_embajadora') {
      return ev.equipo === 'nuestro'
        ? { targetId: set.embajadoraId, texto: 'Entró la embajadora' }
        : { targetId: 'entrada-embajadora-rival', texto: 'Entró la embajadora rival' };
    }
    if (ev.tipo === 'pase_incompleto') return { targetId: 'pase_incompleto', texto: 'Pase incompleto' };
    if (ev.tipo === 'tiro_atrapado') return { targetId: 'tiro_atrapado', texto: 'Tiro atrapado' };
    return { targetId: null, texto: '' };
  }

  // Destello y texto quedan al tiro, sin esperar la escritura -- en
  // ráfagas, cada toque tiene que confirmarse solo, sin que el anterior
  // bloquee ni tape nada. Un fallo real de todos modos se ve aparte, en
  // el banner de error.
  function marcarFeedback(targetId, texto) {
    if (!targetId) return;
    const key = `${Date.now()}-${Math.random()}`;
    setDestellos((prev) => [...prev, { key, targetId }]);
    setTimeout(() => setDestellos((prev) => prev.filter((d) => d.key !== key)), 650);
    setUltimaAccion({ texto });
  }

  async function commit(eventoData) {
    const { targetId, texto } = describirEvento(eventoData);
    marcarFeedback(targetId, texto);
    setEscribiendo(true);
    try {
      await crearEvento(partidoId, n, set.ultimoOrden || 0, {
        minuto: minutoActual(set),
        registradoPor: authUser.uid,
        partidoTipo: set.tipo,
        competenciaId: set.competenciaId || '',
        ...eventoData,
      });
      setAccionJugadora(null);
      setPendienteEmbRival(null);
      setWriteError(null);
    } catch (e) {
      setWriteError({ accion: 'registrar', mensaje: mensajeError(e, 'registrar') });
    } finally { setEscribiendo(false); }
  }

  function elegirAccion(tipoAccion) {
    if (!accionJugadora || bloqueado) return;
    const id = accionJugadora.id;
    if (tipoAccion === 'quemoRival') {
      const puedeSerEmbajadora = set.rivalEnCancha?.embajadora && estado.embajadoraRivalDentro && !estado.embajadoraRivalFuera;
      if (puedeSerEmbajadora) { setPendienteEmbRival(id); return; }
      commit({ tipo:'lanzamiento', lanzadora:id, receptora:'RIVAL', resultado:'quemada', objetivoEmbajadora:false });
      return;
    }
    if (tipoAccion === 'laQuemaron') {
      commit({ tipo:'lanzamiento', lanzadora:'RIVAL', receptora:id, resultado:'quemada' });
    } else if (tipoAccion === 'atrapoRival') {
      commit({ tipo:'lanzamiento', lanzadora:'RIVAL', receptora:id, resultado:'recepcion' });
    }
  }

  function confirmarObjetivoEmbajadora(esEmbajadora) {
    if (!pendienteEmbRival) return;
    commit({ tipo:'lanzamiento', lanzadora:pendienteEmbRival, receptora:'RIVAL', resultado:'quemada', objetivoEmbajadora:esEmbajadora });
  }

  async function ingresarEmbajadora(equipo) {
    if (bloqueado) return;
    await commit({ tipo:'ingreso_embajadora', equipo });
  }

  // Grupales, de un solo toque, sin jugadora asociada -- ninguno cuesta
  // vidas (setReducer.js las ignora, no son 'lanzamiento' con
  // resultado:'quemada'). Reemplazan a "le atraparon el lanzamiento" como
  // acción individual y agregan "pase incompleto", que no existía antes.
  async function registrarGrupal(tipo) {
    if (noPuedeRegistrar) return;
    await commit({ tipo });
  }

  async function deshacer() {
    if (bloqueado || eventos.length === 0) return;
    setEscribiendo(true);
    const ultimo = eventos[eventos.length - 1];
    try {
      await deshacerUltimoEvento(partidoId, n, ultimo.id, set.ultimoOrden || 0);
      setWriteError(null);
    } catch (e) {
      setWriteError({ accion: 'deshacer', mensaje: mensajeError(e, 'deshacer') });
    } finally { setEscribiendo(false); }
  }

  async function recuperar() {
    setRecuperando(true);
    try {
      await resincronizarSet(partidoId, n);
      setWriteError(null);
    } catch {
      setWriteError({ accion:'recuperar', mensaje:'No se pudo recargar. Revisa la conexión e intenta de nuevo.' });
    } finally { setRecuperando(false); }
  }

  async function alternarReloj() {
    if (!puedeEditar) return;
    try {
      if (set.relojEstado === 'corriendo') {
        await updateDoc(setRef(partidoId, n), pausarReloj(set));
      } else {
        const payload = iniciarReloj();
        if (!set.horaInicio) payload.horaInicio = Timestamp.now();
        await updateDoc(setRef(partidoId, n), payload);
      }
    } catch {
      setWriteError({ accion:'reloj', mensaje:'No se pudo actualizar el reloj. Intenta de nuevo.' });
    }
  }

  function abrirCierre(motivoSugerido) {
    setCierre({ motivo: motivoSugerido, equipo: String(estado.vidasEquipo), rival: String(estado.vidasRival) });
  }

  async function confirmarCierre() {
    if (!cierre) return;
    setEscribiendo(true);
    try {
      const relojCongelado = pausarReloj(set);
      await cerrarSet(partidoId, n, {
        estado: 'cerrado',
        horaTermino: Timestamp.now(),
        motivoTermino: cierre.motivo,
        ...relojCongelado,
        relojEstado: 'detenido',
      }, {
        equipo: Number(cierre.equipo) || 0,
        rival: Number(cierre.rival) || 0,
      }, n === '2');
      setCierre(null);
      setWriteError(null);
    } catch {
      setWriteError({ accion:'cerrar', mensaje:'No se pudo cerrar el set. Intenta de nuevo.' });
    } finally { setEscribiendo(false); }
  }

  // Refresca el reloj visible cada segundo mientras corre.
  useEffect(() => {
    if (set.relojEstado !== 'corriendo') return;
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [set.relojEstado]);

  const noCoincide = cierre && (Number(cierre.equipo) !== estado.vidasEquipo || Number(cierre.rival) !== estado.vidasRival);
  const yaEntroEmbajadoraPropia = noPuedeRegistrar || estado.embajadoraDentro;
  const yaEntroEmbajadoraRival = noPuedeRegistrar || estado.embajadoraRivalDentro;

  // Celdas fijas: misma posición y orden que la pantalla de alineación,
  // siempre -- una jugadora nunca desaparece de su casilla ni hace que las
  // demás se corran al quemarse; solo cambia de estilo (dentro/fuera). Es
  // más fácil anotar sobre un tablero que no se reordena.
  // Destellos activos para un target -- pueden ser varios superpuestos si
  // se vuelve a tocar antes de que termine de desvanecerse el anterior.
  function destelloDe(targetId) {
    return destellos.filter((d) => d.targetId === targetId).map((d) => <span key={d.key} className="destello" />);
  }

  function celda(id, etiqueta) {
    if (!id) {
      return <div key={etiqueta} style={{ border:`1px dashed ${LINE}`,borderRadius:10,padding:'10px 14px',opacity:0.4 }}>
        <div style={{ fontSize:10,fontWeight:700,color:MUTED }}>{etiqueta}</div>
      </div>;
    }
    const dentro = estado.enCancha.has(id);
    return (
      <button key={id} onClick={()=>setAccionJugadora({ id, dentro })} disabled={noPuedeRegistrar}
        style={{ position:'relative',overflow:'hidden',padding:'10px 14px',borderRadius:10,textAlign:'left',
          border:`1px solid ${dentro?PRESENTE:LINE}`,background:dentro?'#EAF2EC':'#F5F4F1',
          cursor:noPuedeRegistrar?'default':'pointer',opacity:noPuedeRegistrar?0.6:1 }}>
        {destelloDe(id)}
        <div style={{ fontSize:10,fontWeight:700,color:dentro?PRESENTE:MUTED }}>{etiqueta}</div>
        <div style={{ fontSize:13,fontWeight:600,color:dentro?INK:MUTED,textDecoration:dentro?'none':'line-through' }}>{nombre(id)}</div>
      </button>
    );
  }

  function celdaEmbajadora() {
    const id = set.embajadoraId;
    if (!id) return <div />;
    // Parte fuera, pero fuera ya puede quemar (conserva las dos acciones
    // ofensivas, igual que cualquier jugadora fuera) -- entrar es una
    // acción aparte, no un requisito para poder registrarle una jugada.
    const puedeEntrar = !estado.embajadoraDentro;
    const dentro = estado.embajadoraDentro && !estado.embajadoraFuera;
    return (
      <div>
        <button onClick={()=>setAccionJugadora({ id, dentro })} disabled={noPuedeRegistrar}
          style={{ position:'relative',overflow:'hidden',width:'100%',padding:'10px 14px',borderRadius:10,textAlign:'left',
            border:`1px solid ${dentro?PRESENTE:LINE}`,background:dentro?'#EAF2EC':'#F5F4F1',
            cursor:noPuedeRegistrar?'default':'pointer',opacity:noPuedeRegistrar?0.6:1 }}>
          {destelloDe(id)}
          <div style={{ fontSize:10,fontWeight:700,color:dentro?PRESENTE:MUTED }}>EMB</div>
          <div style={{ fontSize:13,fontWeight:600,color:dentro?INK:MUTED,textDecoration:(!dentro && !puedeEntrar)?'line-through':'none' }}>{nombre(id)}</div>
        </button>
      </div>
    );
  }

  return (
    <div style={{ background:'white',border:`1px solid ${LINE}`,borderRadius:12,padding:'20px 20px 24px' }}>
      {/* Destello: menos de un segundo, no bloquea nada -- cada uno se
          monta y se borra solo (ver marcarFeedback), así que un toque
          nuevo sobre el mismo botón no tiene que esperar al anterior. */}
      <style>{`
        @keyframes destello-pop { 0%{opacity:0.85;transform:scale(0.92);} 100%{opacity:0;transform:scale(1.18);} }
        .destello { position:absolute; inset:0; border-radius:inherit; background:${PRESENTE};
          pointer-events:none; animation:destello-pop 0.6s ease-out forwards; }
      `}</style>
      {/* MARCADOR + RELOJ */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,marginBottom:14 }}>
        <div style={{ display:'flex',gap:20 }}>
          <div>
            <div style={{ fontSize:11,color:MUTED }}>Nosotras</div>
            <div style={{ fontSize:28,fontWeight:700,color:INK,fontFamily:'monospace' }}>{estado.vidasEquipo}</div>
          </div>
          <div>
            <div style={{ fontSize:11,color:MUTED }}>Rival</div>
            <div style={{ fontSize:28,fontWeight:700,color:AUSENTE,fontFamily:'monospace' }}>{estado.vidasRival}</div>
          </div>
        </div>
        <button onClick={alternarReloj} disabled={!puedeEditar}
          style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 16px',borderRadius:10,border:`1px solid ${LINE}`,
            background:set.relojEstado==='corriendo'?'#EAF2EC':'white',cursor:puedeEditar?'pointer':'default' }}>
          {set.relojEstado==='corriendo' ? <Pause size={16}/> : <Play size={16}/>}
          <span style={{ fontFamily:'monospace',fontSize:18,fontWeight:700 }}>{formatoReloj(segundosTranscurridos(set))}</span>
        </button>
        <button onClick={deshacer} disabled={bloqueado || eventos.length===0}
          style={{ display:'flex',alignItems:'center',gap:6,padding:'10px 16px',borderRadius:10,border:`1px solid ${AUSENTE}`,
            background:'#F6E9E6',color:AUSENTE,cursor:(bloqueado||eventos.length===0)?'default':'pointer',
            opacity:(bloqueado||eventos.length===0)?0.5:1,fontWeight:700 }}>
          <Undo2 size={16}/> Deshacer
        </button>
      </div>

      {/* Indicador permanente: qué fue lo último registrado, para saber
          dónde se quedó sin tener que haber estado mirando la pantalla. */}
      {(ultimaAccion || hayEscriturasPendientes) && (
        <div style={{ display:'flex',alignItems:'center',gap:8,fontSize:12,color:MUTED,marginBottom:10 }}>
          {ultimaAccion && <span>Última: <strong style={{ color:INK }}>{ultimaAccion.texto}</strong></span>}
          {/* Discreto a propósito: no es un error ni bloquea nada, solo
              informa que la jugada quedó en cola. No depende de
              ultimaAccion (ese estado se pierde si se recarga la página,
              las escrituras pendientes no) y no debe competir con el
              destello de cada botón (ver marcarFeedback), por eso vive acá
              y no sobre el tablero. */}
          {hayEscriturasPendientes && (
            <span style={{ display:'flex',alignItems:'center',gap:4,color:'#8A5A1E' }}>
              <span style={{ width:6,height:6,borderRadius:'50%',background:'#8A5A1E',flexShrink:0 }} />
              Sincronizando…
            </span>
          )}
        </div>
      )}

      {relojNoIniciado && (
        <div style={{ background:'#F6E9E6',border:`1px solid ${AUSENTE}`,color:AUSENTE,borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:13,fontWeight:600 }}>
          El reloj no ha comenzado — inícialo antes de registrar jugadas.
        </div>
      )}

      {writeError && (
        <div style={{ background:'#F6E9E6',border:`1px solid ${AUSENTE}`,color:AUSENTE,borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:13 }}>
          <div style={{ marginBottom:8 }}>{writeError.mensaje}</div>
          <button onClick={recuperar} disabled={recuperando}
            style={{ padding:'6px 12px',borderRadius:6,border:'none',background:AUSENTE,color:'white',fontSize:12,cursor:recuperando?'default':'pointer' }}>
            {recuperando ? 'Recargando…' : 'Recargar y reintentar'}
          </button>
        </div>
      )}

      {estado.setTerminado && !cierre && (
        <div style={{ background:'#FBF2E3',border:'1px solid #E8CFA0',color:'#8A5A1E',borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:13,display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap' }}>
          <span>Set terminado por vidas agotadas ({estado.setTerminado==='vidas_equipo'?'nosotras':'rival'} en 0).</span>
          <button onClick={()=>abrirCierre('vidas_agotadas')} disabled={bloqueado}
            style={{ padding:'6px 12px',borderRadius:6,border:'none',background:'#8A5A1E',color:'white',fontSize:12,cursor:bloqueado?'default':'pointer' }}>
            Cerrar set
          </button>
        </div>
      )}

      {/* Entra embajadora propia: justo arriba de su nombre, ancho
          completo (igual que el resto de los botones de esta pantalla).
          Siempre visible -- mismo criterio que el tablero, no se oculta
          ni corre nada -- solo se apaga una vez que ya entró. */}
      <button onClick={()=>ingresarEmbajadora('nuestro')} disabled={yaEntroEmbajadoraPropia}
        style={{ position:'relative',overflow:'hidden',display:'block',width:'100%',maxWidth:420,marginBottom:8,
          padding:'10px 14px',borderRadius:10,border:`1px dashed ${INK}`,background:yaEntroEmbajadoraPropia?'#F5F4F1':'white',
          color:yaEntroEmbajadoraPropia?MUTED:INK,fontSize:13,fontWeight:600,cursor:yaEntroEmbajadoraPropia?'default':'pointer',opacity:yaEntroEmbajadoraPropia?0.6:1 }}>
        {destelloDe(set.embajadoraId)}
        Entra embajadora propia
      </button>

      {/* Tablero fijo: misma posición y orden que la alineación. Gris/
          tachado cuando está fuera, pero nunca desaparece ni se corre. */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:8,maxWidth:420,marginBottom:8 }}>
        <div />{celdaEmbajadora()}<div />
      </div>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:8,maxWidth:420,marginBottom:14 }}>
        {CASILLAS.map((c) => celda(set.alineacion?.[c], c))}
      </div>

      {/* Entra embajadora rival: mismo texto, mismo ancho, mismo criterio
          de apagado -- pero sin cancha propia donde anclarla, se queda
          junto a los grupales. */}
      <button onClick={()=>ingresarEmbajadora('rival')} disabled={yaEntroEmbajadoraRival}
        style={{ position:'relative',overflow:'hidden',display:'block',width:'100%',maxWidth:420,marginBottom:14,
          padding:'10px 14px',borderRadius:10,border:`1px dashed ${AUSENTE}`,background:yaEntroEmbajadoraRival?'#F5F4F1':'white',
          color:yaEntroEmbajadoraRival?MUTED:AUSENTE,fontSize:13,fontWeight:600,cursor:yaEntroEmbajadoraRival?'default':'pointer',opacity:yaEntroEmbajadoraRival?0.6:1 }}>
        {destelloDe('entrada-embajadora-rival')}
        Entra embajadora rival
      </button>

      {/* Grupales: un solo toque, sin elegir jugadora -- para no perder
          el ritmo del juego. */}
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14,maxWidth:420 }}>
        <button onClick={()=>registrarGrupal('pase_incompleto')} disabled={noPuedeRegistrar}
          style={{ position:'relative',overflow:'hidden',padding:'14px 10px',borderRadius:10,border:`1px solid ${AUSENTE}`,background:noPuedeRegistrar?'#F5F4F1':'white',
            color:noPuedeRegistrar?MUTED:AUSENTE,fontSize:14,fontWeight:700,cursor:noPuedeRegistrar?'default':'pointer',opacity:noPuedeRegistrar?0.6:1 }}>
          {destelloDe('pase_incompleto')}
          Pase incompleto
        </button>
        <button onClick={()=>registrarGrupal('tiro_atrapado')} disabled={noPuedeRegistrar}
          style={{ position:'relative',overflow:'hidden',padding:'14px 10px',borderRadius:10,border:`1px solid ${AUSENTE}`,background:noPuedeRegistrar?'#F5F4F1':'white',
            color:noPuedeRegistrar?MUTED:AUSENTE,fontSize:14,fontWeight:700,cursor:noPuedeRegistrar?'default':'pointer',opacity:noPuedeRegistrar?0.6:1 }}>
          {destelloDe('tiro_atrapado')}
          Tiro atrapado
        </button>
      </div>

      <div>
        <button onClick={()=>abrirCierre('tiempo_cumplido')} disabled={bloqueado}
          style={{ padding:'8px 14px',borderRadius:8,border:`1px solid ${LINE}`,background:'white',color:INK,fontSize:12,cursor:bloqueado?'default':'pointer' }}>
          Terminar set
        </button>
      </div>

      {/* HOJA DE ACCIÓN */}
      {accionJugadora && !pendienteEmbRival && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:10 }}
          onClick={()=>setAccionJugadora(null)}>
          <div onClick={(e)=>e.stopPropagation()} style={{ background:'white',borderRadius:'16px 16px 0 0',padding:20,width:'100%',maxWidth:420 }}>
            <div style={{ fontSize:15,fontWeight:700,marginBottom:12 }}>{nombre(accionJugadora.id)}</div>
            {/* Quemar: izquierda ella lo hizo (verde), derecha se lo
                hicieron (rojo). Atrapó, abajo, sola -- "le atraparon" se
                sacó de acá, ahora es el grupal "Tiro atrapado" en la
                pantalla principal. La quemaron/atrapó necesitan cancha. */}
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8 }}>
              <button onClick={()=>elegirAccion('quemoRival')} style={botonSheet(PRESENTE)}>Quemó</button>
              <button onClick={()=>elegirAccion('laQuemaron')} disabled={!accionJugadora.dentro} style={botonSheet(AUSENTE,!accionJugadora.dentro)}>La quemaron</button>
            </div>
            <button onClick={()=>elegirAccion('atrapoRival')} disabled={!accionJugadora.dentro}
              style={{ ...botonSheet(PRESENTE,!accionJugadora.dentro), width:'100%' }}>Atrapó</button>
            <button onClick={()=>setAccionJugadora(null)} style={{ marginTop:12,border:'none',background:'none',color:MUTED,fontSize:13,cursor:'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      {pendienteEmbRival && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:11 }}>
          <div style={{ background:'white',borderRadius:12,padding:20,width:'90%',maxWidth:340,textAlign:'center' }}>
            <div style={{ fontSize:14,fontWeight:600,marginBottom:14 }}>¿Era la embajadora rival?</div>
            <div style={{ display:'flex',gap:10,justifyContent:'center' }}>
              <button onClick={()=>confirmarObjetivoEmbajadora(true)} style={botonSheet(PRESENTE)}>Sí</button>
              <button onClick={()=>confirmarObjetivoEmbajadora(false)} style={botonSheet(MUTED)}>No</button>
            </div>
          </div>
        </div>
      )}

      {/* CIERRE DE SET */}
      {cierre && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:12 }}>
          <div style={{ background:'white',borderRadius:12,padding:20,width:'90%',maxWidth:360 }}>
            <div style={{ fontSize:15,fontWeight:700,marginBottom:10 }}>Cerrar set {n}</div>
            <p style={{ fontSize:12,color:MUTED,margin:'0 0 12px' }}>Resultado oficial (vidas restantes dictadas por el árbitro):</p>
            <div style={{ display:'flex',gap:10,marginBottom:10 }}>
              <label style={{ fontSize:12,color:INK }}>Nosotras
                <input type="number" min={0} value={cierre.equipo} onChange={(e)=>setCierre({ ...cierre, equipo:e.target.value })}
                  style={{ display:'block',width:70,marginTop:4,padding:'6px 8px',borderRadius:6,border:`1px solid ${LINE}` }} />
              </label>
              <label style={{ fontSize:12,color:INK }}>Rival
                <input type="number" min={0} value={cierre.rival} onChange={(e)=>setCierre({ ...cierre, rival:e.target.value })}
                  style={{ display:'block',width:70,marginTop:4,padding:'6px 8px',borderRadius:6,border:`1px solid ${LINE}` }} />
              </label>
            </div>
            {noCoincide && (
              <p style={{ fontSize:12,color:'#8A5A1E',margin:'0 0 12px' }}>
                No coincide con lo calculado en vivo ({estado.vidasEquipo} / {estado.vidasRival}).
              </p>
            )}
            <div style={{ display:'flex',gap:8 }}>
              <button onClick={confirmarCierre} disabled={escribiendo}
                style={{ padding:'8px 14px',borderRadius:8,border:'none',background:INK,color:PAPER,fontSize:13,cursor:escribiendo?'default':'pointer' }}>
                Confirmar cierre
              </button>
              <button onClick={()=>setCierre(null)} disabled={escribiendo}
                style={{ border:'none',background:'none',color:MUTED,fontSize:13,cursor:'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function botonSheet(color, disabled) {
  return {
    padding:'16px 10px', borderRadius:8, fontSize:15, fontWeight:700, textAlign:'center',
    border:`1px solid ${disabled?LINE:color}`, background:disabled?'#F5F4F1':'white', color:disabled?MUTED:color,
    cursor:disabled?'default':'pointer', opacity:disabled?0.6:1,
  };
}
