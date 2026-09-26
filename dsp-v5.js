/* DDKLab DSP v7 — deterministic production-event detector.
   Counts production nuclei from an RMS envelope with an explicit speech-activity gate.
   The activity gate is critical: isolated microphone/noise spikes after the speaker stops
   must NOT become DDK events. No AI/LLM is used in the measurement path.
*/
(function(){
'use strict';
const CFG={
  Adult:{minGap:.105, on:.22, off:.13, prom:.16, sustain:.025},
  Child:{minGap:.090, on:.18, off:.11, prom:.13, sustain:.020},
  Geriatric:{minGap:.115, on:.22, off:.13, prom:.16, sustain:.030},
  Dysarthria:{minGap:.085, on:.14, off:.085, prom:.085, sustain:.018}
};
function rms(a,i,w){let s=0,n=0;for(let j=i;j<Math.min(a.length,i+w);j++){const x=a[j];s+=x*x;n++;}return Math.sqrt(s/(n||1));}
function quantile(a,p){if(!a.length)return 0;const b=Array.from(a).sort((x,y)=>x-y);return b[Math.max(0,Math.min(b.length-1,Math.floor((b.length-1)*p)))];}
function median(a){return quantile(a,.5);}
function detect(audio,sr,mode,isSMR){
 if(!audio?.length||!sr)return {events:[],duration:0,debug:{version:'DSP-v7',reason:'empty'}};
 const hop=Math.max(64,Math.round(sr*.010));
 const win=Math.max(hop*2,Math.round(sr*.025));
 const env=[];
 for(let i=0;i+win<=audio.length;i+=hop)env.push(rms(audio,i,win));
 if(env.length<20)return {events:[],duration:audio.length/sr,debug:{version:'DSP-v7',reason:'too_short'}};
 // Smooth enough to suppress burst/vowel microstructure, but retain syllable valleys.
 const sm=new Float64Array(env.length), n=3; let sum=0;
 for(let i=0;i<env.length;i++){sum+=env[i];if(i>=n)sum-=env[i-n];sm[i]=sum/Math.min(i+1,n);}
 const q10=quantile(sm,.10), q25=quantile(sm,.25), q50=median(sm), q90=quantile(sm,.90);
 const span=Math.max(q90-q10,1e-7);
 const cfg=CFG[mode]||CFG.Adult;
 // Robust noise estimate from the lower-energy portion of the envelope.
 const low=Array.from(sm).filter(v=>v<=q25);
 const noiseMed=median(low.length?low:[q10]);
 const absNoiseFloor=noiseMed + Math.max(span*.06,1e-7);
 const onLevel=Math.max(q10+cfg.on*span,absNoiseFloor);
 const offLevel=Math.max(q10+cfg.off*span,absNoiseFloor*.88);
 const promFloor=cfg.prom*span;
 const promFrames=Math.max(4,Math.round(.10/(hop/sr)));
 const minFrames=Math.max(2,Math.round((isSMR?Math.max(.085,cfg.minGap):cfg.minGap)/(hop/sr)));
 const sustainFrames=Math.max(2,Math.round(cfg.sustain/(hop/sr)));
 // Hysteresis speech-activity gate. A frame becomes active only above ON and stays
 // active until it falls below OFF. This prevents isolated noise spikes from creating events.
 const runs=[]; let active=false, start=0;
 for(let i=0;i<sm.length;i++){
   if(!active && sm[i]>=onLevel){active=true;start=i;}
   else if(active && sm[i]<offLevel){
     if(i-start>=sustainFrames)runs.push([start,i]);
     active=false;
   }
 }
 if(active && sm.length-start>=sustainFrames)runs.push([start,sm.length-1]);
 // Expand each active run slightly so the production onset is not clipped by the gate.
 const pad=Math.max(2,Math.round(.04/(hop/sr)));
 const activeRuns=runs.map(([a,b])=>[Math.max(0,a-pad),Math.min(sm.length-1,b+pad)]);
 const candidates=[];
 for(const [a,b] of activeRuns){
   for(let i=Math.max(a,promFrames);i<=Math.min(b,sm.length-promFrames-1);i++){
     const v=sm[i];
     if(v<onLevel||v<sm[i-1]||v<=sm[i+1])continue;
     let l=Infinity,r=Infinity;
     for(let k=1;k<=promFrames;k++){if(sm[i-k]<l)l=sm[i-k];if(sm[i+k]<r)r=sm[i+k];}
     const prominence=v-Math.max(l,r);
     if(prominence<promFloor)continue;
     // Require a short local energy neighborhood. This rejects single-frame clicks/noise.
     let sustain=0;
     for(let k=0;k<sustainFrames;k++){
       if(sm[Math.min(sm.length-1,i+k)]>=offLevel)sustain++;
     }
     if(sustain<Math.max(1,Math.ceil(sustainFrames*.5)))continue;
     candidates.push({i,v,prominence});
   }
 }
 // Non-maximum suppression: one DDK production = one event inside the refractory interval.
 candidates.sort((a,b)=>a.i-b.i);
 const selected=[];
 for(const c of candidates){
   if(!selected.length){selected.push(c);continue;}
   const d=c.i-selected[selected.length-1].i;
   if(d<minFrames){
     if(c.v>selected[selected.length-1].v)selected[selected.length-1]=c;
   }else selected.push(c);
 }
 return {
   events:selected.map(x=>x.i*hop/sr),
   duration:audio.length/sr,
   debug:{
     version:'DSP-v7',
     method:'RMS envelope + hysteresis speech-activity gate + 100ms prominence + refractory NMS',
     threshold:onLevel,
     offThreshold:offLevel,
     noiseFloor:absNoiseFloor,
     prominenceFloor:promFloor,
     refractory:minFrames*hop/sr,
     activeRuns:activeRuns.length,
     candidates:candidates.length,
     selected:selected.length
   }
 };
}
window.detectDDK=detect;
window.DDK_DSP_VERSION='DSP-v7';
})();
