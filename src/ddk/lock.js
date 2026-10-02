(() => {
  const lock = document.getElementById('lock');
  lock.innerHTML = `<div class="locked"><div class="panel lockbox"><h2>DDKLab</h2><p id="lockMsg">Checking application security…</p><input id="pin" inputmode="numeric" type="password" maxlength="8" placeholder="4–8 digit PIN"><button class="btn primary" id="pinBtn">Continue</button><p class="notice">The PIN is protected using the operating system secure-storage facility when available.</p></div></div>`;
  const pin = document.querySelector('#pin');
  const lockMsg = document.querySelector('#lockMsg');
  const pinBtn = document.querySelector('#pinBtn');

  (async () => {
    try {
      const security = window.ddklab?.security;
      if (!security) throw new Error('Desktop security bridge is unavailable.');
      const exists = await security.getPinState();
      if (!exists) {
        lockMsg.textContent = 'Create an application PIN';
        pinBtn.onclick = async () => {
          try { await security.setPin(pin.value); unlock(); }
          catch (e) { lockMsg.textContent = e?.message || 'Unable to create PIN'; }
        };
      } else {
        lockMsg.textContent = 'Enter application PIN';
        pinBtn.onclick = async () => {
          const ok = await security.verifyPin(pin.value);
          if (ok) unlock(); else lockMsg.textContent = 'Incorrect PIN';
        };
      }
    } catch (e) {
      lockMsg.textContent = 'Security initialization failed: ' + (e?.message || e);
    }
  })();

  function unlock() { lock.remove(); }
})();
