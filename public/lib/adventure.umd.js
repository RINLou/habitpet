// adventure.umd.js — 自动生成（gen_umd.js，源：lib/adventure.js）。勿手改，改源后重新生成。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AdventureMod = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
// adventure.js — 灵汐大陆首章：7 日线性星图、签名事件与轻量随机奇遇
'use strict';

const CHAPTER = {
  id: 'first-starlight',
  title: '第一章·熄灭的七盏灵灯',
  subtitle: '连续七天，找回七束心光；不必完美，也能重新点亮前路。',
  totalDays: 7
};

// 前三个 ID 保留，避免旧客户端/历史记录失效。choices 只影响叙事，不参与数值结算。
const NODE_CATALOG = [
  {
    day: 1, id: 'starlight-gate', icon: '✦', name: '星海关口', region: '星海边境',
    desc: '第一盏灵灯熄灭了。把今天的心光送上星图，听见远方灵伴的回声。',
    intro: '星海守门人说，七盏灵灯正在逐一变暗。它把一枚微光交给你：每一次真正做到的小事，都能让它亮一点。',
    clue: '灵灯并不要求完美，它只会回应真实的行动。',
    stories: ['一颗暗淡的星星重新亮起，给你的灵伴指了方向。', '星海守门人记下了你的脚步：做到的小事，也能照亮远方。'],
    choices: [
      { id: 'record-promise', label: '先记下今天的愿望', desc: '把微光收进星历。', outcome: '你把愿望写进星历，守门人说：方向不必一下子找全。', route: 'promise' },
      { id: 'follow-spark', label: '顺着微光立刻出发', desc: '追上正在远去的光点。', outcome: '灵伴追上微光，关口后浮出一条从未见过的星路。', route: 'spark' }
    ]
  },
  {
    day: 2, id: 'ember-trail', icon: '🔥', name: '赤曜荒原', region: '焰光边境',
    desc: '穿过温热的风沙，寻找一枚还没有熄灭的心光种子。',
    intro: '荒原信使抱着一枚将熄的心光种子。它说自己赶路太慢，可能来不及把灯芯送回去。',
    clue: '心光会在愿意停下来帮助别人的人身边停留。',
    stories: ['灵伴用尾巴护住心光种子，风沙里留下了一条回家的路。', '你们在余烬里发现一枚勇气印记，它被收入星海图鉴。'],
    choices: [
      { id: 'escort-messenger', label: '陪信使一起走', desc: '慢一点，但不让它独自赶路。', outcome: '你们放慢脚步，种子在队伍中央重新亮了起来。', route: 'companion' },
      { id: 'trace-ash', label: '追踪风沙里的浊气', desc: '先找出是谁吹散了灯火。', outcome: '你在余烬间发现一串奇怪足迹，方向指向月见潮汐。', route: 'trace' }
    ]
  },
  {
    day: 3, id: 'moon-tide', icon: '🌙', name: '月见潮汐', region: '潮汐边境',
    desc: '沿着月光下的潮线前进，寻找一段会发光的回忆。',
    intro: '潮水退去，一段被抹去的星历浮出水面：七盏灯曾同时照亮大陆，却有人把“重新开始”那一页撕走了。',
    clue: '当人们只记得没做到的事，浊气便有了声音。',
    stories: ['潮水退去，露出一枚写着“再试一步”的贝壳。', '月光把你的脚印变成小小的星点，灵伴开心地收集起来。'],
    choices: [
      { id: 'keep-shell', label: '留下“再试一步”的贝壳', desc: '把它收进星历，提醒未来的自己。', outcome: '贝壳在掌心发热，映出影桥回廊的一道微光。', route: 'remember' },
      { id: 'return-shell', label: '把贝壳还给潮汐', desc: '让下一个迷路的人也能找到它。', outcome: '潮水带走贝壳，又在远处推来一张写有影桥名字的纸灯。', route: 'share' }
    ]
  },
  {
    day: 4, id: 'shadow-bridge', icon: '🌉', name: '影桥回廊', region: '暮影峡谷',
    desc: '穿过会回应脚步的长桥，学会和犹豫相处。',
    intro: '影桥把每个人没能完成的约定映在桥面。你的影子没有拦路，只是轻声问：今天还愿意再走一步吗？',
    clue: '浊气最喜欢把一次中断，说成永远的失败。',
    stories: ['影子没有挡路，它只是提醒你：慢一点也仍在前进。', '桥下传来一声轻响，灵伴找到了一枚勇敢的回声。'],
    choices: [
      { id: 'speak-to-shadow', label: '和影子说说话', desc: '承认自己也会有没做到的时候。', outcome: '影子退到你身后，变成一盏不刺眼的小灯。', route: 'accept' },
      { id: 'cross-together', label: '牵着灵伴一起过桥', desc: '不解释，先一起迈出下一步。', outcome: '灵伴先踏上桥面，桥的回声变成了为你们数拍子的节奏。', route: 'together' }
    ]
  },
  {
    day: 5, id: 'green-rain', icon: '🌿', name: '翠雨林地', region: '森语边境',
    desc: '在温柔的绿雨里收集一颗愿意发芽的种子。',
    intro: '绿雨告诉你，最后两盏灵灯需要的不是更大的火，而是有人愿意相信一颗小种子也会发芽。',
    clue: '被照顾的愿望会慢慢生根，也会学着照亮别人。',
    stories: ['一片叶子为你们撑起小伞，雨声变成了轻快的鼓点。', '种子在掌心眨了眨眼：被照顾的愿望，总会找到春天。'],
    choices: [
      { id: 'plant-seed', label: '把种子种在这里', desc: '留给后来经过的人。', outcome: '雨后长出一盏嫩绿的小灯，它答应会替你守望林地。', route: 'plant' },
      { id: 'carry-seed', label: '带着种子继续走', desc: '让它看看星心圣所的光。', outcome: '种子贴近灵伴的掌心，发出和第六盏灯一样的微弱频率。', route: 'carry' }
    ]
  },
  {
    day: 6, id: 'stone-pass', icon: '⛰️', name: '磐石隘口', region: '大地边境',
    desc: '沿着古老的石阶上行，面对守着最后灯芯的浊灵。',
    intro: '浊灵守着灯芯说：“你们总会停下，为什么还要点灯？” 它不是来考验你强不强，而是忘记了人可以重新开始。',
    clue: '真正的勇气不是从不跌倒，而是在跌倒后知道下一步往哪里走。',
    stories: ['每一步都很重，但石阶记住了你没有放弃。', '山风翻开一页旧地图，终点的星光已经近在眼前。'],
    choices: [
      { id: 'show-footprints', label: '给浊灵看一路的脚印', desc: '告诉它，你们不是没有停过。', outcome: '浊灵看见每一次停下后的新脚印，沉默着让开了灯芯。', route: 'footprints' },
      { id: 'share-light', label: '分给浊灵一束心光', desc: '让它亲眼看看光会怎样回来。', outcome: '浊灵接住心光，身上的黑雾淡成一只迷路的小影兽。', route: 'share-light' }
    ]
  },
  {
    day: 7, id: 'starheart-sanctum', icon: '💫', name: '星心圣所', region: '灵汐核心',
    desc: '把七日收集的心光交给圣所，决定最后一束光要照向哪里。',
    intro: '七盏灵灯终于同时亮起。星心圣所把最后一束心光交给你：它不会替你决定要成为怎样的守光者。',
    clue: '灯光会熄灭，但愿意再次伸手的人，永远能找到新的火种。',
    stories: ['七颗心光合成一条星河，灵伴说：明天，我们还可以再走一步。', '圣所为你们留下一枚回访印记，故事暂时结束，旅程没有。'],
    choices: [
      { id: 'ending-courage', label: '照亮最远的星路', desc: '让更多人看见前方。', outcome: '最远处的星路亮了起来。你获得结语「星路守望者」。', route: 'courage', ending: { id: 'courage', title: '星路守望者', story: '你把光送往更远的地方。勇气不是从不害怕，而是知道有人会沿着你的灯继续前行。' } },
      { id: 'ending-kindness', label: '留给迷路的小影兽', desc: '先照亮眼前需要帮助的人。', outcome: '小影兽在灯下找回名字。你获得结语「灯下同行者」。', route: 'kindness', ending: { id: 'kindness', title: '灯下同行者', story: '你把光留给眼前的人。理解不是替别人走路，而是让对方知道自己不必独自回家。' } },
      { id: 'ending-return', label: '收进明天的愿望球', desc: '给下一次开始留一束光。', outcome: '愿望球轻轻回应。你获得结语「再启火种」。', route: 'return', ending: { id: 'return', title: '再启火种', story: '你把光留给明天。真正的坚持不是从不断下，而是在中断后仍愿意再次出发。' } }
    ]
  }
];

