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
  const [repair, setRepair] = useState(false);
  const [finished, setFinished] = useState(false);
  const [lastResponse, setLastResponse] = useState('');

  const prompt = simulation.turns?.[turn];
  const emotionInfo = emotionMeta[emotion] || emotionMeta.concerned;
  const interactionQuality = useMemo(() => {
    const relevant = history.filter(h => h.relevance > 0).length;
    const empathy = history.reduce((s, h) => s + (h.empathy || 0), 0);
    const harmful = history.reduce((s, h) => s + (h.harm || 0), 0);
    const recovery = history.filter(h => h.repair).length;
    return clamp(Math.round(42 + relevant * 8 + empathy * 5 + recovery * 4 - harmful * 9 + (trust - 50) * 0.3), 0, 100);
  }, [history, trust]);

  const patientMessage = useMemo(() => {
    if (repair) return 'I feel like you moved past my concern. Could we slow down and talk about what is worrying me?';
    if (!prompt) return '';
    const variants = prompt.patientByTrust;
    if (trust < 35 && variants?.low) return variants.low;
    if (trust >= 72 && variants?.high) return variants.high;
    if (trust < 35) return 'I am not really sure what else to say. I am still worried.';
    if (trust >= 72) return `${prompt.patient} I feel comfortable telling you more.`;
    return prompt.patient;
  }, [prompt, trust, repair]);

  function apply(option, isRepair = false) {
    const nextTrust = clamp(trust + (option.trust || 0), 0, 100);
    const nextEngagement = clamp(engagement + (option.engagement || 0), 0, 100);
    const nextEmotion = option.emotion || emotion;
    const nextRevealed = [...new Set([...revealed, ...(option.reveals || [])])];
    const event = { id: option.id, relevance: option.relevance || 0, empathy: option.empathy || 0, harm: option.harm || 0, repair: isRepair, timestamp: Date.now() };
    const nextHistory = [...history, event];
    setTrust(nextTrust); setEngagement(nextEngagement); setEmotion(nextEmotion); setRevealed(nextRevealed); setHistory(nextHistory);
    setLastResponse(option.response || (isRepair ? 'The patient is willing to continue.' : 'The patient responds to your approach.'));
    if (isRepair) { setRepair(false); return; }
    if (option.harm && nextTrust < 55) { setRepair(true); return; }
    if (turn < (simulation.turns?.length || 1) - 1) setTurn(turn + 1);
    else { setFinished(true); onComplete?.({ interactionQuality: clamp(Math.round(42 + nextHistory.filter(h => h.relevance > 0).length * 8 + nextHistory.reduce((s,h)=>s+(h.empathy||0),0)*5 + nextHistory.filter(h=>h.repair).length*4 - nextHistory.reduce((s,h)=>s+(h.harm||0),0)*9 + (nextTrust-50)*0.3),0,100), trust: nextTrust, engagement: nextEngagement, emotion: nextEmotion, revealed: nextRevealed, history: nextHistory }); }
  }

  if (finished) return <section className="patient-interaction complete"><div className="interaction-complete-icon">✓</div><div><p className="eyebrow">PATIENT ENCOUNTER COMPLETE</p><h2>The encounter has produced a clinical story.</h2><p className="interaction-note">Your communication changed what the patient disclosed and whether the conversation could be repaired after difficulty.</p><div className="interaction-summary-grid"><div><span>Observed state</span><b>{emotionInfo.icon} {emotionInfo.label}</b></div><div><span>Trust</span><b>{trust}%</b></div><div><span>Engagement</span><b>{engagement}%</b></div><div><span>Interaction quality</span><b>{interactionQuality}%</b></div></div><div className="revealed-facts">{revealed.map(f=><span key={f}>✓ {f}</span>)}</div><button className="primary-button" type="button" onClick={()=>onComplete?.({interactionQuality,trust,engagement,emotion,revealed,history},true)}>Continue to clinical reasoning →</button></div></section>;

  const options = repair ? [
    {id:'r1',text:'Acknowledge the concern, apologize for moving too quickly, and invite the patient to continue.',style:'Communication repair',trust:12,engagement:10,empathy:3,emotion:'reassured',response:'Thank you. I do feel more comfortable explaining it now.'},
    {id:'r2',text:'Tell the patient that the assessment must continue and there is no time to revisit the concern.',style:'Missed repair opportunity',trust:-8,engagement:-10,emotion:'distressed',harm:1,response:'Okay... I will just wait for the test.'},
    {id:'r3',text:'Ask the patient to stop worrying until the results are available.',style:'Dismissive reassurance',trust:-10,engagement:-12,emotion:'anxious',harm:1,response:'That makes me feel even less understood.'}
  ] : (prompt?.options || []);

  return <section className="patient-interaction"><div className="patient-scene"><div className="patient-avatar-large">{simulation.patient?.avatar || 'P'}</div><div className="patient-scene-copy"><span className="card-kicker">SIMULATED PATIENT · LIVE ENCOUNTER</span><h2>{simulation.patient?.name || 'Patient'}</h2><p>{simulation.patient?.intro || 'The patient is waiting for you to begin the consultation.'}</p></div><div className={`patient-state ${emotion}`}><span>{emotionInfo.icon}</span><div><small>OBSERVED STATE</small><b>{emotionInfo.label}</b></div></div></div><div className="conversation-card"><div className="conversation-header"><span>{repair ? 'COMMUNICATION REPAIR' : `ENCOUNTER · TURN ${turn + 1}/${simulation.turns.length}`}</span><span>Patient response changes with the encounter</span></div><div className="patient-speech"><span className="speech-avatar">{simulation.patient?.avatar || 'P'}</span><div><b>{simulation.patient?.name || 'Patient'}</b><p>{patientMessage}</p></div></div>{lastResponse && <div className="patient-reaction"><span>Patient response</span><b>{lastResponse}</b></div>}<div className="clinician-prompt"><span>{repair ? 'REPAIR THE ENCOUNTER' : 'YOUR RESPONSE'}</span><h3>{repair ? 'The conversation has become strained. What will you do now?' : prompt?.prompt}</h3></div><div className="interaction-options">{options.map(option=><button key={option.id} type="button" className="interaction-option" onClick={()=>apply(option,repair)}><span className="option-marker">{option.id.toUpperCase()}</span><span><b>{option.text}</b><small>{option.style}</small></span></button>)}</div></div><div className="interaction-meter-row"><div><span>Observed trust trajectory</span><div className="interaction-meter"><i style={{width:`${trust}%`}} /></div></div><div><span>Engagement</span><div className="interaction-meter"><i style={{width:`${engagement}%`}} /></div></div><p>The percentages are prototype analytics; the encounter itself should be interpreted from the patient's words and behaviour.</p></div></section>;
}
