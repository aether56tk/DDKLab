/* DDKLab DSP v6 — deterministic DDK production-event detector.
   Counts envelope production nuclei, not raw waveform maxima.
   No AI/LLM in the measurement path. */
(function(){
'use strict';
const CFG={Adult:{minGap:.105,thr:.15,prom:.18},Child:{minGap:.090,thr:.13,prom:.15},Geriatric:{minGap:.115,thr:.15,prom:.18},Dysarthria:{minGap:.085,thr:.09,prom:.10}};
function rms(a,i,w){let s=0,n=0;for(let j=i;j<Math.min(a.length,i+w);j++){const x=a[j];s+=x*x;n++;}return Math.sqrt(s/(n||1));}
function quantile(a,p){if(!a.length)return 0;const b=Array.from(a).sort((x,y)=>x-y);return b[Math.max(0,Math.min(b.length-1,Math.floor((b.length-1)*p)))];}
function detect(audio,sr,mode,isSMR){
 if(!audio?.length||!sr)return {events:[],duration:0,debug:{version:'DSP-v6',reason:'empty'}};
 const hop=Math.max(64,Math.round(sr*.010)), win=Math.max(hop*2,Math.round(sr*.025));
 const env=[];for(let i=0;i+win<=audio.length;i+=hop)env.push(rms(audio,i,win));
 if(env.length<20)return {events:[],duration:audio.length/sr,debug:{version:'DSP-v6',reason:'too_short'}};
 // Short smoothing preserves syllable-to-syllable valleys while suppressing burst/vowel microstructure.
 const sm=new Float64Array(env.length);const n=3;let sum=0;
 for(let i=0;i<env.length;i++){sum+=env[i];if(i>=n)sum-=env[i-n];sm[i]=sum/Math.min(i+1,n);}
 const q10=quantile(sm,.10),q90=quantile(sm,.90),span=Math.max(q90-q10,1e-7);
 const cfg=CFG[mode]||CFG.Adult;
 const threshold=q10+cfg.thr*span;
 // Prominence is measured over ~100 ms on both sides. This rejects secondary peaks
 // caused by the burst/vowel structure of a single syllable.
 const promFrames=Math.max(4,Math.round(.10/(hop/sr)));
 const minFrames=Math.max(2,Math.round((isSMR?Math.max(.085,cfg.minGap):cfg.minGap)/(hop/sr)));
 const candidates=[];
 for(let i=promFrames;i<sm.length-promFrames;i++){
   const v=sm[i];
   if(v<threshold||v<sm[i-1]||v<=sm[i+1])continue;
   let l=Infinity,r=Infinity;
   for(let k=1;k<=promFrames;k++){if(sm[i-k]<l)l=sm[i-k];if(sm[i+k]<r)r=sm[i+k];}
   const prominence=v-Math.max(l,r);
   if(prominence>=cfg.prom*span)candidates.push({i,v,prominence});
 }
 // Non-maximum suppression: one production cannot generate two events inside the refractory interval.
 const selected=[];
 for(const c of candidates){
   if(!selected.length){selected.push(c);continue;}
   const d=c.i-selected[selected.length-1].i;
   if(d<minFrames){
     if(c.v>selected[selected.length-1].v)selected[selected.length-1]=c;
   }else selected.push(c);
 }
 return {events:selected.map(x=>x.i*hop/sr),duration:audio.length/sr,debug:{version:'DSP-v6',method:'RMS envelope + local maximum + 100ms prominence + refractory NMS',threshold,prominenceFloor:cfg.prom*span,refractory:minFrames*hop/sr,candidates:candidates.length,selected:selected.length}};
}
window.detectDDK=detect;
window.DDK_DSP_VERSION='DSP-v6';
})();
