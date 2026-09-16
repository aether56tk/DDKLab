import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import CaseEngine from './components/CaseEngine';
import tinnitusA1 from './modules/tinnitus/A1.case.json';
import tinnitusA2 from './modules/tinnitus/A2.case.json';
import tinnitusA3 from './modules/tinnitus/A3.case.json';
import tinnitusA4 from './modules/tinnitus/A4.case.json';
import tinnitusA5 from './modules/tinnitus/A5.case.json';
import tinnitusA6 from './modules/tinnitus/A6.case.json';

const tinnitusCases = [tinnitusA1, tinnitusA2, tinnitusA3, tinnitusA4, tinnitusA5, tinnitusA6];

const modules = [
  { id: 'tinnitus', name: 'TinniSense', icon: '◉', subtitle: 'Tinnitus assessment & management', description: 'Reason through tinnitus presentations, identify red flags, and formulate an evidence-informed management plan.', cases: 6, colorClass: 'tinnitus' },
  { id: 'rehabilitation', name: 'RehabMind', icon: '◇', subtitle: 'Audiological rehabilitation', description: 'Translate patient goals, lifestyle demands and communication needs into an individualized rehabilitation plan.', cases: 4, colorClass: 'rehab' },
  { id: 'hearing-aids', name: 'HearWise', icon: '◈', subtitle: 'Hearing-aid decisions & troubleshooting', description: 'Integrate audiometry, patient needs, technology, verification and troubleshooting into defensible decisions.', cases: 4, colorClass: 'hearing' }
];

function App() {
  const [selected, setSelected] = useState(null);
  const [activeCase, setActiveCase] = useState(null);
  if (activeCase) return <CaseEngine caseData={activeCase} onBack={() => setActiveCase(null)} />;
  if (selected) return <ModuleView module={selected} onBack={() => setSelected(null)} onOpenCase={setActiveCase} />;

  return (
    <main className="app-shell">
      <header className="topbar"><div className="brand"><span className="brand-mark">A</span><span>Audio-Clinical Lab</span></div><span className="status-pill">RESEARCH MVP</span></header>
      <section className="hero"><p className="eyebrow">CLINICAL REASONING SIMULATION</p><h1>Think like a clinician.<br /><span>Decide with evidence.</span></h1><p className="hero-copy">A structured case-based learning environment for undergraduate audiology education across tinnitus, rehabilitation and hearing-aid management.</p></section>
      <section className="module-grid" aria-label="Clinical modules">
        {modules.map((module) => <button key={module.id} className={`module-card ${module.colorClass}`} onClick={() => setSelected(module)}><div className="card-icon">{module.icon}</div><div className="card-content"><span className="card-kicker">MODULE</span><h2>{module.name}</h2><h3>{module.subtitle}</h3><p>{module.description}</p><span className="launch">Open module →</span></div><span className="case-count">{module.cases} cases</span></button>)}
      </section>
      <section className="workflow"><div><p className="eyebrow">STANDARDIZED WORKFLOW</p><h2>From patient story to defensible decision.</h2></div><div className="steps">{['History', 'Findings', 'Interpret', 'Red flags', 'Decide', 'Justify', 'Follow-up'].map((step, i) => <div className="step" key={step}><span>{String(i + 1).padStart(2, '0')}</span>{step}</div>)}</div></section>
      <footer><span>Educational simulation • Not for real clinical diagnosis</span><span>Audio-Clinical Lab · v0.3.0</span></footer>
    </main>
  );
}

function ModuleView({ module, onBack, onOpenCase }) {
  const ids = module.id === 'tinnitus' ? 'A' : module.id === 'rehabilitation' ? 'B' : 'C';
  const availableCases = module.id === 'tinnitus' ? tinnitusCases : [];
  return (
    <main className="app-shell module-view">
      <header className="topbar"><button className="back" onClick={onBack}>← Back</button><div className="brand"><span className="brand-mark">A</span><span>Audio-Clinical Lab</span></div><span className="status-pill">MVP</span></header>
      <section className={`module-hero ${module.colorClass}`}><span className="card-kicker">{module.cases} SIMULATED CASES SPECIFIED</span><h1>{module.name}</h1><p>{module.subtitle}</p><p className="hero-copy">{module.description}</p></section>
      <section className="case-panel"><div className="case-panel-head"><div><p className="eyebrow">CASE LIBRARY</p><h2>Choose a case</h2></div><span className="muted">Clinical reasoning workflow</span></div>
        {Array.from({ length: module.cases }, (_, i) => {
          const id = `${ids}${i + 1}`;
          const caseData = availableCases[i];
          return <div className="case-row" key={id}><span className="case-id">{id}</span><div><strong>{caseData ? caseData.title : `Simulated clinical case ${i + 1}`}</strong><small>History → Findings → Interpretation → Management → Follow-up</small></div>{caseData ? <button className="launch-case" onClick={() => onOpenCase(caseData)}>Start case →</button> : <span className="coming">CASE ENGINE NEXT</span>}</div>;
        })}
      </section>
      <footer><span>Educational simulation • Not for real clinical diagnosis</span><span>Audio-Clinical Lab · v0.3.0</span></footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
