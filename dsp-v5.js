/* DDKLab DSP v20 — multi-envelope, production-level deterministic DDK detector
   Research-oriented local DSP. It estimates production events from syllabic
   amplitude modulation rather than raw waveform maxima. Automatic output is
   preliminary until validated against human annotations.
*/
(function(){
'use strict';
const CFG={
  Adult:{minGap:.075, maxGap:.80, smoothMs:28, prom:.035, floor:.10},
  Child:{minGap:.065, maxGap:.85, smoothMs:25, prom:.030, floor:.09},
  Geriatric:{minGap:.080, maxGap:.90, smoothMs:30, prom:.032, floor:.10},
  Dysarthria:{minGap:.055, maxGap:1.00, smoothMs:22, prom:.022, floor:.075}
};
function q(a,p){if(!a.length)return 0;const b=Array.from(a).sort((x,y)=>x-y);return b[Math.max(0,Math.min(b.length-1,Math.floor((b.length-1)*p)))];}
function mean(a){return a.length?a.reduce((s,v)=>s+v,0)/a.length:0;}
function sd(a){if(a.length<2)return 0;const m=mean(a);return Math.sqrt(mean(a.map(v=>(v-m)*(v-m))));}
function ma(a,n){n=Math.max(1,n);const o=new Float64Array(a.length);let s=0;for(let i=0;i<a.length;i++){s+=a[i];if(i>=n)s-=a[i-n];o[i]=s/Math.min(i+1,n);}return o;}
function rms(x,i,w){let s=0,n=0,e=Math.min(x.length,i+w);for(let j=i;j<e;j++){s+=x[j]*x[j];n++;}return Math.sqrt(s/(n||1));}
function onePoleLP(x,sr,fc){const a=Math.exp(-2*Math.PI*fc/sr);const y=new Float64Array(x.length);let z=0;for(let i=0;i<x.length;i++){z=(1-a)*x[i]+a*z;y[i]=z;}return y;}
function highpass(x,sr,fc){const rc=1/(2*Math.PI*fc),dt=1/sr,a=rc/(rc+dt),y=new Float32Array(x.length);let yp=0,xp=x[0]||0;for(let i=0;i<x.length;i++){const v=x[i];yp=a*(yp+v-xp);y[i]=yp;xp=v;}return y;}
function frameRMS(x,sr,ms){const hop=Math.max(64,Math.round(sr*.010));const win=Math.max(hop*2,Math.round(sr*ms/1000));const n=Math.ceil(x.length/hop),e=new Float64Array(n);for(let k=0,i=0;i<x.length;k++,i+=hop)e[k]=rms(x,i,win);return {e,step:hop/sr};}
function frameRectifiedEnvelope(x,sr){
  const hop=Math.max(64,Math.round(sr*.010)), n=Math.ceil(x.length/hop);
  const hp=highpass(x,sr,80), rect=new Float64Array(hp.length);
  for(let i=0;i<hp.length;i++)rect[i]=Math.abs(hp[i]);
  const lp=onePoleLP(rect,sr,18), e=new Float64Array(n);
  for(let k=0,i=0;i<x.length;k++,i+=hop)e[k]=lp[Math.min(lp.length-1,i+Math.floor(hop/2))];
  return {e,step:hop/sr};
}
function norm(a){const lo=q(a,.20),hi=q(a,.98),d=Math.max(hi-lo,1e-12),v=new Float64Array(a.length);for(let i=0;i<a.length;i++)v[i]=Math.max(0,Math.min(1,(a[i]-lo)/d));return v;}
function localMin(a,l,r){l=Math.max(0,l);r=Math.min(a.length-1,r);let m=Infinity;for(let i=l;i<=r;i++)m=Math.min(m,a[i]);return Number.isFinite(m)?m:0;}
function localMaxIndex(a,l,r){l=Math.max(0,l);r=Math.min(a.length-1,r);let bi=l,bv=a[l]||0;for(let i=l+1;i<=r;i++)if(a[i]>bv){bv=a[i];bi=i;}return bi;}

/*
  Multi-envelope syllabic detector.
  The rectified/low-passed envelope is deliberately kept near the syllabic
  modulation range; RMS supplies robustness to weak productions. The detector
  then selects one dominant maximum per production window.
*/
function detectProductionPeaks(rmsEnv,modEnv,step,cfg){
  const a=norm(rmsEnv), b=norm(modEnv);
  const n=Math.min(a.length,b.length), mix=new Float64Array(n);
  for(let i=0;i<n;i++)mix[i]=.58*b[i]+.42*a[i];
  const smooth=ma(mix,Math.max(2,Math.round(cfg.smoothMs/1000/step)));
  const baseline=q(smooth,.25), globalHi=q(smooth,.98), spread=Math.max(globalHi-baseline,.05);
  const absFloor=Math.max(cfg.floor,baseline+spread*.16);
  const search=Math.max(3,Math.round(.09/step));
  const out=[];

  for(let i=search;i<smooth.length-search;i++){
    const p=smooth[i];
    if(p<absFloor)continue;
    if(p<smooth[i-1]||p<smooth[i+1])continue;
    const left=localMin(smooth,i-search,i-1), right=localMin(smooth,i+1,i+search);
    const trough=Math.max(left,right), prom=p-trough;
    if(prom<cfg.prom)continue;
    const prevTrough=localMin(smooth,Math.max(0,i-Math.round(.22/step)),i);
    const nextTrough=localMin(smooth,i,Math.min(smooth.length-1,i+Math.round(.22/step)));
    const localProm=p-Math.max(prevTrough,nextTrough);
    if(localProm<cfg.prom*.65)continue;
    out.push({i,p,prom,localProm,score:.60*p+.30*prom+.10*localProm});
  }

  /* Greedy non-maximum suppression, then a local-gap cleanup. */
  out.sort((x,y)=>y.score-x.score);
  const chosen=[];
  const minGap=Math.max(1,Math.round(cfg.minGap/step));
  for(const c of out){
    if(!chosen.some(x=>Math.abs(x.i-c.i)<minGap))chosen.push(c);
  }
  chosen.sort((x,y)=>x.i-y.i);
  const final=[];
  for(const c of chosen){
    const prev=final[final.length-1];
    if(!prev){final.push(c);continue;}
    const gap=(c.i-prev.i)*step;
    if(gap<cfg.minGap){if(c.score>prev.score)final[final.length-1]=c;}
    else if(gap<=cfg.maxGap)final.push(c);
    else final.push(c);
  }
  return {peaks:final,envelope:smooth};
}

function speechBounds(env,step){
  if(!env.length)return [0,env.length-1];
  const hi=q(env,.98), lo=q(env,.20), floor=lo+(hi-lo)*.10;
  let first=-1,last=-1;
  for(let i=0;i<env.length;i++)if(env[i]>=floor){if(first<0)first=i;last=i;}
  if(first<0)return [0,env.length-1];
  const pad=Math.round(.25/step);
  return [Math.max(0,first-pad),Math.min(env.length-1,last+pad)];
}

function detect(audio,sr,mode,isSMR){
  if(!audio?.length||!sr)return {events:[],duration:0,debug:{version:'DSP-v20',reason:'empty'}};
  const cfg=CFG[mode]||CFG.Adult,duration=audio.length/sr;
  const n0=Math.min(audio.length,Math.round(sr*.20));let dc=0;for(let i=0;i<n0;i++)dc+=audio[i];dc/=Math.max(1,n0);
  const x=new Float32Array(audio.length);let mx=0;for(let i=0;i<audio.length;i++){x[i]=audio[i]-dc;mx=Math.max(mx,Math.abs(x[i]));}
  if(mx<1e-5)return {events:[],duration,debug:{version:'DSP-v20',reason:'near_silence'}};

  const r=frameRMS(x,sr,24), m=frameRectifiedEnvelope(x,sr), step=r.step;
  const n=Math.min(r.e.length,m.e.length);const re=r.e.slice(0,n), me=m.e.slice(0,n);
  const {peaks,envelope}=detectProductionPeaks(re,me,step,cfg);
  const [lo,hi]=speechBounds(envelope,step);
  const filtered=peaks.filter(p=>p.i>=lo&&p.i<=hi);

  const events=filtered.map(p=>p.i*step);
  const ints=[];for(let i=1;i<events.length;i++)ints.push(events[i]-events[i-1]);
  const mi=mean(ints),cv=mi?sd(ints)/mi:0;
  return {
    events,duration,
    debug:{
      version:'DSP-v20',
      method:'rectified syllabic envelope + RMS consensus + adaptive prominence + non-maximum suppression',
      sampleRate:sr,mode,isSMR:!!isSMR,
      candidates:peaks.length,selected:events.length,
      meanInterval:mi,intervalCV:cv,
      smoothingMs:cfg.smoothMs,minGapMs:cfg.minGap*1000,
      note:'Automatic event count is preliminary and must be validated against human waveform annotation.'
    }
  };
}
window.detectDDK=detect;
window.DDK_DSP_VERSION='DSP-v20';
})();