// 主线共三章。每章七日，所有选择只沉淀为剧情收藏，不参与数值结算。
const CHAPTER_2 = {
  id: 'moon-echo', title: '第二章·月影回廊的回声', subtitle: '找回被浊气藏起的名字，让每一种声音都能被听见。', totalDays: 7,
  archiveName: '月影档案',
  nodes: [
    { day: 1, id: 'lantern-ferry', icon: '🏮', name: '纸灯渡口', region: '月潮外湾', desc: '第一批纸灯漂回岸边，却没有写上该送往谁。', intro: '星心圣所传来求救：月影回廊里的名字正在消失。没有名字的纸灯，会在海上一直打转。', clue: '被叫到名字的人，会想起自己并不孤单。', stories: ['一盏纸灯贴上你的掌心，灯芯写下了一个差点被遗忘的名字。'], choices: [{ id: 'read-lantern', label: '先读出纸灯上的名字', desc: '让渡口听见它。', outcome: '名字被念出的瞬间，纸灯朝月影回廊慢慢转身。', route: 'voice' }, { id: 'follow-current', label: '顺着纸灯的潮流出发', desc: '先找到它们要去的地方。', outcome: '你们跟着纸灯，在潮面看见一串通往风钟塔的光点。', route: 'current' }] },
    { day: 2, id: 'wind-clock', icon: '🕰️', name: '风钟塔', region: '晨风高地', desc: '钟摆停在“来不及”的那一刻，整座塔都不敢再响。', intro: '守塔人说，它漏掉一次报时后就不敢继续转动钟摆。浊气把那次失误挂成了永远的标签。', clue: '一次错过，不会把后面的时间拿走。', stories: ['风钟重新敲出第一声，山谷里有许多人抬头回应。'], choices: [{ id: 'restart-clock', label: '陪它从下一刻重新报时', desc: '不追问错过的那一刻。', outcome: '钟摆从“现在”开始摆动，风把新的节奏送往湖面。', route: 'restart' }, { id: 'keep-time', label: '写下后来仍被守住的时刻', desc: '让它看见已经做到的事。', outcome: '塔墙亮起许多小刻痕：原来它从没真正停下。', route: 'remember' }] },
    { day: 3, id: 'mirror-lake', icon: '🪞', name: '镜湖浅滩', region: '月影回廊', desc: '湖面会映出别人对你的期待，也会把自己的声音压得很小。', intro: '镜湖问你：“如果大家都在看，你还会按自己的步子走吗？” 灵伴没有替你回答，只在身旁等。', clue: '别人的期待可以参考，自己的声音也该有位置。', stories: ['镜面上的影子不再模仿别人，第一次跟着你自己的脚步移动。'], choices: [{ id: 'speak-own-name', label: '说出自己的名字和愿望', desc: '让湖面认识真正的你。', outcome: '湖水为你的声音留出一圈安静的光。', route: 'self' }, { id: 'ask-companion', label: '先听听灵伴怎么想', desc: '从同行者的眼里找答案。', outcome: '灵伴说：你走得快或慢，它都会认出你。', route: 'trust' }] },
    { day: 4, id: 'whisper-archive', icon: '📚', name: '低语档案馆', region: '月影回廊', desc: '书页里全是被撕掉的“我还可以再试”。', intro: '档案管理员把一页空白递给你：它不需要漂亮的答案，只需要有人愿意把没说完的话写回来。', clue: '没完成的句子，也能有下一行。', stories: ['空白页浮起一行字：故事不会因为停顿就结束。'], choices: [{ id: 'write-next-line', label: '写下“下一次我想试试”', desc: '给未来留一句话。', outcome: '字迹化成一只小信鸟，飞去寻找失去名字的人。', route: 'next' }, { id: 'leave-space', label: '先留一页空白', desc: '等想说的时候再写。', outcome: '空白页没有催你，却在页角点亮一颗耐心的星。', route: 'space' }] },
    { day: 5, id: 'cloud-garden', icon: '☁️', name: '云庭花园', region: '云穹庭院', desc: '花朵只在听见真心话后开放，每一朵都等了很久。', intro: '花园里的孩子们都怕说错话，于是花苞越来越多，路却越来越窄。', clue: '表达不必完美，真诚会先找到出口。', stories: ['一朵云花开在石缝里，替所有还没开口的人轻轻点头。'], choices: [{ id: 'share-small', label: '分享一件小小的在意', desc: '不用讲得很伟大。', outcome: '最小的花先开了，旁边的花苞也松开一点。', route: 'small' }, { id: 'listen-first', label: '先听别人想说什么', desc: '给声音一个落脚处。', outcome: '一阵风替大家把话传出来，花园亮成柔软的云。', route: 'listen' }] },
    { day: 6, id: 'echo-observatory', icon: '🔭', name: '回声观星台', region: '月影回廊', desc: '浊气把所有回声混成一句：“你不够好，所以不该被听见。”', intro: '观星台上，迷路的小影兽终于承认：它偷走名字，只是怕大家发现它也有不敢开口的时候。', clue: '被理解不是被纵容，而是终于能一起找新的办法。', stories: ['观星镜把嘲笑般的回声拆开，露出里面害怕被忽略的声音。'], choices: [{ id: 'offer-listening', label: '请它把害怕说完', desc: '先让它被听见。', outcome: '小影兽的雾气散成星点，第一次说出自己的名字。', route: 'listen' }, { id: 'return-names', label: '带它一起归还名字', desc: '让修复从一件小事开始。', outcome: '每归还一个名字，观星台便点亮一颗不会刺眼的星。', route: 'repair' }] },
    { day: 7, id: 'moon-wheel', icon: '🌕', name: '月轮剧场', region: '月影回廊', desc: '所有纸灯停在月轮前，等你决定把找回的声音怎样送回大陆。', intro: '月轮剧场不需要一个最响的声音。它需要许多不同的声音，都愿意为彼此留出一点位置。', clue: '真正的合唱，不是每个人唱得一样。', stories: ['月轮转动，纸灯带着名字飞向四方，回声终于不再只剩一种说法。'], choices: [{ id: 'ending-harmony', label: '让不同的声音一起唱', desc: '把位置留给每个人。', outcome: '剧场响起不整齐却温暖的合唱。你获得结语「回声合唱者」。', route: 'harmony', ending: { id: 'harmony', title: '回声合唱者', story: '你让不同的声音彼此听见。理解不是让每个人相同，而是让每个人都能留下自己的位置。' } }, { id: 'ending-letter', label: '把第一封信送给沉默的人', desc: '让一句问候先抵达。', outcome: '一盏纸灯落到最安静的窗前。你获得结语「月下信使」。', route: 'letter', ending: { id: 'letter', title: '月下信使', story: '你把光送给还没准备开口的人。陪伴不是替对方回答，而是让对方知道有人在等。' } }, { id: 'ending-listen', label: '留一段安静给明天', desc: '让回声慢慢沉淀。', outcome: '月轮把安静收进夜色。你获得结语「静听守望者」。', route: 'listen', ending: { id: 'listen', title: '静听守望者', story: '你把安静也当作一种回答。不是每个故事都要马上说完，它们仍值得被耐心等待。' } }] }
  ]
};

