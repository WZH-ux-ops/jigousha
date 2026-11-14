/* =========================================================
 *  鸡狗杀 · 客户端
 *  页面 / 大厅 / 选角 / 牌桌 / 交互 / 联机
 * ========================================================= */
(function () {
  'use strict';
  const D = window.JGSData, E = window.JGSEngine, AI = window.JGSAI;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  /* file:// 下 localStorage 可能不可用 */
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } }
  };

  /* ---------------- 角色语音 ---------------- */
  const Voice = (function () {
    const S = { enabled: LS.get('jgs.voice') !== '0', vol: 0.9, audio: null, timer: null, lastAt: 0, lastFile: {}, playing: false };
    let handler = null;
    function poolFor(charId, event) {
      const manifest = window.JGSVoice || {};
      const list = manifest[charId] || [];
      if (!list.length) return [];
      const direct = list.filter(e => e.events && e.events.indexOf(event) >= 0);
      if (direct.length) return direct;
      const mood = (window.JGSVoiceMood || {})[event] || 'cool';
      const m = list.filter(e => e.mood === mood);
      return m.length ? m : list;
    }
    function play(charId, event, opts) {
      if (!charId) return;
      const now = Date.now();
      const gap = opts && opts.gap != null ? opts.gap : 850;
      if (now - S.lastAt < gap) return;
      const p = poolFor(charId, event);
      if (!p.length) return;
      let e = p[Math.floor(Math.random() * p.length)];
      if (p.length > 1 && S.lastFile[charId] === e.file) e = p[(p.indexOf(e) + 1) % p.length];
      S.lastFile[charId] = e.file;
      S.lastAt = now;
      if (handler) { try { handler(charId, e); } catch (err) { } }
      if (!S.enabled) return;
      if (!S.audio) S.audio = new Audio();
      try {
        S.audio.pause();
        S.audio.src = 'voice/' + charId + '/' + e.file;
        S.audio.volume = S.vol;
        S.audio.currentTime = 0;
        const pr = S.audio.play();
        if (pr && pr.catch) pr.catch(() => { });
      } catch (err) { return; }
      S.playing = true;
      clearTimeout(S.timer);
      S.timer = setTimeout(() => {
        try { S.audio.pause(); } catch (e) { }
        S.playing = false;
      }, 7500);
    }
    function toggle() {
      S.enabled = !S.enabled;
      LS.set('jgs.voice', S.enabled ? '1' : '0');
      if (!S.enabled && S.audio) { try { S.audio.pause(); } catch (e) { } }
      return S.enabled;
    }
    function state() { return { enabled: S.enabled, playing: S.playing }; }
    function hold() {
      if (!S.audio || S.audio.paused || !isFinite(S.audio.duration)) return 0;
      const left = (S.audio.duration - S.audio.currentTime) * 1000;
      return Math.max(0, Math.min(left, 5200));
    }
    function setHandler(fn) { handler = fn; }
    return { play, toggle, state, hold, setHandler };
  })();

  let subTimer = null;
  function showSubtitle(charId, entry) {
    const el = $('#subtitle');
    if (!el || !entry) return;
    const c = D.getChar(charId);
    let name = c ? c.name : '';
    if (App.view && App.view.players && c) {
      const p = App.view.players.find(x => x.charId === charId);
      const short = c.name.split(' ').pop();
      if (p && p.name && p.name.indexOf(short) < 0) name += ' · ' + p.name;
    }
    el.style.setProperty('--sc', c ? c.color : 'var(--gold)');
    const cn = (window.JGSVoiceSub || {})[entry.id] || '';
    el.innerHTML = `<div class="sub-name">${esc(name)}</div><div class="sub-jp">「${esc(entry.text)}」</div>`
      + (cn ? `<div class="sub-cn">${esc(cn)}</div>` : '');
    el.classList.add('on');
    clearTimeout(subTimer);
    subTimer = setTimeout(() => el.classList.remove('on'), 4200);
  }
  function hideSubtitle() {
    const el = $('#subtitle');
    if (el) el.classList.remove('on');
    clearTimeout(subTimer);
  }

  function voiceOf(view, seat) {
    const p = view && view.players ? view.players[seat] : null;
    return p ? p.charId : null;
  }

  const App = {
    screen: 'title',
    host: null,
    view: null,
    me: 0,
    sel: null,          // {kind:'card'|'skill', id, targets:[]}
    discardSel: [],     // 多选弃牌
    lastFx: 0,
    lastLog: 0,
    modalKey: null,
    sound: LS.get('jgs.sound') !== '0',
    name: LS.get('jgs.name') || '',
    classic: { identity: null, charId: null, step: 1 },
    net: { ws: null, id: null, token: LS.get('jgs.token') || '', room: null, stage: 'entry', connected: false, joining: false },
    resultShown: false,
    fast: false,
    autoTimer: null
  };

  /* ---------------- 基础工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toast(msg, isErr) {
    const w = $('#toast-wrap');
    const el = document.createElement('div');
    el.className = 'toast' + (isErr ? ' err' : '');
    el.textContent = msg;
    w.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.3s'; }, 2200);
    setTimeout(() => el.remove(), 2600);
  }
  function showScreen(id) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + id));
    App.screen = id;
    if (id !== 'table') hideSubtitle();
  }
  function charOf(p) { return D.getChar(p.charId); }
  function idnOf(p) { return D.IDENTITIES[p.identity]; }
  function typeLabel(def) {
    if (def.type === 'basic') return '基本牌';
    if (def.type === 'trick') return '锦囊牌';
    if (def.type === 'delay') return '延时锦囊';
    if (def.type === 'equip') return { weapon: '武器', armor: '防具', offhorse: '进攻坐骑', defhorse: '防御坐骑' }[def.sub];
    return '';
  }

  /* ---------------- 音效 ---------------- */
  let actx = null;
  function beep(kind) {
    if (!App.sound) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime;
      const o = actx.createOscillator(), g = actx.createGain();
      o.connect(g); g.connect(actx.destination);
      const conf = {
        click: [520, 'triangle', .05, .04],
        card: [340, 'sine', .08, .05],
        dmg: [140, 'sawtooth', .16, .07],
        heal: [660, 'sine', .18, .05],
        turn: [420, 'triangle', .12, .04],
        win: [780, 'sine', .5, .06]
      }[kind] || [440, 'sine', .05, .03];
      o.type = conf[1];
      o.frequency.setValueAtTime(conf[0], t);
      if (kind === 'heal' || kind === 'win') o.frequency.exponentialRampToValueAtTime(conf[0] * 1.7, t + conf[2]);
      if (kind === 'dmg') o.frequency.exponentialRampToValueAtTime(conf[0] * .6, t + conf[2]);
      g.gain.setValueAtTime(conf[3], t);
      g.gain.exponentialRampToValueAtTime(0.001, t + conf[2]);
      o.start(t); o.stop(t + conf[2] + .02);
    } catch (e) { /* ignore */ }
  }

  /* ---------------- 卡牌 / 角色渲染 ---------------- */
  function portrait(c, cls) {
    const src = D.CHAR_IMG && D.CHAR_IMG[c.id];
    if (!src) return `<div class="ico">${c.icon}</div>`;
    return `<img class="portrait ${cls || ''}" src="${src}" alt="${esc(c.name)}" draggable="false">`;
  }

  function cardHTML(card, cls) {
    const def = D.CARDS[card.key];
    const suitColor = D.SUIT_COLOR[card.suit] || '#fff';
    return `<div class="card ${cls || ''}" data-uid="${card.uid}" style="--cc:${def.color}" title="${esc(def.name)}：${esc(def.desc)}">
      <div class="c-suit" style="color:${suitColor}"><span>${card.suit || ''}</span><b>${card.rankText || D.RANK_TEXT[card.rank] || ''}</b></div>
      <div class="c-art">${def.icon}</div>
      <div class="c-name">${def.name}</div>
      <div class="c-desc">${esc(D.CARD_SHORT[card.key] || '')}</div>
      <div class="c-type">${typeLabel(def)}</div>
    </div>`;
  }
  function cardByKeyHTML(key, cls) {
    const def = D.CARDS[key];
    return `<div class="card ${cls || ''}" style="--cc:${def.color}" title="${esc(def.name)}：${esc(def.desc)}">
      <div class="c-art">${def.icon}</div>
      <div class="c-name">${def.name}</div>
      <div class="c-desc">${esc(D.CARD_SHORT[key] || '')}</div>
      <div class="c-type">${typeLabel(def)}</div>
    </div>`;
  }
  function patHTML(pattern) { return `<div class="pat pat-${pattern}"></div>`; }

  /* ---------------- 标题页 ---------------- */
  function bindTitle() {
    $$('#screen-title [data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        beep('click');
        const act = btn.dataset.act;
        if (act === 'classic') openClassic();
        if (act === 'online') openOnline();
        if (act === 'story' && window.JGSCampaign) window.JGSCampaign.open();
        if (act === 'account' && window.JGSAuth) window.JGSAuth.open();
        if (act === 'friends' && window.JGSSocial) window.JGSSocial.open();
        if (act === 'gallery') showGallery();
        if (act === 'rules') showRules();
      });
    });
  }

  /* ---------------- 图鉴 / 规则 ---------------- */
  function openModal(html, onMount, opts) {
    const m = $('#modal');
    m.className = 'modal' + (opts && opts.wide ? ' wide' : '');
    m.innerHTML = html;
    $('#modal-backdrop').classList.add('on');
    if (onMount) onMount(m);
  }
  function closeModal() {
    $('#modal-backdrop').classList.remove('on');
    $('#modal').innerHTML = '';
    App.modalKey = null;
  }
  $('#modal-backdrop').addEventListener('click', e => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  function showGallery() {
    const chars = D.CHARACTERS.map(c => `
      <div class="gal-card" style="--cc:${c.color}">
        <div class="gal-art">${patHTML(c.pattern)}${portrait(c)}</div>
        <div class="gal-info">
          <div class="gal-name">${c.name}</div>
          <div class="gal-sub">${D.BANDS[c.band].name} · ${c.role} · 体力 ${c.hp} · ${c.title}</div>
          <div class="gal-skill">${c.skills.map(s => `<b>${s.name}</b>（${s.type}）${s.desc}`).join('<br>')}</div>
        </div>
      </div>`).join('');
    const ids = Object.values(D.IDENTITIES).map(i => `
      <div class="gal-card" style="--cc:${i.color}">
        <div class="gal-art" style="--cc:${i.color}"><div class="ico" style="font-family:var(--serif);font-size:34px;color:#0d0a14;font-weight:700">${i.badge}</div></div>
        <div class="gal-info">
          <div class="gal-name">${i.name}</div>
          <div class="gal-sub">${i.en} · ${i.count} 人 · ${i.title}</div>
          <div class="gal-skill">${i.desc}<br>${i.skill ? `<b>${i.skill.name}</b>（${i.skill.type}）${i.skill.desc}` : ''}<br><span style="color:#8ff0cf">胜利条件：</span>${i.goal}</div>
        </div>
      </div>`).join('');
    openModal(`<h3>角色图鉴</h3><div class="m-sub">11 位乐队成员 / 4 种身份</div>
      <div class="gallery-grid" style="grid-template-columns:1fr">${chars}</div>
      <div style="height:16px"></div>
      <h3 style="font-size:16px;letter-spacing:3px;margin-top:10px">身份</h3>
      <div class="gallery-grid" style="grid-template-columns:1fr">${ids}</div>
      <div class="modal-actions"><button class="btn" data-x="close">关闭</button></div>`,
      m => m.querySelector('[data-x=close]').addEventListener('click', closeModal), { wide: true });
  }

  function showRules() {
    const rules = D.RULES_TEXT.map(([k, v]) => `<div class="rule-item"><div class="rk">${k}</div><div class="rv">${v}</div></div>`).join('');
    const cards = Object.keys(D.CARDS).map(k => {
      const def = D.CARDS[k];
      return `<div class="legend-item" style="--cc:${def.color}">
        <div class="card mini" style="--cc:${def.color}"><div class="c-art">${def.icon}</div><div class="c-name">${def.name}</div></div>
        <div><div class="lg-name">${def.name}<span style="color:#6c6488;font-size:9px"> · ${typeLabel(def)}</span></div><div class="lg-desc">${def.desc}</div></div>
      </div>`;
    }).join('');
    openModal(`<h3>规则说明</h3><div class="m-sub">5 人局 · 演出开始</div>
      <div class="rule-list" style="max-width:none">${rules}</div>
      <h3 style="font-size:16px;letter-spacing:3px;margin:22px 0 4px">牌库</h3>
      <div class="card-legend">${cards}</div>
      <div class="modal-actions"><button class="btn" data-x="close">明白了</button></div>`,
      m => m.querySelector('[data-x=close]').addEventListener('click', closeModal), { wide: true });
  }

  /* ---------------- 开局：身份抽取动画 ---------------- */
  function showIdentityIntro(view, onDone) {
    const intro = $('#intro');
    const cardsBox = $('#intro-cards');
    const playersBox = $('#intro-players');
    const resultEl = $('#intro-result');
    const actions = $('.intro-actions');
    if (!intro) { onDone(); return; }

    const mine = view.players[view.seat];
    const myIdn = D.IDENTITIES[mine.identity];

    // 展示用的身份分配：自己的真实身份 + 已公开的制作人；其余随机填充（客户端本来也不知道）
    const pool = D.FIVE_PLAYER_SETUP.slice();
    const assign = {};
    assign[view.seat] = mine.identity;
    pool.splice(pool.indexOf(mine.identity), 1);
    view.players.forEach(p => {
      if (p.seat !== view.seat && p.identity) {
        assign[p.seat] = p.identity;
        const k = pool.indexOf(p.identity);
        if (k >= 0) pool.splice(k, 1);
      }
    });
    shuffle(pool);
    view.players.forEach(p => {
      if (!assign[p.seat]) assign[p.seat] = pool.pop();
    });

    const producer = view.players.find(p => p.identity === 'producer');
    const producerName = producer ? (producer.seat === view.seat ? '你' : producer.name) : '—';

    playersBox.innerHTML = view.players.map(p => {
      const c = charOf(p);
      const isMe = p.seat === view.seat;
      return `<div class="iplayer ${isMe ? 'me' : ''}">
        <div class="iav" style="--cc:${c.color}">${patHTML(c.pattern)}${portrait(c, 'face')}</div>
        <div class="iname">${isMe ? '你 · ' + c.name : esc(p.name)}</div>
        <div class="islot" data-slot="${p.seat}"></div>
      </div>`;
    }).join('');

    cardsBox.innerHTML = view.players.map((p, i) => {
      const idn = D.IDENTITIES[assign[p.seat]];
      return `<div class="icard-wrap" data-seat="${p.seat}">
        <div class="icard">
          <div class="face back"></div>
          <div class="face front" style="--ic:${idn.color}">
            <div class="badge">${idn.badge}</div>
            <div class="iname2">${idn.name}</div>
            <div class="ien">${idn.en}</div>
          </div>
        </div>
      </div>`;
    }).join('');

    resultEl.className = 'intro-result';
    resultEl.innerHTML = '';
    actions.classList.remove('on');
    intro.classList.add('on');
    beep('turn');

    const wraps = $$('#intro-cards .icard-wrap');
    const myWrap = wraps[view.seat];
    const others = view.players.filter(p => p.seat !== view.seat);

    const timers = [];
    let finished = false;
    const T = (ms, fn) => timers.push(setTimeout(fn, ms));
    const finish = () => {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      intro.classList.remove('on');
      document.removeEventListener('keydown', onKey);
      Voice.play(voiceOf(view, view.seat), 'turn', { gap: 0 });
      onDone();
    };
    const onKey = e => { if (e.key === 'Escape' || e.key === 'Enter') finish(); };
    document.addEventListener('keydown', onKey);
    $('#intro-skip').onclick = finish;

    // 初始叠成一摞
    wraps.forEach((w, i) => {
      w.style.transform = `translate(${i * 3}px, ${-i * 2}px) rotate(${i * 1.6}deg)`;
    });

    // 洗牌抖动
    wraps.forEach((w, i) => {
      const rnd = [];
      for (let k = 0; k < 8; k++) {
        rnd.push({ transform: `translate(${(Math.random() - .5) * 34}px, ${(Math.random() - .5) * 20}px) rotate(${(Math.random() - .5) * 12}deg)` });
      }
      w.animate(rnd, { duration: 720, iterations: 1, delay: i * 26, easing: 'ease-in-out' });
    });

    // 扇形展开
    T(960, () => {
      wraps.forEach((w, i) => {
        const k = i - 2;
        w.style.transform = `translate(${k * 62}px, ${Math.abs(k) * 10}px) rotate(${k * 4}deg)`;
      });
      beep('card');
    });

    // 其余四张飞向对应座位
    others.forEach((p, idx) => {
      const wrap = wraps[p.seat];
      const card = wrap.querySelector('.icard');
      const slot = playersBox.querySelector(`.islot[data-slot="${p.seat}"]`);
      T(1620, () => {
        if (!slot) return;
        const a = card.getBoundingClientRect();
        const b = slot.getBoundingClientRect();
        const dx = b.left + b.width / 2 - (a.left + a.width / 2);
        const dy = b.top + b.height / 2 - (a.top + a.height / 2);
        card.animate([
          { transform: 'translate(0,0) scale(1)' },
          { transform: `translate(${dx}px, ${dy}px) scale(.255)` }
        ], { duration: 600, delay: idx * 110, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' });
        setTimeout(() => {
          wrap.style.visibility = 'hidden';
          const idn = D.IDENTITIES[assign[p.seat]];
          const known = !!p.identity;
          slot.classList.add('filled');
          slot.innerHTML = known && idn
            ? `<div class="mini" style="--idc:${idn.color}" title="${esc(idn.name)}">${idn.badge}</div>`
            : `<div class="mini back">?</div>`;
          beep('click');
        }, idx * 110 + 600);
      });
    });

    // 我的卡：回到中央、高亮、翻面
    T(1700, () => {
      myWrap.style.transform = 'translate(0px, 0px)';
      myWrap.classList.add('mine-glow');
      myWrap.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.25)' }, { filter: 'brightness(1)' }],
        { duration: 900, easing: 'ease-in-out', fill: 'both' });
    });
    T(2320, () => {
      const card = myWrap.querySelector('.icard');
      card.classList.add('flip');
      beep('win');
      resultEl.innerHTML = `<div class="iresult-tag">你 的 身 份</div>
        <div class="iresult-main" style="--ic:${myIdn.color}">
          <div class="iresult-badge">${myIdn.badge}</div>
          <div class="iresult-name">${myIdn.name}</div>
        </div>
        <div class="iresult-goal">${esc(myIdn.goal)}</div>
        <div class="iresult-note">${producer && producer.seat === view.seat
          ? '你的身份公开 · 其余四人为暗牌'
          : `制作人：${esc(producerName)}（身份公开） · 其余为暗牌`}</div>`;
      T(360, () => resultEl.classList.add('on'));
      actions.classList.add('on');
      T(7000, finish);
    });

    $('#intro-go').onclick = finish;
  }

  /* ---------------- 发牌动画 ---------------- */
  function playDealAnimation(onDone) {
    const overlay = $('#deal-overlay');
    const layer = $('#deal-layer');
    const banner = $('#deal-banner');
    const deckEl = $('#deck-stack');
    if (!overlay || !layer || !deckEl || !App.view) { onDone(); return; }
    const rect = el => el.getBoundingClientRect();
    const deck = rect(deckEl);
    const view = App.view;
    const targets = [];
    view.players.forEach(p => {
      if (p.seat === view.seat) {
        const h = $('#hand').getBoundingClientRect();
        targets.push({ x: h.left + h.width / 2, y: h.top + 14 });
      } else {
        const el = document.querySelector(`.seat[data-seat="${p.seat}"]`);
        if (el) { const r = rect(el); targets.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); }
      }
    });
    if (!targets.length) { onDone(); return; }

    overlay.classList.add('on');
    banner.classList.remove('out');
    deckEl.classList.add('dealing');
    layer.innerHTML = '';
    beep('card');
    const cx = deck.left + deck.width / 2, cy = deck.top + deck.height / 2;
    let total = 0;
    for (let round = 0; round < 4; round++) {
      targets.forEach((t, i) => {
        const d = (round * targets.length + i) * 55;
        total = Math.max(total, d);
        const e = document.createElement('div');
        e.className = 'deal-card';
        e.style.left = (cx - 22) + 'px';
        e.style.top = (cy - 31) + 'px';
        layer.appendChild(e);
        const dx = t.x - cx, dy = t.y - cy;
        e.animate([
          { transform: 'translate(0,0) scale(.85) rotate(0deg)', opacity: 1, offset: 0 },
          { transform: `translate(${dx * .55}px, ${dy * .55 - 46}px) scale(.95) rotate(10deg)`, opacity: 1, offset: .55 },
          { transform: `translate(${dx}px, ${dy}px) scale(.62) rotate(0deg)`, opacity: .95, offset: 1 }
        ], { duration: 430, delay: d, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'both' });
      });
    }
    setTimeout(() => { banner.classList.add('out'); deckEl.classList.remove('dealing'); }, total + 480);
    setTimeout(() => {
      overlay.classList.remove('on');
      layer.innerHTML = '';
      onDone();
    }, total + 820);
  }

  /* ---------------- 经典模式 ---------------- */
  function openClassic() {
    App.classic = { charId: null };
    renderClassic();
    showScreen('classic');
  }

  function renderClassic() {
    $('#classic-step').textContent = '选择角色 · 身份随机';
    const body = $('#classic-body'), foot = $('#classic-foot');
    const sel = App.classic.charId ? D.getChar(App.classic.charId) : null;
    body.innerHTML = `
      <div class="compose-strip" style="margin-top:0;margin-bottom:16px">
        <span class="cs-label">本局身份</span>
        <span class="cs-items">
          <b style="color:${D.IDENTITIES.producer.color}">制作人 ×1</b>
          <b style="color:${D.IDENTITIES.costar.color}">共演者 ×1</b>
          <b style="color:${D.IDENTITIES.wrecker.color}">拆团者 ×2</b>
          <b style="color:${D.IDENTITIES.soloist.color}">独演者 ×1</b>
        </span>
        <span class="cs-hint">身份在开局时随机分配给你和 4 名 AI。制作人身份公开，其余身份暗牌——你只有在开局后才知道自己站在哪一边。</span>
      </div>
      <div class="draft-layout">
        <div class="char-grid">${D.CHARACTERS.map(c => `
          <div class="char-tile ${App.classic.charId === c.id ? 'sel' : ''}" data-id="${c.id}" style="--cc:${c.color}" title="${esc(c.name)}：${esc(c.skills.map(s => s.name + '——' + s.desc).join(' / '))}">
            <div class="char-art">${patHTML(c.pattern)}${portrait(c)}</div>
            <div class="char-meta">
              <div class="char-name">${c.name}</div>
              <div class="char-sub"><span>${D.BANDS[c.band].short} · ${c.role}</span><span class="char-hp">${'♥'.repeat(c.hp)}</span></div>
            </div>
          </div>`).join('')}</div>
        <aside class="detail-panel" id="detail-panel">${sel ? detailHTML(sel) : `<div class="hint">← 选择一名角色<br><br>每名角色拥有 1~2 个技能。<br>先看技能，再决定你想怎么演。</div>`}</aside>
      </div>`;
    body.querySelectorAll('.char-tile').forEach(el => el.addEventListener('click', () => {
      App.classic.charId = el.dataset.id; beep('card'); renderClassic();
    }));
    foot.innerHTML = `<button class="btn btn-slim" data-x="back">返回</button>
      <button class="btn btn-slim btn-primary" data-x="start" ${App.classic.charId ? '' : 'disabled'}>开始演出</button>`;
    foot.querySelector('[data-x=back]').addEventListener('click', () => showScreen('title'));
    foot.querySelector('[data-x=start]').addEventListener('click', startClassic);
  }

  function detailHTML(c) {
    return `<div class="detail-art" style="--cc:${c.color}">${patHTML(c.pattern)}${portrait(c)}<div class="vert">${c.name}</div></div>
      <div class="detail-name">${c.name}</div>
      <div class="detail-kana">${c.kana} · ${D.BANDS[c.band].name} · ${c.role} · 体力 ${c.hp}</div>
      <div class="detail-quote">${c.quote}</div>
      <div class="detail-bio">${c.bio}</div>
      ${c.skills.map(s => `<div class="skill-block"><h4>${s.name}<em>${s.type}</em></h4><p>${s.desc}</p></div>`).join('')}`;
  }

  function startClassic() {
    const myChar = App.classic.charId;
    if (!myChar) return;
    const ids = E.assignIdentities(['me', 'ai0', 'ai1', 'ai2', 'ai3'], {}, Math.random);
    const used = [myChar];
    const players = [{ id: 'me', name: (App.name || '你').slice(0, 8), charId: myChar, identity: ids['me'], isAI: false }];
    for (let i = 0; i < 4; i++) {
      const cid = AI.pickCharacter(D.CHARACTERS, used, ids['ai' + i], Math.random) || D.CHARACTERS.find(c => !used.includes(c.id)).id;
      used.push(cid);
      const nm = D.getChar(cid).name.split(' ').pop();
      players.push({ id: 'ai' + i, name: 'AI·' + nm, charId: cid, identity: ids['ai' + i], isAI: true });
    }
    App.me = 0;
    App.host = new LocalHost();
    App.resultShown = false;
    App.introDone = false;
    App.queuedView = null;
    App.host.prepare({ players }, view => renderTable(view), g => onGameEnd(g));
    const v0 = E.view(App.host.game.g, 0);
    App.dealing = true;
    showIdentityIntro(v0, () => {
      if (!App.host) return;
      showScreen('table');
      resetTableDOM();
      App.dealing = true;
      App.handSig = null;
      renderTable(v0);
      playDealAnimation(() => {
        App.dealing = false;
        App.handSig = null;
        App.handReveal = true;
        renderTable(App.view || v0);
        App.host.begin();
        setTimeout(() => { App.handReveal = false; }, 1000);
      });
    });
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* ---------------- 本地对局宿主 ---------------- */
  function LocalHost() { this.game = null; this.timer = null; }
  LocalHost.prototype.prepare = function (cfg, onView, onEnd) {
    this.onView = onView; this.onEnd = onEnd;
    this.me = cfg.players.findIndex(p => !p.isAI);
    this.game = new E.Game(cfg);
    this.game.start();
  };
  LocalHost.prototype.begin = function () { this.schedule(80); };
  LocalHost.prototype.init = function (cfg, onView, onEnd) {
    this.prepare(cfg, onView, onEnd);
    this.begin();
  };
  LocalHost.prototype.schedule = function (ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.step(), ms);
  };
  LocalHost.prototype.step = function () {
    const g = this.game;
    if (!g) return;
    this.onView(E.view(g.g, this.me));
    if (g.finished) { this.onEnd && this.onEnd(g.g); return; }
    const ask = g.pending;
    if (!ask) return;
    const p = g.g.players[ask.seat];
    if (p && p.isAI) {
      let resp;
      try { resp = AI.respond(g, ask); } catch (err) { console.error(err); resp = { type: 'pass' }; }
      g.act(resp);
      this.schedule(App.fast ? 25 : (ask.kind === 'play' ? 520 : 320));
    }
  };
  LocalHost.prototype.act = function (resp) {
    if (!this.game) return;
    this.game.act(resp);
    this.schedule(App.fast ? 25 : 140);
  };
  LocalHost.prototype.quit = function () { clearTimeout(this.timer); this.game = null; };

  /* ---------------- 联机 ---------------- */
  function wsURL() {
    if (location.protocol === 'file:') return null;
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  }

  function openOnline() {
    showScreen('online');
    if (!wsURL()) {
      $('#online-body').innerHTML = `<div class="center-narrow"><div class="panel">
        <h4>无法连接</h4>
        <p class="hint">联机模式需要通过服务器启动：<br><br>
        在游戏目录执行 <b>node server.js</b>（或双击 <b>开始联机.bat</b>），<br>
        然后浏览器访问 <b>http://localhost:8787</b>。<br><br>
        经典模式不需要服务器，直接打开 index.html 也能玩。</p>
        <div class="modal-actions"><button class="btn" data-x="home">返回标题</button></div>
      </div></div>`;
      $('#online-body').querySelector('[data-x=home]').addEventListener('click', () => showScreen('title'));
      return;
    }
    if (!App.net.ws || App.net.ws.readyState > 1) connectWS();
    else renderOnline();
  }

  function connectWS() {
    const url = wsURL();
    if (!url) return;
    App.net.joining = true;
    renderOnline();
    let ws;
    try { ws = new WebSocket(url); } catch (e) { toast('无法连接服务器', true); return; }
    App.net.ws = ws;
    ws.onopen = () => {
      App.net.connected = true;
      App.net.joining = false;
      sendNet({ t: 'hello', name: App.name || '玩家', token: App.net.token });
      if (!App.net.room) {
        const saved = LS.get('jgs.room');
        if (saved && App.net.token) { App.net.room = saved; App.net.rejoining = true; }
      }
      if (App.net.room && App.net.token) {
        sendNet({ t: 'rejoin', code: App.net.room, token: App.net.token });
      } else renderOnline();
    };
    ws.onmessage = ev => {
      let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
      onNet(msg);
    };
    ws.onclose = () => {
      App.net.connected = false; App.net.ws = null;
      if (App.net.stage === 'game') toast('与服务器断开连接', true);
      renderOnline();
    };
    ws.onerror = () => { /* onclose handles */ };
  }

  function sendNet(obj) {
    if (App.net.ws && App.net.ws.readyState === 1) App.net.ws.send(JSON.stringify(obj));
  }

  function onNet(msg) {
    switch (msg.t) {
      case 'welcome':
        App.net.id = msg.id;
        App.net.token = msg.token;
        LS.set('jgs.token', msg.token);
        if (!App.net.room) renderOnline();
        break;
      case 'room':
        App.net.rejoining = false;
        App.net.room = msg.room;
        LS.set('jgs.room', msg.room.code);
        App.net.stage = msg.room.stage;
        if (msg.room.stage === 'lobby') { renderOnline(); }
        else if (msg.room.stage === 'identity' || msg.room.stage === 'draft') { showScreen('online'); renderOnline(); }
        break;
      case 'stage':
        App.net.stage = msg.stage;
        if (msg.stage === 'draft') { App.introDone = false; App.introPlaying = false; App.dealing = false; App.handReveal = false; App.queuedView = null; }
        if (msg.stage === 'game') { showScreen('table'); resetTableDOM(); }
        else if (msg.stage === 'over') { /* 结算由 view 触发 */ }
        if (msg.room) App.net.room = msg.room;
        renderOnline();
        break;
      case 'view':
        App.net.stage = 'game';
        if (App.screen !== 'table') { showScreen('table'); resetTableDOM(); }
        if (!App.introDone && !App.introPlaying && (msg.view.round || 1) <= 1) {
          App.introPlaying = true;
          App.dealing = true;
          App.handSig = null;
          App.view = msg.view;
          renderTable(msg.view);
          showIdentityIntro(msg.view, () => {
            App.introPlaying = false;
            App.introDone = true;
            App.handSig = null;
            renderTable(msg.view);
            playDealAnimation(() => {
              App.dealing = false;
              App.handSig = null;
              App.handReveal = true;
              renderTable(App.queuedView || App.view || msg.view);
              App.queuedView = null;
              setTimeout(() => { App.handReveal = false; }, 1000);
            });
          });
        } else if (App.introPlaying || App.dealing) {
          // 开场动画期间只排入最新视图，不重绘牌桌
          App.queuedView = msg.view;
        } else {
          renderTable(msg.view);
        }
        break;
      case 'error':
        toast(msg.msg, true);
        if (App.net.rejoining) {
          App.net.rejoining = false; App.net.room = null;
          LS.del('jgs.room');
          renderOnline();
        }
        break;
      case 'chat': appendChat(msg); break;
      case 'pong': break;
    }
  }

  function renderOnline() {
    const body = $('#online-body');
    const stepEl = $('#online-step');
    const stage = App.net.room ? App.net.room.stage : 'entry';
    if (!App.net.connected) {
      stepEl.textContent = '';
      body.innerHTML = `<div class="center-narrow"><div class="panel" style="text-align:center">
        <h4>正在连接服务器${App.net.joining ? '…' : ''}</h4>
        <p class="hint">如果长时间没有反应，请确认已运行 node server.js</p>
        <div class="modal-actions" style="justify-content:center"><button class="btn" data-x="retry">重试</button></div>
      </div></div>`;
      body.querySelector('[data-x=retry]').addEventListener('click', () => { App.net.room = null; connectWS(); });
      return;
    }
    if (!App.net.room) {
      stepEl.textContent = '创建或加入房间';
      body.innerHTML = `<div class="center-narrow">
        <div class="panel">
          <h4>你的名字</h4>
          <div class="field"><input id="in-name" maxlength="8" placeholder="舞台上的名字" value="${esc(App.name)}"></div>
          <div class="tabs">
            <button class="tab on" data-tab="join">加入房间</button>
            <button class="tab" data-tab="create">创建房间</button>
          </div>
          <div id="join-pane">
            <div class="field"><label>房间码</label><input id="in-code" maxlength="4" placeholder="4 位字母/数字" style="text-transform:uppercase;letter-spacing:6px;font-family:monospace;font-size:18px"></div>
            <button class="btn btn-primary" style="width:100%;padding:12px" data-x="join">加入</button>
          </div>
          <div id="create-pane" style="display:none">
            <p class="hint" style="margin-bottom:10px">创建后会得到 4 位房间码，发给朋友即可加入。空位可以用 AI 补足。</p>
            <button class="btn btn-primary" style="width:100%;padding:12px" data-x="create">创建房间</button>
          </div>
          <p class="hint" style="margin-top:14px">断线后可用同一浏览器重新加入（自动重连）。</p>
        </div>
      </div>`;
      const nameInput = body.querySelector('#in-name');
      const readName = () => { App.name = nameInput.value.trim().slice(0, 8) || '玩家'; LS.set('jgs.name', App.name); };
      body.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
        body.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
        body.querySelector('#join-pane').style.display = t.dataset.tab === 'join' ? '' : 'none';
        body.querySelector('#create-pane').style.display = t.dataset.tab === 'create' ? '' : 'none';
      }));
      body.querySelector('[data-x=join]').addEventListener('click', () => {
        readName();
        const code = body.querySelector('#in-code').value.trim().toUpperCase();
        if (code.length !== 4) { toast('请输入 4 位房间码', true); return; }
        App.net.room = code;
        sendNet({ t: 'join', code, name: App.name });
      });
      body.querySelector('[data-x=create]').addEventListener('click', () => {
        readName();
        sendNet({ t: 'create', name: App.name });
      });
      nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') body.querySelector('[data-x=' + (body.querySelector('#join-pane').style.display === 'none' ? 'create' : 'join') + ']').click(); });
      return;
    }

    const room = App.net.room;
    if (room.stage === 'lobby') { stepEl.textContent = '等待开局'; renderLobby(body, room); return; }
    if (room.stage === 'identity') { stepEl.textContent = '分配身份'; body.innerHTML = '<div class="center-narrow"><div class="panel" style="text-align:center"><h4>正在随机分配身份…</h4></div></div>'; return; }
    if (room.stage === 'draft') { stepEl.textContent = '选择角色'; renderDraftStage(body, room); return; }
    if (room.stage === 'over') { stepEl.textContent = '对局结束'; body.innerHTML = ''; return; }
  }

  function renderLobby(body, room) {
    const me = room.players.find(p => p.id === room.you);
    const isHost = room.hostId === room.you;
    const seats = [];
    for (let i = 0; i < 5; i++) {
      const p = room.players.find(x => x.seat === i);
      seats.push(p ? `
        <div class="lobby-seat">
          <div class="ls-num">${i + 1}</div>
          <div class="ls-name">${esc(p.name)} ${p.isAI ? '<span class="ls-tag ai">AI</span>' : ''} ${p.isHost ? '<span class="ls-tag">房主</span>' : ''}</div>
          ${p.isAI ? '' : `<span class="ls-tag ${p.ready ? 'ready' : ''}">${p.ready ? '已准备' : '未准备'}</span>`}
        </div>` : `
        <div class="lobby-seat empty">
          <div class="ls-num">${i + 1}</div>
          <div class="ls-name" style="color:#6c6488">空座</div>
          ${isHost ? `<button class="btn btn-slim" data-ai="${i}" style="padding:5px 12px;font-size:11px">AI 补位</button>` : ''}
        </div>`);
    }
    const need = 5 - room.players.length;
    body.innerHTML = `<div class="lobby-grid">
      <div>
        <div class="seat-list">${seats.join('')}</div>
        <div class="panel" style="margin-top:14px">
          <h4>身份分配</h4>
          <p class="hint" style="line-height:2">开局时<b>随机分配</b> 5 张身份牌：<br>
            <span style="color:#ffd166">制作人 ×1</span> · <span style="color:#7ee0c0">共演者 ×1</span> ·
            <span style="color:#ff5d73">拆团者 ×2</span> · <span style="color:#b28dff">独演者 ×1</span><br>
            制作人身份公开，其余全部隐藏。开局后才知道自己站在哪一边。</p>
        </div>
      </div>
      <div class="lobby-side">
        <div class="panel">
          <div class="room-code">${room.code}</div>
          <div class="room-code-sub">把房间码发给朋友</div>
          <button class="btn btn-slim" style="width:100%" data-x="copy">复制房间码</button>
        </div>
        <div class="panel">
          <h4>准备</h4>
          <button class="btn ${me && me.ready ? 'btn-slim' : 'btn-primary'}" style="width:100%;padding:12px" data-x="ready">${me && me.ready ? '取消准备' : '准备'}</button>
          ${isHost ? `<button class="btn btn-primary" style="width:100%;padding:12px;margin-top:8px" data-x="start" ${room.players.length === 5 && room.players.filter(p => !p.isAI).every(p => p.ready) ? '' : 'disabled'}>开始演出</button>
          <p class="hint" style="margin-top:8px">${room.players.length < 5 ? `还缺 ${need} 个座位（可 AI 补位）` : (room.players.filter(p => !p.isAI).every(p => p.ready) ? '全员就绪' : '等待全员准备')}</p>` : '<p class="hint" style="margin-top:8px">等待房主开始</p>'}
        </div>
        <div class="panel">
          <h4>聊天</h4>
          <div class="chat-box" id="chat-box"></div>
          <div class="chat-row"><input id="chat-in" maxlength="60" placeholder="说点什么…"><button class="btn btn-slim" data-x="chat">发送</button></div>
        </div>
      </div>
    </div>`;
    body.querySelectorAll('[data-ai]').forEach(b => b.addEventListener('click', () => {
      sendNet({ t: 'ai', seat: parseInt(b.dataset.ai, 10), on: true });
    }));
    body.querySelector('[data-x=copy]').addEventListener('click', () => {
      navigator.clipboard && navigator.clipboard.writeText(room.code);
      toast('房间码已复制：' + room.code);
    });
    body.querySelector('[data-x=ready]').addEventListener('click', () => sendNet({ t: 'ready', v: !(me && me.ready) }));
    const st = body.querySelector('[data-x=start]');
    if (st) st.addEventListener('click', () => sendNet({ t: 'start' }));
    const chatIn = body.querySelector('#chat-in');
    const sendChat = () => {
      const v = chatIn.value.trim(); if (!v) return;
      sendNet({ t: 'chat', text: v }); chatIn.value = '';
    };
    body.querySelector('[data-x=chat]').addEventListener('click', sendChat);
    chatIn.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
    const cb = body.querySelector('#chat-box');
    (room.chat || []).forEach(c => { cb.insertAdjacentHTML('beforeend', `<div><span class="cm-from">${esc(c.from)}</span>：${esc(c.text)}</div>`); });
    cb.scrollTop = cb.scrollHeight;
  }

  function appendChat(msg) {
    const cb = document.querySelector('#chat-box');
    if (!cb) return;
    cb.insertAdjacentHTML('beforeend', `<div><span class="cm-from">${esc(msg.from)}</span>：${esc(msg.text)}</div>`);
    cb.scrollTop = cb.scrollHeight;
  }

  function renderDraftStage(body, room) {
    const myPick = room.players.find(p => p.id === room.you);
    const taken = room.players.filter(p => p.id !== room.you).map(p => ({ name: p.name, pick: p.pick, isAI: p.isAI }));
    body.innerHTML = `<div class="center-narrow" style="max-width:1180px">
      <div class="panel" style="margin-bottom:14px">
        <h4>选择你的角色 · 同时选择</h4>
        <p class="hint">5 名玩家同时选择，重复选择时按座位顺序裁定，后选的人需要重选。选角时可以看到别人的选择。</p>
      </div>
      <div class="char-grid">
        ${D.CHARACTERS.map(c => {
      const taker = taken.find(t => t.pick === c.id);
      const mine = myPick && myPick.pick === c.id;
      return `<div class="char-tile ${mine ? 'sel' : ''} ${taker && !mine ? 'taken' : ''}" data-id="${c.id}" style="--cc:${c.color}" title="${esc(c.name)}：${esc(c.skills.map(s => s.name + '——' + s.desc).join(' / '))}">
            <div class="char-art">${patHTML(c.pattern)}<div class="vert">${c.name}</div><div class="ico">${c.icon}</div></div>
            <div class="char-meta">
              <div class="char-name">${c.name}</div>
              <div class="char-sub"><span>${taker && !mine ? esc(taker.name) + ' 已选' : D.BANDS[c.band].short + ' · ' + c.role}</span><span class="char-hp">${'♥'.repeat(c.hp)}</span></div>
            </div>
          </div>`;
    }).join('')}
      </div>
      <div class="modal-actions" style="justify-content:center;margin-top:18px">
        ${myPick && myPick.pick ? '<span class="hint">已选择，等待其他人…</span>' : '<span class="hint">点击角色确定</span>'}
      </div>
    </div>`;
    body.querySelectorAll('.char-tile').forEach(el => el.addEventListener('click', () => {
      if (myPick && myPick.pick === el.dataset.id) return;
      beep('card');
      sendNet({ t: 'pickChar', charId: el.dataset.id });
    }));
  }

  /* ---------------- 牌桌 ---------------- */
  const POS = {
    1: { x: '15%', y: '66%' },
    2: { x: '30%', y: '15%' },
    3: { x: '70%', y: '15%' },
    4: { x: '85%', y: '66%' }
  };
  const POS_M = {
    1: { x: '14%', y: '30%' },
    2: { x: '38%', y: '24%' },
    3: { x: '62%', y: '24%' },
    4: { x: '86%', y: '30%' }
  };
  function posOf(rel) {
    return (window.innerWidth <= 760 ? POS_M : POS)[rel] || POS[1];
  }

  /* ---------------- 出牌连线 ---------------- */
  const Aim = (function () {
    const NS = 'http://www.w3.org/2000/svg';
    let layer = null, previewEl = null;
    function el(tag, attrs) {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      return e;
    }
    function init() { layer = $('#aim-layer'); }
    function anchorOf(seat) {
      const view = App.view;
      if (!view) return null;
      if (seat === view.seat) return { x: 50, y: 97 };
      return posOf((seat - view.seat + 5) % 5);
    }
    function pt(seat) {
      if (!layer) return null;
      const a = anchorOf(seat);
      if (!a) return null;
      const r = layer.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x: parseFloat(a.x) / 100 * r.width, y: parseFloat(a.y) / 100 * r.height };
    }
    function curve(g, fromSeat, toSeat, color, preview) {
      const A = pt(fromSeat), B = pt(toSeat);
      if (!A || !B) return false;
      const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
      const off = Math.min(90, len * 0.16);
      const cx = (A.x + B.x) / 2 - dy / len * off;
      const cy = (A.y + B.y) / 2 + dx / len * off;
      g.appendChild(el('path', {
        d: `M ${A.x} ${A.y} Q ${cx} ${cy} ${B.x} ${B.y}`,
        fill: 'none', stroke: color, 'stroke-width': preview ? 2 : 3,
        class: 'aim-line', filter: 'url(#aimGlow)'
      }));
      g.appendChild(el('circle', { cx: A.x, cy: A.y, r: 5, fill: color, class: 'aim-source' }));
      const rad = Math.atan2(B.y - cy, B.x - cx);
      const tx = B.x - Math.cos(rad) * 17, ty = B.y - Math.sin(rad) * 17;
      g.appendChild(el('path', {
        d: 'M0,-7 L14,0 L0,7 Z', fill: color,
        transform: `translate(${tx},${ty}) rotate(${rad * 180 / Math.PI})`, opacity: 0.95
      }));
      g.appendChild(el('circle', { cx: B.x, cy: B.y, r: 8, fill: 'none', stroke: color, 'stroke-width': 2, opacity: 0.75 }));
      return true;
    }
    function clearPreview() {
      if (previewEl && previewEl.parentNode) previewEl.remove();
      previewEl = null;
    }
    function preview(seat) {
      if (!layer || !App.view) return;
      clearPreview();
      const g = el('g', { class: 'aim-g preview' });
      if (curve(g, App.view.seat, seat, '#ffd166', true)) { layer.appendChild(g); previewEl = g; }
    }
    function play(fromSeat, targets, color) {
      if (!layer || !targets || !targets.length) return;
      clearPreview();
      targets.forEach(t => {
        const g = el('g', { class: 'aim-g' });
        if (!curve(g, fromSeat, t, color || '#ff5d7a', false)) return;
        layer.appendChild(g);
        setTimeout(() => g.remove(), 2100);
        const seatEl = document.querySelector(`.seat[data-seat="${t}"]`);
        if (seatEl) {
          seatEl.classList.add('hit');
          setTimeout(() => seatEl.classList.remove('hit'), 620);
        }
      });
    }
    return { init, preview, clearPreview, play };
  })();

  function resetTableDOM() {
    App.sel = null; App.discardSel = []; App.lastFx = 0; App.lastLog = 0; App.modalKey = null;
    App.resultShown = false; App.playedSig = null; App.mySig = null; App.handSig = null;
    $('#seats').innerHTML = '';
    $('#hand').innerHTML = '';
    $('#played').innerHTML = '';
    $('#prompt-bar').className = 'prompt-bar';
    $('#log-list').innerHTML = '';
    $('#fx-layer').innerHTML = '';
    closeModal();
  }

  function renderTable(view) {
    if (!view) return;
    App.view = view;
    App.me = view.seat;

    if (view.winner && !App.resultShown) {
      App.resultShown = true;
      setTimeout(() => showResult(view), 700);
    }

    $('#hud-round').textContent = '第 ' + view.round + ' 轮';
    $('#hud-phase').textContent = view.phase + '阶段';
    $('#hud-deck').textContent = view.deckCount;
    $('#hud-discard').textContent = view.discardCount;
    $('#phase-chip').textContent = view.phase + '阶段';

    renderSeats(view);
    renderMyCard(view);
    renderShop(view);
    renderHand(view);
    renderActions(view);
    renderPrompt(view);
    renderPlayed(view);
    renderFx(view);
    renderLog(view);
    renderAsk(view);
  }

  function seatHTML(p, view) {
    const c = charOf(p);
    const idn = p.identity ? D.IDENTITIES[p.identity] : null;
    const isTurn = view.current === p.seat && view.phase !== '结束';
    const thinking = view.pending && view.pending.seat === p.seat && p.isAI;
    const pips = Array.from({ length: p.maxHp }, (_, i) => `<span class="hp-pip ${i < p.hp ? '' : 'off'}"></span>`).join('');
    const eqMini = E.SLOTS.map(slot => {
      const key = p.equips ? p.equips[slot] : null;
      const def = key ? D.CARDS[key] : null;
      return `<span class="eq-mini ${def ? 'on' : ''}" title="${def ? esc(def.name) + '：' + esc(def.desc) : E.SLOT_NAME[slot] + '（空）'}">${def ? def.icon : '·'}</span>`;
    }).join('');
    const judges = (p.judge || []).map(j => `<span class="judge-chip">☁${j.name}</span>`).join('');
    return `<div class="seat ${isTurn ? 'turn' : ''} ${p.alive ? '' : 'dead'}" data-seat="${p.seat}" style="--x:${posOf((p.seat - view.seat + 5) % 5).x};--y:${posOf((p.seat - view.seat + 5) % 5).y};--cc:${c.color}">
      <div class="seat-inner">
        ${idn ? `<div class="seat-idn" style="--idc:${idn.color}" title="${esc(idn.goal)}">${idn.badge}</div>` : `<div class="seat-ai">${p.isAI ? 'AI' : '?'}</div>`}
        <div class="seat-top">
          <div class="seat-av">${patHTML(c.pattern)}${portrait(c, 'face')}</div>
          <div class="seat-id">
            <div class="seat-name">${esc(p.name)}</div>
            <div class="seat-char">${c.name} · ${D.BANDS[c.band].short}</div>
          </div>
        </div>
        <div class="hp-row">${pips}<span class="hp-num">${p.hp}/${p.maxHp}</span></div>
        <div class="seat-stats">
          <span class="hand-count">手牌 <b>${p.handCount}</b></span>
          <span class="pick-count" title="剩余吉他拨片">拨片 <b>${p.picks || 0}</b></span>
          ${p.identity ? `<span style="color:${idn.color};font-size:10px;letter-spacing:1px">${idn.name}</span>` : ''}
        </div>
        <div class="equip-row"><span class="eq-slots-mini">${eqMini}</span>${judges}</div>
        ${thinking ? '<div class="seat-thinking">思考中…</div>' : ''}
      </div>
    </div>`;
  }

  function renderSeats(view) {
    const wrap = $('#seats');
    const seen = new Set();
    view.players.forEach(p => {
      if (p.seat === view.seat) return;
      const isTurn = view.current === p.seat && view.phase !== '结束';
      const thinking = view.pending && view.pending.seat === p.seat && p.isAI;
      const sig = [p.hp, p.maxHp, p.handCount, p.alive, p.identity, isTurn, !!thinking, p.name,
        JSON.stringify(p.equips), JSON.stringify(p.judge), p.isAI, p.connected].join('|');
      seen.add(p.seat);
      let el = wrap.querySelector(`.seat[data-seat="${p.seat}"]`);
      if (!el) {
        const tmp = document.createElement('div');
        tmp.innerHTML = seatHTML(p, view);
        el = tmp.firstElementChild;
        el.dataset.sig = sig;
        wrap.appendChild(el);
      } else if (el.dataset.sig !== sig) {
        const tmp = document.createElement('div');
        tmp.innerHTML = seatHTML(p, view);
        const fresh = tmp.firstElementChild;
        el.innerHTML = fresh.innerHTML;
        el.className = fresh.className;
        el.dataset.sig = sig;
      }
      el.classList.toggle('turn', isTurn);
      el.classList.toggle('dead', !p.alive);
    });
    Array.from(wrap.children).forEach(el => { if (!seen.has(parseInt(el.dataset.seat, 10))) el.remove(); });

    const targets = App.sel ? App.sel.targets
      : (view.pending && view.pending.kind === 'chooseSeat' ? view.pending.seats : null);
    $$('#seats .seat').forEach(el => {
      const s = parseInt(el.dataset.seat, 10);
      const can = !!(targets && targets.includes(s));
      el.classList.toggle('targetable', can);
      el.onclick = () => onSeatClick(s);
      el.onmouseenter = () => { if (can) Aim.preview(s); };
      el.onmouseleave = () => Aim.clearPreview();
    });
  }

  /* ---------------- 吉他拨片商店 ---------------- */
  function renderShop(view) {
    const bar = $('#shop-bar');
    if (!bar) return;
    const items = view.shop || [];
    const isShop = view.pending && view.pending.seat === view.seat && view.pending.kind === 'shop';
    const isTurn = isShop; // 只有在购买阶段才显示商店
    if (!items.length || !isTurn) { bar.classList.remove('on'); bar.innerHTML = ''; App.shopSig = null; document.body.classList.remove('shopping'); return; }
    const sig = items.map(it => it.i + ':' + it.key + ':' + it.cost).join('|');
    const fresh = sig !== App.shopSig;
    App.shopSig = sig;
    bar.innerHTML = `<div class="shop-label">购买阶段 · 吉他拨片 <b>${view.mePicks || 0}</b>${isShop ? '<button class="shop-done" id="shop-done">开始出牌</button>' : ''}</div>
      <div class="shop-cards">${items.map((it, n) => {
        const d = D.CARDS[it.key];
        return `<button class="shop-card ${fresh ? 'deal' : ''}" data-i="${it.i}" style="--cc:${d.color};animation-delay:${n * 70}ms" title="${esc(d.desc)}">
          <span class="sc-cost">${it.cost}</span>
          <span class="sc-icon">${d.icon}</span>
          <span class="sc-name">${esc(d.name)}</span>
          <span class="sc-short">${esc(D.CARD_SHORT[it.key] || '')}</span>
        </button>`;
      }).join('')}</div>`;
    bar.classList.add('on');
    document.body.classList.toggle('shopping', isShop);
    bar.querySelectorAll('.shop-card').forEach(b => {
      b.addEventListener('click', () => sendAction({ type: 'buy', index: +b.dataset.i }));
    });
    const doneBtn = bar.querySelector('#shop-done');
    if (doneBtn) doneBtn.addEventListener('click', () => sendAction({ type: 'done' }));
  }

  function renderMyCard(view) {
    const p = view.players[view.seat];
    const c = charOf(p);
    const myTurn = view.current === view.seat;
    const idn = D.IDENTITIES[p.identity];
    const pips = Array.from({ length: p.maxHp }, (_, i) => `<span class="hp-pip ${i < p.hp ? '' : 'off'}"></span>`).join('');
    const opts = view.options;
    const usedSkills = (p.tf && p.tf.used) || {};
    const ACTIVE = ['jikoshoukai', 'dokushin', 'renshuu', 'butaikantoku', 'jinkaku', 'ouen', 'haishin', 'futari'];
    const TYPE_SHORT = { '锁定技': '锁', '主动技': '主', '触发技': '触', '限定技': '限' };
    let usableCount = 0;
    const skills = c.skills.map(s => {
      const active = ACTIVE.includes(s.id);
      const usable = !!(opts && opts.skills && opts.skills[s.id] !== undefined && !usedSkills[s.id]);
      const used = !!usedSkills[s.id];
      if (usable) usableCount++;
      return `<button class="skill-btn ${active ? (usable ? 'usable' : 'passive') : 'passive'} ${used ? 'used' : ''}" data-skill="${s.id}">
        <span class="sk-name">${s.name}</span><span class="sk-type">${TYPE_SHORT[s.type] || '·'}</span>
        <div class="stip"><b>${s.name}</b>（${s.type}）${s.desc}</div>
      </button>`;
    }).join('');
    const idnSkill = idn.skill
      ? `<button class="skill-btn passive" data-skill-idn="1"><span class="sk-name">${idn.skill.name}</span><span class="sk-type">${TYPE_SHORT[idn.skill.type] || '·'}</span><div class="stip"><b>${idn.skill.name}</b>（${idn.skill.type}）${idn.skill.desc}</div></button>`
      : '';
    const SLOT_SHORT = { weapon: '武器', armor: '防具', offhorse: '攻坐', defhorse: '防坐' };
    const eqRack = E.SLOTS.map(slot => {
      const key = p.equips ? p.equips[slot] : null;
      const def = key ? D.CARDS[key] : null;
      return `<button class="eq-slot ${def ? 'on' : ''}" data-slot="${slot}" title="${def ? esc(def.name) + '：' + esc(def.desc) : E.SLOT_NAME[slot] + '（空）'}">
        <span class="eq-ico">${def ? def.icon : '·'}</span>
        <span class="eq-txt"><b>${def ? def.name : '空'}</b><i>${SLOT_SHORT[slot]}</i></span>
      </button>`;
    }).join('');
    const sig = [p.hp, p.maxHp, view.handLimit, myTurn, p.identity, JSON.stringify(usedSkills),
      opts ? Object.keys(opts.skills).join(',') : '', c.id, JSON.stringify(p.equips || {})].join('|');
    if (sig === App.mySig) return;
    App.mySig = sig;
    $('#my-card').innerHTML = `<div class="mc-inner ${myTurn ? 'my-turn' : ''}" style="--cc:${c.color};--idc:${idn.color}">
      <div class="mc-top">
        <div class="mc-av">${patHTML(c.pattern)}${portrait(c, 'face')}</div>
        <div class="mc-idbox">
          <div class="mc-name">${c.name}${myTurn ? '<span class="turn-tag">你的回合</span>' : ''}</div>
          <div class="mc-sub">${D.BANDS[c.band].name} · ${c.role} · ${esc(p.name)}</div>
          <span class="mc-idn">${idn.badge} ${idn.name}</span>
        </div>
      </div>
      <div class="mc-hp"><div class="hp-row">${pips}<span class="hp-num">${p.hp}/${p.maxHp}</span><span class="hp-num pick-num">拨片 ${view.mePicks || 0}</span><span class="hp-num" style="margin-left:auto">手牌上限 ${view.handLimit}</span></div></div>
      <div class="mc-block">
        <div class="mc-label">装 备 <span>点击查看</span></div>
        <div class="mc-equips">${eqRack}</div>
      </div>
      <div class="mc-block">
        <div class="mc-label">技 能 <span>${usableCount ? usableCount + ' 个可发动' : '本回合不可发动'}</span></div>
        <div class="mc-skills">${skills}${idnSkill}</div>
      </div>
    </div>`;
    $$('#my-card .skill-btn.usable').forEach(btn => btn.addEventListener('click', () => onSkillClick(btn.dataset.skill)));
    $$('#my-card .eq-slot').forEach(btn => btn.addEventListener('click', () => showEquipInfo(btn.dataset.slot, view)));
  }

  function showEquipInfo(slot, view) {
    const p = view.players[view.seat];
    const key = p.equips ? p.equips[slot] : null;
    const slotName = E.SLOT_NAME[slot];
    if (!key) {
      openModal(`<h3>${slotName}槽</h3><div class="m-sub">当前为空</div>
        <p>装备对应的卡牌后会显示在这里。武器决定攻击范围，防具提供被动防护，坐骑影响距离。</p>
        <div class="modal-actions"><button class="btn" data-x="close">关闭</button></div>`,
        m => m.querySelector('[data-x=close]').addEventListener('click', closeModal));
      return;
    }
    const def = D.CARDS[key];
    openModal(`<h3>${def.name}</h3><div class="m-sub">${slotName} · 装备牌</div>
      <div style="display:flex;gap:18px;align-items:center;margin-top:6px">
        <div class="card" style="--cc:${def.color};flex:0 0 auto">
          <div class="c-art">${def.icon}</div>
          <div class="c-name">${def.name}</div>
          <div class="c-desc">${esc(D.CARD_SHORT[key] || '')}</div>
          <div class="c-type">${typeLabel(def)}</div>
        </div>
        <div>
          <p>${esc(def.desc)}</p>
          <p class="hint" style="margin-top:8px">${esc(def.flavor || '')}</p>
        </div>
      </div>
      <div class="modal-actions"><button class="btn" data-x="close">关闭</button></div>`,
      m => m.querySelector('[data-x=close]').addEventListener('click', closeModal));
  }

  function renderHand(view) {
    if (App.dealing) { $('#hand').innerHTML = ''; App.handSig = null; return; }
    const pending = view.pending;
    const isMine = pending && pending.seat === view.seat;
    const options = view.options;
    const mode = isMine ? pending.kind : 'none';
    const playable = new Set();
    if (isMine && mode === 'play' && options) Object.keys(options.cards).forEach(uid => playable.add(uid));
    let hand = view.hand || [];
    if (isMine && mode === 'dodge') hand.forEach(c => { if (c.key === 'dodge') playable.add(c.uid); });
    if (isMine && mode === 'slash') hand.forEach(c => { if (c.key === 'slash') playable.add(c.uid); });
    if (isMine && mode === 'counter') hand.forEach(c => { if (c.key === 'counter') playable.add(c.uid); });
    if (isMine && (mode === 'discard' || (mode === 'skillPrompt' && pending.cost === 'discard'))) hand.forEach(c => playable.add(c.uid));
    if (isMine && mode === 'rescue') hand.forEach(c => { if (c.key === 'matcha' && pending.canMatcha) playable.add(c.uid); });

    const selSig = ((App.sel && App.sel.id) || '') + ':' + App.discardSel.join(',');
    const sig = hand.map(c => c.uid).join(',') + '|' + [...playable].sort().join(',') + '|' + selSig;
    if (sig === App.handSig) return;
    App.handSig = sig;

    $('#hand').className = 'hand' + (hand.length > (window.innerWidth <= 760 ? 6 : 7) ? ' many' : '');
    $('#hand').innerHTML = hand.map(c => {
      const isPlayable = playable.has(c.uid);
      const cls = isPlayable ? 'playable hot' : (isMine && mode !== 'none' ? 'dim' : '');
      const sel = (App.sel && App.sel.id === c.uid) || App.discardSel.includes(c.uid);
      return cardHTML(c, cls + (sel ? ' sel' : ''));
    }).join('');

    $$('#hand .card').forEach(el => {
      const uid = el.dataset.uid;
      if (App.sel && App.sel.id === uid && mode === 'play') {
        const tg = (view.options && view.options.cards[uid]) || [];
        el.dataset.hint = tg.length ? '选择目标' : '再点一次打出';
      }
      if (playable.has(uid)) {
        el.classList.add('playable');
        el.addEventListener('click', () => onCardClick(uid));
        if (mode === 'play') {
          const b = document.createElement('span');
          b.className = 'c-hot';
          b.textContent = '可出';
          el.appendChild(b);
        }
      }
    });
    if (App.handReveal) {
      $$('#hand .card').forEach((el, i) => {
        el.classList.add('deal-in');
        el.style.animationDelay = (i * 55) + 'ms';
      });
    }
  }
  function renderActions(view) {
    const pending = view.pending;
    const isMine = pending && pending.seat === view.seat;
    const rail = $('#action-rail');
    let html = '';
    if (!isMine) {
      html = `<button class="btn" disabled>等待中…</button>`;
    } else if (pending.kind === 'play') {
      if (App.sel) html += `<button class="btn" data-x="cancel">取消选择</button>`;
      html += `<button class="btn btn-main-act" data-x="end">结束回合</button>`;
    } else if (['dodge', 'slash', 'counter'].includes(pending.kind)) {
      html += `<button class="btn" data-x="pass">${pending.kind === 'counter' ? '不反调' : '放弃'}</button>`;
    } else if (pending.kind === 'skillPrompt') {
      html += `<button class="btn" data-x="pass">放弃</button>`;
    } else if (pending.kind === 'rescue') {
      html += `<button class="btn" data-x="pass">不救</button>`;
    } else if (pending.kind === 'discard') {
      html += `<button class="btn" data-x="confirmDiscard">确认弃置 ${App.discardSel.length}/${pending.count}</button>`;
    }
    rail.innerHTML = html;
    rail.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => {
      const x = b.dataset.x;
      if (x === 'end') sendAction({ type: 'end' });
      if (x === 'cancel') { App.sel = null; updateSelection(App.view); }
      if (x === 'pass') sendAction({ type: 'pass' });
      if (x === 'confirmDiscard') {
        if (App.discardSel.length !== pending.count) { toast('需要弃置 ' + pending.count + ' 张', true); return; }
        sendAction({ type: 'discard', cardIds: App.discardSel.slice() });
        App.discardSel = [];
      }
    }));
  }

  function renderPrompt(view) {
    const pending = view.pending;
    const bar = $('#prompt-bar');
    if (!pending || pending.seat !== view.seat) {
      if (pending && view.players[pending.seat]) {
        bar.className = 'prompt-bar on';
        bar.innerHTML = `<div class="prompt-text">等待 <b style="color:var(--gold)">${esc(pending.playerName || view.players[pending.seat].name)}</b> ${pending.kind === 'play' ? '出牌' : '行动'}…</div>`;
      } else { bar.className = 'prompt-bar'; bar.innerHTML = ''; }
      return;
    }
    bar.className = 'prompt-bar on';
    let text = pending.prompt || '';
    let extra = '';
    if (pending.kind === 'play') {
      const n = view.options ? Object.keys(view.options.cards).length + Object.keys(view.options.skills).length : 0;
      text = App.sel
        ? `选择目标：点击高亮的角色（可选 ${App.sel.targets.length} 个）`
        : `你的出牌阶段 · 可出 ${n} 张 · 点击手牌或技能（Esc 取消）`;
    }
    if (pending.kind === 'discard') text = `请选择 ${pending.count} 张手牌弃置`;
    extra = pending.error ? `<span class="err">${esc(pending.error)}</span>` : '';
    bar.innerHTML = `<div class="prompt-text">${esc(text)}${extra}</div>`;
  }

  function renderPlayed(view) {
    const d = view.display;
    const sig = d ? (d.kind || 'card') + '|' + d.card.key + '|' + d.seat + '|' + (d.targets || []).join(',') : '';
    if (sig === App.playedSig) return;
    App.playedSig = sig;
    if (!d) { $('#played').innerHTML = ''; return; }

    let name, icon, color, desc, kindLabel;
    if (d.kind === 'skill') {
      const p = view.players[d.seat];
      const ch = p ? charOf(p) : null;
      let sk = ch ? ch.skills.find(s => s.name === d.card.name) : null;
      if (!sk && p && D.IDENTITIES[p.identity]) {
        const isk = D.IDENTITIES[p.identity].skill;
        if (isk && isk.name === d.card.name) sk = isk;
      }
      name = d.card.name; icon = '✦'; color = '#ffd166';
      desc = sk ? sk.desc : '发动技能';
      kindLabel = '技能';
      // 技能粒子 + 字幕
      if (p) {
        const seatEl = document.querySelector(`.seat[data-seat="${d.seat}"]`) || $('.my-card');
        if (seatEl) {
          const r = seatEl.getBoundingClientRect();
          JGSFx.burst(r.left + r.width / 2, r.top + r.height / 2, { color: '#ffd166', count: 16, spread: 54 });
          JGSFx.burst(r.left + r.width / 2, r.top + r.height / 2, { color: '#fff6d8', count: 6, spread: 26, up: true });
        }
        if (typeof showSubtitle === 'function') showSubtitle(p.charId, { jp: `【${name}】`, cn: `${p.name} 发动了【${name}】` });
        setTimeout(() => { try { hideSubtitle(); } catch (e) { } }, 1600);
      }
    } else {
      const def = D.CARDS[d.card.key];
      name = def.name; icon = def.icon; color = def.color;
      desc = D.CARD_SHORT[d.card.key] || '';
      kindLabel = typeLabel(def);
    }
    const p = view.players[d.seat];
    $('#played').innerHTML = `<div style="position:relative;display:flex;flex-direction:column;align-items:center">
      <div class="card big" style="--cc:${color}" title="${esc(name)}：${esc(desc)}">
        <div class="c-art">${icon}</div>
        <div class="c-name">${name}</div>
        <div class="c-desc">${esc(desc)}</div>
        <div class="c-type">${kindLabel}</div>
      </div>
      <div class="played-label">${esc(p ? p.name : '')}${d.targets && d.targets.length ? ' → ' + d.targets.map(t => view.players[t] ? view.players[t].name : '').join('、') : ''}</div>
    </div>`;
    { const pl = document.getElementById('played'); if (pl) { pl.classList.remove('in'); void pl.offsetWidth; pl.classList.add('in'); } }
    if (d.targets && d.targets.length) {
      Aim.play(d.seat, d.targets, color);
    } else if (d.kind !== 'skill' && (d.card.key === 'live' || d.card.key === 'spotlight')) {
      const all = view.players.filter(pl => pl.seat !== d.seat && pl.alive).map(pl => pl.seat);
      if (all.length) Aim.play(d.seat, all, color);
    }
    const srcChar = voiceOf(view, d.seat);
    if (d.kind === 'skill') Voice.play(srcChar, 'skill', { gap: 500 });
    else if (['slash', 'duet', 'live', 'spotlight'].includes(d.card.key)) Voice.play(srcChar, 'attack', { gap: 500 });
  }

  /* ---------------- 粒子 / 震屏特效 ---------------- */
  const JGSFx = (function () {
    let layer = null;
    function ensure() {
      if (!layer || !layer.isConnected) {
        layer = document.createElement('div');
        layer.id = 'fx-particles';
        document.body.appendChild(layer);
      }
      return layer;
    }
    function burst(x, y, opts) {
      opts = opts || {};
      const n = opts.count || 14;
      const color = opts.color || '#ff4d6d';
      const spread = opts.spread || 60;
      const up = !!opts.up;
      const L = ensure();
      for (let i = 0; i < n; i++) {
        const p = document.createElement('span');
        p.className = 'fx-p';
        const size = 3 + Math.random() * 5;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.left = x + 'px';
        p.style.top = y + 'px';
        p.style.background = 'radial-gradient(circle, ' + color + ' 0%, ' + color + ' 55%, transparent 72%)';
        L.appendChild(p);
        const ang = up ? (-Math.PI / 2 + (Math.random() - 0.5) * 1.3) : Math.random() * Math.PI * 2;
        const dist = spread * (0.4 + Math.random() * 0.9);
        const dx = Math.cos(ang) * dist;
        const dy = Math.sin(ang) * dist + (up ? -24 : 18);
        const dur = 420 + Math.random() * 380;
        p.animate([
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: 'translate(-50%, -50%) translate(' + dx + 'px,' + dy + 'px) scale(' + (0.2 + Math.random() * 0.4) + ')', opacity: 0 }
        ], { duration: dur, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
        setTimeout(() => p.remove(), dur + 80);
      }
    }
    function shake(el) {
      if (!el) return;
      el.classList.remove('fx-shake');
      void el.offsetWidth;
      el.classList.add('fx-shake');
      setTimeout(() => el.classList.remove('fx-shake'), 430);
    }
    function flash(color) {
      const f = document.createElement('div');
      f.className = 'fx-flash';
      f.style.background = color || 'rgba(255,40,80,.16)';
      document.body.appendChild(f);
      const a = f.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 400, easing: 'ease-out' });
      a.onfinish = () => f.remove();
      setTimeout(() => f.remove(), 700);
    }
    return { burst, shake, flash };
  })();
  window.JGSFx = JGSFx;

  /* ---------------- 性能诊断 ---------------- */
  let diagEl = null;
  function showDiag() {
    if (diagEl) { diagEl.remove(); diagEl = null; return; }
    diagEl = document.createElement('div');
    diagEl.className = 'diag-panel';
    diagEl.innerHTML = '<div class="diag-title">性能诊断</div><div class="diag-body">测量中…</div><div class="diag-tip">按 D 关闭</div>';
    document.body.appendChild(diagEl);
    const bodyEl = diagEl.querySelector('.diag-body');
    const gl = document.createElement('canvas').getContext('webgl');
    let renderer = 'WebGL 不可用';
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    }
    const dts = [];
    let last = performance.now(), t0 = last;
    function tick(t) {
      dts.push(t - last); last = t;
      if (t - t0 < 1600) { requestAnimationFrame(tick); return; }
      dts.sort((a, b) => a - b);
      const med = dts[Math.floor(dts.length / 2)] || 16.7;
      const fps = 1000 / med;
      const soft = /swiftshader|software|basic render/i.test(String(renderer));
      const buckets = {};
      dts.forEach(d => { const k = Math.round(d); buckets[k] = (buckets[k] || 0) + 1; });
      const top = Object.keys(buckets).sort((a, b) => buckets[b] - buckets[a]).slice(0, 3);
      const topTxt = top.map(k => k + 'ms×' + buckets[k]).join(' · ');
      bodyEl.innerHTML =
        '<div>实测帧率：<b>' + fps.toFixed(1) + ' FPS</b>（中位帧间隔 ' + med.toFixed(2) + 'ms）</div>' +
        '<div>估算屏幕刷新：<b>' + Math.round(fps) + ' Hz</b></div>' +
        '<div>帧间隔分布：' + topTxt + '</div>' +
        '<div>渲染器：<b class="' + (soft ? 'bad' : 'ok') + '">' + String(renderer).slice(0, 64) + '</b></div>' +
        '<div>窗口：' + innerWidth + '×' + innerHeight + ' · DPR ' + devicePixelRatio + ' · 逻辑核 ' + (navigator.hardwareConcurrency || '?') + ' · 可见性 ' + document.visibilityState + '</div>' +
        (soft ? '<div class="diag-warn">检测到软件渲染：请在浏览器设置里开启「使用硬件加速」后重启。</div>' : '') +
        (fps < 100 ? '<div class="diag-warn">浏览器只给出了 ' + Math.round(fps) + 'Hz 的节奏：检查 Windows 刷新率、chrome://gpu 的 Compositing、窗口是否在副屏/远程桌面。</div>' : '');
    }
    requestAnimationFrame(tick);
  }

  /* ---------------- 画质：自动低配 ---------------- */
  function setPerf(on, remember) {
    document.body.classList.toggle('perf', !!on);
    if (remember !== false) LS.set('jgs.perf', on ? '1' : '0');
  }
  function startFpsWatch() {
    if (LS.get('jgs.perf') != null) return;
    let frames = 0, t0 = performance.now(), done = false;
    function tick(t) {
      frames++;
      if (t - t0 >= 1000) {
        const fps = frames * 1000 / (t - t0);
        frames = 0; t0 = t;
        if (fps < 48 && !done) {
          done = true;
          setPerf(true);
          toast('帧率偏低，已自动切换低配模式（按 P 切换）');
          return;
        }
        if (performance.now() > 12000) { done = true; return; }
      }
      if (!done) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function renderFx(view) {
    const fx = (view.effects || []).filter(f => f.i > App.lastFx);
    if (!fx.length) return;
    App.lastFx = Math.max(...fx.map(f => f.i));
    const layer = $('#fx-layer');
    fx.forEach(f => {
      let x = '50%', y = '50%';
      if (f.seat === view.seat) { x = '50%'; y = '72%'; }
      else {
        const pos = posOf((f.seat - view.seat + 5) % 5);
        if (pos) { x = pos.x; y = pos.y; }
      }
      const el = document.createElement('div');
      el.className = 'fx-float fx-' + f.kind;
      el.style.left = x; el.style.top = y;
      el.textContent = f.text;
      layer.appendChild(el);
      setTimeout(() => el.remove(), 1300);
      // 角色语音
      const vc = voiceOf(view, f.seat);
      if (f.kind === 'damage') Voice.play(vc, 'damage', { gap: 900 });
      else if (f.kind === 'heal') Voice.play(vc, 'heal', { gap: 1300 });
      else if (f.kind === 'equip') Voice.play(vc, 'equip', { gap: 1500 });
      else if (f.kind === 'death') Voice.play(vc, 'death', { gap: 600 });
      else if (f.kind === 'turn' && Math.random() < 0.45) Voice.play(vc, 'turn', { gap: 2600 });
      if (f.kind === 'damage') {
        beep('dmg');
        const seatEl = document.querySelector(`.seat[data-seat="${f.seat}"] .seat-inner`);
        if (seatEl) { seatEl.classList.add('shake'); setTimeout(() => seatEl.classList.remove('shake'), 450); }
      } else if (f.kind === 'heal') beep('heal');
      else if (f.kind === 'turn') beep('turn');
      else if (f.kind === 'danger' || f.kind === 'death') beep('dmg');

      // 丰川集团：金色升级动画
      if (f.kind === 'trick' && f.text === '丰川集团') {
        JGSFx.flash('rgba(255,209,102,.22)');
        const seatEl = document.querySelector(`.seat[data-seat="${f.seat}"]`) || document.querySelector('.my-card');
        if (seatEl) {
          const r = seatEl.getBoundingClientRect();
          JGSFx.burst(r.left + r.width / 2, r.top + r.height / 2, { color: '#ffd166', count: 30, spread: 110 });
          JGSFx.burst(r.left + r.width / 2, r.top + r.height / 2, { color: '#fff6d8', count: 12, spread: 60, up: true });
        }
        const up = document.createElement('div');
        up.className = 'shop-up';
        up.innerHTML = '<span>◆</span> 商店升级 · 6 张';
        document.body.appendChild(up);
        setTimeout(() => up.remove(), 1800);
      }
      // 粒子 / 震屏
      if (f.kind === 'damage' || f.kind === 'danger' || f.kind === 'heal' || f.kind === 'death') {
        const target = f.seat === view.seat ? (document.querySelector('.my-card') || $(`#my-card`)) : document.querySelector(`.seat[data-seat="${f.seat}"]`);
        if (target) {
          const r = target.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height * 0.5;
          if (f.kind === 'heal') {
            JGSFx.burst(cx, cy, { color: '#42e6a4', count: 12, spread: 30, up: true });
          } else if (f.kind === 'death') {
            JGSFx.shake(target);
            JGSFx.burst(cx, cy, { color: '#b06bff', count: 26, spread: 84 });
            if (f.seat === view.seat) JGSFx.flash('rgba(120,60,255,.22)');
          } else {
            JGSFx.shake(target);
            JGSFx.burst(cx, cy, { color: f.kind === 'danger' ? '#ff7a1a' : '#ff4d6d', count: 16, spread: 62 });
            if (f.seat === view.seat) JGSFx.flash();
          }
        }
      }
    });
  }

  function renderLog(view) {
    const list = $('#log-list');
    const logs = (view.log || []).filter(l => l.i > App.lastLog);
    if (!logs.length) return;
    App.lastLog = Math.max(...logs.map(l => l.i));
    const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 40;
    logs.forEach(l => {
      const d = document.createElement('div');
      d.className = l.cls;
      d.textContent = l.text;
      list.appendChild(d);
    });
    if (list.children.length > 300) while (list.children.length > 300) list.removeChild(list.firstChild);
    if (atBottom) list.scrollTop = list.scrollHeight;
  }

  /* ---------------- 交互 ---------------- */
  function sendAction(resp) {
    if (!App.view) return;
    App.sel = null;
    Aim.clearPreview();
    if (App.host instanceof LocalHost) App.host.act(resp);
    else sendNet({ t: 'act', resp });
  }

  /* 只更新选中态：不重建整张牌桌，避免出牌前那一下卡顿 */
  function updateSelection(view) {
    const selId = App.sel ? App.sel.id : null;
    $$('#hand .card').forEach(el => {
      const on = selId && el.dataset.uid === selId;
      el.classList.toggle('sel', !!on);
      if (on) {
        const t = (App.sel.targets || []).length;
        el.dataset.hint = t ? '选择目标' : '再点一次打出';
      } else {
        delete el.dataset.hint;
      }
    });
    renderSeats(view);
    renderPrompt(view);
  }

  function onCardClick(uid) {
    const view = App.view, pending = view.pending;
    if (!pending || pending.seat !== view.seat) return;
    setTimeout(() => { try { beep('card'); } catch (e) { } }, 0);
    if (pending.kind === 'play') {
      const targets = (view.options && view.options.cards[uid]) || [];
      if (App.sel && App.sel.id === uid) {
        // 已选中：有目标就取消，无目标则再点一次打出
        if (targets.length) { App.sel = null; updateSelection(view); return; }
        sendAction({ type: 'card', cardId: uid, targets: [] });
        return;
      }
      App.sel = { kind: 'card', id: uid, targets };
      updateSelection(view);
      return;
    }
    if (pending.kind === 'discard') {
      const i = App.discardSel.indexOf(uid);
      if (i >= 0) App.discardSel.splice(i, 1);
      else if (App.discardSel.length < pending.count) App.discardSel.push(uid);
      renderTable(view);
      return;
    }
    if (pending.kind === 'skillPrompt' && pending.cost === 'discard') {
      sendAction({ type: 'discard', cardIds: [uid] });
      return;
    }
    if (pending.kind === 'rescue') {
      sendAction({ type: 'card', cardId: uid });
      return;
    }
    if (['dodge', 'slash', 'counter'].includes(pending.kind)) {
      sendAction({ type: 'card', cardId: uid });
    }
  }

  function onSeatClick(seat) {
    const view = App.view, pending = view.pending;
    if (pending && pending.seat === view.seat) {
      if (pending.kind === 'chooseSeat' && (pending.seats || []).includes(seat)) {
        sendAction({ type: 'seat', seat });
        return;
      }
      if (App.sel && App.sel.targets.includes(seat)) {
        const sel = App.sel;
        App.sel = null;
        if (sel.kind === 'card') sendAction({ type: 'card', cardId: sel.id, targets: [seat] });
        else sendAction({ type: 'skill', skillId: sel.id, targets: [seat] });
        return;
      }
    }
    // 非选目标时：查看对方信息（技能 / 装备 / 拨片，不显示手牌）
    openSeatDetail(view, seat);
  }

  /* ---------------- 角色信息面板 ---------------- */
  function openSeatDetail(view, seat) {
    const p = view.players[seat];
    if (!p) return;
    const modal = $('#seat-detail');
    if (!modal) return;
    const ch = charOf(p);
    const idn = p.identity ? D.IDENTITIES[p.identity] : null;
    const eq = p.equips || {};
    const slots = ['weapon', 'armor', 'offhorse', 'defhorse'];
    const slotName = { weapon: '武器', armor: '防具', offhorse: '进攻坐骑', defhorse: '防御坐骑' };
    const skills = (ch ? ch.skills : []).concat(idn && idn.skill ? [idn.skill] : []);
    modal.innerHTML = `<div class="sd-box">
      <button class="sd-x" data-x="close">✕</button>
      <div class="sd-head">
        <div class="sd-ava">${ch ? `<img src="${D.CHAR_IMG[ch.id]}" alt="">` : ''}</div>
        <div class="sd-who">
          <div class="sd-name">${esc(p.name)}</div>
          <div class="sd-sub">${esc(ch ? ch.name : '')} · ${esc(ch ? ch.band : '')}${idn ? ' · ' + esc(idn.name) : ''}</div>
          <div class="sd-hp"><span class="sd-pips">${Array.from({ length: p.maxHp }, (_, i) => `<i class="${i < p.hp ? 'on' : ''}"></i>`).join('')}</span><span class="sd-hpnum">${p.hp}/${p.maxHp}</span><span class="sd-pick">拨片 ${p.picks || 0}</span></div>
        </div>
      </div>
      <div class="sd-sec">装 备</div>
      <div class="sd-equips">${slots.map(s => {
        const key = eq[s];
        const d = key ? D.CARDS[key] : null;
        return `<div class="sd-eq ${d ? 'has' : ''}" ${d ? `data-key="${key}"` : ''}><span class="sd-eq-slot">${slotName[s]}</span><span class="sd-eq-name">${d ? esc(d.name) : '空'}</span></div>`;
      }).join('')}</div>
      <div class="sd-eq-tip" id="sd-eq-tip"><span class="sd-eq-hint">点击已装备的卡牌查看详情</span></div>
      <div class="sd-sec">技 能</div>
      <div class="sd-skills">${skills.map(sk => `
        <div class="sd-skill"><div class="sd-sk-top"><b>${esc(sk.name)}</b><i>${esc(sk.type || '')}</i></div>
        <p>${esc(sk.desc || '')}</p></div>`).join('') || '<p class="sd-empty">无</p>'}</div>
      <div class="sd-foot">手牌 ${p.handCount} 张 · 不显示具体手牌</div>
    </div>`;
    modal.classList.add('on');
    modal.querySelector('[data-x=close]').addEventListener('click', () => modal.classList.remove('on'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('on'); }, { once: true });
    modal.querySelectorAll('.sd-eq.has').forEach(el => {
      el.addEventListener('click', () => {
        const d = D.CARDS[el.dataset.key];
        if (!d) return;
        modal.querySelectorAll('.sd-eq').forEach(x => x.classList.remove('sel'));
        el.classList.add('sel');
        const tip = modal.querySelector('#sd-eq-tip');
        if (tip) tip.innerHTML = `<div class="sd-tip-name" style="--cc:${d.color}">${d.icon} ${esc(d.name)}</div>
          <div class="sd-tip-desc">${esc(d.desc)}</div>
          ${d.flavor ? `<div class="sd-tip-flavor">${esc(d.flavor)}</div>` : ''}`;
      });
    });
  }

  function onSkillClick(id) {
    const view = App.view, pending = view.pending;
    if (!pending || pending.seat !== view.seat || pending.kind !== 'play') return;
    const targets = (view.options && view.options.skills[id]) || [];
    if (!targets.length) { sendAction({ type: 'skill', skillId: id, targets: [] }); return; }
    App.sel = { kind: 'skill', id, targets };
    renderTable(view);
  }

  /* ---------------- 询问弹窗 ---------------- */
  function askKey(ask) { return ask.kind + '|' + ask.seat + '|' + (ask.prompt || '') + '|' + (ask.skillId || '') + '|' + (ask.error || ''); }

  function renderAsk(view) {
    const pending = view.pending;
    if (!pending || view.winner) return;
    const isMine = pending.seat === view.seat;
    const modalKinds = ['pick', 'handPick', 'option', 'rescue', 'skillPrompt'];
    if (!isMine || !modalKinds.includes(pending.kind)) { return; }
    if (pending.kind === 'skillPrompt' && pending.cost === 'discard' && view.hand.some(c => true)) {
      // 需要选牌支付：不弹窗，用手牌区 + 提示条
      return;
    }
    const key = askKey(pending);
    if (App.modalKey === key) return;
    App.modalKey = key;
    openAskModal(view, pending);
  }

  function openAskModal(view, ask) {
    const commit = resp => { closeModal(); sendAction(resp); };
    if (ask.kind === 'option') {
      openModal(`<h3>${esc(ask.title || '选择')}</h3>
        <p>${esc(ask.prompt || '')}</p>
        ${ask.error ? `<p style="color:#ff8fa0;font-size:11px;margin-top:8px">${esc(ask.error)}</p>` : ''}
        <div class="modal-actions">
          ${(ask.options || []).map((o, i) => `<button class="btn" data-i="${i}">${esc(o)}</button>`).join('')}
        </div>`, m => {
        m.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => commit({ type: 'option', index: parseInt(b.dataset.i, 10) })));
      });
      return;
    }
    if (ask.kind === 'rescue') {
      const t = view.players[ask.target];
      openModal(`<h3>${esc(ask.targetName)} 濒死</h3>
        <div class="m-sub">体力 ${t ? t.hp + '/' + t.maxHp : '?'} · 是否救援？</div>
        <p>${esc(ask.prompt || '')}</p>
        <div class="modal-actions">
          ${ask.canMatcha ? '<button class="btn primary" data-x="matcha">使用【抹茶】</button>' : ''}
          ${ask.canSoyo ? '<button class="btn" data-x="soyo">发动【不放弃】（弃一张手牌）</button>' : ''}
          <button class="btn" data-x="pass">放弃</button>
        </div>`, m => {
        const mm = m.querySelector('[data-x=matcha]');
        if (mm) mm.addEventListener('click', () => {
          const c = (view.hand || []).find(x => x.key === 'matcha');
          if (c) commit({ type: 'card', cardId: c.uid });
        });
        const ss = m.querySelector('[data-x=soyo]');
        if (ss) ss.addEventListener('click', () => {
          openModal(`<h3>不放弃</h3><div class="m-sub">弃置一张手牌，令其回复 1 点体力</div>
            <div class="pick-grid">${(view.hand || []).map(c => {
            const def = D.CARDS[c.key];
            return `<div class="pick-card named" data-uid="${c.uid}" style="border-color:${def.color}66">${def.icon}<br>${def.name}</div>`;
          }).join('')}</div>
            <div class="modal-actions"><button class="btn" data-x="back">返回</button></div>`,
            mm2 => {
              mm2.querySelectorAll('[data-uid]').forEach(el => el.addEventListener('click', () => {
                commit({ type: 'skill', skillId: 'akiramenai', cardIds: [el.dataset.uid] });
              }));
              mm2.querySelector('[data-x=back]').addEventListener('click', () => { App.modalKey = null; openAskModal(view, ask); });
            });
        });
        m.querySelector('[data-x=pass]').addEventListener('click', () => commit({ type: 'pass' }));
      });
      return;
    }
    if (ask.kind === 'pick') {
      const tz = ask.target;
      const t = view.players[tz.seat];
      const equips = Object.keys(tz.equips || {});
      openModal(`<h3>选择一张牌</h3>
        <div class="m-sub">${esc(t ? t.name : '')} · 手牌 ${tz.handCount} 张</div>
        <p>${esc(ask.prompt || '')}</p>
        ${ask.error ? `<p style="color:#ff8fa0;font-size:11px;margin-top:8px">${esc(ask.error)}</p>` : ''}
        <div class="pick-zone"><h5>手牌</h5><div class="row">${Array.from({ length: tz.handCount }, () => '<div class="pick-card" data-zone="hand">?</div>').join('')}</div></div>
        ${equips.length ? `<div class="pick-zone"><h5>装备</h5><div class="row">${equips.map(slot => {
        const def = D.CARDS[tz.equips[slot]];
        return `<div class="pick-card named" data-zone="equip" data-slot="${slot}">${def.icon}<br>${def.name}</div>`;
      }).join('')}</div></div>` : ''}
        ${(tz.judge || []).length ? `<div class="pick-zone"><h5>判定区</h5><div class="row">${tz.judge.map((k, i) => {
        const def = D.CARDS[k];
        return `<div class="pick-card named" data-zone="judge" data-index="${i}">${def.icon}<br>${def.name}</div>`;
      }).join('')}</div></div>` : ''}
        <div class="modal-actions"><button class="btn" data-x="cancel">取消</button></div>`,
        m => {
          m.querySelectorAll('[data-zone]').forEach(el => el.addEventListener('click', () => {
            commit({ type: 'pick', zone: el.dataset.zone, slot: el.dataset.slot, index: el.dataset.index != null ? parseInt(el.dataset.index, 10) : undefined });
          }));
          m.querySelector('[data-x=cancel]').addEventListener('click', () => closeModal());
        });
      return;
    }
    if (ask.kind === 'handPick') {
      let cards = ask.handCards;
      if (!cards) {
        const pool = ask.own ? (view.hand || []) : (view.hand || []);
        cards = pool.filter(c => (ask.hand || []).includes(c.uid)).map(c => ({ uid: c.uid, key: c.key, suit: c.suit, rank: c.rank }));
      }
      openModal(`<h3>${esc(ask.title || '选择手牌')}</h3>
        <div class="m-sub">${esc(ask.prompt || '')}</div>
        <div class="pick-grid">${cards.map(c => {
        const def = D.CARDS[c.key];
        return `<div class="pick-card named" data-uid="${c.uid}" style="--cc:${def.color};border-color:${def.color}66">${def.icon}<br>${def.name}</div>`;
      }).join('')}</div>
        <div class="modal-actions"><button class="btn" data-x="cancel">取消</button></div>`,
        m => {
          m.querySelectorAll('[data-uid]').forEach(el => el.addEventListener('click', () => commit({ type: 'uid', uid: el.dataset.uid })));
          m.querySelector('[data-x=cancel]').addEventListener('click', () => closeModal());
        });
      return;
    }
    if (ask.kind === 'skillPrompt') {
      const canPay = ask.cost !== 'discard' || (view.hand || []).length > 0;
      openModal(`<h3>${esc(ask.skillName || '技能')}</h3>
        <div class="m-sub">${ask.cost === 'discard' ? '代价：弃置一张手牌' : '触发时机'}</div>
        <p>${esc(ask.prompt)}</p>
        ${ask.error ? `<p style="color:#ff8fa0;font-size:11px;margin-top:8px">${esc(ask.error)}</p>` : ''}
        <div class="modal-actions">
          ${ask.cost === 'discard'
          ? `<button class="btn primary" data-x="pay">发动（选择弃牌）</button>`
          : `<button class="btn primary" data-x="yes">发动</button>`}
          <button class="btn" data-x="no">放弃</button>
        </div>`, m => {
        const yes = m.querySelector('[data-x=yes]');
        if (yes) yes.addEventListener('click', () => commit({ type: 'yes' }));
        const pay = m.querySelector('[data-x=pay]');
        if (pay) pay.addEventListener('click', () => {
          closeModal();
          App.modalKey = null;
          toast('请点击一张手牌作为代价');
        });
        m.querySelector('[data-x=no]').addEventListener('click', () => commit({ type: 'pass' }));
      });
    }
  }

  /* ---------------- 结算 ---------------- */
  function showResult(view) {
    const w = view.winner;
    const isLocal = App.host instanceof LocalHost;
    const winnerSeats = w.seats || [];
    const rows = view.players.map(p => {
      const c = charOf(p) || D.CHARACTERS[0];
      const idn = D.IDENTITIES[p.identity] || { color: '#888', name: '?', badge: '?' };
      const win = winnerSeats.includes(p.seat);
      return `<div class="result-row ${win ? 'win' : ''}">
        <div class="seat-av" style="--cc:${c.color};width:34px;height:34px">${patHTML(c.pattern)}${portrait(c, 'face')}</div>
        <div class="rr-name">${esc(p.name)} · ${c.name}</div>
        <div class="rr-tag" style="color:${idn.color}">${idn.name}</div>
        <div class="rr-tag">${p.alive ? '存活' : '退场'}</div>
      </div>`;
    }).join('');
    const meWin = winnerSeats.includes(view.seat);
    closeModal();
    openModal(`<div class="result-hero">
      <div class="result-crew">${esc(w.label)} 获胜</div>
      <div class="result-text">${esc(w.text || '')}</div>
      <div class="result-text" style="color:${meWin ? 'var(--gold)' : '#ff9db0'};margin-top:6px">${isLocal ? (meWin ? '你赢下了这场演出。' : '这次，聚光灯没有照到你。') : ''}</div>
    </div>
    <div class="result-list">${rows}</div>
    <div class="modal-actions">
      ${isLocal ? '<button class="btn primary" data-x="again">再来一局</button>' : '<button class="btn primary" data-x="again">回到房间</button>'}
      <button class="btn" data-x="home">回到标题</button>
    </div>`, m => {
      m.querySelector('[data-x=home]').addEventListener('click', () => {
        closeModal(); quitGame(); showScreen('title');
      });
      const again = m.querySelector('[data-x=again]');
      again.addEventListener('click', () => {
        closeModal();
        if (isLocal) { quitGame(); startClassic(); }
        else { sendNet({ t: 'again' }); showScreen('online'); App.net.room && (App.net.room.stage = 'lobby'); renderOnline(); }
      });
      beep(meWin ? 'win' : 'dmg');
      Voice.play(voiceOf(view, view.seat), meWin ? 'win' : 'lose', { gap: 0 });
    });
  }

  function quitGame() {
    if (App.host instanceof LocalHost) App.host.quit();
    App.host = null;
    App.view = null;
    App.resultShown = false;
    App.dealing = false;
    App.introPlaying = false;
    App.queuedView = null;
    const intro = $('#intro'), deal = $('#deal-overlay');
    if (intro) intro.classList.remove('on');
    if (deal) deal.classList.remove('on');
  }

  function onGameEnd(g) {
    // 由 renderTable 里的 winner 触发结算
  }

  /* ---------------- 帧率显示 / 低配模式 ---------------- */
  let fpsMeter = null, fpsFrames = 0, fpsLast = 0, fpsRaf = 0;
  function fpsLoop(t) {
    fpsFrames++;
    if (!fpsLast) fpsLast = t;
    if (t - fpsLast >= 500) {
      const f = Math.round(fpsFrames * 1000 / (t - fpsLast));
      if (fpsMeter) fpsMeter.textContent = 'FPS ' + f;
      fpsFrames = 0; fpsLast = t;
    }
    fpsRaf = requestAnimationFrame(fpsLoop);
  }
  function toggleFps(force) {
    const on = force != null ? force : !fpsMeter;
    if (on && !fpsMeter) {
      fpsMeter = document.createElement('div');
      fpsMeter.id = 'fps-meter';
      fpsMeter.textContent = 'FPS --';
      document.body.appendChild(fpsMeter);
      fpsLast = 0; fpsFrames = 0;
      cancelAnimationFrame(fpsRaf);
      fpsRaf = requestAnimationFrame(fpsLoop);
    } else if (!on && fpsMeter) {
      cancelAnimationFrame(fpsRaf);
      fpsMeter.remove();
      fpsMeter = null;
    }
  }


  /* ---------------- 全局按钮 ---------------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'home') {
      if (App.net.room && App.net.ws) sendNet({ t: 'leave' });
      App.net.room = null;
      LS.del('jgs.room');
      document.querySelectorAll('.chapter-end, .deck-modal, .gain-toast').forEach(n => n.remove());
      showScreen('title');
    }
  });

  $('#btn-log').addEventListener('click', () => $('#log-panel').classList.toggle('open'));
  $('#btn-help').addEventListener('click', showRules);
  const voiceBtn = $('#btn-voice');
  Voice.setHandler(showSubtitle);
  if (voiceBtn) {
    voiceBtn.classList.toggle('on', Voice.state().enabled);
    voiceBtn.addEventListener('click', () => {
      const on = Voice.toggle();
      voiceBtn.classList.toggle('on', on);
      toast(on ? '角色语音：开' : '角色语音：关');
      if (on && App.view) Voice.play(voiceOf(App.view, App.view.seat), 'turn', { gap: 0 });
    });
  }
  $('#log-close').addEventListener('click', () => $('#log-panel').classList.remove('open'));
  $('#btn-sound').addEventListener('click', () => {
    App.sound = !App.sound;
    LS.set('jgs.sound', App.sound ? '1' : '0');
    $('#btn-sound').classList.toggle('on', App.sound);
    if (App.sound) beep('click');
  });
  $('#btn-quit').addEventListener('click', () => {
    if (!confirm('退出当前对局？')) return;
    quitGame(); showScreen('title');
    if (App.net.room) { sendNet({ t: 'leave' }); App.net.room = null; LS.del('jgs.room'); }
  });

  window.addEventListener('resize', () => {
    if (App.screen !== 'table' || !App.view) return;
    App.mySig = null; App.handSig = null; App.playedSig = null;
    $$('#seats .seat').forEach(el => { el.dataset.sig = ''; });
    renderTable(App.view);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if ($('#modal-backdrop').classList.contains('on') && !App.view?.winner) closeModal();
      else if (App.sel) { App.sel = null; Aim.clearPreview(); if (App.view) updateSelection(App.view); }
    }
  });

  /* ---------------- 背景音乐 ---------------- */
  function initMusicUI() {
    const M = window.JGSMusic;
    if (!M) return;
    const dock = $('#music-dock'), toggle = $('#md-toggle');
    toggle.addEventListener('click', e => {
      e.stopPropagation();
      dock.classList.toggle('open');
      if (!M.state().playing) M.start();
    });
    dock.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => dock.classList.remove('open'));
    $('#md-play').addEventListener('click', () => M.toggle());
    $('#md-next').addEventListener('click', () => M.next());
    $('#md-prev').addEventListener('click', () => M.next());
    $('#md-vol').addEventListener('input', e => M.setVolume(e.target.value / 100));
    M.onChange(s => {
      $('#md-track').textContent = s.title || '—';
      $('#md-mode').textContent = s.mode === 'files' ? '曲库随机' : '原创合成';
      $('#md-play').textContent = s.playing ? '⏸' : '▶';
      toggle.classList.toggle('playing', s.playing);
      const vol = $('#md-vol');
      if (document.activeElement !== vol) vol.value = Math.round(s.vol * 100);
      $('#md-hint').textContent = s.mode === 'files'
        ? `music/ 中共 ${s.count} 首，正在随机播放`
        : (s.count ? `music/ 中有 ${s.count} 首，当前为合成 BGM` : '把喜欢的歌放进 music/ 文件夹，刷新后自动随机播放');
    });
    const kick = () => { document.removeEventListener('pointerdown', kick); M.start(); };
    document.addEventListener('pointerdown', kick);
  }

  /* 启动 */
  function boot() {
    bindTitle();
    initMusicUI();
    Aim.init();
    window.__jgs = App;
    App.Voice = Voice;
    window.JGSUI = { cardHTML, cardByKeyHTML, esc, toast, beep, showScreen, typeLabel };
    $('#btn-sound').classList.toggle('on', App.sound);
    const params = new URLSearchParams(location.search);
    App.fast = params.get('fast') === '1';
    if (params.get('perf') === '1') document.body.classList.add('perf');
    if (params.get('fps') === '1') toggleFps(true);
    document.addEventListener('keydown', e => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if (e.key === 'f' || e.key === 'F') toggleFps();
      if (e.key === 'd' || e.key === 'D') showDiag();
      if (e.key === 'p' || e.key === 'P') {
        const on = !document.body.classList.contains('perf');
        setPerf(on);
        toast(on ? '低配模式：开' : '画质模式：开');
      }
    });
    if (LS.get('jgs.perf') === '1') setPerf(true, false);
    startFpsWatch();
    if (params.get('join')) {
      App.name = params.get('name') || App.name;
      openOnline();
      setTimeout(() => { App.net.room = params.get('join').toUpperCase(); sendNet({ t: 'join', code: App.net.room, name: App.name || '玩家' }); }, 600);
    }
    if (params.get('test') === 'table') {
      App.classic.charId = params.get('char') || 'sakiko';
      startClassic();
    }
  }
  boot();
})();
