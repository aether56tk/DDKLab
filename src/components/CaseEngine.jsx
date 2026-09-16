import React, { useMemo, useState } from 'react';
import { percentage } from '../engine/ScoringEngine';
import PatientInteraction from './PatientInteraction';
import './patient-interaction.css';

const moduleMeta = {
  TinniSense: { label: 'TINNISENSE', color: 'tinnitus' },
  RehabMind: { label: 'REHABMIND', color: 'rehab' },
  HearWise: { label: 'HEARWISE', color: 'hearing' }
};

function Audiogram({ data }) {
  if (!data) return null;
  const freqs = [250, 500, 1000, 2000, 4000, 8000];
  const width = 520, height = 220, left = 48, top = 20, bottom = 34, right = 18;
  const plotW = width - left - right, plotH = height - top - bottom;
  const x = i => left + (i / (freqs.length - 1)) * plotW;
  const y = db => top + ((db + 10) / 130) * plotH;
  return <div className="audiogram-card"><div className="mini-heading"><span>DIAGNOSTIC FINDING</span><b>Audiogram</b></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Simulated pure-tone audiogram"><rect x={left} y={top} width={plotW} height={plotH} rx="8" fill="#f8fafc" stroke="#d9e2ec" />{[-10,10,30,50,70,90,110].map(db => <g key={db}><line x1={left} x2={width-right} y1={y(db)} y2={y(db)} stroke="#e5eaf0" /><text x="8" y={y(db)+4} fontSize="10" fill="#718096">{db}</text></g>)}{freqs.map((f,i)=><text key={f} x={x(i)} y={height-12} textAnchor="middle" fontSize="10" fill="#718096">{f >= 1000 ? `${f/1000}k` : f}</text>)}{data.right && <polyline points={data.right.map((v,i)=>`${x(i)},${y(v)}`).join(' ')} fill="none" stroke="#ef6b63" strokeWidth="3" />}{data.left && <polyline points={data.left.map((v,i)=>`${x(i)},${y(v)}`).join(' ')} fill="none" stroke="#2f6fed" strokeWidth="3" strokeDasharray="6 4" />}{data.right?.map((v,i)=><circle key={`r${i}`} cx={x(i)} cy={y(v)} r="4" fill="#ef6b63" />)}{data.left?.map((v,i)=><rect key={`l${i}`} x={x(i)-4} y={y(v)-4} width="8" height="8" fill="#2f6fed" />)}</svg><div className="legend"><span><i className="legend-r" /> Right ear</span><span><i className="legend-l" /> Left ear</span><small>Simulated educational data</small></div></div>;
}

function Feedback({ text }) { return <div className="feedback-panel"><span className="feedback-icon">✓</span><div><strong>Reasoning feedback</strong><p>{text}</p></div></div>; }

