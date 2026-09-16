import React, { useMemo, useState } from 'react';
import { percentage } from '../engine/ScoringEngine';

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
  const x = (i) => left + (i / (freqs.length - 1)) * plotW;
  const y = (db) => top + ((db + 10) / 130) * plotH;
  return <div className="audiogram-card"><div className="mini-heading"><span>DIAGNOSTIC FINDING</span><b>Audiogram</b></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Simulated pure-tone audiogram"><rect x={left} y={top} width={plotW} height={plotH} rx="8" fill="#f8fafc" stroke="#d9e2ec" />{[-10,10,30,50,70,90,110].map(db => <g key={db}><line x1={left} x2={width-right} y1={y(db)} y2={y(db)} stroke="#e5eaf0" /><text x="8" y={y(db)+4} fontSize="10" fill="#718096">{db}</text></g>)}{freqs.map((f,i)=><text key={f} x={x(i)} y={height-12} textAnchor="middle" fontSize="10" fill="#718096">{f >= 1000 ? `${f/1000}k` : f}</text>)}{data.right && <polyline points={data.right.map((v,i)=>`${x(i)},${y(v)}`).join(' ')} fill="none" stroke="#ef6b63" strokeWidth="3" />}{data.left && <polyline points={data.left.map((v,i)=>`${x(i)},${y(v)}`).join(' ')} fill="none" stroke="#2f6fed" strokeWidth="3" strokeDasharray="6 4" />}{data.right?.map((v,i)=><circle key={`r${i}`} cx={x(i)} cy={y(v)} r="4" fill="#ef6b63" />)}{data.left?.map((v,i)=><rect key={`l${i}`} x={x(i)-4} y={y(v)-4} width="8" height="8" fill="#2f6fed" />)}</svg><div className="legend"><span><i className="legend-r" /> Right ear</span><span><i className="legend-l" /> Left ear</span><small>Simulated educational data</small></div></div>;
}

function Feedback({ text }) { return <div className="feedback-panel"><span className="feedback-icon">✓</span><div><strong>Reasoning feedback</strong><p>{text}</p></div></div>; }