const CHAPTER_3 = {
  id: 'star-sea-return', title: '第三章·星海归航', subtitle: '带着三章收集的心光回到星海，学会让不同的步子一起抵达。', totalDays: 7,
  archiveName: '归航星笺',
  nodes: [
    { day: 1, id: 'dawn-harbor', icon: '⚓', name: '曙光港', region: '星海西岸', desc: '归航的船只都在等一盏不会催人的灯塔。', intro: '第一章的灯火、第二章的回声都汇到港口。可船长担心慢的人会让所有人错过潮汐。', clue: '一起前进，不等于每个人必须走同样快。', stories: ['港口的灯塔亮起缓慢却稳定的光，第一艘小船安静离岸。'], choices: [{ id: 'match-pace', label: '为大家定一个能同行的节奏', desc: '让快与慢都有位置。', outcome: '船队排成不会落下任何人的队形，潮汐也放慢了声音。', route: 'pace' }, { id: 'light-shore', label: '先点亮岸边的等候灯', desc: '让还没出发的人不害怕。', outcome: '岸边出现一串暖灯，后来的人知道自己随时能跟上。', route: 'shore' }] },
    { day: 2, id: 'starweave-meadow', icon: '🧵', name: '星织原野', region: '北境草海', desc: '心光丝线缠成死结，谁都担心自己会拖累整张星网。', intro: '原野的织星人告诉你：丝线打结并不说明它坏了，只说明它们需要一点耐心被重新理顺。', clue: '关系不是从不打结，而是愿意一起慢慢解开。', stories: ['一根被理顺的丝线牵起另一根，星网重新有了弹性。'], choices: [{ id: 'untie-together', label: '邀请大家一起解结', desc: '每个人只解一小段。', outcome: '每双手都解开一点，星网比原来更结实。', route: 'together' }, { id: 'mark-knot', label: '先标记最难的结', desc: '承认有些事需要多一点时间。', outcome: '织星人给死结系上蓝丝带：它不再是羞耻，而是下一次相遇的记号。', route: 'mark' }] },
    { day: 3, id: 'compass-whirlpool', icon: '🌀', name: '罗盘漩湾', region: '星海中环', desc: '每个罗盘都指向不同方向，船队开始怀疑谁才是对的。', intro: '漩湾的潮流不断变换，旧地图已经不够用。你们必须决定：听一个答案，还是把线索拼起来。', clue: '遇到新情况时，承认不知道也是寻找答案的开始。', stories: ['不同方向的罗盘在月光下拼成一张新的航图。'], choices: [{ id: 'combine-clues', label: '把每枚罗盘的线索拼起来', desc: '让答案从合作中出现。', outcome: '航图浮出一条弯路，却避开了最深的漩涡。', route: 'combine' }, { id: 'test-current', label: '先派纸船试试潮流', desc: '用一小步验证方向。', outcome: '纸船带回一圈安全的水纹，大家知道下一步该往哪边。', route: 'test' }] },
    { day: 4, id: 'slumber-forest', icon: '🌲', name: '沉眠林海', region: '归航东陆', desc: '林中曾熄灭的灯仍在等待醒来，却害怕再次被风吹暗。', intro: '许多守光者因为中断过一次，就把灯藏进树洞。它们不是放弃，只是不知道怎样再开始。', clue: '重新开始可以很小，小到只把灯拿回手里。', stories: ['一盏沉眠灯在树洞里眨了眨眼，愿意先照亮脚边的一片叶子。'], choices: [{ id: 'hold-lamp', label: '陪它把灯拿出来', desc: '先不要求它照得很远。', outcome: '灯只亮了脚边，却让整片林海看见新的方向。', route: 'hold' }, { id: 'share-stories', label: '讲讲你们也停下过的时刻', desc: '让它知道不只自己会害怕。', outcome: '树洞里传出许多小声音：原来每盏灯都曾等过风停。', route: 'share' }] },
    { day: 5, id: 'windfire-ridge', icon: '🌋', name: '风火脊', region: '赤曜高原', desc: '最后的浊风想让大家比赛谁的火最亮，山脊又开始发烫。', intro: '浊气用最熟悉的话挑拨：只有最快、最响、最亮的人才配被看见。可你们已知道那不是全部。', clue: '光不是用来证明谁更好，而是用来照见一起能走的路。', stories: ['不同颜色的火焰没有互相吞没，而是在风里排成一条长长的归航线。'], choices: [{ id: 'share-flame', label: '把火分给迎风的人', desc: '让队伍不留暗处。', outcome: '每一束火都小一点，却把整条山脊照得更远。', route: 'share' }, { id: 'lower-voice', label: '请大家先放低声音', desc: '听清风真正想说什么。', outcome: '风里原来藏着求救信号，不是挑衅。', route: 'quiet' }] },
    { day: 6, id: 'lighthouse-bridge', icon: '🌉', name: '灯塔长桥', region: '星海核心', desc: '浊气凝成最后一道桥门：它说只要有人落后，归航就不算成功。', intro: '桥门仍在重复旧规则。现在，它不再像怪物，更像一个害怕被落下的回声。', clue: '成功不是没人停下，而是停下时仍有人愿意回头等一等。', stories: ['桥门松开锁链，允许每一种脚步带着自己的节奏通过。'], choices: [{ id: 'wait-at-bridge', label: '留在桥上等最后一位', desc: '让它亲眼看见无人被落下。', outcome: '最后一盏灯抵达时，桥门第一次自己打开。', route: 'wait' }, { id: 'invite-echo', label: '邀请桥门一起归航', desc: '不把害怕的人留在门外。', outcome: '桥门化作一枚航标，答应替后来者指路。', route: 'invite' }] },
    { day: 7, id: 'returning-star-sea', icon: '🌌', name: '归航星海', region: '灵汐大陆', desc: '三章心光汇入星海，新的地图由每个人的脚步共同绘成。', intro: '星海问你：当下一次有人中断、沉默或迷路时，这片大陆最先应该送出什么？', clue: '冒险不会结束在抵达，而会开始在愿意把光留给后来的人。', stories: ['星海没有变成一张完美地图，却多出无数条能重新出发的航线。'], choices: [{ id: 'ending-guide', label: '留下会回头的路标', desc: '让后来的人知道可以回来。', outcome: '星海记下每一条回头路。你获得终章结语「归航引路人」。', route: 'guide', ending: { id: 'guide', title: '归航引路人', story: '你把光留在能回头的地方。真正的远行，不是永不迷路，而是知道迷路后仍有路可走。' } }, { id: 'ending-garden', label: '种下一片愿望的花园', desc: '让每种小愿望都有地方长大。', outcome: '星海长出一片不会比较高低的花园。你获得终章结语「星愿园丁」。', route: 'garden', ending: { id: 'garden', title: '星愿园丁', story: '你让不同的愿望一起生长。成长不是变成同一种花，而是在自己的季节里开一次。' } }, { id: 'ending-companion', label: '把灯交给下一位同行者', desc: '让冒险继续传下去。', outcome: '一束心光飞向新的愿望球。你获得终章结语「灯火同行者」。', route: 'companion', ending: { id: 'companion', title: '灯火同行者', story: '你把灯交给下一位同行者。陪伴不是替人走完路，而是愿意并肩走出第一步。' } }] }
  ]
};

