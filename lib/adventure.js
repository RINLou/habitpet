// adventure.js — 灵汐大陆首章：7 日线性星图、签名事件与轻量随机奇遇
'use strict';

const CHAPTER = {
  id: 'first-starlight',
  title: '首章·星光启程',
  subtitle: '连续七天，把每天的一小步走成一条回家的路。',
  totalDays: 7
};

// 前三个 ID 保留，避免旧客户端/历史记录失效。
const NODE_CATALOG = [
  { day: 1, id: 'starlight-gate', icon: '✦', name: '星海关口', region: '星海边境', desc: '把今天的心光送上星图，听见远方灵伴的回声。', stories: ['一颗暗淡的星星重新亮起，给你的灵伴指了方向。', '星海守门人记下了你的脚步：做到的小事，也能照亮远方。'] },
  { day: 2, id: 'ember-trail', icon: '🔥', name: '赤曜荒原', region: '焰光边境', desc: '穿过温热的风沙，寻找一枚还没有熄灭的心光种子。', stories: ['灵伴用尾巴护住心光种子，风沙里留下了一条回家的路。', '你们在余烬里发现一枚勇气印记，它被收入星海图鉴。'] },
  { day: 3, id: 'moon-tide', icon: '🌙', name: '月见潮汐', region: '潮汐边境', desc: '沿着月光下的潮线前进，寻找一段会发光的回忆。', stories: ['潮水退去，露出一枚写着“再试一步”的贝壳。', '月光把你的脚印变成小小的星点，灵伴开心地收集起来。'] },
  { day: 4, id: 'shadow-bridge', icon: '🌉', name: '影桥回廊', region: '暮影峡谷', desc: '穿过会回应脚步的长桥，学会和犹豫相处。', stories: ['影子没有挡路，它只是提醒你：慢一点也仍在前进。', '桥下传来一声轻响，灵伴找到了一枚勇敢的回声。'] },
  { day: 5, id: 'green-rain', icon: '🌿', name: '翠雨林地', region: '森语边境', desc: '在温柔的绿雨里收集一颗愿意发芽的种子。', stories: ['一片叶子为你们撑起小伞，雨声变成了轻快的鼓点。', '种子在掌心眨了眨眼：被照顾的愿望，总会找到春天。'] },
  { day: 6, id: 'stone-pass', icon: '⛰️', name: '磐石隘口', region: '大地边境', desc: '沿着古老的石阶上行，让坚持留下自己的重量。', stories: ['每一步都很重，但石阶记住了你没有放弃。', '山风翻开一页旧地图，终点的星光已经近在眼前。'] },
  { day: 7, id: 'starheart-sanctum', icon: '💫', name: '星心圣所', region: '灵汐核心', desc: '把七日收集的心光交给圣所，听见大陆的第一句回应。', stories: ['七颗心光合成一条星河，灵伴说：明天，我们还可以再走一步。', '圣所为你们留下一枚回访印记，故事暂时结束，旅程没有。'] }
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
    signatureEvents: [], randomEvents: [], lastResult: null
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
  if (a.lastResult !== null && typeof a.lastResult !== 'object') a.lastResult = null;
  a.visited = [...new Set(a.visited.filter(id => NODE_CATALOG.some(n => n.id === id)))].slice(-30);
  a.discoveries = a.discoveries.filter(x => x && typeof x === 'object' && x.nodeId).slice(-30);
  a.signatureEvents = a.signatureEvents.filter(x => typeof x === 'string' || (x && typeof x === 'object')).slice(-30);
  a.randomEvents = a.randomEvents.filter(x => x && typeof x === 'object' && x.id).slice(-30);
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
    completedToday, revisitAvailable: chapterCompleted && canPlay && a.visited.length > 0,
    lastPlayedOn: a.lastPlayedOn, currentNodeId: a.currentNodeId, visited: a.visited.slice(),
    discoveries: a.discoveries.slice(-10), signatureEvents: a.signatureEvents.slice(-10), randomEvents: a.randomEvents.slice(-10),
    lastResult: a.lastResult, nodes
  };
}

function explore(child, nodeId, today) {
  const a = ensureState(child);
  const node = nodeById(nodeId);
  if (!node) return { error: '星图节点不存在' };
  if (a.lastPlayedOn === today) return { ok: true, repeated: true, result: a.lastResult };
  if (!child.pet) return { error: '先召唤一位灵伴，再开始冒险' };
  if (child.fainted) return { error: '先让灵伴醒来，再继续冒险' };
  if (child.pausedAt) return { error: '休眠茧中不能出发，等准备好再来' };
  if (child.feedDate !== today) return { error: '先完成今天的投喂，心光才够点亮星图' };
  const chapterCompleted = a.completedDays.length >= CHAPTER.totalDays || !!a.chapterCompletedAt;
  if (!chapterCompleted && node.day !== a.chapterDay) return { error: `今天应前往第 ${a.chapterDay} 日节点` };
  if (chapterCompleted && !a.visited.includes(node.id)) return { error: '这片星图还没有留下你的足迹' };
  const story = node.stories[(a.discoveries.length + node.day - 1) % node.stories.length];
  const signature = signatureFor(child, node.id);
  const randomEvent = randomEventFor(child.id, today, node.id);
  const result = {
    nodeId: node.id, nodeName: node.name, region: node.region, icon: node.icon, day: node.day,
    mode: chapterCompleted ? 'revisit' : 'chapter', story, visitedCount: a.visited.length + (a.visited.includes(node.id) ? 0 : 1),
    nextNodeId: !chapterCompleted && node.day < CHAPTER.totalDays ? NODE_CATALOG[node.day].id : null,
    signature: signature || null, randomEvent: randomEvent || null, discoveredAt: new Date().toISOString()
  };
  a.lastPlayedOn = today; a.currentNodeId = node.id;
  if (!a.visited.includes(node.id)) a.visited.push(node.id);
  if (!chapterCompleted && !a.completedDays.includes(node.day)) a.completedDays.push(node.day);
  a.completedDays.sort((x, y) => x - y);
  if (signature && !a.signatureEvents.some(x => (typeof x === 'string' ? x : x.speciesId) === signature.speciesId)) a.signatureEvents.push(signature);
  if (randomEvent && !a.randomEvents.some(x => x.key === randomEvent.key)) a.randomEvents.push(randomEvent);
  if (!chapterCompleted && node.day === CHAPTER.totalDays) {
    a.chapterCompletedAt = result.discoveredAt;
    a.chapterCompletions.push({ chapterId: CHAPTER.id, completedAt: result.discoveredAt, visitedCount: a.visited.length });
    a.chapterCompletions = a.chapterCompletions.slice(-5);
  } else if (!chapterCompleted) a.chapterDay = Math.min(CHAPTER.totalDays, node.day + 1);
  a.discoveries.push(result); a.discoveries = a.discoveries.slice(-30); a.lastResult = result;
  return { ok: true, repeated: false, result };
}

module.exports = { CHAPTER, NODE_CATALOG, SIGNATURE_BY_SPECIES, RANDOM_EVENTS, defaultState, ensureState, adventureView, explore, randomEventFor };
