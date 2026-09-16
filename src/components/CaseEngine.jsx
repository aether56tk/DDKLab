import React, { useMemo, useState } from 'react';
import { scoreRubric, percentage } from '../engine/ScoringEngine';

export default function CaseEngine({ caseData, onBack }) {
  const [stageIndex, setStageIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const stage = caseData.stages[stageIndex];
  const selected = answers[stage.id];
  const complete = stageIndex === caseData.stages.length - 1 && submitted;
  const score = useMemo(() => {
    const values = caseData.stages.map((s) => answers[s.id] ?? 0);
    return values.reduce((sum, value) => sum + value, 0);
  }, [answers, caseData.stages]);

  function choose(option) {
    if (!submitted) setAnswers((current) => ({ ...current, [stage.id]: option.score }));
  }

  function next() {
    if (stageIndex < caseData.stages.length - 1) {
      setStageIndex((index) => index + 1);
      setSubmitted(false);
    } else {
      setSubmitted(true);
    }
  }

  if (complete) {
    return (
      <section className="case-engine result-card">
        <div className="result-kicker">CASE COMPLETE</div>
        <h1>{caseData.id} · {caseData.title}</h1>
        <div className="score-display">
          <strong>{score}/{caseData.maxScore}</strong>
          <span>{percentage(score, caseData.maxScore)}% provisional score</span>
        </div>
        <p>This is an educational prototype. Scoring keys and feedback require expert validation before research use.</p>
        <div className="result-actions">
          <button onClick={onBack}>Back to case library</button>
          <button onClick={() => { setStageIndex(0); setAnswers({}); setSubmitted(false); }}>Retry case</button>
        </div>
      </section>
    );
  }

  return (
    <section className="case-engine">
      <div className="case-engine-head">
        <button className="back" onClick={onBack}>← Case library</button>
        <span className="case-id">{caseData.id}</span>
      </div>
      <div className="case-title">
        <p className="eyebrow">TINNISENSE · SIMULATED CASE</p>
        <h1>{caseData.title}</h1>
        <p>Patient: {caseData.patient.age}-year-old {caseData.patient.sex} · {caseData.patient.chiefConcern}</p>
      </div>
      <div className="progress-track"><span style={{ width: `${((stageIndex + 1) / caseData.stages.length) * 100}%` }} /></div>
      <div className="stage-meta">Stage {stageIndex + 1} of {caseData.stages.length}</div>

      <article className="decision-card">
        <h2>{stage.title}</h2>
        <p className="decision-prompt">{stage.prompt}</p>
        <div className="decision-options">
          {stage.options.map((option) => (
            <button key={option.id} className={`decision-option ${selected === option.score ? 'selected' : ''}`} onClick={() => choose(option)}>
              <span className="option-marker">{option.id.toUpperCase()}</span>
              <span>{option.text}</span>
            </button>
          ))}
        </div>
        {selected !== undefined && (
          <div className="feedback-panel">
            <strong>Clinical reasoning feedback</strong>
            <p>{stage.feedback}</p>
          </div>
        )}
        <div className="decision-footer">
          <span>{selected !== undefined ? 'Decision recorded' : 'Select a response to continue'}</span>
          <button className="primary-action" disabled={selected === undefined} onClick={next}>
            {stageIndex === caseData.stages.length - 1 ? 'Finish case →' : 'Continue →'}
          </button>
        </div>
      </article>
    </section>
  );
}
