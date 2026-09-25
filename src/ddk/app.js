const state={stream:null,recorder:null,chunks:[],started:0,raf:null,samples:[],events:[],sessionId:null,car:0,duration:0};
const $=s=>document.querySelector(s);
const root=$('#app');
root.innerHTML=`<div class="shell"><header class="top"><div class="brand"><span>DDK</span>Lab</div><div class="badge">LOCAL ONLY · PRELIMINARY DSP</div></header><div class="grid"><section class="panel"><h2>New session</h2><div class="controls"><div class="field"><label>Participant code</label><input id="pid" value="DDK-001"></div><div class="field"><label>Age / clinical mode</label><select id="age"><option>Child</option><option selected>Adult</option><option>Geriatric</option><option>Dysarthria</option></select></div><div class="field"><label>Task</label><select id="task"><option value="AMR">AMR</option><option value="SMR">SMR</option></select></div><div class="field"><label>Target</label><select id="target"><option>PA</option><option>TA</option><option>KA</option></select></div></div><div class="target" id="targetText">PA</div><div class="timer" id="timer">00:00.0</div><div class="recording"><button class="btn primary" id="start">START</button><button class="btn danger" id="stop" disabled>STOP & ANALYZE</button></div><div class="child" id="child" hidden><div id="car" class="car">🚗</div><div>Reinforcement: each detected production/cycle advances the car.</div></div><p class="notice">One continuous take. No pause, replay, or manual save. Audio stays on this device.</p></section><section class="panel"><h2>Waveform</h2><div class="wave"><canvas id="wave" width="900" height="310"></canvas></div><div class="result"><div class="metric"><strong id="auto">—</strong><small>Automatic count</small></div><div class="metric"><strong id="verified">REVIEW</strong><small>Verified count</small></div><div class="metric"><strong id="rate">—</strong><small>Rate / sec</small></div><div class="metric"><strong id="dur">—</strong><small>Duration</small></div></div><div class="status" id="status">Ready. Select a task and start one continuous recording.</div><div class="events" id="events"></div><div style="display:flex;gap:8px;margin-top:12px"><button class="btn" id="exportJson" disabled>Export JSON</button><button class="btn" id="exportCsv" disabled>Export CSV</button></div></section></div><div class="footer">DDKLab 0.2 · Envelope segmentation PRELIMINARY. Human waveform verification is required before research-grade use.</div></div>`;

