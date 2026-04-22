const $ = (id) => document.getElementById(id);

const nowText = $("nowText");
const alarmTime = $("alarmTime");
const soundMode = $("soundMode");
const radioWrap = $("radioWrap");
const stationSelect = $("stationSelect");
const radioUrl = $("radioUrl");
const snoozeMin = $("snoozeMin");

const btnArm = $("btnArm");
const armText = $("armText");
const btnStop = $("btnStop");
const btnSnooze = $("btnSnooze");

const btnPlayTest = $("btnPlayTest");
const btnPauseTest = $("btnPauseTest");
const btnVol = $("btnVol");
const btnClock = $("btnClock");
const btnRadioMode = $("btnRadioMode");
const btnRefresh = $("btnRefresh");

const statusText = $("statusText");
const nextText = $("nextText");

const player = $("player");

// --------- state ----------
let armed = false;
let nextRingAt = null;     // timestamp ms
let tickTimer = null;
let ringing = false;

// --------- helpers ----------
function pad2(n){ return String(n).padStart(2,"0"); }

function formatDateTime(ts){
  const d = new Date(ts);
  return `${pad2(d.getDate())}.${pad2(d.getMonth()+1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function setStatus(s){ statusText.textContent = s; }
function setNext(ts){ nextText.textContent = ts ? formatDateTime(ts) : "—"; }

function updateNow(){
  const d = new Date();
  nowText.textContent = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function computeNextRing(alarmHHMM){
  // alarmHHMM like "07:30"
  const [hh, mm] = alarmHHMM.split(":").map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target.getTime();
}

function showRadioWrap(){
  radioWrap.style.display = (soundMode.value === "radio") ? "block" : "none";
}

function currentSource(){
  if (soundMode.value === "radio") {
    return (radioUrl.value || "").trim();
  }
  // beep: use WebAudio oscillator, but we keep <audio> for radio only
  return "";
}

// --------- audio ----------
let audioCtx = null;
let osc = null;
let gainNode = null;

function beepStart(){
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();

  if (osc) return;

  gainNode = audioCtx.createGain();
  gainNode.gain.value = 0.08;

  osc = audioCtx.createOscillator();
  osc.type = "square";
  osc.frequency.value = 880;

  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start();

  // simple pulsing
  let t = audioCtx.currentTime;
  gainNode.gain.setValueAtTime(0.02, t);
  gainNode.gain.linearRampToValueAtTime(0.10, t + 0.10);
  gainNode.gain.linearRampToValueAtTime(0.02, t + 0.35);
  gainNode.gain.linearRampToValueAtTime(0.10, t + 0.55);
}

function beepStop(){
  if (osc) {
    try { osc.stop(); } catch {}
    try { osc.disconnect(); } catch {}
  }
  if (gainNode) {
    try { gainNode.disconnect(); } catch {}
  }
  osc = null;
  gainNode = null;
}

async function radioStart(url){
  if (!url) throw new Error("Не задан URL потока");
  player.src = url;
  player.loop = false;
  player.volume = Math.min(1, player.volume || 0.7);
  await player.play();
}

function radioStop(){
  player.pause();
  player.removeAttribute("src");
  player.load();
}

// --------- ringing control ----------
async function startRinging(){
  if (ringing) return;
  ringing = true;

  btnStop.disabled = false;
  btnSnooze.disabled = false;

  try{
    if (soundMode.value === "radio") {
      setStatus("звонит (радио)");
      await radioStart(currentSource());
    } else {
      setStatus("звонит (сигнал)");
      beepStart();
    }
  } catch (e){
    setStatus(`ошибка воспроизведения: ${e.message}`);
    ringing = false;
    btnStop.disabled = false;
    btnSnooze.disabled = false;
  }
}

function stopRinging(){
  beepStop();
  radioStop();
  ringing = false;
  btnStop.disabled = true;
  btnSnooze.disabled = true;
}

// --------- alarm scheduling ----------
function armAlarm(){
  const t = alarmTime.value;
  if (!t) {
    setStatus("укажи время");
    return;
  }

  // For mobile browsers: request user gesture for audio (resume context)
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  }

  armed = true;
  nextRingAt = computeNextRing(t);
  setStatus("установлен");
  setNext(nextRingAt);
  armText.textContent = "Снять";
  btnArm.classList.add("armed");

  if (!tickTimer) tickTimer = setInterval(tick, 500);
}

function disarmAlarm(){
  armed = false;
  nextRingAt = null;
  setStatus("не установлен");
  setNext(null);
  armText.textContent = "Поставить";
  stopRinging();

  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function snooze(){
  const m = Math.max(1, Math.min(60, Number(snoozeMin.value || 5)));
  stopRinging();
  armed = true;
  nextRingAt = Date.now() + m * 60 * 1000;
  setStatus(`снуз ${m} мин`);
  setNext(nextRingAt);
}

function tick(){
  updateNow();
  if (!armed || !nextRingAt) return;
  if (!ringing && Date.now() >= nextRingAt) {
    startRinging();
    // schedule next day automatically
    const t = alarmTime.value;
    if (t) nextRingAt = computeNextRing(t);
    setNext(nextRingAt);
  }
}

// --------- UI events ----------
soundMode.addEventListener("change", () => {
  showRadioWrap();
});

stationSelect.addEventListener("change", () => {
  const v = stationSelect.value;
  if (!v) return;
  soundMode.value = "radio";
  showRadioWrap();
  radioUrl.value = v;
});

btnArm.addEventListener("click", async () => {
  // ask notification permission (optional)
  if ("Notification" in window && Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch {}
  }
  if (armed) disarmAlarm();
  else armAlarm();
});

btnStop.addEventListener("click", () => {
  stopRinging();
  setStatus(armed ? "установлен" : "не установлен");
});

btnSnooze.addEventListener("click", () => {
  snooze();
});

btnPlayTest.addEventListener("click", async () => {
  try{
    if (soundMode.value === "radio") {
      await radioStart(currentSource());
      setStatus("тест: радио играет");
    } else {
      beepStart();
      setStatus("тест: сигнал");
    }
  } catch(e){
    setStatus(`тест: ошибка: ${e.message}`);
  }
});

btnPauseTest.addEventListener("click", () => {
  beepStop();
  radioStop();
  setStatus(armed ? "установлен" : "не установлен");
});

btnVol.addEventListener("click", () => {
  // increase radio volume (beep volume is fixed)
  player.volume = Math.min(1, (player.volume || 0.7) + 0.1);
  setStatus(`громкость: ${Math.round(player.volume * 100)}%`);
});

btnClock.addEventListener("click", () => {
  updateNow();
  setStatus("время обновлено");
});

btnRadioMode.addEventListener("click", () => {
  soundMode.value = "radio";
  showRadioWrap();
  setStatus("режим: радио");
});

btnRefresh.addEventListener("click", () => {
  location.reload();
});

// initial
showRadioWrap();
updateNow();
setInterval(updateNow, 1000);
setStatus("не установлен");
setNext(null);

// service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (e) {
      // ignore
    }
  });
}