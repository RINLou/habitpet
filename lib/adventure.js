// adventure.js — 星图冒险 MVP：每日一次、非数值、与真实投喂绑定的轻探索
'use strict';

const NODE_CATALOG = [
  {
    id: 'starlight-gate', icon: '✦', name: '星海关口', region: '星海边境',
    desc: '把今天的心光送上星图，听见远方灵伴的回声。',
    stories: [
      '一颗暗淡的星星重新亮起，给你的灵伴指了方向。',
      '星海守门人记下了你的脚步：做到的小事，也能照亮远方。'
    ]
  },
  {
    id: 'ember-trail', icon: '🔥', name: '赤曜荒原', region: '焰光边境',
    desc: '穿过温热的风沙，寻找一枚还没有熄灭的心光种子。',
    stories: [
      '灵伴用尾巴护住心光种子，风沙里留下了一条回家的路。',
      '你们在余烬里发现一枚勇气印记，它被收入星海图鉴。'
    ]
  },
  {
    id: 'moon-tide', icon: '🌙', name: '月见潮汐', region: '潮汐边境',
    desc: '沿着月光下的潮线前进，寻找一段会发光的回忆。',
    stories: [
      '潮水退去，露出一枚写着“再试一步”的贝壳。',
      '月光把你的脚印变成小小的星点，灵伴开心地收集起来。'
    ]
  }
];

function defaultState() {
  return {
    lastPlayedOn: null,
    currentNodeId: null,
    visited: [],
    discoveries: [],
    lastResult: null
  };
}

function ensureState(child) {
  if (!child.adventure || typeof child.adventure !== 'object') child.adventure = defaultState();
  const a = child.adventure;
  if (typeof a.lastPlayedOn !== 'string') a.lastPlayedOn = null;
  if (typeof a.currentNodeId !== 'string') a.currentNodeId = null;
  if (!Array.isArray(a.visited)) a.visited = [];
  if (!Array.isArray(a.discoveries)) a.discoveries = [];
  if (a.lastResult !== null && typeof a.lastResult !== 'object') a.lastResult = null;
  a.visited = [...new Set(a.visited.filter(id => NODE_CATALOG.some(n => n.id === id)))].slice(-30);
  a.discoveries = a.discoveries.filter(x => x && typeof x === 'object' && x.nodeId).slice(-30);
  return a;
}

function nodeById(id) { return NODE_CATALOG.find(n => n.id === id) || null; }

function adventureView(child, today) {
  const a = ensureState(child);
  const completedToday = a.lastPlayedOn === today;
  const canPlay = !!child.pet && !child.fainted && !child.pausedAt && child.feedDate === today && !completedToday;
  return {
    available: canPlay,
    completedToday,
    lastPlayedOn: a.lastPlayedOn,
    currentNodeId: a.currentNodeId,
    visited: a.visited.slice(),
    discoveries: a.discoveries.slice(-10),
    lastResult: a.lastResult,
    nodes: NODE_CATALOG.map(n => ({
      id: n.id, icon: n.icon, name: n.name, region: n.region, desc: n.desc,
      visited: a.visited.includes(n.id)
    }))
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
  const story = node.stories[a.visited.length % node.stories.length];
  const result = {
    nodeId: node.id, nodeName: node.name, region: node.region,
    icon: node.icon, story, visitedCount: a.visited.length + 1,
    discoveredAt: new Date().toISOString()
  };
  a.lastPlayedOn = today;
  a.currentNodeId = node.id;
  if (!a.visited.includes(node.id)) a.visited.push(node.id);
  a.discoveries.push(result);
  a.lastResult = result;
  return { ok: true, repeated: false, result };
}

module.exports = { NODE_CATALOG, defaultState, ensureState, adventureView, explore };