export default function CaseEngine({ caseData, onBack, onComplete }) {
  const meta = moduleMeta[caseData.module] || moduleMeta.TinniSense;
  const [stageIndex, setStageIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [confidence, setConfidence] = useState(0);
  const [finished, setFinished] = useState(false);
  const startedAt = useMemo(() => Date.now(), []);

  const stages = useMemo(() => {
    const source = caseData.stages || [];
    const feature = { id: 'feature-extraction', title: '2. Extract the decision-driving features', prompt: caseData.featurePrompt || 'Which information should be carried forward before interpreting the case?', options: [], scoreless: true, feedback: 'Separate the high-value clinical features from background information before moving to interpretation.' };
    if (source.some(s => s.id === 'feature-extraction')) return source;
    const output = [];
    source.forEach((stage, i) => { output.push({ ...stage, title: stage.title.replace(/^\d+\./, `${output.length + 1}.`) }); if (i === 0) output.push(feature); });
    return output.map((s, i) => ({ ...s, title: s.title.replace(/^\d+\./, `${i + 1}.`) }));
  }, [caseData]);

  const stage = stages[stageIndex];
  const selected = answers[stage?.id];
  const score = Object.values(answers).reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
  const pct = percentage(score, caseData.maxScore);
  const progressPct = ((stageIndex + 1) / stages.length) * 100;

  function choose(option) { setAnswers(current => ({ ...current, [stage.id]: option.score })); }
  function continueStage() { if (stageIndex < stages.length - 1) setStageIndex(i => i + 1); else setFinished(true); }
  function finishAndSave() {
    const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    onComplete?.({ id: caseData.id, score, maxScore: caseData.maxScore, percent: pct, confidence, duration, completedAt: new Date().toISOString() });
  }
  function retry() { setStageIndex(0); setAnswers({}); setConfidence(0); setFinished(false); }

  if (finished) return <main className="case-shell"><header className="case-nav"><button className="brand-button" onClick={onBack}><span className="brand-mark">A</span><span><b>Audio-Clinical</b> Lab</span></button><span className={`module-tag ${meta.color}`}>{meta.label}</span></header><section className="result-shell"><div className="result-hero"><div className="success-icon">✓</div><p className="eyebrow">CASE COMPLETE</p><h1>Nice work. Case {caseData.id} is complete.</h1><p>Review the provisional performance summary below. Expert validation is required before this prototype is used as a research instrument.</p></div><div className="result-grid"><div className="score-card"><span>Your score</span><strong>{score}<small> / {caseData.maxScore}</small></strong><div className="score-ring" style={{'--score': `${pct}%`}}><b>{pct}%</b></div></div><div className="result-panel"><p className="eyebrow">SELF-REPORTED CONFIDENCE</p><h2>How confident do you feel after this case?</h2><div className="confidence-row">{[1,2,3,4,5].map(n => <button key={n} className={confidence === n ? 'active' : ''} onClick={() => setConfidence(n)}>{n}<small>{n === 1 ? 'Low' : n === 3 ? 'Moderate' : n === 5 ? 'High' : ''}</small></button>)}</div><p className="micro-note">This local prototype stores progress in your browser only.</p></div></div><div className="result-feedback"><div><p className="eyebrow">WHAT TO REMEMBER</p><h2>Clinical reasoning is more than the final answer.</h2><p>{caseData.summary || 'Use the patient story, diagnostic findings, safety screen, management rationale and follow-up plan together.'}</p></div><div className="result-actions"><button className="secondary-button" onClick={retry}>Retry case</button><button className="primary-button" disabled={!confidence} onClick={finishAndSave}>Save & return to library →</button></div></div></section></main>;

  return <main className="case-shell"><header className="case-nav"><button className="brand-button" onClick={onBack}><span className="brand-mark">A</span><span><b>Audio-Clinical</b> Lab</span></button><div className="case-nav-center"><span className={`module-tag ${meta.color}`}>{meta.label}</span><span>{caseData.id}</span></div><button className="exit-button" onClick={onBack}>Exit case</button></header><section className="case-layout"><aside className="case-sidebar"><button className="text-back" onClick={onBack}>← Case library</button><div className="patient-card"><span className="patient-avatar">{caseData.patient?.sex?.[0] || 'P'}</span><div><span>SIMULATED PATIENT</span><b>{caseData.patient ? `${caseData.patient.age}-year-old ${caseData.patient.sex}` : 'Clinical case'}</b></div></div><h3>{caseData.title}</h3><p>{caseData.patient?.chiefConcern || caseData.note}</p><div className="stage-list">{stages.map((s,i)=><div key={s.id} className={`stage-list-item ${i === stageIndex ? 'active' : ''} ${i < stageIndex ? 'done' : ''}`}><span>{i < stageIndex ? '✓' : String(i+1).padStart(2,'0')}</span><b>{s.title.replace(/^\d+\.\s*/, '')}</b></div>)}</div></aside><section className="case-workspace"><div className="case-progress-head"><div><span>STAGE {stageIndex+1} OF {stages.length}</span><b>{Math.round(progressPct)}% complete</b></div><div className="progress-line"><span style={{width:`${progressPct}%`}} /></div></div><div className="decision-header"><p className="eyebrow">{meta.label} · CLINICAL REASONING</p><h1>{stage.title}</h1><p>{stage.prompt}</p></div>{stage.id === 'findings' && <Audiogram data={caseData.audiogram} />}{stage.id === 'feature-extraction' && caseData.keyFeatures && <div className="feature-grid">{caseData.keyFeatures.map((item,i)=><div className="feature-card" key={i}><span>0{i+1}</span><b>{item.label}</b><p>{item.value}</p></div>)}</div>}<div className="decision-options">{stage.scoreless ? <><div className="info-stage"><span className="info-icon">i</span><div><b>Pause and structure the case.</b><p>Identify the details that should influence your next decision. This step is part of the seven-stage workflow and is not separately scored.</p></div></div><button className="primary-button continue-info" onClick={continueStage}>I have extracted the key features →</button></> : stage.options.map(option => <button key={option.id} className={`decision-option ${selected === option.score ? 'selected' : ''}`} onClick={() => choose(option)}><span className="option-marker">{option.id.toUpperCase()}</span><span><b>{option.text}</b></span>{selected === option.score && <span className="option-check">✓</span>}</button>)}</div>{!stage.scoreless && selected !== undefined && <Feedback text={stage.feedback} />} {!stage.scoreless && <div className="decision-footer"><span>{selected !== undefined ? 'Decision recorded' : 'Select a response to continue'}</span><button className="primary-button" disabled={selected === undefined} onClick={continueStage}>{stageIndex === stages.length - 1 ? 'Finish case →' : 'Continue →'}</button></div>}</section></section><footer className="case-footer"><span>Educational simulation • Not for real clinical diagnosis</span><span>Decision latency is recorded locally for prototype evaluation</span></footer></main>;
}
