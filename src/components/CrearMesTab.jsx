import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { INK, PAPER, LINE, MUTED, WEEKDAY_LABELS } from '../theme';
import { dateKey, getDaysInMonth, monthLabel, calcularBloqueaEn } from '../utils/fechas';

export function CrearMesTab({ isAdmin, authUser }) {
  const [crearMesMonth, setCrearMesMonth]   = useState(() => { const d = new Date(); d.setMonth(d.getMonth()+1); d.setDate(1); return d; });
  const [crearMesDias, setCrearMesDias]     = useState([]);
  const [crearMesCargando, setCrearMesCargando] = useState(false);
  const [crearMesEnviando, setCrearMesEnviando] = useState(false);
  const [crearMesMensaje, setCrearMesMensaje]   = useState(null);

  // ── Crear nuevo mes ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    let cancelado = false;
    setCrearMesCargando(true);
    setCrearMesMensaje(null);
    (async () => {
      const propuestos = getDaysInMonth(crearMesMonth)
        .filter((d) => d.getDay()===0 || d.getDay()===3)
        .map((d) => ({ key: dateKey(d), date: d, marcado: true }));
      const existentes = await Promise.all(propuestos.map((p) => getDoc(doc(db,'entrenamientos',p.key))));
      if (cancelado) return;
      setCrearMesDias(propuestos.map((p,i) => ({ ...p, yaExiste: existentes[i].exists() })));
      setCrearMesCargando(false);
    })();
    return () => { cancelado = true; };
  }, [isAdmin, crearMesMonth.getFullYear(), crearMesMonth.getMonth()]);

  function toggleCrearMesDia(key) {
    setCrearMesDias((prev) => prev.map((d) => d.key===key && !d.yaExiste ? { ...d, marcado: !d.marcado } : d));
  }

  async function confirmarCrearMes() {
    const aCrear = crearMesDias.filter((d) => d.marcado && !d.yaExiste);
    if (aCrear.length === 0) { setCrearMesMensaje('No hay días nuevos para crear.'); return; }
    setCrearMesEnviando(true);
    try {
      await Promise.all(aCrear.map((d) => setDoc(doc(db,'entrenamientos',d.key), {
        fecha: Timestamp.fromDate(d.date),
        estado: 'programado',
        bloqueaEn: calcularBloqueaEn(d.date),
        creadoPor: authUser.uid,
      })));
      setCrearMesMensaje(`Se crearon ${aCrear.length} entrenamientos.`);
      setCrearMesDias((prev) => prev.map((d) => d.marcado ? { ...d, yaExiste:true } : d));
    } catch (e) {
      setCrearMesMensaje('No se pudo completar. Revisa e intenta de nuevo.');
    } finally { setCrearMesEnviando(false); }
  }

  return (
          <div style={{ background:'white',border:`1px solid ${LINE}`,borderRadius:12,padding:'20px 20px 24px' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
              <h3 style={{ margin:0,fontSize:16,fontWeight:700 }}>{monthLabel(crearMesMonth)}</h3>
              <div style={{ display:'flex',gap:4 }}>
                <button onClick={()=>{const d=new Date(crearMesMonth);d.setMonth(d.getMonth()-1);setCrearMesMonth(d);}}
                  style={{ width:32,height:32,borderRadius:8,border:`1px solid ${LINE}`,background:'white',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}><ChevronLeft size={16}/></button>
                <button onClick={()=>{const d=new Date(crearMesMonth);d.setMonth(d.getMonth()+1);setCrearMesMonth(d);}}
                  style={{ width:32,height:32,borderRadius:8,border:`1px solid ${LINE}`,background:'white',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}><ChevronRight size={16}/></button>
              </div>
            </div>

            <p style={{ fontSize:13,color:MUTED,margin:'0 0 14px' }}>
              Se proponen los miércoles y domingos de este mes. Desmarca los que no correspondan (feriados, receso) antes de confirmar.
            </p>

            {crearMesCargando ? (
              <div style={{ color:MUTED,fontSize:13,padding:'12px 0' }}>Cargando…</div>
            ) : (
              <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:18 }}>
                {crearMesDias.map((d) => (
                  <label key={d.key} style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 12px',borderRadius:8,
                    border:`1px solid ${LINE}`,background:d.yaExiste?'#F5F4F1':'white',fontSize:13,cursor:d.yaExiste?'default':'pointer' }}>
                    <input type="checkbox" checked={d.marcado} disabled={d.yaExiste} onChange={()=>toggleCrearMesDia(d.key)} />
                    {WEEKDAY_LABELS[d.date.getDay()]} {d.date.getDate()}
                    {d.yaExiste && <span style={{ color:MUTED,fontSize:11 }}>ya existe</span>}
                  </label>
                ))}
              </div>
            )}

            <button onClick={confirmarCrearMes} disabled={crearMesEnviando || crearMesCargando}
              style={{ display:'flex',alignItems:'center',gap:4,padding:'9px 14px',borderRadius:8,border:'none',background:INK,color:PAPER,fontSize:14,
                cursor:crearMesEnviando?'default':'pointer',opacity:crearMesEnviando?0.7:1 }}>
              <Plus size={15}/> {crearMesEnviando ? 'Creando…' : 'Crear entrenamientos'}
            </button>

            {crearMesMensaje && <p style={{ fontSize:12,color:MUTED,marginTop:10 }}>{crearMesMensaje}</p>}
          </div>
  );
}
