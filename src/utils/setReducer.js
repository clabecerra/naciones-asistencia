// Repasa los eventos de un set, en orden, y devuelve el estado derivado
// actual. El estado del juego nunca se guarda aparte: se recalcula siempre
// desde acá. Eso es lo que hace seguro el deshacer (borrar el último evento
// y volver a calcular) sin duplicar la lógica de vidas en dos lugares.
//
// Mecánica de vidas (PLAN.md §5): cada jugadora regular vale 1 vida — una
// quemada la elimina y la marca "fuera" al instante. La embajadora (propia
// o rival) vale 2 vidas propias: la primera quemada le quita una sin
// eliminarla, la segunda la elimina. Una jugadora "fuera" conserva sus dos
// acciones ofensivas (puede seguir quemando desde afuera) y pierde las dos
// defensivas — eso lo decide quien arma los botones en pantalla, no este
// reductor.
export function estadoDelSet(eventos, set) {
  const alineacionIds = Object.values(set?.alineacion || {}).filter(Boolean);
  const fuera = new Set();
  let vidasEquipo = set?.vidasInicialesEquipo ?? 0;
  let vidasRival = set?.vidasInicialesRival ?? 0;
  let embajadoraDentro = false;
  let embajadoraVidas = 2;
  let embajadoraRivalDentro = false;
  let embajadoraRivalVidas = 2;

  for (const ev of eventos) {
    if (ev.tipo === 'ingreso_embajadora') {
      if (ev.equipo === 'nuestro') embajadoraDentro = true;
      else if (ev.equipo === 'rival') embajadoraRivalDentro = true;
      continue;
    }
    if (ev.tipo !== 'lanzamiento' || ev.resultado !== 'quemada') continue;

    if (ev.receptora === 'RIVAL') {
      vidasRival = Math.max(0, vidasRival - 1);
      if (ev.objetivoEmbajadora) embajadoraRivalVidas = Math.max(0, embajadoraRivalVidas - 1);
    } else if (ev.receptora) {
      vidasEquipo = Math.max(0, vidasEquipo - 1);
      if (set?.embajadoraId && ev.receptora === set.embajadoraId) {
        embajadoraVidas = Math.max(0, embajadoraVidas - 1);
        if (embajadoraVidas === 0) fuera.add(ev.receptora);
      } else {
        fuera.add(ev.receptora);
      }
    }
  }

  const embajadoraFuera = !!set?.embajadoraId && fuera.has(set.embajadoraId);
  const embajadoraRivalFuera = embajadoraRivalVidas === 0;

  const enCancha = new Set(alineacionIds.filter((id) => !fuera.has(id)));
  if (embajadoraDentro && !embajadoraFuera && set?.embajadoraId) enCancha.add(set.embajadoraId);

  let setTerminado = null;
  if (vidasEquipo === 0) setTerminado = 'vidas_equipo';
  else if (vidasRival === 0) setTerminado = 'vidas_rival';

  return {
    vidasEquipo, vidasRival, fuera, enCancha,
    embajadoraDentro, embajadoraFuera, embajadoraVidas,
    embajadoraRivalDentro, embajadoraRivalFuera, embajadoraRivalVidas,
    setTerminado,
  };
}
