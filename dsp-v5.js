/* DDKLab DSP v11 — multi-scale production/event detector.
   Local-only deterministic DSP. No Gemini/LLM/remote speech service.

   This revision is deliberately conservative about what counts as one DDK
   production. It uses multi-scale energy envelopes, adaptive noise/activity
   thresholds, onset strength, local prominence, candidate clustering and
   refractory non-maximum suppression. The goal is to reduce both:
     - over-counting from intra-syllable wiggles, and
     - under-counting of weak productions.

   PRELIMINARY: this is an engineering detector, not a clinically validated
   or "perfect" detector. Research claims require human-annotated validation.
*/
(function(){
'use strict';

const CFG={
  Adult:{gap:.085, minProm:.055, act:.075, rise:.16},
  Child:{gap:.075, minProm:.042, act:.060, rise:.12},
  Geriatric:{gap:.090, minProm:.050, act:.070, rise:.15},
  Dysarthria:{gap:.065, minProm:.028, act:.040, rise:.08}
};

function q(a,p){
  if(!a.length)return 0;
  const b=Array.from(a).sort((x,y)=>x-y);
  return b[Math.max(0,Math.min(b.length-1,Math.floor((b.length-1)*p)))];
}
function median(a){return q(a,.5)}
function rms(a,i,w){
  let s=0,n=0;
  const e=Math.min(a.length,i+w);
  for(let j=i;j<e;j++){const z=a[j];s+=z*z;n++;}
  return Math.sqrt(s/(n||1));
}
function smooth(a,n){
  n=Math.max(1,n); const out=new Float64Array(a.length); let sum=0;
  for(let i=0;i<a.length;i++){
    sum+=a[i]; if(i>=n)sum-=a[i-n];
    out[i]=sum/Math.min(i+1,n);
  }
  return out;
}

function envelope(x,sr,ms){
  const hop=Math.max(64,Math.round(sr*.005));
  const win=Math.max(hop*3,Math.round(sr*(ms/1000)));
  const e=[];
  for(let i=0;i+win<=x.length;i+=hop)e.push(rms(x,i,win));
  return {e,hop,step:hop/sr};
}

function detect(audio,sr,mode,isSMR){
  if(!audio?.length||!sr)return {events:[],duration:0,debug:{version:'DSP-v11',reason:'empty'}};
  const cfg=CFG[mode]||CFG.Adult;

  /* Remove DC. */
  let dc=0; const n0=Math.min(audio.length,Math.round(sr*.25));
  for(let i=0;i<n0;i++)dc+=audio[i]; dc/=Math.max(1,n0);
  const x=new Float32Array(audio.length);
  for(let i=0;i<audio.length;i++)x[i]=audio[i]-dc;

  /* Three scales: short captures weak onsets; medium is the primary syllable
     nucleus; long scale prevents tiny ripples becoming independent events. */
  const a=envelope(x,sr,12);
  const b=envelope(x,sr,22);
  const c=envelope(x,sr,38);
  if(a.e.length<40)return {events:[],duration:audio.length/sr,debug:{version:'DSP-v11',reason:'too_short'}};

  const N=b.e.length;
  const short=smooth(a.e,Math.max(2,Math.round(.015/a.step)));
  const mid=smooth(b.e,Math.max(2,Math.round(.020/b.step)));
  const long=smooth(c.e,Math.max(2,Math.round(.035/c.step)));

  /* Interpolate short/long scales onto the medium frame grid. */
  function interp(arr,t){
    const k=t/a.step;
    const i=Math.floor(k), f=k-i;
    if(i<=0)return arr[0]||0;
    if(i>=arr.length-1)return arr[arr.length-1]||0;
    return arr[i]*(1-f)+arr[i+1]*f;
  }

  const feat=new Float64Array(N);
  const rise=new Float64Array(N);
  for(let i=0;i<N;i++){
    const t=i*b.step;
    const s=interp(short,t), m=mid[i], l=interp(long,t);
    /* Keep the nucleus but discount very slow baseline movement. */
    feat[i]=Math.max(0,m*.62+s*.23+l*.15);
    if(i>0)rise[i]=Math.max(0,feat[i]-feat[i-1]);
  }

  const low=Array.from(feat).sort((u,v)=>u-v);
  const p10=q(low,.10), p25=q(low,.25), p50=q(low,.50), p90=q(low,.90);
  const quiet=Array.from(feat).filter(v=>v<=p25);
  const noise=median(quiet.length?quiet:[p10]);
  const dyn=Math.max(p90-noise,1e-9);

  /* Activity is intentionally lower for dysarthria/children, but not zero:
     noise must still be separated from speech by prominence and rise tests. */
  const activity=noise+dyn*cfg.act;
  const promFloor=dyn*cfg.minProm;
  const riseQ=q(rise,.75);
  const riseFloor=Math.max(riseQ*cfg.rise,dyn*.004);

  /* Local peak window is wide enough to collapse multiple samples of one
     vowel/aspiration into one candidate. */
  const look=Math.max(4,Math.round(.055/b.step));
  const gapFrames=Math.max(1,Math.round((isSMR?Math.max(.070,cfg.gap):cfg.gap)/b.step));
  const candidates=[];

  for(let i=look;i<N-look;i++){
    const v=feat[i];
    if(v<activity)continue;
    if(v<feat[i-1] || v<feat[i+1])continue;

    let left=v,right=v;
    for(let k=1;k<=look;k++){
      if(feat[i-k]<left)left=feat[i-k];
      if(feat[i+k]<right)right=feat[i+k];
    }
    const base=Math.max(noise,Math.min(left,right));
    const prominence=v-base;
    const r=rise[i];

    /* A strong local nucleus OR a clear onset is sufficient. */
    if(prominence<promFloor && r<riseFloor)continue;

    const relative=(v-noise)/dyn;
    const ps=prominence/dyn;
    const rs=r/Math.max(dyn,1e-9);
    const score=.55*ps+.25*relative+.20*Math.min(rs,2);
    candidates.push({i,v,prominence,rise:r,score});
  }

  /* Candidate clustering first: if several scales/nearby local maxima describe
     the same syllable, retain the strongest one. */
  candidates.sort((u,v)=>u.i-v.i);
  const clustered=[];
  for(const cand of candidates){
    const last=clustered[clustered.length-1];
    if(last && cand.i-last.i<Math.round(.060/b.step)){
      if(cand.score>last.score)clustered[clustered.length-1]=cand;
    }else clustered.push(cand);
  }

  /* Global NMS: strongest candidate wins inside the production refractory
     interval. This prevents 36 events from five broad syllable nuclei. */
  clustered.sort((u,v)=>v.score-u.score);
  const selected=[];
  for(const cand of clustered){
    if(selected.every(s=>Math.abs(cand.i-s.i)>=gapFrames))selected.push(cand);
  }
  selected.sort((u,v)=>u.i-v.i);

  /* Reject isolated very-low-confidence edge events. */
  const final=[];
  for(const cand of selected){
    const nearEdge=cand.i<Math.round(.10/b.step)||cand.i>N-Math.round(.10/b.step);
    if(nearEdge && cand.score<.09)continue;
    final.push(cand);
  }

  return {
    events:final.map(v=>v.i*b.step),
    duration:audio.length/sr,
    debug:{
      version:'DSP-v11',
      method:'multi-scale RMS envelope + adaptive noise floor + onset strength + prominence + clustering + NMS',
      sampleRate:sr,mode,isSMR:!!isSMR,
      activity,noiseFloor:noise,prominenceFloor:promFloor,riseFloor,
      refractory:gapFrames*b.step,
      rawCandidates:candidates.length,clustered:clustered.length,selected:final.length,
      scalesMs:[12,22,38]
    }
  };
}

window.detectDDK=detect;
window.DDK_DSP_VERSION='DSP-v11';
})();
