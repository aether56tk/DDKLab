const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'dsp-v5.js'), 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);

assert.equal(typeof context.window.detectDDK, 'function');
assert.equal(context.window.DDK_DSP_VERSION, 'DSP-v26');

function toneTrain({sr=16000, duration=2, interval=0.2, pulse=0.07, amp=0.5}={}) {
  const x = new Float32Array(Math.round(sr * duration));
  for (let t=0; t<duration; t+=interval) {
    const start=Math.round(t*sr);
    const end=Math.min(x.length,start+Math.round(pulse*sr));
    for(let i=start;i<end;i++) {
      const u=(i-start)/(end-start);
      x[i] += amp*Math.sin(2*Math.PI*180*u)*(0.5-0.5*Math.cos(2*Math.PI*u));
    }
  }
  return x;
}

{
  const silent = context.window.detectDDK(new Float32Array(16000),16000,'Adult',false);
  assert.equal(silent.events.length,0);
  assert.equal(silent.debug.reason,'near_silence');
}

{
  const result = context.window.detectDDK(toneTrain(),16000,'Adult',false);
  assert.ok(result.events.length >= 5, 'expected repeated events, got '+result.events.length);
  assert.ok(result.events.every((t,i)=>i===0 || t>result.events[i-1]));
  assert.equal(result.debug.version,'DSP-v26');
  assert.equal(result.debug.eventConfidence.length,result.events.length);
}

{
  const result = context.window.detectDDK(toneTrain({interval:0.14}),16000,'Child',true);
  assert.ok(result.events.length >= 6);
  assert.ok(result.debug.expectedGap >= 0);
}

console.log('DDKLab detector smoke tests passed.');
