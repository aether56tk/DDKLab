/* DDKLab DSP v19 — production-focused deterministic DDK detector
   Local-only deterministic DSP. The detector is intentionally conservative:
   it counts production-shaped envelope events, not every acoustic ripple.
   Human waveform verification remains required for research-grade use.
*/
(function(){
'use strict';
const CFG={
  Adult:{minGap:.095,prom:.085,activity:.12,width:.018,onset:.018},
  Child:{minGap:.080,prom:.070,activity:.105,width:.016,onset:.014},
  Geriatric:{minGap:.105,prom:.090,activity:.13,width:.020,onset:.020},
  Dysarthria:{minGap:.080,prom:.055,activity:.085,width:.014,onset:.010}
};
function q(a,p){if(!a.length)return 0;const b=Array.from(a).sort((x,y)=>x-y);return b[Math.max(0,Math.min(b.length-1,Math.floor((b.length-1)*p)))];}
function mean(a){return a.length?a.reduce((s,v)=>s+v,0)/a.length:0;}
function sd(a){if(a.length<2)return 0;const m=mean(a);return Math.sqrt(mean(a.map(v=>(v-m)*(v-m))));}
function ma(a,n){n=Math.max(1,n);const o=new Float64Array(a.length);let s=0;for(let i=0;i<a.length;i++){s+=a[i];if(i>=n)s-=a[i-n];o[i]=s/Math.min(i+1,n);}return o;}
function rms(x,i,w){let s=0,n=0,e=Math.min(x.length,i+w);for(let j=i;j<e;j++){s+=x[j]*x[j];n++;}return Math.sqrt(s/(n||1));}
function hp(x,sr,fc){const rc=1/(2*Math.PI*fc),dt=1/sr,a=rc/(rc+dt),y=new Float32Array(x.length);let yp=0,xp=x[0]||0;for(let i=0;i<x.length;i++){const v=x[i];yp=a*(yp+v-xp);y[i]=yp;xp=v;}return y;}
function frameEnv(x,sr){
  const hop=Math.max(64,Math.round(sr*.010));
  const win=Math.max(hop*3,Math.round(sr*.040));
  const n=Math.ceil(x.length/hop),full=new Float64Array(n),burst=new Float64Array(n);
  const b=hp(x,sr,550);
  for(let k=0,i=0;i<x.length;k++,i+=hop){full[k]=rms(x,i,win);burst[k]=rms(b,i,win);}
  return {full,burst,step:hop/sr};
}
function robustNorm(a){const lo=q(a,.25),hi=q(a,.995),sp=Math.max(hi-lo,1e-12),v=new Float64Array(a.length);for(let i=0;i<a.length;i++)v[i]=Math.max(0,Math.min(1,(a[i]-lo)/sp));return {v,lo,hi};}
function localMin(a,l,r){l=Math.max(0,l);r=Math.min(a.length-1,r);let m=Infinity;for(let i=l;i<=r;i++)m=Math.min(m,a[i]);return Number.isFinite(m)?m:0;}
function localMaxIndex(a,l,r){l=Math.max(0,l);r=Math.min(a.length-1,r);let bi=l,bv=a[l]||0;for(let i=l+1;i<=r;i++)if(a[i]>bv){bv=a[i];bi=i;}return bi;}
function widthAtLevel(a,i,level,dir){let j=i;if(dir<0){while(j>0&&a[j]>=level)j--;}else{while(j<a.length-1&&a[j]>=level)j++;}return j;}

/*
  Production candidate detector.
  Important: the envelope is smoothed over ~70 ms before peak picking.
  This suppresses the small oscillations visible inside a single syllable.
*/
function productionCandidates(env,burst,step,cfg){
  const smooth=ma(env,Math.max(2,Math.round(.070/step)));
  const out=[];
  const search=Math.max(3,Math.round(.12/step));
  const base=q(smooth,.30);
  const spread=q(smooth.map(v=>Math.abs(v-base)),.50);
  const maxP=Math.max(...smooth,0);
  const activity=Math.max(cfg.activity,base+2.5*spread,maxP*.16);
  const prominenceFloor=Math.max(cfg.prom,(maxP-base)*.12);

  for(let i=search;i<smooth.length-search;i++){
    const p=smooth[i];
    if(p<activity)continue;
    if(p<smooth[i-1]||p<smooth[i+1])continue;
    const left=localMin(smooth,i-search,i-1);
    const right=localMin(smooth,i+1,i+search);
    const prom=p-Math.max(left,right);
    if(prom<prominenceFloor)continue;
    const onset=p-localMin(smooth,Math.max(0,i-Math.round(.10/step)),i);
    if(onset<cfg.onset)continue;
    const lvl=Math.max(base+spread*.5,p-prom*.55);
    const l=widthAtLevel(smooth,i,lvl,-1),r=widthAtLevel(smooth,i,lvl,1);
    const width=(r-l)*step;
    if(width<cfg.width)continue;
    const bLocal=localMaxIndex(burst,i-Math.round(.05/step),i+Math.round(.05/step));
    const b=burst[bLocal]||0;
    const score=.55*p+.30*prom+.10*Math.min(1,onset/.12)+.05*b;
    out.push({i,p,prom,onset,width,burst:b,score});
  }

  /* Non-maximum suppression: retain one production candidate per event window. */
  out.sort((a,b)=>b.score-a.score);
  const chosen=[],gap=Math.max(1,Math.round(cfg.minGap/step));
  for(const c of out){
    const near=chosen.find(x=>Math.abs(x.i-c.i)<gap);
    if(!near) chosen.push(c);
  }
  chosen.sort((a,b)=>a.i-b.i);
  return chosen;
}

function trimToSpeech(candidates,env,step){
  if(!candidates.length)return candidates;
  const maxP=Math.max(...env,0);
  if(maxP<=0)return candidates;
  /* Ignore low-level trailing microphone noise. */
  const floor=Math.max(.11,maxP*.18);
  let first=-1,last=-1;
  for(let i=0;i<env.length;i++)if(env[i]>=floor){if(first<0)first=i;last=i;}
  if(first<0)return candidates;
  const pad=Math.round(.18/step);
  const lo=Math.max(0,first-pad),hi=Math.min(env.length-1,last+pad);
  return candidates.filter(c=>c.i>=lo&&c.i<=hi);
}

function detect(audio,sr,mode,isSMR){
  if(!audio?.length||!sr)return {events:[],duration:0,debug:{version:'DSP-v19',reason:'empty'}};
  const cfg=CFG[mode]||CFG.Adult,duration=audio.length/sr;
  const n0=Math.min(audio.length,Math.round(sr*.20));
  let dc=0;for(let i=0;i<n0;i++)dc+=audio[i];dc/=Math.max(1,n0);
  const x=new Float32Array(audio.length);let mx=0;
  for(let i=0;i<audio.length;i++){x[i]=audio[i]-dc;mx=Math.max(mx,Math.abs(x[i]));}
  if(mx<1e-5)return {events:[],duration,debug:{version:'DSP-v19',reason:'near_silence'}};

  const f=frameEnv(x,sr),step=f.step;
  const fn=robustNorm(f.full),bn=robustNorm(f.burst);
  const env=ma(fn.v,Math.max(1,Math.round(.025/step)));
  const burst=ma(bn.v,Math.max(1,Math.round(.020/step)));

  let cand=productionCandidates(env,burst,step,cfg);
  cand=trimToSpeech(cand,env,step);

  /* Final spacing pass. Never count two nearby envelope maxima as two
     productions unless the waveform provides enough temporal separation. */
  const gap=Math.max(1,Math.round(cfg.minGap/step));
  const final=[];
  for(const c of cand){
    const prev=final[final.length-1];
    if(prev&&c.i-prev.i<gap){
      if(c.score>prev.score)final[final.length-1]=c;
    }else final.push(c);
  }
  cand=final;

  const events=cand.map(c=>c.i*step);
  const ints=[];for(let i=1;i<events.length;i++)ints.push(events[i]-events[i-1]);
  const mi=mean(ints),cv=mi?sd(ints)/mi:0;

  return {
    events,
    duration,
    debug:{
      version:'DSP-v19',
      method:'smoothed production-envelope peak picking + adaptive prominence + non-maximum suppression + speech-region trimming',
      sampleRate:sr,mode,isSMR:!!isSMR,
      candidates:cand.length,selected:events.length,
      meanInterval:mi,intervalCV:cv,
      smoothingMs:70,minGapMs:cfg.minGap*1000,
      qualityConfidence:events.length?Math.max(0,Math.min(1,.7*(1-Math.min(1,cv))+.3*Math.min(1,events.length/5))):0
    }
  };
}

window.detectDDK=detect;
window.DDK_DSP_VERSION='DSP-v19';
})();
