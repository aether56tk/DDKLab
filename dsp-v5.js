/* DDKLab DSP v22 — refined syllabic production detector
   Local deterministic DSP. No AI/LLM measurement path.
   IMPORTANT: automatic results remain preliminary until validated against
   human-annotated recordings.

   v22 refinement basis:
   - dynamic energy-envelope segmentation is favored over raw static peak picking
   - dual envelope consensus reduces narrow noise spikes and waveform ripples
   - adaptive prominence + local width + inter-event consistency reduce over-counting
   - waveform remains the verification layer
*/
(function(){
'use strict';
const CFG={
  Adult:{minGap:.075, smoothMs:55, lpHz:10},
  Child:{minGap:.065, smoothMs:50, lpHz:11},
  Geriatric:{minGap:.080, smoothMs:60, lpHz:9},
  Dysarthria:{minGap:.055, smoothMs:45, lpHz:12}
};
function q(a,p){if(!a.length)return 0;const b=Array.from(a).sort((x,y)=>x-y);return b[Math.max(0,Math.min(b.length-1,Math.floor((b.length-1)*p)))];}
function mean(a){return a.length?a.reduce((s,v)=>s+v,0)/a.length:0;}
function sd(a){if(a.length<2)return 0;const m=mean(a);return Math.sqrt(mean(a.map(v=>(v-m)*(v-m))));}
function ma(a,n){n=Math.max(1,n);const o=new Float64Array(a.length);let s=0;for(let i=0;i<a.length;i++){s+=a[i];if(i>=n)s-=a[i-n];o[i]=s/Math.min(i+1,n);}return o;}
function lp(a,sr,fc){const alpha=Math.exp(-2*Math.PI*fc/sr),o=new Float64Array(a.length);let z=0;for(let i=0;i<a.length;i++){z=(1-alpha)*a[i]+alpha*z;o[i]=z;}return o;}
function hp(a,sr,fc){const rc=1/(2*Math.PI*fc),dt=1/sr,alpha=rc/(rc+dt),o=new Float64Array(a.length);let yp=0,xp=a[0]||0;for(let i=0;i<a.length;i++){const v=a[i];yp=alpha*(yp+v-xp);o[i]=yp;xp=v;}return o;}
function envelope(x,sr,fc){
  const y=hp(x,sr,70),r=new Float64Array(y.length);
  for(let i=0;i<y.length;i++)r[i]=Math.abs(y[i]);
  const z=lp(r,sr,fc),hop=Math.max(64,Math.round(sr*.01)),n=Math.ceil(x.length/hop),e=new Float64Array(n);
  for(let k=0,i=0;i<x.length;k++,i+=hop){let s=0,c=0,end=Math.min(x.length,i+hop*2);for(let j=i;j<end;j++){s+=z[j];c++;}e[k]=s/(c||1);}
  return {e,step:hop/sr};
}
function rmsEnvelope(x,sr){
  const hop=Math.max(64,Math.round(sr*.01)),win=Math.max(hop*2,Math.round(sr*.025)),n=Math.ceil(x.length/hop),e=new Float64Array(n);
  for(let k=0,i=0;i<x.length;k++,i+=hop){let s=0,c=0,end=Math.min(x.length,i+win);for(let j=i;j<end;j++){s+=x[j]*x[j];c++;}e[k]=Math.sqrt(s/(c||1));}
  return {e,step:hop/sr};
}
function smooth(a,ms,step){return ma(a,Math.max(2,Math.round(ms/1000/step)));}
function localMin(a,l,r){l=Math.max(0,l);r=Math.min(a.length-1,r);let m=Infinity;for(let i=l;i<=r;i++)if(a[i]<m)m=a[i];return Number.isFinite(m)?m:0;}
function localMax(a,l,r){l=Math.max(0,l);r=Math.min(a.length-1,r);let bi=l,b=a[l]||0;for(let i=l+1;i<=r;i++)if(a[i]>b){b=a[i];bi=i;}return bi;}
function norm(a){const lo=q(a,.15),hi=q(a,.98),d=Math.max(hi-lo,1e-9),o=new Float64Array(a.length);for(let i=0;i<a.length;i++)o[i]=Math.max(0,Math.min(1,(a[i]-lo)/d));return o;}
function nearestDistance(c,arr){let d=Infinity;for(const x of arr){if(x===c)continue;d=Math.min(d,Math.abs(x-c));}return d;}

/* Production-level detector.
   A true DDK production should appear as a syllabic energy maximum with
   surrounding energy rise/fall, not merely as a single narrow waveform spike.
*/
function detectPeaks(primary,secondary,step,cfg){
  const a=norm(primary),b=norm(secondary),n=Math.min(a.length,b.length),mix=new Float64Array(n);
  for(let i=0;i<n;i++)mix[i]=.68*a[i]+.32*b[i];

  const env=smooth(mix,cfg.smoothMs,step);
  const fast=smooth(mix,Math.max(22,cfg.smoothMs*.55),step);
  const noise=q(env,.20),p95=q(env,.95),range=Math.max(p95-noise,.03);
  const amplitudeFloor=noise+range*.18;
  const search=Math.max(4,Math.round(.075/step));
  const promFloor=Math.max(.030,range*.065);
  const candidates=[];

  for(let i=search;i<n-search;i++){
    const p=env[i];
    if(p<amplitudeFloor)continue;
    if(p<env[i-1]||p<env[i+1])continue;
    const left=localMin(env,i-search,i-1),right=localMin(env,i+1,i+search);
    const prom=p-Math.max(left,right);
    if(prom<promFloor)continue;

    /* Dual-scale confirmation: locate the corresponding fast-envelope peak
       near the candidate. Narrow noise spikes that exist only at one scale
       lose confidence. */
    const span=Math.max(2,Math.round(.035/step));
    const fi=localMax(fast,i-span,i+span);
    const fp=fast[fi];
    const fastLeft=localMin(fast,fi-span*2,fi-1),fastRight=localMin(fast,fi+1,fi+span*2);
    const fastProm=fp-Math.max(fastLeft,fastRight);
    const consensus=(fp>=q(fast,.25)&&fastProm>=Math.max(.018,range*.035));
    if(!consensus && prom<range*.13)continue;

    /* Approximate syllabic width. A production has an energy neighborhood;
       a single-sample microphone click generally does not. */
    const half=p*.50;
    let l=i,r=i;
    while(l>0&&env[l]>half&&i-l<Math.round(.16/step))l--;
    while(r<n-1&&env[r]>half&&r-i<Math.round(.16/step))r++;
    const width=(r-l)*step;
    if(width<.018 && prom<range*.20)continue;

    candidates.push({i,p,prom,width,score:p+.85*prom+.12*Math.min(width/.12,1),consensus});
  }

  /* Non-maximum suppression. Keep the strongest candidate inside each
     production neighborhood rather than counting internal ripples. */
  candidates.sort((x,y)=>y.score-x.score);
  const chosen=[];
  const minFrames=Math.max(1,Math.round(cfg.minGap/step));
  for(const c of candidates){if(!chosen.some(x=>Math.abs(x.i-c.i)<minFrames))chosen.push(c);}
  chosen.sort((x,y)=>x.i-y.i);

  /* Dynamic energy/pause gate. Literature shows energy-envelope methods are
     generally more robust than raw peak picking for DDK, especially across
     dysarthria severity. Reject weak candidates that sit in a long quiet
     interval between real syllabic events. */
  const filtered=chosen.filter((c,idx)=>{
    const left=localMin(env,c.i-Math.round(.12/step),c.i);
    const right=localMin(env,c.i,c.i+Math.round(.12/step));
    const prominence=c.p-Math.max(left,right);
    const prev=idx?c.i-chosen[idx-1].i:Infinity;
    const next=idx<chosen.length-1?chosen[idx+1].i-c.i:Infinity;
    const localGap=Math.min(prev,next)*step;
    const energyOK=c.p>=noise+range*.22;
    const promOK=prominence>=Math.max(.045,range*.085);
    const isolatedWeak=!Number.isFinite(localGap)||localGap>.48;
    return energyOK && (promOK || c.consensus) && !(isolatedWeak && c.p<noise+range*.42);
  });

  /* Rhythm consistency: if a repetitive train is present, use its robust
     median inter-event interval to suppress closely spaced sub-peaks. This is
     intentionally a soft gate so irregular dysarthric productions are not
     forced into a perfectly periodic rhythm. */
  const anchor=filtered.filter(c=>c.p>=noise+range*.30);
  const anchorInts=[];
  for(let i=1;i<anchor.length;i++)anchorInts.push((anchor[i].i-anchor[i-1].i)*step);
  const expected=anchorInts.length?q(anchorInts,.50):0;
  let rhythm=filtered;
  if(expected>=cfg.minGap*1.15){
    rhythm=filtered.filter((c,idx)=>{
      const gaps=[];
      if(idx>0)gaps.push((c.i-filtered[idx-1].i)*step);
      if(idx<filtered.length-1)gaps.push((filtered[idx+1].i-c.i)*step);
      if(!gaps.length)return true;
      const nearest=Math.min.apply(null,gaps);
      if(nearest<expected*.43 && c.p<noise+range*.62)return false;
      if(nearest>expected*2.35 && c.p<noise+range*.48)return false;
      return true;
    });
  }

  /* Tail protection: stop counting after the last strong syllabic event once
     the signal has fallen into a sustained low-energy region. */
  const strong=rhythm.filter(c=>c.p>=noise+range*.30);
  let final=rhythm;
  if(strong.length>=2){
    const lastStrong=strong[strong.length-1].i;
    const tailLimit=Math.round(.45/step);
    final=rhythm.filter(c=>c.i<=lastStrong+tailLimit);
  }

  return {events:final.map(c=>c.i*step),envelope:env,candidates:candidates.length,selected:final.length,expectedGap:expected};
}

function detect(audio,sr,mode,isSMR){
  if(!audio?.length||!sr)return {events:[],duration:0,debug:{version:'DSP-v22',reason:'empty'}};
  const cfg=CFG[mode]||CFG.Adult,duration=audio.length/sr;
  const n0=Math.min(audio.length,Math.round(sr*.20));let dc=0;for(let i=0;i<n0;i++)dc+=audio[i];dc/=Math.max(1,n0);
  const x=new Float32Array(audio.length);let mx=0;for(let i=0;i<audio.length;i++){x[i]=audio[i]-dc;mx=Math.max(mx,Math.abs(x[i]));}
  if(mx<1e-5)return {events:[],duration,debug:{version:'DSP-v22',reason:'near_silence'}};
  const e=envelope(x,sr,cfg.lpHz),r=rmsEnvelope(x,sr),n=Math.min(e.e.length,r.e.length);
  const primary=e.e.slice(0,n),secondary=r.e.slice(0,n),out=detectPeaks(primary,secondary,e.step,cfg);
  const ints=[];for(let i=1;i<out.events.length;i++)ints.push(out.events[i]-out.events[i-1]);
  const mi=mean(ints),cv=mi?sd(ints)/mi:0;
  return {events:out.events,duration,debug:{version:'DSP-v22',method:'dynamic energy envelope + RMS consensus + dual-scale peak confirmation + adaptive prominence + non-maximum suppression + rhythm consistency + noise-tail rejection',sampleRate:sr,mode,isSMR:!!isSMR,candidates:out.candidates,selected:out.selected,meanInterval:mi,intervalCV:cv,expectedGap:out.expectedGap,smoothingMs:cfg.smoothMs,lowpassHz:cfg.lpHz,minGapMs:cfg.minGap*1000,note:'PRELIMINARY automatic measurement; verify against human waveform annotation.'}};
}
window.detectDDK=detect;
window.DDK_DSP_VERSION='DSP-v22';
})();
