import React, { useMemo, useState } from 'react';

const emotionMeta = {
  calm: { icon: '🙂', label: 'Calm' },
  concerned: { icon: '😟', label: 'Concerned' },
  anxious: { icon: '😰', label: 'Anxious' },
  distressed: { icon: '😣', label: 'Distressed' },
  reassured: { icon: '😌', label: 'More at ease' }
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export default function PatientInteraction({ simulation, onComplete }) {
  const [turn, setTurn] = useState(0);
  const [trust, setTrust] = useState(simulation.initialTrust ?? 55);
  const [emotion, setEmotion] = useState(simulation.initialEmotion || 'concerned');
  const [engagement, setEngagement] = useState(simulation.initialEngagement ?? 60);
  const [revealed, setRevealed] = useState([]);
  const [history, setHistory] = useState([]);
  const [finished, setFinished] = useState(false);

  const prompt = simulation.turns?.[turn];
  const emotionInfo = emotionMeta[emotion] || emotionMeta.concerned;
  const interactionQuality = useMemo(() => {
    const relevant = history.filter(h => h.relevance > 0).length;
    const empathy = history.reduce((s, h) => s + (h.empathy || 0), 0);
    const harmful = history.reduce((s, h) => s + (h.harm || 0), 0);
    return clamp(Math.round(45 + relevant * 9 + empathy * 5 - harmful * 8 + (trust - 50) * 0.25), 0, 100);
  }, [history, trust]);

  function choose(option) {
    const nextTrust = clamp(trust + (option.trust || 0), 0, 100);
    const nextEngagement = clamp(engagement + (option.engagement || 0), 0, 100);
    const nextEmotion = option.emotion || emotion;
    const nextRevealed = [...new Set([...revealed, ...(option.reveals || [])])];
    const nextHistory = [...history, { id: option.id, relevance: option.relevance || 0, empathy: option.empathy || 0, harm: option.harm || 0 }];
    setTrust(nextTrust);
    setEngagement(nextEngagement);
    setEmotion(nextEmotion);
    setRevealed(nextRevealed);
    setHistory(nextHistory);

    if (turn < simulation.turns.length - 1) {
      setTurn(turn + 1);
    } else {
      setFinished(true);
      onComplete?.({
        interactionQuality: clamp(Math.round(45 + nextHistory.filter(h => h.relevance > 0).length * 9 + nextHistory.reduce((s, h) => s + (h.empathy || 0), 0) * 5 - nextHistory.reduce((s, h) => s + (h.harm || 0), 0) * 8 + (nextTrust - 50) * 0.25), 0, 100),
        trust: nextTrust,
        engagement: nextEngagement,
        emotion: nextEmotion,
        revealed: nextRevealed,
        history: nextHistory
      });
    }
  }

  if (finished) {
    return (
      <section className="patient-interaction complete">
        <div className="interaction-complete-icon">✓</div>
        <div>
          <p className="eyebrow">PATIENT ENCOUNTER COMPLETE</p>
          <h2>You established the clinical conversation.</h2>
          <p className="interaction-note">The information below was revealed through your interaction. It will now influence the clinical reasoning stages.</p>
          <div className="interaction-summary-grid">
            <div><span>Patient state</span><b>{emotionInfo.icon} {emotionInfo.label}</b></div>
            <div><span>Trust</span><b>{trust}%</b></div>
            <div><span>Engagement</span><b>{engagement}%</b></div>
            <div><span>Interaction quality</span><b>{interactionQuality}%</b></div>
          </div>
          <div className="revealed-facts">
            {revealed.map((fact) => <span key={fact}>✓ {fact}</span>)}
          </div>
          <button className="primary-button" type="button" onClick={() => onComplete?.({ interactionQuality, trust, engagement, emotion, revealed, history }, true)}>Continue to clinical reasoning →</button>
        </div>
      </section>
    );
  }

  return (
    <section className="patient-interaction">
      <div className="patient-scene">
        <div className="patient-avatar-large">{simulation.patient?.avatar || 'P'}</div>
        <div className="patient-scene-copy">
          <span className="card-kicker">SIMULATED PATIENT · LIVE ENCOUNTER</span>
          <h2>{simulation.patient?.name || 'Patient'}</h2>
          <p>{simulation.patient?.intro || 'The patient is waiting for you to begin.'}</p>
        </div>
        <div className={`patient-state ${emotion}`}><span>{emotionInfo.icon}</span><div><small>OBSERVED STATE</small><b>{emotionInfo.label}</b></div></div>
      </div>

      <div className="conversation-card">
        <div className="conversation-header"><span>ENCOUNTER · TURN {turn + 1}/{simulation.turns.length}</span><span>Trust {trust}%</span></div>
        <div className="patient-speech"><span className="speech-avatar">{simulation.patient?.avatar || 'P'}</span><div><b>{simulation.patient?.name || 'Patient'}</b><p>{prompt.patient}</p></div></div>
        <div className="clinician-prompt"><span>YOUR RESPONSE</span><h3>{prompt.prompt}</h3></div>
        <div className="interaction-options">
          {prompt.options.map(option => (
            <button key={option.id} type="button" className="interaction-option" onClick={() => choose(option)}>
              <span className="option-marker">{option.id.toUpperCase()}</span>
              <span><b>{option.text}</b><small>{option.style}</small></span>
            </button>
          ))}
        </div>
      </div>

      <div className="interaction-meter-row">
        <div><span>Patient trust</span><div className="interaction-meter"><i style={{ width: `${trust}%` }} /></div></div>
        <div><span>Engagement</span><div className="interaction-meter"><i style={{ width: `${engagement}%` }} /></div></div>
        <p>Observe the patient response. Do not assume that the audiogram tells the whole story.</p>
      </div>
    </section>
  );
}
