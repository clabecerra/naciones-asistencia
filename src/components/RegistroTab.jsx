import { useState } from 'react';
import { X, Lock, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { INK, LINE, MUTED, AUSENTE, WEEKDAY_LABELS } from '../theme';
import { monthLabel, bloqueado } from '../utils/fechas';
import { getStats } from '../utils/estadisticas';
import { Stamp } from './Stamp';

export function RegistroTab({ roster, rosterLoading, rosterError, entrenamientos, entrenamientosLoading,
  asistencia, isAdmin, authUser, activeEnt, wedEnt, sunEnt, monthDate }) {
  const [error, setError] = useState(null);

  function estaBloqueado(ent) { return bloqueado(ent) && !isAdmin; }

  async function marcar(entrenamientoId, jugadoraId) {
    const ent = entrenamientos.find((e) => e.id === entrenamientoId);
    if (!ent || ent.estado === 'suspendido' || estaBloqueado(ent)) return;
    const actual = asistencia[entrenamientoId]?.[jugadoraId]?.estado;
    const ref = doc(db,'entrenamientos',entrenamientoId,'asistencia',jugadoraId);
    try {
      if (actual === undefined) {
        await setDoc(ref, { estado:'presente', marcadoPor: authUser.uid, actualizadoEn: serverTimestamp() });
      } else if (actual === 'presente') {
        await setDoc(ref, { estado:'ausente', marcadoPor: authUser.uid, actualizadoEn: serverTimestamp() });
      } else {
        await deleteDoc(ref);
      }
      setError(null);
    } catch (e) { setError('No se pudo guardar el cambio.'); }
  }

  async function marcarVaciosComoAusentes(entrenamientoId) {
    const ent = entrenamientos.find((e) => e.id === entrenamientoId);
    if (!ent || ent.estado === 'suspendido' || estaBloqueado(ent)) return;
    const marcados = asistencia[entrenamientoId] || {};
    const faltantes = roster.filter((j) => marcados[j.id] === undefined);
    try {
      await Promise.all(faltantes.map((j) => setDoc(
        doc(db,'entrenamientos',entrenamientoId,'asistencia',j.id),
        { estado:'ausente', marcadoPor: authUser.uid, actualizadoEn: serverTimestamp() }
      )));
      setError(null);
    } catch (e) { setError('No se pudo guardar el cambio.'); }
  }

  async function alternarSuspension(entrenamientoId) {
    if (!isAdmin) return;
    const ent = entrenamientos.find((e) => e.id === entrenamientoId);
    if (!ent) return;
    try {
      await updateDoc(doc(db,'entrenamientos',entrenamientoId),
        { estado: ent.estado === 'suspendido' ? 'programado' : 'suspendido' });
    } catch (e) { setError('No se pudo actualizar el entrenamiento.'); }
  }

  function downloadExcelReport() {
    const rows = roster
      .map((j) => ({ j, wed: getStats(asistencia,j.id,wedEnt), sun: getStats(asistencia,j.id,sunEnt), general: getStats(asistencia,j.id,activeEnt) }))
      .sort((a,b) => (b.general.pct??-1)-(a.general.pct??-1))
      .map(({ j, wed, sun, general }) => ({
        'Nombre': `${j.nombre} ${j.apellido}`.trim(),
        'Miércoles - Presentes': wed.presente, 'Miércoles - Ausentes': wed.ausente, 'Miércoles - %': wed.pct??'',
        'Domingo - Presentes': sun.presente, 'Domingo - Ausentes': sun.ausente, 'Domingo - %': sun.pct??'',
        'General - Presentes': general.presente, 'General - Ausentes': general.ausente, 'General - %': general.pct??'',
      }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{wch:26},{wch:20},{wch:19},{wch:10},{wch:19},{wch:18},{wch:10},{wch:18},{wch:17},{wch:10}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estadísticas');
    XLSX.writeFile(wb, `asistencia_${monthLabel(monthDate).replace(/\s+/g,'_')}.xlsx`);
  }

  return (
    <>
        {/* TABLA REGISTRO */}
        {
          rosterLoading || entrenamientosLoading ? (
            <div style={{ textAlign:'center',color:MUTED,padding:'40px 0' }}>Cargando…</div>
          ) : rosterError ? (
            <div style={{ textAlign:'center',color:AUSENTE,padding:'40px 0',border:`1px dashed ${AUSENTE}`,borderRadius:12 }}>
              {rosterError}
            </div>
          ) : roster.length === 0 ? (
            <div style={{ textAlign:'center',color:MUTED,padding:'40px 0',border:`1px dashed ${LINE}`,borderRadius:12 }}>
              No hay jugadoras activas en el registro.
            </div>
          ) : entrenamientos.length === 0 ? (
            <div style={{ textAlign:'center',color:MUTED,padding:'40px 0',border:`1px dashed ${LINE}`,borderRadius:12 }}>
              Este mes todavía no tiene entrenamientos creados{isAdmin ? ' — usa "Crear nuevo mes" para generarlos.' : ' — pide a una administradora que los genere.'}
            </div>
          ) : (
            <>
              <div style={{ overflowX:'auto',border:`1px solid ${LINE}`,borderRadius:12,background:'white' }}>
                <table style={{ borderCollapse:'collapse',width:'100%' }}>
                  <thead>
                    <tr>
                      <th style={{ position:'sticky',left:0,zIndex:2,background:'white',textAlign:'left',padding:'10px 12px',fontSize:12,color:MUTED,fontWeight:600,borderBottom:`1px solid ${LINE}`,borderRight:`1px solid ${LINE}`,minWidth:140 }}>Nombre</th>
                      {entrenamientos.map((ent) => {
                        const suspendido = ent.estado === 'suspendido', locked = bloqueado(ent);
                        return (
                          <th key={ent.id} style={{ padding:'6px 4px',fontSize:11,fontWeight:500,textAlign:'center',minWidth:42,
                            color:suspendido?'#C2938A':MUTED, background:suspendido?'#F6E9E6':'white', borderBottom:`1px solid ${LINE}` }}>
                            <div>{WEEKDAY_LABELS[ent.fecha.getDay()]}</div>
                            <div style={{ fontFamily:'monospace',fontSize:12,color:suspendido?AUSENTE:INK,textDecoration:suspendido?'line-through':'none' }}>{ent.fecha.getDate()}</div>
                            {isAdmin ? (
                              <button onClick={()=>alternarSuspension(ent.id)} title={suspendido?'Reactivar':'Marcar como no realizado'}
                                style={{ marginTop:3,border:'none',background:'none',cursor:'pointer',padding:1,color:suspendido?AUSENTE:'#C2BBAF' }}>
                                <X size={10} strokeWidth={2.5}/>
                              </button>
                            ) : locked && !suspendido ? (
                              <div title="Plazo vencido" style={{ marginTop:3,display:'flex',justifyContent:'center',color:'#C2BBAF' }}><Lock size={10} strokeWidth={2.5}/></div>
                            ) : null}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((j) => (
                      <tr key={j.id}>
                        <td style={{ position:'sticky',left:0,zIndex:1,background:'white',padding:'8px 12px',fontSize:14,borderBottom:`1px solid ${LINE}`,borderRight:`1px solid ${LINE}`,whiteSpace:'nowrap' }}>
                          {`${j.nombre} ${j.apellido}`.trim()}
                        </td>
                        {entrenamientos.map((ent) => {
                          const suspendido = ent.estado === 'suspendido';
                          const locked = estaBloqueado(ent);
                          const status = asistencia[ent.id]?.[j.id]?.estado;
                          return (
                            <td key={ent.id} style={{ textAlign:'center',padding:'6px 4px',background:suspendido?'#FBF2F0':'white',borderBottom:`1px solid ${LINE}` }}>
                              {suspendido ? (
                                <div style={{ width:30,height:30,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto' }}>
                                  <div style={{ width:16,height:1.5,background:'#D9B6AF' }}/>
                                </div>
                              ) : (
                                <div style={{ opacity:locked?0.45:1 }} title={locked?'Plazo vencido':undefined}>
                                  <Stamp status={status} onClick={()=>marcar(ent.id,j.id)} disabled={locked}/>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ position:'sticky',left:0,zIndex:1,background:'white',padding:'8px 12px',fontSize:11,color:MUTED,borderRight:`1px solid ${LINE}`,borderTop:`1px solid ${LINE}`,whiteSpace:'nowrap' }}>Marcar vacíos ausentes</td>
                      {entrenamientos.map((ent) => {
                        const suspendido = ent.estado === 'suspendido';
                        const disabled = suspendido || estaBloqueado(ent);
                        return (
                          <td key={ent.id} style={{ textAlign:'center',padding:'4px 2px',borderTop:`1px solid ${LINE}` }}>
                            <button onClick={()=>marcarVaciosComoAusentes(ent.id)} disabled={disabled}
                              style={{ width:22,height:22,borderRadius:6,border:`1px solid ${disabled?LINE:AUSENTE}`,background:disabled?'#F5F4F1':'#F6E9E6',
                                color:disabled?'#C2BBAF':AUSENTE,display:'flex',alignItems:'center',justifyContent:'center',cursor:disabled?'default':'pointer',margin:'0 auto' }}>
                              <X size={12} strokeWidth={2.5}/>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p style={{ fontSize:12,color:MUTED,margin:'10px 2px 16px' }}>
                Toca un día para marcar: vacío → presente → ausente → vacío. Cualquiera puede corregir la marca de cualquiera. Usa la ✕ sobre la fecha para marcar el entrenamiento como no realizado (solo administradoras), o la ✕ debajo para marcar ausentes a quienes quedaron sin marca. Cada registro se bloquea 24h después de las 23:30 del día del entrenamiento.
              </p>

              {isAdmin && (
                <div style={{ textAlign:'right',marginBottom:8 }}>
                  <button onClick={downloadExcelReport}
                    style={{ display:'inline-flex',alignItems:'center',gap:4,border:`1px solid ${LINE}`,background:'white',color:INK,cursor:'pointer',fontSize:11,padding:'4px 8px',borderRadius:6 }}>
                    <Download size={11}/> Descargar reporte Excel
                  </button>
                </div>
              )}
            </>
          )
        }
        {error && <div style={{ marginTop:16,fontSize:12,color:AUSENTE,textAlign:'center' }}>{error}</div>}
    </>
  );
}
