/* DDKLab DSP v12 — robust DDK event detector
   Local-only deterministic DSP. No Gemini/LLM/remote speech service.

   Design goal: count production nuclei rather than every waveform wiggle.
   The detector first establishes speech-energy regions, then finds one
   dominant acoustic nucleus per production using prominence + refractory
   peak selection. Weak productions are retained when they have sufficient
   absolute activity, while low-energy tail noise is rejected.

   PRELIMINARY: this is an engineering detector, not a clinically validated
   or "perfect" detector. Research claims require human-annotated validation.
*/
(function(){
'use strict';

const CFG={
  Adult:{minGap:.105, activity:.12, prom:.055, smoothMs:42},
  Child:{minGap:.090, activity:.095, prom:.040, smoothMs:36},
  Geriatric:{minGap:.110, activity:.105, prom:.045, smoothMs:45},
  Dysarthria:{minGap:.085, activity:.070, prom:.030, smoothMs:34}
};

function quantile(a,p){
  if(!a.length)return 0;
  const b=Array.from(a).sort((x,y)=>x-y);
  return b[Math.max(0,Math.min(b.length-1,Math.floor((b.length-1)*p)))];
}
function rms(x,i,w){
  const e=Math.min(x.length,i+w); let s=0,n=0;
  for(let j=i;j<e;j++){const z=x[j];s+=z*z;n++;}
  return Math.sqrt(s/(n||1));
}
function smooth(a,n){
  n=Math.max(1,n); const out=new Float64Array(a.length); let sum=0;
  for(let i=0;i<a.length;i++){sum+=a[i];if(i>=n)sum-=a[i-n];out[i]=sum/Math.min(i+1,n)}
  return out;
}
function envelope(x,sr,ms){
  const hop=Math.max(64,Math.round(sr*.005));
  const win=Math.max(hop*2,Math.round(sr*ms/1000));
  const e=[];
  for(let i=0;i+win<=x.length;i+=hop)e.push(rms(x,i,win));
  return {e,step:hop/sr};
}

function detect(audio,sr,mode,isSMR){
  if(!audio?.length||!sr)return {events:[],duration:0,debug:{version:'DSP-v12',reason:'empty'}};
  const cfg=CFG[mode]||CFG.Adult;

  /* DC removal. */
  const n0=Math.min(audio.length,Math.round(sr*.25));
  let dc=0; for(let i=0;i<n0;i++)dc+=audio[i]; dc/=Math.max(1,n0);
  const x=new Float32Array(audio.length);
  for(let i=0;i<audio.length;i++)x[i]=audio[i]-dc;

  /* 18-ms RMS captures short consonant bursts; smoothing creates one broad
     production nucleus instead of multiple sample-level maxima. */
  const env=envelope(x,sr,18);
  if(env.e.length<50)return {events:[],duration:audio.length/sr,debug:{version:'DSP-v12',reason:'too_short'}};
  const raw=Float64Array.from(env.e);
  const smoothN=Math.max(2,Math.round(cfg.smoothMs/1000/env.step));
  const e=smooth(raw,smoothN);

  const sorted=Array.from(e).sort((a,b)=>a-b);
  const p10=quantile(sorted,.10), p20=quantile(sorted,.20), p35=quantile(sorted,.35), p90=quantile(sorted,.90);
  const noise=Math.max(p10,(p10+p20)/2);
  const dyn=Math.max(p90-noise,1e-9);

  /* Absolute activity gate is important: otherwise the end-of-recording
     noise can become a "peak" simply because it is locally larger than its
     neighbors. */
  const activityFloor=Math.max(noise*1.75,noise+dyn*cfg.activity);
  const promFloor=Math.max(dyn*cfg.prom,noise*.20);

  /* Build speech-energy regions. Small holes are filled; short regions are
     discarded. This prevents isolated microphone noise from becoming events. */
  const active=new Uint8Array(e.length);
  for(let i=0;i<e.length;i++)if(e[i]>=activityFloor)active[i]=1;
  const close=Math.max(1,Math.round(.055/env.step));
  for(let i=0;i<e.length;i++){
    if(active[i])continue;
    let l=i; while(l>0&&active[l-1]===0&&i-l<close)l--;
    let r=i; while(r<e.length&&active[r]===0&&r-i<close)r++;
    if(l>0&&r<e.length&&active[l-1]&&active[r])for(let k=l;k<=r;k++)active[k]=1;
  }

  const regions=[]; let start=-1;
  const minRegion=Math.round(.055/env.step);
  for(let i=0;i<=active.length;i++){
    if(i<active.length&&active[i]){if(start<0)start=i}
    else if(start>=0){if(i-start>=minRegion)regions.push([start,i-1]);start=-1}
  }

  const candidates=[];
  const peakHalf=Math.max(2,Math.round(.045/env.step));
  for(const [a,b] of regions){
    /* Local maxima within each active region. */
    for(let i=Math.max(a+1,peakHalf);i<=Math.min(b-1,e.length-peakHalf-1);i++){
      const v=e[i];
      if(v<e[i-1]||v<e[i+1])continue;
      let left=v,right=v;
      for(let k=1;k<=peakHalf;k++){left=Math.min(left,e[i-k]);right=Math.min(right,e[i+k])}
      const base=Math.max(noise,Math.min(left,right));
      const prom=v-base;
      if(v<activityFloor||prom<promFloor)continue;
      const score=.70*(prom/dyn)+.30*((v-noise)/dyn);
      candidates.push({i,v,prom,score});
    }
  }

  /* If a region contains several productions, keep the strongest local peak
     in each refractory window. A DDK production cannot legitimately create
     multiple counted events a few milliseconds apart. */
  candidates.sort((a,b)=>b.score-a.score);
  const minGap=Math.max(.075,isSMR?Math.max(.085,cfg.minGap):cfg.minGap);
  const gap=Math.round(minGap/env.step);
  const selected=[];
  for(const c of candidates){
    if(selected.every(s=>Math.abs(c.i-s.i)>=gap))selected.push(c);
  }
  selected.sort((a,b)=>a.i-b.i);

  /* Boundary protection: ignore weak detections in the first/last 120 ms. */
  const edge=Math.round(.12/env.step);
  const final=selected.filter(c=>!(c.i<edge||c.i>=e.length-edge)||c.score>=.18);

  return {
    events:final.map(c=>c.i*env.step),
    duration:audio.length/sr,
    debug:{
      version:'DSP-v12',
      method:'RMS energy regions + adaptive absolute activity gate + local prominence + refractory peak selection',
      sampleRate:sr,mode,isSMR:!!isSMR,
      noiseFloor:noise,activityFloor,prominenceFloor,
      minGapSeconds:minGap,
      activeRegions:regions.length,
      rawCandidates:candidates.length,
      selected:final.length,
      envelopeMs:18,smoothingMs:cfg.smoothMs
    }
  };
}

window.detectDDK=detect;
window.DDK_DSP_VERSION='DSP-v12';
})();
