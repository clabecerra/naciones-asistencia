import { describe, it, expect } from 'vitest';
import { estaEnFormacion } from './formacion';

describe('estaEnFormacion', () => {
  it('es falso si el partido no tiene formación previa cargada', () => {
    expect(estaEnFormacion({}, 'ana')).toBe(false);
    expect(estaEnFormacion({ formacionPrevia: null }, 'ana')).toBe(false);
  });

  it('es verdadero si está asignada a una casilla', () => {
    const partido = { formacionPrevia: { alineacion: { DC: 'ana' } } };
    expect(estaEnFormacion(partido, 'ana')).toBe(true);
  });

  it('es verdadero si es la embajadora, aunque no ocupe casilla', () => {
    const partido = { formacionPrevia: { alineacion: {}, embajadoraId: 'ana' } };
    expect(estaEnFormacion(partido, 'ana')).toBe(true);
  });

  it('es falso si no aparece ni en casillas ni como embajadora', () => {
    const partido = { formacionPrevia: { alineacion: { DC: 'beti' }, embajadoraId: 'carla' } };
    expect(estaEnFormacion(partido, 'ana')).toBe(false);
  });

  it('no revienta si formacionPrevia está vacío o sin alineacion', () => {
    expect(estaEnFormacion({ formacionPrevia: {} }, 'ana')).toBe(false);
  });

  it('es falso si no se pasa jugadoraId', () => {
    const partido = { formacionPrevia: { alineacion: { DC: 'ana' } } };
    expect(estaEnFormacion(partido, '')).toBe(false);
    expect(estaEnFormacion(partido, undefined)).toBe(false);
  });
});
