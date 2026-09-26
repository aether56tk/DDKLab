/* DDKLab DSP v10 — multi-scale DDK production detector.
   Local-only deterministic DSP. No Gemini/LLM/remote speech service is used.

   Design goal for DDK: count one production nucleus per syllable, not every
   small wiggle in the amplitude envelope. The detector therefore combines:
   1) short-time absolute-energy envelope,
   2) noise-adaptive normalization,
   3) positive energy-rise/onset strength,
   4) local peak prominence,
   5) a production refractory interval, and
   6) non-maximum suppression across nearby candidates.

   IMPORTANT: this is still a PRELIMINARY detector until validated against
   human-annotated recordings. It must not be described as clinically perfect.
*/
(function(){
'use strict';

const CFG={
  Adult:{minGap:.105, smooth:.030, rise:.018, prom:.045},
  Child:{minGap:.095, smooth:.025, rise:.014, prom:.035},
  Geriatric:{minGap:.110, smooth:.032, rise:.018, prom:.045},
  Dysarthria:{minGap:.085, smooth:.022, rise:.010, prom:.022}
};

function quantile(a,p){
  if(!a.length)return 0;
  const b=Array.from(a).sort((x,y)=>x-y);
  return b[Math.max(0,Math.min(b.length-1,Math.floor((b.length-1)*p)))];
}
function median(a){return quantile(a,.5)}
function rms(a,i,w){
  let s=0,n=0;
  const end=Math.min(a.length,i+w);
  for(let j=i;j<end;j++){const x=a[j];s+=x*x;n++}
  return Math.sqrt(s/(n||1));
}

function detect(audio,sr,mode,isSMR){
  if(!audio?.length||!sr)return {events:[],duration:0,debug:{version:'DSP-v10',reason:'empty'}};

  const cfg=CFG[mode]||CFG.Adult;
  const hop=Math.max(64,Math.round(sr*.005));       // 5 ms
  const win=Math.max(hop*3,Math.round(sr*.020));    // 20 ms energy window
  const step=hop/sr;
  const env=[];

  // Remove DC before envelope extraction.
  let mean=0;
  const meanN=Math.min(audio.length,Math.round(sr*.25));
  for(let i=0;i<meanN;i++)mean+=audio[i];
  mean/=Math.max(1,meanN);
  const x=new Float32Array(audio.length);
  for(let i=0;i<audio.length;i++)x[i]=audio[i]-mean;

  for(let i=0;i+win<=x.length;i+=hop)env.push(rms(x,i,win));
  if(env.length<40)return {events:[],duration:audio.length/sr,debug:{version:'DSP-v10',reason:'too_short'}};

  // Multi-scale smoothing: enough to suppress carrier/noise wiggles while
  // preserving the onset of a weak syllable.
  const smoothFrames=Math.max(2,Math.round(cfg.smooth/step));
  const sm=new Float64Array(env.length);
  let acc=0;
  for(let i=0;i<env.length;i++){
    acc+=env[i];
    if(i>=smoothFrames)acc-=env[i-smoothFrames];
    sm[i]=acc/Math.min(i+1,smoothFrames);
  }

  // Robust noise estimate from the lower part of the envelope.
  const q05=quantile(sm,.05), q20=quantile(sm,.20), q35=quantile(sm,.35), q90=quantile(sm,.90);
  const quiet=Array.from(sm).filter(v=>v<=q35);
  const noise=median(quiet.length?quiet:[q05]);
  const dynamic=Math.max(q90-noise,1e-8);

  // Gentle adaptive activity threshold. Dysarthria gets a lower threshold,
  // but the onset/prominence tests still have to agree.
  const activityFrac=mode==='Dysarthria'?.055:(mode==='Child'?.075:.085);
  const activity=Math.max(noise+dynamic*activityFrac, q20+dynamic*.015);

  // Positive energy-rise strength. Each production normally creates one
  // principal rise; later oscillations in the same syllable are suppressed.
  const riseFrames=Math.max(1,Math.round(cfg.rise/step));
  const rise=new Float64Array(sm.length);
  for(let i=riseFrames;i<sm.length;i++){
    rise[i]=Math.max(0,sm[i]-sm[i-riseFrames]);
  }
  const riseBase=quantile(rise,.50);
  const riseSpread=Math.max(quantile(rise,.90)-riseBase,1e-8);
  const riseThreshold=Math.max(riseBase+riseSpread*.20,dynamic*.008);

  // Local prominence window: wide enough to see the valley between adjacent
  // syllables, but not so wide that a long utterance becomes one peak.
  const lookFrames=Math.max(5,Math.round(.060/step));
  const refractoryFrames=Math.max(1,Math.round((isSMR?Math.max(.095,cfg.minGap):cfg.minGap)/step));

  const candidates=[];
  for(let i=lookFrames;i<sm.length-lookFrames;i++){
    if(sm[i]<activity)continue;
    if(sm[i]<sm[i-1]||sm[i]<sm[i+1])continue;
    if(rise[i]<riseThreshold && sm[i]-sm[i-riseFrames]<dynamic*.012)continue;

    let left=sm[i],right=sm[i];
    for(let k=1;k<=lookFrames;k++){
      if(sm[i-k]<left)left=sm[i-k];
      if(sm[i+k]<right)right=sm[i+k];
    }
    const prominence=sm[i]-Math.max(noise,Math.min(left,right));
    if(prominence<Math.max(cfg.prom*dynamic,dynamic*.018))continue;

    // Score rewards a real onset plus a prominent envelope maximum.
    const score=(prominence/dynamic)*0.72+(rise[i]/Math.max(dynamic,1e-8))*0.28;
    candidates.push({i,v:sm[i],prominence,rise:rise[i],score});
  }

  // Non-maximum suppression. If several maxima occur within one syllable,
  // keep only the strongest one. This is the main correction for the
  // previous 5->11 and 10->6/13->23 failure patterns.
  candidates.sort((a,b)=>b.score-a.score);
  const selected=[];
  for(const c of candidates){
    let tooClose=false;
    for(const s of selected){if(Math.abs(c.i-s.i)<refractoryFrames){tooClose=true;break}}
    if(!tooClose)selected.push(c);
  }
  selected.sort((a,b)=>a.i-b.i);

  // Reject isolated tiny edge events. Do not reject a weak internal event:
  // dysarthric productions can be genuinely low amplitude.
  const edgeFrames=Math.round(.12/step);
  const final=[];
  for(const c of selected){
    if((c.i<edgeFrames||c.i>sm.length-edgeFrames) && c.score<.08)continue;
    final.push(c);
  }

  return {
    events:final.map(x=>x.i*hop/sr),
    duration:audio.length/sr,
    debug:{
      version:'DSP-v10',
      method:'multi-scale RMS energy + adaptive noise floor + onset-rise strength + prominence + refractory NMS',
      threshold:activity,
      noiseFloor:noise,
      prominenceFloor:Math.max(cfg.prom*dynamic,dynamic*.018),
      riseThreshold,
      refractory:refractoryFrames*step,
      candidates:candidates.length,
      selected:final.length,
      sampleRate:sr,
      mode,
      isSMR:!!isSMR
    }
  };
}

window.detectDDK=detect;
window.DDK_DSP_VERSION='DSP-v10';
})();