export default function CaseEngine({ caseData, onBack, onComplete }) {
  const meta = moduleMeta[caseData.module] || moduleMeta.TinniSense;
  const [stageIndex, setStageIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [confidence, setConfidence] = useState(0);
  const [finished, setFinished] = useState(false);
  const [interactionDone, setInteractionDone] = useState(!caseData.simulation);
  const [interaction, setInteraction] = useState(null);
  const startedAt = useMemo(() => Date.now(), []);

  const stages = useMemo(() => {
    const source = caseData.stages || [];
    const feature = { id: 'feature-extraction', title: '2. Extract the decision-driving features', prompt: caseData.featurePrompt || 'Which information should be carried forward before interpreting the case?', options: [], scoreless: true };
    if (source.some(s => s.id === 'feature-extraction')) return source;
    const output = [];
    source.forEach((stage, i) => { output.push(stage); if (i === 0) output.push(feature); });
    return output.map((s, i) => ({ ...s, title: s.title.replace(/^\d+\./, `${i + 1}.`) }));
  }, [caseData]);

  const stage = stages[stageIndex];
  const selected = answers[stage?.id];
  const score = Object.values(answers).reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
  const pct = percentage(score, caseData.maxScore);
  const progressPct = ((stageIndex + 1) / stages.length) * 100;
  const interactionQuality = interaction?.interactionQuality ?? 0;
  const revealed = interaction?.revealed || [];

  const effectivePrompt = stage?.id === 'history' && interaction && !revealed.includes('Perceived left hearing reduction')
    ? 'Your patient did not disclose a hearing change during the initial encounter. What should you prioritize before interpreting the tinnitus presentation?'
    : stage?.id === 'management' && interactionQuality < 60
      ? 'The patient remains worried after the encounter. What management direction addresses both safety and the patient\'s concern?'
      : stage?.prompt;

  function choose(option) { setAnswers(current => ({ ...current, [stage.id]: option.score })); }
  function continueStage() { if (stageIndex < stages.length - 1) setStageIndex(i => i + 1); else setFinished(true); }
  function finishAndSave() {
    const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    onComplete?.({ id: caseData.id, score, maxScore: caseData.maxScore, percent: pct, confidence, duration, interactionQuality, trust: interaction?.trust, engagement: interaction?.engagement, patientEmotion: interaction?.emotion, completedAt: new Date().toISOString() });
  }
  function retry() { setStageIndex(0); setAnswers({}); setConfidence(0); setFinished(false); setInteractionDone(!caseData.simulation); setInteraction(null); }

  if (!interactionDone && caseData.simulation) {
    return <main className="case-shell"><header className="case-nav"><button className="brand-button" onClick={onBack}><span className="brand-mark">A</span><span><b>Audio-Clinical</b> Lab</span></button><div className="case-nav-center"><span className={`module-tag ${meta.color}`}>{meta.label}</span><span>{caseData.id}</span></div><button className="exit-button" onClick={onBack}>Exit case</button></header><section className="case-layout"><aside className="case-sidebar"><button className="text-back" onClick={onBack}>← Case library</button><div className="patient-card"><span className="patient-avatar">{caseData.patient?.sex?.[0] || 'P'}</span><div><span>SIMULATED PATIENT</span><b>{caseData.patient ? `${caseData.patient.age}-year-old ${caseData.patient.sex}` : 'Clinical case'}</b></div></div><h3>{caseData.title}</h3><p>{caseData.patient?.chiefConcern || caseData.note}</p><div className="stage-list"><div className="stage-list-item active"><span>01</span><b>Patient encounter</b></div><div className="stage-list-item"><span>02</span><b>Clinical reasoning</b></div><div className="stage-list-item"><span>03</span><b>Management</b></div><div className="stage-list-item"><span>04</span><b>Follow-up</b></div></div></aside><section className="case-workspace"><div className="decision-header"><p className="eyebrow">{meta.label} · PATIENT-CENTRED SIMULATION</p><h1>Meet the patient before you meet the data.</h1><p>Ask, listen and observe. Information is revealed through the encounter, and the patient's response affects the clinical pathway.</p></div><PatientInteraction simulation={caseData.simulation} onComplete={(result, continueNow) => { setInteraction(result); if (continueNow) setInteractionDone(true); }} /></section></section><footer className="case-footer"><span>Educational simulation • Not for real clinical diagnosis</span><span>Patient responses are rule-based for research standardization</span></footer></main>;
  }

  if (finished) return <main className="case-shell"><header className="case-nav"><button className="brand-button" onClick={onBack}><span className="brand-mark">A</span><span><b>Audio-Clinical</b> Lab</span></button><span className={`module-tag ${meta.color}`}>{meta.label}</span></header><section className="result-shell"><div className="result-hero"><div className="success-icon">✓</div><p className="eyebrow">CASE OUTCOME</p><h1>{interactionQuality >= 80 ? 'The patient felt heard and the clinical pathway was well established.' : interactionQuality >= 60 ? 'The encounter was adequate, but there are opportunities to improve.' : 'The clinical encounter needs another attempt.'}</h1><p>This prototype separates clinical reasoning performance from patient-interaction performance so the student can see how communication affected the encounter.</p></div><div className="result-grid"><div className="score-card"><span>Clinical reasoning</span><strong>{score}<small> / {caseData.maxScore}</small></strong><div className="score-ring" style={{'--score': `${pct}%`}}><b>{pct}%</b></div></div><div className="result-panel"><p className="eyebrow">PATIENT INTERACTION</p><h2>How did your interaction affect the patient?</h2><div className="interaction-summary-grid"><div><span>Interaction quality</span><b>{interactionQuality}%</b></div><div><span>Trust</span><b>{interaction?.trust ?? '—'}%</b></div><div><span>Engagement</span><b>{interaction?.engagement ?? '—'}%</b></div><div><span>Observed state</span><b>{interaction?.emotion || '—'}</b></div></div><p className="micro-note">Emotional state here means observed patient distress/readiness; it is not a psychiatric diagnosis.</p><p className="eyebrow">SELF-REPORTED CONFIDENCE</p><div className="confidence-row">{[1,2,3,4,5].map(n => <button key={n} className={confidence === n ? 'active' : ''} onClick={() => setConfidence(n)}>{n}<small>{n === 1 ? 'Low' : n === 3 ? 'Moderate' : n === 5 ? 'High' : ''}</small></button>)}</div></div></div><div className="result-feedback"><div><p className="eyebrow">WHAT CHANGED</p><h2>Your interaction affected what the patient disclosed.</h2><p>{revealed.length ? `Information obtained during the encounter: ${revealed.join(', ')}.` : 'Very little additional information was disclosed during the encounter. Try a more open, empathic history.'}</p></div><div className="result-actions"><button className="secondary-button" onClick={retry}>Repeat encounter</button><button className="primary-button" disabled={!confidence} onClick={finishAndSave}>Save case outcome →</button></div></div></section></main>;

  return <main className="case-shell"><header className="case-nav"><button className="brand-button" onClick={onBack}><span className="brand-mark">A</span><span><b>Audio-Clinical</b> Lab</span></button><div className="case-nav-center"><span className={`module-tag ${meta.color}`}>{meta.label}</span><span>{caseData.id}</span></div><button className="exit-button" onClick={onBack}>Exit case</button></header><section className="case-layout"><aside className="case-sidebar"><button className="text-back" onClick={onBack}>← Case library</button><div className="patient-card"><span className="patient-avatar">{caseData.patient?.sex?.[0] || 'P'}</span><div><span>SIMULATED PATIENT</span><b>{caseData.patient ? `${caseData.patient.age}-year-old ${caseData.patient.sex}` : 'Clinical case'}</b></div></div><h3>{caseData.title}</h3><p>{caseData.patient?.chiefConcern || caseData.note}</p><div className="stage-list">{stages.map((s,i)=><div key={s.id} className={`stage-list-item ${i === stageIndex ? 'active' : ''} ${i < stageIndex ? 'done' : ''}`}><span>{i < stageIndex ? '✓' : String(i+1).padStart(2,'0')}</span><b>{s.title.replace(/^\d+\.\s*/, '')}</b></div>)}</div></aside><section className="case-workspace"><div className="case-progress-head"><div><span>STAGE {stageIndex+1} OF {stages.length}</span><b>{Math.round(progressPct)}% complete</b></div><div className="progress-line"><span style={{width:`${progressPct}%`}} /></div></div><div className="decision-header"><p className="eyebrow">{meta.label} · CLINICAL REASONING</p><h1>{stage.title}</h1><p>{effectivePrompt}</p></div>{stage.id === 'findings' && <Audiogram data={caseData.audiogram} />}{stage.id === 'feature-extraction' && caseData.keyFeatures && <div className="feature-grid">{caseData.keyFeatures.map((item,i)=><div className="feature-card" key={i}><span>0{i+1}</span><b>{item.label}</b><p>{item.value}</p></div>)}</div>}{interaction && <div className="info-stage" style={{marginBottom:18}}><span className="info-icon">●</span><div><b>Patient context carried forward</b><p>Trust {interaction.trust}% · Engagement {interaction.engagement}% · Observed state: {interaction.emotion}. The encounter revealed {interaction.revealed.length} clinically relevant item(s).</p></div></div>}<div className="decision-options">{stage.scoreless ? <><div className="info-stage"><span className="info-icon">i</span><div><b>Pause and structure the case.</b><p>Identify the details that should influence your next decision. This step is not separately scored.</p></div></div><button className="primary-button continue-info" onClick={continueStage}>I have extracted the key features →</button></> : stage.options.map(option => <button key={option.id} className={`decision-option ${selected === option.score ? 'selected' : ''}`} onClick={() => choose(option)}><span className="option-marker">{option.id.toUpperCase()}</span><span><b>{option.text}</b></span>{selected === option.score && <span className="option-check">✓</span>}</button>)}</div>{!stage.scoreless && selected !== undefined && <Feedback text={stage.feedback} />} {!stage.scoreless && <div className="decision-footer"><span>{selected !== undefined ? 'Decision recorded' : 'Select a response to continue'}</span><button className="primary-button" disabled={selected === undefined} onClick={continueStage}>{stageIndex === stages.length - 1 ? 'Finish case →' : 'Continue →'}</button></div>}</section></section><footer className="case-footer"><span>Educational simulation • Not for real clinical diagnosis</span><span>Decision latency is recorded locally for prototype evaluation</span></footer></main>;
}
