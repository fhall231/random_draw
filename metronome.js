// metronome.js: the metronome (sounds, tempo and volume settings, audio engine).
//
// Loaded by index.html after defaults.js and before the main script. It only
// needs the elements with ids playBtn, bpmOut, bpmLabel, bpmSlider, volSlider and soundSel,
// and index.html must call initMetro() once at start-up.
//
// The sound recipes come first, so they are easy to find and edit.

const byId = id => document.getElementById(id);

// ---------------------------------------------------------------
// Click sounds. Pick one with SOUND. Each function plays one
// click at time `t` (seconds on the audio clock) with loudness `vol` (0-1).
// Available inside them: audio (the AudioContext), out (where to send the
// sound), fade(gain, t, peak, duration) and noise() (a buffer of white noise).
// ---------------------------------------------------------------
const SOUND = "beep";        // defaul sound on a first visit then spec from menu

// sounds in menu dropdown: name from SOUNDS: "text shown in the menu"
const SOUND_CHOICES = { tick: "tick", hihat: "tsss", beep: "beep" };

function validSound(name) {
  return Object.keys(SOUND_CHOICES).includes(name) && typeof SOUNDS[name] === "function";
}

// metallic hi-hat, 808 style: six square waves at unrelated pitches make an
// inharmonic clang; the filters keep only the top of it, and a short envelope
// shapes it. `decay` is the length in seconds: short = closed hat, long = open hat.

const HAT_GAIN = 1.6;          // loudness of the hi-hats (matched to the other sounds)

const SOUNDS = {
  
  // plain electronic beep: sine wave that fades in 50 ms
  beep(t, vol) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 1100;
    fade(g, t, vol, 0.05);
    o.connect(g).connect(out);
    o.start(t);  o.stop(t + 0.06);
  },

  // tick: a 30 ms burst of noise, filtered to a band around 1000 Hz
  tick(t, vol) {
    const s = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
    s.buffer = noise();
    f.type = "bandpass";  f.frequency.value = 1000;  f.Q.value = 1.0;
    fade(g, t, vol * 3.5, 0.03);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 0.8, 0.04);   // start somewhere random in the noise, play 40 ms
  },

  hihat(t, vol) {
    const bp = audio.createBiquadFilter(), hp = audio.createBiquadFilter(), g = audio.createGain();
    bp.type = "bandpass";  bp.frequency.value = 9000;  bp.Q.value = 0.5;   // on a small phone speaker try 8000
    hp.type = "highpass";  hp.frequency.value = 5000;                      // ... and 5000
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * HAT_GAIN, t + 0.003);   // 3 ms attack
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07); // decay = 0.07
    for (const ratio of [2, 3, 4.16, 5.43, 6.79, 8.21]) {
      const o = audio.createOscillator();
      o.type = "square";  o.frequency.value = 40 * ratio;
      o.connect(bp);
      o.start(t);  o.stop(t + 0.07 + 0.01); // decay = 0.07
    }
    bp.connect(hp).connect(g).connect(out);
  },


  // experimental wood block: the pitch drops fast from 1800 to 700 Hz
  wood(t, vol) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.setValueAtTime(1800, t);
    o.frequency.exponentialRampToValueAtTime(700, t + 0.03);
    fade(g, t, vol, 0.08);
    o.connect(g).connect(out);
    o.start(t);  o.stop(t + 0.09);
  },

};

// ---------------------------------------------------------------
// Metronome (Web Audio). Tempo and volume are saved under their own
// key, separate from the draw settings. They apply instantly: the
// menu's Save/Cancel buttons do not affect them.
// ---------------------------------------------------------------
const BPM_MIN = 32, BPM_MAX = 220;
const MKEY = "randomdraw.metro";
const LOOKAHEAD = 0.25;       // seconds of clicks scheduled in advance (more = steadier on slow phones)
const metro = loadMetro();
let audio = null;             // AudioContext, created on the first tap
let out = null;               // master volume node: every click goes through it
let playing = false;
let nextTime = 0;             // when the next click sounds (audio clock, seconds)
let timer = null;
let wakeLock = null;

function loadMetro() {
  const m = { bpm: 100, volume: 0.5, sound: validSound(SOUND) ? SOUND : Object.keys(SOUND_CHOICES)[0] };
  try {
    const s = JSON.parse(localStorage.getItem(MKEY));
    if (s && Number.isFinite(s.bpm))    m.bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(s.bpm)));
    if (s && Number.isFinite(s.volume)) m.volume = Math.min(1, Math.max(0, s.volume));
    if (s && validSound(s.sound))       m.sound = s.sound;
  } catch (e) {}
  return m;
}
function saveMetro() {
  try { localStorage.setItem(MKEY, JSON.stringify(metro)); } catch (e) {}
}

