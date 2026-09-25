const lock=document.getElementById('lock');
lock.innerHTML=`<div class="locked"><div class="panel lockbox"><h2>DDKLab</h2><p id="lockMsg">Checking application security…</p><input id="pin" inputmode="numeric" type="password" maxlength="8" placeholder="4–8 digit PIN"><button class="btn primary" id="pinBtn">Continue</button><p class="notice">The PIN is protected using the operating system secure-storage facility when available.</p></div></div>`;
const pin=$('#pin');
function $(s){return document.querySelector(s)}
(async()=>{try{const exists=await window.ddklab.security.getPinState();if(!exists){$('#lockMsg').textContent='Create an application PIN';$('#pinBtn').onclick=async()=>{try{await window.ddklab.security.setPin(pin.value);unlock()}catch(e){$('#lockMsg').textContent=e.message}}}else{$('#lockMsg').textContent='Enter application PIN';$('#pinBtn').onclick=async()=>{const ok=await window.ddklab.security.verifyPin(pin.value);if(ok)unlock();else $('#lockMsg').textContent='Incorrect PIN';}}}catch(e){$('#lockMsg').textContent='Security initialization failed: '+e.message}})();
function unlock(){lock.remove();}