const CHAPTERS = [Object.assign({ archiveName: '旧星历' }, CHAPTER, { nodes: NODE_CATALOG }), CHAPTER_2, CHAPTER_3];
const CHAPTER_BY_ID = Object.fromEntries(CHAPTERS.map(c => [c.id, c]));
const ALL_NODES = CHAPTERS.flatMap(c => c.nodes.map(n => ({ ...n, chapterId: c.id, chapterTitle: c.title, archiveName: c.archiveName })));

const SIGNATURE_BY_SPECIES = {
  firam: { nodeId: 'ember-trail', icon: '🐺', title: '焰狼的余烬护航', story: '焰狼把余烬拨成一圈小火，替你们照亮了回家的路。' },
  volt: { nodeId: 'starlight-gate', icon: '🦅', title: '雷隼的星门电光', story: '雷隼掠过星门，留下一道短促却明亮的电光。' },
  tidal: { nodeId: 'moon-tide', icon: '🐢', title: '玄龟的潮汐回声', story: '玄龟用脚印丈量潮线，潮水为它让出了一小块月光。' },
  night: { nodeId: 'shadow-bridge', icon: '🐆', title: '影豹的无声过桥', story: '影豹轻轻踏上影桥，桥的另一端第一次没有传来回声。' },
  luna: { nodeId: 'moon-tide', icon: '🦊', title: '灵狐的月见纸灯', story: '灵狐折出一盏月光纸灯，照见了潮汐里的旧愿望。' },
  mount: { nodeId: 'stone-pass', icon: '🐻', title: '岩熊的磐石回响', story: '岩熊推开落石，石壁里传出一句“稳稳走，就会到”。' },
  thorn: { nodeId: 'green-rain', icon: '🦎', title: '棘龙的翠雨新芽', story: '棘龙把一滴绿雨护在掌心，那里长出了一枚小小的新芽。' },
  rime: { nodeId: 'starheart-sanctum', icon: '🐧', title: '霜鹰的圣所霜羽', story: '霜鹰落下三片霜羽，圣所的星火因此变得更加清澈。' }
};

