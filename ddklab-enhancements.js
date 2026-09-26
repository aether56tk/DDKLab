/* DDKLab research-safety enhancements
   Local-only. No network/API calls. Child reinforcement is a training UI layer only.
   IMPORTANT: the research detector in dsp-v5.js owns window.detectDDK when available.
*/
(function(){
  'use strict';

  // Legacy fallback retained only for compatibility with an old build. It MUST NOT
  // replace the current research DSP when DSP-v14 has loaded successfully.
  function legacyFallbackDDK(audio,sr,mode,isSMR){
    const hop=160,win=640,raw=[];
    for(let i=0;i+win<=audio.length;i+=hop){let s=0;for(let j=0;j<win;j++)s+=audio[i+j]*audio[i+j];raw.push(Math.sqrt(s/win));}
    if(raw.length<10)return {events:[],duration:audio.length/sr,debug:{version:'legacy-fallback',reason:'too_short'}};
    const env=new Float64Array(raw.length);let sum=0;
    for(let i=0;i<raw.length;i++){sum+=raw[i];if(i>=5)sum-=raw[i-5];env[i]=sum/Math.min(i+1,5);}
    const sorted=Array.from(env).sort((a,b)=>a-b),med=sorted[Math.floor(sorted.length*.5)]||0,p90=sorted[Math.floor(sorted.length*.9)]||med;
    const cfg={Adult:{gap:.115,mult:1.65},Child:{gap:.095,mult:1.50},Geriatric:{gap:.125,mult:1.55},Dysarthria:{gap:.105,mult:1.28}}[mode]||{gap:.115,mult:1.65};
    const threshold=Math.max(med*cfg.mult,p90*.25,1e-5),minFrames=Math.max(1,Math.round(Math.max(.085,cfg.gap)*sr/hop));
    const selected=[];
    for(let i=2;i<env.length-2;i++)if(env[i]>=threshold&&env[i]>=env[i-1]&&env[i]>env[i+1]){if(!selected.length||i-selected[selected.length-1].i>=minFrames)selected.push({i,v:env[i]});else if(env[i]>selected[selected.length-1].v)selected[selected.length-1]={i,v:env[i]};}
    return {events:selected.map(x=>x.i*hop/sr),duration:audio.length/sr,debug:{version:'legacy-fallback',method:'RMS-envelope'}};
  }
  if(typeof window.detectDDK!=='function')window.detectDDK=legacyFallbackDDK;

  // Child reinforcement: training feedback only; it never changes the stored research count.
  const oldRecordingView=window.recordingView;
  if(typeof oldRecordingView==='function'){
    window.recordingView=function(){
      oldRecordingView();
      const game=document.getElementById('childGame');
      if(game&&getComputedStyle(game).display!=='none'){
        game.innerHTML='<div style="font-size:14px;color:var(--muted)">Each detected production earns a ring</div><div id="rewardRings" style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin:12px 0;min-height:24px"></div><div class="road"><div class="car" id="car">🚗</div></div><div id="gameFeedback" style="font-size:12px;color:var(--muted)">Start and repeat the target syllable.</div>';
      }
    };
  }

  const oldDrawWave=window.drawWave;
  let liveRms=[],lastReward=-Infinity;
  if(typeof oldDrawWave==='function'){
    window.drawWave=function(a,marks){
      oldDrawWave(a,marks);
      const game=document.getElementById('childGame'),btn=document.getElementById('recordBtn');
      if(!game||getComputedStyle(game).display==='none'||!btn||!btn.textContent.includes('STOP'))return;
      let s=0;for(let i=0;i<a.length;i++)s+=a[i]*a[i];const rms=Math.sqrt(s/(a.length||1));
      liveRms.push(rms);if(liveRms.length>24)liveRms.shift();
      const sorted=liveRms.slice().sort((x,y)=>x-y),med=sorted[Math.floor(sorted.length*.5)]||0,p90=sorted[Math.floor(sorted.length*.9)]||med;
      const threshold=Math.max(med*1.8,p90*.62,.006),now=performance.now()/1000;
      if(rms>threshold&&now-lastReward>=.10){
        lastReward=now;const rings=document.getElementById('rewardRings');
        if(rings){const ring=document.createElement('span');ring.textContent='⭕';ring.style.fontSize='24px';ring.style.animation='pop .2s ease-out';rings.appendChild(ring);}
        const car=document.getElementById('car');if(car){const current=parseFloat(car.style.left)||0;car.style.left=Math.min(88,current+5)+'%';}
        const fb=document.getElementById('gameFeedback');if(fb)fb.textContent='Good! Keep going.';
      }
    };
  }
  const style=document.createElement('style');style.textContent='@keyframes pop{from{transform:scale(.5);opacity:.2}to{transform:scale(1);opacity:1}}';document.head.appendChild(style);
})();
