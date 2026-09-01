// Texto corto de un evento -- para el registro cronológico del resumen.
// `embajadoraId` es la del set al que pertenece el evento (no vive en el
// evento mismo, solo en el documento del set).
export function describirEvento(ev, embajadoraId) {
  if (ev.tipo === 'lanzamiento') {
    const jugadoraId = ev.lanzadora !== 'RIVAL' ? ev.lanzadora : ev.receptora;
    const verbo = ev.resultado === 'recepcion' ? 'Atrapó' : (ev.lanzadora === 'RIVAL' ? 'La quemaron' : 'Quemó');
    return { jugadoraId, verbo };
  }
  if (ev.tipo === 'ingreso_embajadora') {
    return ev.equipo === 'nuestro'
      ? { jugadoraId: embajadoraId, verbo: 'Entró a la cancha' }
      : { jugadoraId: null, verbo: 'Entró la embajadora rival' };
  }
  if (ev.tipo === 'pase_incompleto') return { jugadoraId: null, verbo: 'Pase incompleto' };
  if (ev.tipo === 'tiro_atrapado') return { jugadoraId: null, verbo: 'Tiro atrapado' };
  return { jugadoraId: null, verbo: ev.tipo };
}
