'use strict';

// -- DOM refs ------------------------------------------------------------------
const ringBtn        = document.getElementById('ringBtn');
const ringWrapper    = document.getElementById('ringWrapper');
const timerDisplay   = document.getElementById('timerDisplay');
const ringStatus     = document.getElementById('ringStatus');
const ringProgress   = document.getElementById('ringProgress');
const durBtns        = document.querySelectorAll('.dur-btn');
const customDurBtn   = document.getElementById('customDurBtn');
const customInputRow = document.getElementById('customInputRow');
const customMinutes  = document.getElementById('customMinutes');
const setCustomBtn   = document.getElementById('setCustomBtn');

const odoHoursEl   = document.getElementById('odoHours');
const odoMinutesEl = document.getElementById('odoMinutes');
const odoSecondsEl = document.getElementById('odoSeconds');
const hoursWrap    = document.getElementById('hoursWrap');

// -- Constants -----------------------------------------------------------------
const RING_CIRCUMFERENCE = 2 * Math.PI * 80; // r=80

// -- State ---------------------------------------------------------------------
let wakeLock    = null;
let isActive    = false;
let durationSec = 0;   // 0 = indefinite
let elapsedSec  = 0;
let tickInterval = null;

// -- Odometer instances -------------------------------------------------------
let odoHours, odoMinutes, odoSeconds;
;(function () {
  const opts = { format: 'dd', duration: 500, animation: 'slide' };
  odoHours   = new Odometer({ el: odoHoursEl,   value: 0, ...opts });
  odoMinutes = new Odometer({ el: odoMinutesEl, value: 0, ...opts });
  odoSeconds = new Odometer({ el: odoSecondsEl, value: 0, ...opts });
}());

function setTimerDisplay(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  hoursWrap.hidden = h === 0;
  if (h > 0) odoHours.update(h);
  odoMinutes.update(m);
  odoSeconds.update(s);
}

// -- Timer format --------------------------------------------------------------
function formatTime(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// -- Ring progress -------------------------------------------------------------
function updateRingProgress() {
  if (durationSec === 0) {
    ringProgress.style.strokeDashoffset = '350';
    return;
  }
  const remaining = Math.max(durationSec - elapsedSec, 0);
  const fraction  = remaining / durationSec;
  ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - fraction));
}

// -- Tick ----------------------------------------------------------------------
function tick() {
  elapsedSec++;

  if (durationSec === 0) {
    setTimerDisplay(elapsedSec);
  } else {
    const remaining = durationSec - elapsedSec;
    if (remaining <= 0) {
      setTimerDisplay(0);
      updateRingProgress();
      stopWakeLock();
      showToast('Done');
      return;
    }
    setTimerDisplay(remaining);
    updateRingProgress();
  }
}

// -- Wake Lock -----------------------------------------------------------------
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) {
    showToast('Wake Lock not supported in this browser');
    return false;
  }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      if (isActive) {
        stopWakeLock(false);
        showToast('Wake lock released');
      }
    });
    return true;
  } catch (err) {
    showToast('Could not acquire wake lock');
    return false;
  }
}

async function startWakeLock() {
  const ok = await requestWakeLock();
  if (!ok) return;

  isActive   = true;
  elapsedSec = 0;

  ringBtn.classList.add('active');
  ringWrapper.classList.add('active');
  ringBtn.setAttribute('aria-pressed', 'true');
  ringStatus.textContent = durationSec === 0 ? 'awake' : 'counting down';

  if (durationSec === 0) {
    ringBtn.classList.add('infinite');
    ringProgress.style.strokeDashoffset = '0'; // allow comet CSS to render arc
    setTimerDisplay(0);
  } else {
    ringBtn.classList.remove('infinite');
    setTimerDisplay(durationSec);
    updateRingProgress();
  }

  tickInterval = setInterval(tick, 1000);
}

function stopWakeLock(releaseExplicit = true) {
  if (!isActive) return;

  isActive = false;
  clearInterval(tickInterval);
  tickInterval = null;

  if (releaseExplicit && wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }

  ringBtn.classList.remove('active', 'infinite');
  ringWrapper.classList.remove('active');
  ringBtn.setAttribute('aria-pressed', 'false');
  ringStatus.textContent   = 'tap to start';
  setTimerDisplay(0);
  ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE);

  durationSec = 0;
  durBtns.forEach(b => b.classList.remove('selected'));
  customDurBtn.textContent = 'Custom';
  customInputRow.hidden = true;
  customMinutes.value = '';
}

// Re-acquire when tab becomes visible again
document.addEventListener('visibilitychange', async () => {
  if (isActive && document.visibilityState === 'visible' && (!wakeLock || wakeLock.released)) {
    await requestWakeLock();
  }
});

// -- Ring click ----------------------------------------------------------------
ringBtn.addEventListener('click', () => {
  isActive ? stopWakeLock() : startWakeLock();
});

// -- Duration selection --------------------------------------------------------
durBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn === customDurBtn) {
      customInputRow.hidden = !customInputRow.hidden;
      if (!customInputRow.hidden) {
        customMinutes.focus();
        customMinutes.select();
      }
      return;
    }

    customInputRow.hidden = true;
    durBtns.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    durationSec = parseInt(btn.dataset.minutes, 10) * 60;

    if (isActive) { stopWakeLock(); startWakeLock(); }
  });
});

setCustomBtn.addEventListener('click', applyCustomDuration);
customMinutes.addEventListener('keydown', e => {
  if (e.key === 'Enter') applyCustomDuration();
});

function applyCustomDuration() {
  const val = parseInt(customMinutes.value, 10);
  if (!val || val < 1) { showToast('Enter a valid number of minutes'); return; }

  durationSec = val * 60;
  customInputRow.hidden = true;

  durBtns.forEach(b => b.classList.remove('selected'));
  customDurBtn.classList.add('selected');
  customDurBtn.textContent = `${val} min`;

  if (isActive) { stopWakeLock(); }
  startWakeLock();
}

// -- Toast ---------------------------------------------------------------------
let toastTimeout = null;

function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}
