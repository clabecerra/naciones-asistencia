// Conteos para el resumen por partido -- pasada aparte de setReducer.js,
// no reescribe la mecánica de vidas: solo cuenta lanzamientos y eventos
// grupales tal cual quedaron guardados, sobre ambos sets combinados.
export function tallarEventos(eventos) {
  const porJugadora = new Map(); // jugadoraId -> {quemadasHechas, quemadasRecibidas, recepciones}
  let paseIncompleto = 0, tiroAtrapado = 0;

  function acc(id) {
    if (!porJugadora.has(id)) porJugadora.set(id, { quemadasHechas: 0, quemadasRecibidas: 0, recepciones: 0 });
    return porJugadora.get(id);
  }

  for (const ev of eventos) {
    if (ev.tipo === 'pase_incompleto') { paseIncompleto++; continue; }
    if (ev.tipo === 'tiro_atrapado') { tiroAtrapado++; continue; }
    if (ev.tipo !== 'lanzamiento') continue;
    if (ev.receptora === 'RIVAL' && ev.resultado === 'quemada') acc(ev.lanzadora).quemadasHechas++;
    else if (ev.receptora !== 'RIVAL' && ev.resultado === 'quemada') acc(ev.receptora).quemadasRecibidas++;
    else if (ev.receptora !== 'RIVAL' && ev.resultado === 'recepcion') acc(ev.receptora).recepciones++;
  }

  return { porJugadora, paseIncompleto, tiroAtrapado };
}

// Jugadoras que estuvieron en alguna alineación (casillas o embajadora) de
// cualquiera de los dos sets -- para distinguir "jugó y le fue en cero" de
// "estaba en nómina, nunca entró". Con el registro incompleto que ya
// sabemos que tenemos, esa distinción importa: un cero ambiguo se
// malinterpreta fácil.
export function jugadorasEnFormacion(sets) {
  const ids = new Set();
  for (const set of sets) {
    Object.values(set?.alineacion || {}).forEach((id) => { if (id) ids.add(id); });
    if (set?.embajadoraId) ids.add(set.embajadoraId);
  }
  return ids;
}