function setBpm(v) {
  metro.bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(v)));
  byId("bpmOut").value         = metro.bpm;
  byId("bpmLabel").textContent = metro.bpm;
  byId("bpmSlider").value      = metro.bpm;
  saveMetro();
}
// called when the number box is edited and confirmed (Enter, or tapping elsewhere)
function commitBpm(el) {
  const v = parseFloat(el.value);
  setBpm(Number.isFinite(v) ? v : metro.bpm);        // empty or invalid: put the old value back
}
function setVolume(v) {
  metro.volume = Math.min(1, Math.max(0, v));
  byId("volSlider").value = Math.round(metro.volume * 100);
  saveMetro();
}

// ---------------------------------------------------------------
// Helpers used by the sound recipes at the top of this file.
// ---------------------------------------------------------------

// volume envelope: instant attack, then an exponential fade to near silence
function fade(g, t, peak, dur) {
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
}

// a second of white noise, made once and reused by every tick
let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// choose the click sound (a name from SOUND_CHOICES) and remember it
function setSound(name) {
  if (!validSound(name)) name = metro.sound;
  metro.sound = name;
  byId("soundSel").value = name;
  saveMetro();
}

// one click, so a new choice can be heard without starting the metronome
let previewTimer = null;
function previewSound() {
  if (playing) return;                       // while running, the clicks themselves show the change
  ensureAudio();
  makeOut();
  click(audio.currentTime + 0.02);
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {          // free the master node once the sound has died away
    if (!playing && out) { out.disconnect(); out = null; }
  }, 700);
}

// one click at an exact time on the audio clock
function click(time) {
  const play = SOUNDS[metro.sound] || Object.values(SOUNDS)[0];   // unknown name: use the first sound
  play(time, metro.volume ** 2);                            // squared: closer to how loudness is heard
}

// runs every 25 ms and schedules every click due in the next LOOKAHEAD seconds
function scheduler() {
  // if the phone was too busy to run us for a while, skip the missed clicks instead of
  // playing them all at once
  if (nextTime < audio.currentTime) nextTime = audio.currentTime + 0.02;
  while (nextTime < audio.currentTime + LOOKAHEAD) {
    click(nextTime);
    nextTime += 60 / metro.bpm;
  }
}

// create the audio object on first use (browsers only allow this after a tap)
function ensureAudio() {
  if (!audio) {
    // "playback": a bigger audio buffer, so a busy phone is less likely to glitch
    audio = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "playback" });
  }
  audio.resume();                                    // browsers start audio suspended
}

// a fresh master volume node, with a safety limiter after it
function makeOut() {
  if (out) out.disconnect();
  out = audio.createGain();
  const limiter = audio.createDynamicsCompressor();  // very loud clicks are squeezed instead of clipping
  limiter.threshold.value = -2;  limiter.knee.value = 0;  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;  limiter.release.value = 0.05;
  out.connect(limiter).connect(audio.destination);
}

function startMetro() {
  ensureAudio();
  makeOut();
  playing = true;
  nextTime = audio.currentTime + 0.05;
  scheduler();
  timer = setInterval(scheduler, 25);
  byId("playBtn").textContent = "\u25A0";              // stop square
  keepAwake(true);
}
function stopMetro() {
  playing = false;
  clearInterval(timer);
  if (out) { out.disconnect(); out = null; }         // silences clicks already scheduled
  byId("playBtn").textContent = "\u25B6\uFE0E";       // play triangle (text style)
  keepAwake(false);
}
function toggleMetro() { playing ? stopMetro() : startMetro(); }

// keep the screen on while the metronome runs
async function keepAwake(on) {
  try {
    if (on) {
      if ("wakeLock" in navigator && (!wakeLock || wakeLock.released)) {
        const lock = await navigator.wakeLock.request("screen");
        if (playing) wakeLock = lock; else lock.release();   // stopped while waiting
      }
    } else if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) {}
}
// the browser drops the lock when the page is hidden: ask again on return
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && playing) keepAwake(true);
});

// call once at start-up: shows the saved tempo and volume in the controls
function initMetro() {
  const sel = byId("soundSel");
  for (const [key, label] of Object.entries(SOUND_CHOICES)) sel.add(new Option(label, key));
  setSound(metro.sound);
  setBpm(metro.bpm);
  setVolume(metro.volume);
}
