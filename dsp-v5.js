/* DDKLab DSP v15 — production-event detector
   Local-only deterministic DSP. No remote speech service.
   PRELIMINARY: engineering detector; research/clinical claims require human-annotated validation.

   v15 is specifically designed to stop the over-counting seen in field trials:
   - count one production peak per acoustic production region
   - reject short noise/transient spikes
   - use hysteresis activity segmentation rather than treating every local wiggle as a syllable
   - retain a more sensitive Dysarthria mode for weak productions
   - enforce a production-scale refractory interval
*/
(function(){
'use strict';
const CFG={
  Adult:{minGap:.145,smoothMs:55,hiFrac:.25,loFrac:.14,minMs:42,mergeGap:.055},
  Child:{minGap:.125,smoothMs:48,hiFrac:.20,loFrac:.11,minMs:34,mergeGap:.050},
  Geriatric:{minGap:.150,smoothMs:58,hiFrac:.23,loFrac:.13,minMs:42,mergeGap:.060},
  Dysarthria:{minGap:.105,smoothMs:45,hiFrac:.15,loFrac:.075,minMs:28,mergeGap:.045}
};
function q(a,p){if(!a.length)return 0;const b=Array.from(a).sort((x,y)=>x-y);return b[Math.max(0,Math.min(b.length-1,Math.floor((b.length-1)*p)))];}
function rms(x,i,w){const e=Math.min(x.length,i+w);let s=0,n=0;for(let j=i;j<e;j++){const z=x[j];s+=z*z;n++;}return Math.sqrt(s/(n||1));}
function movingAverage(a,n){n=Math.max(1,n);const o=new Float64Array(a.length);let sum=0;for(let i=0;i<a.length;i++){sum+=a[i];if(i>=n)sum-=a[i-n];o[i]=sum/Math.min(i+1,n);}return o;}
function envelope(x,sr){const hop=Math.max(64,Math.round(sr*.005));const win=Math.max(hop*2,Math.round(sr*.012));const e=[];for(let i=0;i<x.length;i+=hop)e.push(rms(x,i,win));return {e,step:hop/sr};}
function localMin(a,l,r){l=Math.max(0,l);r=Math.min(a.length-1,r);let m=Infinity;for(let i=l;i<=r;i++)if(a[i]<m)m=a[i];return Number.isFinite(m)?m:0;}
function localMaxIndex(a,l,r){l=Math.max(0,l);r=Math.min(a.length-1,r);let bi=l,bv=a[l]||0;for(let i=l+1;i<=r;i++)if(a[i]>bv){bv=a[i];bi=i;}return bi;}
function detect(audio,sr,mode,isSMR){
  if(!audio?.length||!sr)return {events:[],duration:0,debug:{version:'DSP-v15',reason:'empty'}};
  const cfg=CFG[mode]||CFG.Adult;
  const n0=Math.min(audio.length,Math.round(sr*.25));
  let dc=0;for(let i=0;i<n0;i++)dc+=audio[i];dc/=Math.max(1,n0);
  const x=new Float32Array(audio.length);for(let i=0;i<audio.length;i++)x[i]=audio[i]-dc;
  const z=envelope(x,sr);if(z.e.length<50)return {events:[],duration:audio.length/sr,debug:{version:'DSP-v15',reason:'too_short'}};
  const raw=Float64Array.from(z.e);
  const smoothN=Math.max(2,Math.round(cfg.smoothMs/1000/z.step));
  const e=movingAverage(raw,smoothN);

  // Robust noise/activity estimates. The low-percentile estimate is deliberately
  // resistant to a long recording containing speech.
  const p05=q(e,.05),p10=q(e,.10),p20=q(e,.20),p35=q(e,.35),p50=q(e,.50),p90=q(e,.90);
  const noise=Math.max(1e-9,(p05+p10+p20)/3);
  const span=Math.max(p90-noise,1e-9);
  const hi=noise+span*cfg.hiFrac;
  const lo=noise+span*cfg.loFrac;
  const absolute=Math.max(noise*1.35,p35*0.10);
  const hiThreshold=Math.max(hi,absolute);
  const loThreshold=Math.max(lo,noise*1.18);

  // Hysteresis segmentation: a production must cross the higher threshold,
  // remain acoustically active long enough, and return below the lower threshold.
  const minLen=Math.max(3,Math.round(cfg.minMs/1000/z.step));
  const mergeLen=Math.max(1,Math.round(cfg.mergeGap/z.step));
  const active=[];let on=false,st=-1;
  for(let i=0;i<e.length;i++){
    if(!on){
      if(e[i]>=hiThreshold){on=true;st=i;}
    }else{
      if(e[i]<loThreshold){
        active.push([st,i-1]);on=false;st=-1;
      }
    }
  }
  if(on)active.push([st,e.length-1]);

  // Merge only very short gaps. This handles small dips inside one syllable
  // without merging separate repeated productions.
  const merged=[];
  for(const r of active){
    if(!merged.length||r[0]-merged[merged.length-1][1]>mergeLen)merged.push(r.slice());
    else merged[merged.length-1][1]=r[1];
  }

  // Reject regions that are too short to represent a production.
  const regions=merged.filter(r=>r[1]-r[0]+1>=minLen);
  const candidates=[];
  const shoulder=Math.round((isSMR?cfg.minGap+.025:cfg.minGap)/z.step);
  for(const [a,b] of regions){
    const bi=localMaxIndex(e,a,b);
    const peak=e[bi];
    const leftBase=localMin(e,Math.max(0,a-Math.round(.12/z.step)),Math.max(a,bi-2));
    const rightBase=localMin(e,Math.min(e.length-1,bi+2),Math.min(e.length-1,b+Math.round(.12/z.step)));
    const base=Math.max(noise,Math.min(leftBase,rightBase));
    const prominence=peak-base;
    const width=b-a+1;
    const score=(prominence/span)*.70+((peak-noise)/span)*.30;
    if(prominence>=span*(mode==='Dysarthria'?.045:.075))candidates.push({i:bi,v:peak,prominence,score,width});
  }

  // Production-scale non-maximum suppression. Keep the strongest event when
  // adjacent regions are still too close to be separate DDK productions.
  candidates.sort((a,b)=>b.score-a.score);
  const chosen=[];
  for(const c of candidates){if(chosen.every(s=>Math.abs(c.i-s.i)>=shoulder))chosen.push(c);}
  chosen.sort((a,b)=>a.i-b.i);

  // Final refractory guard. Unlike the old local-max detector, this is applied
  // to the actual segmented production events, so background wiggles cannot
  // create extra counts.
  const gap=Math.round((isSMR?cfg.minGap+.02:cfg.minGap)/z.step);
  const final=[];
  for(const c of chosen){
    const prev=final[final.length-1];
    if(!prev||c.i-prev.i>=gap)final.push(c);
    else if(c.score>prev.score)final[final.length-1]=c;
  }
  final.sort((a,b)=>a.i-b.i);

  return {
    events:final.map(c=>c.i*z.step),
    duration:audio.length/sr,
    debug:{
      version:'DSP-v15',
      method:'12-ms RMS envelope + hysteresis production segmentation + duration gate + production-scale NMS',
      sampleRate:sr,mode,isSMR:!!isSMR,
      noiseFloor:noise,highThreshold:hiThreshold,lowThreshold:loThreshold,
      minProductionMs:cfg.minMs,minGapSeconds:cfg.minGap,
      regions:regions.length,rawCandidates:candidates.length,selected:final.length,
      sensitivityMode:mode==='Dysarthria'?'enhanced weak-production sensitivity':'standard'
    }
  };
}
window.detectDDK=detect;
window.DDK_DSP_VERSION='DSP-v15';
})();
