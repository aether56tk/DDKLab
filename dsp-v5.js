/* DDKLab DSP v14 — adaptive production peak detector
   Local-only deterministic DSP. No remote speech service.
   PRELIMINARY: engineering detector; research/clinical claims require human-annotated validation.

   v14 fixes the two opposite failures seen in testing:
   - v13 could reject real productions because its activity gate became too high.
   - earlier versions could count several local maxima inside one production.

   Strategy:
   1) DC removal
   2) 10-ms RMS energy envelope
   3) 40–55-ms smoothing depending on clinical mode
   4) robust percentile noise/activity threshold
   5) production-scale peak prominence (not tiny local maxima)
   6) non-maximum suppression with a clinical-mode refractory interval
   7) edge/transient rejection
*/
(function(){
'use strict';
const CFG={
  Adult:{minGap:.135,smoothMs:45,promWindowMs:120,promFrac:.105,thresholdFrac:.18},
  Child:{minGap:.125,smoothMs:42,promWindowMs:105,promFrac:.09,thresholdFrac:.16},
  Geriatric:{minGap:.140,smoothMs:48,promWindowMs:125,promFrac:.10,thresholdFrac:.17},
  Dysarthria:{minGap:.105,smoothMs:40,promWindowMs:95,promFrac:.065,thresholdFrac:.13}
};
function q(a,p){if(!a.length)return 0;const b=Array.from(a).sort((x,y)=>x-y);return b[Math.max(0,Math.min(b.length-1,Math.floor((b.length-1)*p)))];}
function rms(x,i,w){const e=Math.min(x.length,i+w);let s=0,n=0;for(let j=i;j<e;j++){const z=x[j];s+=z*z;n++;}return Math.sqrt(s/(n||1));}
function movingAverage(a,n){n=Math.max(1,n);const o=new Float64Array(a.length);let sum=0;for(let i=0;i<a.length;i++){sum+=a[i];if(i>=n)sum-=a[i-n];o[i]=sum/Math.min(i+1,n);}return o;}
function envelope(x,sr){const hop=Math.max(64,Math.round(sr*.005));const win=Math.max(hop*2,Math.round(sr*.010));const e=[];for(let i=0;i<x.length;i+=hop)e.push(rms(x,i,win));return {e,step:hop/sr};}
function localMin(a,l,r){l=Math.max(0,l);r=Math.min(a.length-1,r);let m=Infinity;for(let i=l;i<=r;i++)if(a[i]<m)m=a[i];return Number.isFinite(m)?m:0;}
function detect(audio,sr,mode,isSMR){
  if(!audio?.length||!sr)return {events:[],duration:0,debug:{version:'DSP-v14',reason:'empty'}};
  const cfg=CFG[mode]||CFG.Adult;

  // Remove microphone/DC offset without altering the speech envelope.
  const n0=Math.min(audio.length,Math.round(sr*.20));
  let dc=0;for(let i=0;i<n0;i++)dc+=audio[i];dc/=Math.max(1,n0);
  const x=new Float32Array(audio.length);for(let i=0;i<audio.length;i++)x[i]=audio[i]-dc;

  const z=envelope(x,sr);if(z.e.length<50)return {events:[],duration:audio.length/sr,debug:{version:'DSP-v14',reason:'too_short'}};
  const raw=Float64Array.from(z.e);
  const smoothN=Math.max(2,Math.round(cfg.smoothMs/1000/z.step));
  const e=movingAverage(raw,smoothN);

  // Robust energy statistics. Percentiles are used instead of a fixed amplitude
  // threshold because phone microphones and speakers have very different gains.
  const p05=q(e,.05),p10=q(e,.10),p15=q(e,.15),p20=q(e,.20),p50=q(e,.50),p85=q(e,.85),p90=q(e,.90),p95=q(e,.95);
  const noise=Math.max(p05,Math.min(p20,(p10+p15+p20)/3));
  const span=Math.max(p90-noise,1e-9);
  const activityFloor=noise+span*cfg.thresholdFrac;
  const absoluteFloor=Math.max(noise*1.15,p50*0.045);
  const threshold=Math.max(activityFloor,absoluteFloor);
  const promFloor=Math.max(span*cfg.promFrac,noise*.10,1e-5);

  // Candidate production peaks.
  const half=Math.max(3,Math.round(cfg.promWindowMs/1000/z.step));
  const candidates=[];
  const edge=Math.round(.12/z.step);
  for(let i=half;i<e.length-half;i++){
    const v=e[i];
    if(v<threshold)continue;
    if(v<e[i-1]||v<e[i+1])continue;
    const left=localMin(e,i-half,i-2);
    const right=localMin(e,i+2,i+half);
    // Use the higher surrounding valley as the baseline. This requires a peak
    // to rise out of both sides of its neighbourhood, suppressing internal ripples.
    const base=Math.max(noise,Math.max(left,right));
    const prominence=v-base;
    if(prominence<promFloor)continue;
    const score=(prominence/span)*.65+((v-noise)/span)*.35;
    candidates.push({i,v,prominence,score});
  }

  // Non-maximum suppression: one production should not yield multiple peaks.
  // The gap is short enough for fast AMR but long enough to suppress consonant
  // burst + vowel/secondary-maxima pairs within one production.
  const gap=Math.round((isSMR?cfg.minGap+.015:cfg.minGap)/z.step);
  candidates.sort((a,b)=>b.score-a.score);
  const chosen=[];
  for(const c of candidates){
    if(c.i<edge||c.i>=e.length-edge)continue;
    if(chosen.every(s=>Math.abs(c.i-s.i)>=gap))chosen.push(c);
  }
  chosen.sort((a,b)=>a.i-b.i);

  // Final shoulder suppression. If two accepted peaks are still within 170 ms,
  // keep the stronger production-scale peak rather than counting both.
  const shoulder=Math.round((isSMR?.190:.170)/z.step);
  const final=[];
  for(const c of chosen){
    const prev=final[final.length-1];
    if(prev&&c.i-prev.i<shoulder){
      if(c.score>prev.score)final[final.length-1]=c;
    }else final.push(c);
  }

  // If the strict pass finds nothing, run a conservative region fallback. This
  // prevents a quiet speaker from becoming a false zero while retaining one event
  // per broad energy region.
  let output=final;
  let fallbackUsed=false;
  if(output.length===0){
    const active=e.map(v=>v>=threshold?1:0);
    const minLen=Math.max(3,Math.round(.045/z.step));
    const regions=[];let st=-1;
    for(let i=0;i<=active.length;i++){
      if(i<active.length&&active[i]){if(st<0)st=i;}
      else if(st>=0){if(i-st>=minLen)regions.push([st,i-1]);st=-1;}
    }
    const fallback=[];
    for(const [a,b] of regions){
      let bi=a,bv=e[a];for(let i=a+1;i<=b;i++)if(e[i]>bv){bv=e[i];bi=i;}
      if(bv-noise>=promFloor*.65)fallback.push({i:bi,v:bv,prominence:bv-noise,score:(bv-noise)/span});
    }
    fallback.sort((a,b)=>a.i-b.i);
    for(const c of fallback){
      const prev=output[output.length-1];
      if(!prev||c.i-prev.i>=gap)output.push(c);
      else if(c.score>prev.score)output[output.length-1]=c;
    }
    fallbackUsed=true;
  }

  output.sort((a,b)=>a.i-b.i);
  return {
    events:output.map(c=>c.i*z.step),
    duration:audio.length/sr,
    debug:{
      version:'DSP-v14',
      method:'10-ms RMS + adaptive percentile threshold + production-scale prominence + non-maximum suppression',
      sampleRate:sr,mode,isSMR:!!isSMR,
      noiseFloor:noise,activityFloor:threshold,prominenceFloor:promFloor,
      minGapSeconds:cfg.minGap,promWindowMs:cfg.promWindowMs,
      smoothingMs:cfg.smoothMs,rawCandidates:candidates.length,
      selected:output.length,fallbackUsed
    }
  };
}
window.detectDDK=detect;
window.DDK_DSP_VERSION='DSP-v14';
})();
