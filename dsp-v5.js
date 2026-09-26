/* DDKLab DSP v17 — ensemble production detector
   Local-only deterministic DSP. Counts production events, not arbitrary peaks.
   Research note: no automatic speech detector can guarantee zero errors; this
   implementation is designed to reduce false positives and expose quality
   diagnostics rather than silently invent a count.
*/
(function(){
'use strict';
const CFG={
 Adult:{minGap:.095,peakGap:.070,smooth:.032,highFrac:.20,prom:.12},
 Child:{minGap:.085,peakGap:.060,smooth:.028,highFrac:.17,prom:.10},
 Geriatric:{minGap:.105,peakGap:.075,smooth:.035,highFrac:.20,prom:.13},
 Dysarthria:{minGap:.080,peakGap:.055,smooth:.026,highFrac:.13,prom:.075}
};
function q(a,p){if(!a.length)return 0;const b=Array.from(a).sort((x,y)=>x-y);return b[Math.max(0,Math.min(b.length-1,Math.floor((b.length-1)*p)))];}
function mean(a){return a.length?a.reduce((s,v)=>s+v,0)/a.length:0;}
function sd(a){if(a.length<2)return 0;const m=mean(a);return Math.sqrt(mean(a.map(v=>(v-m)*(v-m))));}
function ma(a,n){n=Math.max(1,n);const o=new Float64Array(a.length);let s=0;for(let i=0;i<a.length;i++){s+=a[i];if(i>=n)s-=a[i-n];o[i]=s/Math.min(i+1,n);}return o;}
function rms(x,i,w){let s=0,n=0,e=Math.min(x.length,i+w);for(let j=i;j<e;j++){s+=x[j]*x[j];n++;}return Math.sqrt(s/(n||1));}
function norm(a){const lo=q(a,.05),hi=q(a,.95),sp=Math.max(hi-lo,1e-12),o=new Float64Array(a.length);for(let i=0;i<a.length;i++)o[i]=Math.max(0,Math.min(1,(a[i]-lo)/sp));return {v:o,lo,hi,sp};}
function hp(x,sr,fc){const rc=1/(2*Math.PI*fc),dt=1/sr,a=rc/(rc+dt),y=new Float32Array(x.length);let yp=0,xp=x[0]||0;for(let i=0;i<x.length;i++){const v=x[i];yp=a*(yp+v-xp);y[i]=yp;xp=v;}return y;}
function low(x,sr,fc){const rc=1/(2*Math.PI*fc),dt=1/sr,a=dt/(rc+dt),y=new Float32Array(x.length);let yp=0;for(let i=0;i<x.length;i++){yp=yp+a*(x[i]-yp);y[i]=yp;}return y;}
function frameEnv(x,sr){const hop=Math.max(64,Math.round(sr*.005)),win=Math.max(hop*2,Math.round(sr*.020));const n=Math.ceil(x.length/hop),full=new Float64Array(n),burst=new Float64Array(n),lowE=new Float64Array(n);const b=hp(x,sr,650),v=low(x,sr,350);for(let k=0,i=0;i<x.length;k++,i+=hop){full[k]=rms(x,i,win);burst[k]=rms(b,i,win);lowE[k]=rms(v,i,win);}return {full,burst,lowE,step:hop/sr};}
function derivative(a){const o=new Float64Array(a.length);for(let i=1;i<a.length;i++)o[i]=Math.max(0,a[i]-a[i-1]);return o;}
function kmeansThreshold(a){if(!a.length)return {t:0,sep:0};let c1=q(a,.20),c2=q(a,.80);for(let z=0;z<12;z++){let s1=0,s2=0,n1=0,n2=0;for(const v of a){if(Math.abs(v-c1)<=Math.abs(v-c2)){s1+=v;n1++;}else{s2+=v;n2++;}}const nc1=n1?s1/n1:c1,nc2=n2?s2/n2:c2;if(Math.abs(nc1-c1)+Math.abs(nc2-c2)<1e-7){c1=nc1;c2=nc2;break;}c1=nc1;c2=nc2;}if(c1>c2)[c1,c2]=[c2,c1];return {t:c1+(c2-c1)*.34,sep:c2-c1,low:c1,high:c2};}
function localMax(a,l,r){l=Math.max(0,l);r=Math.min(a.length-1,r);let bi=l,bv=a[l]||0;for(let i=l+1;i<=r;i++)if(a[i]>bv){bv=a[i];bi=i;}return bi;}
function localMin(a,l,r){l=Math.max(0,l);r=Math.min(a.length-1,r);let m=Infinity;for(let i=l;i<=r;i++)if(a[i]<m)m=a[i];return Number.isFinite(m)?m:0;}
function peaks(feature,step,cfg,threshold,minDist){const out=[];const w=Math.max(2,Math.round(.055/step));for(let i=1;i<feature.length-1;i++){if(feature[i]<threshold||feature[i]<feature[i-1]||feature[i]<feature[i+1])continue;const a=Math.max(0,i-w),b=Math.min(feature.length-1,i+w),base=Math.max(localMin(feature,a,i-1),localMin(feature,i+1,b));const prom=feature[i]-base;if(prom<cfg.prom)continue;const rise=Math.max(0,feature[i]-localMin(feature,Math.max(0,i-Math.round(.045/step)),i));const fall=Math.max(0,feature[i]-localMin(feature,i,Math.min(feature.length-1,i+Math.round(.070/step))));const shape=Math.min(1,rise/.18)+Math.min(1,fall/.18);out.push({i,score:.62*prom+.38*shape,prom,shape});}out.sort((a,b)=>b.score-a.score);const chosen=[];for(const p of out){if(!chosen.some(c=>Math.abs(c.i-p.i)<minDist))chosen.push(p);}chosen.sort((a,b)=>a.i-b.i);return chosen;}
function autocorr(feature,step,minLag,maxLag){const z=norm(feature).v,m=mean(z),lo=Math.max(1,Math.round(minLag/step)),hi=Math.min(z.length-2,Math.round(maxLag/step));let best=-Infinity,bestLag=0;for(let lag=lo;lag<=hi;lag++){let s=0,n=0;for(let i=lag;i<z.length;i++){s+=(z[i]-m)*(z[i-lag]-m);n++;}const c=s/(n||1);if(c>best){best=c;bestLag=lag;}}return bestLag&&best>0?{period:bestLag*step,score:best}:null;}
function match(a,b,step,tol){const used=new Set(),out=[];for(const p of a){let bi=-1,bd=Infinity;for(let j=0;j<b.length;j++){if(used.has(j))continue;const d=Math.abs(p.i-b[j].i);if(d<bd){bd=d;bi=j;}}if(bi>=0&&bd<=tol){used.add(bi);out.push({...p,i:Math.round((p.i+b[bi].i)/2),support:true});}else out.push({...p,support:false});}return out;}
function candidatePeriod(cands,step){
 if(cands.length<3)return null;
 const min=.25,max=3.5,bw=.025,bins=new Map();let total=0;
 for(let i=0;i<cands.length;i++)for(let j=i+1;j<cands.length;j++){
  const d=(cands[j].i-cands[i].i)*step;if(d<min||d>max)continue;
  const b=Math.round(d/bw)*bw,w=Math.min(1,cands[i].score)*Math.min(1,cands[j].score);
  bins.set(b,(bins.get(b)||0)+w);total+=w;
 }
 if(!bins.size)return null;let bestBin=0,best=-1;for(const [b,w] of bins)if(w>best){best=w;bestBin=b;}
 const concentration=total?best/total:0;
 return concentration>.075?{period:bestBin,score:concentration}:null;
}
function snapToPeriod(cands,step,period){
 if(!period||cands.length<3)return cands;
 const p=period.period,tol=Math.min(.22*p,.16);let best=null;
 for(const seed of cands){
  const base=seed.i*step;let picks=[],score=0;
  const k0=Math.floor((cands[0].i*step-base)/p)-1,k1=Math.ceil((cands[cands.length-1].i*step-base)/p)+1;
  for(let k=k0;k<=k1;k++){const target=base+k*p;let bi=-1,bd=Infinity;for(let j=0;j<cands.length;j++){const d=Math.abs(cands[j].i*step-target);if(d<bd){bd=d;bi=j;}}if(bi>=0&&bd<=tol&&!picks.includes(bi)){picks.push(bi);score+=1.0+.8*cands[bi].score-.9*(bd/p);}}
  if(!best||score>best.score)best={score,picks};
 }
 if(!best||best.picks.length<2)return cands;
 best.picks.sort((a,b)=>cands[a].i-cands[b].i);return best.picks.map(i=>cands[i]);
}
function selectByPeriod(cands,step,period,minGap){if(!period||cands.length<2)return cands;const p=period.period;const maxGap=Math.min(3.8,p*3.2),min=Math.max(minGap,p*.45);const scored=cands.map(c=>({...c,dp:c.score,prev:-1}));for(let i=0;i<scored.length;i++){for(let j=0;j<i;j++){const gap=(scored[i].i-scored[j].i)*step;if(gap<min||gap>maxGap)continue;const mult=Math.max(1,Math.round(gap/Math.max(p,.001))),target=p*mult,ratio=Math.abs(gap-target)/Math.max(target,.001);if(ratio>.28)continue;const penalty=.45*ratio;const val=scored[j].dp+scored[i].score-penalty;if(val>scored[i].dp){scored[i].dp=val;scored[i].prev=j;}}}let end=0;for(let i=1;i<scored.length;i++)if(scored[i].dp>scored[end].dp)end=i;const idx=[];while(end>=0){idx.push(end);end=scored[end].prev;}idx.reverse();return idx.map(i=>scored[i]);}
function detect(audio,sr,mode,isSMR){
 if(!audio?.length||!sr)return {events:[],duration:0,debug:{version:'DSP-v17',reason:'empty'}};
 const cfg=CFG[mode]||CFG.Adult,duration=audio.length/sr;
 const n0=Math.min(audio.length,Math.round(sr*.20));let dc=0;for(let i=0;i<n0;i++)dc+=audio[i];dc/=Math.max(1,n0);
 const x=new Float32Array(audio.length);let mx=0;for(let i=0;i<audio.length;i++){x[i]=audio[i]-dc;mx=Math.max(mx,Math.abs(x[i]));}if(mx<1e-5)return {events:[],duration,debug:{version:'DSP-v17',reason:'near_silence'}};
 const f=frameEnv(x,sr),step=f.step,smooth=Math.max(2,Math.round(cfg.smooth/step));
 const full=ma(f.full,smooth),burst=ma(f.burst,smooth),low=ma(f.lowE,smooth);
 const fn=norm(full),bn=norm(burst),ln=norm(low),d=norm(derivative(full));
 const comp=new Float64Array(full.length);for(let i=0;i<comp.length;i++)comp[i]=.50*fn.v[i]+.28*bn.v[i]+.14*d.v[i]+.08*ln.v[i];
 const km=kmeansThreshold(comp);const noise=q(comp,.20);const thr=Math.max(noise+.10,km.t);
 const envPeaks=peaks(comp,step,cfg,thr,Math.max(1,Math.round(cfg.peakGap/step)));
 const burstThr=Math.max(q(bn.v,.35)+.10,q(bn.v,.60));
 const burstPeaks=peaks(bn.v,step,{prom:mode==='Dysarthria'?.045:.075},burstThr,Math.max(1,Math.round(cfg.peakGap/step)));
 let cand=match(envPeaks,burstPeaks,step,.045);
 cand=cand.filter(c=>c.support||c.prom>cfg.prom*1.65||c.score>.42);
 cand.sort((a,b)=>b.score-a.score);const ded=[];const minGap=Math.round(cfg.minGap/step);for(const c of cand){if(!ded.some(s=>Math.abs(s.i-c.i)<minGap))ded.push(c);}ded.sort((a,b)=>a.i-b.i);
 const acousticPeriod=autocorr(comp,step,mode==='Child'?.09:.105,isSMR?.75:.50);
 const period=candidatePeriod(ded,step)||acousticPeriod;
 let chosen=(ded.length<=6)?ded:(period?.score>=.12?snapToPeriod(ded,step,period):selectByPeriod(ded,step,period,cfg.minGap));
 if(chosen.length&&chosen.length<Math.max(1,Math.floor(ded.length*.55))&&(period?.score||0)<.15)chosen=ded;
 chosen=chosen.filter(c=>c.i>=0&&c.i<comp.length);
 const events=chosen.map(c=>c.i*step).filter((t,i,a)=>i===0||t-a[i-1]>=cfg.minGap);
 const ints=[];for(let i=1;i<events.length;i++)ints.push(events[i]-events[i-1]);
 const mi=mean(ints),cv=mi?sd(ints)/mi:0;
 const agreement=chosen.length?mean(chosen.map(c=>c.support?1:0)):0;
 const confidence=events.length<2?0:Math.max(0,Math.min(1,.45*agreement+.30*Math.min(1,km.sep/.18)+.25*(1-Math.min(1,cv))));
 return {events,duration,debug:{version:'DSP-v17',method:'ensemble RMS + high-frequency burst envelope + onset support + adaptive 2-cluster threshold + consensus matching + autocorrelation-constrained selection',sampleRate:sr,mode,isSMR:!!isSMR,threshold:thr,clusterSeparation:km.sep,rawEnvelopePeaks:envPeaks.length,burstPeaks:burstPeaks.length,consensusCandidates:ded.length,selected:events.length,estimatedPeriod:period?.period||null,periodicityScore:period?.score||0,meanInterval:mi,intervalCV:cv,detectorAgreement:agreement,qualityConfidence:confidence,rejectPolicy:'ambiguous low-evidence events are rejected rather than counted'}};
}
window.detectDDK=detect;window.DDK_DSP_VERSION='DSP-v17';
})();
