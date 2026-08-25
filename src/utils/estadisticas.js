export function getStats(asistencia, jugadoraId, ents) {
  let presente = 0, ausente = 0;
  ents.forEach((ent) => {
    const v = asistencia[ent.id]?.[jugadoraId]?.estado;
    if (v==='presente') presente++; else if (v==='ausente') ausente++;
  });
  const marked = presente+ausente;
  return { presente, ausente, pct: marked ? Math.round((presente/marked)*100) : null };
}
