/* DDKLab DSP v8 — deterministic DDK production-event detector.
   Counts production nuclei from an amplitude envelope. No AI/LLM is used in the measurement path.
   v8 specifically reduces missed productions caused by an overly high activity gate and 100-ms prominence window.
*/
(function(){
'use strict';
const CFG={
  Adult:{minGap:.085,on:.12,off:.065,prom:.065,sustain:.015,look:.055},
  Child:{minGap:.075,on:.10,off:.055,prom:.055,sustain:.012,look:.045},
  Geriatric:{minGap:.095,on:.13,off:.070,prom:.070,sustain:.018,look:.060},
  Dysarthria:{minGap:.070,on:.075,off:.040,prom:.040,sustain:.010,look:.040}
};
function rms(a,i,w){let s=0,n=0;for(let j=i;j<Math.min(a.length,i+w);j++){const x=a[j];s+=x*x;n++;}return Math.sqrt(s/(n||1));}
function quantile(a,p){if(!a.length)return 0;const b=Array.from(a).sort((x,y)=>x-y);return b[Math.max(0,Math.min(b.length-1,Math.floor((b.length-1)*p)))];}
function median(a){return quantile(a,.5);}
function detect(audio,sr,mode,isSMR){
 if(!audio?.length||!sr)return {events:[],duration:0,debug:{version:'DSP-v8',reason:'empty'}};
 const hop=Math.max(64,Math.round(sr*.005));
 const win=Math.max(hop*3,Math.round(sr*.020));
 const env=[];
 for(let i=0;i+win<=audio.length;i+=hop)env.push(rms(audio,i,win));
 if(env.length<30)return {events:[],duration:audio.length/sr,debug:{version:'DSP-v8',reason:'too_short'}};
 const sm=new Float64Array(env.length), n=4; let sum=0;
 for(let i=0;i<env.length;i++){sum+=env[i];if(i>=n)sum-=env[i-n];sm[i]=sum/Math.min(i+1,n);}
 const q10=quantile(sm,.10), q25=quantile(sm,.25), q90=quantile(sm,.90);
 const span=Math.max(q90-q10,1e-7), cfg=CFG[mode]||CFG.Adult;
 const low=Array.from(sm).filter(v=>v<=q25), noiseMed=median(low.length?low:[q10]);
 const noiseSpan=Math.max(span*.025,1e-7), noiseFloor=noiseMed+noiseSpan;
 const onLevel=Math.max(q10+cfg.on*span,noiseFloor);
 const offLevel=Math.max(q10+cfg.off*span,noiseMed+noiseSpan*.55);
 const promFloor=cfg.prom*span;
 const look=Math.max(3,Math.round(cfg.look/(hop/sr)));
 const minFrames=Math.max(2,Math.round((isSMR?Math.max(.075,cfg.minGap):cfg.minGap)/(hop/sr)));
 const sustainFrames=Math.max(2,Math.round(cfg.sustain/(hop/sr)));
 const active=new Uint8Array(sm.length); let gate=false;
 for(let i=0;i<sm.length;i++){
   if(!gate&&sm[i]>=onLevel)gate=true; else if(gate&&sm[i]<offLevel)gate=false;
   active[i]=gate?1:0;
 }
 const gapFill=Math.max(2,Math.round(.045/(hop/sr)));
 for(let i=gapFill;i<active.length-gapFill;i++)if(!active[i]){
   let left=true,right=true;for(let k=1;k<=gapFill;k++){if(!active[i-k])left=false;if(!active[i+k])right=false;}
   if(left&&right)active[i]=1;
 }
 const candidates=[];
 for(let i=look;i<sm.length-look;i++){
   if(!active[i])continue;
   const v=sm[i]; if(v<onLevel||v<sm[i-1]||v<=sm[i+1])continue;
   let l=Infinity,r=Infinity; for(let k=1;k<=look;k++){if(sm[i-k]<l)l=sm[i-k];if(sm[i+k]<r)r=sm[i+k];}
   const prominence=v-Math.max(noiseFloor,Math.min(l,r)); if(prominence<promFloor)continue;
   let sustain=0; for(let k=0;k<sustainFrames;k++)if(sm[Math.min(sm.length-1,i+k)]>=offLevel)sustain++;
   if(sustain<Math.max(1,Math.ceil(sustainFrames*.5)))continue;
   candidates.push({i,v,prominence});
 }
 candidates.sort((a,b)=>a.i-b.i); const selected=[];
 for(const c of candidates){
   if(!selected.length){selected.push(c);continue;}
   const d=c.i-selected[selected.length-1].i;
   if(d<minFrames){if(c.v>selected[selected.length-1].v)selected[selected.length-1]=c;}
   else selected.push(c);
 }
 return {events:selected.map(x=>x.i*hop/sr),duration:audio.length/sr,debug:{version:'DSP-v8',method:'RMS envelope + permissive hysteresis gate + local 55-ms prominence + refractory NMS',threshold:onLevel,offThreshold:offLevel,noiseFloor,prominenceFloor:promFloor,refractory:minFrames*hop/sr,candidates:candidates.length,selected:selected.length}};
}
window.detectDDK=detect; window.DDK_DSP_VERSION='DSP-v8';
})();
