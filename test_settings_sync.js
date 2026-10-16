'use strict';
// v12.3 设置类同步单测（syncSettings）：验证"采用灵汐设置"是显式开关、默认不碰设置
// 覆盖：默认 apply 不动设置类 / syncSettings 全覆盖（config 白名单+家庭规则+奖励+孩子规则）/
//       semester 不被同步 / 孩子规则按名逐娃同步（孩子3 与老系统一致则不动）/ 幂等 / 数值合并不被破坏
const fs = require('fs'), os = require('os'), path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-settings-'));
process.env.HABITPET_DATA_DIR = dir;   // 必须在 require store 前设置（隔离，不碰真实 data/）
const store = require('./lib/store');
const sync = require('./lib/lingxi_sync');
store.load();   // 直接 require 时 db 为 null，需显式初始化（server.js 启动时也会调）

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, e !== undefined ? JSON.stringify(e).slice(0, 200) : ''); } };

// 源快照：灵汐形状（老设置：投喂10-24点 / 初始羁绊0 / 零花钱0 / r1扣除120 / 柠檬规则3-30 / 孩子3默认1-10）
const OLD_RULES = { feed: 3, quiz: 10, exam: 50, pride: 10, noComplaint: 100, complaint: 50, streak: 30, battleWin: 8, battleLose: 3, coopWin: 10, examMin: 80, quizMin: 80 };
const DEF_RULES = { feed: 1, quiz: 10, exam: 50, pride: 10, noComplaint: 100, complaint: 50, streak: 10, battleWin: 8, battleLose: 3, coopWin: 10, examMin: 80, quizMin: 80 };
const LINGXI_SNAP = {
  pulledAt: '2026-10-16T12:00:00Z', source: 'test', photos: {}, family: {
    id: 'fLxS', name: '设置同步测试家', parent: { username: 'setcase1' }, schemaVersion: 9,
    config: {
      initialIntimacy: 0, baseAllowance: 0, pointsToYuan: 1, feedWindow: { startHour: 10, endHour: 24 },
      weeklyCap: 0, battleDailyLimit: 5, randomEventChance: 0.12, holidayMode: false, absenceMode: 'mercy',
      semester: { name: '新学期', index: 3, startDate: null, autoDone: false }, battleXpDailyCap: 30
    },
    rules: OLD_RULES,
    rewards: [
      { id: 'r1', name: '现金（下月零花钱扣除）', cost: 120, type: 'cash', desc: '1.2分=1元，锁定下月零花钱' },
      { id: 'r2', name: '游戏时间券（1小时）', cost: 30, type: 'ticket', desc: '兑换后7天内使用' }
    ],
    ledger: [], evidenceIds: [],
    children: {
      k1: { id: 'k1', name: '柠檬', grade: 'G5', level: 19, xp: 1204, intimacy: 69, points: 0, feedDate: '2026-10-15', rules: OLD_RULES, redemptions: [], friends: [] },
      k2: { id: 'k2', name: '孩子3', grade: 'G3', level: 1, xp: 0, intimacy: 0, points: 0, feedDate: '', rules: DEF_RULES, redemptions: [], friends: [] }
    }
  }
};

// 目标家庭：新库默认形状 + 两个已有孩子（模拟生产：迁移后规则被重置为默认 1/10）
const r1 = store.createFamily('setcase1', 'pass123', '设置同步测试家', 'q', 'a');
const target = r1.family;
const lemon = store.addChild(target, '柠檬', 'G5');
const kid3 = store.addChild(target, '孩子3', 'G3');
ok('前置:新库默认 config（19-21点/羁绊100/零花钱100）', target.config.feedWindow.startHour === 19 && target.config.initialIntimacy === 100 && target.config.baseAllowance === 100, target.config);
ok('前置:孩子规则为新库默认 1/10', lemon.rules.feed === 1 && lemon.rules.streak === 10, lemon.rules);

// 1) 默认 apply（不带 syncSettings）：设置类一律不动
const beforeRules = JSON.stringify(target.rules);
const beforeR1 = JSON.stringify(target.rewards.find(x => x.id === 'r1'));
const beforeLemon = JSON.stringify(lemon.rules);
sync.applyMigration(store, target, LINGXI_SNAP);
ok('默认:config 不被老设置覆盖（仍19-21/100/100）', target.config.feedWindow.startHour === 19 && target.config.initialIntimacy === 100 && target.config.baseAllowance === 100, target.config);
ok('默认:家庭规则不动', JSON.stringify(target.rules) === beforeRules);
ok('默认:r1 奖励不动（仍200加成）', JSON.stringify(target.rewards.find(x => x.id === 'r1')) === beforeR1);
ok('默认:孩子规则不动（仍1/10）', JSON.stringify(lemon.rules) === beforeLemon);
ok('默认:semester 保持新库（2026 秋季学期）', target.config.semester.name === '2026 秋季学期');

// 2) syncSettings：显式采用老设置
const s1 = sync.applyMigration(store, target, LINGXI_SNAP, { syncSettings: true });
ok('sync:config.feedWindow → 10-24', target.config.feedWindow.startHour === 10 && target.config.feedWindow.endHour === 24, target.config.feedWindow);
ok('sync:initialIntimacy → 0', target.config.initialIntimacy === 0);
ok('sync:baseAllowance → 0', target.config.baseAllowance === 0);
ok('sync:semester 绝不被同步（仍秋季学期 index 1）', target.config.semester.name === '2026 秋季学期' && target.config.semester.index === 1, target.config.semester);
ok('sync:家庭规则 → 老口径（feed 3 / streak 30）', target.rules.feed === 3 && target.rules.streak === 30, target.rules);
ok('sync:r1 → 扣除120', (() => { const r = target.rewards.find(x => x.id === 'r1'); return r.cost === 120 && r.name.includes('扣除'); })(), target.rewards[0]);
ok('sync:柠檬规则 → 3/30', lemon.rules.feed === 3 && lemon.rules.streak === 30, lemon.rules);
ok('sync:孩子3规则与老系统一致则不动（仍1/10）', kid3.rules.feed === 1 && kid3.rules.streak === 10, kid3.rules);
ok('sync:白名单外的 config 键不受影响（battleDailyLimit 5 / pointsToYuan 1）', target.config.battleDailyLimit === 5 && target.config.pointsToYuan === 1 && target.config.battleXpDailyCap === 30);
ok('sync:summary 报告改动项', s1.settingsChanged && s1.settingsChanged.config.includes('feedWindow') && s1.settingsChanged.childRules.includes('柠檬') && s1.settingsChanged.rewards.includes('r1'), s1.settingsChanged);

// 3) 幂等：再跑一次完全不变
const snapA = JSON.stringify({ c: target.config, r: target.rules, rw: target.rewards, l: lemon.rules, k: kid3.rules });
sync.applyMigration(store, target, LINGXI_SNAP, { syncSettings: true });
ok('幂等:二次 syncSettings 无变化', snapA === JSON.stringify({ c: target.config, r: target.rules, rw: target.rewards, l: lemon.rules, k: kid3.rules }));

// 4) 数值类合并不被 syncSettings 破坏
ok('合并仍在:柠檬 Lv19 / xp1204', lemon.level === 19 && lemon.xp === 1204, { level: lemon.level, xp: lemon.xp });

console.log(`\n===== 设置类同步单测：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
