/* DDKLab DSP v5 — independent deterministic acoustic event detector.
   Counts production regions, not raw waveform maxima. No AI/LLM in measurement path. */
(function(){
  'use strict';
  const CFG={Adult:{minGap:.115,offGap:.075,sens:1.55},Child:{minGap:.095,offGap:.065,sens:1.35},Geriatric:{minGap:.125,offGap:.08,sens:1.45},Dysarthria:{minGap:.145,offGap:.09,sens:1.18}};
  function med(a){if(!a.length)return 0;const b=Array.from(a).sort((x,y)=>x-y);return b[Math.floor(b.length/2)];}
  function percentile(a,p){if(!a.length)return 0;const b=Array.from(a).sort((x,y)=>x-y);return b[Math.max(0,Math.min(b.length-1,Math.floor((b.length-1)*p)))];}
  function mean(a){return a.reduce((s,x)=>s+x,0)/(a.length||1);}
  function smooth(a,n){const out=new Float32Array(a.length);let s=0;for(let i=0;i<a.length;i++){s+=a[i];if(i>=n)s-=a[i-n];out[i]=s/Math.min(i+1,n);}return out;}
  function rms(a,i,w){let s=0,n=0;for(let j=i;j<Math.min(a.length,i+w);j++){const x=a[j];s+=x*x;n++;}return Math.sqrt(s/(n||1));}
  function detect(audio,sr,mode,isSMR){
    const hop=Math.max(64,Math.round(sr*.008)); // ~8 ms temporal grid
    const win=Math.max(hop*2,Math.round(sr*.020));
    const raw=[];for(let i=0;i<audio.length;i+=hop)raw.push(rms(audio,i,win));
    if(raw.length<10)return {events:[],duration:audio.length/sr,debug:{version:'DSP-v5',reason:'too_short'}};
    // Median filtering suppresses isolated waveform/envelope spikes.
    const medf=new Float32Array(raw.length);
    for(let i=0;i<raw.length;i++){const q=[];for(let k=-3;k<=3;k++){const z=i+k;q.push(raw[Math.max(0,Math.min(raw.length-1,z))]);}medf[i]=med(q);}
    const env=smooth(medf,7);
    // Robust noise floor from the lower half of the envelope, not the first 250 ms only.
    const noise=med(Array.from(env).filter(x=>x<=percentile(env,.45)))||med(env);
    const q25=percentile(env,.25), q70=percentile(env,.70), q90=percentile(env,.90);
    const cfg=CFG[mode]||CFG.Adult;
    const high=Math.max(noise*cfg.sens, q25+(q70-q25)*.42, q90*.30, 1e-5);
    const low=Math.max(noise*1.12, high*.62);
    const minGap=Math.max(cfg.minGap, isSMR?.105:cfg.minGap);
    const offFrames=Math.max(2,Math.round(cfg.offGap/(hop/sr)));
    // Hysteresis segmentation: one active region may contain many internal acoustic peaks.
    const regions=[];let on=-1,below=0;
    for(let i=0;i<env.length;i++){
      if(on<0){if(env[i]>=high){on=i;below=0;}}
      else if(env[i]>=low){below=0;}
      else {below++;if(below>=offFrames){const end=i-below+1;if(end>on)regions.push([on,end]);on=-1;below=0;}}
    }
    if(on>=0)regions.push([on,env.length-1]);
    // Merge nearby regions unless the intervening valley is genuinely quiet.
    const merged=[];
    const mergeFrames=Math.max(2,Math.round(.075/(hop/sr)));
    for(const r of regions){
      if(!merged.length){merged.push(r);continue;}
      const gap=r[0]-merged[merged.length-1][1];
      const valley=Math.min(...Array.from(env.slice(merged[merged.length-1][1],r[0]+1)));
      if(gap<=mergeFrames || valley>low*.92) merged[merged.length-1][1]=r[1];
      else merged.push(r);
    }
    // One production nucleus per region. If a region is unusually long, split only at a deep valley.
    const nuclei=[];
    for(const r of merged){
      const lo=Math.max(r[0],Math.floor(r[0]+.01/(hop/sr))), hi=Math.min(r[1],Math.ceil(r[1]-.01/(hop/sr)));
      let best=lo,bv=env[lo]||0;
      for(let i=lo+1;i<=hi;i++)if(env[i]>bv){bv=env[i];best=i;}
      nuclei.push({t:best*hop/sr,v:bv});
    }
    // Enforce a physiological refractory period while retaining the stronger candidate.
    const events=[];
    for(const c of nuclei){
      if(!events.length){events.push(c);continue;}
      const d=c.t-events[events.length-1].t;
      if(d>=minGap)events.push(c);
      else if(c.v>events[events.length-1].v)events[events.length-1]=c;
    }
    return {events:events.map(x=>x.t),duration:audio.length/sr,debug:{version:'DSP-v5',noise,high,low,minGap,regions:regions.length,merged:merged.length}};
  }
  // Replace the preliminary detector used by the recording workflow.
  window.detectDDK=function(audio,sr,mode,isSMR){return detect(audio,sr,mode,isSMR);};
  window.DDK_DSP_VERSION='DSP-v5';
})();
