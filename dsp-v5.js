/* DDKLab DSP v21 — syllabic production detector
   Local deterministic DSP. No AI/LLM measurement path.
   IMPORTANT: automatic results remain preliminary until validated against
   human-annotated recordings.
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

/*
  Production-level detector.
  Key design choice: do not count every local waveform ripple. A production
  must be a dominant maximum in a syllabic envelope, with sufficient
  prominence above its surrounding trough and sufficient separation from
  neighboring productions.
*/
function detectPeaks(primary,secondary,step,cfg){
  const a=norm(primary),b=norm(secondary),n=Math.min(a.length,b.length),mix=new Float64Array(n);
  for(let i=0;i<n;i++)mix[i]=.70*a[i]+.30*b[i];
  const env=smooth(mix,cfg.smoothMs,step);
  const noise=q(env,.20), p95=q(env,.95), range=Math.max(p95-noise,.03);
  const amplitudeFloor=noise+range*.20;
  const search=Math.max(4,Math.round(.075/step));
  const promFloor=Math.max(.035,range*.075);
  const candidates=[];
  for(let i=search;i<n-search;i++){
    const p=env[i];
    if(p<amplitudeFloor)continue;
    if(p<env[i-1]||p<env[i+1])continue;
    const left=localMin(env,i-search,i-1),right=localMin(env,i+1,i+search);
    const prom=p-Math.max(left,right);
    if(prom<promFloor)continue;
    candidates.push({i,p,prom,score:p+.8*prom});
  }
  candidates.sort((x,y)=>y.score-x.score);
  const chosen=[];
  const minFrames=Math.max(1,Math.round(cfg.minGap/step));
  for(const c of candidates){if(!chosen.some(x=>Math.abs(x.i-c.i)<minFrames))chosen.push(c);}
  chosen.sort((x,y)=>x.i-y.i);

  /* Remove isolated low-energy artifacts. A real production should have a
     meaningful rise/fall neighborhood; this specifically suppresses the
     small post-speech microphone ripples visible in noisy recordings. */
  const filtered=chosen.filter((c,idx)=>{
    const l=localMin(env,c.i-Math.round(.12/step),c.i);
    const r=localMin(env,c.i,c.i+Math.round(.12/step));
    const prominence=c.p-Math.max(l,r);
    return c.p>=noise+range*.24 || prominence>=Math.max(.05,range*.11);
  });

  /* If a recording contains only a few strong productions followed by
     silence/noise, do not let the noise tail create extra events. */
  const strong=filtered.filter(c=>c.p>=noise+range*.30);
  let final=filtered;
  if(strong.length>=2){
    const lastStrong=strong[strong.length-1].i;
    const tailLimit=Math.round(.65/step);
    final=filtered.filter(c=>c.i<=lastStrong+tailLimit);
  }

  return {events:final.map(c=>c.i*step),envelope:env,candidates:candidates.length,selected:final.length};
}

function detect(audio,sr,mode,isSMR){
  if(!audio?.length||!sr)return {events:[],duration:0,debug:{version:'DSP-v21',reason:'empty'}};
  const cfg=CFG[mode]||CFG.Adult,duration=audio.length/sr;
  const n0=Math.min(audio.length,Math.round(sr*.20));let dc=0;for(let i=0;i<n0;i++)dc+=audio[i];dc/=Math.max(1,n0);
  const x=new Float32Array(audio.length);let mx=0;for(let i=0;i<audio.length;i++){x[i]=audio[i]-dc;mx=Math.max(mx,Math.abs(x[i]));}
  if(mx<1e-5)return {events:[],duration,debug:{version:'DSP-v21',reason:'near_silence'}};
  const e=envelope(x,sr,cfg.lpHz),r=rmsEnvelope(x,sr),n=Math.min(e.e.length,r.e.length);
  const primary=e.e.slice(0,n),secondary=r.e.slice(0,n),out=detectPeaks(primary,secondary,e.step,cfg);
  const ints=[];for(let i=1;i<out.events.length;i++)ints.push(out.events[i]-out.events[i-1]);
  const mi=mean(ints),cv=mi?sd(ints)/mi:0;
  return {events:out.events,duration,debug:{version:'DSP-v21',method:'syllabic envelope + RMS consensus + adaptive prominence + non-maximum suppression + noise-tail rejection',sampleRate:sr,mode,isSMR:!!isSMR,candidates:out.candidates,selected:out.selected,meanInterval:mi,intervalCV:cv,smoothingMs:cfg.smoothMs,lowpassHz:cfg.lpHz,minGapMs:cfg.minGap*1000,note:'PRELIMINARY automatic measurement; verify against human waveform annotation.'}};
}
window.detectDDK=detect;
window.DDK_DSP_VERSION='DSP-v21';
})();
