import { dateKey } from './fechas';

// "FECHA vs RIVAL (en LUGAR)" -- misma nomenclatura en todas las pantallas
// que muestran un partido. Sin rival (tipo: entrenamiento, donde el campo
// no existe en absoluto) se omite el "vs".
export function nombrePartido(p) {
  const fecha = dateKey(p.fecha.toDate());
  return p.rival ? `${fecha} vs ${p.rival} (en ${p.lugar})` : `${fecha} (en ${p.lugar})`;
}
