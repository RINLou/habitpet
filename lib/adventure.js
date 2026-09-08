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
    storyChoices: [], lorePages: [], companionBeats: [], chapterEnding: null, revisitNotes: []
  };
}

function ensureState(child) {
  if (!child.adventure || typeof child.adventure !== 'object') child.adventure = defaultState();
  const a = child.adventure;
  const d = defaultState();
  if (typeof a.chapterId !== 'string') a.chapterId = d.chapterId;
  if (!Number.isInteger(a.chapterDay) || a.chapterDay < 1 || a.chapterDay > CHAPTER.totalDays) a.chapterDay = 1;
  if (!Array.isArray(a.completedDays)) a.completedDays = [];
  a.completedDays = [...new Set(a.completedDays.filter(x => Number.isInteger(x) && x >= 1 && x <= CHAPTER.totalDays))].sort((x, y) => x - y);
  if (a.completedDays.length >= CHAPTER.totalDays && !a.chapterCompletedAt) a.chapterCompletedAt = new Date().toISOString();
  if (a.completedDays.length < CHAPTER.totalDays) a.chapterCompletedAt = typeof a.chapterCompletedAt === 'string' ? a.chapterCompletedAt : null;
  if (!Array.isArray(a.chapterCompletions)) a.chapterCompletions = [];
  a.chapterCompletions = a.chapterCompletions.filter(x => x && typeof x === 'object' && typeof x.completedAt === 'string').slice(-5);
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
  if (!Array.isArray(a.revisitNotes)) a.revisitNotes = [];
  a.visited = [...new Set(a.visited.filter(id => NODE_CATALOG.some(n => n.id === id)))].slice(-30);
  a.discoveries = a.discoveries.filter(x => x && typeof x === 'object' && x.nodeId).slice(-30);
  a.signatureEvents = a.signatureEvents.filter(x => typeof x === 'string' || (x && typeof x === 'object')).slice(-30);
  a.randomEvents = a.randomEvents.filter(x => x && typeof x === 'object' && x.id).slice(-30);
  a.storyChoices = a.storyChoices.filter(x => x && typeof x === 'object' && typeof x.nodeId === 'string' && typeof x.choiceId === 'string').slice(-12);
  a.lorePages = a.lorePages.filter(x => x && typeof x === 'object' && typeof x.id === 'string').slice(-12);
  a.companionBeats = a.companionBeats.filter(x => x && typeof x === 'object' && typeof x.id === 'string').slice(-24);
  a.revisitNotes = a.revisitNotes.filter(x => x && typeof x === 'object' && typeof x.nodeId === 'string').slice(-20);
  if (a.chapterEnding && (!a.chapterEnding.id || !a.chapterEnding.title || !a.chapterEnding.story)) a.chapterEnding = null;
  if (a.completedDays.length && a.chapterDay <= a.completedDays[a.completedDays.length - 1]) a.chapterDay = Math.min(CHAPTER.totalDays, a.completedDays[a.completedDays.length - 1] + 1);
  if (a.completedDays.length >= CHAPTER.totalDays) a.chapterDay = CHAPTER.totalDays;
  return a;
}

function nodeById(id) { return NODE_CATALOG.find(n => n.id === id) || null; }
function signatureFor(child, nodeId) {
  const sid = child && child.pet && child.pet.speciesId;
  const s = SIGNATURE_BY_SPECIES[sid];
  return s && s.nodeId === nodeId ? { ...s, speciesId: sid } : null;
}
function companionBeatFor(child, node) {
  const sid = child && child.pet && child.pet.speciesId;
  const arc = COMPANION_ARCS[sid];
  if (!arc || !node) return null;
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
  return { id: `first-starlight:d${node.day}`, day: node.day, nodeId: node.id, title: `旧星历·第 ${node.day} 页`, story: node.clue };
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
  if (a.completedDays.length < CHAPTER.totalDays && !a.chapterCompletedAt) return null;
  const wk = weekKey(today);
  const records = a.discoveries.filter(x => x && x.playedOn && weekKey(x.playedOn) === wk);
  const uniqueNodes = new Set(records.map(x => x.nodeId));
  const randomCount = records.filter(x => x.randomEvent).length;
  const signatureCount = records.filter(x => x.signature).length;
  const tasks = [
    { id: 'patrol-3', icon: '🧭', title: '巡游三地', desc: '本周回访 3 个不同地点', target: 3, progress: uniqueNodes.size },
    { id: 'echo-2', icon: '📮', title: '回声邮局', desc: '本周收集 2 个奇遇回声', target: 2, progress: randomCount },
    { id: 'signature-lamp', icon: '🏮', title: '伙伴灯火', desc: '回到灵伴的签名地点 1 次', target: 1, progress: signatureCount }
  ].map(t => ({ ...t, progress: Math.min(t.target, t.progress), done: t.progress >= t.target }));
  return { weekKey: wk, title: '本周回访任务', tasks, completed: tasks.filter(t => t.done).length, total: tasks.length };
}

