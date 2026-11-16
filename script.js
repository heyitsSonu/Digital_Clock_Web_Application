/* =========================================================
   Chronos – Digital Clock | Vanilla JavaScript
   Sections: helpers, preferences, clock, theme, fullscreen,
             stopwatch, countdown, alarms, alert dialog, init
   ========================================================= */
'use strict';

/* ---------- Helpers ---------- */
const $ = (id) => document.getElementById(id);
const pad = (n, len = 2) => String(n).padStart(len, '0');

/** Convert milliseconds to "HH:MM:SS" (optionally with .cc centiseconds). */
function formatDuration(ms, withCentis = false) {
  const total = Math.max(0, ms);
  const h = Math.floor(total / 3600000);
  const m = Math.floor(total / 60000) % 60;
  const s = Math.floor(total / 1000) % 60;
  const base = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return withCentis ? `${base}.${pad(Math.floor(total / 10) % 100)}` : base;
}

/** Show a status message under a widget. */
function setMessage(el, text, isError = false) {
  el.textContent = text;
  el.classList.toggle('error', isError);
}

/* ---------- Preferences (localStorage, safely wrapped) ---------- */
const STORE_KEY = 'chronos.prefs.v1';
const defaults = { theme: 'dark', hour24: false, alarms: [] };

function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    return { ...defaults, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch {
    return { ...defaults };
  }
}
function savePrefs() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
}
const prefs = loadPrefs();
if (!Array.isArray(prefs.alarms)) prefs.alarms = [];

/* ---------- Main clock ---------- */
const els = {
  hours: $('hours'), minutes: $('minutes'), seconds: $('seconds'), ampm: $('ampm'),
  date: $('dateText'), tz: $('tzText'),
};
let lastSecondKey = '';   // avoids touching the DOM when nothing changed
let lastDateText = '';

