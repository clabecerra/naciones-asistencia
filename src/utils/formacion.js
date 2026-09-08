// Si una jugadora está asignada en la formación previa del partido -- en
// una casilla o de embajadora. Se usa para avisar antes de sacarla de la
// nómina: la formación quedaría apuntando a alguien que ya no juega.
export function estaEnFormacion(partido, jugadoraId) {
  const f = partido?.formacionPrevia;
  if (!f || !jugadoraId) return false;
  const enFormacion = [...Object.values(f.alineacion || {}), f.embajadoraId].filter(Boolean);
  return enFormacion.includes(jugadoraId);
}
