/* =========================================================
 *  鸡狗杀 · 数据层
 *  MyGO!!!!! × Ave Mujica 同人卡牌对战
 *  UMD：浏览器挂 window.JGSData；Node 走 module.exports
 * ========================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JGSData = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------- 乐队 / 势力 ---------------- */
  const BANDS = {
    mygo: { id: 'mygo', name: 'MyGO!!!!!', short: '迷子', color: '#8b7cff', accent: '#c3b8ff', motto: '迷子でも、進め。' },
    mujica: { id: 'mujica', name: 'Ave Mujica', short: '假面', color: '#e0384f', accent: '#ff9dab', motto: '仮面の下、真実は無い。' },
    sumimi: { id: 'sumimi', name: 'sumimi', short: '双子', color: '#f0b429', accent: '#ffe0a3', motto: 'ふたりで、ひとつ。' }
  };

  /* ---------------- 身份 ---------------- */
  /* 5 人局：制作人 1 / 共演者 1 / 拆团者 2 / 独演者 1 */
  const IDENTITIES = {
    producer: {
      id: 'producer', name: '制作人', en: 'PRODUCER', badge: '制', count: 1, crew: 'crew',
      color: '#ffd166', glow: 'rgba(255,209,102,.55)',
      title: '把五个人按在同一张节目单上的人',
      desc: '这场演出的企划者。你的身份公开，体力上限 +1，手牌上限 +1。',
      goal: '让所有【拆团者】与【独演者】退场，演出完整落幕。',
      skill: null
    },
    costar: {
      id: 'costar', name: '共演者', en: 'CO-STAR', badge: '共', count: 1, crew: 'crew',
      color: '#7ee0c0', glow: 'rgba(126,224,192,.5)',
      title: '站在制作人侧幕一步之内的人',
      desc: '与制作人同台的人。制作人公开，但你保持匿名。体力上限 +1。',
      goal: '保护制作人活到谢幕。',
      skill: { id: 'wasei', name: '和声', type: '触发技', desc: '每当制作人受到伤害时，你可以弃置一张手牌，代替其承受此伤害（每回合限一次）。' }
    },
    wrecker: {
      id: 'wrecker', name: '拆团者', en: 'WRECKER', badge: '拆', count: 2, crew: 'wreck',
      color: '#ff5d73', glow: 'rgba(255,93,115,.5)',
      title: '把节目单撕成两半的人',
      desc: '你们有两个人，彼此不知道对方是谁（但目标一致）。',
      goal: '让制作人退场。制作人一旦退场，所有拆团者立即获胜（即使你已经出局）。',
      skill: { id: 'setsuzan', name: '拆解', type: '锁定技', desc: '你退场时，其他【拆团者】各摸一张牌。' }
    },
    soloist: {
      id: 'soloist', name: '独演者', en: 'SOLOIST', badge: '独', count: 1, crew: 'solo',
      color: '#b28dff', glow: 'rgba(178,141,255,.5)',
      title: '只想一个人站在聚光灯下的人',
      desc: '你没有同伴，也不需要。',
      goal: '成为唯一还站在舞台上的人。',
      skill: { id: 'dokuen', name: '独演', type: '锁定技', desc: '你的手牌上限 +1。' }
    }
  };

  const FIVE_PLAYER_SETUP = ['producer', 'costar', 'wrecker', 'wrecker', 'soloist'];

  /* ---------------- 卡牌 ---------------- */
  const CARDS = {
    /* —— 基本牌 —— */
    slash: {
      key: 'slash', name: '微声', type: 'basic', icon: '♪', suitless: false,
      color: '#ff4d7d',
      desc: '出牌阶段限一次：对攻击范围内的一名角色造成 1 点伤害，其可打出【回避】抵消。',
      flavor: '「……听我说。」'
    },
    dodge: {
      key: 'dodge', name: '回避', type: 'basic', icon: '↷', color: '#4fc3f7',
      desc: '响应【微声】打出，抵消这次伤害。不能主动使用。',
      flavor: '「……我不听。」'
    },
    matcha: {
      key: 'matcha', name: '抹茶', type: 'basic', icon: '🍵', color: '#7ed957',
      desc: '回复 1 点体力（不超过上限）；任意角色濒死时可对其使用。出牌阶段只能对自己使用。',
      flavor: '「抹茶パフェ、もう一つ。」'
    },

    /* —— 即时锦囊 —— */
    inspire: {
      key: 'inspire', name: '灵感', type: 'trick', icon: '✧', color: '#ffd166',
      desc: '摸两张牌。', flavor: '「あ、この感じ。」'
    },
    dismantle: {
      key: 'dismantle', name: '拆台', type: 'trick', icon: '✂', color: '#ff9f43',
      desc: '弃置一名角色的一张牌（手牌 / 装备 / 判定区）。', flavor: '「この曲、没収。」'
    },
    poach: {
      key: 'poach', name: '挖角', type: 'trick', icon: '⤴', color: '#f4a261',
      desc: '获得距离 1 以内一名角色的一张牌（手牌 / 装备 / 判定区）。', flavor: '「うちのバンド、来ない？」'
    },
    duet: {
      key: 'duet', name: '对唱', type: 'trick', icon: '⇄', color: '#e07bff',
      desc: '指定一名其他角色，你与其轮流打出【微声】，先不能打出者受到 1 点伤害。',
      flavor: '「歌ってみて。」'
    },
    live: {
      key: 'live', name: '接唱', type: 'trick', icon: '◉', color: '#ff6b6b',
      desc: '所有其他角色须打出一张【微声】，否则受到你造成的 1 点伤害。',
      flavor: '「ここから、みんなで。」'
    },
    spotlight: {
      key: 'spotlight', name: '聚光灯', type: 'trick', icon: '☀', color: '#ffd93d',
      desc: '所有其他角色须打出一张【回避】，否则受到你造成的 1 点伤害。',
      flavor: '「見られてる。」'
    },
    camp: {
      key: 'camp', name: '合宿', type: 'trick', icon: '⌂', color: '#7ee0c0',
      desc: '所有存活角色各回复 1 点体力。', flavor: '「一晩、語ろう。」'
    },
    counter: {
      key: 'counter', name: '反调', type: 'trick', icon: '♭', color: '#9ad0ff',
      desc: '抵消一张锦囊牌的效果，或抵消另一张【反调】。不能主动使用。',
      flavor: '「ちがう、そうじゃない。」'
    },
    absent: {
      key: 'absent', name: '走神', type: 'delay', icon: '☁', color: '#a89cf0',
      desc: '置于目标判定区。其判定阶段亮出牌堆顶一张牌，若结果不为 ♥，跳过出牌阶段。',
      flavor: '「……あれ、今なんの話？」'
    },

    /* —— 装备 —— */
    guitar: {
      key: 'guitar', name: '吉他', type: 'equip', sub: 'weapon', icon: '🎸', color: '#ff8fb6',
      range: 4, desc: '武器 · 攻击范围 4。', flavor: '「コード、覚えた。」'
    },
    /* —— 剧情闯关专用 —— */
    ensemble: {
      key: 'ensemble', name: '合奏', type: 'trick', icon: '♬', color: '#ffb066',
      desc: '出牌阶段，本回合你的【微声】与【对唱】伤害 +1。', flavor: '「せーの、で。」'
    },
    mask: {
      key: 'mask', name: '仮面', type: 'trick', icon: '🎭', color: '#c9b8ff',
      desc: '出牌阶段，本场战斗获得 1 点护甲（每次受到的伤害 -1，可叠加）。', flavor: '「わたしは、ルール。」'
    },
    song: {
      key: 'song', name: '歌', type: 'trick', icon: '♪', color: '#8fe3c0',
      desc: '出牌阶段，对对手造成 1 点伤害，然后回复 1 点体力。', flavor: '「歌う理由は、あとからつける。」'
    },
    solo: {
      key: 'solo', name: '独演', type: 'trick', icon: '★', color: '#ff6b8a',
      desc: '出牌阶段，对对手造成 3 点伤害，自己失去 1 点体力。', flavor: '「ひとりでも、歌う。」'
    },
    finale: {
      key: 'finale', name: '終幕', type: 'trick', icon: '✶', color: '#ffd166',
      desc: '出牌阶段，对对手造成 4 点伤害。每回合限一次。', flavor: '「幕を、下ろす。」'
    },
    honban: {
      key: 'honban', name: '本番', type: 'trick', icon: '◆', color: '#ff9f7a',
      desc: '出牌阶段，造成 2 点伤害；若本回合已经用过【微声】，改为 4 点。', flavor: '「本番は、一度きり。」'
    },
    lighting: {
      key: 'lighting', name: '照明', type: 'trick', icon: '✧', color: '#ffe08a',
      desc: '出牌阶段，对手随机弃 1 张牌，你摸 1 张。', flavor: '「スポット、当てて。」'
    },
    costume: {
      key: 'costume', name: '衣装', type: 'trick', icon: '❖', color: '#c7a0ff',
      desc: '出牌阶段，获得 1 点护盾，并摸 1 张牌。', flavor: '「衣装は、戦闘服。」'
    },
    encore: {
      key: 'encore', name: 'アンコール', type: 'trick', icon: '♫', color: '#8fe3c0',
      desc: '出牌阶段，回复 2 点体力，并摸 1 张牌。', flavor: '「もう一回！」'
    },
    silence: {
      key: 'silence', name: '静寂', type: 'trick', icon: '◐', color: '#9aa7ff',
      desc: '出牌阶段，对手下回合少摸 1 张牌。', flavor: '「しーっ。」'
    },
    encore: {
      key: 'encore', name: '安可', type: 'trick', icon: '↻', color: '#ffb066',
      desc: '出牌阶段，本回合你可以额外使用一张【微声】。', flavor: '「もう一回！」'
    },
    tune: {
      key: 'tune', name: '调音', type: 'trick', icon: '🎼', color: '#8fe3c0',
      desc: '出牌阶段，摸 2 张牌，本回合你的【微声】伤害 +1。', flavor: '「チューニング、合わせて。」'
    },
    retake: {
      key: 'retake', name: '重录', type: 'trick', icon: '⏺', color: '#9aa7ff',
      desc: '出牌阶段，从弃牌堆取回一张【微声】或【回避】。', flavor: '「もう一回、撮り直し。」'
    },
    swap: {
      key: 'swap', name: '换幕', type: 'trick', icon: '⇄', color: '#8fd3ff',
      desc: '出牌阶段，你与一名其他角色各随机交换一张手牌。', flavor: '「幕を、入れ替える。」'
    },
    thunder: {
      key: 'thunder', name: '雷鸣', type: 'trick', icon: '⚡', color: '#ffe066',
      desc: '出牌阶段，对一名其他角色造成 1 点雷电伤害；若其没有手牌，改为 2 点。', flavor: '「空が、鳴った。」'
    },
    pick_rain: {
      key: 'pick_rain', name: '拨片雨', type: 'trick', icon: '❋', color: '#ffd166',
      desc: '出牌阶段，摸 2 张牌，获得 2 点吉他拨片。', flavor: '「降ってきた。」'
    },
    pick_trade: {
      key: 'pick_trade', name: '拨片交易', type: 'trick', icon: '⚖', color: '#8fd3ff',
      desc: '出牌阶段，支付 2 点吉他拨片，摸 2 张牌。', flavor: '「等価交換。」'
    },
    pick_storm: {
      key: 'pick_storm', name: '拨片风暴', type: 'trick', icon: '✷', color: '#ff6b8a',
      desc: '出牌阶段，支付 2 点吉他拨片，对一名其他角色造成 2 点伤害。', flavor: '「弾き切る。」'
    },
    pick_salvage: {
      key: 'pick_salvage', name: '回收', type: 'trick', icon: '♻', color: '#9dffc4',
      desc: '出牌阶段，失去 1 点体力，获得 3 点吉他拨片。', flavor: '「まだ使える。」'
    },
    togawa: {
      key: 'togawa', name: '丰川集团', type: 'trick', icon: '🏢', color: '#ffd166',
      desc: '出牌阶段，升级你的商店：此后每回合的随机卡牌从 5 张变成 6 张（可叠加）。', flavor: '「投資の話をしましょう。」'
    },
    bass: {
      key: 'bass', name: '贝斯', type: 'equip', sub: 'weapon', icon: '🎻', color: '#6fd3c7',
      range: 3, desc: '武器 · 攻击范围 3。你使用【微声】造成伤害后，摸一张牌。',
      flavor: '「低音が、土台。」'
    },
    drums: {
      key: 'drums', name: '鼓组', type: 'equip', sub: 'weapon', icon: '🥁', color: '#ff9f43',
      range: 2, desc: '武器 · 攻击范围 2。你的【微声】被【回避】抵消时，可以弃置目标的一张牌。',
      flavor: '「拍子、ズレてる。」'
    },
    earpiece: {
      key: 'earpiece', name: '耳返', type: 'equip', sub: 'armor', icon: '🎧', color: '#9ad0ff',
      desc: '防具 · 锁定技：你没有手牌时，【微声】对你无效。',
      flavor: '「モニター、返して。」'
    },
    capo: {
      key: 'capo', name: '变调夹', type: 'equip', sub: 'weapon', icon: '🎚', color: '#ffb066',
      range: 2, desc: '武器 · 攻击范围 2。你的【微声】伤害 +1。', flavor: '「半音、上げる。」'
    },
    pedal: {
      key: 'pedal', name: '效果器', type: 'equip', sub: 'weapon', icon: '🎛', color: '#c9b8ff',
      range: 2, desc: '武器 · 攻击范围 2。你的【微声】造成伤害后，目标随机弃一张手牌。', flavor: '「音が、歪む。」'
    },
    pickguitar: {
      key: 'pickguitar', name: '拨片吉他', type: 'equip', sub: 'weapon', icon: '🎸', color: '#ffd166',
      range: 3, desc: '武器 · 攻击范围 3。商店里的卡牌费用 -1（最低 1）。', flavor: '「この一本で、足りる。」'
    },
    pickbox: {
      key: 'pickbox', name: '拨片盒', type: 'equip', sub: 'armor', icon: '📦', color: '#8fe3c0',
      desc: '防具 · 锁定技：你的回合开始时，获得 1 点吉他拨片。', flavor: '「予備は、ある。」'
    },
    pickbelt: {
      key: 'pickbelt', name: '拨片腰带', type: 'equip', sub: 'armor', icon: '🎗', color: '#ffb066',
      desc: '防具 · 锁定技：商店里的卡牌费用 -1（最低 1）。', flavor: '「いつでも、取り出せる。」'
    },
    lightstick: {
      key: 'lightstick', name: '应援棒', type: 'equip', sub: 'armor', icon: '🪄', color: '#ffd166',
      desc: '防具 · 锁定技：你每回合首次受到伤害时，防止此伤害，然后弃置【应援棒】。',
      flavor: '「推しは、守る。」'
    },
    bike: {
      key: 'bike', name: '自行车', type: 'equip', sub: 'defhorse', icon: '🚲', color: '#7ed957',
      desc: '坐骑 · 其他角色计算与你的距离 +1。', flavor: '「自転車通学。」'
    },
    tourbus: {
      key: 'tourbus', name: '巡演车', type: 'equip', sub: 'offhorse', icon: '🚐', color: '#e07bff',
      desc: '坐骑 · 你计算与其他角色的距离 -1。', flavor: '「次の街へ。」'
    }
  };

  /* 牌堆构成（合计 103 张） */
  const DECK_SPEC = [
    ['slash', 28], ['dodge', 18], ['matcha', 10],
    ['inspire', 5], ['dismantle', 6], ['poach', 4], ['duet', 4],
    ['live', 3], ['spotlight', 2], ['camp', 2], ['counter', 4], ['absent', 3],
    ['encore', 2], ['swap', 2], ['thunder', 3], ['tune', 3], ['retake', 2],
    ['capo', 2], ['pedal', 2],
    ['pick_rain', 2], ['pick_trade', 2], ['pick_storm', 2], ['pick_salvage', 2],
    ['pickguitar', 1], ['pickbox', 1], ['pickbelt', 1], ['togawa', 2],
    ['guitar', 2], ['bass', 2], ['drums', 2], ['earpiece', 2], ['lightstick', 2],
    ['bike', 2], ['tourbus', 2]
  ];

  /* ---------------- 角色 ---------------- */
  const CHARACTERS = [
    {
      id: 'tomori', name: '高松 灯', cn: '高松灯', kana: 'たかまつ ともり', roman: 'TOMORI',
      band: 'mygo', role: 'Vo.', hp: 3, icon: '🎤', pattern: 'dust',
      color: '#8b7cff', accent: '#cfc8ff',
      title: '迷子の歌い手',
      quote: '「……ごめん、私、うまく言えない。」',
      bio: 'CRYCHIC 的主唱，也是 MyGO!!!!! 的主唱。她把自己说不出口的话写成歌词，在舞台上替自己发声。',
      skills: [
        { id: 'maigo', name: '迷子', type: '锁定技', desc: '你没有手牌时，其他角色计算与你的距离 +1。' },
        { id: 'haruhikage', name: '春日影', type: '触发技', desc: '每当你受到伤害后，你可以令一名角色摸一张牌。' }
      ]
    },
    {
      id: 'anon', name: '千早 愛音', cn: '千早爱音', kana: 'ちはや あのん', roman: 'ANON',
      band: 'mygo', role: 'Gt.', hp: 4, icon: '🎸', pattern: 'stripe',
      color: '#ff8fb6', accent: '#ffd0e2',
      title: '帰ってきた転校生',
      quote: '「私、かわいいから許して！」',
      bio: '从英国回来的转学生。想被看见、想被喜欢，于是把「组乐队」当成了最快的捷径——结果真的留了下来。',
      skills: [
        { id: 'jikoshoukai', name: '自来熟', type: '主动技', desc: '出牌阶段限一次：令一名其他角色选择一项——交给你一张手牌，或令你摸一张牌。' },
        { id: 'kyoei', name: '虚荣', type: '锁定技', desc: '你的手牌上限 +1。' },
        { id: 'pickfan', name: '拨片收藏', type: '锁定技', desc: '你的回合开始时，获得 1 点吉他拨片。' }
      ]
    },
    {
      id: 'rana', name: '要 楽奈', cn: '要乐奈', kana: 'かなめ らな', roman: 'RANA',
      band: 'mygo', role: 'Gt.', hp: 4, icon: '🐈', pattern: 'wave',
      color: '#9be15d', accent: '#e2ffc2',
      title: '野良猫ギタリスト',
      quote: '「おもしろい女。」',
      bio: '在 Live House 蹭吃蹭喝的野良猫。不读谱，只凭耳朵弹琴；觉得有趣就留下，觉得无聊就走。',
      skills: [
        { id: 'noraneko', name: '野良猫', type: '锁定技', desc: '你使用【微声】无距离限制。' },
        { id: 'matcha', name: '抹茶中毒', type: '触发技', desc: '每当你使用【抹茶】回复体力后，摸一张牌。' },
        { id: 'pickinstinct', name: '拨片直觉', type: '锁定技', desc: '商店里的卡牌费用 -1（最低 1）。' }
      ]
    },
    {
      id: 'soyo', name: '長崎 そよ', cn: '长崎素世', kana: 'ながさき そよ', roman: 'SOYO',
      band: 'mygo', role: 'Ba.', hp: 3, icon: '🎼', pattern: 'grid',
      color: '#6fd3c7', accent: '#c4fff5',
      title: '仮面のママ',
      quote: '「ずっと、バンドを続けたいだけ。」',
      bio: '温柔的提琴手、乐队的妈妈、也是最先学会用笑容把人留在身边的人。CRYCHIC 的解散是她心里一直没合上的裂缝。',
      skills: [
        { id: 'dokushin', name: '读心', type: '主动技', desc: '出牌阶段限一次：观看一名其他角色的手牌，然后弃置其中一张。' },
        { id: 'akiramenai', name: '不放弃', type: '触发技', desc: '当一名角色进入濒死状态时，你可以弃置一张手牌，令其回复 1 点体力。' }
      ]
    },
    {
      id: 'taki', name: '椎名 立希', cn: '椎名立希', kana: 'しいな たき', roman: 'TAKI',
      band: 'mygo', role: 'Dr.', hp: 4, icon: '🥁', pattern: 'dot',
      color: '#ff9f43', accent: '#ffe0b8',
      title: '叩き上げのドラマー',
      quote: '「燈、ちゃんと歌え。」',
      bio: '打鼓、作曲、在便利店打工。嘴很臭，手很稳，心里那点软只留给一个人。',
      skills: [
        { id: 'renshuu', name: '练习', type: '主动技', desc: '出牌阶段限一次：弃置一张手牌，本回合你的下一张【微声】伤害 +1。' },
        { id: 'dokuzetsu', name: '毒舌', type: '触发技', desc: '每当你受到伤害后，你可以弃置伤害来源的一张牌。' }
      ]
    },
    {
      id: 'sakiko', name: '豊川 祥子', cn: '丰川祥子', kana: 'とよかわ さきこ', roman: 'SAKIKO',
      band: 'mujica', role: 'Key.', hp: 4, icon: '🎹', pattern: 'crown',
      color: '#d7263d', accent: '#ffb3bd',
      title: '舞台の支配者',
      quote: '「……お幸せに。」',
      bio: '曾经的千金，如今的企划者。她把失去的一切都折进剧本里，然后戴上假面，亲手把五个人推上舞台。',
      skills: [
        { id: 'butaikantoku', name: '舞台监督', type: '主动技', desc: '出牌阶段限一次：令一名其他角色选择一项——弃置一张牌，或令你摸两张牌。' },
        { id: 'oblivionis', name: 'Oblivionis', type: '限定技', desc: '当你进入濒死状态时，你可以将体力回复至 2 点，然后弃置所有手牌。' }
      ]
    },
    {
      id: 'mutsumi', name: '若葉 睦', cn: '若叶睦', kana: 'わかば むつみ', roman: 'MUTSUMI',
      band: 'mujica', role: 'Gt.', hp: 3, icon: '🌙', pattern: 'split',
      color: '#55c98a', accent: '#c6ffdd',
      title: '無言のギター',
      quote: '「…………」',
      bio: '话很少，吉他却从不迟疑。被期待压得太久之后，她体内长出了另一个会说话的人格——Mortis。',
      skills: [
        { id: 'mugon', name: '无言', type: '锁定技', desc: '你不能成为【拆台】的目标。' },
        { id: 'jinkaku', name: '人格交替', type: '主动技', desc: '出牌阶段限一次：你可以失去 1 点体力，然后摸三张牌。' },
        { id: 'pickecho', name: '拨片回响', type: '锁定技', desc: '你的【微声】造成伤害后，获得 1 点吉他拨片。' }
      ]
    },
    {
      id: 'uika', name: '三角 初華', cn: '三角初华', kana: 'みすみ ういか', roman: 'UIKA',
      band: 'mujica', role: 'Gt.&Vo.', hp: 4, icon: '☀', pattern: 'halo',
      color: '#ffb703', accent: '#ffe3a3',
      title: '偽りの太陽',
      quote: '「祥ちゃん、私だけを見て。」',
      bio: 'sumimi 的太阳，也是 Ave Mujica 的 Doloris。她把最亮的那面给了所有人，把最暗的那面只留给一个人。',
      skills: [
        { id: 'ouen', name: '应援', type: '主动技', desc: '出牌阶段限一次：令一名角色摸两张牌，然后其弃置一张牌。' },
        { id: 'dokusen', name: '独占', type: '触发技', desc: '每当你令一名其他角色回复体力后，你摸一张牌。' }
      ]
    },
    {
      id: 'umiri', name: '八幡 海鈴', cn: '八幡海铃', kana: 'やはた うみり', roman: 'UMIRI',
      band: 'mujica', role: 'Ba.', hp: 4, icon: '🎚', pattern: 'line',
      color: '#4ea8de', accent: '#bfe6ff',
      title: '傭兵ベーシスト',
      quote: '「報酬次第だね。」',
      bio: '三十多个乐队的替补贝斯手。谁给钱就给谁弹，从不投入感情——至少她是这么对外说的。',
      skills: [
        { id: 'reisei', name: '冷静', type: '触发技', desc: '每当你受到伤害时，你可以弃置一张手牌，令此伤害 -1（每回合限一次）。' },
        { id: 'shien', name: '支援', type: '触发技', desc: '每当一名其他角色成为【微声】的目标时，你可以弃置一张手牌，令其摸一张牌。' }
      ]
    },
    {
      id: 'nyamu', name: '祐天寺 にゃむ', cn: '祐天寺喵梦', kana: 'ゆうてんじ にゃむ', roman: 'NYAMU',
      band: 'mujica', role: 'Dr.', hp: 4, icon: '📱', pattern: 'pixel',
      color: '#c77dff', accent: '#efd6ff',
      title: '配信者の猫',
      quote: '「にゃむち、見てる〜？」',
      bio: '为了流量什么都敢干的配信者。鼓是道具，面具是道具，连「真心」也可以剪成十五秒。',
      skills: [
        { id: 'haishin', name: '直播', type: '主动技', desc: '出牌阶段限一次：展示一张手牌，然后摸一张牌；若展示的是【微声】，你额外摸一张牌。' },
        { id: 'sakunou', name: '炒作', type: '触发技', desc: '每当你成为【微声】的目标时，你可以摸一张牌；若如此做，此【微声】对你造成的伤害 +1。' }
      ]
    },
    {
      id: 'mana', name: '純田 まな', cn: '纯田真奈', kana: 'すみた まな', roman: 'MANA',
      band: 'sumimi', role: 'Vo.', hp: 3, icon: '🎶', pattern: 'bubble',
      color: '#f4a261', accent: '#ffe2c9',
      title: 'いつもの相棒',
      quote: '「初華ちゃん、行こっか。」',
      bio: 'sumimi 的另一半。永远笑着，永远接得住话，永远在初華转身的时候站在原地。',
      skills: [
        { id: 'genki', name: '元气', type: '锁定技', desc: '你的手牌上限 +2。' },
        { id: 'futari', name: '双人曲', type: '主动技', desc: '出牌阶段限一次：令一名其他角色摸一张牌，然后你摸一张牌。' }
      ]
    }
  ];

  const CHAR_MAP = {};
  CHARACTERS.forEach(c => { CHAR_MAP[c.id] = c; });

  /* ---------------- 立绘 / 卡牌简述 ---------------- */
  const CHAR_IMG = {
    tomori: 'img/chars/norm/tomori.png', anon: 'img/chars/norm/anon.png',
    rana: 'img/chars/norm/rana.png', soyo: 'img/chars/norm/soyo.png',
    taki: 'img/chars/norm/taki.png', sakiko: 'img/chars/norm/sakiko.png',
    mutsumi: 'img/chars/norm/mutsumi.png', uika: 'img/chars/norm/uika.png',
    umiri: 'img/chars/norm/umiri.png', nyamu: 'img/chars/norm/nyamu.png',
    mana: 'img/chars/norm/mana.png'
  };

  const CARD_SHORT = {
    slash: '造成1点伤害，可被回避抵消',
    dodge: '抵消一次微声',
    matcha: '回复1点体力，可救人',
    inspire: '摸两张牌',
    dismantle: '弃置目标一张牌',
    poach: '获得距离1内一张牌',
    duet: '轮流出微声，先断者受伤',
    live: '全场须出微声，否则受伤',
    spotlight: '全场须出回避，否则受伤',
    camp: '全体回复1点体力',
    counter: '抵消一张锦囊牌',
    absent: '判定非♥则跳过出牌',
    ensemble: '本回合伤害 +1',
    mask: '本场护甲 +1',
    song: '1伤害+1回复',
    solo: '3伤害，自伤1',
    finale: '4点伤害',
    honban: '2伤，已出微声则4',
    lighting: '对手弃1你摸1',
    costume: '护盾1摸1',
    encore: '回复2摸1',
    silence: '对手少摸1',
    encore: '本回合可再出1张微声',
    tune: '摸2，微声+1',
    retake: '取回微声/回避',
    pick_rain: '摸2+2拨片',
    pick_trade: '付2拨片摸2',
    pick_storm: '付2拨片2伤',
    pick_salvage: '失1血换3拨片',
    pickguitar: '武器3，商店-1',
    pickbox: '回合开始+1拨片',
    pickbelt: '商店费用-1',
    togawa: '商店+1张',
    swap: '随机交换手牌',
    thunder: '1雷伤，无手牌则2',
    guitar: '攻击范围4',
    bass: '范围3，伤害后摸牌',
    drums: '范围2，敌闪避后拆牌',
    earpiece: '无手牌时免疫微声',
    lightstick: '抵挡一次伤害后碎裂',
    bike: '他人与你距离+1',
    tourbus: '你与他人距离-1'
  };

  /* ---------------- 工具 ---------------- */
  const SUITS = ['♠', '♥', '♣', '♦'];
  const RANK_TEXT = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUIT_COLOR = { '♠': '#dfe6ff', '♥': '#ff6b81', '♣': '#dfe6ff', '♦': '#ff6b81' };

  function getChar(id) { return CHAR_MAP[id] || CHARACTERS[0]; }
  function getCard(key) { return CARDS[key]; }
  function isRed(suit) { return suit === '♥' || suit === '♦'; }

  /* 可用于 UI 的规则速查 */
  const RULES_TEXT = [
    ['目标', '5 人局。经典模式：你 + 4 名 AI。联机模式：5 名玩家（空位可由 AI 补上）。'],
    ['身份', '每局随机分配：制作人 ×1、共演者 ×1、拆团者 ×2、独演者 ×1。除制作人外全部匿名。'],
    ['胜负', '制作人 & 共演者：让拆团者与独演者全部退场。拆团者：制作人退场即胜。独演者：成为最后活着的人。'],
    ['回合', '准备 → 判定 → 摸牌（2 张）→ 出牌 → 弃牌（手牌上限 = 当前体力）→ 结束。'],
    ['攻击范围', '默认 1。装备武器后按其数值计算；【自行车】令别人离你更远，【巡演车】令你离别人更近。'],
    ['濒死', '体力降至 0 或以下时进入濒死，任何角色可对其使用【抹茶】；无人救援则退场。'],
    ['击杀奖励', '击杀拆团者摸三张牌；击杀共演者需弃置所有手牌；拆团者退场时其他拆团者各摸一张。'],
    ['伤害', '默认 1 点。技能与防具的加减伤在结算时依次生效，最终伤害最低为 0。']
  ];

  return {
    BANDS, IDENTITIES, FIVE_PLAYER_SETUP, CARDS, DECK_SPEC, CHARACTERS, CHAR_MAP,
    SUITS, RANK_TEXT, SUIT_COLOR, CHAR_IMG, CARD_SHORT,
    getChar, getCard, isRed, RULES_TEXT
  };
});