// 每只普通灵伴均有“初见—分歧—确认”三段关系线；不影响属性或战斗强度。
const COMPANION_ARCS = {
  firam: { differenceDay: 2, beats: { meet: ['焰狼的火种约定', '焰狼盯着第一盏灯说：火不是为了烧得最大，而是为了在风里也不熄灭。'], difference: ['焰狼的急与慢', '焰狼想独自冲进风沙，你们最后决定陪信使走完这一段。它第一次学会把火留给同行的人。'], resolve: ['焰狼的守夜火', '焰狼把最后一点余烬留在关口：下次有人害怕出发时，这里会先亮起来。'] } },
  volt: { differenceDay: 3, beats: { meet: ['雷隼的短讯', '雷隼说，最快的闪电也需要一片天空。它愿意替你传递第一条星讯。'], difference: ['雷隼的回信', '雷隼想马上追踪线索，你们决定先读完潮汐留下的残页。它发现慢下来也能听见答案。'], resolve: ['雷隼的远光', '雷隼飞向高空，把七灯的消息送往尚未点亮的边境。'] } },
  tidal: { differenceDay: 3, beats: { meet: ['玄龟的慢潮', '玄龟说，潮水从不催自己，却总能抵达该去的岸。'], difference: ['玄龟的旧壳', '玄龟想把贝壳留在原处。你们聊了很久，明白纪念和继续往前并不冲突。'], resolve: ['玄龟的月路', '玄龟沿着月光画出一条回访潮线，让后来的人也能慢慢抵达。'] } },
  night: { differenceDay: 4, beats: { meet: ['影豹的静默招呼', '影豹没有马上靠近，只把一枚安静的星点放在你脚边。'], difference: ['影豹与影子', '影豹不愿看桥面的影子。你们一起停在桥中间，直到它愿意承认自己也会犹豫。'], resolve: ['影豹的回声', '影豹走过影桥时，桥不再把犹豫变成嘲笑，只留下温柔的回声。'] } },
  luna: { differenceDay: 5, beats: { meet: ['灵狐的纸灯', '灵狐折好一盏小纸灯，说每个愿望都值得有一束不刺眼的光。'], difference: ['灵狐的两种答案', '灵狐想把种子带走，也担心林地没有人照看。你们发现，选择留下或带走都能让愿望继续发芽。'], resolve: ['灵狐的来信', '灵狐把纸灯折成一封信：故事结束后，也可以随时回来读一读。'] } },
  mount: { differenceDay: 6, beats: { meet: ['岩熊的稳步', '岩熊把一块小石头交给你：重一点没关系，走稳就好。'], difference: ['岩熊不想绕路', '岩熊想直接推开浊灵。你们选择先让它看看一路的脚印，岩熊明白力量也可以用来理解。'], resolve: ['岩熊的路标', '岩熊把石头垒成路标，写下“慢一点，也算前进”。'] } },
  thorn: { differenceDay: 5, beats: { meet: ['棘龙的雨芽', '棘龙把雨滴护在背刺之间，告诉你柔软的东西也需要被认真保护。'], difference: ['棘龙怕种子受伤', '棘龙担心种子离开林地会枯萎。你们一起给它做了一个小小的心光盒。'], resolve: ['棘龙的新芽', '棘龙发现种子已经在两处发芽：一处在林地，一处在你们的回访星历里。'] } },
  rime: { differenceDay: 6, beats: { meet: ['霜鹰的清晨', '霜鹰落下一片霜羽：清醒的早晨，也能成为新的开始。'], difference: ['霜鹰的高处', '霜鹰想从高处避开浊灵。你们请它留下来听浊灵说完，霜羽因此不再冰冷。'], resolve: ['霜鹰的星霜', '霜鹰在圣所留下三片星霜，提醒大家：看清自己，也是一种温柔。'] } }
};

const RANDOM_EVENTS = [
  { id: 'star-moth', icon: '🦋', title: '星蛾来信', story: '一只星蛾捎来远方的问候，提醒你小小的坚持也有人看见。' },
  { id: 'echo-postcard', icon: '📮', title: '回声明信片', story: '岩壁寄来一张明信片，上面只有一句：今天也辛苦啦。' },
  { id: 'moon-dew', icon: '💧', title: '月露收藏', story: '灵伴接住一滴月露，里面映出了你们刚刚走过的路。' },
  { id: 'lost-compass', icon: '🧭', title: '迷路的罗盘', story: '一枚迷路的罗盘重新转向星心，像是在说方向可以慢慢找。' },
  { id: 'cloud-whistle', icon: '🎐', title: '云端口哨', story: '云端吹来一声口哨，风把下一步的勇气送到了你们身边。' }
];

function defaultState() {
  return {
    chapterId: CHAPTER.id, chapterDay: 1, completedDays: [], chapterCompletedAt: null,
    chapterCompletions: [], lastPlayedOn: null, currentNodeId: null, visited: [], discoveries: [],
    signatureEvents: [], randomEvents: [], weeklyQuest: null, lastResult: null,
    storyChoices: [], lorePages: [], companionBeats: [], chapterEnding: null, chapterEndings: [], revisitNotes: []
  };
}

