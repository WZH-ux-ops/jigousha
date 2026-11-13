/* =========================================================
 *  鸡狗杀 · 背景音乐
 *  - 优先播放 music/ 文件夹里的音频（随机）
 *  - 没有音频文件时，用 WebAudio 合成原创 BGM（随机曲目）
 * ========================================================= */
(function (root) {
  'use strict';

  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  };

  const S = {
    ready: false, playing: false, mode: 'synth', enabled: LS.get('jgs.music') !== '0',
    vol: parseFloat(LS.get('jgs.vol') || '0.5'),
    tracks: [], idx: -1, title: '舞台准备中…',
    ctx: null, master: null, audio: null, timer: null, nextTime: 0, beat: 0,
    song: null, listeners: [], started: false
  };

  /* ---------------- 原创合成曲目 ---------------- */
  const SONGS = [
    {
      name: '迷子のワルツ', bpm: 92, drums: 'waltz',
      prog: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
      lead: [0, 2, 4, 2, 1, 3, 5, 4], tone: 'triangle'
    },
    {
      name: '仮面のマーチ', bpm: 112, drums: 'rock',
      prog: [[50, 53, 57], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
      lead: [0, 3, 2, 4, 5, 3, 2, 0], tone: 'square'
    },
    {
      name: '終幕のノクターン', bpm: 74, drums: 'soft',
      prog: [[53, 56, 60], [48, 52, 55], [50, 53, 57], [46, 50, 53]],
      lead: [4, 2, 3, 1, 5, 3, 2, 4], tone: 'sine'
    },
    {
      name: '春の残響', bpm: 84, drums: 'waltz',
      prog: [[57, 60, 64], [55, 59, 62], [53, 57, 60], [52, 55, 59]],
      lead: [2, 4, 5, 4, 3, 2, 0, 2], tone: 'triangle'
    },
    {
      name: '夜のリハーサル', bpm: 104, drums: 'rock',
      prog: [[45, 48, 52], [48, 52, 55], [43, 47, 50], [50, 53, 57]],
      lead: [0, 2, 3, 5, 4, 3, 2, 1], tone: 'sawtooth'
    }
  ];

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function emit() {
    S.listeners.forEach(cb => { try { cb(S); } catch (e) { } });
  }

  function onChange(cb) { S.listeners.push(cb); cb(S); }

  function ensureCtx() {
    if (S.ctx) return S.ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    S.ctx = new AC();
    S.master = S.ctx.createGain();
    S.master.gain.value = 0.0001;
    S.master.connect(S.ctx.destination);
    return S.ctx;
  }

  function note(freq, t, dur, type, gain, detune) {
    const ctx = S.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'triangle';
    o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + Math.min(0.06, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(S.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(t, dur, gain, hp) {
    const ctx = S.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp || 3000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(S.master);
    src.start(t);
  }

  function scheduleBeat(beat, t) {
    const song = S.song;
    const prog = song.prog;
    const barLen = song.drums === 'waltz' ? 6 : 8;
    const bar = Math.floor(beat / barLen) % prog.length;
    const pos = beat % barLen;
    const chord = prog[bar];
    const root = chord[0];

    if (pos === 0) {
      // 和弦铺底
      chord.forEach((n, i) => note(mtof(n - 12), t, (60 / song.bpm) * barLen * 0.95, 'triangle', 0.055 - i * 0.008, i === 1 ? 4 : 0));
      // 低音
      note(mtof(root - 24), t, (60 / song.bpm) * 1.6, 'sine', 0.16);
    }

    // 鼓
    if (song.drums === 'waltz') {
      if (pos === 0) { note(58, t, 0.12, 'sine', 0.14); }
      if (pos === 2 || pos === 4) noise(t, 0.05, 0.05, 5000);
    } else if (song.drums === 'rock') {
      if (pos === 0 || pos === 4) note(56, t, 0.12, 'sine', 0.2);
      if (pos === 2 || pos === 6) noise(t, 0.09, 0.09, 1800);
      if (pos % 2 === 1) noise(t, 0.03, 0.03, 7000);
    } else {
      if (pos === 0) note(50, t, 0.2, 'sine', 0.12);
      if (pos === 4) noise(t, 0.05, 0.03, 2200);
    }

    // 旋律
    const leadSteps = song.drums === 'waltz' ? [0, 1, 2, 4, 5] : [0, 1, 2, 3, 4, 5, 6, 7];
    const li = leadSteps.indexOf(pos);
    if (li >= 0) {
      const deg = song.lead[li % song.lead.length];
      const oct = deg >= 5 ? 24 : 12;
      const n = chord[deg % chord.length] + oct;
      note(mtof(n), t + 0.01, (60 / song.bpm) * 0.5, song.tone, 0.045);
    }
  }

  function synthTick() {
    if (!S.playing || S.mode !== 'synth' || !S.ctx) return;
    const now = S.ctx.currentTime;
    const step = 60 / S.song.bpm / 2;
    while (S.nextTime < now + 0.35) {
      scheduleBeat(S.beat, S.nextTime);
      S.nextTime += step;
      S.beat++;
    }
  }

  function startSynth() {
    const ctx = ensureCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const song = SONGS[Math.floor(Math.random() * SONGS.length)];
    S.song = song;
    S.title = song.name + '（原创 BGM）';
    S.mode = 'synth';
    S.beat = 0;
    S.nextTime = ctx.currentTime + 0.12;
    S.master.gain.cancelScheduledValues(ctx.currentTime);
    S.master.gain.setValueAtTime(0.0001, ctx.currentTime);
    S.master.gain.exponentialRampToValueAtTime(0.16 * S.vol + 0.0001, ctx.currentTime + 1.2);
    clearInterval(S.timer);
    S.timer = setInterval(synthTick, 90);
    S.playing = true;
    emit();
  }

  function stopSynth() {
    clearInterval(S.timer); S.timer = null;
    if (S.master && S.ctx) {
      S.master.gain.cancelScheduledValues(S.ctx.currentTime);
      S.master.gain.setTargetAtTime(0.0001, S.ctx.currentTime, 0.15);
    }
  }

  /* ---------------- 音频文件 ---------------- */
  function pickTrack() {
    if (!S.tracks.length) return null;
    let i = Math.floor(Math.random() * S.tracks.length);
    if (S.tracks.length > 1 && i === S.idx) i = (i + 1) % S.tracks.length;
    S.idx = i;
    return S.tracks[i];
  }

  function playFile() {
    const t = pickTrack();
    if (!t) { startSynth(); return; }
    if (!S.audio) {
      S.audio = new Audio();
      S.audio.addEventListener('ended', () => { if (S.playing) playFile(); });
      S.audio.addEventListener('error', () => { if (S.mode === 'files') { S.mode = 'synth'; startSynth(); } });
    }
    S.audio.src = t.url;
    S.audio.volume = S.vol;
    S.audio.play().then(() => {
      S.mode = 'files'; S.playing = true; S.title = t.name;
      emit();
    }).catch(() => { S.mode = 'synth'; startSynth(); });
  }

  /* ---------------- 对外接口 ---------------- */
  function loadTracks() {
    if (location.protocol === 'file:') { S.ready = true; emit(); return; }
    fetch('/api/music').then(r => r.json()).then(d => {
      S.tracks = (d && d.tracks) || [];
      S.ready = true;
      emit();
    }).catch(() => { S.ready = true; emit(); });
  }

  function start() {
    if (!S.enabled || S.playing) return;
    S.started = true;
    if (S.tracks.length) playFile();
    else startSynth();
  }

  function pause() {
    S.playing = false;
    if (S.audio) S.audio.pause();
    stopSynth();
    emit();
  }

  function toggle() {
    if (S.playing) { pause(); S.enabled = false; LS.set('jgs.music', '0'); }
    else { S.enabled = true; LS.set('jgs.music', '1'); start(); }
    emit();
  }

  function next() {
    if (S.mode === 'files' && S.tracks.length) { playFile(); return; }
    stopSynth();
    startSynth();
  }

  function setVolume(v) {
    S.vol = Math.max(0, Math.min(1, v));
    LS.set('jgs.vol', String(S.vol));
    if (S.audio) S.audio.volume = S.vol;
    if (S.master && S.ctx) S.master.gain.setTargetAtTime(0.16 * S.vol + 0.0001, S.ctx.currentTime, 0.1);
    emit();
  }

  function state() {
    return {
      playing: S.playing, mode: S.mode, title: S.title, vol: S.vol,
      count: S.tracks.length, ready: S.ready, enabled: S.enabled
    };
  }

  loadTracks();

  root.JGSMusic = { start, pause, toggle, next, setVolume, state, onChange, ensureCtx };
})(typeof globalThis !== 'undefined' ? globalThis : this);
