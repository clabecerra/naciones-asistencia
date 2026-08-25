import { Check, X } from 'lucide-react';
import { LINE, MUTED, PRESENTE, AUSENTE } from '../theme';

export function Stamp({ status, onClick, disabled, title }) {
  // borderWidth/borderStyle por separado, no el shorthand "border": el
  // estado "sin marcar" pisa borderStyle solo, y mezclar shorthand con
  // longhand en el mismo nodo entre renders es lo que React advertía.
  const base = { width:30, height:30, borderRadius:'9999px', display:'flex', alignItems:'center', justifyContent:'center',
    cursor:disabled?'default':'pointer', transition:'transform 0.12s ease', borderWidth:'1.5px', borderStyle:'solid' };
  if (status==='presente') return (
    <button onClick={onClick} disabled={disabled} aria-label="Presente" title={title} className="stamp-pop"
      style={{...base,borderColor:PRESENTE,background:'#EAF2EC',color:PRESENTE,transform:'rotate(-7deg)'}}>
      <Check size={16} strokeWidth={3}/>
    </button>
  );
  if (status==='ausente') return (
    <button onClick={onClick} disabled={disabled} aria-label="Ausente" title={title} className="stamp-pop"
      style={{...base,borderColor:AUSENTE,background:'#F6E9E6',color:AUSENTE,transform:'rotate(6deg)'}}>
      <X size={16} strokeWidth={3}/>
    </button>
  );
  return (
    <button onClick={onClick} disabled={disabled} aria-label="Sin marcar" title={title}
      style={{ ...base,borderStyle:'dashed',borderColor:LINE,background:'transparent'}}
      onMouseEnter={(e)=>{if(!disabled)e.currentTarget.style.borderColor=MUTED;}}
      onMouseLeave={(e)=>{e.currentTarget.style.borderColor=LINE;}}
    />
  );
}
