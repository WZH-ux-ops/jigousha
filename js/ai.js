/* =========================================================
 *  鸡狗杀 · AI
 *  只使用「该角色可见的信息」做决策：自己的身份、公开的身份、
 *  手牌数量、装备、弃牌与伤害历史。
 * ========================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.JGSAI = factory(root.JGSData);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D) {
  'use strict';

  const SLOT_PRIORITY = { weapon: 5, armor: 4, defhorse: 2, offhorse: 2 };

  const DUP_PENALTY = { dodge: 10, counter: 12, slash: 5, matcha: 8, inspire: 6 };

  function cardValue(c, owner) {
    if (c.key === 'matcha') {
      if (!owner) return 60;
      if (owner.hp <= owner.maxHp - 2) return 100;
      return owner.hp < owner.maxHp ? 74 : 20;
    }
    const v = {
      slash: 70, dodge: 62, counter: 64, inspire: 50,
      poach: 42, dismantle: 36, duet: 30, absent: 30, live: 26, spotlight: 26, camp: 22,
      guitar: 55, bass: 60, drums: 52, earpiece: 48, lightstick: 56, bike: 30, tourbus: 34,
      capo: 58, pedal: 62, tune: 80, retake: 40
    };
    return v[c.key] != null ? v[c.key] : 20;
  }

  function worstCards(p, n) {
    const counts = {};
    const scored = p.hand.map(c => {
      counts[c.key] = (counts[c.key] || 0) + 1;
      const dup = (counts[c.key] - 1) * (DUP_PENALTY[c.key] || 4);
      return { c, v: cardValue(c, p) - dup };
    });
    scored.sort((a, b) => a.v - b.v);
    return scored.slice(0, n).map(x => x.c.uid);
  }

  function knowsId(ai, p) {
    return p.seat === ai.seat || p.revealed || p.identity === 'producer';
  }

  function hostility(g, fromSeat, toSeat) {
    if (!g.hitLog) return 0;
    let n = 0;
    for (const h of g.hitLog) {
      if (h.src !== fromSeat || h.tgt !== toSeat) continue;
      n += (g.turn - h.turn <= 12) ? 1.6 : 1;
    }
    return n;
  }

  /* 该角色对 AI 的敌意评分（越高越该打） */
  function enemyScore(g, ai, seat) {
    if (seat === ai.seat) return -999;
    const t = g.players[seat];
    if (!t.alive) return -999;
    let s = 6;
    const known = knowsId(ai, t) ? t.identity : null;
    const crew = ai.identity === 'producer' || ai.identity === 'costar';

    if (known === 'wrecker') s += 100;
    if (known === 'soloist') s += 55;
    if (known === 'costar' && ai.identity !== 'costar') s -= 70;
    if (known === 'producer' && ai.identity !== 'producer') s -= 90;

    if (crew) {
      const producer = g.players.find(p => p.identity === 'producer');
      s += hostility(g, seat, producer.seat) * 6;
      if (ai.identity === 'costar') s += hostility(g, seat, ai.seat) * 4;
      s += hostility(g, seat, ai.seat) * 2;
      // 攻击过已知拆团者的人更可能是同伴
      g.players.forEach(w => {
        if (w.seat !== seat && w.revealed && w.identity === 'wrecker') {
          s -= hostility(g, seat, w.seat) * 2;
        }
      });
    } else if (ai.identity === 'wrecker') {
      if (t.identity === 'producer') s += 120;
      if (t.identity === 'costar') s += 60;
      s += hostility(g, seat, ai.seat) * 4;
      if (known === 'wrecker') s -= 80;
    } else if (ai.identity === 'soloist') {
      const alive = g.players.filter(p => p.alive).length;
      if (t.identity === 'producer') s += alive <= 2 ? 110 : 2;
      if (known === 'wrecker' || known === 'costar') s += 12;
      s += hostility(g, seat, ai.seat) * 5;
      s -= t.hp * 1.5;
    }
    return s;
  }

  function bestTarget(g, ai, seats, opts) {
    opts = opts || {};
    let best = null, bestScore = -1e9;
    for (const seat of seats) {
      const t = g.players[seat];
      if (!t.alive) continue;
      if (t.seat === ai.seat) continue;
      let s = enemyScore(g, ai, seat);
      if (s < 0) continue; // 明确的同伴不打
      s -= t.hp * (opts.lowHp ? 6 : 2.2);
      s -= t.hand.length * (opts.stripHand ? 1.4 : 0.4);
      if (opts.preferEquip && Object.keys(t.equips).length) s += 6;
      if (opts.finish && t.hp <= (opts.finish)) s += 40;
      s += seat * 0.01;
      if (s > bestScore) { bestScore = s; best = seat; }
    }
    return best;
  }

  function producerOf(g) { return g.players.find(p => p.identity === 'producer'); }
  function equipValue(t) {
    let v = 0;
    if (t.equips.weapon) v += 2;
    if (t.equips.armor) v += 3;
    if (t.equips.defhorse) v += 1;
    if (t.equips.offhorse) v += 1;
    return v;
  }
  function slashImmune(t) { return !!(t.equips.armor && t.equips.armor.key === 'earpiece' && t.hand.length === 0); }
  function shieldReady(t) { return !!(t.equips.armor && t.equips.armor.key === 'lightstick' && !t.tf.lightstickUsed); }

  function aliveAllies(g, ai, seat) {
    const t = g.players[seat];
    const known = knowsId(ai, t) ? t.identity : null;
    if (ai.identity === 'producer' || ai.identity === 'costar') {
      return known === 'producer' || known === 'costar';
    }
    if (ai.identity === 'wrecker') return known === 'wrecker';
    if (ai.identity === 'soloist') return false;
    return false;
  }

  /* ---------------- 出牌阶段 ---------------- */
  function playActions(g, ai) {
    const p = ai;
    const opts = [];
    const hand = p.hand;
    const limit = p.tf.used || {};
    const has = k => hand.filter(c => c.key === k);
    const selfHurt = p.hp < p.maxHp;
    const others = g.players.filter(q => q.alive && q.seat !== p.seat);
    const enemies = others.filter(q => enemyScore(g, ai, q.seat) > 25);
    const friends = others.filter(q => aliveAllies(g, ai, q.seat));
    const producer = producerOf(g);
    const amWrecker = p.identity === 'wrecker';
    const bonus = p.tf.slashBonus || 0;

    // 1. 回血
    if (selfHurt && has('matcha').length) opts.push({ w: 96, a: { type: 'card', cardId: has('matcha')[0].uid, targets: [] } });

    // 2. 装备（优先补空位 / 换更长武器）
    for (const c of hand) {
      const def = D.CARDS[c.key];
      if (def.type !== 'equip') continue;
      const cur = p.equips[def.sub];
      const better = !cur || (def.sub === 'weapon' && (def.range || 1) > (D.CARDS[cur.key].range || 1));
      if (better) opts.push({ w: 60 + SLOT_PRIORITY[def.sub], a: { type: 'card', cardId: c.uid, targets: [] } });
    }

    // 3. 灵感
    for (const c of has('inspire')) opts.push({ w: 90, a: { type: 'card', cardId: c.uid, targets: [] } });

    // 3.5 吉他拨片商店：买得起且有用就买
    if (g.shop && g.shop[p.seat] && (p.picks || 0) > 0) {
      g.shop[p.seat].items.forEach((it, i) => {
        if (!it || (p.picks || 0) < it.cost) return;
        const v = cardValue({ key: it.key }, p);
        if (v >= 40) opts.push({ w: 48 + v / 3, a: { type: 'buy', index: i } });
      });
    }

    for (const c of has('tune')) opts.push({ w: 86, a: { type: 'card', cardId: c.uid, targets: [] } });
    if (has('retake').length && g.discard.some(c => c.key === 'slash' || c.key === 'dodge')) {
      opts.push({ w: 52, a: { type: 'card', cardId: has('retake')[0].uid, targets: [] } });
    }

    // 3.5 新卡：安可 / 雷鸣 / 换幕
    if (has('encore').length && has('slash').length && others.length) {
      opts.push({ w: 88, a: { type: 'card', cardId: has('encore')[0].uid, targets: [] } });
    }
    for (const c of has('thunder')) {
      const t = (enemies.length ? enemies : others)[0];
      if (t) opts.push({ w: t.hand.length === 0 ? 92 : 64, a: { type: 'card', cardId: c.uid, targets: [t.seat] } });
    }
    for (const c of has('swap')) {
      const t = (enemies.length ? enemies : others).filter(q => q.hand.length > 0)[0];
      if (t && p.hand.length > 1) opts.push({ w: 46, a: { type: 'card', cardId: c.uid, targets: [t.seat] } });
    }

    // 4. 群体牌
    if (has('camp').length) {
      const healFriends = (p.maxHp - p.hp) + friends.reduce((a, f) => a + (f.maxHp - f.hp), 0);
      const healEnemies = enemies.reduce((a, e) => a + (e.maxHp - e.hp), 0);
      if (healFriends >= 2 && healFriends > healEnemies + 1) {
        opts.push({ w: 68, a: { type: 'card', cardId: has('camp')[0].uid, targets: [] } });
      }
    }
    if (enemies.length >= 2) {
      const noDodge = enemies.filter(e => e.hand.length === 0).length;
      for (const c of has('live')) opts.push({ w: 62 + noDodge * 4, a: { type: 'card', cardId: c.uid, targets: [] } });
      for (const c of has('spotlight')) opts.push({ w: 64 + noDodge * 4, a: { type: 'card', cardId: c.uid, targets: [] } });
    }

    // 5. 拆台 / 挖角：优先拆威胁大的对手的装备与防御
    for (const key of ['dismantle', 'poach']) {
      for (const c of has(key)) {
        const cand = others.filter(q =>
          (Object.keys(q.equips).length || q.hand.length) &&
          (key !== 'poach' || inRangeOne(g, p.seat, q.seat)) &&
          !hasSkill(q, 'mugon')
        ).map(q => q.seat);
        let best = null, bestV = -1e9;
        for (const s of cand) {
          const q = g.players[s];
          let v = enemyScore(g, ai, s) * 0.6 + equipValue(q) * 8 - q.hand.length * 0.6;
          if (slashImmune(q) || shieldReady(q)) v += 12;
          if (amWrecker && producer && q.seat === producer.seat) v += 28;
          if (v > bestV) { bestV = v; best = s; }
        }
        if (best != null) {
          opts.push({ w: key === 'poach' ? 66 : 60, a: { type: 'card', cardId: c.uid, targets: [best] } });
        }
      }
    }

    // 6. 对唱：挑手牌少、血少的
    for (const c of has('duet')) {
      let best = null, bestV = -1e9, weak = false;
      for (const s of enemies.map(q => q.seat)) {
        const q = g.players[s];
        let v = enemyScore(g, ai, s) - q.hp * 7 - q.hand.length * 9;
        if (q.hp <= 2) v += 8;
        if (v > bestV) { bestV = v; best = s; weak = q.hand.length <= 1; }
      }
      if (best != null) opts.push({ w: weak ? 82 : 66 - p.hp * 2, a: { type: 'card', cardId: c.uid, targets: [best] } });
    }

    // 7. 走神
    for (const c of has('absent')) {
      let best = null, bestV = -1e9;
      for (const s of enemies.map(q => q.seat)) {
        const q = g.players[s];
        let v = enemyScore(g, ai, s) - q.hand.length * 0.5;
        if (amWrecker && producer && q.seat === producer.seat) v += 45;
        if (v > bestV) { bestV = v; best = s; }
      }
      if (best != null) opts.push({ w: 52, a: { type: 'card', cardId: c.uid, targets: [best] } });
    }

    // 8. 技能
    if (!limit.jikoshoukai && hasSkill(p, 'jikoshoukai')) {
      const t = bestTarget(g, ai, others.map(q => q.seat), { stripHand: true });
      if (t != null) opts.push({ w: 50, a: { type: 'skill', skillId: 'jikoshoukai', targets: [t] } });
    }
    if (!limit.dokushin && hasSkill(p, 'dokushin')) {
      const cand = enemies.filter(q => q.hand.length >= 2).map(q => q.seat)
        .sort((a, b) => g.players[b].hand.length - g.players[a].hand.length);
      if (cand.length) opts.push({ w: 72, a: { type: 'skill', skillId: 'dokushin', targets: [cand[0]] } });
    }
    if (!limit.butaikantoku && hasSkill(p, 'butaikantoku')) {
      let cand = enemies.map(q => q.seat);
      if (amWrecker && producer && producer.alive && producer.seat !== p.seat) cand.unshift(producer.seat);
      const t = bestTarget(g, ai, cand, { stripHand: true });
      if (t != null) opts.push({ w: 62, a: { type: 'skill', skillId: 'butaikantoku', targets: [t] } });
    }
    if (!limit.renshuu && hasSkill(p, 'renshuu') && p.hand.length >= 2 && has('slash').length) {
      const tg = g.players.filter(q => q.alive && q.seat !== p.seat && inRange(g, p.seat, q.seat) && !slashImmune(q));
      if (tg.length) opts.push({ w: 84, a: { type: 'skill', skillId: 'renshuu', targets: [] } });
    }
    if (!limit.jinkaku && hasSkill(p, 'jinkaku') && p.hp >= 3 && p.hand.length < 4) {
      opts.push({ w: 46, a: { type: 'skill', skillId: 'jinkaku', targets: [] } });
    }
    if (!limit.ouen && hasSkill(p, 'ouen')) {
      let t = p.seat, bestDef = 0;
      for (const f of friends) { const d = f.maxHp - f.hp; if (d > bestDef) { bestDef = d; t = f.seat; } }
      if (bestDef === 0 && p.maxHp - p.hp > 0) t = p.seat;
      opts.push({ w: bestDef > 0 ? 62 : 24, a: { type: 'skill', skillId: 'ouen', targets: [t] } });
    }
    if (!limit.haishin && hasSkill(p, 'haishin') && p.hand.length >= 2) {
      opts.push({ w: has('slash').length ? 42 : 22, a: { type: 'skill', skillId: 'haishin', targets: [] } });
    }
    if (!limit.futari && hasSkill(p, 'futari') && friends.length) {
      const t = friends.slice().sort((a, b) => (b.maxHp - b.hp) - (a.maxHp - a.hp))[0].seat;
      opts.push({ w: 34, a: { type: 'skill', skillId: 'futari', targets: [t] } });
    }

    // 9. 微声
    if ((p.tf.slashUsed || 0) < 1) {
      for (const c of has('slash')) {
        const tg = g.players.filter(q =>
          q.alive && q.seat !== p.seat && inRange(g, p.seat, q.seat) && !slashImmune(q)
        ).map(q => q.seat);
        let best = null, bestV = -1e9;
        for (const s of tg) {
          const q = g.players[s];
          const base = enemyScore(g, ai, s);
          if (base < 0) continue;
          const dmg = 1 + bonus;
          let v = base;
          if (q.hp <= dmg) v += 32;        // 可以斩杀
          if (shieldReady(q)) v -= 12;      // 第一刀会被应援棒挡下
          if (q.hand.length === 0) v += 10; // 大概率没有回避
          v -= q.hp * 2.2 + q.hand.length * 0.8;
          if (v > bestV) { bestV = v; best = s; }
        }
        if (best != null) opts.push({ w: 78 + (bonus ? 10 : 0), a: { type: 'card', cardId: c.uid, targets: [best] } });
      }
    }

    return opts;
  }

  function inRangeOne(g, a, b) { return distOne(g, a, b) <= 1; }
  function distOne(g, a, b) {
    if (g.round >= 20) return 1;
    if (g.players.filter(p => p.alive).length <= 2) return 1;
    const from = g.players[a], to = g.players[b];
    const n = g.players.length;
    let d = Math.min(Math.abs(a - b), n - Math.abs(a - b));
    if (to.equips.defhorse) d += 1;
    if (from.equips.offhorse) d -= 1;
    if (to.hand.length === 0 && hasSkill(to, 'maigo')) d += 1;
    return Math.max(1, d);
  }
  function inRange(g, a, b) {
    const from = g.players[a];
    if (hasSkill(from, 'noraneko')) return true;
    const w = from.equips.weapon;
    const range = w ? (D.CARDS[w.key].range || 1) : 1;
    return distOne(g, a, b) <= range;
  }
  function hasSkill(p, id) {
    const ch = D.getChar(p.charId);
    if (ch.skills.some(s => s.id === id)) return true;
    const idn = D.IDENTITIES[p.identity];
    return !!(idn && idn.skill && idn.skill.id === id);
  }

  /* ---------------- 响应 ---------------- */
  function respond(game, ask) {
    const g = game.g || game;
    const p = g.players[ask.seat];
    if (!p) return { type: 'pass' };
    // 安全网：上一次交出的操作被引擎拒绝，退回到最保守的行为，避免死循环
    if (ask.error) {
      if (ask.kind === 'play') return { type: 'end' };
      if (ask.kind === 'discard') return { type: 'discard', cardIds: worstCards(p, Math.min(ask.count || 1, p.hand.length)) };
      if (ask.kind === 'pick') return { type: 'pick', zone: 'hand' };
      if (ask.kind === 'option') return { type: 'option', index: 1 };
      return { type: 'pass' };
    }

    switch (ask.kind) {
      case 'play': {
        const opts = playActions(g, p).sort((a, b) => b.w - a.w);
        // 简单前瞻：低收益动作不强行做
        for (const o of opts) {
          if (o.w >= 28) return o.a;
        }
        return { type: 'end' };
      }
      case 'dodge': {
        const c = p.hand.find(x => x.key === 'dodge');
        if (!c) return { type: 'pass' };
        return { type: 'card', cardId: c.uid };
      }
      case 'slash': {
        const c = p.hand.find(x => x.key === 'slash');
        if (!c) return { type: 'pass' };
        // 若是接唱，且自己血厚、牌少时可硬吃
        if (ask.source != null && p.hp > 2 && p.hand.length <= 2) return { type: 'pass' };
        return { type: 'card', cardId: c.uid };
      }
      case 'rescue': {
        const target = g.players[ask.target];
        const isSelf = target.seat === p.seat;
        const ally = !isSelf && aliveAllies(g, { identity: p.identity, seat: p.seat }, target.seat);
        if (ask.canMatcha) {
          if (isSelf) return { type: 'card', cardId: p.hand.find(c => c.key === 'matcha').uid };
          if (ally && (target.identity === 'producer' || p.hand.filter(c => c.key === 'matcha').length > 1)) {
            return { type: 'card', cardId: p.hand.find(c => c.key === 'matcha').uid };
          }
          if (p.identity === 'soloist' && !isSelf) {
            const alive = g.players.filter(x => x.alive).length;
            if (alive <= 3 && target.identity !== 'producer') {
              return { type: 'card', cardId: p.hand.find(c => c.key === 'matcha').uid };
            }
          }
        }
        if (ask.canSoyo && (isSelf || ally)) {
          return { type: 'skill', skillId: 'akiramenai', cardIds: worstCards(p, 1) };
        }
        return { type: 'pass' };
      }
      case 'counter': {
        const c = p.hand.find(x => x.key === 'counter');
        if (!c) return { type: 'pass' };
        if (ask.seat === p.seat) return { type: 'pass' };
        if (ask.cancelled) return { type: 'pass' };
        const targetSeat = ask.target != null ? ask.target : null;
        const selfVictim = targetSeat === p.seat;
        const allyVictim = targetSeat != null && aliveAllies(g, p, targetSeat);
        const name = ask.cardName;
        let worth = 0;
        if (name === '拆台' || name === '挖角') worth = selfVictim ? 3 : (allyVictim ? 2 : 0);
        if (name === '对唱') worth = selfVictim ? (p.hp <= 2 ? 4 : 2) : 0;
        if (name === '走神') worth = selfVictim ? 3 : (allyVictim ? 1 : 0);
        if (name === '接唱') worth = p.hand.some(x => x.key === 'slash') ? 1 : (p.hp <= 2 ? 4 : 2);
        if (name === '聚光灯') worth = p.hand.some(x => x.key === 'dodge') ? 1 : (p.hp <= 2 ? 4 : 2);
        if (name === '灵感') worth = 1;
        if (name === '合宿') worth = 0;
        if (worth >= 2 || (worth >= 1 && p.hand.length >= 4)) return { type: 'card', cardId: c.uid };
        return { type: 'pass' };
      }
      case 'pick': {
        const tz = ask.target;
        const me = p;
        const selfPick = tz.seat === p.seat;
        const target = g.players[tz.seat];
        if (selfPick) {
          // 弃置自己最差的牌
          const slots = Object.keys(target.equips);
          if (target.hand.length && !slots.length) return { type: 'pick', zone: 'hand' };
          if (target.hand.length > 3) return { type: 'pick', zone: 'hand' };
          if (slots.length) {
            const worst = slots.sort((a, b) => (SLOT_PRIORITY[a] || 0) - (SLOT_PRIORITY[b] || 0))[0];
            return { type: 'pick', zone: 'equip', slot: worst };
          }
          return { type: 'pick', zone: 'hand' };
        }
        const slots = Object.keys(tz.equips || {});
        // 优先拆武器 / 防具
        if (slots.length) {
          const want = slots.includes('armor') ? 'armor' : (slots.includes('weapon') ? 'weapon' : slots[0]);
          return { type: 'pick', zone: 'equip', slot: want };
        }
        if (tz.judge && tz.judge.length) return { type: 'pick', zone: 'judge', index: 0 };
        return { type: 'pick', zone: 'hand' };
      }
      case 'option': {
        if (ask.title === '自来熟') {
          return { type: 'option', index: p.hand.length > 0 ? 0 : 1 };
        }
        if (ask.title === '舞台监督') {
          const hasCard = p.hand.length > 0 || Object.keys(p.equips).length > 0;
          return { type: 'option', index: hasCard ? 0 : 1 };
        }
        return { type: 'option', index: 0 };
      }
      case 'discard': {
        const n = ask.count || 1;
        return { type: 'discard', cardIds: worstCards(p, n) };
      }
      case 'handPick': {
        if (ask.own) {
          // 直播：优先展示【微声】以多摸一张
          const s = p.hand.find(c => c.key === 'slash');
          return { type: 'uid', uid: (s || p.hand[0]).uid };
        }
        if (ask.peek) {
          // 读心：弃置对方最有价值的牌
          const list = ask.handCards || [];
          const best = list.slice().sort((a, b) => cardValue(b) - cardValue(a))[0];
          if (best) return { type: 'uid', uid: best.uid };
        }
        return { type: 'uid', uid: worstCards(p, 1)[0] };
      }
      case 'chooseSeat': {
        const seats = ask.seats || [];
        // 春日影：优先给自己或最需要牌的同伴
        let best = p.seat, bestScore = -1e9;
        for (const s of seats) {
          const q = g.players[s];
          let sc = 0;
          if (s === p.seat) sc += 3;
          if (aliveAllies(g, p, s)) sc += 2;
          sc += (q.maxHp - q.hp) * 2 - q.hand.length * 0.5;
          if (sc > bestScore) { bestScore = sc; best = s; }
        }
        return { type: 'seat', seat: best };
      }
      case 'skillPrompt': {
        return decideSkill(g, p, ask);
      }
      default:
        return { type: 'pass' };
    }
  }

  function decideSkill(g, p, ask) {
    const id = ask.skillId;
    const yes = () => ({ type: 'yes' });
    const no = () => ({ type: 'pass' });
    switch (id) {
      case 'wasei': {
        const producer = ask.target != null ? g.players[ask.target] : null;
        const dmg = ask.amount || 1;
        if (!producer || p.hand.length === 0) return no();
        if (p.hp - dmg <= 0) return no();          // 自己会倒
        if (producer.hp - dmg <= 0) return { type: 'discard', cardIds: worstCards(p, 1) }; // 保制作人
        if (p.hp <= 2) return no();
        return { type: 'discard', cardIds: worstCards(p, 1) };
      }
      case 'reisei': {
        const dmg = ask.amount || 1;
        if (p.hand.length === 0) return no();
        if (p.hp <= 2 || dmg >= 2 || p.hand.length >= 3) return { type: 'discard', cardIds: worstCards(p, 1) };
        return no();
      }
      case 'haruhikage':
        return yes();
      case 'dokuzetsu': {
        const src = ask.target != null ? g.players[ask.target] : null;
        if (!src) return no();
        return (src.hand.length + Object.keys(src.equips).length) > 0 ? yes() : no();
      }
      case 'oblivionis':
        return p.hp <= 0 ? yes() : no();
      case 'sakunou':
        return p.hp <= 2 ? no() : yes();
      case 'shien': {
        const target = ask.target != null ? g.players[ask.target] : null;
        if (target && aliveAllies(g, p, target.seat) && p.hand.length > 1) return { type: 'discard', cardIds: worstCards(p, 1) };
        return no();
      }
      case 'drums': {
        const t = ask.target != null ? g.players[ask.target] : null;
        if (!t) return no();
        return (t.hand.length + Object.keys(t.equips).length) > 0 ? yes() : no();
      }
      default:
        return yes();
    }
  }

  /* AI 选角色：按身份倾向挑一个 */
  function pickCharacter(chars, taken, identity, rng) {
    const pool = chars.filter(c => !taken.includes(c.id));
    if (!pool.length) return null;
    const pref = {
      producer: ['sakiko', 'anon', 'taki', 'umiri', 'mana', 'tomori', 'nyamu', 'uika', 'rana', 'soyo', 'mutsumi'],
      costar: ['taki', 'mana', 'umiri', 'tomori', 'uika', 'anon', 'soyo', 'mutsumi', 'rana', 'sakiko', 'nyamu'],
      wrecker: ['mutsumi', 'nyamu', 'soyo', 'rana', 'sakiko', 'uika', 'anon', 'taki', 'umiri', 'mana', 'tomori'],
      soloist: ['soyo', 'nyamu', 'sakiko', 'uika', 'umiri', 'rana', 'taki', 'mutsumi', 'anon', 'tomori', 'mana']
    }[identity] || [];
    for (const id of pref) {
      if (pool.some(c => c.id === id)) return id;
    }
    return pool[Math.floor((rng ? rng() : Math.random()) * pool.length)].id;
  }

  return { respond, playActions, enemyScore, pickCharacter, cardValue, worstCards };
});
