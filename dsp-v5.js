/* DDKLab DSP v13 — production-nucleus detector
   Local-only deterministic DSP. No remote speech service.
   PRELIMINARY: engineering detector; research/clinical claims require human-annotated validation.

   v13 addresses over-counting: several local maxima inside one broad PA production
   could previously become separate events. It now uses production-scale prominence,
   stricter refractory selection, valley separation and edge protection.
*/
(function(){
'use strict';
const CFG={
  Adult:{minGap:.180,activity:.11,prom:.075,smoothMs:50,promWindowMs:115},
  Child:{minGap:.155,activity:.09,prom:.060,smoothMs:45,promWindowMs:100},
  Geriatric:{minGap:.185,activity:.10,prom:.070,smoothMs:52,promWindowMs:120},
  Dysarthria:{minGap:.125,activity:.065,prom:.045,smoothMs:42,promWindowMs:90}
};
function q(a,p){if(!a.length)return 0;const b=Array.from(a).sort((x,y)=>x-y);return b[Math.max(0,Math.min(b.length-1,Math.floor((b.length-1)*p)))];}
function rms(x,i,w){const e=Math.min(x.length,i+w);let s=0,n=0;for(let j=i;j<e;j++){const z=x[j];s+=z*z;n++;}return Math.sqrt(s/(n||1));}
function smooth(a,n){n=Math.max(1,n);const o=new Float64Array(a.length);let s=0;for(let i=0;i<a.length;i++){s+=a[i];if(i>=n)s-=a[i-n];o[i]=s/Math.min(i+1,n);}return o;}
function env(x,sr){const hop=Math.max(64,Math.round(sr*.005)),win=Math.max(hop*2,Math.round(sr*.010)),e=[];for(let i=0;i+win<=x.length;i+=hop)e.push(rms(x,i,win));return {e,step:hop/sr};}
function localMin(a,l,r){l=Math.max(0,l);r=Math.min(a.length-1,r);let m=Infinity;for(let i=l;i<=r;i++)if(a[i]<m)m=a[i];return m;}
function detect(audio,sr,mode,isSMR){
 if(!audio?.length||!sr)return {events:[],duration:0,debug:{version:'DSP-v13',reason:'empty'}};
 const cfg=CFG[mode]||CFG.Adult;
 const n0=Math.min(audio.length,Math.round(sr*.25));let dc=0;for(let i=0;i<n0;i++)dc+=audio[i];dc/=Math.max(1,n0);
 const x=new Float32Array(audio.length);for(let i=0;i<audio.length;i++)x[i]=audio[i]-dc;
 const z=env(x,sr);if(z.e.length<80)return {events:[],duration:audio.length/sr,debug:{version:'DSP-v13',reason:'too_short'}};
 const raw=Float64Array.from(z.e),sn=Math.max(2,Math.round(cfg.smoothMs/1000/z.step)),e=smooth(raw,sn);
 const sorted=Array.from(e).sort((a,b)=>a-b),p10=q(sorted,.10),p20=q(sorted,.20),p50=q(sorted,.50),p90=q(sorted,.90);
 const noise=Math.max(p10,(p10+p20+p50)/3*.5),dyn=Math.max(p90-noise,1e-9);
 const activityFloor=Math.max(noise*1.8,noise+dyn*cfg.activity),promFloor=Math.max(dyn*cfg.prom,noise*.30);
 const active=new Uint8Array(e.length);for(let i=0;i<e.length;i++)if(e[i]>=activityFloor)active[i]=1;
 const hole=Math.max(1,Math.round(.075/z.step));
 for(let i=1;i<e.length-1;i++){
   if(active[i])continue;let l=i;while(l>0&&active[l-1]===0&&i-l<hole)l--;let r=i;while(r<e.length&&active[r]===0&&r-i<hole)r++;
   if(l>0&&r<e.length&&active[l-1]&&active[r])for(let k=l;k<=r;k++)active[k]=1;
 }
 const regions=[];let st=-1,minRegion=Math.round(.070/z.step);
 for(let i=0;i<=active.length;i++){if(i<active.length&&active[i]){if(st<0)st=i;}else if(st>=0){if(i-st>=minRegion)regions.push([st,i-1]);st=-1;}}
 const half=Math.max(2,Math.round(cfg.promWindowMs/1000/z.step)),candidates=[];
 for(const [a,b] of regions){
   for(let i=a+2;i<=b-2;i++){
     const v=e[i];if(v<activityFloor||v<e[i-1]||v<e[i+1])continue;
     const left=localMin(e,i-half,i-2),right=localMin(e,i+2,i+half),base=Math.max(noise,Math.min(left,right)),prom=v-base;
     if(prom<promFloor)continue;
     const lr=v/Math.max(left,noise),rr=v/Math.max(right,noise);if(lr<1.10||rr<1.10)continue;
     const score=.55*(prom/dyn)+.30*((v-noise)/dyn)+.15*Math.min(lr,rr)/2;
     candidates.push({i,v,prom,score});
   }
 }
 candidates.sort((a,b)=>b.score-a.score);
 const gap=Math.round((isSMR?cfg.minGap+.015:cfg.minGap)/z.step),chosen=[];
 for(const c of candidates)if(chosen.every(s=>Math.abs(c.i-s.i)>=gap))chosen.push(c);
 chosen.sort((a,b)=>a.i-b.i);
 const final=[];
 for(const c of chosen){const prev=final[final.length-1];if(prev&&c.i-prev.i<Math.round(.24/z.step)){if(c.score>prev.score)final[final.length-1]=c;continue;}final.push(c);}
 const edge=Math.round(.14/z.step),out=final.filter(c=>c.i>=edge&&c.i<e.length-edge);
 return {events:out.map(c=>c.i*z.step),duration:audio.length/sr,debug:{version:'DSP-v13',method:'RMS envelope + adaptive activity gate + broad prominence + production-scale NMS + shoulder suppression',sampleRate:sr,mode,isSMR:!!isSMR,noiseFloor:noise,activityFloor,prominenceFloor,minGapSeconds:cfg.minGap,promWindowMs:cfg.promWindowMs,activeRegions:regions.length,rawCandidates:candidates.length,selected:out.length,envelopeMs:10,smoothingMs:cfg.smoothMs}};
}
window.detectDDK=detect;window.DDK_DSP_VERSION='DSP-v13';
})();