function adventureView(child, today) {
  const a = ensureState(child);
  const completedToday = a.lastPlayedOn === today;
  const chapterCompleted = a.completedDays.length >= CHAPTER.totalDays || !!a.chapterCompletedAt;
  const current = nodeById(NODE_CATALOG.find(n => n.day === a.chapterDay)?.id);
  const canPlay = !!child.pet && !child.fainted && !child.pausedAt && child.feedDate === today && !completedToday;
  const nodes = NODE_CATALOG.map(n => {
    const visited = a.visited.includes(n.id);
    let status = 'locked';
    if (chapterCompleted && visited) status = 'revisit';
    else if (a.completedDays.includes(n.day)) status = 'completed';
    else if (!chapterCompleted && n.day === a.chapterDay) status = 'current';
    return { ...n, nextIds: n.day < CHAPTER.totalDays ? [NODE_CATALOG[n.day].id] : [], visited, status, available: canPlay && (status === 'current' || status === 'revisit') };
  });
  return {
    chapter: { ...CHAPTER }, chapterDay: a.chapterDay, totalDays: CHAPTER.totalDays,
    completedDays: a.completedDays.slice(), chapterCompleted, chapterCompletedAt: a.chapterCompletedAt || null,
    completedChapters: a.chapterCompletions.slice(), available: canPlay && (chapterCompleted ? a.visited.length > 0 : !!current),
    completedToday, revisitAvailable: chapterCompleted && a.visited.length > 0,
    lastPlayedOn: a.lastPlayedOn, currentNodeId: a.currentNodeId, visited: a.visited.slice(),
    discoveries: a.discoveries.slice(-10), signatureEvents: a.signatureEvents.slice(-10), randomEvents: a.randomEvents.slice(-10),
    story: { choices: a.storyChoices.slice(-7), lorePages: a.lorePages.slice(-7), companionBeats: a.companionBeats.slice(-8), chapterEnding: a.chapterEnding, revisitNotes: a.revisitNotes.slice(-6) },
    weeklyQuest: weeklyQuestView(child, today, a), lastResult: a.lastResult, nodes
  };
}

function explore(child, nodeId, today, choiceId) {
  const a = ensureState(child);
  const node = nodeById(nodeId);
  if (!node) return { error: '星图节点不存在' };
  if (a.lastPlayedOn === today) return { ok: true, repeated: true, result: a.lastResult };
  if (!child.pet) return { error: '先召唤一位灵伴，再开始冒险' };
  if (child.fainted) return { error: '先让灵伴醒来，再继续冒险' };
  if (child.pausedAt) return { error: '休眠茧中不能出发，等准备好再来' };
  if (child.feedDate !== today) return { error: '今天先照顾灵伴；章节进度会保留，明天从原来的地方继续' };
  const chapterCompleted = a.completedDays.length >= CHAPTER.totalDays || !!a.chapterCompletedAt;
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
  const chapterEnding = !chapterCompleted && node.day === CHAPTER.totalDays ? choice.ending || null : null;
  const result = {
    nodeId: node.id, nodeName: node.name, region: node.region, icon: node.icon, day: node.day, playedOn: today,
    mode: chapterCompleted ? 'revisit' : 'chapter', story, storyIntro: node.intro, clue: node.clue,
    choice: { id: choice.id, label: choice.label, outcome: choice.outcome, route: choice.route },
    visitedCount: a.visited.length + (a.visited.includes(node.id) ? 0 : 1),
    nextNodeId: !chapterCompleted && node.day < CHAPTER.totalDays ? NODE_CATALOG[node.day].id : null,
    signature: signature || null, randomEvent: randomEvent || null, lorePage: lorePage || null,
    companionBeat: companionBeat || null, chapterEnding, discoveredAt: new Date().toISOString()
  };
  a.lastPlayedOn = today; a.currentNodeId = node.id;
  if (!a.visited.includes(node.id)) a.visited.push(node.id);
  if (!chapterCompleted && !a.completedDays.includes(node.day)) a.completedDays.push(node.day);
  a.completedDays.sort((x, y) => x - y);
  if (!chapterCompleted && !a.storyChoices.some(x => x.nodeId === node.id)) a.storyChoices.push({ nodeId: node.id, day: node.day, choiceId: choice.id, label: choice.label, outcome: choice.outcome, playedOn: today });
  if (chapterCompleted) a.revisitNotes.push({ nodeId: node.id, nodeName: node.name, choiceId: choice.id, label: choice.label, outcome: choice.outcome, playedOn: today });
  if (lorePage && !a.lorePages.some(x => x.id === lorePage.id)) a.lorePages.push(lorePage);
  if (companionBeat && !a.companionBeats.some(x => x.id === companionBeat.id)) a.companionBeats.push(companionBeat);
  if (signature && !a.signatureEvents.some(x => (typeof x === 'string' ? x : x.speciesId) === signature.speciesId)) a.signatureEvents.push(signature);
  if (randomEvent && !a.randomEvents.some(x => x.key === randomEvent.key)) a.randomEvents.push(randomEvent);
  if (chapterEnding) a.chapterEnding = { ...chapterEnding, decidedAt: result.discoveredAt };
  if (!chapterCompleted && node.day === CHAPTER.totalDays) {
    a.chapterCompletedAt = result.discoveredAt;
    a.chapterCompletions.push({ chapterId: CHAPTER.id, completedAt: result.discoveredAt, visitedCount: a.visited.length, endingId: (a.chapterEnding || {}).id || null });
    a.chapterCompletions = a.chapterCompletions.slice(-5);
  } else if (!chapterCompleted) a.chapterDay = Math.min(CHAPTER.totalDays, node.day + 1);
  a.discoveries.push(result); a.discoveries = a.discoveries.slice(-30); a.lastResult = result;
  return { ok: true, repeated: false, result };
}

module.exports = {
  CHAPTER, NODE_CATALOG, SIGNATURE_BY_SPECIES, COMPANION_ARCS, RANDOM_EVENTS,
  defaultState, ensureState, adventureView, explore, randomEventFor, companionBeatFor, lorePageFor
};
