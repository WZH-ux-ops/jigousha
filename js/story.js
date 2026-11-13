/* =========================================================
 *  鸡狗杀 · 剧情闯关剧本
 *  第一话「迷子の並行世界」
 *  节点类型：
 *    { bg, sprites, who, text, next }        普通对话
 *    { bg, sprites, choices:[...] }          选项
 *    { battle:{...}, win, lose }             战斗
 *    { end:true }                            本话结束
 *  who: 角色 id / 'narration' / 'system'
 * ========================================================= */
(function (root) {
  'use strict';

  const SPR = (c, pos, dim) => ({ c, pos, dim: !!dim });

  const CH1 = {
    id: '1-1',
    title: '第一话 · 迷子の並行世界',
    sub: '幕间之后，门开了。',
    desc: '演出结束后的走廊里，睦推开了一扇不该存在的门。被剪掉的世界、说不出话的「声音」、以及一个眼睛空白的祥子——她得靠收集卡牌，把自己的声音一张张找回来。',
    start: 's0',
    battleNode: 'b1',
    bg: {
      stage: '舞台裏 · 终演之后',
      void: '世界の隙間',
      classroom: '废弃教室',
      shadow: '影の舞台'
    },
    nodes: {
      /* ---------- 序：舞台裏 ---------- */
      s0: {
        bg: 'stage', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '掌声与低音的余震一起退去。舞台灯一盏盏熄灭，只剩下安全出口的绿光。',
        next: 's0b'
      },
      s0b: {
        bg: 'stage', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi',
        text: '……祥子。みんな。……もう、終わり？',
        next: 's0c'
      },
      s0c: {
        bg: 'stage', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '没有人回答。走廊尽头，一扇门在发着不该存在的白光。她的吉他就靠在门边。',
        next: 's0d'
      },
      s0d: {
        bg: 'stage', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '她伸手去拿琴。指尖碰到琴颈的瞬间——门开了。',
        next: 's1'
      },

      /* ---------- 坠落 ---------- */
      s1: {
        bg: 'void', sprites: [], who: 'narration',
        text: '失重。坠落。无数张卡牌从身边掠过，像被撕碎又重新编排的乐谱。',
        next: 's1b'
      },
      s1b: {
        bg: 'void', sprites: [], who: 'system',
        text: '『——欢迎来到，被剪掉的世界。』',
        next: 's1c'
      },
      s1c: {
        bg: 'void', sprites: [], who: 'system',
        text: '『规则很简单：收集卡牌。集齐的人，可以回到自己的舞台。』',
        next: 's2'
      },

      /* ---------- 教室 ---------- */
      s2: {
        bg: 'classroom', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '睁开眼，是一间废弃的教室。桌椅蒙着灰，窗外的雨下个不停。',
        next: 's2b'
      },
      s2b: {
        bg: 'classroom', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi',
        text: '……学校？　でも、わたしの知ってる学校じゃない。',
        next: 's2c'
      },
      s2c: {
        bg: 'classroom', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '黑板上有一行粉笔字，字迹很轻：『集めなさい。集めれば、帰れる。』',
        next: 's2d'
      },
      s2d: {
        bg: 'classroom', sprites: [SPR('mutsumi', 'center'), SPR('tomori', 'right')], who: 'narration',
        text: '最前排的课桌上坐着一个女孩。她抬起头——那张脸，和灯一模一样。',
        next: 's2e'
      },
      s2e: {
        bg: 'classroom', sprites: [SPR('mutsumi', 'left', true), SPR('tomori', 'right')], who: 'tomori',
        text: '……你也是，被丢掉的那一个吗？',
        next: 's2f'
      },
      s2f: {
        bg: 'classroom', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right', true)], who: 'mutsumi',
        text: '……燈、ちゃん？',
        next: 's2g'
      },
      s2g: {
        bg: 'classroom', sprites: [SPR('mutsumi', 'left', true), SPR('tomori', 'right')], who: 'tomori',
        text: '不是。我是「没被选上的声音」。你呢？',
        next: 'c1'
      },

      /* ---------- 选项 ---------- */
      c1: {
        bg: 'classroom', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right')],
        choices: [
          {
            text: '「あなたは、燈ちゃん……？」',
            sub: '追问她的身份',
            next: 'c1a',
            gain: { cards: ['slash'] },
            rewardOnce: 'r_c1a'
          },
          {
            text: '「ここは、どこ？」',
            sub: '先弄清楚自己在哪',
            next: 'c1b',
            gain: { cards: ['inspire'] },
            rewardOnce: 'r_c1b'
          },
          {
            text: '什么也不说，向后退一步',
            sub: '本能地想逃',
            next: 'c1c',
            gain: { cards: ['matcha'] },
            flag: 'fear',
            rewardOnce: 'r_c1c'
          },
          {
            text: '打开脚边的吉他盒',
            sub: '??',
            next: 'c1',            // 回到同一个选项
            gain: { cards: ['lightstick'], items: ['program'] },
            once: 'c1d',
            hint: '调查'
          }
        ]
      },
      c1a: {
        bg: 'classroom', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right')], who: 'tomori',
        text: '……你叫了我的名字。真好。已经很久没有人叫过我了。',
        next: 'c2'
      },
      c1b: {
        bg: 'classroom', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right')], who: 'tomori',
        text: '这里是「剪掉的房间」。所有没能唱出来的歌，都掉在这里。',
        next: 'c2'
      },
      c1c: {
        bg: 'classroom', sprites: [SPR('mutsumi', 'left', true), SPR('tomori', 'right')], who: 'tomori',
        text: '……害怕是好事。害怕的人，才会记得自己是谁。',
        next: 'c2'
      },
      c2: {
        bg: 'classroom', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right')], who: 'tomori',
        text: '给你。这是你的「声音」——卡牌会记住你走过的路。',
        next: 'c2b'
      },
      c2b: {
        bg: 'classroom', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right')], who: 'narration',
        text: '她的身影淡下去，像被水泡过的照片。雨声忽然变大了。',
        next: 'c3'
      },

      /* ---------- 影 ---------- */
      c3: {
        bg: 'shadow', sprites: [SPR('mutsumi', 'left'), SPR('sakiko', 'right')], who: 'narration',
        text: '教室后门被推开。一个熟悉的身影站在雨里——祥子。可是她的眼睛，是空白的。',
        next: 'c3b'
      },
      c3b: {
        bg: 'shadow', sprites: [SPR('mutsumi', 'left', true), SPR('sakiko', 'right')], who: 'sakiko',
        text: '……你也要，把我们的歌，夺走吗？',
        next: 'c3c'
      },
      c3c: {
        bg: 'shadow', sprites: [SPR('mutsumi', 'left'), SPR('sakiko', 'right', true)], who: 'mutsumi',
        text: '祥子……？　ちがう。わたしは、わたしの歌を——',
        next: 'b1'
      },
      b1: {
        battle: {
          enemy: {
            id: 'sakiko_shadow', name: '影・祥子', char: 'sakiko',
            hp: 5, deck: ['slash', 'slash', 'slash', 'slash', 'dodge', 'dodge', 'matcha'],
            line: '把声音，还给我。'
          },
          reward: { cards: ['duet'] }
        },
        win: 's4',
        lose: 'lose1'
      },
      lose1: {
        bg: 'shadow', sprites: [], who: 'system',
        text: '『……还不行。这一次，不算。』',
        next: 'b1'
      },

      /* ---------- 尾声 ---------- */
      s4: {
        bg: 'shadow', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '影子的轮廓碎成黑色的羽毛。地上留下一张卡，边缘还带着一点体温。',
        next: 's4b'
      },
      s4b: {
        bg: 'shadow', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi',
        text: '……対唱。祥子の声が、入ってる。',
        next: 's4c'
      },
      s4c: {
        bg: 'classroom', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '黑板上的字变了：『第一关，通过。』',
        next: 's4d'
      },
      s4d: {
        bg: 'classroom', sprites: [SPR('mutsumi', 'center')], who: 'system',
        text: '『收集到的卡牌，会记住你走过的路。……下一扇门，在等你。』',
        next: 's4e'
      },
      s4e: {
        bg: 'classroom', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '雨声里，远处传来一声很轻的、像祥子的叹息。',
        next: 's4f'
      },
      s4f: {
        bg: 'classroom', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi',
        text: '……行くよ。わたしの声で、連れて帰る。',
        end: true
      }
    }
  };

  const CH2 = {
    id: '1-2',
    title: '第二话 · 雨の降らない屋上',
    sub: '等的人，和被等的人。',
    desc: '第二扇门通往一座不会下雨的屋顶。素世坐在屋檐边，撑着一把没有雨的伞——她说自己等了很久。这一次，睦得用琴弦和卡牌，把她从"等待"里拽出来。',
    start: 'p0',
    battleNode: 'b1',
    bg: { roof: '静止の屋上', roof2: '雨の屋上' },
    nodes: {
      p0: {
        bg: 'roof', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '门后不是教室，是屋顶。雨停在半空，一颗一颗悬着，像被按了暂停键。',
        next: 'p1'
      },
      p1: {
        bg: 'roof', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi',
        text: '……雨が、落ちてこない。',
        next: 'p2'
      },
      p2: {
        bg: 'roof', sprites: [SPR('mutsumi', 'left'), SPR('soyo', 'right')], who: 'narration',
        text: '屋顶边缘坐着一个人，撑着一把黑色的伞。伞面上没有一滴雨。',
        next: 'p3'
      },
      p3: {
        bg: 'roof', sprites: [SPR('mutsumi', 'left', true), SPR('soyo', 'right')], who: 'soyo',
        text: '……你来了。我等了好久。',
        next: 'p4'
      },
      p4: {
        bg: 'roof', sprites: [SPR('mutsumi', 'left'), SPR('soyo', 'right', true)], who: 'mutsumi',
        text: 'そよちゃん……？　ここで、何をしてるの。',
        next: 'p5'
      },
      p5: {
        bg: 'roof', sprites: [SPR('mutsumi', 'left', true), SPR('soyo', 'right')], who: 'soyo',
        text: '等大家。等灯，等立希，等爱音……也等你。',
        next: 'p6'
      },
      p6: {
        bg: 'roof', sprites: [SPR('mutsumi', 'left'), SPR('soyo', 'right')], who: 'narration',
        text: '她的声音很轻，轻得像怕惊动悬在半空的雨。',
        next: 'p7'
      },
      p7: {
        bg: 'roof', sprites: [SPR('mutsumi', 'left', true), SPR('soyo', 'right')], who: 'soyo',
        text: '这个世界的规矩是「先等的人先输」。所以我一直在等——等到忘了自己为什么要等。',
        next: 'c1'
      },
      c1: {
        bg: 'roof', sprites: [SPR('mutsumi', 'left'), SPR('soyo', 'right')],
        choices: [
          {
            text: '「待たせて、ごめん」',
            sub: '向她道歉',
            next: 'c1a',
            gain: { cards: ['inspire'] },
            rewardOnce: 'r_p_c1a'
          },
          {
            text: '「あなたは、誰？」',
            sub: '问她到底是谁',
            next: 'c1b',
            gain: { cards: ['dismantle'] },
            rewardOnce: 'r_p_c1b'
          },
          {
            text: '在她旁边坐下，什么也不说',
            sub: '陪她等一会儿',
            next: 'c1c',
            gain: { cards: ['matcha'] },
            flag: 'sat',
            rewardOnce: 'r_p_c1c'
          },
          {
            text: '看她的伞',
            sub: '??',
            next: 'c1',
            gain: { items: ['umbrella'] },
            once: 'p_c1d',
            hint: '调查'
          }
        ]
      },
      c1a: {
        bg: 'roof', sprites: [SPR('mutsumi', 'left'), SPR('soyo', 'right')], who: 'soyo',
        text: '……道歉的话，我已经在这个屋顶上听了太多遍了。',
        next: 'c2'
      },
      c1b: {
        bg: 'roof', sprites: [SPR('mutsumi', 'left'), SPR('soyo', 'right')], who: 'soyo',
        text: '我是「留下来等的那个人」。你们走了，总得有人留在原地，对吧？',
        next: 'c2'
      },
      c1c: {
        bg: 'roof', sprites: [SPR('mutsumi', 'left'), SPR('soyo', 'right')], who: 'soyo',
        text: '……你总是这样。什么都不说，就坐下了。',
        next: 'c2'
      },
      c2: {
        bg: 'roof', sprites: [SPR('mutsumi', 'left'), SPR('soyo', 'right')], who: 'narration',
        text: '伞骨上刻着一行小字：『待ち続けた人のための歌』。',
        next: 'c2b'
      },
      c2b: {
        bg: 'roof', sprites: [SPR('mutsumi', 'left', true), SPR('soyo', 'right')], who: 'soyo',
        text: '你不也一样吗。说不出话的时候，就只剩下弹琴了。',
        next: 'c3'
      },
      c3: {
        bg: 'roof', sprites: [SPR('mutsumi', 'left'), SPR('soyo', 'right')], who: 'soyo',
        text: '那就用牌来说吧。让我看看，你的声音，够不够把我从这里拉出去。',
        next: 'b1'
      },
      b1: {
        battle: {
          enemy: {
            id: 'soyo_shadow', name: '影・素世', char: 'soyo',
            hp: 7, deck: ['slash', 'slash', 'slash', 'slash', 'dodge', 'dodge', 'dodge', 'matcha', 'dismantle', 'dismantle'],
            line: '……等的人，也可以先动手哦。'
          },
          reward: { cards: ['guitar'] }
        },
        win: 'p8',
        lose: 'lose1'
      },
      lose1: {
        bg: 'roof', sprites: [], who: 'system',
        text: '『……还不行。她还在等。』',
        next: 'b1'
      },
      p8: {
        bg: 'roof2', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '伞掉在地上。雨终于落下来，穿过她的身体，落进睦的头发里。',
        next: 'p8b'
      },
      p8b: {
        bg: 'roof2', sprites: [SPR('mutsumi', 'left'), SPR('soyo', 'right')], who: 'soyo',
        text: '……谢谢你来接我。',
        next: 'p8c'
      },
      p8c: {
        bg: 'roof2', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '声音散在雨里。地上留下一张卡，弦上还带着一点温度——【吉他】。',
        next: 'p8d'
      },
      p8d: {
        bg: 'roof2', sprites: [SPR('mutsumi', 'center')], who: 'system',
        text: '『第二关，通过。』',
        next: 'p8e'
      },
      p8e: {
        bg: 'roof2', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '屋顶尽头的门上，浮出第三行字：『まだ、足りない。』',
        next: 'p8f'
      },
      p8f: {
        bg: 'roof2', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi',
        text: '……まだ、誰かいる。行かなきゃ。',
        end: true
      }
    }
  };

  const CH3 = {
    id: '1-3',
    title: '第三话 · 仮面の向こう',
    sub: '剪掉的声音，和没说完的话。',
    desc: '第三扇门后是那个舞台——灯还亮着，观众席空无一人。祥子站在中央，手里拿着面具。她说这个世界的歌都是她剪掉的：剪掉，就不会有人受伤。这一次，睦要证明她错了。',
    start: 't0',
    battleNode: 'b1',
    final: true,
    act: '第 一 幕',
    bg: { mirage: '仮面の舞台' },
    nodes: {
      t0: {
        bg: 'mirage', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '第三扇门后，是那个舞台。灯光还亮着，观众席空无一人。',
        next: 't1'
      },
      t1: {
        bg: 'mirage', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi',
        text: '……ここは。わたしたちの、ステージ。',
        next: 't2'
      },
      t2: {
        bg: 'mirage', sprites: [SPR('mutsumi', 'left'), SPR('sakiko', 'right')], who: 'narration',
        text: '舞台中央站着祥子。她手里拿着一副面具，边缘很新。',
        next: 't3'
      },
      t3: {
        bg: 'mirage', sprites: [SPR('mutsumi', 'left', true), SPR('sakiko', 'right')], who: 'sakiko',
        text: 'ようこそ。ここが、わたくしの作った世界ですわ。',
        next: 't4'
      },
      t4: {
        bg: 'mirage', sprites: [SPR('mutsumi', 'left'), SPR('sakiko', 'right', true)], who: 'mutsumi',
        text: '祥子が……作った？',
        next: 't5'
      },
      t5: {
        bg: 'mirage', sprites: [SPR('mutsumi', 'left', true), SPR('sakiko', 'right')], who: 'sakiko',
        text: '被剪掉的歌，都掉在这里。只要剪掉，就不会有人受伤。',
        next: 't6'
      },
      t6: {
        bg: 'mirage', sprites: [SPR('mutsumi', 'left'), SPR('sakiko', 'right')], who: 'narration',
        text: '她抬手，空中浮出无数张卡牌的影子。每一张的边缘都是整齐的切口。',
        next: 't7'
      },
      t7: {
        bg: 'mirage', sprites: [SPR('mutsumi', 'left', true), SPR('sakiko', 'right')], who: 'sakiko',
        text: 'あなたも同じ。言葉が出ないなら、音も要らないでしょう？',
        next: 'c1'
      },
      c1: {
        bg: 'mirage', sprites: [SPR('mutsumi', 'left'), SPR('sakiko', 'right')],
        choices: [
          {
            text: '「祥子を止める」',
            sub: '斩钉截铁',
            next: 'c1a',
            gain: { cards: ['counter'] },
            rewardOnce: 'r_t_c1a'
          },
          {
            text: '「一緒に帰ろう」',
            sub: '伸出手',
            next: 'c1b',
            gain: { cards: ['duet'] },
            rewardOnce: 'r_t_c1b'
          },
          {
            text: '什么也不说，弹起吉他',
            sub: '用琴声回答',
            next: 'c1c',
            gain: { cards: ['guitar'] },
            flag: 'played',
            rewardOnce: 'r_t_c1c'
          },
          {
            text: '看舞台边掉落的节目单',
            sub: '??',
            next: 'c1',
            gain: { items: ['playbill'] },
            once: 't_c1d',
            hint: '调查'
          }
        ]
      },
      c1a: {
        bg: 'mirage', sprites: [SPR('mutsumi', 'left'), SPR('sakiko', 'right')], who: 'sakiko',
        text: '……止める？　この世界ごと、わたくしを？',
        next: 'c2'
      },
      c1b: {
        bg: 'mirage', sprites: [SPR('mutsumi', 'left'), SPR('sakiko', 'right')], who: 'sakiko',
        text: '帰る場所なんて、もう……どこにも。',
        next: 'c2'
      },
      c1c: {
        bg: 'mirage', sprites: [SPR('mutsumi', 'left'), SPR('sakiko', 'right')], who: 'sakiko',
        text: '……その音。まだ、鳴らせたんですのね。',
        next: 'c2'
      },
      c2: {
        bg: 'mirage', sprites: [SPR('mutsumi', 'left'), SPR('sakiko', 'right', true)], who: 'mutsumi',
        text: '切ったんじゃない。まだ、歌えてないだけ。',
        next: 'c2b'
      },
      c2b: {
        bg: 'mirage', sprites: [SPR('mutsumi', 'left', true), SPR('sakiko', 'right')], who: 'sakiko',
        text: '……なら、証拠を見せて。わたくしの歌を、取り戻してみせて。',
        next: 'b1'
      },
      b1: {
        battle: {
          enemy: {
            id: 'sakiko_real', name: '豊川 祥子', char: 'sakiko',
            hp: 7, draw: 2,
            deck: ['slash', 'slash', 'slash', 'slash', 'slash', 'dodge', 'dodge', 'dodge', 'matcha', 'dismantle', 'dismantle', 'counter'],
            line: '幕を、下ろしますわ。'
          },
          reward: { cards: ['counter'] }
        },
        win: 't8',
        lose: 'lose1'
      },
      lose1: {
        bg: 'mirage', sprites: [], who: 'system',
        text: '『……まだ、終われませんわ。』',
        next: 'b1'
      },
      t8: {
        bg: 'mirage', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '面具裂开。灯光一盏盏熄灭，观众席上浮出无数模糊的人影——他们抬起手，鼓掌。',
        next: 't8b'
      },
      t8b: {
        bg: 'mirage', sprites: [SPR('mutsumi', 'left'), SPR('sakiko', 'right')], who: 'sakiko',
        text: '……かった。わたくしの、負けですわ。',
        next: 't8c'
      },
      t8c: {
        bg: 'mirage', sprites: [SPR('mutsumi', 'left'), SPR('sakiko', 'right')], who: 'narration',
        text: '舞台开始崩塌。睦伸出手，抓住了祥子的手腕。',
        next: 't8d'
      },
      t8d: {
        bg: 'mirage', sprites: [SPR('mutsumi', 'left'), SPR('sakiko', 'right')], who: 'sakiko',
        text: '離して。わたくしは、ここに残ります。',
        next: 't8e'
      },
      t8e: {
        bg: 'mirage', sprites: [SPR('mutsumi', 'left'), SPR('sakiko', 'right', true)], who: 'mutsumi',
        text: 'いや。帰るよ。みんな、待ってる。',
        next: 't9'
      },
      t9: {
        bg: 'mirage', sprites: [], who: 'narration',
        text: '白光。耳边传来真实世界的声音——有人在叫她的名字。',
        next: 't9b'
      },
      t9b: {
        bg: 'stage', sprites: [SPR('mutsumi', 'left'), SPR('sakiko', 'right')], who: 'sakiko',
        text: '睦。……睦！',
        next: 't9c'
      },
      t9c: {
        bg: 'stage', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '睁开眼。是 Ave Mujica 的休息室。祥子蹲在她面前，眉头皱得很紧。',
        next: 't9d'
      },
      t9d: {
        bg: 'stage', sprites: [SPR('mutsumi', 'left'), SPR('sakiko', 'right', true)], who: 'mutsumi',
        text: '……祥子。わたし、歌えるよ。',
        end: true
      }
    }
  };

  const CH4 = {
    id: '2-1',
    title: '第四话 · 夜の校舎',
    sub: '没有声音的吉他。',
    desc: '休息室的门外又出现了那道光。这一次，睦自己推开了门。夜里的校舍只有一间教室亮着灯——爱音抱着吉他，弹着，却没有声音。然后门被撞开，立希站在门口，眼睛里没有光。',
    start: 'n0',
    battleNode: 'b1',
    bg: { night: '夜の校舎', room: '灯の教室' },
    nodes: {
      n0: {
        bg: 'night', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '休息室的门外，又出现了那道光。这一次，睦自己推开了门。',
        next: 'n1'
      },
      n1: {
        bg: 'night', sprites: [], who: 'narration',
        text: '夜里的校舍。走廊尽头只有一间教室亮着灯。',
        next: 'n2'
      },
      n2: {
        bg: 'room', sprites: [SPR('anon', 'center')], who: 'narration',
        text: '爱音抱着吉他坐在课桌上，手指在弦上动着——没有声音。',
        next: 'n3'
      },
      n3: {
        bg: 'room', sprites: [SPR('mutsumi', 'left'), SPR('anon', 'right')], who: 'anon',
        text: '……あれ？　睦ちゃん？　どうしたの、こんな時間に。',
        next: 'n4'
      },
      n4: {
        bg: 'room', sprites: [SPR('mutsumi', 'left'), SPR('anon', 'right', true)], who: 'mutsumi',
        text: '音が、聞こえない。',
        next: 'n5'
      },
      n5: {
        bg: 'room', sprites: [SPR('mutsumi', 'left', true), SPR('anon', 'right')], who: 'anon',
        text: 'うん。練習してるんだけど、鳴らないんだ。……ずっと、前から。',
        next: 'n6'
      },
      n6: {
        bg: 'room', sprites: [SPR('mutsumi', 'left'), SPR('anon', 'right')], who: 'narration',
        text: '她的指尖在弦上动着，像一场没有声音的雨。',
        next: 'n7'
      },
      n7: {
        bg: 'room', sprites: [SPR('mutsumi', 'left', true), SPR('anon', 'right')], who: 'anon',
        text: '選ばれなかった音は、こうなるのかなって。……別に、いいんだけどね。',
        next: 'c1'
      },
      c1: {
        bg: 'room', sprites: [SPR('mutsumi', 'left'), SPR('anon', 'right')],
        choices: [
          {
            text: '「一緒に弾こう」',
            sub: '把吉他拿出来',
            next: 'c1a',
            gain: { cards: ['ensemble'] },
            rewardOnce: 'r_n_c1a'
          },
          {
            text: '「音なら、出せる」',
            sub: '告诉她可以',
            next: 'c1b',
            gain: { cards: ['guitar'] },
            rewardOnce: 'r_n_c1b'
          },
          {
            text: '什么也不说，听她弹',
            sub: '坐在课桌边',
            next: 'c1c',
            gain: { cards: ['matcha'] },
            flag: 'listened',
            rewardOnce: 'r_n_c1c'
          },
          {
            text: '看她的吉他',
            sub: '??',
            next: 'c1',
            gain: { items: ['silent_pick'] },
            once: 'n_c1d',
            hint: '调查'
          }
        ]
      },
      c1a: {
        bg: 'room', sprites: [SPR('mutsumi', 'left'), SPR('anon', 'right')], who: 'anon',
        text: '……え、今？　ここで？　う、うん。いいけど。',
        next: 'c2'
      },
      c1b: {
        bg: 'room', sprites: [SPR('mutsumi', 'left'), SPR('anon', 'right')], who: 'anon',
        text: '出せるって……どうやって？　教えてよ。',
        next: 'c2'
      },
      c1c: {
        bg: 'room', sprites: [SPR('mutsumi', 'left'), SPR('anon', 'right')], who: 'anon',
        text: '……ありがと。誰かに聴いてもらうの、久しぶりかも。',
        next: 'c2'
      },
      c2: {
        bg: 'room', sprites: [SPR('mutsumi', 'left'), SPR('anon', 'right')], who: 'narration',
        text: '教室的门被撞开。立希站在门口，眼睛里没有光。',
        next: 'c2b'
      },
      c2b: {
        bg: 'room', sprites: [SPR('mutsumi', 'left'), SPR('taki', 'right')], who: 'taki',
        text: 'お前、また逃げるのか。……燈を、置いて。',
        next: 'c2c'
      },
      c2c: {
        bg: 'room', sprites: [SPR('mutsumi', 'left'), SPR('taki', 'right', true)], who: 'mutsumi',
        text: 'ちがう。逃げてない。',
        next: 'c2d'
      },
      c2d: {
        bg: 'room', sprites: [SPR('mutsumi', 'left', true), SPR('taki', 'right')], who: 'taki',
        text: 'なら、音で示せ。',
        next: 'b1'
      },
      b1: {
        battle: {
          enemy: {
            id: 'taki_shadow', name: '影・立希', char: 'taki',
            hp: 8, power: 1, draw: 2,
            deck: ['slash', 'slash', 'slash', 'slash', 'slash', 'slash', 'slash', 'dodge', 'dodge', 'matcha'],
            line: '……逃げるな。'
          },
          reward: { cards: ['ensemble'] }
        },
        win: 'n8',
        lose: 'lose1'
      },
      lose1: {
        bg: 'room', sprites: [], who: 'system',
        text: '『……音が、足りない。』',
        next: 'b1'
      },
      n8: {
        bg: 'room', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '影子的鼓棒落地，碎成光。教室的灯一盏盏亮起来。',
        next: 'n8b'
      },
      n8b: {
        bg: 'room', sprites: [SPR('mutsumi', 'left'), SPR('anon', 'right')], who: 'anon',
        text: '……あ。鳴った。ねえ、今の、聞こえた？',
        next: 'n8c'
      },
      n8c: {
        bg: 'room', sprites: [SPR('mutsumi', 'left'), SPR('anon', 'right', true)], who: 'mutsumi',
        text: 'うん。聞こえた。',
        next: 'n8d'
      },
      n8d: {
        bg: 'room', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '爱音弹了一小段，声音很轻，但确实存在。窗外，天色开始发白。',
        next: 'n8e'
      },
      n8e: {
        bg: 'night', sprites: [], who: 'system',
        text: '『第四关，通过。』',
        next: 'n8f'
      },
      n8f: {
        bg: 'night', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '走廊尽头出现新的门，门上写着：『まだ、続く。』',
        next: 'n8g'
      },
      n8g: {
        bg: 'night', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi',
        text: '……帰ろう。今度は、連れて帰る。',
        end: true
      }
    }
  };

  const CH5 = {
    id: '2-2',
    title: '第五话 · 規則の在り処',
    sub: '写下规则的人，是另一个自己。',
    desc: '门后是一间堆满乐谱和台本的事务所。桌上摊着一本厚厚的台本，封面写着「ルールブック」。然后，一个和镜子一样的身影抬起头——她说，规则是她写的，为了谁也不被选上、谁也不会被留下。',
    start: 'm0',
    battleNode: 'b1',
    bg: { archive: '台本の間', archive2: '崩れゆく台本' },
    nodes: {
      m0: {
        bg: 'archive', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '门后不是校舍，也不是舞台。是一间堆满乐谱和台本的事务所，灯泡在头顶轻轻晃。',
        next: 'm1'
      },
      m1: {
        bg: 'archive', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi',
        text: '……ここ、どこ。こんな場所、知らない。',
        next: 'm2'
      },
      m2: {
        bg: 'archive', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '桌上摊着一本厚厚的台本，封面写着「ルールブック」。边角被翻得起了毛。',
        next: 'm3'
      },
      m3: {
        bg: 'archive', sprites: [SPR('mutsumi', 'left'), SPR('mutsumi', 'right')], who: 'narration',
        text: '台本后面抬起头一个人。和镜子一样——一样的脸，一样的发型，只是眼睛的颜色更浅。',
        next: 'm4'
      },
      m4: {
        bg: 'archive', sprites: [SPR('mutsumi', 'left', true), SPR('mutsumi', 'right')], who: 'system',
        text: '「ようこそ。……わたしの、もう一人のわたし。」',
        next: 'm5'
      },
      m5: {
        bg: 'archive', sprites: [SPR('mutsumi', 'left'), SPR('mutsumi', 'right', true)], who: 'mutsumi',
        text: '……あなたは、誰。',
        next: 'm6'
      },
      m6: {
        bg: 'archive', sprites: [SPR('mutsumi', 'left', true), SPR('mutsumi', 'right')], who: 'system',
        text: '「ルールを書いた人。みんなが傷つかないように、歌を切って、幕を下ろさないようにしたの。」',
        next: 'm7'
      },
      m7: {
        bg: 'archive', sprites: [SPR('mutsumi', 'left'), SPR('mutsumi', 'right')], who: 'narration',
        text: '她的声音，和心里的声音一模一样。',
        next: 'm8'
      },
      m8: {
        bg: 'archive', sprites: [SPR('mutsumi', 'left', true), SPR('mutsumi', 'right')], who: 'system',
        text: '「ここにいれば、誰も選ばれない。誰も、置いていかれない。」',
        next: 'c1'
      },
      c1: {
        bg: 'archive', sprites: [SPR('mutsumi', 'left'), SPR('mutsumi', 'right')],
        choices: [
          {
            text: '「ルールを壊す」',
            sub: '打破这个世界的规则',
            next: 'c1a',
            gain: { cards: ['mask'] },
            rewardOnce: 'r_m_c1a'
          },
          {
            text: '「一緒に書こう」',
            sub: '邀请她一起改写',
            next: 'c1b',
            gain: { cards: ['ensemble'] },
            rewardOnce: 'r_m_c1b'
          },
          {
            text: '什么也不说，抱住她',
            sub: '像抱住自己',
            next: 'c1c',
            gain: { cards: ['matcha'] },
            flag: 'hugged',
            rewardOnce: 'r_m_c1c'
          },
          {
            text: '翻开那本台本',
            sub: '??',
            next: 'c1',
            gain: { items: ['rulebook'] },
            once: 'm_c1d',
            hint: '调查'
          }
        ]
      },
      c1a: {
        bg: 'archive', sprites: [SPR('mutsumi', 'left'), SPR('mutsumi', 'right')], who: 'system',
        text: '「……壊す。壊したら、あなたはここに残れなくなる。」',
        next: 'c2'
      },
      c1b: {
        bg: 'archive', sprites: [SPR('mutsumi', 'left'), SPR('mutsumi', 'right')], who: 'system',
        text: '「一緒に？　……わたしと、あなたが。」',
        next: 'c2'
      },
      c1c: {
        bg: 'archive', sprites: [SPR('mutsumi', 'left'), SPR('mutsumi', 'right')], who: 'system',
        text: '「……あたたかい。こんなの、ずっと知らなかった。」',
        next: 'c2'
      },
      c2: {
        bg: 'archive', sprites: [SPR('mutsumi', 'left'), SPR('mutsumi', 'right', true)], who: 'mutsumi',
        text: '……でも。歌わなきゃ、届かない。',
        next: 'c2b'
      },
      c2b: {
        bg: 'archive', sprites: [SPR('mutsumi', 'left', true), SPR('mutsumi', 'right')], who: 'system',
        text: '「なら、わたしを倒して。ルールごと。」',
        next: 'b1'
      },
      b1: {
        battle: {
          enemy: {
            id: 'mortis', name: 'モーティス', char: 'mutsumi',
            hp: 10, power: 2, draw: 2, armor: 2,
            deck: ['slash', 'slash', 'slash', 'slash', 'slash', 'dodge', 'dodge', 'matcha', 'counter', 'counter', 'dismantle', 'dismantle'],
            line: 'わたしは、ルール。'
          },
          reward: { cards: ['mask'] }
        },
        win: 'm9',
        lose: 'lose1'
      },
      lose1: {
        bg: 'archive', sprites: [], who: 'system',
        text: '『ルールは、まだ生きている。』',
        next: 'b1'
      },
      m9: {
        bg: 'archive2', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '台本的书页一页页散开，像被风翻过的乐谱。事务所的墙开始透明。',
        next: 'm9b'
      },
      m9b: {
        bg: 'archive2', sprites: [SPR('mutsumi', 'left'), SPR('mutsumi', 'right')], who: 'system',
        text: '「……あなたの声、聞こえた。あたたかいね。」',
        next: 'm9c'
      },
      m9c: {
        bg: 'archive2', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '她的身影淡下去，最后融进睦的胸口——像一块终于放下的石头。',
        next: 'm9d'
      },
      m9d: {
        bg: 'archive2', sprites: [SPR('mutsumi', 'center')], who: 'system',
        text: '『第五关，通过。』',
        next: 'm9e'
      },
      m9e: {
        bg: 'archive2', sprites: [SPR('mutsumi', 'center')], who: 'narration',
        text: '门外传来很轻的鼓点，一下，一下。像是有人在等。',
        next: 'm9f'
      },
      m9f: {
        bg: 'archive2', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi',
        text: '……行こう。最後の幕まで。',
        end: true
      }
    }
  };

  const CH6 = {
    id: '2-3',
    title: '第六话 · 灯のいない歌',
    sub: '唱不出来的理由。',
    desc: '门后是一间录音室。隔音墙上贴满谱纸，麦克风立在中央，没有声音。灯坐在角落抱着膝盖，嘴唇在动——这一次，不是别人被剪掉，是她自己唱不出来。',
    start: 'v0',
    battleNode: 'b1',
    bg: { studio: '無音の録音室', studio2: '歌の残響' },
    nodes: {
      v0: { bg: 'studio', sprites: [SPR('mutsumi', 'center')], who: 'narration', text: '门后是一间录音室。隔音墙上贴满谱纸，麦克风立在中央，没有声音。', next: 'v1' },
      v1: { bg: 'studio', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi', text: '……レコーディングルーム。見たことある。', next: 'v2' },
      v2: { bg: 'studio', sprites: [SPR('mutsumi', 'center')], who: 'narration', text: '调音台所有的推子都被推到最低。屏幕上滚动着一行行歌词，被红笔划掉了。', next: 'v3' },
      v3: { bg: 'studio', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi', text: 'これ、燈の……。', next: 'v4' },
      v4: { bg: 'studio', sprites: [SPR('tomori', 'center')], who: 'narration', text: '房间角落坐着灯。她抱着膝盖，嘴唇在动——没有声音。', next: 'v5' },
      v5: { bg: 'studio', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right')], who: 'mutsumi', text: '燈。', next: 'v6' },
      v6: { bg: 'studio', sprites: [SPR('mutsumi', 'left', true), SPR('tomori', 'right')], who: 'tomori', text: '……ごめん。声、出ないの。', next: 'v7' },
      v7: { bg: 'studio', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right')], who: 'narration', text: '她的声音像被吸进隔音棉里，连回音都没有。', next: 'v7b' },
      v7b: { bg: 'studio', sprites: [SPR('mutsumi', 'left', true), SPR('tomori', 'right')], who: 'tomori', text: '歌わなきゃって思うんだけど。……歌う理由が、わからなくなっちゃって。', next: 'v7c' },
      v7c: { bg: 'studio', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right', true)], who: 'mutsumi', text: '理由？', next: 'v7d' },
      v7d: { bg: 'studio', sprites: [SPR('mutsumi', 'left', true), SPR('tomori', 'right')], who: 'tomori', text: '誰かのためって言えば、正しいのかな。……でも、それって、わたしの歌？', next: 'c1' },
      c1: {
        bg: 'studio', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right')],
        choices: [
          { text: '「あなたの歌でいい」', sub: '不必为了谁', next: 'c1a', gain: { cards: ['song'] }, rewardOnce: 'r_v_c1a' },
          { text: '「一緒に探そう」', sub: '理由可以慢慢找', next: 'c1b', gain: { cards: ['inspire'] }, rewardOnce: 'r_v_c1b' },
          { text: '什么也不说，握住她的手', sub: '先让她知道有人在', next: 'c1c', gain: { cards: ['matcha'] }, flag: 'held', rewardOnce: 'r_v_c1c' },
          { text: '看调音台上的歌词', sub: '??', next: 'c1', gain: { items: ['lyrics'] }, once: 'v_c1d', hint: '调查' }
        ]
      },
      c1a: { bg: 'studio', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right')], who: 'tomori', text: '……わたしの、でいいの？', next: 'c2' },
      c1b: { bg: 'studio', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right')], who: 'tomori', text: '……一緒に。うん。それなら、ちょっとだけ怖くない。', next: 'c2' },
      c1c: { bg: 'studio', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right')], who: 'tomori', text: '……あったかい。手、冷たいのに。', next: 'c2' },
      c2: { bg: 'studio', sprites: [SPR('mutsumi', 'left', true), SPR('tomori', 'right')], who: 'tomori', text: 'わたし、歌うのが怖いんだ。届かなかったら、どうしようって。', next: 'c2b' },
      c2b: { bg: 'studio', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right', true)], who: 'mutsumi', text: '届かなくても、歌っていい。', next: 'c2c' },
      c2c: { bg: 'studio', sprites: [SPR('mutsumi', 'left', true), SPR('tomori', 'right')], who: 'tomori', text: '……ずるいよ、睦ちゃんは。そんなこと言われたら、歌うしかないじゃん。', next: 'c3' },
      c3: { bg: 'studio', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right'), SPR('tomori', 'center')], who: 'narration', text: '隔音门被推开。另一个灯站在门口，手里拿着一沓被划掉的谱纸。', next: 'c3b' },
      c3b: { bg: 'studio', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right'), SPR('tomori', 'center')], who: 'system', text: '「なら、わたしが歌う。あなたの代わりに。……誰にも届かなくても、歌い続ける。」', next: 'c3c' },
      c3c: { bg: 'studio', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right')], who: 'tomori', text: '……わたしの、歌。', next: 'b1' },
      b1: {
        battle: {
          enemy: {
            id: 'tomori_shadow', name: '影・灯', char: 'tomori',
            hp: 11, power: 2, draw: 2, armor: 1, onHitDraw: 1,
            deck: ['slash', 'slash', 'slash', 'slash', 'slash', 'dodge', 'dodge', 'dodge', 'matcha', 'matcha', 'counter'],
            line: '……きこえない。'
          },
          reward: { cards: ['song'] }
        },
        win: 'v8', lose: 'lose1'
      },
      lose1: { bg: 'studio', sprites: [], who: 'system', text: '『……まだ、歌えない。』', next: 'b1' },
      v8: { bg: 'studio2', sprites: [SPR('mutsumi', 'center')], who: 'narration', text: '谱纸散开，像雪。影・灯溶解成一个个音符，浮在半空。', next: 'v8b' },
      v8b: { bg: 'studio2', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right')], who: 'tomori', text: '……あ。今、声が出た。', next: 'v8c' },
      v8c: { bg: 'studio2', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right')], who: 'narration', text: '很轻的一声，像雨滴落在铁皮上。但她确实唱出来了。', next: 'v8d' },
      v8d: { bg: 'studio2', sprites: [SPR('mutsumi', 'left', true), SPR('tomori', 'right')], who: 'tomori', text: '睦ちゃん。わたし、決めた。歌う理由は、あとからつける。', next: 'v8e' },
      v8e: { bg: 'studio2', sprites: [SPR('mutsumi', 'left'), SPR('tomori', 'right', true)], who: 'mutsumi', text: 'うん。', next: 'v8f' },
      v8f: { bg: 'studio2', sprites: [SPR('mutsumi', 'center')], who: 'narration', text: '调音台的推子自己推了上去。屏幕上，被划掉的歌词一行行恢复了颜色。', next: 'v8g' },
      v8g: { bg: 'studio2', sprites: [SPR('mutsumi', 'center')], who: 'system', text: '『第六关，通过。』', next: 'v8h' },
      v8h: { bg: 'studio2', sprites: [SPR('mutsumi', 'center')], who: 'tomori', text: '……次は、睦ちゃんの番だよ。', end: true }
    }
  };

  const CH7 = {
    id: '2-4',
    title: '第七话 · 規則の外側',
    sub: '规则，是所有人怕结束的心。',
    desc: '事务所的墙已经透明，外面是无边的黑。台本浮在半空自己翻页，四个人影站在四周看着睦。最后一页是空白的——而空白，才是这个世界最害怕的东西。',
    start: 'w0',
    battleNode: 'b1',
    final: true,
    act: '第 二 幕',
    bg: { void2: '崩れゆく事務所', void3: '白いページ' },
    nodes: {
      w0: { bg: 'void2', sprites: [SPR('mutsumi', 'center')], who: 'narration', text: '事务所的墙已经透明，外面是无边的黑。台本浮在半空，自己一页页翻动。', next: 'w1' },
      w1: { bg: 'void2', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi', text: '……まだ、終わってない。', next: 'w2' },
      w2: { bg: 'void2', sprites: [SPR('mutsumi', 'center')], who: 'narration', text: '四个人影站在四周。祥子、素世、爱音、立希。她们都不说话，只是看着。', next: 'w3' },
      w3: { bg: 'void2', sprites: [SPR('mutsumi', 'left'), SPR('sakiko', 'right')], who: 'sakiko', text: '睦。……行くの？', next: 'w4' },
      w4: { bg: 'void2', sprites: [SPR('mutsumi', 'left'), SPR('soyo', 'right')], who: 'soyo', text: '行くなら、ちゃんと挨拶してからにしなさいよ。', next: 'w5' },
      w5: { bg: 'void2', sprites: [SPR('mutsumi', 'left'), SPR('anon', 'right')], who: 'anon', text: 'えー、置いてくの？　ひどくない？', next: 'w6' },
      w6: { bg: 'void2', sprites: [SPR('mutsumi', 'left'), SPR('taki', 'right')], who: 'taki', text: '……早く行け。待たせるな。', next: 'w7' },
      w7: { bg: 'void2', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi', text: '……みんな。', next: 'w8' },
      w8: { bg: 'void2', sprites: [SPR('mutsumi', 'center')], who: 'narration', text: '台本「ルールブック」浮起，书页翻到最后一页——空白的。', next: 'w9' },
      w9: { bg: 'void2', sprites: [SPR('mutsumi', 'center')], who: 'system', text: '「終わらせない。それが、みんなの願いでしょう。」', next: 'w10' },
      w10: { bg: 'void2', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi', text: '終わるから、次が始まる。', next: 'c1' },
      c1: {
        bg: 'void2', sprites: [SPR('mutsumi', 'center')],
        choices: [
          { text: '「ルールを破る」', sub: '把这本书合上', next: 'c1a', gain: { cards: ['solo'] }, rewardOnce: 'r_w_c1a' },
          { text: '「みんなで帰る」', sub: '一个都不留', next: 'c1b', gain: { cards: ['song'] }, rewardOnce: 'r_w_c1b' },
          { text: '什么也不说，向门走去', sub: '用行动回答', next: 'c1c', gain: { cards: ['mask'] }, flag: 'walked', rewardOnce: 'r_w_c1c' },
          { text: '翻开最后一页', sub: '??', next: 'c1', gain: { items: ['blank_page'] }, once: 'w_c1d', hint: '调查' }
        ]
      },
      c1a: { bg: 'void2', sprites: [SPR('mutsumi', 'center')], who: 'system', text: '「……壊すのね。せっかく、誰も傷つかないように書いたのに。」', next: 'c2' },
      c1b: { bg: 'void2', sprites: [SPR('mutsumi', 'center')], who: 'system', text: '「帰る？　ここには、もう帰る場所なんて。」', next: 'c2' },
      c1c: { bg: 'void2', sprites: [SPR('mutsumi', 'center')], who: 'system', text: '「……答えないの。ずるい子。」', next: 'c2' },
      c2: { bg: 'void2', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi', text: '帰る場所は、作る。わたしが。', next: 'c2b' },
      c2b: { bg: 'void2', sprites: [SPR('mutsumi', 'center')], who: 'system', text: '「……なら、示しなさい。終わっても、歌は残るって。」', next: 'b1' },
      b1: {
        battle: {
          enemy: {
            id: 'rule', name: 'ルール', char: 'mutsumi',
            hp: 12, power: 2, draw: 2, armor: 2,
            deck: ['slash', 'slash', 'slash', 'dodge', 'dodge', 'matcha', 'matcha', 'counter', 'counter', 'counter', 'dismantle', 'dismantle'],
            line: '「終わらせない。」'
          },
          reward: { cards: ['solo'] }
        },
        win: 'w11', lose: 'lose1'
      },
      lose1: { bg: 'void2', sprites: [], who: 'system', text: '『まだ、終われない。』', next: 'b1' },
      w11: { bg: 'void3', sprites: [SPR('mutsumi', 'center')], who: 'narration', text: '书页烧起来，字化成光。空白的最后一页上，慢慢浮出一行字：「まだ、歌える。」', next: 'w11b' },
      w11b: { bg: 'void3', sprites: [SPR('mutsumi', 'left'), SPR('sakiko', 'right')], who: 'sakiko', text: '……行ってらっしゃい。', next: 'w11c' },
      w11c: { bg: 'void3', sprites: [SPR('mutsumi', 'left'), SPR('soyo', 'right')], who: 'soyo', text: '待ってるから。ちゃんと、戻ってきなさいよ。', next: 'w11d' },
      w11d: { bg: 'void3', sprites: [SPR('mutsumi', 'left'), SPR('anon', 'right')], who: 'anon', text: 'ちゃんと戻ってきてよね！　約束だから！', next: 'w11e' },
      w11e: { bg: 'void3', sprites: [SPR('mutsumi', 'left'), SPR('taki', 'right')], who: 'taki', text: '……次は、遅刻すんな。', next: 'w11f' },
      w11f: { bg: 'void3', sprites: [SPR('mutsumi', 'center')], who: 'narration', text: '事务所彻底散开。睦走向最后一扇门，门上写着「最終幕」。', next: 'w11g' },
      w11g: { bg: 'void3', sprites: [SPR('mutsumi', 'center')], who: 'system', text: '『第七关，通过。』', next: 'w11h' },
      w11h: { bg: 'void3', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi', text: '……行くよ。わたしの声で、終わらせに。', end: true }
    }
  };

  const CH8 = {
    id: '3-1',
    title: '第八话 · 最終幕',
    sub: '幕，由我们自己来下。',
    desc: '最后一扇门后是舞台。观众席坐满了影子，四支麦克风立在中央，幕布垂下来，像一堵墙。那个声音说：终わらせない。睦拿起吉他，四个人的声音同时从麦克风里响起。',
    start: 'x0',
    battleNode: 'b1',
    final: true,
    act: '第 三 幕',
    bg: { laststage: '最後の舞台', after: '幕のあと' },
    nodes: {
      x0: { bg: 'laststage', sprites: [SPR('mutsumi', 'center')], who: 'narration', text: '最后一扇门后是舞台。观众席坐满了影子，安静得像屏住呼吸。', next: 'x1' },
      x1: { bg: 'laststage', sprites: [SPR('mutsumi', 'center')], who: 'narration', text: '舞台中央立着四支麦克风，和一个空着的吉他架。', next: 'x2' },
      x2: { bg: 'laststage', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi', text: '……わたしの、場所。', next: 'x3' },
      x3: { bg: 'laststage', sprites: [], who: 'narration', text: '幕布从上方垂下来，垂到睦的脚边。幕布上没有字，却有一个声音。', next: 'x4' },
      x4: { bg: 'laststage', sprites: [], who: 'system', text: '「終わらせない。幕は、下ろさない。」', next: 'x5' },
      x5: { bg: 'laststage', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi', text: '下ろすよ。……わたしが。', next: 'x6' },
      x6: { bg: 'laststage', sprites: [SPR('mutsumi', 'center')], who: 'narration', text: '睦把吉他接上音箱。第一个和弦响起来的时候，四支麦克风同时亮了。', next: 'x7' },
      x7: { bg: 'laststage', sprites: [SPR('mutsumi', 'center')], who: 'sakiko', text: '「……睦。合わせて。」', next: 'x8' },
      x8: { bg: 'laststage', sprites: [SPR('mutsumi', 'center')], who: 'soyo', text: '「ベース、入れるわよ。」', next: 'x9' },
      x9: { bg: 'laststage', sprites: [SPR('mutsumi', 'center')], who: 'anon', text: '「ギター、負けないから！」', next: 'x10' },
      x10: { bg: 'laststage', sprites: [SPR('mutsumi', 'center')], who: 'taki', text: '「……ドラム、行くぞ。」', next: 'c1' },
      c1: {
        bg: 'laststage', sprites: [SPR('mutsumi', 'center')],
        choices: [
          { text: '「みんなで、歌う」', sub: '把声音合在一起', next: 'c1a', gain: { cards: ['finale'] }, rewardOnce: 'r_x_c1a' },
          { text: '「ひとりでも、歌う」', sub: '先由自己开始', next: 'c1b', gain: { cards: ['solo'] }, rewardOnce: 'r_x_c1b' },
          { text: '什么也不说，弹下第一个音', sub: '用琴声代替回答', next: 'c1c', gain: { cards: ['guitar'] }, flag: 'first_note', rewardOnce: 'r_x_c1c' },
          { text: '看幕布上的字', sub: '??', next: 'c1', gain: { items: ['curtain'] }, once: 'x_c1d', hint: '调查' }
        ]
      },
      c1a: { bg: 'laststage', sprites: [SPR('mutsumi', 'center')], who: 'narration', text: '四个声音叠在一起，舞台的地板开始震动。', next: 'c2' },
      c1b: { bg: 'laststage', sprites: [SPR('mutsumi', 'center')], who: 'narration', text: '只有一个音，却比任何一次都清楚。', next: 'c2' },
      c1c: { bg: 'laststage', sprites: [SPR('mutsumi', 'center')], who: 'narration', text: '弦声响起的瞬间，观众席上的影子一齐抬起了头。', next: 'c2' },
      c2: { bg: 'laststage', sprites: [SPR('mutsumi', 'center')], who: 'system', text: '「……なら、見せなさい。その音が、終わりに値するか。」', next: 'b1' },
      b1: {
        battle: {
          enemy: {
            id: 'curtain', name: '終幕', char: 'sakiko',
            hp: 14, power: 2, draw: 2, armor: 2, phase2: true, onHitDraw: 0,
            deck: ['slash', 'slash', 'slash', 'slash', 'slash', 'dodge', 'dodge', 'matcha', 'matcha', 'counter', 'counter', 'dismantle', 'dismantle'],
            line: '「幕は、下ろさない。」'
          },
          reward: { cards: ['finale'] }
        },
        win: 'x11', lose: 'lose1'
      },
      lose1: { bg: 'laststage', sprites: [], who: 'system', text: '『……まだ、終われない。』', next: 'b1' },
      x11: { bg: 'after', sprites: [SPR('mutsumi', 'center')], who: 'narration', text: '幕布从中间裂开。光落下来，观众席上的影子一个接一个站了起来，鼓掌。', next: 'x11b' },
      x11b: { bg: 'after', sprites: [SPR('mutsumi', 'center')], who: 'sakiko', text: '「……お疲れさま。睦。」', next: 'x11c' },
      x11c: { bg: 'after', sprites: [SPR('mutsumi', 'center')], who: 'soyo', text: '「ちゃんと、帰ってきたじゃない。」', next: 'x11d' },
      x11d: { bg: 'after', sprites: [SPR('mutsumi', 'center')], who: 'anon', text: '「ねえねえ、今のすっごく良かったよ！　録音しよ！」', next: 'x11e' },
      x11e: { bg: 'after', sprites: [SPR('mutsumi', 'center')], who: 'taki', text: '「……次は、最初から合わせるぞ。」', next: 'x11f' },
      x11f: { bg: 'after', sprites: [SPR('mutsumi', 'center')], who: 'narration', text: '睁开眼。是熟悉的休息室。四个人围着她，谁都没有说话，只是笑着。', next: 'x11g' },
      x11g: { bg: 'after', sprites: [SPR('mutsumi', 'center')], who: 'mutsumi', text: '……歌えた。わたしの声で。', next: 'x11h' },
      x11h: { bg: 'after', sprites: [SPR('mutsumi', 'center')], who: 'system', text: '『第八关，通过。——まだ、続く。』', end: true }
    }
  };

  root.JGSStory = {
    chapters: { '1-1': CH1, '1-2': CH2, '1-3': CH3, '2-1': CH4, '2-2': CH5, '2-3': CH6, '2-4': CH7, '3-1': CH8 },
    order: ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '2-4', '3-1']
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
