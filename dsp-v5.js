/* DDKLab DSP v16 — hybrid production-event detector
   Local-only deterministic DSP. No cloud / remote speech service.

   Design goal:
   Count DDK PRODUCTIONS, not arbitrary amplitude peaks.

   Pipeline:
   1) DC removal + robust amplitude normalization
   2) short-time RMS envelope
   3) Teager-energy / onset-support feature
   4) adaptive hysteresis segmentation
   5) syllable-scale valley splitting
   6) periodicity-aware candidate scoring
   7) production-scale non-maximum suppression
   8) confidence/quality diagnostics

   This is an independently implemented DSP pipeline informed by published
   DDK segmentation research. It is NOT a claim of clinical diagnostic accuracy.
   Human annotation remains the ground truth for thesis validation.
*/
(function(){
'use strict';

const CFG={
  Adult:{minGap:.145,minMs:55,smoothMs:42,hiFrac:.18,loFrac:.095,mergeGap:.045},
  Child:{minGap:.115,minMs:45,smoothMs:38,hiFrac:.16,loFrac:.085,mergeGap:.040},
  Geriatric:{minGap:.150,minMs:58,smoothMs:45,hiFrac:.18,loFrac:.095,mergeGap:.050},
  Dysarthria:{minGap:.095,minMs:34,smoothMs:34,hiFrac:.12,loFrac:.060,mergeGap:.032}
};

function q(a,p){
  if(!a.length)return 0;
  const b=Array.from(a).sort((x,y)=>x-y);
  return b[Math.max(0,Math.min(b.length-1,Math.floor((b.length-1)*p)))];
}
function mean(a){let s=0;for(const v of a)s+=v;return a.length?s/a.length:0;}
function movingAverage(a,n){
  n=Math.max(1,n);const o=new Float64Array(a.length);let s=0;
  for(let i=0;i<a.length;i++){s+=a[i];if(i>=n)s-=a[i-n];o[i]=s/Math.min(i+1,n)}
  return o;
}
function rms(x,i,w){
  const e=Math.min(x.length,i+w);let s=0,n=0;
  for(let j=i;j<e;j++){const z=x[j];s+=z*z;n++}
  return Math.sqrt(s/(n||1));
}
function envelope(x,sr){
  const hop=Math.max(64,Math.round(sr*.004));
  const win=Math.max(hop*2,Math.round(sr*.014));
  const e=new Float64Array(Math.ceil(x.length/hop));
  for(let k=0,i=0;i<x.length;k++,i+=hop)e[k]=rms(x,i,win);
  return {e,step:hop/sr};
}
function teager(x,sr){
  const hop=Math.max(64,Math.round(sr*.004));
  const w=Math.max(3,Math.round(sr*.006));
  const out=new Float64Array(Math.ceil(x.length/hop));
  for(let k=0,i=0;i<x.length;k++,i+=hop){
    const end=Math.min(x.length,i+w);let s=0,n=0;
    for(let j=Math.max(1,i);j<end-1;j++){
      const psi=x[j]*x[j]-x[j-1]*x[j+1];
      s+=Math.max(0,psi);n++;
    }
    out[k]=Math.sqrt(s/(n||1));
  }
  return {e:out,step:hop/sr};
}
function localMaxIndex(a,l,r){
  l=Math.max(0,l);r=Math.min(a.length-1,r);let bi=l,bv=a[l]||0;
  for(let i=l+1;i<=r;i++)if(a[i]>bv){bv=a[i];bi=i}
  return bi;
}
function localMin(a,l,r){
  l=Math.max(0,l);r=Math.min(a.length-1,r);let m=Infinity;
  for(let i=l;i<=r;i++)if(a[i]<m)m=a[i];return Number.isFinite(m)?m:0;
}
function normalizeFeature(a){
  const p05=q(a,.05),p50=q(a,.50),p95=q(a,.95),span=Math.max(p95-p05,1e-12);
  const o=new Float64Array(a.length);
  for(let i=0;i<a.length;i++)o[i]=Math.max(0,Math.min(1,(a[i]-p05)/span));
  return {v:o,p05,p50,p95,span};
}

/* Estimate the dominant production interval from the smoothed envelope.
   This is only used as a soft timing prior; it never creates an event by itself. */
function estimatePeriod(e,step,minGap,maxGap){
  const lo=Math.max(1,Math.round(minGap/step));
  const hi=Math.min(e.length-1,Math.round(maxGap/step));
  if(hi<=lo+2)return null;
  const z=normalizeFeature(e).v;
  const m=mean(z);let bestLag=0,best=-Infinity;
  for(let lag=lo;lag<=hi;lag++){
    let s=0,n=0;
    for(let i=lag;i<z.length;i++){s+=(z[i]-m)*(z[i-lag]-m);n++}
    const c=s/(n||1);
    if(c>best){best=c;bestLag=lag}
  }
  if(bestLag<=0||best<=0)return null;
  return {period:bestLag*step,score:best};
}

function detect(audio,sr,mode,isSMR){
  if(!audio?.length||!sr)return {events:[],duration:0,debug:{version:'DSP-v16',reason:'empty'}};
  const cfg=CFG[mode]||CFG.Adult;
  const duration=audio.length/sr;

  // 1. DC removal + bounded robust normalization.
  const n0=Math.min(audio.length,Math.round(sr*.25));
  let dc=0;for(let i=0;i<n0;i++)dc+=audio[i];dc/=Math.max(1,n0);
  const x=new Float32Array(audio.length);let peak=0;
  for(let i=0;i<audio.length;i++){const v=audio[i]-dc;x[i]=v;peak=Math.max(peak,Math.abs(v))}
  if(peak<1e-5)return {events:[],duration,debug:{version:'DSP-v16',reason:'near_silence'}};

  const env=envelope(x,sr),tg=teager(x,sr);
  const step=env.step;
  const smoothN=Math.max(2,Math.round(cfg.smoothMs/1000/step));
  const e=movingAverage(env.e,smoothN);
  const t=movingAverage(tg.e,Math.max(2,Math.round(.018/step)));
  const en=normalizeFeature(e),tn=normalizeFeature(t);

  // 2. Robust adaptive noise floor.
  const noise=Math.max(1e-9,(q(e,.05)+q(e,.10)+q(e,.18))/3);
  const p25=q(e,.25),p50=q(e,.50),p90=q(e,.90);
  const span=Math.max(p90-noise,1e-9);
  const hi=Math.max(noise+span*cfg.hiFrac,p25*.30,noise*1.28);
  const lo=Math.max(noise+span*cfg.loFrac,noise*1.12);

  // 3. Hysteresis activity regions.
  const minLen=Math.max(2,Math.round(cfg.minMs/1000/step));
  const mergeLen=Math.max(1,Math.round(cfg.mergeGap/step));
  const active=[];let on=false,st=-1;
  for(let i=0;i<e.length;i++){
    if(!on){if(e[i]>=hi){on=true;st=i}}
    else if(e[i]<lo){active.push([st,i-1]);on=false;st=-1}
  }
  if(on)active.push([st,e.length-1]);

  // Merge tiny gaps but never merge a production-scale gap.
  const merged=[];
  for(const r of active){
    if(!merged.length||r[0]-merged[merged.length-1][1]>mergeLen)merged.push(r.slice());
    else merged[merged.length-1][1]=r[1];
  }

  // 4. Split an over-long activity region at deep valleys. This is the key
  // correction for recordings where several PA/TA/KA productions are joined.
  const regions=[];
  const maxRegion=Math.round((isSMR?.55:.42)/step);
  for(const r0 of merged){
    const queue=[r0.slice()];
    while(queue.length){
      const r=queue.shift();
      const len=r[1]-r[0]+1;
      if(len<=maxRegion){if(len>=minLen)regions.push(r);continue}
      const mid=(r[0]+r[1])>>1;
      const searchA=r[0]+Math.round(len*.20),searchB=r[1]-Math.round(len*.20);
      let valley=searchA,val=Infinity;
      for(let i=searchA;i<=searchB;i++)if(e[i]<val){val=e[i];valley=i}
      const leftPeak=e[localMaxIndex(e,r[0],valley)];
      const rightPeak=e[localMaxIndex(e,valley,r[1])];
      const deep=Math.min(leftPeak,rightPeak)>0 && val/Math.min(leftPeak,rightPeak)<(mode==='Dysarthria'?.82:.68);
      if(deep&&valley-r[0]>=minLen&&r[1]-valley>=minLen){
        queue.unshift([valley+1,r[1]]);queue.unshift([r[0],valley-1]);
      }else{if(len>=minLen)regions.push(r)}
    }
  }

  // 5. Candidate scoring. A production candidate needs an envelope peak plus
  // supporting onset/energy evidence. Teager energy is support, not a second
  // count, so small high-frequency noise cannot create duplicate events.
  const candidates=[];
  for(const [a,b] of regions){
    const bi=localMaxIndex(e,a,b), peakE=e[bi];
    const leftBase=localMin(e,Math.max(0,a-Math.round(.10/step)),Math.max(a,bi-2));
    const rightBase=localMin(e,Math.min(e.length-1,bi+2),Math.min(e.length-1,b+Math.round(.10/step)));
    const base=Math.max(noise,Math.min(leftBase,rightBase));
    const prom=Math.max(0,peakE-base);
    const ep=en.v[bi], tp=tn.v[Math.min(tn.v.length-1,Math.round(bi*env.step/tg.step))];
    const pre=Math.max(0,bi-Math.round(.055/step));
    const slope=Math.max(0,e[bi]-e[pre]);
    const slopeN=Math.min(1,slope/Math.max(span*.20,1e-9));
    const score=.50*Math.min(1,prom/Math.max(span*.45,1e-9))+.25*ep+.15*tp+.10*slopeN;
    const minProm=mode==='Dysarthria'?.035:.060;
    if(prom>=span*minProm && ep>.12 && score>.20){
      candidates.push({i:bi,score,prominence:prom,width:b-a+1,energy:ep,teager:tp});
    }
  }

  // 6. Timing prior from autocorrelation. For steady DDK, use it to prevent
  // duplicate peaks. For irregular dysarthric speech, weaken the prior.
  const period=estimatePeriod(e,step,cfg.minGap,(isSMR?.70:.45));
  const expectedGap=period?Math.max(cfg.minGap*.82,Math.min(cfg.minGap*1.55,period.period*.62)):cfg.minGap;
  const suppress=Math.round((isSMR?expectedGap+.015:expectedGap)/step);

  candidates.sort((a,b)=>b.score-a.score);
  const chosen=[];
  for(const c of candidates){
    let ok=true;
    for(const s of chosen){
      if(Math.abs(c.i-s.i)<suppress){ok=false;break}
    }
    if(ok)chosen.push(c);
  }
  chosen.sort((a,b)=>a.i-b.i);

  // 7. Final production-scale guard.
  const final=[];
  const finalGap=Math.round((isSMR?cfg.minGap+.018:cfg.minGap)/step);
  for(const c of chosen){
    const p=final[final.length-1];
    if(!p||c.i-p.i>=finalGap)final.push(c);
    else if(c.score>p.score)final[final.length-1]=c;
  }
  final.sort((a,b)=>a.i-b.i);

  const intervals=[];for(let i=1;i<final.length;i++)intervals.push((final[i].i-final[i-1].i)*step);
  const meanI=mean(intervals),sdI=intervals.length?Math.sqrt(mean(intervals.map(v=>(v-meanI)**2))):0;
  const cv=meanI?sdI/meanI:0;
  const confidence=final.length<2?0:Math.max(0,Math.min(1,.65*Math.min(1,final.length/5)+.35*(1-Math.min(1,cv))));

  return {
    events:final.map(c=>c.i*step),
    duration,
    debug:{
      version:'DSP-v16',
      method:'hybrid RMS + Teager support + adaptive hysteresis + valley splitting + autocorrelation timing prior + production NMS',
      sampleRate:sr,mode,isSMR:!!isSMR,
      noiseFloor:noise,highThreshold:hi,lowThreshold:lo,
      regions:regions.length,rawCandidates:candidates.length,selected:final.length,
      estimatedPeriod:period?.period||null,periodicityScore:period?.score||0,
      meanInterval:meanI,sdInterval:sdI,intervalCV:cv,qualityConfidence:confidence,
      sensitivityMode:mode==='Dysarthria'?'weak-production enhanced':'standard',
      note:'Automatic events are candidates for research validation; waveform/human annotation remains ground truth.'
    }
  };
}
window.detectDDK=detect;
window.DDK_DSP_VERSION='DSP-v16';
})();
