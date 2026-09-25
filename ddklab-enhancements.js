/* DDKLab v4 research-safety enhancements
   Local-only. No network/API calls. Child reinforcement is a training UI layer only.
*/
(function(){
  'use strict';

  function robustDDK(audio,sr,mode,isSMR){
    const hop=160, win=640;
    const raw=[];
    for(let i=0;i+win<=audio.length;i+=hop){
      let s=0; for(let j=0;j<win;j++) s+=audio[i+j]*audio[i+j];
      raw.push(Math.sqrt(s/win));
    }
    if(raw.length<10)return {events:[],duration:audio.length/sr,debug:{reason:'too_short'}};

    // ~100 ms smoothing suppresses burst/vowel substructure inside one production.
    const n=5, env=new Float64Array(raw.length); let sum=0;
    for(let i=0;i<raw.length;i++){sum+=raw[i];if(i>=n)sum-=raw[i-n];env[i]=sum/Math.min(i+1,n)}
    const sorted=Array.from(env).sort((a,b)=>a-b);
    const med=sorted[Math.floor(sorted.length*.50)]||0;
    const p80=sorted[Math.floor(sorted.length*.80)]||med;
    const p90=sorted[Math.floor(sorted.length*.90)]||p80;
    const cfg={Adult:{gap:.115,mult:1.65},Child:{gap:.095,mult:1.50},Geriatric:{gap:.125,mult:1.55},Dysarthria:{gap:.145,mult:1.28}}[mode]||{gap:.115,mult:1.65};
    const threshold=Math.max(med*cfg.mult,p80*.48,p90*.25,1e-5);
    const minDist=Math.max(.085,cfg.gap);
    const minFrames=Math.max(1,Math.round(minDist*sr/hop));
    const candidates=[];
    for(let i=2;i<env.length-2;i++){
      const v=env[i]; if(v<threshold)continue;
      if(v>=env[i-1]&&v>env[i+1]&&v>=env[i-2]&&v>=env[i+2]){
        const prominence=v-Math.max(Math.min(env[i-2],env[i-1]),Math.min(env[i+1],env[i+2]));
        if(prominence>=Math.max(med*.10,v*.035))candidates.push({i,v});
      }
    }
    const selected=[];
    for(const c of candidates){
      if(!selected.length){selected.push(c);continue}
      const d=c.i-selected[selected.length-1].i;
      if(d<minFrames){if(c.v>selected[selected.length-1].v)selected[selected.length-1]=c}
      else selected.push(c);
    }
    // Dysarthria: lower floor for weak productions, but keep the same temporal guard.
    if(mode==='Dysarthria'&&selected.length===0){
      const floor=Math.max(med*1.12,p80*.32,1e-5);
      for(let i=2;i<env.length-2;i++){
        if(env[i]>=floor&&env[i]>=env[i-1]&&env[i]>env[i+1]){
          if(!selected.length||i-selected[selected.length-1].i>=minFrames)selected.push({i,v:env[i]});
        }
      }
    }
    const events=selected.map(x=>x.i*hop/sr);
    return {events,duration:audio.length/sr,debug:{threshold,refractory:minDist,frames:raw.length,method:'RMS-envelope peak + non-maximum suppression'}};
  }
  window.detectDDK=robustDDK;

  // Child reinforcement: replace the generic child card with rings + car.
  const oldRecordingView=window.recordingView;
  if(typeof oldRecordingView==='function'){
    window.recordingView=function(){
      oldRecordingView();
      const game=document.getElementById('childGame');
      if(game && getComputedStyle(game).display!=='none'){
        game.innerHTML='<div style="font-size:14px;color:var(--muted)">Each detected production earns a ring</div><div id="rewardRings" style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin:12px 0;min-height:24px"></div><div class="road"><div class="car" id="car">🚗</div></div><div id="gameFeedback" style="font-size:12px;color:var(--muted)">Start and repeat the target syllable.</div>';
      }
    };
  }

  // The original recorder calls drawWave(audioChunk). Hooking drawWave gives us a live,
  // separate reinforcement signal without touching the research detector or stored count.
  const oldDrawWave=window.drawWave;
  let liveRms=[], lastReward=-Infinity;
  if(typeof oldDrawWave==='function'){
    window.drawWave=function(a,marks){
      oldDrawWave(a,marks);
      const game=document.getElementById('childGame');
      const btn=document.getElementById('recordBtn');
      if(!game||getComputedStyle(game).display==='none'||!btn||!btn.textContent.includes('STOP'))return;
      let s=0;for(let i=0;i<a.length;i++)s+=a[i]*a[i];
      const rms=Math.sqrt(s/(a.length||1));
      liveRms.push(rms);if(liveRms.length>24)liveRms.shift();
      const sorted=liveRms.slice().sort((x,y)=>x-y);
      const med=sorted[Math.floor(sorted.length*.5)]||0;
      const p90=sorted[Math.floor(sorted.length*.9)]||med;
      const threshold=Math.max(med*1.8,p90*.62,.006);
      const now=performance.now()/1000;
      if(rms>threshold&&now-lastReward>=.10){
        lastReward=now;
        const rings=document.getElementById('rewardRings');
        if(rings){const ring=document.createElement('span');ring.textContent='⭕';ring.style.fontSize='24px';ring.style.animation='pop .2s ease-out';rings.appendChild(ring)}
        const car=document.getElementById('car');
        if(car){const current=parseFloat(car.style.left)||0;car.style.left=Math.min(88,current+5)+'%'}
        const fb=document.getElementById('gameFeedback');if(fb)fb.textContent='Good! Keep going.';
      }
    };
  }

  const style=document.createElement('style');
  style.textContent='@keyframes pop{from{transform:scale(.5);opacity:.2}to{transform:scale(1);opacity:1}}';
  document.head.appendChild(style);
})();