const canvas=$('#wave'),ctx=canvas.getContext('2d');
function taskUI(){const smr=$('#task').value==='SMR';$('#target').innerHTML=smr?'<option>PA-TA-KA</option>':'<option>PA</option><option>TA</option><option>KA</option>';$('#targetText').textContent=smr?'PA-TA-KA':$('#target').value;$('#child').hidden=$('#age').value!=='Child';}
$('#task').onchange=taskUI;$('#target').onchange=()=>{$('#targetText').textContent=$('#task').value==='SMR'?'PA-TA-KA':$('#target').value};$('#age').onchange=taskUI;
function draw(data=null){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#080d18';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#1e293b';ctx.beginPath();ctx.moveTo(0,155);ctx.lineTo(canvas.width,155);ctx.stroke();if(!data||!data.length)return;ctx.strokeStyle='#7dd3fc';ctx.lineWidth=1.25;ctx.beginPath();for(let i=0;i<data.length;i++){const x=i/(data.length-1)*canvas.width;const y=155-data[i]*135;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();state.events.forEach((e,i)=>{const x=e.t/state.duration*canvas.width;ctx.strokeStyle='#fbbf24';ctx.beginPath();ctx.moveTo(x,15);ctx.lineTo(x,295);ctx.stroke();ctx.fillStyle='#fbbf24';ctx.font='12px sans-serif';ctx.fillText(String(i+1),Math.min(canvas.width-20,x+3),28)});}

// Research-oriented deterministic envelope detector.
// The previous implementation counted local maxima. That over-counts one syllable
// whenever its consonant burst and vowel create multiple acoustic maxima. We now
// detect broad production regions from a smoothed RMS envelope, use hysteresis,
// and only select one nucleus per production region.
function rmsEnvelope(samples,rate,frameMs=20){const win=Math.max(16,Math.round(rate*frameMs/1000));const out=[];for(let i=0;i<samples.length;i+=win){let s=0;const end=Math.min(samples.length,i+win);for(let j=i;j<end;j++)s+=samples[j]*samples[j];out.push(Math.sqrt(s/Math.max(1,end-i)))}return out;}
function movingAverage(a,r){if(!a.length)return[];const out=new Array(a.length);let sum=0;const w=2*r+1;for(let i=0;i<a.length;i++){sum+=a[i];if(i-w>=0)sum-=a[i-w];const lo=Math.max(0,i-r),hi=Math.min(a.length-1,i+r);out[i]=sum/Math.max(1,hi-lo+1);}return out;}
function median(a){if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);const m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2;}
function quantile(a,q){if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y);return b[Math.max(0,Math.min(b.length-1,Math.floor((b.length-1)*q)))];}
function detect(samples,rate){
  const env=rmsEnvelope(samples,rate,20); if(!env.length)return[];
  const med=median(env)||1;
  const noise=quantile(env,.20);
  const peak=Math.max(...env)||1;
  // Normalize conservatively; avoid a few loud samples determining the floor.
  const scale=Math.max(peak,med*2,1e-9);
  const n=env.map(v=>v/scale);
  // ~100 ms temporal smoothing suppresses internal PA/TA/KA sub-peaks.
  const smooth=movingAverage(n,2);
  const noiseN=Math.max(.004,noise/scale);
  const high=Math.max(noiseN*3.0,quantile(smooth,.45)*0.72);
  const low=Math.max(noiseN*1.65,high*0.58);
  const dt=0.020;
  const minEventGap=$('#age').value==='Dysarthria'?0.105:0.115;
  const minDur=0.035;
  const maxGap=0.075;
  const regions=[];
  let active=false,start=0,lastAbove=-1;
  for(let i=0;i<smooth.length;i++){
    const v=smooth[i];
    if(!active){if(v>=high){active=true;start=i;lastAbove=i;}}
    else if(v>=low){lastAbove=i;}
    else if((i-lastAbove)*dt>maxGap){
      if((lastAbove-start+1)*dt>=minDur)regions.push([start,lastAbove]);
      active=false;
    }
  }
  if(active&&lastAbove>=start&&(lastAbove-start+1)*dt>=minDur)regions.push([start,lastAbove]);
  // Merge tiny gaps: one syllable can have a brief consonant/vowel energy valley.
  const merged=[];
  for(const r of regions){const prev=merged[merged.length-1];if(prev&&((r[0]-prev[1])*dt)<=maxGap){prev[1]=r[1];}else merged.push([...r]);}
  // One event per production region: choose the strongest local nucleus.
  const candidates=[];
  for(const [a,b] of merged){let best=a,bestV=-1;for(let i=a;i<=b;i++){if(smooth[i]>bestV){bestV=smooth[i];best=i;}}candidates.push({t:best*dt,a:bestV});}
  // Refractory pass: if two regions remain implausibly close, keep the stronger one.
  const chosen=[];
  for(const c of candidates){const last=chosen[chosen.length-1];if(!last||c.t-last.t>=minEventGap)chosen.push(c);else if(c.a>last.a)chosen[chosen.length-1]=c;}
  return chosen.map(c=>({t:c.t,a:c.a,confidence:Math.min(1,Math.max(.1,(c.a-low)/(Math.max(.001,1-low))))}));
}
function setStatus(t){$('#status').textContent=t}
function renderEvents(){const box=$('#events');box.innerHTML=state.events.map((e,i)=>`<div class="event"><span>Event ${i+1} · ${e.t.toFixed(3)} s</span><span>${Math.round(e.confidence*100)}% · AUTO</span></div>`).join('');}
function finish(samples,rate,duration){
  state.duration=duration;state.samples=samples;state.events=detect(samples,rate);
  const isSmr=$('#task').value==='SMR';
  const count=isSmr?Math.floor(state.events.length/3):state.events.length;
  $('#auto').textContent=count;
  $('#verified').textContent='REVIEW';
  $('#rate').textContent=(count/Math.max(duration,.001)).toFixed(2);
  $('#dur').textContent=duration.toFixed(2)+' s';
  setStatus(`PRELIMINARY result · ${count} ${isSmr?'SMR cycles':'AMR productions'} detected. Verify every marker against the waveform.`);
  renderEvents();
  const stride=Math.max(1,Math.floor(samples.length/900));draw(samples.filter((_,i)=>i%stride===0));
  $('#exportJson').disabled=false;$('#exportCsv').disabled=false;
  state.car=count;$('#car').style.transform=`translateX(${Math.min(260,count*32)}px)`;
  saveSession(rate,count);
}
async function saveSession(rate,count){
  state.sessionId=`DDK-${Date.now()}`;
  const data={id:state.sessionId,participant:$('#pid').value,ageMode:$('#age').value,task:$('#task').value,target:$('#targetText').textContent,duration:state.duration,automaticCount:count,verifiedCount:null,rate:count/Math.max(state.duration,.001),events:state.events,detector:'PRELIMINARY-ENERGY-SEGMENT-2',status:'REVIEW',createdAt:new Date().toISOString(),sampleRate:rate};
  try{await window.ddklab.storage.saveSession(data)}catch(e){console.error(e);setStatus('Analysis complete, but local session storage failed.');}
}
async function start(){
  try{
    state.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    state.recorder=new MediaRecorder(state.stream);state.chunks=[];state.samples=[];state.events=[];state.started=performance.now();
    state.recorder.ondataavailable=e=>state.chunks.push(e.data);
    state.recorder.onstop=async()=>{try{const blob=new Blob(state.chunks,{type:state.recorder.mimeType||'audio/webm'});const audio=new AudioContext();const buf=await audio.decodeAudioData(await blob.arrayBuffer());const samples=buf.getChannelData(0);finish(samples,buf.sampleRate,(performance.now()-state.started)/1000);await audio.close();}catch(e){console.error(e);setStatus('Audio processing failed. The recording was not scored.');}finally{state.stream?.getTracks().forEach(t=>t.stop());}};
    state.recorder.start();$('#start').disabled=true;$('#stop').disabled=false;setStatus('RECORDING… produce the target continuously.');tick();
  }catch(e){setStatus('Microphone unavailable: '+e.message)}
}
function tick(){if(!state.recorder||state.recorder.state!=='recording')return;$('#timer').textContent=((performance.now()-state.started)/1000).toFixed(1)+' s';state.raf=requestAnimationFrame(tick)}
function stop(){if(state.recorder&&state.recorder.state==='recording'){state.recorder.stop();$('#start').disabled=false;$('#stop').disabled=true;setStatus('Processing waveform…');cancelAnimationFrame(state.raf)}}
$('#start').onclick=start;$('#stop').onclick=stop;
function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
$('#exportJson').onclick=()=>download(`${state.sessionId||'DDK-session'}.json`,JSON.stringify({id:state.sessionId,participant:$('#pid').value,ageMode:$('#age').value,task:$('#task').value,target:$('#targetText').textContent,duration:state.duration,automaticCount:$('#task').value==='SMR'?Math.floor(state.events.length/3):state.events.length,verifiedCount:null,events:state.events,detector:'PRELIMINARY-ENERGY-SEGMENT-2'},null,2),'application/json');
$('#exportCsv').onclick=()=>download(`${state.sessionId||'DDK-session'}.csv`,'event_id,timestamp,confidence,source\n'+state.events.map((e,i)=>`${i+1},${e.t.toFixed(4)},${e.confidence.toFixed(3)},automatic`).join('\n'),'text/csv');
taskUI();draw();