function ensureState(child) {
  if (!child.adventure || typeof child.adventure !== 'object') child.adventure = defaultState();
  const a = child.adventure;
  const d = defaultState();
  if (typeof a.chapterId !== 'string' || !CHAPTER_BY_ID[a.chapterId]) a.chapterId = d.chapterId;
  const chapter = CHAPTER_BY_ID[a.chapterId];
  if (!Number.isInteger(a.chapterDay) || a.chapterDay < 1 || a.chapterDay > chapter.totalDays) a.chapterDay = 1;
  if (!Array.isArray(a.completedDays)) a.completedDays = [];
  a.completedDays = [...new Set(a.completedDays.filter(x => Number.isInteger(x) && x >= 1 && x <= chapter.totalDays))].sort((x, y) => x - y);
  if (a.completedDays.length >= chapter.totalDays && !a.chapterCompletedAt) a.chapterCompletedAt = new Date().toISOString();
  if (a.completedDays.length < chapter.totalDays) a.chapterCompletedAt = typeof a.chapterCompletedAt === 'string' ? a.chapterCompletedAt : null;
  if (!Array.isArray(a.chapterCompletions)) a.chapterCompletions = [];
  a.chapterCompletions = a.chapterCompletions.filter(x => x && typeof x === 'object' && CHAPTER_BY_ID[x.chapterId] && typeof x.completedAt === 'string').slice(-9);
  if (typeof a.lastPlayedOn !== 'string') a.lastPlayedOn = null;
  if (typeof a.currentNodeId !== 'string') a.currentNodeId = null;
  if (!Array.isArray(a.visited)) a.visited = [];
  if (!Array.isArray(a.discoveries)) a.discoveries = [];
  if (!Array.isArray(a.signatureEvents)) a.signatureEvents = [];
  if (!Array.isArray(a.randomEvents)) a.randomEvents = [];
  if (a.weeklyQuest !== null && typeof a.weeklyQuest !== 'object') a.weeklyQuest = null;
  if (a.lastResult !== null && typeof a.lastResult !== 'object') a.lastResult = null;
  if (!Array.isArray(a.storyChoices)) a.storyChoices = [];
  if (!Array.isArray(a.lorePages)) a.lorePages = [];
  if (!Array.isArray(a.companionBeats)) a.companionBeats = [];
  if (a.chapterEnding !== null && typeof a.chapterEnding !== 'object') a.chapterEnding = null;
  if (!Array.isArray(a.chapterEndings)) a.chapterEndings = a.chapterEnding ? [a.chapterEnding] : [];
  if (!Array.isArray(a.revisitNotes)) a.revisitNotes = [];
  a.visited = [...new Set(a.visited.filter(id => ALL_NODES.some(n => n.id === id)))].slice(-80);
  a.discoveries = a.discoveries.filter(x => x && typeof x === 'object' && x.nodeId).slice(-80);
  a.signatureEvents = a.signatureEvents.filter(x => typeof x === 'string' || (x && typeof x === 'object')).slice(-30);
  a.randomEvents = a.randomEvents.filter(x => x && typeof x === 'object' && x.id).slice(-60);
  a.storyChoices = a.storyChoices.filter(x => x && typeof x === 'object' && typeof x.nodeId === 'string' && typeof x.choiceId === 'string').slice(-30);
  a.lorePages = a.lorePages.filter(x => x && typeof x === 'object' && typeof x.id === 'string').slice(-30);
  a.companionBeats = a.companionBeats.filter(x => x && typeof x === 'object' && typeof x.id === 'string').slice(-24);
  a.chapterEndings = a.chapterEndings.filter(x => x && typeof x === 'object' && x.chapterId && x.id && x.title && x.story).slice(-CHAPTERS.length);
  a.revisitNotes = a.revisitNotes.filter(x => x && typeof x === 'object' && typeof x.nodeId === 'string').slice(-40);
  if (a.chapterEnding && (!a.chapterEnding.id || !a.chapterEnding.title || !a.chapterEnding.story)) a.chapterEnding = null;
  if (a.completedDays.length && a.chapterDay <= a.completedDays[a.completedDays.length - 1]) a.chapterDay = Math.min(chapter.totalDays, a.completedDays[a.completedDays.length - 1] + 1);
  if (a.completedDays.length >= chapter.totalDays) a.chapterDay = chapter.totalDays;
  return a;
}

function activeChapter(a) { return CHAPTER_BY_ID[a.chapterId] || CHAPTER; }
function chapterIndex(id) { return CHAPTERS.findIndex(c => c.id === id); }
function nodeById(id) { return ALL_NODES.find(n => n.id === id) || null; }
function signatureFor(child, nodeId) {
  const sid = child && child.pet && child.pet.speciesId;
  const s = SIGNATURE_BY_SPECIES[sid];
  return s && s.nodeId === nodeId ? { ...s, speciesId: sid } : null;
}
function companionBeatFor(child, node) {
  const sid = child && child.pet && child.pet.speciesId;
  const arc = COMPANION_ARCS[sid];
  // NODE_CATALOG 是历史公开导出，旧测试/调用方可能直接传入未附 chapterId 的首章节点。
  if (!arc || !node || (node.chapterId && node.chapterId !== CHAPTER.id)) return null;
  let phase = null;
  if (node.day === 1) phase = 'meet';
  else if (node.day === arc.differenceDay) phase = 'difference';
  else if (node.day === CHAPTER.totalDays) phase = 'resolve';
  if (!phase) return null;
  const beat = arc.beats[phase];
  return { id: `${sid}:${phase}`, speciesId: sid, phase, icon: (SIGNATURE_BY_SPECIES[sid] || {}).icon || '✦', title: beat[0], story: beat[1] };
}
function lorePageFor(node) {
  if (!node || !node.clue) return null;
  const chapter = CHAPTER_BY_ID[node.chapterId] || CHAPTER;
  return { id: `${chapter.id}:d${node.day}`, chapterId: chapter.id, chapterTitle: chapter.title, day: node.day, nodeId: node.id, title: `${chapter.archiveName || '星历'}·第 ${node.day} 页`, story: node.clue };
}
function stableHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function randomEventFor(childId, today, nodeId) {
  const hash = stableHash(`${childId || 'child'}|${today}|${nodeId}`);
  if (hash % 100 >= 35) return null;
  return { ...RANDOM_EVENTS[hash % RANDOM_EVENTS.length], key: `${today}:${nodeId}` };
}