/** Build a "UTC+05:30" string from the system offset. */
function utcOffsetString(date) {
  const offset = -date.getTimezoneOffset();          // minutes east of UTC
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function renderClock(now = new Date()) {
  const key = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}:${prefs.hour24}`;
  if (key === lastSecondKey) return;
  lastSecondKey = key;

  let h = now.getHours();
  if (!prefs.hour24) {
    els.ampm.hidden = false;
    els.ampm.textContent = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
  } else {
    els.ampm.hidden = true;
  }
  els.hours.textContent = pad(h);
  els.minutes.textContent = pad(now.getMinutes());
  els.seconds.textContent = pad(now.getSeconds());

  // Date + timezone only change at midnight, so skip rewriting otherwise
  const dateText = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  if (dateText !== lastDateText) {
    lastDateText = dateText;
    els.date.textContent = dateText;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
    els.tz.textContent = `${zone.replace(/_/g, ' ')} (${utcOffsetString(now)})`;
  }
}

/** One shared tick drives the clock and alarm check. Polling at 250 ms
    keeps the seconds accurate (no drift) while the DOM only updates on change. */
let clockInterval = null;
function startClock() {
  if (clockInterval !== null) return;                // never create a second interval
  const tick = () => { const now = new Date(); renderClock(now); checkAlarms(now); };
  tick();
  clockInterval = setInterval(tick, 250);
}

/* ---------- Time format toggle ---------- */
function applyFormat() {
  $('formatLabel').textContent = prefs.hour24 ? '24h' : '12h';
  $('formatBtn').setAttribute('aria-pressed', String(prefs.hour24));
  lastSecondKey = '';
  renderClock();
}
$('formatBtn').addEventListener('click', () => {
  prefs.hour24 = !prefs.hour24;
  savePrefs();
  applyFormat();
});

/* ---------- Theme toggle ---------- */
function applyTheme() {
  document.documentElement.setAttribute('data-theme', prefs.theme);
}
$('themeBtn').addEventListener('click', () => {
  prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark';
  savePrefs();
  applyTheme();
});

/* ---------- Fullscreen ---------- */
$('fullscreenBtn').addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch (err) {
    console.info('Fullscreen unavailable:', err.message);
  }
});
document.addEventListener('fullscreenchange', () => {
  $('fullscreenBtn').setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
});

/* ---------- Stopwatch ---------- */
const sw = { interval: null, startedAt: 0, elapsed: 0, laps: [] };

function swTime() {
  return sw.interval !== null ? sw.elapsed + (performance.now() - sw.startedAt) : sw.elapsed;
}
function swRender() { $('swDisplay').textContent = formatDuration(swTime(), true); }
function swButtons(running) {
  $('swStart').disabled = running;
  $('swPause').disabled = !running;
  $('swLap').disabled = !running;
}
$('swStart').addEventListener('click', () => {
  if (sw.interval !== null) return;
  sw.startedAt = performance.now();
  sw.interval = setInterval(swRender, 33);
  swButtons(true);
});
$('swPause').addEventListener('click', () => {
  if (sw.interval === null) return;
  sw.elapsed = swTime();
  clearInterval(sw.interval);
  sw.interval = null;
  swRender();
  swButtons(false);
  $('swStart').textContent = 'Resume';
});
$('swLap').addEventListener('click', () => {
  const total = swTime();
  const previous = sw.laps.length ? sw.laps[sw.laps.length - 1] : 0;
  sw.laps.push(total);
  const li = document.createElement('li');
  li.innerHTML = `<span>Lap ${sw.laps.length}</span><span>+${formatDuration(total - previous, true)}</span><span>${formatDuration(total, true)}</span>`;
  $('lapList').prepend(li);
});
$('swReset').addEventListener('click', () => {
  clearInterval(sw.interval);
  Object.assign(sw, { interval: null, startedAt: 0, elapsed: 0, laps: [] });
  $('lapList').innerHTML = '';
  $('swStart').textContent = 'Start';
  swButtons(false);
  $('swPause').disabled = true;
  swRender();
});

/* ---------- Countdown timer ---------- */
const tm = { interval: null, endAt: 0, remaining: 0, total: 0 };
const tmInputs = [$('tmH'), $('tmM'), $('tmS')];

/** Validate inputs; returns total milliseconds or null (and shows an error). */
function readTimerInputs() {
  const limits = [99, 59, 59];
  const values = [];
  let ok = true;
  tmInputs.forEach((input, i) => {
    const raw = input.value.trim() === '' ? '0' : input.value;
    const n = Number(raw);
    const valid = Number.isInteger(n) && n >= 0 && n <= limits[i];
    input.setAttribute('aria-invalid', String(!valid));
    if (!valid) ok = false;
    values.push(n);
  });
  if (!ok) { setMessage($('tmMsg'), 'Use whole numbers: hours 0–99, minutes and seconds 0–59.', true); return null; }
  const ms = ((values[0] * 60 + values[1]) * 60 + values[2]) * 1000;
  if (ms === 0) { setMessage($('tmMsg'), 'Set a time greater than zero.', true); return null; }
  setMessage($('tmMsg'), '');
  return ms;
}
function tmRender(ms) {
  $('tmDisplay').textContent = formatDuration(Math.ceil(ms / 1000) * 1000);
  $('tmBar').style.width = tm.total ? `${(100 * (tm.total - ms)) / tm.total}%` : '0%';
}
function tmButtons(running, paused) {
  $('tmStart').disabled = running;
  $('tmPause').disabled = !running;
  $('tmStart').textContent = paused ? 'Resume' : 'Start';
  tmInputs.forEach((i) => { i.disabled = running || paused; });
}
function tmStop() { clearInterval(tm.interval); tm.interval = null; }

$('tmStart').addEventListener('click', () => {
  if (tm.interval !== null) return;
  if (tm.remaining <= 0) {                       // fresh start: read inputs
    const ms = readTimerInputs();
    if (ms === null) return;
    tm.total = tm.remaining = ms;
  }
  tm.endAt = Date.now() + tm.remaining;
  tm.interval = setInterval(() => {
    tm.remaining = tm.endAt - Date.now();
    if (tm.remaining <= 0) {
      tmStop();
      tm.remaining = 0;
      tmRender(0);
      $('tmBar').style.width = '100%';
      tmButtons(false, false);
      showAlert('Timer finished', 'Your countdown has reached zero.');
      return;
    }
    tmRender(tm.remaining);
  }, 200);
  tmButtons(true, false);
  setMessage($('tmMsg'), 'Timer running…');
});
$('tmPause').addEventListener('click', () => {
  if (tm.interval === null) return;
  tm.remaining = tm.endAt - Date.now();
  tmStop();
  tmButtons(false, true);
  setMessage($('tmMsg'), 'Paused.');
});
$('tmReset').addEventListener('click', () => {
  tmStop();
  tm.remaining = 0; tm.total = 0;
  tmButtons(false, false);
  setMessage($('tmMsg'), '');
  syncTimerPreview();
});
/** Keep the readout in sync with the inputs while the timer is idle. */
function syncTimerPreview() {
  if (tm.interval !== null || tm.remaining > 0) return;
  const [h, m, s] = tmInputs.map((i) => Math.max(0, Math.floor(Number(i.value) || 0)));
  $('tmDisplay').textContent = formatDuration(((h * 60 + m) * 60 + s) * 1000);
  $('tmBar').style.width = '0%';
}
tmInputs.forEach((i) => i.addEventListener('input', () => { i.removeAttribute('aria-invalid'); syncTimerPreview(); }));

/* ---------- Alarms ---------- */
let lastAlarmMinute = '';

function renderAlarms() {
  const list = $('alarmList');
  list.innerHTML = '';
  if (!prefs.alarms.length) {
    const li = document.createElement('li');
    li.textContent = 'No alarms yet. Pick a time and set one.';
    li.className = 'a-label';
    list.append(li);
    return;
  }
  [...prefs.alarms].sort((a, b) => a.time.localeCompare(b.time)).forEach((alarm) => {
    const li = document.createElement('li');
    li.className = alarm.enabled ? '' : 'off';
    const time = document.createElement('span');
    time.className = 'a-time';
    time.textContent = displayAlarmTime(alarm.time);
    const label = document.createElement('span');
    label.className = 'a-label';
    label.textContent = alarm.label;                 // textContent prevents HTML injection
    const toggle = document.createElement('button');
    toggle.className = 'btn small';
    toggle.textContent = alarm.enabled ? 'On' : 'Off';
    toggle.setAttribute('aria-label', `Turn alarm ${alarm.enabled ? 'off' : 'on'}`);
    toggle.addEventListener('click', () => { alarm.enabled = !alarm.enabled; savePrefs(); renderAlarms(); });
    const del = document.createElement('button');
    del.className = 'btn small';
    del.textContent = 'Delete';
    del.addEventListener('click', () => {
      prefs.alarms = prefs.alarms.filter((a) => a.id !== alarm.id);
      savePrefs(); renderAlarms();
    });
    li.append(time, label, toggle, del);
    list.append(li);
  });
}
function displayAlarmTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  if (prefs.hour24) return hhmm;
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}

$('alarmForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const timeInput = $('alTime');
  const time = timeInput.value;
  if (!/^\d{2}:\d{2}$/.test(time)) {
    timeInput.setAttribute('aria-invalid', 'true');
    setMessage($('alMsg'), 'Choose a valid alarm time.', true);
    return;
  }
  timeInput.removeAttribute('aria-invalid');
  const label = $('alLabel').value.trim() || 'Alarm';
  prefs.alarms.push({ id: Date.now() + Math.random(), time, label, enabled: true });
  savePrefs();
  renderAlarms();
  setMessage($('alMsg'), `Alarm set for ${displayAlarmTime(time)}.`);
  $('alLabel').value = '';
});

/** Called on every clock tick; fires each alarm once when its minute starts. */
function checkAlarms(now) {
  const current = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (current === lastAlarmMinute) return;
  lastAlarmMinute = current;
  const due = prefs.alarms.filter((a) => a.enabled && a.time === current);
  if (!due.length) return;
  due.forEach((a) => { a.enabled = false; });        // one-shot alarms
  savePrefs();
  renderAlarms();
  showAlert('Alarm', due.map((a) => `${a.label} (${displayAlarmTime(a.time)})`).join(', '));
}

/* ---------- Alert dialog + beep ---------- */
let audioCtx = null;
let beepInterval = null;

function beepOnce() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.4);
  } catch { /* audio blocked or unsupported */ }
}
function showAlert(title, text) {
  $('alertTitle').textContent = title;
  $('alertText').textContent = text;
  $('alert').hidden = false;
  $('alertClose').focus();
  if (beepInterval === null) { beepOnce(); beepInterval = setInterval(beepOnce, 900); }
}
function closeAlert() {
  $('alert').hidden = true;
  clearInterval(beepInterval);
  beepInterval = null;
}
$('alertClose').addEventListener('click', closeAlert);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('alert').hidden) closeAlert(); });

/* ---------- Init ---------- */
applyTheme();
applyFormat();
renderAlarms();
syncTimerPreview();
swRender();
startClock();
