/* =========================================================
 *  鸡狗杀 · 游戏引擎
 *  规则内核：回合流程 / 卡牌结算 / 技能触发 / 身份胜负
 *  浏览器与 Node 共用（服务端权威，客户端只做投影渲染）
 * ========================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.JGSEngine = factory(root.JGSData);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D) {
  'use strict';

  const SLOTS = ['weapon', 'armor', 'offhorse', 'defhorse'];
  const SLOT_NAME = { weapon: '武器', armor: '防具', offhorse: '进攻坐骑', defhorse: '防御坐骑' };

  /* ---------------- 随机数 ---------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- 日志 ---------------- */
  function log(g, text, cls) {
    g.log.push({ i: ++g.seq, text, cls: cls || '' });
    if (g.log.length > 400) g.log.splice(0, g.log.length - 400);
  }
  function fx(g, kind, seat, text) {
    g.effects.push({ i: ++g.seq, kind, seat, text });
    if (g.effects.length > 60) g.effects.splice(0, g.effects.length - 60);
  }

  /* ---------------- 建局 ---------------- */
  function createGame(cfg) {
    const seed = cfg.seed != null ? cfg.seed : Math.floor(Math.random() * 1e9);
    const g = {
      seed, rng: mulberry32(seed), seq: 0, uid: 0,
      players: [], deck: [], discard: [], log: [], effects: [],
      turn: 0, round: 1, current: 0, phase: '准备', pending: null,
      winner: null, display: null, aborted: false, startedAt: Date.now(),
      hitLog: [], config: cfg
    };

    g.players = cfg.players.map((pl, i) => {
      const ch = D.getChar(pl.charId);
      const maxHp = ch.hp + (pl.identity === 'producer' || pl.identity === 'costar' ? 1 : 0);
      return {
        id: pl.id || ('p' + i), name: pl.name || ('玩家' + (i + 1)), seat: i,
        charId: ch.id, charName: ch.name, identity: pl.identity,
        isAI: !!pl.isAI, maxHp, hp: maxHp, alive: true,
        hand: [], equips: {}, judge: [],
        revealed: pl.identity === 'producer',
        picks: 8, tf: {}, pf: { oblivionis: false }
      };
    });

    // 牌堆
    for (const [key, count] of D.DECK_SPEC) {
      for (let k = 0; k < count; k++) {
        const suit = D.SUITS[Math.floor(g.rng() * 4)];
        const rank = 1 + Math.floor(g.rng() * 13);
        g.deck.push({ uid: 'c' + (++g.uid), key, suit, rank, rankText: D.RANK_TEXT[rank] });
      }
    }
    shuffle(g.deck, g.rng);

    // 发牌：改为「拨片采购」——开局不摸牌，只给拨片去商店买
    for (const p of g.players) {
      p.picks = 8;
    }

    log(g, '—— 演出开始 ——', 'head');
    log(g, `身份已分配。制作人：${g.players.find(x => x.identity === 'producer').name}`, 'head');
    g.current = g.players.findIndex(p => p.identity === 'producer');
    if (g.current < 0) g.current = 0;
    g.round = 1;
    return g;
  }

  function shuffle(a, rng) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  const RANK_ORDER = { slash: 0, dodge: 1, matcha: 2, trick: 3, delay: 4, equip: 5 };
  function sortHand(p) {
    p.hand.sort((a, b) => {
      const da = D.CARDS[a.key], db = D.CARDS[b.key];
      const ra = da.type === 'equip' ? 5 : RANK_ORDER[da.type];
      const rb = db.type === 'equip' ? 5 : RANK_ORDER[db.type];
      if (ra !== rb) return ra - rb;
      return a.key.localeCompare(b.key) || a.rank - b.rank;
    });
  }

  /* ---------------- 基础查询 ---------------- */
  const alivePlayers = g => g.players.filter(p => p.alive);
  const seatDistance = (g, a, b) => {
    const n = g.players.length;
    let d = Math.abs(a - b);
    return Math.min(d, n - d);
  };
  function equipOf(p, slot) { return p.equips[slot] || null; }
  function hasEquip(p, key) { return SLOTS.some(s => p.equips[s] && p.equips[s].key === key); }
  function hasSkill(p, id) {
    const ch = D.getChar(p.charId);
    if (ch.skills.some(s => s.id === id)) return true;
    const idn = D.IDENTITIES[p.identity];
    return !!(idn && idn.skill && idn.skill.id === id);
  }
  function handLimit(g, p) {
    let n = p.hp;
    if (hasSkill(p, 'kyoei')) n += 1;
    if (hasSkill(p, 'genki')) n += 2;
    if (p.identity === 'producer') n += 1;
    if (p.identity === 'soloist') n += 1;
    return Math.max(0, n);
  }
  function attackRange(g, p) {
    const w = equipOf(p, 'weapon');
    return w ? (D.CARDS[w.key].range || 1) : 1;
  }
  function distance(g, fromSeat, toSeat) {
    const from = g.players[fromSeat], to = g.players[toSeat];
    // 终幕规则：第 20 轮起 / 仅剩两人时，全场距离视为 1，避免僵局
    if (g.round >= 20 || alivePlayers(g).length <= 2) return 1;
    let d = seatDistance(g, fromSeat, toSeat);
    if (equipOf(to, 'defhorse')) d += 1;
    if (equipOf(from, 'offhorse')) d -= 1;
    if (hasSkill(to, 'maigo') && to.hand.length === 0) d += 1;
    return Math.max(1, d);
  }
  function inRange(g, fromSeat, toSeat) {
    const from = g.players[fromSeat];
    if (hasSkill(from, 'noraneko')) return true;
    return distance(g, fromSeat, toSeat) <= attackRange(g, from);
  }
  function aliveFrom(g, seat) {
    const n = g.players.length, out = [];
    for (let i = 0; i < n; i++) {
      const p = g.players[(seat + i) % n];
      if (p.alive) out.push(p);
    }
    return out;
  }
  function nextAlive(g, seat) {
    const n = g.players.length;
    for (let i = 1; i <= n; i++) {
      const p = g.players[(seat + i) % n];
      if (p.alive) return p.seat;
    }
    return seat;
  }

  /* ---------------- 牌的操作 ---------------- */
  function drawCards(g, p, n, silent) {
    const got = [];
    for (let i = 0; i < n; i++) {
      if (!g.deck.length) {
        if (!g.discard.length) break;
        g.deck = shuffle(g.discard.splice(0), g.rng);
        log(g, '牌堆已空，弃牌堆重新洗入牌堆。', 'muted');
      }
      const c = g.deck.pop();
      if (!c) break;
      p.hand.push(c);
      got.push(c);
    }
    sortHand(p);
    if (got.length) {
      fx(g, 'draw', p.seat, '+' + got.length);
      if (!silent) log(g, `${p.name} 摸了 ${got.length} 张牌。`);
    }
    return got;
  }
  function toDiscard(g, card) {
    if (card) g.discard.push(card);
  }
  function removeFromHand(p, uid) {
    const i = p.hand.findIndex(c => c.uid === uid);
    if (i < 0) return null;
    return p.hand.splice(i, 1)[0];
  }
  function findInHand(p, uid) { return p.hand.find(c => c.uid === uid) || null; }
  function allCards(p) {
    const out = p.hand.slice();
    SLOTS.forEach(s => { if (p.equips[s]) out.push(p.equips[s]); });
    out.push(...p.judge);
    return out;
  }
  function takeAnyCard(g, p, zone, slot, index) {
    if (zone === 'hand') {
      if (!p.hand.length) return null;
      return p.hand.splice(Math.floor(g.rng() * p.hand.length), 1)[0];
    }
    if (zone === 'equip') {
      const c = p.equips[slot];
      if (!c) return null;
      delete p.equips[slot];
      return c;
    }
    if (zone === 'judge') {
      if (index == null || !p.judge[index]) return null;
      return p.judge.splice(index, 1)[0];
    }
    return null;
  }
  function discardAll(g, p, reason) {
    const cards = allCards(p);
    p.hand = []; p.equips = {}; p.judge = [];
    cards.forEach(c => toDiscard(g, c));
    if (cards.length) log(g, `${p.name} 弃置了全部 ${cards.length} 张牌${reason ? '（' + reason + '）' : ''}。`, 'muted');
  }

  /* ---------------- 请求（yield 交互） ---------------- */
  function* request(g, seat, ask, validate) {
    const p = g.players[seat];
    ask.seat = seat;
    ask.playerId = p.id;
    ask.playerName = p.name;
    for (;;) {
      g.pending = ask;
      let resp = yield ask;
      g.pending = null;
      if (!resp || typeof resp !== 'object') resp = { type: 'pass' };
      let err = null;
      try { err = validate ? validate(resp) : null; } catch (e) { err = '非法操作'; }
      if (!err) return resp;
      ask.error = err;
      g.seq++;
    }
  }

  /* 需要确认的主动技能（可带弃牌代价） */
  function* askSkill(g, p, opt) {
    const ask = {
      kind: 'skillPrompt', skillId: opt.skillId, skillName: opt.skillName || '',
      prompt: opt.prompt, cost: opt.cost || null, target: opt.target != null ? opt.target : null,
      amount: opt.amount != null ? opt.amount : null
    };
    const r = yield* request(g, p.seat, ask, resp => {
      if (resp.type === 'pass') return null;
      if (resp.type === 'yes') {
        if (opt.cost === 'discard' && p.hand.length === 0) return '你没有手牌可以弃置';
        return null;
      }
      if (resp.type === 'discard') {
        if (opt.cost !== 'discard') return '该技能不需要弃牌';
        const ids = resp.cardIds || [];
        if (ids.length !== 1) return '请弃置 1 张手牌';
        if (!findInHand(p, ids[0])) return '牌不在手中';
        return null;
      }
      return '无效操作';
    });
    if (r.type === 'pass') return { ok: false };
    if (r.type === 'discard') {
      const c = removeFromHand(p, r.cardIds[0]);
      toDiscard(g, c);
      log(g, `${p.name} 弃置了一张【${D.CARDS[c.key].name}】。`, 'muted');
      return { ok: true, card: c };
    }
    return { ok: true };
  }

  /* ---------------- 伤害 / 回复 ---------------- */
  function* heal(g, p, n, origin, source) {
    if (!p.alive) return 0;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + n);
    const delta = p.hp - before;
    if (delta > 0) {
      log(g, `${p.name} 回复了 ${delta} 点体力（${p.hp}/${p.maxHp}）。`, 'heal');
      fx(g, 'heal', p.seat, '+' + delta);
      if (origin === 'matcha' && hasSkill(p, 'matcha')) drawCards(g, p, 1);
      if (source && source !== p && source.alive && hasSkill(source, 'dokusen')) drawCards(g, source, 1);
    }
    return delta;
  }

  function* damage(g, source, target, amount, card) {
    if (!target.alive || g.winner || amount <= 0) return 0;

    // 共演者「和声」：代替制作人承受这次伤害
    if (target.identity === 'producer') {
      const costar = g.players.find(x => x.alive && x.identity === 'costar' && x.seat !== target.seat && !x.tf.harmony);
      if (costar && costar.hand.length > 0) {
        const r = yield* askSkill(g, costar, {
          skillId: 'wasei', skillName: '和声', cost: 'discard', target: target.seat, amount,
          prompt: `制作人即将受到 ${amount} 点伤害，是否发动【和声】？（弃一张手牌，代替其承受此伤害）`
        });
        if (r.ok) {
          costar.tf.harmony = true;
          log(g, `${costar.name} 站到了制作人前面。`, 'skill');
          return yield* damage(g, source, costar, amount, card);
        }
      }
    }

    let amt = amount;
    const notes = [];
    if (hasEquip(target, 'lightstick') && !target.tf.lightstickUsed) {
      target.tf.lightstickUsed = true;
      const ls = target.equips.armor;
      delete target.equips.armor;
      toDiscard(g, ls);
      log(g, `${target.name} 的【应援棒】挡下了这一击，碎裂了。`, 'shield');
      fx(g, 'shield', target.seat, '应援棒');
      return 0;
    }
    if (hasSkill(target, 'reisei') && !target.tf.reisei && target.hand.length > 0) {
        const r = yield* askSkill(g, target, {
          skillId: 'reisei', skillName: '冷静', cost: 'discard', amount: amt,
          prompt: `即将受到 ${amt} 点伤害，是否发动【冷静】？（弃一张手牌，伤害 -1）`
        });
      if (r.ok) { target.tf.reisei = true; amt -= 1; notes.push('冷静'); }
    }
    amt = Math.max(0, amt);
    if (amt === 0) {
      log(g, `${target.name} 受到的伤害被完全抵消${notes.length ? '（' + notes.join('、') + '）' : ''}。`, 'muted');
      fx(g, 'shield', target.seat, '免疫');
      return 0;
    }
    target.tf.dmgTaken = true;
    target.hp -= amt;
    if (source) g.hitLog.push({ src: source.seat, tgt: target.seat, turn: g.turn });
    log(g, `${target.name} 受到 ${amt} 点伤害（${Math.max(0, target.hp)}/${target.maxHp}）${notes.length ? ' · ' + notes.join(' -') : ''}`, 'damage');
    fx(g, 'damage', target.seat, '-' + amt);

    // 受伤后触发
    if (hasSkill(target, 'haruhikage')) {
      const r = yield* askSkill(g, target, {
        skillId: 'haruhikage', skillName: '春日影',
        prompt: '发动【春日影】？令一名角色摸一张牌。'
      });
      if (r.ok) {
        const pick = yield* request(g, target.seat, {
          kind: 'chooseSeat', prompt: '选择一名角色，令其摸一张牌。',
          seats: alivePlayers(g).map(p => p.seat), title: '春日影'
        }, v => (v.type === 'seat' && g.players[v.seat] && g.players[v.seat].alive) ? null : '请选择一名存活角色');
        drawCards(g, g.players[pick.seat], 1);
      }
    }
    if (hasSkill(target, 'dokuzetsu') && source && source.alive && allCards(source).length > 0) {
      const r = yield* askSkill(g, target, {
        skillId: 'dokuzetsu', skillName: '毒舌', target: source.seat,
        prompt: '发动【毒舌】？弃置伤害来源的一张牌。'
      });
      if (r.ok) yield* stealCard(g, target, source.seat, true);
    }

    if (source && source.alive && source !== target) {
      const w = equipOf(source, 'weapon');
      if (w && w.key === 'bass') drawCards(g, source, 1);
    }

    if (target.hp <= 0) yield* dying(g, target, source);
    return amt;
  }

  function* stealCard(g, user, targetSeat, isDiscard) {
    const t = g.players[targetSeat];
    if (!allCards(t).length) return null;
    const pick = yield* request(g, user.seat, {
      kind: 'pick', prompt: `选择 ${t.name} 的一张牌${isDiscard ? '弃置' : '获得'}`,
      target: { seat: targetSeat, handCount: t.hand.length, equips: summarizeEquips(t), judge: t.judge.map(c => c.key) }
    }, v => {
      if (v.type !== 'pick') return '请选择一张牌';
      if (v.zone === 'hand') return t.hand.length ? null : '对方没有手牌';
      if (v.zone === 'equip') return t.equips[v.slot] ? null : '该位置没有装备';
      if (v.zone === 'judge') return (t.judge[v.index] ? null : '该位置没有判定牌');
      return '无效操作';
    });
    const card = takeAnyCard(g, t, pick.zone, pick.slot, pick.index);
    if (!card) return null;
    if (isDiscard) {
      toDiscard(g, card);
      log(g, `${user.name} 弃置了 ${t.name} 的一张牌${pick.zone === 'hand' ? '' : '（' + D.CARDS[card.key].name + '）'}。`, 'muted');
    } else {
      user.hand.push(card); sortHand(user);
      log(g, `${user.name} 获得了 ${t.name} 的一张牌${pick.zone === 'hand' ? '' : '（' + D.CARDS[card.key].name + '）'}。`, 'muted');
    }
    fx(g, 'steal', t.seat, isDiscard ? '弃' : '取');
    return card;
  }

  function summarizeEquips(p) {
    const out = {};
    SLOTS.forEach(s => { if (p.equips[s]) out[s] = p.equips[s].key; });
    return out;
  }

  /* ---------------- 濒死 ---------------- */
  function* dying(g, target, source) {
    if (target.hp > 0 || !target.alive) return;
    log(g, `${target.name} 进入濒死状态！`, 'danger');
    fx(g, 'danger', target.seat, '濒死');

    if (hasSkill(target, 'oblivionis') && !target.pf.oblivionis) {
      const r = yield* askSkill(g, target, {
        skillId: 'oblivionis', skillName: 'Oblivionis',
        prompt: '发动限定技【Oblivionis】？将体力回复至 2 点，然后弃置所有手牌。'
      });
      if (r.ok) {
        target.pf.oblivionis = true;
        target.hp = 2;
        discardAll(g, target, 'Oblivionis');
        log(g, `${target.name} 戴上假面，体力回到 2 点。`, 'heal');
        fx(g, 'heal', target.seat, '+2');
      }
    }

    let guard = 0;
    while (target.hp <= 0 && guard++ < 24) {
      let acted = false;
      for (const q of aliveFrom(g, target.seat)) {
        if (target.hp > 0) break;
        const canMatcha = q.hand.some(c => c.key === 'matcha');
        const canSoyo = hasSkill(q, 'akiramenai') && q.hand.length > 0;
        if (!canMatcha && !canSoyo) continue;
        const r = yield* request(g, q.seat, {
          kind: 'rescue', prompt: `${target.name} 濒死（${Math.max(0, target.hp)}/${target.maxHp}），是否救援？`,
          target: target.seat, targetName: target.name, canMatcha, canSoyo
        }, v => {
          if (v.type === 'pass') return null;
          if (v.type === 'card') {
            const c = findInHand(q, v.cardId);
            if (!c || c.key !== 'matcha') return '请选择一张【抹茶】';
            return null;
          }
          if (v.type === 'skill') {
            if (!canSoyo) return '无法发动';
            const ids = v.cardIds || [];
            if (ids.length !== 1 || !findInHand(q, ids[0])) return '请弃置一张手牌';
            return null;
          }
          return '无效操作';
        });
        if (r.type === 'card') {
          const c = removeFromHand(q, r.cardId); toDiscard(g, c);
          log(g, `${q.name} 对 ${target.name} 使用了【抹茶】。`, 'heal');
          acted = true;
          yield* heal(g, target, 1, 'matcha', q);
        } else if (r.type === 'skill') {
          const c = removeFromHand(q, r.cardIds[0]); toDiscard(g, c);
          q.tf.soyoUsed = true;
          log(g, `${q.name} 发动【不放弃】，弃置一张手牌。`, 'heal');
          acted = true;
          yield* heal(g, target, 1, 'soyo', q);
        }
      }
      if (!acted) break;
    }
    if (target.hp <= 0) yield* die(g, target, source);
  }

  function* die(g, p, killer) {
    if (!p.alive) return;
    p.alive = false; p.revealed = true;
    const idn = D.IDENTITIES[p.identity];
    log(g, `${p.name} 退场了。身份是【${idn.name}】。`, 'death');
    fx(g, 'death', p.seat, idn.name);
    discardAll(g, p, '退场');

    // 拆解：其他拆团者摸一张
    if (p.identity === 'wrecker') {
      g.players.forEach(q => {
        if (q.alive && q.identity === 'wrecker') drawCards(g, q, 1);
      });
    }
    if (killer && killer.alive && killer !== p) {
      if (p.identity === 'wrecker') {
        log(g, `${killer.name} 击杀了拆团者，摸三张牌。`, 'reward');
        drawCards(g, killer, 3);
      } else if (p.identity === 'costar') {
        log(g, `${killer.name} 击杀了共演者，弃置所有手牌。`, 'danger');
        discardAll(g, killer, '击杀共演者的代价');
      }
    }
    checkWin(g);
  }

  function checkWin(g) {
    const producer = g.players.find(p => p.identity === 'producer');
    const alive = alivePlayers(g);
    const revealAll = () => g.players.forEach(p => { p.revealed = true; });
    if (!producer.alive) {
      revealAll();
      g.winner = {
        crew: 'wreck', label: '拆团者',
        seats: g.players.filter(p => p.identity === 'wrecker').map(p => p.seat),
        text: '节目单被撕碎了。拆团者获胜。'
      };
      return;
    }
    const wreckAlive = alive.some(p => p.identity === 'wrecker');
    const soloAlive = alive.some(p => p.identity === 'soloist');
    if (!wreckAlive && !soloAlive) {
      revealAll();
      g.winner = {
        crew: 'crew', label: '制作人 & 共演者',
        seats: g.players.filter(p => p.identity === 'producer' || p.identity === 'costar').map(p => p.seat),
        text: '演出完整落幕。制作人与共演者获胜。'
      };
      return;
    }
    if (alive.length === 1 && soloAlive) {
      revealAll();
      g.winner = {
        crew: 'solo', label: '独演者',
        seats: alive.map(p => p.seat),
        text: '聚光灯下只剩一个人。独演者获胜。'
      };
    }
  }

  /* ---------------- 卡牌使用 ---------------- */
  function legalCardTargets(g, p, card) {
    const def = D.CARDS[card.key];
    if (def.type === 'equip') return [];
    const others = alivePlayers(g).filter(q => q.seat !== p.seat);
    switch (card.key) {
      case 'slash': {
        if ((p.tf.slashUsed || 0) >= 1 + (p.tf.extraSlash || 0)) return null;
        const arr = others.filter(q => inRange(g, p.seat, q.seat)).map(q => q.seat);
        return arr.length ? arr : null;
      }
      case 'encore':
        return [];
      case 'tune':
        return [];
      case 'retake':
        return g.discard.some(c => c.key === 'slash' || c.key === 'dodge') ? [] : null;
      case 'swap': {
        if (!p.hand.length) return null;
        const arr = others.filter(q => q.hand.length > 0).map(q => q.seat);
        return arr.length ? arr : null;
      }
      case 'thunder':
        return others.length ? others.map(q => q.seat) : null;
      case 'pick_rain': case 'pick_salvage':
        return [];
      case 'togawa':
        return [];
      case 'pick_trade':
        return (p.picks || 0) >= 2 ? [] : null;
      case 'pick_storm': {
        if ((p.picks || 0) < 2) return null;
        const arr = others.map(q => q.seat);
        return arr.length ? arr : null;
      }
      case 'matcha':
        return p.hp < p.maxHp ? [] : null;
      case 'inspire': case 'camp':
        return [];
      case 'live': case 'spotlight':
        return others.length ? [] : null;
      case 'dismantle': {
        const arr = others.filter(q => allCards(q).length > 0 && !hasSkill(q, 'mugon')).map(q => q.seat);
        return arr.length ? arr : null;
      }
      case 'poach': {
        const arr = others.filter(q => allCards(q).length > 0 && distance(g, p.seat, q.seat) <= 1 && !hasSkill(q, 'mugon')).map(q => q.seat);
        return arr.length ? arr : null;
      }
      case 'duet': case 'absent': {
        const arr = others.map(q => q.seat);
        return arr.length ? arr : null;
      }
      case 'equip':
        return [];
      default:
        return null;
    }
  }

  function cardName(card) { return D.CARDS[card.key].name; }

  /* 反调（无懈）询问：返回 true 表示被抵消 */
  function* askCounter(g, user, card, targetSeat) {
    let cancelled = false;
    const desc = targetSeat != null
      ? `${user.name} 对 ${g.players[targetSeat].name} 使用了【${cardName(card)}】`
      : `${user.name} 使用了【${cardName(card)}】`;
    for (let round = 0; round < 6; round++) {
      let acted = false;
      for (const q of aliveFrom(g, user.seat)) {
        if (q.seat === user.seat) continue; // 自己不能反调自己的牌
        if (!q.hand.some(c => c.key === 'counter')) continue;
        const r = yield* request(g, q.seat, {
          kind: 'counter', prompt: `${desc}${cancelled ? '（已被反调抵消）' : ''}，是否打出【反调】？`,
          cardName: D.CARDS[card.key].name, cancelled
        }, v => {
          if (v.type === 'pass') return null;
          if (v.type === 'card') {
            const c = findInHand(q, v.cardId);
            if (!c || c.key !== 'counter') return '请选择一张【反调】';
            return null;
          }
          return '无效操作';
        });
        if (r.type === 'card') {
          const c = removeFromHand(q, r.cardId); toDiscard(g, c);
          cancelled = !cancelled;
          acted = true;
          log(g, `${q.name} 打出【反调】${cancelled ? '，抵消了效果' : '，重新生效'}。`, 'trick');
          fx(g, 'trick', q.seat, '反调');
          break;
        }
      }
      if (!acted) break;
    }
    return cancelled;
  }

  function* resolveSlash(g, user, targetSeat, bonus) {
    const t = g.players[targetSeat];
    if (!t.alive) return;
    fx(g, 'slash', targetSeat, '♪');
    log(g, `${user.name} 对 ${t.name} 使用【微声】。`, 'card');

    // 支援
    if (hasSkill(t, 'shien')) { /* 由持有者触发，见下 */ }
    for (const q of alivePlayers(g)) {
      if (q.seat === t.seat || !hasSkill(q, 'shien') || q.hand.length === 0) continue;
      const r = yield* askSkill(g, q, {
        skillId: 'shien', skillName: '支援', cost: 'discard', target: t.seat,
        prompt: `${t.name} 成为【微声】的目标，是否发动【支援】？（弃一张手牌，令其摸一张牌）`
      });
      if (r.ok) { drawCards(g, t, 1); break; }
    }

    // 炒作
    let dmg = 1 + (bonus || 0);
    if ((equipOf(user, 'weapon') || {}).key === 'capo') dmg += 1;
    if (hasSkill(t, 'sakunou')) {
      const r = yield* askSkill(g, t, {
        skillId: 'sakunou', skillName: '炒作', prompt: '发动【炒作】？摸一张牌，但此【微声】伤害 +1。'
      });
      if (r.ok) { drawCards(g, t, 1); dmg += 1; }
    }

    // 耳返
    if (hasEquip(t, 'earpiece') && t.hand.length === 0) {
      log(g, `${t.name} 的【耳返】隔绝了声音，【微声】无效。`, 'muted');
      fx(g, 'shield', t.seat, '耳返');
      return;
    }

    const r = yield* request(g, t.seat, {
      kind: 'dodge', prompt: `${user.name} 对你使用【微声】，请打出【回避】。`,
      source: user.seat, sourceName: user.name, damage: dmg
    }, v => {
      if (v.type === 'pass') return null;
      if (v.type === 'card') {
        const c = findInHand(t, v.cardId);
        if (!c || c.key !== 'dodge') return '请选择一张【回避】';
        return null;
      }
      return '无效操作';
    });

    if (r.type === 'card') {
      const c = removeFromHand(t, r.cardId); toDiscard(g, c);
      log(g, `${t.name} 打出了【回避】。`, 'muted');
      fx(g, 'dodge', t.seat, '↷');
      const w = equipOf(user, 'weapon');
      if (w && w.key === 'drums' && allCards(t).length > 0) {
        const rr = yield* askSkill(g, user, {
          skillId: 'drums', skillName: '鼓组', target: t.seat, prompt: '发动【鼓组】？弃置目标的一张牌。'
        });
        if (rr.ok) yield* stealCard(g, user, t.seat, true);
      }
      return;
    }
    yield* damage(g, user, t, dmg, null);
    if (hasSkill(user, 'pickecho')) {
      user.picks = (user.picks || 0) + 1;
      log(g, `${user.name} 的【拨片回响】获得 1 点吉他拨片（${user.picks}）。`, 'muted');
    }
    if ((equipOf(user, 'weapon') || {}).key === 'pedal' && t.alive && t.hand.length) {
      const rc = t.hand[Math.floor(Math.random() * t.hand.length)];
      t.hand.splice(t.hand.indexOf(rc), 1);
      toDiscard(g, rc);
      log(g, `${t.name} 受【效果器】影响，弃置了一张手牌。`, 'card');
    }
  }

  function* resolveDuet(g, user, targetSeat) {
    const t = g.players[targetSeat];
    let cur = t, other = user;
    log(g, `${user.name} 与 ${t.name} 开始【对唱】。`, 'card');
    for (let i = 0; i < 20; i++) {
      const r = yield* request(g, cur.seat, {
        kind: 'slash', prompt: `【对唱】：请打出【微声】，否则受到 1 点伤害。`,
        source: other.seat, sourceName: other.name
      }, v => {
        if (v.type === 'pass') return null;
        if (v.type === 'card') {
          const c = findInHand(cur, v.cardId);
          if (!c || c.key !== 'slash') return '请选择一张【微声】';
          return null;
        }
        return '无效操作';
      });
      if (r.type === 'card') {
        const c = removeFromHand(cur, r.cardId); toDiscard(g, c);
        log(g, `${cur.name} 接上了【微声】。`, 'muted');
        const tmp = cur; cur = other; other = tmp;
        continue;
      }
      log(g, `${cur.name} 没能接上。`, 'muted');
      yield* damage(g, other, cur, 1, null);
      return;
    }
  }

  function* useCard(g, p, uid, targets) {
    const card = removeFromHand(p, uid);
    if (!card) return false;
    const def = D.CARDS[card.key];
    const needTarget = ['slash', 'dismantle', 'poach', 'duet', 'absent'].includes(card.key);
    if (needTarget) {
      const t = targets && targets[0] != null ? g.players[targets[0]] : null;
      if (!t || !t.alive) {
        p.hand.push(card); sortHand(p);
        log(g, `${p.name} 的【${def.name}】没有合法目标，未使用。`, 'muted');
        return false;
      }
    }
    g.display = { card: { key: card.key, name: def.name, suit: card.suit, rank: card.rank }, seat: p.seat, targets: targets || [] };

    if (def.type === 'equip') {
      const slot = def.sub;
      const old = p.equips[slot];
      if (old) toDiscard(g, old);
      p.equips[slot] = card;
      log(g, `${p.name} 装备了【${def.name}】${old ? '（替换了【' + D.CARDS[old.key].name + '】）' : ''}。`, 'equip');
      fx(g, 'equip', p.seat, def.name);
      return true;
    }

    if (card.key === 'absent') {
      const t = g.players[targets[0]];
      log(g, `${p.name} 对 ${t.name} 使用了【走神】。`, 'card');
      const cancelled = yield* askCounter(g, p, card, t.seat);
      if (cancelled) { toDiscard(g, card); return true; }
      t.judge.push(card);
      fx(g, 'trick', t.seat, '走神');
      return true;
    }

    toDiscard(g, card);

    switch (card.key) {
      case 'slash': {
        p.tf.slashUsed = (p.tf.slashUsed || 0) + 1;
        const bonus = p.tf.slashBonus || 0;
        p.tf.slashBonus = 0;
        yield* resolveSlash(g, p, targets[0], bonus);
        break;
      }
      case 'matcha': {
        log(g, `${p.name} 使用了【抹茶】。`, 'heal');
        yield* heal(g, p, 1, 'matcha', p);
        break;
      }
      case 'inspire': {
        log(g, `${p.name} 使用了【灵感】。`, 'card');
        const cancelled = yield* askCounter(g, p, card, null);
        if (!cancelled) drawCards(g, p, 2);
        break;
      }
      case 'encore': {
        p.tf.extraSlash = 1;
        log(g, `${p.name} 使用了【安可】，本回合可以再使用一张【微声】。`, 'card');
        fx(g, 'trick', p.seat, '安可');
        break;
      }
      case 'tune': {
        log(g, `${p.name} 使用了【调音】。`, 'card');
        const cancelled = yield* askCounter(g, p, card, null);
        if (!cancelled) {
          drawCards(g, p, 2);
          p.tf.slashBonus = (p.tf.slashBonus || 0) + 1;
        }
        break;
      }
      case 'retake': {
        log(g, `${p.name} 使用了【重录】。`, 'card');
        const pool = g.discard.filter(c => c.key === 'slash' || c.key === 'dodge');
        if (pool.length) {
          const c = pool[Math.floor(Math.random() * pool.length)];
          g.discard.splice(g.discard.indexOf(c), 1);
          p.hand.push(c);
          log(g, `${p.name} 从弃牌堆取回了【${D.CARDS[c.key].name}】。`, 'card');
          fx(g, 'trick', p.seat, '重录');
        }
        break;
      }
      case 'swap': {
        const t = g.players[targets[0]];
        log(g, `${p.name} 对 ${t.name} 使用了【换幕】。`, 'card');
        const cancelled = yield* askCounter(g, p, card, t.seat);
        if (!cancelled) {
          if (!p.hand.length || !t.hand.length) {
            log(g, `【换幕】没有可交换的牌。`, 'muted');
          } else {
            const a = p.hand[Math.floor(Math.random() * p.hand.length)];
            const b = t.hand[Math.floor(Math.random() * t.hand.length)];
            p.hand.splice(p.hand.indexOf(a), 1);
            t.hand.splice(t.hand.indexOf(b), 1);
            p.hand.push(b);
            t.hand.push(a);
            log(g, `${p.name} 与 ${t.name} 交换了一张手牌（${D.CARDS[a.key].name} ↔ ${D.CARDS[b.key].name}）。`, 'card');
            fx(g, 'trick', t.seat, '换幕');
          }
        }
        break;
      }
      case 'thunder': {
        const t = g.players[targets[0]];
        log(g, `${p.name} 对 ${t.name} 使用了【雷鸣】。`, 'card');
        const cancelled = yield* askCounter(g, p, card, t.seat);
        if (!cancelled) yield* damage(g, p, t, t.hand.length === 0 ? 2 : 1, card);
        break;
      }
      case 'pick_rain': {
        log(g, `${p.name} 使用了【拨片雨】。`, 'card');
        drawCards(g, p, 2);
        p.picks = (p.picks || 0) + 2;
        fx(g, 'trick', p.seat, '拨片');
        break;
      }
      case 'pick_trade': {
        if ((p.picks || 0) < 2) break;
        p.picks -= 2;
        log(g, `${p.name} 用 2 点拨片换来了 2 张牌。`, 'card');
        drawCards(g, p, 2);
        break;
      }
      case 'pick_storm': {
        if ((p.picks || 0) < 2) break;
        p.picks -= 2;
        const t = g.players[targets[0]];
        log(g, `${p.name} 消耗 2 点拨片，对 ${t.name} 发动【拨片风暴】。`, 'card');
        const cancelled = yield* askCounter(g, p, card, t.seat);
        if (!cancelled) yield* damage(g, p, t, 2, card);
        break;
      }
      case 'pick_salvage': {
        log(g, `${p.name} 使用了【回收】，换取 3 点拨片。`, 'card');
        p.hp -= 1;
        p.picks = (p.picks || 0) + 3;
        fx(g, 'damage', p.seat, '-1');
        if (p.hp <= 0) yield* dying(g, p, null);
        break;
      }
      case 'togawa': {
        p.shopBonus = (p.shopBonus || 0) + 1;
        log(g, `${p.name} 使用了【丰川集团】，商店升级为 ${SHOP_SIZE + p.shopBonus} 张。`, 'card');
        fx(g, 'trick', p.seat, '丰川集团');
        break;
      }
      case 'camp': {
        log(g, `${p.name} 使用了【合宿】。`, 'card');
        const cancelled = yield* askCounter(g, p, card, null);
        if (!cancelled) {
          for (const q of alivePlayers(g)) yield* heal(g, q, 1, 'camp', p);
        }
        break;
      }
      case 'dismantle': case 'poach': {
        const t = g.players[targets[0]];
        log(g, `${p.name} 对 ${t.name} 使用了【${def.name}】。`, 'card');
        const cancelled = yield* askCounter(g, p, card, t.seat);
        if (!cancelled) yield* stealCard(g, p, t.seat, card.key === 'dismantle');
        break;
      }
      case 'duet': {
        log(g, `${p.name} 对 ${g.players[targets[0]].name} 使用了【对唱】。`, 'card');
        const cancelled = yield* askCounter(g, p, card, targets[0]);
        if (!cancelled) yield* resolveDuet(g, p, targets[0]);
        break;
      }
      case 'live': {
        log(g, `${p.name} 使用了【接唱】。`, 'card');
        const cancelled = yield* askCounter(g, p, card, null);
        if (cancelled) break;
        for (const q of aliveFrom(g, p.seat)) {
          if (q.seat === p.seat || !q.alive) continue;
          const r = yield* request(g, q.seat, {
            kind: 'slash', prompt: `【接唱】：请打出一张【微声】，否则受到 ${p.name} 造成的 1 点伤害。`,
            source: p.seat, sourceName: p.name
          }, v => {
            if (v.type === 'pass') return null;
            if (v.type === 'card') {
              const c = findInHand(q, v.cardId);
              if (!c || c.key !== 'slash') return '请选择一张【微声】';
              return null;
            }
            return '无效操作';
          });
          if (r.type === 'card') {
            const c = removeFromHand(q, r.cardId); toDiscard(g, c);
            log(g, `${q.name} 跟上了一句【微声】。`, 'muted');
          } else {
            yield* damage(g, p, q, 1, null);
          }
        }
        break;
      }
      case 'spotlight': {
        log(g, `${p.name} 使用了【聚光灯】。`, 'card');
        const cancelled = yield* askCounter(g, p, card, null);
        if (cancelled) break;
        for (const q of aliveFrom(g, p.seat)) {
          if (q.seat === p.seat || !q.alive) continue;
          const r = yield* request(g, q.seat, {
            kind: 'dodge', prompt: `【聚光灯】：请打出一张【回避】，否则受到 ${p.name} 造成的 1 点伤害。`,
            source: p.seat, sourceName: p.name
          }, v => {
            if (v.type === 'pass') return null;
            if (v.type === 'card') {
              const c = findInHand(q, v.cardId);
              if (!c || c.key !== 'dodge') return '请选择一张【回避】';
              return null;
            }
            return '无效操作';
          });
          if (r.type === 'card') {
            const c = removeFromHand(q, r.cardId); toDiscard(g, c);
            log(g, `${q.name} 闪开了聚光灯。`, 'muted');
          } else {
            yield* damage(g, p, q, 1, null);
          }
        }
        break;
      }
      default:
        log(g, `【${def.name}】没有效果。`, 'muted');
    }
    return true;
  }

  /* ---------------- 技能 ---------------- */
  const SKILL_TARGETS = {
    jikoshoukai: 'other', dokushin: 'other', butaikantoku: 'other',
    renshuu: 'self', jinkaku: 'self', haishin: 'self', ouen: 'any', futari: 'other'
  };
  const SKILL_NAME = {
    jikoshoukai: '自来熟', dokushin: '读心', butaikantoku: '舞台监督',
    renshuu: '练习', jinkaku: '人格交替', haishin: '直播', ouen: '应援', futari: '双人曲'
  };

  function skillLegal(g, p, id) {
    if (p.tf.used && p.tf.used[id]) return null;
    const kind = SKILL_TARGETS[id];
    if (!kind) return null;
    const others = alivePlayers(g).filter(q => q.seat !== p.seat);
    if (id === 'dokushin') return others.filter(q => q.hand.length > 0).map(q => q.seat);
    if (id === 'renshuu') return p.hand.length > 0 ? [] : null;
    if (id === 'jinkaku') return p.hp >= 1 ? [] : null;
    if (id === 'haishin') return p.hand.length > 0 ? [] : null;
    if (kind === 'self') return [];
    if (kind === 'any') return alivePlayers(g).map(q => q.seat);
    return others.map(q => q.seat);
  }

  function* useSkill(g, p, id, targets) {
    if (!p.tf.used) p.tf.used = {};
    p.tf.used[id] = true;
    const t = targets && targets.length ? g.players[targets[0]] : null;
    g.display = {
      kind: 'skill',
      card: { key: '__skill', name: SKILL_NAME[id] || '技能', icon: '✦', color: '#ffd166' },
      seat: p.seat, targets: (targets || []).slice()
    };

    switch (id) {
      case 'jikoshoukai': {
        log(g, `${p.name} 对 ${t.name} 发动【自来熟】。`, 'skill');
        const r = yield* request(g, t.seat, {
          kind: 'option', title: '自来熟',
          prompt: `${p.name} 对你发动【自来熟】：交给对方一张手牌，或令对方摸一张牌。`,
          options: ['交给对方一张手牌', '令对方摸一张牌']
        }, v => (v.type === 'option' && (v.index === 0 || v.index === 1)) ? null : '请选择一项');
        if (r.index === 0 && t.hand.length > 0) {
          const pick = yield* request(g, t.seat, {
            kind: 'handPick', prompt: '选择一张手牌交给对方。', hand: t.hand.map(c => c.uid), title: '自来熟'
          }, v => (v.type === 'uid' && findInHand(t, v.uid)) ? null : '请选择一张手牌');
          const c = removeFromHand(t, pick.uid);
          p.hand.push(c); sortHand(p);
          log(g, `${t.name} 交给了 ${p.name} 一张【${D.CARDS[c.key].name}】。`, 'muted');
        } else {
          drawCards(g, p, 1);
        }
        break;
      }
      case 'dokushin': {
        log(g, `${p.name} 对 ${t.name} 发动【读心】。`, 'skill');
        const r = yield* request(g, p.seat, {
          kind: 'handPick', prompt: `观看 ${t.name} 的手牌，并弃置其中一张。`,
          hand: t.hand.map(c => c.uid), peek: true, title: '读心', targetName: t.name,
          handCards: t.hand.map(c => ({ uid: c.uid, key: c.key, suit: c.suit, rank: c.rank }))
        }, v => (v.type === 'uid' && findInHand(t, v.uid)) ? null : '请选择一张手牌');
        const c = removeFromHand(t, r.uid); toDiscard(g, c);
        log(g, `${p.name} 弃置了 ${t.name} 的一张【${D.CARDS[c.key].name}】。`, 'muted');
        break;
      }
      case 'renshuu': {
        const cost = yield* request(g, p.seat, {
          kind: 'discard', prompt: '【练习】：弃置一张手牌。', count: 1, optional: false, title: '练习'
        }, v => {
          const ids = v.cardIds || [];
          if (v.type !== 'discard' || ids.length !== 1) return '请弃置一张手牌';
          return findInHand(p, ids[0]) ? null : '牌不在手中';
        });
        const c = removeFromHand(p, cost.cardIds[0]); toDiscard(g, c);
        p.tf.slashBonus = (p.tf.slashBonus || 0) + 1;
        log(g, `${p.name} 沉下心练习，下一张【微声】伤害 +1。`, 'skill');
        break;
      }
      case 'butaikantoku': {
        log(g, `${p.name} 对 ${t.name} 发动【舞台监督】。`, 'skill');
        const r = yield* request(g, t.seat, {
          kind: 'option', title: '舞台监督',
          prompt: `${p.name} 发动【舞台监督】：弃置一张牌，或令其摸两张牌。`,
          options: ['弃置自己的一张牌', '令对方摸两张牌']
        }, v => (v.type === 'option' && (v.index === 0 || v.index === 1)) ? null : '请选择一项');
        if (r.index === 0 && allCards(t).length > 0) {
          const pick = yield* request(g, t.seat, {
            kind: 'pick', prompt: '选择自己的一张牌弃置。',
            target: { seat: t.seat, handCount: t.hand.length, equips: summarizeEquips(t), judge: t.judge.map(c => c.key), self: true }
          }, v => {
            if (v.type !== 'pick') return '请选择一张牌';
            if (v.zone === 'hand') return t.hand.length ? null : '无手牌';
            if (v.zone === 'equip') return t.equips[v.slot] ? null : '无装备';
            if (v.zone === 'judge') return t.judge[v.index] ? null : '无判定牌';
            return '无效操作';
          });
          const c = takeAnyCard(g, t, pick.zone, pick.slot, pick.index);
          toDiscard(g, c);
          log(g, `${t.name} 弃置了一张【${D.CARDS[c.key].name}】。`, 'muted');
        } else {
          drawCards(g, p, 2);
        }
        break;
      }
      case 'jinkaku': {
        log(g, `${p.name} 的人格交替了。`, 'skill');
        p.hp -= 1;
        fx(g, 'damage', p.seat, '-1');
        log(g, `${p.name} 失去了 1 点体力（${Math.max(0, p.hp)}/${p.maxHp}）。`, 'damage');
        drawCards(g, p, 3);
        if (p.hp <= 0) yield* dying(g, p, null);
        break;
      }
      case 'ouen': {
        log(g, `${p.name} 对 ${t.name} 发动【应援】。`, 'skill');
        drawCards(g, t, 2);
        if (allCards(t).length > 0) {
          const r = yield* request(g, t.seat, {
            kind: 'discard', prompt: '【应援】：弃置一张牌。', count: 1, optional: false, title: '应援'
          }, v => {
            const ids = v.cardIds || [];
            if (v.type !== 'discard' || ids.length !== 1) return '请弃置一张牌';
            if (findInHand(t, ids[0])) return null;
            return '请从手牌中选择';
          });
          const c = removeFromHand(t, r.cardIds[0]); toDiscard(g, c);
        }
        break;
      }
      case 'haishin': {
        const r = yield* request(g, p.seat, {
          kind: 'handPick', prompt: '【直播】：展示一张手牌。', hand: p.hand.map(c => c.uid), peek: false, title: '直播', own: true
        }, v => (v.type === 'uid' && findInHand(p, v.uid)) ? null : '请选择一张手牌');
        const c = findInHand(p, r.uid);
        log(g, `${p.name} 在直播中展示了【${D.CARDS[c.key].name}】。`, 'skill');
        drawCards(g, p, c.key === 'slash' ? 2 : 1);
        break;
      }
      case 'futari': {
        log(g, `${p.name} 对 ${t.name} 发动【双人曲】。`, 'skill');
        drawCards(g, t, 1);
        drawCards(g, p, 1);
        break;
      }
      default:
        log(g, `技能未实现：${id}`, 'muted');
    }
    const nl = handLimit(g, p);
    if (p.hand.length > nl && !p.tf.overLimit) p.tf.overLimit = true;
  }

  /* ---------------- 回合流程 ---------------- */
  function* judgePhase(g, p) {
    if (!p.judge.length) return;
    const cards = p.judge.slice();
    for (const jc of cards) {
      if (!p.judge.includes(jc)) continue;
      p.judge.splice(p.judge.indexOf(jc), 1);
      if (!g.deck.length) {
        if (g.discard.length) { g.deck = shuffle(g.discard.splice(0), g.rng); }
      }
      const judge = g.deck.pop();
      if (!judge) break;
      log(g, `${p.name} 判定【${D.CARDS[jc.key].name}】：亮出 ${judge.suit}${judge.rankText}【${D.CARDS[judge.key].name}】`, 'judge');
      fx(g, 'judge', p.seat, judge.suit + judge.rankText);
      toDiscard(g, judge);
      toDiscard(g, jc);
      if (judge.suit !== '♥') {
        p.tf.skipPlay = true;
        log(g, `判定结果不为 ♥，${p.name} 本回合跳过出牌阶段。`, 'danger');
      } else {
        log(g, `判定结果为 ♥，【走神】未生效。`, 'muted');
      }
    }
  }

  function* turn(g, p) {
    p.tf = {};
    g.phase = '准备';
    g.turn++;
    g.round = Math.floor((g.turn - 1) / g.players.length) + 1;
    log(g, `—— 第 ${g.round} 轮 · ${p.name} 的回合 ——`, 'turn');
    fx(g, 'turn', p.seat, '回合');

    // 终幕：长时间僵持后，舞台开始消耗所有人的体力
    if (g.round >= 30) {
      p.hp -= 1;
      log(g, `终幕的疲惫：${p.name} 失去 1 点体力（${Math.max(0, p.hp)}/${p.maxHp}）。`, 'danger');
      fx(g, 'damage', p.seat, '-1');
      if (p.hp <= 0) yield* dying(g, p, null);
      if (!p.alive || g.winner) return;
    }

    g.phase = '判定';
    yield* judgePhase(g, p);

    g.phase = '采购';
    // 摸牌阶段已被拨片商店取代：每回合刷新一次随机商品，不再自动摸牌

    // 每回合：先采购，再出牌（开局那一轮已经全员采购过）
    if (p.shoppedRound !== g.round) {
      g.phase = '购买';
      if (p.picks == null) p.picks = 8;
      if (p.shopRound != null && p.shopRound !== g.round) p.picks += 3;
      p.shopRound = g.round;
      p.shoppedRound = g.round;
      g.shop = g.shop || {};
      g.shop[p.seat] = makeShop(g, p);
      if (hasEquip(p, 'pickbox')) p.picks += 1;
      if (hasSkill(p, 'pickfan')) p.picks += 1;
      for (;;) {
        const r = yield* request(g, p.seat, {
          kind: 'shop', prompt: '购买阶段：用吉他拨片买牌，买完后进入出牌。',
          picks: p.picks, shop: g.shop[p.seat].items
        }, resp => {
          if (resp.type === 'done' || resp.type === 'end') return null;
          if (resp.type === 'buy') {
            const it = g.shop[p.seat] && g.shop[p.seat].items[resp.index];
            if (!it) return '没有这个商品';
            if (p.picks < it.cost) return '吉他拨片不够';
            return null;
          }
          return '无效操作';
        });
        if (r.type !== 'buy') break;
        const it = g.shop[p.seat].items[r.index];
        if (!it) break;
        p.picks -= it.cost;
        const c = { uid: 'c' + (++g.uid), key: it.key, suit: D.SUITS[Math.floor(g.rng() * 4)], rank: 1 + Math.floor(g.rng() * 13) };
        c.rankText = D.RANK_TEXT[c.rank];
        p.hand.push(c); sortHand(p);
        g.shop[p.seat].items[r.index] = null;
        log(g, `${p.name} 用 ${it.cost} 点吉他拨片买下了【${D.CARDS[it.key].name}】（剩余 ${p.picks}）。`, 'card');
        fx(g, 'trick', p.seat, '拨片');
      }
      g.shop = {};
    }

    g.phase = '出牌';
    if (p.tf.skipPlay) {
      log(g, `${p.name} 走神了，跳过出牌阶段。`, 'muted');
    } else {
      yield* playPhase(g, p);
    }
    if (g.winner) return;

    g.phase = '弃牌';
    const limit = handLimit(g, p);
    const excess = p.hand.length - limit;
    if (excess > 0) {
      const r = yield* request(g, p.seat, {
        kind: 'discard', prompt: `弃牌阶段：手牌上限 ${limit}，请弃置 ${excess} 张手牌。`,
        count: excess, optional: false, title: '弃牌'
      }, v => {
        const ids = (v.cardIds || []).slice();
        if (v.type !== 'discard') return '请选择要弃置的牌';
        if (ids.length !== excess) return `请弃置 ${excess} 张牌`;
        if (new Set(ids).size !== ids.length) return '有重复的牌';
        return ids.every(id => findInHand(p, id)) ? null : '牌不在手中';
      });
      r.cardIds.forEach(id => { const c = removeFromHand(p, id); toDiscard(g, c); });
      log(g, `${p.name} 弃置了 ${excess} 张手牌。`, 'muted');
    }

    g.phase = '结束';
  }

  /* ---------------- 吉他拨片商店 ---------------- */
  const SHOP_POOL = ['slash', 'dodge', 'matcha', 'inspire', 'dismantle', 'duet', 'counter', 'absent', 'guitar', 'bass', 'drums', 'earpiece', 'lightstick', 'capo', 'pedal', 'tune', 'retake', 'encore', 'swap', 'thunder'];
  const SHOP_COST = [2, 3, 4];
  const SHOP_SIZE = 5;
  const SHOP_COST_TABLE = [1, 1, 1, 2, 2, 3]; // 便宜货多，偶尔出好货
  function makeShop(g, p) {
    const pool = SHOP_POOL.slice();
    const items = [];
    const disc = (hasEquip(p, 'pickguitar') || hasEquip(p, 'pickbelt') || hasSkill(p, 'pickinstinct')) ? 1 : 0;
    for (let i = 0; i < SHOP_SIZE + (p.shopBonus || 0); i++) {
      const idx = Math.floor(g.rng() * pool.length);
      const key = pool.splice(idx, 1)[0];
      if (!key) break;
      const base = SHOP_COST_TABLE[Math.floor(g.rng() * SHOP_COST_TABLE.length)];
      items.push({ key, cost: Math.max(1, base - disc) });
    }
    return { round: g.round, items };
  }

  function* playPhase(g, p) {
    // 拨片：初始 8 点，每轮补充 2 点
    if (p.picks == null) p.picks = 8;
    if (p.shopRound == null) p.shopRound = g.round;
    else if (p.shopRound !== g.round) {
      p.picks += 3;
      p.shopRound = g.round;
      log(g, `${p.name} 补充了 2 点吉他拨片（${p.picks}）。`, 'muted');
    }
    g.shop = g.shop || {};
    // 商店已在购买阶段生成，这里只保证存在

    for (;;) {
      const ask = { kind: 'play', prompt: '出牌阶段：使用一张牌 / 发动技能 / 购买卡牌 / 结束回合' };
      const r = yield* request(g, p.seat, ask, resp => {
        if (resp.type === 'end') return null;
        if (resp.type === 'card') {
          const c = findInHand(p, resp.cardId);
          if (!c) return '牌不在手中';
          const def = D.CARDS[c.key];
          if (c.key === 'dodge' || c.key === 'counter') return `【${def.name}】只能用于响应`;
          const legal = legalCardTargets(g, p, c);
          if (legal === null) return `现在不能使用【${def.name}】`;
          if (def.type === 'equip') return null;
          const tg = resp.targets || [];
          if (legal.length === 0 && tg.length === 0) return null;
          if (legal.length > 0 && !tg.length) return '请选择目标';
          if (tg.length !== 1) return '请选择 1 个目标';
          if (!legal.includes(tg[0])) return '目标不合法';
          return null;
        }
        if (resp.type === 'skill') {
          const id = resp.skillId;
          if (!SKILL_TARGETS[id]) return '该技能不能主动发动';
          const legal = skillLegal(g, p, id);
          if (legal === null) return '本回合已发动过';
          const tg = resp.targets || [];
          if (legal.length === 0) {
            if (tg.length) return '该技能不需要目标';
            return null;
          }
          if (tg.length !== 1) return '请选择 1 个目标';
          if (!legal.includes(tg[0])) return '目标不合法';
          return null;
        }
        return '无效操作';
      });
      if (r.type === 'end') break;
      if (r.type === 'card') {
        yield* useCard(g, p, r.cardId, r.targets || []);
      } else if (r.type === 'skill') {
        yield* useSkill(g, p, r.skillId, r.targets || []);
      }
      if (g.winner) break;
    }
  }


  function* shopRound(g) {
    g.phase = '购买';
    g.shop = {};
    for (const p of g.players) {
      if (!p.alive) continue;
      if (p.picks == null) p.picks = 8;
      if (p.shopRound != null && p.shopRound !== g.round) p.picks += 3;
      p.shopRound = g.round;
      p.shoppedRound = g.round;
      g.shop[p.seat] = makeShop(g, p);
      if (hasEquip(p, 'pickbox')) p.picks += 1;
      if (hasSkill(p, 'pickfan')) p.picks += 1;
      for (;;) {
        const r = yield* request(g, p.seat, {
          kind: 'shop', prompt: '购买阶段：用吉他拨片买牌，买完后开始出牌。',
          picks: p.picks, shop: g.shop[p.seat].items
        }, resp => {
          if (resp.type === 'done' || resp.type === 'end') return null;
          if (resp.type === 'buy') {
            const it = g.shop[p.seat] && g.shop[p.seat].items[resp.index];
            if (!it) return '没有这个商品';
            if (p.picks < it.cost) return '吉他拨片不够';
            return null;
          }
          return '无效操作';
        });
        if (r.type !== 'buy') break;
        const it = g.shop[p.seat].items[r.index];
        if (!it) break;
        p.picks -= it.cost;
        const c = { uid: 'c' + (++g.uid), key: it.key, suit: D.SUITS[Math.floor(g.rng() * 4)], rank: 1 + Math.floor(g.rng() * 13) };
        c.rankText = D.RANK_TEXT[c.rank];
        p.hand.push(c); sortHand(p);
        g.shop[p.seat].items[r.index] = null;
        log(g, `${p.name} 用 ${it.cost} 点吉他拨片买下了【${D.CARDS[it.key].name}】（剩余 ${p.picks}）。`, 'card');
        fx(g, 'trick', p.seat, '拨片');
      }
    }
    g.shop = {};
  }

  function* mainFlow(g) {
    let guard = 0;
    yield* shopRound(g);
    if (g.winner) return;
    while (!g.winner && guard++ < 4000) {
      const p = g.players[g.current];
      if (!p.alive) { g.current = nextAlive(g, g.current); continue; }
      yield* turn(g, p);
      if (g.winner) break;
      g.current = nextAlive(g, g.current);
    }
    if (g.winner) {
      log(g, g.winner.text, 'head');
      g.phase = '结束';
    } else {
      g.aborted = true;
      log(g, '对局超时，已强制结束。', 'danger');
    }
  }

  /* ---------------- 动作合法性（客户端预判） ---------------- */
  function playOptions(g, seat) {
    const p = g.players[seat];
    const out = { cards: {}, skills: {}, end: true };
    if (!p || !p.alive) return out;
    for (const c of p.hand) {
      if (c.key === 'dodge' || c.key === 'counter') continue;
      const tg = legalCardTargets(g, p, c);
      if (tg === null) continue;
      out.cards[c.uid] = tg;
    }
    for (const id of Object.keys(SKILL_TARGETS)) {
      if (!hasSkill(p, id)) continue;
      const tg = skillLegal(g, p, id);
      if (tg === null) continue;
      out.skills[id] = tg;
    }
    return out;
  }

  /* ---------------- 视图投影 ---------------- */
  function view(g, seat) {
    const me = g.players[seat];
    const players = g.players.map(p => ({
      seat: p.seat, id: p.id, name: p.name,
      charId: p.charId, charName: p.charName,
      band: D.getChar(p.charId).band,
      hp: Math.max(0, p.hp), maxHp: p.maxHp,
      handCount: p.hand.length,
      picks: p.picks || 0,
      equips: summarizeEquips(p),
      judge: p.judge.map(c => ({ key: c.key, name: D.CARDS[c.key].name, icon: D.CARDS[c.key].icon })),
      identity: (p.revealed || p.seat === seat) ? p.identity : null,
      identityKnown: p.revealed || p.seat === seat,
      alive: p.alive, isAI: p.isAI,
      tf: p.tf, pf: p.pf,
      charSkills: D.getChar(p.charId).skills.map(s => ({ id: s.id, name: s.name, type: s.type, desc: s.desc }))
    }));
    let pending = null;
    if (g.pending) {
      const a = g.pending;
      if (a.seat === seat) {
        pending = JSON.parse(JSON.stringify(a));
      } else {
        pending = { kind: a.kind, seat: a.seat, playerName: a.playerName, prompt: a.prompt, target: a.target != null ? a.target : null };
      }
    }
    return {
      seat, players,
      hand: me ? me.hand.map(c => ({ uid: c.uid, key: c.key, suit: c.suit, rank: c.rank, rankText: c.rankText })) : [],
      mePicks: me ? (me.picks || 0) : 0,
      shop: (me && g.shop && g.shop[seat] && g.shop[seat].round === g.round)
        ? g.shop[seat].items.map((it, i) => it ? { i, key: it.key, cost: it.cost } : null).filter(Boolean) : [],
      turn: g.turn, round: g.round, phase: g.phase, current: g.current,
      deckCount: g.deck.length, discardCount: g.discard.length,
      discardTop: g.discard.length ? g.discard[g.discard.length - 1].key : null,
      display: g.display,
      winner: g.winner, aborted: g.aborted,
      log: g.log.slice(-80), effects: g.effects.slice(-16),
      pending,
      options: pending && pending.kind === 'play' ? playOptions(g, seat) : null,
      handLimit: me ? handLimit(g, me) : 0,
      attackRange: me ? attackRange(g, me) : 0,
      seed: g.seed
    };
  }

  /* ---------------- 驱动 ---------------- */
  class Game {
    constructor(cfg) {
      this.g = createGame(cfg);
      this.gen = null;
      this.finished = false;
      this.steps = 0;
    }
    start() {
      this.gen = mainFlow(this.g);
      this._advance(undefined);
      return this;
    }
    _advance(resp) {
      if (!this.gen || this.finished) return;
      this.steps++;
      if (this.steps > 40000) {
        this.g.aborted = true; this.finished = true;
        log(this.g, '对局步数超限，强制结束。', 'danger');
        return;
      }
      let r;
      try {
        r = this.gen.next(resp);
      } catch (e) {
        console.error('[engine] 运行错误', e);
        this.g.aborted = true;
        this.finished = true;
        this.g.error = String(e && e.stack || e);
        return;
      }
      if (r.done) { this.finished = true; this.g.pending = null; return; }
      this.pending = r.value;
    }
    get pending() { return this.g.pending; }
    set pending(v) { /* noop, engine manages */ }
    /** 玩家或 AI 提交响应 */
    act(resp) {
      if (this.finished) return false;
      this._advance(resp);
      return true;
    }
    /** AI 连续行动，直到轮到人类或结束。返回值：是否已结束 */
    pumpAI(makeResponse, maxSteps) {
      let n = 0;
      const limit = maxSteps || 300;
      while (!this.finished && this.pending && n++ < limit) {
        const seat = this.pending.seat;
        const p = this.g.players[seat];
        if (!p || !p.isAI) break;
        const resp = makeResponse(this, this.pending);
        this._advance(resp);
      }
      return this.finished;
    }
  }

  /* ---------------- 身份 / 选角分配 ---------------- */
  function assignIdentities(playerIds, prefs, rng) {
    rng = rng || Math.random;
    const slots = D.FIVE_PLAYER_SETUP.slice();
    const order = playerIds.slice();
    shuffle(order, rng);
    const out = {};
    // 先满足志愿
    for (const id of order) {
      const list = prefs && prefs[id] ? prefs[id] : [];
      for (const want of list) {
        const i = slots.indexOf(want);
        if (i >= 0) { out[id] = want; slots.splice(i, 1); break; }
      }
    }
    for (const id of playerIds) {
      if (!out[id]) out[id] = slots.splice(Math.floor(rng() * slots.length), 1)[0];
    }
    return out;
  }

  return {
    Game, createGame, view, playOptions, legalCardTargets, skillLegal,
    distance, attackRange, handLimit, alivePlayers, nextAlive, inRange,
    assignIdentities, SLOTS, SLOT_NAME,
    CARD_DEF: D.CARDS
  };
});

