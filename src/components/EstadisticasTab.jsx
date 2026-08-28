import { LINE, MUTED, PRESENTE, AUSENTE } from '../theme';
import { getStats } from '../utils/estadisticas';

export function EstadisticasTab({ roster, rosterLoading, rosterError, asistencia, activeEnt, wedEnt, sunEnt }) {
  return (
    <>
        {/* TABLA ESTADÍSTICAS */}
        {rosterError && (
          <div style={{ textAlign:'center',color:AUSENTE,padding:'40px 0',border:`1px dashed ${AUSENTE}`,borderRadius:12 }}>
            {rosterError}
          </div>
        )}
        {!rosterLoading && !rosterError && roster.length > 0 && (
          <div style={{ overflowX:'auto',border:`1px solid ${LINE}`,borderRadius:12,background:'white',marginTop:4,marginBottom:24 }}>
            <table style={{ borderCollapse:'collapse',width:'100%' }}>
              <thead>
                <tr>
                  <th style={{ position:'sticky',left:0,zIndex:2,background:'white',textAlign:'left',padding:'10px 12px',fontSize:12,color:MUTED,fontWeight:600,borderBottom:`1px solid ${LINE}`,borderRight:`1px solid ${LINE}`,minWidth:150 }}>Nombre</th>
                  {['Miércoles','Domingo','General'].map(label => (
                    <th key={label} colSpan={3} style={{ padding:'6px 4px',fontSize:11,fontWeight:600,color:MUTED,textAlign:'center',borderBottom:`1px solid ${LINE}`,borderLeft:`1px solid ${LINE}` }}>{label}</th>
                  ))}
                </tr>
                <tr>
                  <th style={{ position:'sticky',left:0,zIndex:1,background:'white',borderRight:`1px solid ${LINE}`,borderBottom:`1px solid ${LINE}` }}></th>
                  {['Pres.','Aus.','%','Pres.','Aus.','%','Pres.','Aus.','%'].map((label,i) => (
                    <th key={i} style={{ padding:'4px 8px',fontSize:11,fontWeight:500,color:MUTED,textAlign:'center',borderBottom:`1px solid ${LINE}`,borderLeft:i%3===0?`1px solid ${LINE}`:'none',minWidth:44 }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster
                  .map((j) => ({ j, wed:getStats(asistencia,j.id,wedEnt), sun:getStats(asistencia,j.id,sunEnt), general:getStats(asistencia,j.id,activeEnt) }))
                  .sort((a,b) => (b.general.pct??-1)-(a.general.pct??-1))
                  .map(({ j, wed, sun, general }) => (
                    <tr key={j.id}>
                      <td style={{ position:'sticky',left:0,zIndex:1,background:'white',padding:'8px 12px',fontSize:14,borderBottom:`1px solid ${LINE}`,borderRight:`1px solid ${LINE}`,whiteSpace:'nowrap' }}>{`${j.nombre} ${j.apellido}`.trim()}</td>
                      {[wed,sun,general].flatMap((s,gi) => [
                        <td key={`${gi}p`} style={{ textAlign:'center',padding:'6px 8px',fontSize:13,color:PRESENTE,borderBottom:`1px solid ${LINE}`,borderLeft:`1px solid ${LINE}` }}>{s.presente}</td>,
                        <td key={`${gi}a`} style={{ textAlign:'center',padding:'6px 8px',fontSize:13,color:AUSENTE,borderBottom:`1px solid ${LINE}` }}>{s.ausente}</td>,
                        <td key={`${gi}pct`} style={{ textAlign:'center',padding:'6px 8px',fontSize:13,fontFamily:'monospace',fontWeight:gi===2?700:600,borderBottom:`1px solid ${LINE}`,
                          color:s.pct===null?MUTED:s.pct>=75?PRESENTE:s.pct>=50?'#B07D2A':AUSENTE }}>
                          {s.pct===null?'—':`${s.pct}%`}
                        </td>,
                      ])}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
    </>
  );
}
