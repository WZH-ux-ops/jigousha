/* =========================================================
 *  鸡狗杀 · 剧情闯关
 *  视觉小说 + 卡牌战斗 + 卡牌收集
 * ========================================================= */
(function () {
  'use strict';
  const D = window.JGSData;
  const ST = window.JGSStory;
  const U = () => window.JGSUI;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => (U() ? U().esc(s) : String(s));

  const KEY = 'jgs.campaign.v1';
  const START_DECK = ['slash', 'slash', 'slash', 'slash', 'dodge', 'dodge', 'dodge', 'matcha', 'matcha'];
  const SUITS = ['♠', '♥', '♣', '♦'];

  /* 本模式可用的卡（其余卡牌暂不进入闯关卡池） */
  const KIT = {
    slash: { name: '微声', text: '造成 1 点伤害', once: 'slash' },
    dodge: { name: '回避', text: '抵消一次攻击', response: true },
    matcha: { name: '抹茶', text: '回复 1 点体力' },
    inspire: { name: '灵感', text: '摸 2 张牌' },
    dismantle: { name: '拆台', text: '对手随机弃 1 张' },
    duet: { name: '对唱', text: '造成 1 点伤害，对手弃 1 张', once: 'duet' },
    lightstick: { name: '应援棒', text: '获得 1 点护盾' },
    guitar: { name: '吉他', text: '微声 / 对唱伤害 +1（可叠加）' },
    counter: { name: '反调', text: '抵消对手的【拆台】/【对唱】', response: true },
    ensemble: { name: '合奏', text: '本回合微声 / 对唱伤害 +1' },
    mask: { name: '仮面', text: '本场战斗获得 1 点护甲（受到伤害 -1，可叠加）' },
    song: { name: '歌', text: '造成 1 点伤害，回复 1 点体力' },
    solo: { name: '独演', text: '造成 3 点伤害，自己失去 1 点体力' },
    finale: { name: '終幕', text: '造成 4 点伤害（每回合一次）' },
    honban: { name: '本番', text: '造成 2 点伤害；本回合已用微声则 4 点' },
    lighting: { name: '照明', text: '对手随机弃 1 张，你摸 1 张' },
    costume: { name: '衣装', text: '获得 1 点护盾，摸 1 张' },
    encore: { name: 'アンコール', text: '回复 2 点体力，摸 1 张' },
    silence: { name: '静寂', text: '对手下回合少摸 1 张' }
  };

  const ITEMS = {
    program: { name: '残破的节目单', icon: '📜', text: 'Ave Mujica 的旧节目单，背面写着一行小字：「别忘了，你也有声音。」' },
    umbrella: { name: '止まない傘', icon: '☂', text: '一把不会淋湿的伞。伞骨上刻着：「待ち続けた人のための歌」。' },
    playbill: { name: '褪色的节目单', icon: '🎫', text: '舞台边掉落的节目单，最后一行被剪掉了。背面有铅笔字：「まだ、歌える。」' },
    silent_pick: { name: '消音拨片', icon: '🎸', text: '一枚磨得发亮的拨片。用它弹奏时，声音会变得很轻，但不会消失。' },
    rulebook: { name: 'ルールブック', icon: '📖', text: '厚厚一本台本，每一页都写着「みんなが傷つかないように」。最后一页是空白。' },
    lyrics: { name: '歌詞の切れ端', icon: '📝', text: '被红笔划掉又写回来的歌词。角落有一行小字：「歌う理由は、あとからつける。」' },
    blank_page: { name: '白紙のページ', icon: '📄', text: '台本的最后一项，什么都没有。背面有一道很浅的铅笔痕：「まだ、歌える。」' },
    curtain: { name: '幕の切れ端', icon: '🎭', text: '从幕布上撕下的一角，摸起来像旧乐谱。上面有一句没写完的话：「終わりは、」' }
  };

  /* ---------------- 存档 ---------------- */
  function fresh() {
    return { v: 1, deck: START_DECK.slice(), items: {}, flags: {}, taken: {}, cleared: {}, battles: {}, up: {}, tokens: 0, log: {}, trial: { best: 0 }, chapter: null };
  }
  let state = load();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return fresh();
      return Object.assign(fresh(), JSON.parse(raw));
    } catch (e) { return fresh(); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { }
    if (window.JGSAuth && window.JGSAuth.loggedIn()) window.JGSAuth.queueSave(state);
  }

  function applyRemote(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.deck)) return;
    state = Object.assign(fresh(), s);
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { }
    const chapter = document.getElementById('screen-chapter');
    if (chapter && chapter.classList.contains('active')) renderChapter();
  }

  function deckCounts() {
    const m = {};
    state.deck.forEach(k => { m[k] = (m[k] || 0) + 1; });
    return m;
  }
  function addCard(key) {
    if (!KIT[key]) return;
    state.deck.push(key);
    save();
  }
  function addItem(id) { state.items[id] = (state.items[id] || 0) + 1; save(); }

  const UPG = {
    slash: '微声：伤害 1 → 2',
    dodge: '回避：抵消后摸 1 张',
    matcha: '抹茶：回复 1 → 2',
    duet: '对唱：伤害 2 → 3',
    dismantle: '拆台：弃 1 → 2 张',
    inspire: '灵感：摸 2 → 3 张',
    lightstick: '应援棒：护盾 1 → 2',
    guitar: '吉他：加成 1 → 2',
    counter: '反调：抵消后摸 1 张',
    ensemble: '合奏：加成 1 → 2',
    mask: '仮面：护甲 1 → 2',
    song: '歌：伤害 1 → 2',
    solo: '独演：伤害 3 → 4',
    finale: '終幕：伤害 4 → 5',
    honban: '本番：伤害 2 → 3（微声后 4 → 5）',
    lighting: '照明：弃 1 → 2 张',
    costume: '衣装：护盾 1 → 2',
    encore: 'アンコール：回复 2 → 3',
    silence: '静寂：少摸 1 → 2 张'
  };
  const upOn = k => !!(state.up && state.up[k]);
  const up = k => (upOn(k) ? 1 : 0);
  const upName = k => (D.CARDS[k] ? D.CARDS[k].name + (upOn(k) ? '+' : '') : k);

  function openUpgrade() {
    const layer = document.createElement('div');
    layer.className = 'deck-modal';
    const keys = Object.keys(deckCounts()).filter(k => UPG[k]);
    const paint = () => {
      layer.innerHTML = `<div class="de-box">
        <div class="de-head">
          <div class="de-title">强化卡牌</div>
          <div class="de-sub">剩余强化点 ${state.tokens || 0} · 每种卡只能强化一次</div>
        </div>
        <div class="de-grid">${keys.map(k => {
          const done = upOn(k);
          return `<button class="de-card ${done ? 'done' : ''}" data-k="${k}" style="--cc:${D.CARDS[k].color}">
            <span class="de-ico">${D.CARDS[k].icon}</span>
            <span class="de-txt"><b>${esc(upName(k))}</b><i>${esc(UPG[k])}</i></span>
          </button>`;
        }).join('')}</div>
        <div class="de-foot"><button class="btn" data-x="close">完成</button></div>
      </div>`;
      layer.querySelectorAll('.de-card').forEach(b => b.addEventListener('click', () => {
        const k = b.dataset.k;
        if (upOn(k)) { U().toast('已经强化过了'); return; }
        if ((state.tokens || 0) <= 0) { U().toast('没有剩余的强化点'); return; }
        state.up[k] = 1;
        state.tokens -= 1;
        save();
        U().toast(`【${D.CARDS[k].name}】强化完成`);
        paint();
        renderChapter();
      }));
      layer.querySelector('[data-x=close]').addEventListener('click', () => {
        layer.classList.remove('on');
        setTimeout(() => { layer.remove(); renderChapter(); }, 220);
      });
    };
    paint();
    $('#screen-chapter').appendChild(layer);
    requestAnimationFrame(() => layer.classList.add('on'));
  }

  /* ---------------- 章节页 ---------------- */
  function open() {
    U().showScreen('chapter');
    renderChapter();
  }

  function renderChapter() {
    const counts = deckCounts();
    const deckHTML = Object.keys(counts).map(k => {
      const def = D.CARDS[k];
      return `<button class="col-card ${upOn(k) ? 'up' : ''}" data-col="${k}" style="--cc:${def.color}">
        <span class="col-ico">${def.icon}</span>
        <span class="col-name">${esc(upName(k))}</span>
        <span class="col-num">×${counts[k]}</span>
      </button>`;
    }).join('');
    const itemsHTML = Object.keys(state.items).length
      ? Object.keys(state.items).map(id => {
        const it = ITEMS[id] || { name: id, icon: '❖', text: '' };
        return `<span class="col-item" title="${esc(it.text)}">${it.icon} ${esc(it.name)}</span>`;
      }).join('')
      : '<span class="col-empty">还没有道具</span>';

    const cardsHTML = ST.order.map((id, idx) => {
      const ch = ST.chapters[id];
      const done = !!state.cleared[id];
      const prevId = idx ? ST.order[idx - 1] : null;
      const locked = prevId ? !state.cleared[prevId] : false;
      return `<div class="ch-card ${done ? 'done' : ''} ${locked ? 'locked' : ''}">
        <div class="ch-cover"><span class="ch-no">${esc(id)}</span><span class="ch-mark">${done ? '已通关' : (locked ? '未解锁' : '未通关')}</span></div>
        <div class="ch-info">
          <div class="ch-title">${esc(ch.title)}</div>
          <div class="ch-sub">${esc(ch.sub || '')}</div>
          <p class="ch-desc">${esc(ch.desc || '')}</p>
          <div class="ch-actions">
            ${locked
              ? `<span class="ch-lock">通过「${esc((ST.chapters[prevId].title || '').split(' · ')[0])}」后解锁</span>`
              : `<button class="btn btn-primary" data-act="start" data-ch="${id}">${done ? '重看' : '进入'}</button>
                 ${done ? `<button class="btn" data-act="retry" data-ch="${id}">再战</button>` : ''}`}
          </div>
        </div>
      </div>`;
    }).join('');

    $('#chapter-body').innerHTML = `
      <div class="chapter-grid">
        <div class="chapter-list">${cardsHTML}</div>
        <div class="ch-side">
          <div class="side-block">
            <div class="side-title">我的卡组 <span>${state.deck.length} 张</span></div>
            <div class="col-grid">${deckHTML}</div>
            <div class="side-tip">剧情里的选择会给你新的卡牌。</div>
            <div class="side-btns">
              <button class="btn btn-mini" id="ch-edit">整理卡组（删卡）</button>
              <button class="btn btn-mini" id="ch-upgrade">强化卡牌${state.tokens ? ` · ${state.tokens} 点` : ''}</button>
              <button class="btn btn-mini" id="ch-recap">剧情回顾</button>
            </div>
          </div>
          <div class="side-block">
            <div class="side-title">道具</div>
            <div class="col-items">${itemsHTML}</div>
          </div>
          <div class="side-block">
            <div class="side-title">影之试炼 <span>最佳 第 ${(state.trial && state.trial.best) || 0} 波</span></div>
            <div class="side-tip">无尽挑战：用你的卡组一波波打下去，越往后越难。</div>
            <button class="btn btn-mini ${state.cleared['2-4'] ? 'btn-primary' : ''}" id="ch-trial" style="margin-top:8px" ${state.cleared['2-4'] ? '' : 'disabled'}>
              ${state.cleared['2-4'] ? '开始试炼' : '通关第七话后解锁'}
            </button>
          </div>
          <div class="side-block">
            <div class="side-title">存档</div>
            <button class="btn btn-mini" id="ch-reset">清空闯关存档</button>
          </div>
        </div>
      </div>`;

    $$('#chapter-body [data-act=start]').forEach(b => b.addEventListener('click', () => startChapter(b.dataset.ch)));
    $$('#chapter-body [data-act=retry]').forEach(b => b.addEventListener('click', () => startChapter(b.dataset.ch, true)));
    $('#ch-reset').addEventListener('click', () => {
      if (!confirm('清空闯关进度、卡组和道具？')) return;
      state = fresh(); save(); renderChapter();
    });
    $('#ch-edit').addEventListener('click', openDeckEdit);
    $('#ch-upgrade').addEventListener('click', openUpgrade);
    $('#ch-recap').addEventListener('click', () => openRecap());
    const tb = $('#ch-trial');
    if (tb && !tb.disabled) tb.addEventListener('click', () => startTrial(1));
    $$('#chapter-body .col-card').forEach(el => el.addEventListener('click', () => {
      const def = D.CARDS[el.dataset.col];
      U().toast(`${def.name}：${def.desc}`);
    }));
    const step = $('#chapter-step');
    if (step) step.textContent = `${ST.order.filter(id => state.cleared[id]).length} / ${ST.order.length} 已通关`;
  }

  const MIN_DECK = 8;

  /* ---------------- 影之试炼（无尽） ---------------- */
  const TRIAL_CHARS = ['sakiko', 'soyo', 'anon', 'taki', 'tomori', 'mutsumi'];

  function trialConfig(wave) {
    const ch = TRIAL_CHARS[(wave - 1) % TRIAL_CHARS.length];
    const c = D.getChar(ch);
    const short = (c && c.name ? c.name.split(' ').pop() : ch);
    const hp = 6 + Math.floor(wave * 1.6);
    const power = 1 + Math.floor((wave - 1) / 3);
    const armor = Math.floor((wave - 1) / 4);
    const draw = wave >= 4 ? 2 : 1;
    const deck = ['slash', 'slash', 'slash', 'slash', 'slash', 'dodge', 'dodge', 'matcha', 'counter', 'dismantle'];
    return {
      id: 'trial_' + wave, name: '影・' + short, char: ch,
      hp, power, armor, draw, deck,
      line: '第 ' + wave + ' 波。'
    };
  }

  function startTrial(wave) {
    wave = wave || 1;
    const cfg = trialConfig(wave);
    const bonusHp = (state.cleared['1-3'] ? 1 : 0) + (state.cleared['2-1'] ? 1 : 0);
    duel = {
      nodeId: 'trial',
      winNode: null, loseNode: null,
      reward: { cards: [] },
      trial: { wave },
      me: { hp: 6 + bonusHp, maxHp: 6 + bonusHp, shield: 0, deck: makePile(state.deck.slice()), hand: [], discard: [] },
      foe: {
        hp: cfg.hp, maxHp: cfg.hp, shield: 0,
        deck: makePile(cfg.deck.slice()), hand: [], discard: [],
        name: cfg.name, char: cfg.char, line: cfg.line,
        drawN: cfg.draw, power: cfg.power, armor: cfg.armor, onHitDraw: 0
      },
      turn: 'me', slashUsed: false, duetUsed: false, busy: true, over: false, round: 1,
      dealing: true, lastPlay: null,
      log: []
    };
    state.trial = state.trial || { best: 0 };
    U().showScreen('duel');
    renderDuel();
    draw('me', 2);
    logLine(`影之试炼 · 第 ${wave} 波`);
    logLine(`${cfg.name}：「${cfg.line}」`);
    setMsg('你的回合');
    renderDuel();
    setTimeout(() => { if (duel) playDealFx(); }, 90);
  }

  function trialWin() {
    const wave = duel.trial.wave;
    state.trial = state.trial || { best: 0 };
    if (wave > state.trial.best) state.trial.best = wave;
    let token = '';
    if (wave % 3 === 0) {
      state.tokens = (state.tokens || 0) + 1;
      token = '<div class="dr-reward">强化点 +1</div>';
    }
    const EXTRA = ['honban', 'lighting', 'costume', 'encore', 'silence'];
    if (wave % 5 === 0) {
      const missing = EXTRA.filter(k => state.deck.indexOf(k) < 0);
      if (missing.length) {
        const k = missing[Math.floor(Math.random() * missing.length)];
        addCard(k);
        token += `<div class="dr-reward">获得【${D.CARDS[k].name}】</div>`;
      }
    }
    save();
    const next = trialConfig(wave + 1);
    const overlay = document.createElement('div');
    overlay.className = 'duel-result win';
    overlay.innerHTML = `<div class="dr-box">
      <div class="dr-kicker">WAVE ${wave} CLEAR</div>
      <div class="dr-title">第 ${wave} 波 通过</div>
      <div class="dr-sub">下一波：${esc(next.name)} · ${next.hp} 体力${next.armor ? ' · 护甲 ' + next.armor : ''}</div>
      ${token}
      <div class="dp-actions" style="margin-top:14px">
        <button class="btn btn-primary" id="dr-next-wave">继续第 ${wave + 1} 波</button>
        <button class="btn" id="dr-quit">回章节</button>
      </div>
    </div>`;
    $('#screen-duel').appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('on'));
    $('#dr-next-wave').addEventListener('click', () => { overlay.remove(); startTrial(wave + 1); });
    $('#dr-quit').addEventListener('click', () => { overlay.remove(); duel = null; open(); });
  }

  function trialLose() {
    const wave = duel.trial.wave;
    state.trial = state.trial || { best: 0 };
    if (wave > state.trial.best) state.trial.best = wave - 1;
    save();
    const overlay = document.createElement('div');
    overlay.className = 'duel-result lose';
    overlay.innerHTML = `<div class="dr-box">
      <div class="dr-kicker">TRIAL END</div>
      <div class="dr-title">止步于第 ${wave} 波</div>
      <div class="dr-sub">最佳记录：第 ${state.trial.best} 波</div>
      <div class="dp-actions" style="margin-top:14px">
        <button class="btn btn-primary" id="dr-again">再来一次</button>
        <button class="btn" id="dr-back">回章节</button>
      </div>
    </div>`;
    $('#screen-duel').appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('on'));
    $('#dr-again').addEventListener('click', () => { overlay.remove(); startTrial(1); });
    $('#dr-back').addEventListener('click', () => { overlay.remove(); duel = null; open(); });
  }

  function recordLog(entry) {
    if (!vn.chapter) return;
    state.log = state.log || {};
    const arr = state.log[vn.chapter] = state.log[vn.chapter] || [];
    const last = arr[arr.length - 1];
    if (last && last.id === entry.id && last.text === entry.text) return;
    if (entry.who !== 'choice' && arr.some(x => x.id === entry.id)) return;
    arr.push(entry);
    if (arr.length > 260) arr.shift();
    save();
  }

  function openRecap(initial) {
    U().showScreen('recap');
    renderRecap(initial);
  }

  function renderRecap(initial) {
    const log = state.log || {};
    const tabs = ST.order.filter(id => (log[id] || []).length);
    const body = $('#recap-body');
    if (!tabs.length) {
      body.innerHTML = '<div class="recap-empty">还没有读过剧情。先玩一关吧。</div>';
      return;
    }
    let cur = initial && tabs.indexOf(initial) >= 0 ? initial : (tabs.indexOf(vn.chapter) >= 0 ? vn.chapter : tabs[0]);
    const ch = ST.chapters[cur];
    const entries = log[cur] || [];
    body.innerHTML = `
      <div class="recap-tabs">${tabs.map(id => {
        const t = ST.chapters[id].title.split(' · ');
        return `<button class="recap-tab ${id === cur ? 'on' : ''}" data-ch="${id}">
          <b>${esc(t[0] || id)}</b><span>${esc(t[1] || '')}</span></button>`;
      }).join('')}</div>
      <div class="recap-pane">
        <div class="recap-head">${esc(ch.title)}<span>${entries.length} 条</span></div>
        <div class="recap-list">${entries.map(e => {
          if (e.who === 'choice') {
            return `<div class="recap-entry choice"><span class="recap-who">选择</span><span class="recap-text">${esc(e.text)}</span></div>`;
          }
          const c = e.who && e.who !== 'narration' && e.who !== 'system' ? D.getChar(e.who) : null;
          const name = e.who === 'system' ? '？？？' : (c ? c.name : '旁白');
          const cls = e.who === 'system' ? 'system' : (c ? 'char' : 'narration');
          const color = c ? c.color : 'rgba(255,255,255,.4)';
          return `<div class="recap-entry ${cls}"><span class="recap-who" style="color:${color}">${esc(name)}</span><span class="recap-text">${esc(e.text)}</span></div>`;
        }).join('')}</div>
      </div>`;
    body.querySelectorAll('.recap-tab').forEach(b => b.addEventListener('click', () => renderRecap(b.dataset.ch)));
  }

  function openDeckEdit() {
    const layer = document.createElement('div');
    layer.className = 'deck-modal';
    const paint = () => {
      layer.innerHTML = `<div class="de-box">
        <div class="de-head">
          <div class="de-title">整理卡组</div>
          <div class="de-sub">${state.deck.length} 张 · 至少保留 ${MIN_DECK} 张 · 点击卡牌移除</div>
        </div>
        <div class="de-grid">${state.deck.map((k, i) => `
          <button class="de-card ${upOn(k) ? 'up' : ''}" data-i="${i}" style="--cc:${D.CARDS[k].color}">
            <span class="de-ico">${D.CARDS[k].icon}</span><b>${esc(upName(k))}</b>
          </button>`).join('')}</div>
        <div class="de-foot"><button class="btn" data-x="close">完成</button></div>
      </div>`;
      layer.querySelectorAll('.de-card').forEach(b => b.addEventListener('click', () => {
        if (state.deck.length <= MIN_DECK) { U().toast(`卡组至少保留 ${MIN_DECK} 张`); return; }
        const key = state.deck[+b.dataset.i];
        state.deck.splice(+b.dataset.i, 1);
        save();
        U().toast(`移除了【${D.CARDS[key].name}】`);
        paint();
      }));
      layer.querySelector('[data-x=close]').addEventListener('click', () => {
        layer.classList.remove('on');
        setTimeout(() => { layer.remove(); renderChapter(); }, 220);
      });
    };
    paint();
    $('#screen-chapter').appendChild(layer);
    requestAnimationFrame(() => layer.classList.add('on'));
  }

  /* ---------------- 视觉小说 ---------------- */
  const vn = { node: null, id: null, text: '', typing: false, timer: null, auto: false, autoTimer: null, chapter: '1-1' };

  function startChapter(id, skipToBattle) {
    vn.chapter = id;
    state.chapter = id;
    save();
    U().showScreen('story');
    const ch = ST.chapters[id];
    enterNode(skipToBattle ? (ch.battleNode || 'b1') : ch.start);
  }

  function enterNode(id) {
    const ch = ST.chapters[vn.chapter];
    const node = ch.nodes[id];
    if (!node) {
      console.warn('[story] missing node:', vn.chapter, id);
      if (U().toast) U().toast(`剧情节点缺失：${id}`);
      return;
    }
    vn.node = node; vn.id = id;
    vn.trail = (vn.trail || []).concat(id).slice(-60);
    clearTimeout(vn.autoTimer);
    const cw = $('#vn-choices');
    if (cw) { cw.classList.remove('on'); cw.innerHTML = ''; }
    if (node.text) recordLog({ id: id, who: node.who || '', text: node.text });

    if (node.battle) {
      startBattle(node, id);
      return;
    }
    renderScene(node);
    if (node.choices) { renderChoices(node); return; }
    if (node.end) { setTimeout(finishChapter, 400); return; }
    typeText(node.text);
  }

  function renderScene(node) {
    const bg = $('#vn-bg');
    bg.className = 'vn-bg bg-' + (node.bg || 'classroom');
    let who = node.who || '';
    if (node.who) vn.lastWho = node.who;
    if (!who) who = vn.lastWho || '';
    const sprites = (node.sprites || []).map(s => {
      const c = D.getChar(s.c);
      const src = (D.CHAR_IMG && D.CHAR_IMG[s.c]) || '';
      if (!src) return '';
      const dim = s.dim || (who && who !== 'narration' && who !== 'system' && who !== s.c);
      return `<img class="vn-sprite pos-${s.pos || 'center'} ${dim ? 'dim' : ''}" src="${src}" alt="${esc(c ? c.name : s.c)}" draggable="false">`;
    }).join('');
    $('#vn-sprites').innerHTML = sprites;
    $('#vn-chapter').textContent = ST.chapters[vn.chapter].title;

    if (node.who) {
      const nameEl = $('#vn-name');
      const box = $('#vn-box');
      if (who === 'narration') {
        nameEl.style.display = 'none';
        box.classList.add('narration');
      } else if (who === 'system') {
        nameEl.style.display = 'inline-flex';
        nameEl.textContent = '？？？';
        nameEl.style.setProperty('--nc', '#9b8cff');
        box.classList.remove('narration');
      } else {
        const c = D.getChar(who);
        nameEl.style.display = 'inline-flex';
        nameEl.textContent = c ? c.name : who;
        nameEl.style.setProperty('--nc', c ? c.color : 'var(--gold)');
        box.classList.remove('narration');
      }
    }
    $('#vn-box').classList.remove('on');
    requestAnimationFrame(() => $('#vn-box').classList.add('on'));
  }

  function typeText(text) {
    const el = $('#vn-text');
    el.textContent = '';
    vn.text = text || '';
    vn.typing = true;
    let i = 0;
    clearInterval(vn.timer);
    vn.timer = setInterval(() => {
      i += 1;
      el.textContent = vn.text.slice(0, i);
      if (i >= vn.text.length) {
        clearInterval(vn.timer);
        vn.typing = false;
        scheduleAuto();
      }
    }, 22);
  }

  function finishTyping() {
    clearInterval(vn.timer);
    $('#vn-text').textContent = vn.text;
    vn.typing = false;
    scheduleAuto();
  }

  function scheduleAuto() {
    clearTimeout(vn.autoTimer);
    if (!vn.auto) return;
    if (!vn.node || vn.node.choices || vn.node.battle || vn.node.end) return;
    vn.autoTimer = setTimeout(() => advance(), 1500);
  }

  function advance() {
    if (!vn.node || vn.node.choices || vn.node.battle) return;
    if (vn.typing) { finishTyping(); return; }
    if (vn.node.next) enterNode(vn.node.next);
  }

  function renderChoices(node) {
    const wrap = $('#vn-choices');
    const list = node.choices.filter(op => !(op.once && state.taken[op.once]));
    wrap.innerHTML = list.map((op, i) => `
      <button class="vn-choice ${op.hint ? 'vn-choice-hint' : ''}" data-i="${i + 1}">
        <span class="choice-main">${esc(op.text)}</span>
        ${op.sub ? `<span class="choice-sub">${esc(op.sub)}</span>` : ''}
        ${op.hint ? `<span class="choice-hint">${esc(op.hint)}</span>` : ''}
      </button>`).join('');
    wrap.classList.add('on');
    $$('#vn-choices .vn-choice').forEach(btn => btn.addEventListener('click', () => {
      U().beep('click');
      const idx = parseInt(btn.dataset.i, 10) - 1;
      const op = list[idx];
      if (!op) return;
      pickChoice(op);
    }));
  }

  function pickChoice(op) {
    if (!op) return;
    $('#vn-choices').classList.remove('on');
    $('#vn-choices').innerHTML = '';
    recordLog({ id: (vn.id || '') + ':c', who: 'choice', text: op.text });
    if (op.once) state.taken[op.once] = true;
    if (op.flag) state.flags[op.flag] = true;
    const canReward = !op.rewardOnce || !state.taken[op.rewardOnce];
    if (op.gain && canReward) {
      const got = [];
      (op.gain.cards || []).forEach(k => { addCard(k); const d = D.CARDS[k]; if (d) got.push(`【${d.name}】`); });
      (op.gain.items || []).forEach(id => { addItem(id); const it = ITEMS[id]; if (it) got.push(it.icon + it.name); });
      if (got.length) gainToast(got);
      if (op.rewardOnce) state.taken[op.rewardOnce] = true;
    }
    save();
    enterNode(op.next);
  }

  function gainToast(got) {
    const el = document.createElement('div');
    el.className = 'gain-toast';
    el.innerHTML = `<div class="gt-title">获得</div><div class="gt-body">${got.join('　')}</div>`;
    $('#screen-story').appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 400); }, 2200);
  }

  function finishChapter() {
    const firstClear = !state.cleared[vn.chapter];
    state.cleared[vn.chapter] = true;
    if (firstClear) state.tokens = (state.tokens || 0) + 1;
    save();
    const ch = ST.chapters[vn.chapter];
    const parts = (ch.title || '').split(' · ');
    const kicker = parts[0] || '';
    const name = parts.slice(1).join(' · ') || ch.title;
    const num = ST.order.indexOf(vn.chapter) + 1;
    const el = document.createElement('div');
    el.className = 'chapter-end';
    el.innerHTML = `<div class="ce-inner">
      <div class="ce-kicker">${esc(kicker)}</div>
      <div class="ce-title">${esc(name)}</div>
      <div class="ce-sub">—— 第 ${num} 关，通过 ——</div>
      ${ch.final ? `<div class="ce-final">${esc(ch.act || '第 一 幕')} · 完</div>` : ''}
      ${firstClear ? '<div class="ce-token">强化点 +1</div>' : ''}
      <div class="ce-cards">${Object.keys(deckCounts()).map(k => {
        const d = D.CARDS[k];
        return `<span class="ce-card" style="--cc:${d.color}">${d.icon} ${d.name} ×${deckCounts()[k]}</span>`;
      }).join('')}</div>
      <button class="btn btn-primary" id="ce-back">回到章节</button>
    </div>`;
    $('#screen-story').appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    $('#ce-back').addEventListener('click', () => {
      el.remove();
      open();
    });
  }

  /* ---------------- 战斗 ---------------- */
  let duel = null;
  let uidSeq = 0;

  function makeCard(key) {
    uidSeq += 1;
    return {
      uid: 'k' + uidSeq,
      key,
      suit: SUITS[Math.floor(Math.random() * 4)],
      rank: 1 + Math.floor(Math.random() * 13)
    };
  }
  function makePile(keys) {
    const arr = keys.map(makeCard);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function startBattle(node, nodeId) {
    const cfg = node.battle;
    const bonusHp = (state.cleared['1-3'] ? 1 : 0) + (state.cleared['2-1'] ? 1 : 0);
    duel = {
      nodeId,
      winNode: node.win,
      loseNode: node.lose,
      reward: cfg.reward || { cards: [] },
      me: { hp: 6 + bonusHp, maxHp: 6 + bonusHp, shield: 0, deck: makePile(state.deck.slice()), hand: [], discard: [] },
      foe: {
        hp: cfg.enemy.hp || 6, maxHp: cfg.enemy.hp || 6, shield: 0,
        deck: makePile(cfg.enemy.deck.slice()), hand: [], discard: [],
        name: cfg.enemy.name || '影', char: cfg.enemy.char || 'sakiko', line: cfg.enemy.line || '',
        drawN: cfg.enemy.draw || 1, power: cfg.enemy.power || 1, armor: cfg.enemy.armor || 0,
        onHitDraw: cfg.enemy.onHitDraw || 0, phase2: !!cfg.enemy.phase2, phased: false
      },
      turn: 'me', slashUsed: false, duetUsed: false, busy: true, over: false, round: 1,
      dealing: true, lastPlay: null,
      log: []
    };
    U().showScreen('duel');
    renderDuel();
    draw('me', 2);
    logLine('战斗开始。');
    if (duel.foe.line) logLine(`${duel.foe.name}：「${duel.foe.line}」`);
    setMsg('你的回合');
    renderDuel();
    setTimeout(() => { if (duel) playDealFx(); }, 90);
  }

  function draw(who, n) {
    const side = duel[who];
    for (let i = 0; i < n; i++) {
      if (!side.deck.length) {
        if (!side.discard.length) break;
        side.deck = makePile(side.discard.map(c => c.key));
        side.discard = [];
      }
      side.hand.push(side.deck.pop());
    }
  }

  function handOf(who) { return duel[who].hand; }
  function hasCard(who, key) { return handOf(who).some(c => c.key === key); }
  function takeCard(who, key) {
    const h = handOf(who);
    const i = h.findIndex(c => c.key === key);
    if (i < 0) return null;
    return h.splice(i, 1)[0];
  }
  function discardRandom(who) {
    const h = handOf(who);
    if (!h.length) return null;
    const c = h.splice(Math.floor(Math.random() * h.length), 1)[0];
    duel[who].discard.push(c);
    return c;
  }

  function logLine(t) {
    duel.log.push(t);
    if (duel.log.length > 4) duel.log.shift();
  }
  function setMsg(t) {
    duel.msg = t;
  }

  /* ---- 渲染 ---- */
  function hearts(hp, max) {
    let s = '';
    for (let i = 0; i < max; i++) s += `<span class="d-heart ${i < hp ? '' : 'off'}">♥</span>`;
    return s;
  }

  function renderDuel() {
    if (!duel) return;
    const root = $('#duel-root');
    const me = duel.me, foe = duel.foe;
    const canEnd = duel.turn === 'me' && !duel.over && !duel.busy;

    root.innerHTML = `
      <div class="duel-head">
        <button class="btn btn-mini" id="duel-quit">← 退出</button>
        <div class="duel-round">${duel.trial ? `影之试炼 · 第 ${duel.trial.wave} 波 · ` : ''}第 ${duel.round} 回合 · ${duel.turn === 'me' ? '你的回合' : '对方的回合'}</div>
        <div class="duel-spacer"></div>
      </div>
      <svg class="duel-aim" id="duel-aim" aria-hidden="true"></svg>
      <div class="duel-arena">
        <div class="duel-foe ${duel.turn === 'foe' ? 'active' : ''}">
          <div class="d-ava">${foe.char && D.CHAR_IMG[foe.char] ? `<img src="${D.CHAR_IMG[foe.char]}" alt="">` : ''}</div>
          <div class="d-info">
            <div class="d-name">${esc(foe.name)}</div>
            <div class="d-hp">${hearts(foe.hp, foe.maxHp)}<span class="d-shield">${foe.shield ? '盾 ' + foe.shield : ''}</span>${foe.armor ? `<span class="d-armor">甲 ${foe.armor}</span>` : ''}</div>
            <div class="d-sub">手牌 ${foe.hand.length} · 牌堆 ${foe.deck.length} · 弃牌 ${foe.discard.length}</div>
          </div>
        </div>
        <div class="duel-center">
          <div class="duel-play">${duel.lastPlay
            ? `${U().cardHTML({ uid: 'lp', key: duel.lastPlay.key, suit: '♠', rank: 1 }, 'duelc')}<span class="duel-play-who">${duel.lastPlay.who === 'me' ? '你' : esc(duel.foe.name)}</span>`
            : '<span class="duel-idle">対 峙</span>'}</div>
          <div class="duel-msg" id="duel-msg">${esc(duel.msg || '')}</div>
          <div class="duel-log">${duel.log.map(t => `<div>${esc(t)}</div>`).join('')}</div>
        </div>
      </div>
      <div class="duel-bottom">
        <div class="duel-me-panel ${duel.turn === 'me' ? 'active' : ''}">
          <div class="d-name">若叶 睦</div>
          <div class="d-hp">${hearts(me.hp, me.maxHp)}<span class="d-shield">${me.shield ? '盾 ' + me.shield : ''}</span>${me.armor ? `<span class="d-armor">甲 ${me.armor}</span>` : ''}</div>
          ${me.buff ? `<span class="d-buff">吉他 +${me.buff}</span>` : ''}
          ${me.tempBuff ? `<span class="d-buff temp">合奏 +${me.tempBuff}</span>` : ''}
          <div class="d-sub">牌堆 ${me.deck.length} · 弃牌 ${me.discard.length}</div>
        </div>
        <div class="duel-hand ${duel.dealing ? 'dealing' : ''}" id="duel-hand">${me.hand.map((c, ci) => {
          const ok = canPlay(c);
          const def = D.CARDS[c.key];
          return `<div class="duel-card ${ok ? 'ok' : ''} ${c.key === 'dodge' ? 'resp' : ''} ${duel.justDealt ? 'deal-in' : ''}" data-uid="${c.uid}" style="${duel.justDealt ? 'animation-delay:' + (ci * 45) + 'ms' : ''}" title="${esc(def.desc)}">
            ${U().cardHTML(c, 'duelc')}
            ${c.key === 'dodge' ? '<span class="dc-tag">响应</span>' : ''}
          </div>`;
        }).join('')}${!me.hand.some(canPlay) && duel.turn === 'me' && !duel.over ? '<div class="duel-none">没有可出的牌 · 结束回合</div>' : ''}</div>
        <div class="duel-actions">
          <button class="btn btn-primary" id="duel-end" ${canEnd ? '' : 'disabled'}>结束回合</button>
        </div>
      </div>`;

    $('#duel-quit').addEventListener('click', () => {
      if (!confirm('离开战斗？本场进度不保存。')) return;
      duel = null;
      open();
    });
    const endBtn = $('#duel-end');
    if (endBtn) endBtn.addEventListener('click', endTurn);
    $$('#duel-hand .duel-card').forEach(el => {
      el.addEventListener('click', () => {
        const c = me.hand.find(x => x.uid === el.dataset.uid);
        if (c && canPlay(c)) playCard(c);
      });
    });
    flushFx();
  }

  /* ---------------- 战斗特效：震屏 / 粒子 / 指示线 / 出牌飞行 ---------------- */
  function fx(kind, who) {
    if (!duel) return;
    (duel.fxQueue = duel.fxQueue || []).push({ kind, who });
  }

  function flushFx() {
    if (!duel || !duel.fxQueue || !duel.fxQueue.length) return;
    const q = duel.fxQueue;
    duel.fxQueue = [];
    q.forEach(f => {
      const el = f.who === 'me' ? document.querySelector('.duel-me-panel') : document.querySelector('.duel-foe');
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (!window.JGSFx) return;
      if (f.kind === 'heal') {
        JGSFx.burst(cx, cy, { color: '#42e6a4', count: 12, spread: 26, up: true });
      } else {
        JGSFx.shake(el);
        JGSFx.burst(cx, cy, { color: f.kind === 'armor' ? '#7fd7ff' : '#ff4d6d', count: 16, spread: 56 });
        if (f.who === 'me') JGSFx.flash();
      }
    });
  }

  function aimLine(fromSel, toSel, color) {
    const svg = $('#duel-aim');
    const root = $('#duel-root');
    const a = document.querySelector(fromSel);
    const b = document.querySelector(toSel);
    if (!svg || !root || !a || !b) return;
    const R = root.getBoundingClientRect();
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const x1 = ra.left + ra.width / 2 - R.left;
    const y1 = ra.top + ra.height / 2 - R.top;
    const x2 = rb.left + rb.width / 2 - R.left;
    const y2 = rb.top + rb.height / 2 - R.top;
    const mx = (x1 + x2) / 2;
    const my = Math.min(y1, y2) - Math.abs(x2 - x1) * 0.18 - 30;
    const ns = 'http://www.w3.org/2000/svg';
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`);
    path.setAttribute('stroke', color || '#ff6b8a');
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-dasharray', '10 8');
    path.setAttribute('class', 'duel-aim-line');
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', x2); dot.setAttribute('cy', y2);
    dot.setAttribute('r', '5'); dot.setAttribute('fill', color || '#ff6b8a');
    dot.setAttribute('class', 'duel-aim-dot');
    svg.appendChild(path);
    svg.appendChild(dot);
    path.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: -36 }], { duration: 700, iterations: 2, easing: 'linear' });
    setTimeout(() => { path.remove(); dot.remove(); }, 1400);
  }

  function flyCard(fromRect, key) {
    const target = document.querySelector('.duel-play .card');
    if (!target || !fromRect) return;
    const to = target.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'duel-fly';
    ghost.style.left = fromRect.left + 'px';
    ghost.style.top = fromRect.top + 'px';
    ghost.style.width = fromRect.width + 'px';
    ghost.style.height = fromRect.height + 'px';
    ghost.innerHTML = U().cardHTML({ uid: 'fly', key: key, suit: '♠', rank: 1 }, 'duelc');
    document.body.appendChild(ghost);
    const dx = to.left - fromRect.left;
    const dy = to.top - fromRect.top;
    const sc = to.width / Math.max(1, fromRect.width);
    const a = ghost.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 40}px) scale(${1 + (sc - 1) * 0.4})`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(${sc})`, opacity: 1 }
    ], { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
    a.onfinish = () => {
      target.classList.add('landed');
      setTimeout(() => target.classList.remove('landed'), 320);
      ghost.remove();
    };
    setTimeout(() => ghost.remove(), 900);
  }

  function playDealFx() {
    if (!duel) return;
    const root = $('#duel-root');
    const hand = document.querySelector('.duel-hand');
    if (!root || !hand) return;
    const layer = document.createElement('div');
    layer.className = 'duel-deal';
    layer.innerHTML = '<div class="dd-deck"></div><div class="dd-label">发牌中</div>';
    root.appendChild(layer);
    const deck = layer.querySelector('.dd-deck');
    const dr = deck.getBoundingClientRect();
    const hr = hand.getBoundingClientRect();
    for (let i = 0; i < 7; i++) {
      const c = document.createElement('div');
      c.className = 'dd-card';
      c.style.left = dr.left + 'px';
      c.style.top = dr.top + 'px';
      layer.appendChild(c);
      const tx = hr.left + hr.width / 2 - dr.left + (i - 3) * 22;
      const ty = hr.top + hr.height / 2 - dr.top;
      c.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 0 },
        { opacity: 1, offset: 0.15 },
        { transform: `translate(${tx}px, ${ty}px) rotate(${(i - 3) * 7}deg)`, opacity: 0 }
      ], { duration: 620, delay: i * 85, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
    }
    setTimeout(() => {
      layer.remove();
      if (!duel) return;
      duel.dealing = false;
      duel.busy = false;
      duel.justDealt = true;
      renderDuel();
      setTimeout(() => { if (duel) duel.justDealt = false; }, 800);
    }, 1250);
  }

  function canPlay(c) {
    if (!duel || duel.turn !== 'me' || duel.over || duel.busy) return false;
    if (c.key === 'dodge' || c.key === 'counter') return false;
    if (c.key === 'slash' && duel.slashUsed) return false;
    if (c.key === 'duet' && duel.duetUsed) return false;
    if (c.key === 'finale' && duel.finaleUsed) return false;
    if (c.key === 'matcha' && duel.me.hp >= duel.me.maxHp) return false;
    return !!KIT[c.key];
  }
  function playCard(c) {
    const me = duel.me;
    const i = me.hand.indexOf(c);
    if (i < 0) return;
    const srcEl = document.querySelector(`.duel-card[data-uid="${c.uid}"]`);
    const srcRect = srcEl ? srcEl.getBoundingClientRect() : null;
    me.hand.splice(i, 1);
    me.discard.push(c);
    const def = D.CARDS[c.key];
    duel.lastPlay = { key: c.key, who: 'me' };
    setMsg(`你打出了【${def.name}】`);
    logLine(`你打出了【${def.name}】`);

    if (c.key === 'slash') {
      duel.slashUsed = true;
      attackFoe(1 + up('slash') + (me.buff || 0) + (me.tempBuff || 0));
    } else if (c.key === 'duet') {
      duel.duetUsed = true;
      if (foeCounter()) {
        setMsg(`${duel.foe.name} 用【反调】抵消了【对唱】`);
      } else {
        attackFoe(2 + up('duet') + (me.buff || 0) + (me.tempBuff || 0));
        const dropped = discardRandom('foe');
        if (dropped) logLine(`${duel.foe.name} 弃置了【${D.CARDS[dropped.key].name}】`);
      }
    } else if (c.key === 'matcha') {
      const heal = 1 + up('matcha');
      me.hp = Math.min(me.maxHp, me.hp + heal);
      logLine(`你回复了 ${heal} 点体力`);
      fx('heal', 'me');
    } else if (c.key === 'inspire') {
      const n = 2 + up('inspire');
      draw('me', n);
      logLine(`你摸了 ${n} 张牌`);
    } else if (c.key === 'dismantle') {
      if (foeCounter()) {
        setMsg(`${duel.foe.name} 用【反调】抵消了【拆台】`);
      } else {
        const times = 1 + up('dismantle');
        for (let i = 0; i < times; i++) {
          const dropped = discardRandom('foe');
          logLine(dropped ? `${duel.foe.name} 弃置了【${D.CARDS[dropped.key].name}】` : '对方没有手牌');
        }
      }
    } else if (c.key === 'lightstick') {
      const sh = 1 + up('lightstick');
      me.shield += sh;
      logLine(`你获得了 ${sh} 点护盾`);
    } else if (c.key === 'guitar') {
      me.buff = (me.buff || 0) + 1 + up('guitar');
      logLine(`琴弦变得更响了（伤害 +${me.buff}）`);
    } else if (c.key === 'ensemble') {
      me.tempBuff = (me.tempBuff || 0) + 1 + up('ensemble');
      logLine(`合奏！本回合伤害 +${me.tempBuff}`);
    } else if (c.key === 'mask') {
      const a = 1 + up('mask');
      me.armor = (me.armor || 0) + a;
      logLine(`你戴上了面具（护甲 +${a}）`);
    } else if (c.key === 'song') {
      attackFoe(1 + up('song') + (me.buff || 0) + (me.tempBuff || 0));
      const heal = 1;
      me.hp = Math.min(me.maxHp, me.hp + heal);
      logLine(`歌声让你回复了 ${heal} 点体力`);
      fx('heal', 'me');
    } else if (c.key === 'solo') {
      attackFoe(3 + up('solo'));
      me.hp = Math.max(0, me.hp - 1);
      logLine('独演的反作用，你失去 1 点体力');
      fx('damage', 'me');
    } else if (c.key === 'finale') {
      duel.finaleUsed = true;
      attackFoe(4 + up('finale') + (me.buff || 0) + (me.tempBuff || 0));
      logLine('终幕落下——');
    } else if (c.key === 'honban') {
      const base = duel.slashUsed ? 4 : 2;
      attackFoe(base + up('honban') + (me.buff || 0) + (me.tempBuff || 0));
      logLine(duel.slashUsed ? `本番追击！${base} 点` : `本番独奏 ${base} 点`);
    } else if (c.key === 'lighting') {
      const times = 1 + up('lighting');
      for (let i = 0; i < times; i++) {
        const dropped = discardRandom('foe');
        if (dropped) logLine(`${duel.foe.name} 弃置了【${D.CARDS[dropped.key].name}】`);
      }
      draw('me', 1);
      logLine('聚光灯亮起，你摸 1 张');
    } else if (c.key === 'costume') {
      const sh = 1 + up('costume');
      me.shield += sh;
      draw('me', 1);
      logLine(`换上衣装（护盾 +${sh}），摸 1 张`);
    } else if (c.key === 'encore') {
      const heal = 2 + up('encore');
      me.hp = Math.min(me.maxHp, me.hp + heal);
      draw('me', 1);
      logLine(`安可！回复 ${heal} 点体力，摸 1 张`);
      fx('heal', 'me');
    } else if (c.key === 'silence') {
      const n = 1 + up('silence');
      duel.foe.silenced = (duel.foe.silenced || 0) + n;
      logLine(`静寂——${duel.foe.name} 下回合少摸 ${n} 张`);
    }
    renderDuel();
    if (srcRect) flyCard(srcRect, c.key);
    if (c.key === 'slash' || c.key === 'duet') aimLine('.duel-play .card', '.duel-foe', '#ff6b8a');
    if (c.key === 'dismantle' || c.key === 'counter') aimLine('.duel-play .card', '.duel-foe', '#9ad0ff');
    checkOver();
  }

  function attackFoe(dmg) {
    const foe = duel.foe;
    if (foe.hand.some(c => c.key === 'dodge') && Math.random() < 0.7) {
      takeCard('foe', 'dodge');
      logLine(`${foe.name} 打出了【回避】`);
      setMsg('攻击被回避了');
      return;
    }
    hurt('foe', dmg);
  }

  function foeCounter() {
    if (!duel) return false;
    const i = duel.foe.hand.findIndex(c => c.key === 'counter');
    if (i < 0 || Math.random() > 0.65) return false;
    duel.foe.discard.push(duel.foe.hand.splice(i, 1)[0]);
    logLine(`${duel.foe.name} 打出了【反调】`);
    return true;
  }

  function hurt(who, dmg) {
    const side = duel[who];
    const armor = side.armor || 0;
    if (armor) {
      dmg = Math.max(1, dmg - armor);
      logLine(`${who === 'me' ? '你' : duel.foe.name} 的护甲减免了 ${armor} 点`);
      fx('armor', who);
    }
    if (side.shield > 0) {
      side.shield -= 1;
      logLine(`${who === 'me' ? '你' : duel.foe.name} 的护盾抵消了伤害`);
      fx('armor', who);
      return;
    }
    side.hp = Math.max(0, side.hp - dmg);
    logLine(`${who === 'me' ? '你' : duel.foe.name} 受到 ${dmg} 点伤害`);
    fx('damage', who);
    if (who === 'foe' && duel.foe.onHitDraw) {
      draw('foe', duel.foe.onHitDraw);
      logLine(`${duel.foe.name} 吸收了声音，摸了 ${duel.foe.onHitDraw} 张牌`);
    }
    if (who === 'foe' && duel.foe.phase2 && !duel.foe.phased && side.hp > 0 && side.hp <= Math.ceil(duel.foe.maxHp / 2)) {
      duel.foe.phased = true;
      duel.foe.armor = (duel.foe.armor || 0) + 1;
      duel.foe.power = (duel.foe.power || 1) + 1;
      logLine('幕布撕开——终幕进入第二形态（护甲 +1，攻击 +1）');
      fx('armor', 'foe');
    }
  }

  function checkOver() {
    if (!duel || duel.over) return;
    if (duel.foe.hp <= 0) { duel.over = true; setTimeout(winBattle, 500); }
    else if (duel.me.hp <= 0) { duel.over = true; setTimeout(loseBattle, 500); }
  }

  function endTurn() {
    if (!duel || duel.turn !== 'me' || duel.over) return;
    duel.turn = 'foe';
    setMsg(`${duel.foe.name} 的回合`);
    renderDuel();
    setTimeout(foeTurn, 700);
  }

  async function foeTurn() {
    if (!duel || duel.over) return;
    duel.busy = true;
    renderDuel();
    await sleep(400);
    let dn = duel.foe.drawN || 1;
    if (duel.foe.silenced > 0) {
      const cut = Math.min(dn, duel.foe.silenced);
      dn -= cut;
      duel.foe.silenced -= cut;
      logLine(`静寂生效，${duel.foe.name} 少摸了 ${cut} 张`);
    }
    if (dn > 0) {
      draw('foe', dn);
      logLine(`${duel.foe.name} 摸了 ${dn} 张牌`);
    }

    if (duel.foe.hp <= 3 && hasCard('foe', 'matcha')) {
      takeCard('foe', 'matcha');
      duel.foe.hp = Math.min(duel.foe.maxHp, duel.foe.hp + 1);
      logLine(`${duel.foe.name} 使用了【抹茶】，回复 1 点体力`);
      renderDuel();
      await sleep(800);
    }

    if (hasCard('foe', 'dismantle')) {
      const dc = takeCard('foe', 'dismantle');
      duel.foe.discard.push(dc);
      duel.lastPlay = { key: 'dismantle', who: 'foe' };
      setMsg(`${duel.foe.name} 打出了【拆台】`);
      renderDuel();
      let countered = false;
      if (hasCard('me', 'counter')) {
        const use = await askResponse('【拆台】要弃你一张牌——要打出【反调】抵消吗？', '打出【反调】', '让它拆');
        if (use) {
          const cc = takeCard('me', 'counter');
          duel.me.discard.push(cc);
          countered = true;
          logLine('你用【反调】抵消了【拆台】');
          setMsg('你抵消了【拆台】');
        }
      }
      if (!countered) {
        const dropped = discardRandom('me');
        logLine(`${duel.foe.name} 使用了【拆台】${dropped ? `，你的【${D.CARDS[dropped.key].name}】被弃置` : ''}`);
      }
      renderDuel();
      await sleep(800);
    }

    for (let k = 0; k < 2; k++) {
      if (!duel || duel.over) break;
      if (!hasCard('foe', 'slash')) break;
      const c = takeCard('foe', 'slash');
      duel.foe.discard.push(c);
      duel.lastPlay = { key: 'slash', who: 'foe' };
      setMsg(`${duel.foe.name} 打出了【微声】`);
      logLine(`${duel.foe.name} 打出了【微声】`);
      renderDuel();
      aimLine('.duel-foe', '.duel-me-panel', '#ff6b8a');
      await sleep(500);

      if (hasCard('me', 'dodge')) {
        const useDodge = await askDodge(duel.foe.power || 1);
        if (useDodge) {
          takeCard('me', 'dodge');
          duel.me.discard.push({ uid: 'x' + Math.random(), key: 'dodge', suit: '♠', rank: 1 });
          logLine('你打出了【回避】，攻击被抵消');
          setMsg('你回避了攻击');
          if (up('dodge')) { draw('me', 1); logLine('【回避+】你摸了 1 张牌'); }
        } else {
          hurt('me', duel.foe.power || 1);
        }
      } else {
        hurt('me', duel.foe.power || 1);
      }
      renderDuel();
      await sleep(700);
      checkOver();
    }

    if (!duel || duel.over) return;
    duel.busy = false;
    duel.turn = 'me';
    duel.round += 1;
    duel.slashUsed = false;
    duel.duetUsed = false;
    duel.finaleUsed = false;
    duel.me.tempBuff = 0;
    draw('me', 2);
    logLine('你摸了 2 张牌');
    setMsg('你的回合');
    renderDuel();
  }

  function askDodge(dmg) {
    return askResponse(`${duel.foe.name} 的【微声】（${dmg} 点伤害）——要打出【回避】吗？`, '打出【回避】', '承受伤害');
  }

  function askResponse(text, yesLabel, noLabel) {
    return new Promise(resolve => {
      const layer = document.createElement('div');
      layer.className = 'duel-prompt';
      layer.innerHTML = `<div class="dp-box">
        <div class="dp-text">${esc(text)}</div>
        <div class="dp-actions">
          <button class="btn btn-primary" data-a="yes">${esc(yesLabel)}</button>
          <button class="btn" data-a="no">${esc(noLabel)}</button>
        </div>
      </div>`;
      $('#duel-root').appendChild(layer);
      requestAnimationFrame(() => layer.classList.add('on'));
      layer.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        layer.classList.remove('on');
        setTimeout(() => layer.remove(), 250);
        resolve(b.dataset.a === 'yes');
      }));
    });
  }

  function winBattle() {
    if (duel && duel.trial) { trialWin(); return; }
    const got = (duel.reward.cards || []).filter(k => KIT[k]);
    const nextNode = duel.winNode;
    const firstClear = !state.battles[duel.nodeId];
    if (firstClear) got.forEach(addCard);
    state.battles[duel.nodeId] = true;
    save();
    const overlay = document.createElement('div');
    overlay.className = 'duel-result win';
    overlay.innerHTML = `<div class="dr-box">
      <div class="dr-kicker">VICTORY</div>
      <div class="dr-title">影子散去了</div>
      ${got.length ? `<div class="dr-reward">获得 ${got.map(k => `<b>【${D.CARDS[k].name}】</b>`).join(' ')}</div>` : ''}
      <button class="btn btn-primary" id="dr-next">继续剧情</button>
    </div>`;
    $('#screen-duel').appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('on'));
    $('#dr-next').addEventListener('click', () => {
      overlay.remove();
      duel = null;
      U().showScreen('story');
      enterNode(nextNode);
    });
  }

  function loseBattle() {
    if (duel && duel.trial) { trialLose(); return; }
    const overlay = document.createElement('div');
    overlay.className = 'duel-result lose';
    overlay.innerHTML = `<div class="dr-box">
      <div class="dr-kicker">DEFEAT</div>
      <div class="dr-title">声音还不够</div>
      <div class="dr-sub">再来一次吧。</div>
      <button class="btn btn-primary" id="dr-retry">重试</button>
    </div>`;
    $('#screen-duel').appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('on'));
    $('#dr-retry').addEventListener('click', () => {
      overlay.remove();
      const id = duel.nodeId;
      const ch = ST.chapters[vn.chapter];
      startBattle(ch.nodes[id], id);
    });
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    const screen = $('#screen-story');
    screen.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      if (!vn.node || vn.node.choices || vn.node.battle) return;
      U().beep('click');
      advance();
    });
    $('#vn-auto').addEventListener('click', () => {
      vn.auto = !vn.auto;
      $('#vn-auto').classList.toggle('on', vn.auto);
      if (vn.auto) { if (!vn.typing) scheduleAuto(); } else clearTimeout(vn.autoTimer);
    });
    $('#vn-skip').addEventListener('click', fastForward);
    $('#vn-exit').addEventListener('click', () => {
      vn.auto = false;
      open();
    });
  }

  function fastForward() {
    let guard = 0;
    while (vn.node && !vn.node.choices && !vn.node.battle && !vn.node.end && guard < 200) {
      guard += 1;
      if (!vn.node.next) break;
      const ch = ST.chapters[vn.chapter];
      const nxt = ch.nodes[vn.node.next];
      if (!nxt) break;
      if (nxt.choices || nxt.battle) { enterNode(vn.node.next); break; }
      if (nxt.end) { enterNode(vn.node.next); break; }
      enterNode(vn.node.next);
    }
  }

  bind();
  window.addEventListener('jgs:auth', async () => {
    if (!window.JGSAuth || !window.JGSAuth.loggedIn()) return;
    const s = await window.JGSAuth.pullSave();
    if (s) applyRemote(s);
    else save();
  });
  window.addEventListener('jgs:save', e => applyRemote(e.detail));
  window.JGSCampaign = { open, state: () => state, duel: () => duel, vn: () => vn, render: () => renderDuel() };
})();
