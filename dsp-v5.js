/* DDKLab DSP v26 — adaptive syllable detector
   Local deterministic DSP only. No AI/LLM in the measurement path.
   PRELIMINARY until validated against human-annotated recordings.

   v26 improvements:
   - dynamic absolute-energy envelope + RMS consensus
   - local-max + valley/prominence syllable support
   - adaptive repetition-period estimation
   - weak-event rescue between strong events
   - soft rhythm gating (does not force perfect periodicity)
   - refractory/non-maximum suppression
   - sustained-noise/tail rejection
   - event confidence returned for waveform audit/review
*/
(function(){
'use strict';
const CFG={
  Adult:{minGap:.075,smoothMs:48,lpHz:12},
  Child:{minGap:.060,smoothMs:44,lpHz:13},
  Geriatric:{minGap:.080,smoothMs:52,lpHz:11},
  Dysarthria:{minGap:.050,smoothMs:42,lpHz:14}
};
function q(a,p){if(!a.length)return 0;const b=Array.from(a).sort((x,y)=>x-y);return b[Math.max(0,Math.min(b.length-1,Math.floor((b.length-1)*p)))];}
function mean(a){return a.length?a.reduce((s,v)=>s+v,0)/a.length:0;}
function sd(a){if(a.length<2)return 0;const m=mean(a);return Math.sqrt(mean(a.map(v=>(v-m)*(v-m))));}
function ma(a,n){n=Math.max(1,n);const o=new Float64Array(a.length);let s=0;for(let i=0;i<a.length;i++){s+=a[i];if(i>=n)s-=a[i-n];o[i]=s/Math.min(i+1,n);}return o;}
function lp(a,sr,fc){const alpha=Math.exp(-2*Math.PI*fc/sr),o=new Float64Array(a.length);let z=0;for(let i=0;i<a.length;i++){z=(1-alpha)*a[i]+alpha*z;o[i]=z;}return o;}
function hp(a,sr,fc){const rc=1/(2*Math.PI*fc),dt=1/sr,alpha=rc/(rc+dt),o=new Float64Array(a.length);let yp=0,xp=a[0]||0;for(let i=0;i<a.length;i++){const v=a[i];yp=alpha*(yp+v-xp);o[i]=yp;xp=v;}return o;}
function absEnergyEnvelope(x,sr,fc){
  const y=hp(x,sr,70),r=new Float64Array(y.length);for(let i=0;i<y.length;i++)r[i]=y[i]*y[i];
  const z=lp(r,sr,fc),hop=Math.max(64,Math.round(sr*.01)),n=Math.ceil(x.length/hop),e=new Float64Array(n);
  for(let k=0,i=0;i<x.length;k++,i+=hop){let s=0,c=0,end=Math.min(x.length,i+hop*2);for(let j=i;j<end;j++){s+=z[j];c++;}e[k]=Math.sqrt(s/(c||1));}
  return {e,step:hop/sr};
}
function rmsEnvelope(x,sr){
  const hop=Math.max(64,Math.round(sr*.01)),win=Math.max(hop*2,Math.round(sr*.025)),n=Math.ceil(x.length/hop),e=new Float64Array(n);
  for(let k=0,i=0;i<x.length;k++,i+=hop){let s=0,c=0,end=Math.min(x.length,i+win);for(let j=i;j<end;j++){s+=x[j]*x[j];c++;}e[k]=Math.sqrt(s/(c||1));}
  return {e,step:hop/sr};
}
function smooth(a,ms,step){return ma(a,Math.max(2,Math.round(ms/1000/step)));}
function localMin(a,l,r){l=Math.max(0,l);r=Math.min(a.length-1,r);if(l>r)return 0;let m=Infinity;for(let i=l;i<=r;i++)if(a[i]<m)m=a[i];return Number.isFinite(m)?m:0;}
function localMax(a,l,r){l=Math.max(0,l);r=Math.min(a.length-1,r);if(l>r)return l;let bi=l,b=a[l]||0;for(let i=l+1;i<=r;i++)if(a[i]>b){b=a[i];bi=i;}return bi;}
function norm(a){const lo=q(a,.15),hi=q(a,.98),d=Math.max(hi-lo,1e-9),o=new Float64Array(a.length);for(let i=0;i<a.length;i++)o[i]=Math.max(0,Math.min(1,(a[i]-lo)/d));return o;}
function medianInterval(events,step){const z=[];for(let i=1;i<events.length;i++){const d=(events[i].i-events[i-1].i)*step;if(d>.055&&d<.8)z.push(d);}return z.length?q(z,.5):0;}
function dedupe(list,minFrames){list.sort((a,b)=>b.score-a.score);const out=[];for(const c of list){if(!out.some(x=>Math.abs(x.i-c.i)<minFrames))out.push(c);}return out.sort((a,b)=>a.i-b.i);}
function detectPeaks(primary,secondary,step,cfg){
  const a=norm(primary),b=norm(secondary),n=Math.min(a.length,b.length),mix=new Float64Array(n);
  for(let i=0;i<n;i++)mix[i]=.62*a[i]+.38*b[i];
  const env=smooth(mix,cfg.smoothMs,step),fast=smooth(mix,Math.max(20,cfg.smoothMs*.45),step);
  const noise=q(env,.18),hi=q(env,.95),range=Math.max(hi-noise,.025);
  const floor=noise+range*.16,search=Math.max(4,Math.round(.065/step));
  const candidates=[];
  for(let i=search;i<n-search;i++){
    const p=env[i];if(p<floor||p<env[i-1]||p<env[i+1])continue;
    const left=localMin(env,i-search,i-1),right=localMin(env,i+1,i+search);
    const prom=p-Math.max(left,right);if(prom<Math.max(.028,range*.05))continue;
    const span=Math.max(2,Math.round(.03/step)),fi=localMax(fast,i-span,i+span),fp=fast[fi];
    const fl=localMin(fast,fi-span*2,fi-1),fr=localMin(fast,fi+1,fi+span*2),fProm=fp-Math.max(fl,fr);
    const consensus=fProm>=Math.max(.014,range*.028);
    if(!consensus&&prom<range*.105)continue;
    const half=p*.50;let l=i,r=i;while(l>0&&env[l]>half&&i-l<Math.round(.18/step))l--;while(r<n-1&&env[r]>half&&r-i<Math.round(.18/step))r++;
    const width=(r-l)*step;if(width<.018&&prom<range*.18)continue;
    const score=.52*p+.38*Math.min(prom,1)+.10*Math.min(width/.10,1);
    candidates.push({i,p,prom,width,score,consensus});
  }
  const chosen=dedupe(candidates,Math.max(1,Math.round(cfg.minGap/step)));
  if(!chosen.length)return {events:[],candidates:candidates.length,selected:0,expectedGap:0,noise,range};

  /* First pass: keep robust events and estimate the person's own repetition period. */
  const strong=chosen.filter(c=>c.p>=noise+range*.28&&c.prom>=Math.max(.04,range*.065));
  let expected=medianInterval(strong,step);
  if(!expected)expected=medianInterval(chosen,step);

  /* If a repetitive train exists, remove weak sub-peaks that fall far inside
     the expected interval. Strong irregular events are retained. */
  let filtered=chosen.filter((c,idx)=>{
    if(c.p>=noise+range*.34&&c.prom>=range*.075)return true;
    if(!expected)return c.p>=noise+range*.20;
    const prev=idx?((c.i-chosen[idx-1].i)*step):Infinity;
    const next=idx<chosen.length-1?((chosen[idx+1].i-c.i)*step):Infinity;
    const nearest=Math.min(prev,next);
    if(nearest<expected*.42&&c.p<noise+range*.62)return false;
    if(nearest<expected*.58&&c.prom<range*.10)return false;
    return c.p>=noise+range*.20;
  });

  /* Weak-event rescue: when two reliable productions are separated by a
     plausible missing interval, search around expected positions for the best
     lower-amplitude candidate. This prevents weak syllables disappearing just
     because neighboring productions are louder. */
  if(expected>=cfg.minGap*1.15&&filtered.length>=2){
    const rescued=[];
    for(let j=0;j<filtered.length-1;j++){
      const A=filtered[j],B=filtered[j+1],gap=(B.i-A.i)*step;
      if(gap<expected*1.42||gap>expected*2.55)continue;
      const target=A.i+Math.round(expected/step),tol=Math.round(Math.min(expected*.34,.11)/step);
      let best=null;
      for(const c of chosen){if(c.i<=A.i+Math.round(cfg.minGap/step)||c.i>=B.i-Math.round(cfg.minGap/step))continue;if(Math.abs(c.i-target)>tol)continue;if(!best||c.score>best.score)best=c;}
      if(best&&best.p>=noise+range*.16)rescued.push({...best,rescued:true,score:best.score*.92});
    }
    filtered=dedupe(filtered.concat(rescued),Math.max(1,Math.round(cfg.minGap/step)));
  }

  /* Re-estimate rhythm after rescue and apply only a soft plausibility gate. */
  expected=medianInterval(filtered,step)||expected;
  if(expected){
    filtered=filtered.filter((c,idx)=>{
      const prev=idx?((c.i-filtered[idx-1].i)*step):Infinity,next=idx<filtered.length-1?((filtered[idx+1].i-c.i)*step):Infinity;
      const nearest=Math.min(prev,next);
      if(!Number.isFinite(nearest))return c.p>=noise+range*.18;
      if(nearest<expected*.40&&c.p<noise+range*.68)return false;
      if(nearest>expected*2.8&&c.p<noise+range*.46)return false;
      return c.p>=noise+range*.16;
    });
  }

  /* Sustained-tail protection, but preserve a real final syllable with a
     strong envelope rise. */
  const strong2=filtered.filter(c=>c.p>=noise+range*.30);
  if(strong2.length>=2){const last=strong2[strong2.length-1].i,limit=Math.round(.40/step);filtered=filtered.filter(c=>c.i<=last+limit);}

  const events=filtered.map(c=>{
    const conf=Math.max(0,Math.min(1,.45*c.p+.40*Math.min(c.prom/.35,1)+.15*(c.consensus?1:0)));return {...c,confidence:conf};
  });
  return {events,candidates:candidates.length,selected:events.length,expectedGap:expected,noise,range};
}
function movingMean(x,n){const o=new Float32Array(x.length);let s=0;for(let i=0;i<x.length;i++){s+=x[i];if(i>=n)s-=x[i-n];o[i]=s/Math.min(i+1,n)}return o}
function preprocessForDDK(audio,sr){
  // Praat-inspired preprocessing: remove mean pressure/DC, then form a smooth
  // intensity representation and suppress stationary background energy without
  // deleting transient speech bursts. This is noise attenuation, not denoising AI.
  const x=new Float32Array(audio.length);const n0=Math.min(audio.length,Math.round(sr*.25));
  let dc=0;for(let i=0;i<n0;i++)dc+=audio[i];dc/=Math.max(1,n0);
  let prev=0,noiseEnergy=[];const hop=Math.max(64,Math.round(sr*.01));
  for(let i=0;i<audio.length;i+=hop){let s=0,end=Math.min(audio.length,i+hop);for(let j=i;j<end;j++){const v=audio[j]-dc;s+=v*v}noiseEnergy.push(Math.sqrt(s/Math.max(1,end-i)))}
  const sorted=[...noiseEnergy].sort((a,b)=>a-b),noise=q(sorted,.15),gate=noise*1.75;
  let hpState=0,lastIn=0;
  for(let i=0;i<audio.length;i++){
    const v=audio[i]-dc;
    // lightweight first-order high-pass (~70 Hz) to remove rumble/DC while retaining DDK bursts
    hpState=.995*(hpState+v-lastIn);lastIn=v;
    x[i]=Math.abs(hpState)<gate*.55?hpState*.18:hpState;
  }
  let mx=0;for(const v of x)mx=Math.max(mx,Math.abs(v));
  if(mx>0.98){const g=.92/mx;for(let i=0;i<x.length;i++)x[i]*=g}
  return {audio:x,noiseFloor:noise,gate,attenuation:noise>0?1-Math.min(1,gate/(noise+1e-9)):.0};
}
function qualityMetrics(x,sr){
  let sum=0,peak=0;for(const v of x){sum+=v*v;peak=Math.max(peak,Math.abs(v))}
  const rms=Math.sqrt(sum/Math.max(1,x.length));
  const dbfs=20*Math.log10(Math.max(rms,1e-9));
  const clip=x.reduce((n,v)=>n+(Math.abs(v)>=.98?1:0),0)/Math.max(1,x.length);
  const head=Math.min(x.length,Math.round(sr*.5));let hs=0;for(let i=0;i<head;i++)hs+=x[i]*x[i];
  const tail=Math.max(0,x.length-head);let ts=0;for(let i=x.length-tail;i<x.length;i++)ts+=x[i]*x[i];
  return {rms,dbfs,peak,clipRatio:clip,headRms:Math.sqrt(hs/Math.max(1,head)),tailRms:Math.sqrt(ts/Math.max(1,tail))};
}
function confidenceLabel(c){return c>=.78?'HIGH':c>=.58?'MODERATE':c>=.40?'LOW':'VERY LOW';}
function detect(audio,sr,mode,isSMR,overrides){
  if(!audio?.length||!sr)return {events:[],duration:0,debug:{version:'DSP-v26',reason:'empty'}};
  const base=CFG[mode]||CFG.Adult,ov=arguments.length>4&&arguments[4]?arguments[4]:{},cfg={...base,...ov},duration=audio.length/sr;
  const prep=preprocessForDDK(audio,sr),x=prep.audio,qc=qualityMetrics(x,sr);let mx=0;for(const v of x)mx=Math.max(mx,Math.abs(v));
  if(mx<1e-5)return {events:[],duration,debug:{version:'DSP-v26',reason:'near_silence',noiseFloor:prep.noiseFloor}};
  const e=absEnergyEnvelope(x,sr,cfg.lpHz),r=rmsEnvelope(x,sr),n=Math.min(e.e.length,r.e.length);
  const out=detectPeaks(e.e.slice(0,n),r.e.slice(0,n),e.step,cfg),events=out.events.map(v=>v.i*e.step);
  const ints=[];for(let i=1;i<events.length;i++)ints.push(events[i]-events[i-1]);
  const mi=mean(ints),cv=mi?sd(ints)/mi:0;
  const meanConf=out.events.length?mean(out.events.map(v=>v.confidence)):0;
  const rhythmScore=out.events.length>2?Math.max(0,Math.min(1,1-cv)):0;
  const signalScore=Math.max(0,Math.min(1,(qc.dbfs+45)/30))*(1-Math.min(.5,qc.clipRatio*8));
  const sessionConfidence=Math.max(0,Math.min(1,.50*meanConf+.25*rhythmScore+.25*signalScore));
  return {events,duration,debug:{version:'DSP-v26',method:'dynamic absolute-energy envelope + RMS consensus + valley/prominence support + adaptive repetition-period estimation + weak-event rescue + soft rhythm gate + refractory suppression + tail rejection',sampleRate:sr,mode,isSMR:!!isSMR,candidates:out.candidates,selected:out.selected,meanInterval:mi,intervalCV:cv,expectedGap:out.expectedGap,smoothingMs:cfg.smoothMs,lowpassHz:cfg.lpHz,minGapMs:cfg.minGap*1000,eventConfidence:out.events.map(c=>({score:c.confidence,label:confidenceLabel(c.confidence),rescued:!!c.rescued})),meanEventConfidence:meanConf,sessionConfidence,sessionConfidenceLabel:confidenceLabel(sessionConfidence),rhythmScore,signalScore,quality:qc,rescuedEvents:out.events.filter(c=>c.rescued).length,noiseFloor:prep.noiseFloor,noiseGate:prep.gate,preprocessing:'mean-pressure subtraction + adaptive stationary-noise attenuation + 70-Hz high-pass',referenceModel:'Praat-inspired intensity contour / local prominence / peak interpolation principles; not a Praat implementation',note:'PRELIMINARY automatic measurement; verify against human waveform annotation.'}};
}
window.detectDDK=detect;
window.detectDDKWithConfig=function(audio,sr,mode,isSMR,overrides){return detect(audio,sr,mode,isSMR,overrides||{})};
window.DDK_DSP_VERSION='DSP-v26';
})();
