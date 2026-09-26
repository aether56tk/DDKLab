/* DDKLab DSP v18 — robust production detector
   Local-only deterministic DSP. Counts production events, not arbitrary peaks.
   Designed to reject low-level tail noise and isolated baseline fluctuations.
   Research note: no automatic detector can guarantee zero errors; validation
   against human annotation remains required before research claims.
*/
(function(){
'use strict';
const CFG={
 Adult:{minGap:.085,prom:.11,activity:.15,width:.018,onset:.025},
 Child:{minGap:.075,prom:.095,activity:.13,width:.016,onset:.020},
 Geriatric:{minGap:.095,prom:.12,activity:.16,width:.020,onset:.025},
 Dysarthria:{minGap:.070,prom:.065,activity:.10,width:.014,onset:.015}
};
function q(a,p){if(!a.length)return 0;const b=Array.from(a).sort((x,y)=>x-y);return b[Math.max(0,Math.min(b.length-1,Math.floor((b.length-1)*p)))];}
function mean(a){return a.length?a.reduce((s,v)=>s+v,0)/a.length:0;}
function sd(a){if(a.length<2)return 0;const m=mean(a);return Math.sqrt(mean(a.map(v=>(v-m)*(v-m))));}
function ma(a,n){n=Math.max(1,n);const o=new Float64Array(a.length);let s=0;for(let i=0;i<a.length;i++){s+=a[i];if(i>=n)s-=a[i-n];o[i]=s/Math.min(i+1,n);}return o;}
function rms(x,i,w){let s=0,n=0,e=Math.min(x.length,i+w);for(let j=i;j<e;j++){s+=x[j]*x[j];n++;}return Math.sqrt(s/(n||1));}
function hp(x,sr,fc){const rc=1/(2*Math.PI*fc),dt=1/sr,a=rc/(rc+dt),y=new Float32Array(x.length);let yp=0,xp=x[0]||0;for(let i=0;i<x.length;i++){const v=x[i];yp=a*(yp+v-xp);y[i]=yp;xp=v;}return y;}
function frameEnv(x,sr){const hop=Math.max(64,Math.round(sr*.010)),win=Math.max(hop*2,Math.round(sr*.030)),n=Math.ceil(x.length/hop),full=new Float64Array(n),burst=new Float64Array(n);const b=hp(x,sr,650);for(let k=0,i=0;i<x.length;k++,i+=hop){full[k]=rms(x,i,win);burst[k]=rms(b,i,win);}return {full,burst,step:hop/sr};}
function robustNorm(a){const lo=q(a,.25),hi=q(a,.995),sp=Math.max(hi-lo,1e-12),v=new Float64Array(a.length);for(let i=0;i<a.length;i++)v[i]=Math.max(0,Math.min(1,(a[i]-lo)/sp));return {v,lo,hi};}
function localMin(a,l,r){l=Math.max(0,l);r=Math.min(a.length-1,r);let m=Infinity;for(let i=l;i<=r;i++)m=Math.min(m,a[i]);return Number.isFinite(m)?m:0;}
function localMaxIndex(a,l,r){l=Math.max(0,l);r=Math.min(a.length-1,r);let bi=l,bv=a[l]||0;for(let i=l+1;i<=r;i++)if(a[i]>bv){bv=a[i];bi=i;}return bi;}
function widthAtLevel(a,i,level,dir){let j=i;if(dir<0){while(j>0&&a[j]>=level)j--;}else{while(j<a.length-1&&a[j]>=level)j++;}return j;}
function candidates(env,burst,step,cfg){
 const out=[],w=Math.max(2,Math.round(.075/step));
 const base=q(env,.30),mad=q(env.map(v=>Math.abs(v-base)),.50);
 const act=Math.max(cfg.activity,Math.min(.48,base+3.5*mad));
 for(let i=2;i<env.length-2;i++){
   const p=env[i];
   if(p<act||p<env[i-1]||p<env[i+1])continue;
   const left=localMin(env,i-w,i-1),right=localMin(env,i+1,i+w),prom=p-Math.max(left,right);
   if(prom<cfg.prom)continue;
   const onset=p-localMin(env,Math.max(0,i-Math.round(.055/step)),i);
   if(onset<cfg.onset)continue;
   const lvl=Math.max(base+mad,p-prom*.5);
   const l=widthAtLevel(env,i,lvl,-1),r=widthAtLevel(env,i,lvl,1),width=(r-l)*step;
   if(width<cfg.width)continue;
   const bLocal=localMaxIndex(burst,i-Math.round(.03/step),i+Math.round(.03/step));
   const b=burst[bLocal];
   out.push({i,p,prom,onset,width,burst:b,score:.50*p+.30*prom+.15*Math.min(1,onset/.15)+.05*Math.min(1,b)});
 }
 out.sort((a,b)=>b.score-a.score);
 const chosen=[],gap=Math.max(1,Math.round(cfg.minGap/step));
 for(const c of out){if(!chosen.some(x=>Math.abs(x.i-c.i)<gap))chosen.push(c);}
 chosen.sort((a,b)=>a.i-b.i);return chosen;
}
function detect(audio,sr,mode,isSMR){
 if(!audio?.length||!sr)return {events:[],duration:0,debug:{version:'DSP-v18',reason:'empty'}};
 const cfg=CFG[mode]||CFG.Adult,duration=audio.length/sr;
 const n0=Math.min(audio.length,Math.round(sr*.20));let dc=0;for(let i=0;i<n0;i++)dc+=audio[i];dc/=Math.max(1,n0);
 const x=new Float32Array(audio.length);let mx=0;for(let i=0;i<audio.length;i++){x[i]=audio[i]-dc;mx=Math.max(mx,Math.abs(x[i]));}
 if(mx<1e-5)return {events:[],duration,debug:{version:'DSP-v18',reason:'near_silence'}};
 const f=frameEnv(x,sr),step=f.step,fn=robustNorm(f.full),bn=robustNorm(f.burst);
 const env=ma(fn.v,Math.max(1,Math.round(.020/step))),burst=ma(bn.v,Math.max(1,Math.round(.015/step)));
 let cand=candidates(env,burst,step,cfg);
 // End-of-speech guard: isolated low-level tail noise is not a production.
 const strongest=env.length?q(env,.90):0,activeFloor=Math.max(cfg.activity*.85,strongest*.12);
 const activeIdx=[];for(let i=0;i<env.length;i++)if(env[i]>=activeFloor)activeIdx.push(i);
 if(activeIdx.length){const last=activeIdx[activeIdx.length-1],tailLimit=Math.min(env.length-1,last+Math.round(.25/step));cand=cand.filter(c=>c.i<=tailLimit);}
 const events=cand.map(c=>c.i*step),ints=[];for(let i=1;i<events.length;i++)ints.push(events[i]-events[i-1]);
 const mi=mean(ints),cv=mi?sd(ints)/mi:0;
 return {events,duration,debug:{version:'DSP-v18',method:'robust energy-envelope segmentation + adaptive activity gate + prominence + onset + width + end-of-speech rejection',sampleRate:sr,mode,isSMR:!!isSMR,activityThreshold:cfg.activity,candidates:cand.length,selected:events.length,meanInterval:mi,intervalCV:cv,qualityConfidence:events.length?Math.max(0,Math.min(1,.7*(1-Math.min(1,cv))+.3*Math.min(1,events.length/5))):0}};
}
window.detectDDK=detect;window.DDK_DSP_VERSION='DSP-v18';
})();