function weekKey(today) {
  const d = new Date(`${today}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function weeklyQuestView(child, today, a) {
  if (a.chapterCompletions.length < CHAPTERS.length) return null;
  const wk = weekKey(today);
  const records = a.discoveries.filter(x => x && x.playedOn && weekKey(x.playedOn) === wk);
  const uniqueNodes = new Set(records.map(x => x.nodeId));
  const randomCount = records.filter(x => x.randomEvent).length;
  const signatureCount = records.filter(x => x.signature).length;
  const tasks = [
    { id: 'patrol-3', icon: '🧭', title: '巡游三地', desc: '本周回访 3 个不同地点', target: 3, progress: uniqueNodes.size },
    // 奇遇为确定性 35% 命中；首发版把周目标定为 1，避免回访一周仍被纯随机卡住。
    { id: 'echo-1', icon: '📮', title: '回声邮局', desc: '本周收集 1 个奇遇回声', target: 1, progress: randomCount },
    { id: 'signature-lamp', icon: '🏮', title: '伙伴灯火', desc: '回到灵伴的签名地点 1 次', target: 1, progress: signatureCount }
  ].map(t => ({ ...t, progress: Math.min(t.target, t.progress), done: t.progress >= t.target }));
  return { weekKey: wk, title: '本周回访任务', tasks, completed: tasks.filter(t => t.done).length, total: tasks.length };
}

function adventureView(child, today) {
  const a = ensureState(child);
  const chapter = activeChapter(a);
  const index = chapterIndex(chapter.id);
  const completedToday = a.lastPlayedOn === today;
  const chapterCompleted = a.completedDays.length >= chapter.totalDays || !!a.chapterCompletedAt;
  const current = chapter.nodes.find(n => n.day === a.chapterDay) || null;
  const canPlay = !!child.pet && !child.fainted && !child.pausedAt && child.feedDate === today && !completedToday;
  // 三章全部完成后，回访不再受当前章节限制：已走过的地方都能回去看看
  // （否则「伙伴灯火」等回访任务会因灵伴签名地点都在首章而永远无法完成）
  const campaignDone = a.chapterCompletions.length >= CHAPTERS.length;
  const nodeSource = campaignDone
    ? ALL_NODES.filter(n => a.visited.includes(n.id))
    : chapter.nodes.map(raw => ({ ...raw, chapterId: chapter.id, chapterTitle: chapter.title }));
  const nodes = nodeSource.map(raw => {
    const n = { ...raw, chapterId: raw.chapterId || chapter.id, chapterTitle: raw.chapterTitle || chapter.title };
    const visited = a.visited.includes(n.id);
    let status = 'locked';
    if (chapterCompleted && visited) status = 'revisit';
    else if (a.completedDays.includes(n.day)) status = 'completed';
    else if (!chapterCompleted && n.day === a.chapterDay) status = 'current';
    return { ...n, nextIds: n.day < chapter.totalDays ? [chapter.nodes[n.day].id] : [], visited, status, available: canPlay && (status === 'current' || status === 'revisit') };
  });
  const completedIds = new Set(a.chapterCompletions.map(x => x.chapterId));
  const campaign = {
    currentIndex: index + 1, totalChapters: CHAPTERS.length,
    completedChapters: a.chapterCompletions.slice(),
    nextChapter: chapterCompleted && CHAPTERS[index + 1] ? { id: CHAPTERS[index + 1].id, title: CHAPTERS[index + 1].title } : null,
    completed: completedIds.size >= CHAPTERS.length,
    chapters: CHAPTERS.map((c, i) => ({ id: c.id, title: c.title, subtitle: c.subtitle, index: i + 1, status: c.id === chapter.id ? (chapterCompleted ? 'completed-current' : 'current') : completedIds.has(c.id) ? 'completed' : i === index + 1 && chapterCompleted ? 'unlocked' : 'locked' }))
  };
  return {
    chapter: { id: chapter.id, title: chapter.title, subtitle: chapter.subtitle, totalDays: chapter.totalDays }, chapterDay: a.chapterDay, totalDays: chapter.totalDays,
    completedDays: a.completedDays.slice(), chapterCompleted, chapterCompletedAt: a.chapterCompletedAt || null,
    completedChapters: a.chapterCompletions.slice(), available: canPlay && (chapterCompleted ? a.visited.length > 0 : !!current),
    completedToday, revisitAvailable: chapterCompleted && a.visited.length > 0,
    lastPlayedOn: a.lastPlayedOn, currentNodeId: a.currentNodeId, visited: a.visited.slice(),
    discoveries: a.discoveries.slice(-30), signatureEvents: a.signatureEvents.slice(-10), randomEvents: a.randomEvents.slice(-20),
    story: { choices: a.storyChoices.slice(-30), lorePages: a.lorePages.slice(-30), companionBeats: a.companionBeats.slice(-24), chapterEnding: a.chapterEnding, chapterEndings: a.chapterEndings.slice(), revisitNotes: a.revisitNotes.slice(-12) },
    campaign, weeklyQuest: weeklyQuestView(child, today, a), lastResult: a.lastResult, nodes
  };
}

function advanceChapter(child, today) {
  const a = ensureState(child);
  const chapter = activeChapter(a);
  const index = chapterIndex(chapter.id);
  const chapterCompleted = a.completedDays.length >= chapter.totalDays || !!a.chapterCompletedAt;
  if (!chapterCompleted) return { error: '先完成当前章节，再点亮下一段星图' };
  const next = CHAPTERS[index + 1];
  if (!next) return { error: '主线已经全部完成，可以回访星图与查看相册' };
  a.chapterId = next.id;
  a.chapterDay = 1;
  a.completedDays = [];
  a.chapterCompletedAt = null;
  a.currentNodeId = null;
  a.lastResult = null;
  // 保留 lastPlayedOn，避免在同一天完成一章后又立即推进下一章。
  return { ok: true, chapter: { id: next.id, title: next.title, subtitle: next.subtitle, totalDays: next.totalDays }, advancedAt: today };
}

function explore(child, nodeId, today, choiceId) {
  const a = ensureState(child);
  const chapter = activeChapter(a);
  const node = nodeById(nodeId);
  if (!node) return { error: '星图节点不存在' };
  if (a.lastPlayedOn === today) return { ok: true, repeated: true, result: a.lastResult };
  if (!child.pet) return { error: '先召唤一位灵伴，再开始冒险' };
  if (child.fainted) return { error: '先让灵伴醒来，再继续冒险' };
  if (child.pausedAt) return { error: '休眠茧中不能出发，等准备好再来' };
  if (child.feedDate !== today) return { error: '今天先照顾灵伴；章节进度会保留，明天从原来的地方继续' };
  const campaignDone = a.chapterCompletions.length >= CHAPTERS.length;
  if (node.chapterId !== chapter.id && !(campaignDone && a.visited.includes(node.id))) return { error: '请先在当前章节完成这一段星路' };
  const chapterCompleted = a.completedDays.length >= chapter.totalDays || !!a.chapterCompletedAt;
  if (!chapterCompleted && node.day !== a.chapterDay) return { error: `今天应前往第 ${a.chapterDay} 日节点` };
  if (chapterCompleted && !a.visited.includes(node.id)) return { error: '这片星图还没有留下你的足迹' };
  const choices = Array.isArray(node.choices) ? node.choices : [];
  const choice = choices.find(x => x.id === choiceId) || (!choiceId ? choices[0] : null);
  if (!choice) return { error: '请选择这一段星路要怎样前进' };
  const story = node.stories[(a.discoveries.length + node.day - 1) % node.stories.length];
  const signature = signatureFor(child, node.id);
  const randomEvent = randomEventFor(child.id, today, node.id);
  const lorePage = lorePageFor(node);
  const companionBeat = companionBeatFor(child, node);
  const chapterEnding = !chapterCompleted && node.day === chapter.totalDays ? choice.ending || null : null;
  const result = {
    nodeId: node.id, nodeName: node.name, region: node.region, icon: node.icon, day: node.day, playedOn: today,
    mode: chapterCompleted ? 'revisit' : 'chapter', story, storyIntro: node.intro, clue: node.clue,
    choice: { id: choice.id, label: choice.label, outcome: choice.outcome, route: choice.route },
    visitedCount: a.visited.length + (a.visited.includes(node.id) ? 0 : 1),
    chapterId: chapter.id, chapterTitle: chapter.title,
    nextNodeId: !chapterCompleted && node.day < chapter.totalDays ? chapter.nodes[node.day].id : null,
    signature: signature || null, randomEvent: randomEvent || null, lorePage: lorePage || null,
    companionBeat: companionBeat || null, chapterEnding, discoveredAt: new Date().toISOString()
  };
  a.lastPlayedOn = today; a.currentNodeId = node.id;
  if (!a.visited.includes(node.id)) a.visited.push(node.id);
  if (!chapterCompleted && !a.completedDays.includes(node.day)) a.completedDays.push(node.day);
  a.completedDays.sort((x, y) => x - y);
  if (!chapterCompleted && !a.storyChoices.some(x => x.nodeId === node.id)) a.storyChoices.push({ chapterId: chapter.id, chapterTitle: chapter.title, nodeId: node.id, day: node.day, choiceId: choice.id, label: choice.label, outcome: choice.outcome, playedOn: today });
  if (chapterCompleted) a.revisitNotes.push({ chapterId: chapter.id, chapterTitle: chapter.title, nodeId: node.id, nodeName: node.name, choiceId: choice.id, label: choice.label, outcome: choice.outcome, playedOn: today });
  if (lorePage && !a.lorePages.some(x => x.id === lorePage.id)) a.lorePages.push(lorePage);
  if (companionBeat && !a.companionBeats.some(x => x.id === companionBeat.id)) a.companionBeats.push(companionBeat);
  if (signature && !a.signatureEvents.some(x => (typeof x === 'string' ? x : x.speciesId) === signature.speciesId)) a.signatureEvents.push(signature);
  if (randomEvent && !a.randomEvents.some(x => x.key === randomEvent.key)) a.randomEvents.push(randomEvent);
  if (chapterEnding) {
    a.chapterEnding = { ...chapterEnding, chapterId: chapter.id, chapterTitle: chapter.title, decidedAt: result.discoveredAt };
    if (!a.chapterEndings.some(x => x.chapterId === chapter.id)) a.chapterEndings.push(a.chapterEnding);
  }
  if (!chapterCompleted && node.day === chapter.totalDays) {
    a.chapterCompletedAt = result.discoveredAt;
    if (!a.chapterCompletions.some(x => x.chapterId === chapter.id)) a.chapterCompletions.push({ chapterId: chapter.id, chapterTitle: chapter.title, completedAt: result.discoveredAt, visitedCount: a.visited.length, endingId: (a.chapterEnding || {}).id || null });
    a.chapterCompletions = a.chapterCompletions.slice(-CHAPTERS.length);
  } else if (!chapterCompleted) a.chapterDay = Math.min(chapter.totalDays, node.day + 1);
  a.discoveries.push(result); a.discoveries = a.discoveries.slice(-80); a.lastResult = result;
  return { ok: true, repeated: false, result };
}

return {
  CHAPTER, NODE_CATALOG, CHAPTERS, SIGNATURE_BY_SPECIES, COMPANION_ARCS, RANDOM_EVENTS,
  defaultState, ensureState, adventureView, explore, advanceChapter, randomEventFor, companionBeatFor, lorePageFor
};

});
