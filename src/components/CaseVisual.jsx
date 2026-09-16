import React from 'react';

const palettes = {
  tinnitus: { a:'#0f314f', b:'#2d8c8f', c:'#d9f3ef' },
  rehab: { a:'#173c62', b:'#4b86b5', c:'#e2eff8' },
  hearing: { a:'#173f35', b:'#4f9b79', c:'#e2f3eb' }
};

function Person({ sex='Patient', age=50 }) {
  const p = sex?.toLowerCase().startsWith('f') ? '#c78f7c' : '#b87963';
  return <svg viewBox="0 0 260 260" className="clinical-portrait" role="img" aria-label={`Simulated ${age}-year-old patient portrait`}>
    <defs><linearGradient id="portrait-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#eaf2f7"/><stop offset="1" stopColor="#c9dbe7"/></linearGradient></defs>
    <rect width="260" height="260" rx="28" fill="url(#portrait-bg)"/>
    <circle cx="130" cy="91" r="48" fill={p}/><path d="M82 90c2-45 91-60 101 3-15-20-34-28-55-24-17 3-31 12-46 21Z" fill="#243449"/>
    <circle cx="112" cy="96" r="4" fill="#243449"/><circle cx="148" cy="96" r="4" fill="#243449"/><path d="M117 119c9 7 18 7 27 0" fill="none" stroke="#713f38" strokeWidth="3" strokeLinecap="round"/>
    <path d="M62 238c4-59 35-85 68-85s64 26 68 85" fill="#163451"/><path d="M92 170c13 12 63 12 76 0" fill="#f1f5f8" opacity=".7"/>
    <circle cx="81" cy="108" r="7" fill="none" stroke="#4d7187" strokeWidth="3"/><circle cx="179" cy="108" r="7" fill="none" stroke="#4d7187" strokeWidth="3"/>
  </svg>;
}

function Ear({ module='tinnitus' }) {
  const p = palettes[module] || palettes.tinnitus;
  return <svg viewBox="0 0 320 240" className="clinical-diagram" role="img" aria-label="Simulated clinical ear illustration">
    <rect width="320" height="240" rx="26" fill={p.a}/><circle cx="160" cy="120" r="83" fill="none" stroke={p.b} strokeWidth="3" opacity=".7"/><circle cx="160" cy="120" r="57" fill="none" stroke={p.c} strokeWidth="2" opacity=".55"/>
    <path d="M181 65c-43-24-84 10-74 54 6 28 36 35 34 62-1 18 18 27 32 14 10-10 4-29-6-40-13-14-23-22-18-38 5-16 21-20 36-12 19 10 25 37 13 57" fill="none" stroke={p.c} strokeWidth="10" strokeLinecap="round"/>
    <path d="M27 121c46-34 78-34 112 0s67 34 112 0 47-34 47-34" fill="none" stroke={p.b} strokeWidth="3" opacity=".8"/><circle cx="160" cy="120" r="9" fill={p.c}/>
  </svg>;
}

function HearingAid() {
  const p=palettes.hearing;
  return <svg viewBox="0 0 320 240" className="clinical-diagram" role="img" aria-label="Simulated hearing aid illustration">
    <rect width="320" height="240" rx="26" fill={p.a}/><path d="M108 55c35-22 77-13 91 18 13 28 2 58-12 78-11 15-13 31-7 48" fill="none" stroke="#dbe8ed" strokeWidth="18" strokeLinecap="round"/><path d="M108 55c35-22 77-13 91 18" fill="none" stroke={p.b} strokeWidth="25" strokeLinecap="round"/><circle cx="186" cy="70" r="9" fill={p.c}/><circle cx="180" cy="113" r="6" fill="#dbe8ed"/><path d="M181 199c-11 10-23 13-35 8" fill="none" stroke={p.c} strokeWidth="5" strokeLinecap="round"/>
  </svg>;
}

function Audiogram({ data }) {
  const freqs=[250,500,1000,2000,4000,8000]; const x=i=>35+i*47; const y=v=>25+((v+10)/130)*170;
  return <svg viewBox="0 0 330 220" className="clinical-diagram audiogram-visual" role="img" aria-label="Simulated audiogram"><rect width="330" height="220" rx="26" fill="#f7fafc"/>
    {[10,30,50,70,90].map(v=><line key={v} x1="30" x2="310" y1={y(v)} y2={y(v)} stroke="#dfe7ee"/>)}
    {freqs.map((f,i)=><text key={f} x={x(i)} y="211" textAnchor="middle" fontSize="9" fill="#66788a">{f>=1000?`${f/1000}k`:f}</text>)}
    {data?.right&&<polyline points={data.right.map((v,i)=>`${x(i)},${y(v)}`).join(' ')} fill="none" stroke="#df625c" strokeWidth="3"/>}{data?.left&&<polyline points={data.left.map((v,i)=>`${x(i)},${y(v)}`).join(' ')} fill="none" stroke="#3474d0" strokeWidth="3" strokeDasharray="5 4"/>}
    {data?.right?.map((v,i)=><circle key={`r${i}`} cx={x(i)} cy={y(v)} r="4" fill="#df625c"/>)}{data?.left?.map((v,i)=><rect key={`l${i}`} x={x(i)-4} y={y(v)-4} width="8" height="8" fill="#3474d0"/>)}
  </svg>;
}

export default function CaseVisual({ module='TinniSense', patient={}, audiogram, title }) {
  const type = module === 'HearWise' ? 'device' : module === 'RehabMind' ? 'audiogram' : 'tinnitus';
  return <div className={`case-visual-card ${module.toLowerCase()}`}>
    <div className="visual-label">CLINICAL VISUAL</div>
    <div className="visual-main">{type==='device' ? <HearingAid/> : type==='audiogram' && audiogram ? <Audiogram data={audiogram}/> : <Ear module={module==='RehabMind'?'rehab':'tinnitus'}/>}</div>
    <div className="visual-caption-row"><div><span>SIMULATED PATIENT</span><b>{patient.age ? `${patient.age}-year-old ${patient.sex||'patient'}` : 'Clinical case'}</b></div><Person sex={patient.sex} age={patient.age}/></div>
    {title && <p>{title}</p>}
  </div>;
}
