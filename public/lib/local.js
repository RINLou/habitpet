// local.js — 本地优先运行时（v10）
// 孩子端单人操作（投喂/宠物管理/兑换/单机对战）在本地引擎即时执行、零延迟；
// 操作写入 oplog 异步重放云端，云端保持权威副本；对战结束走 /api/battle/finish 云端结算（服务端重算经验防刷）。
// 跨用户操作（打卡审批/核销申请/里程碑/好友/跨家庭对战）与家长端全部直连云端。
(function () {
  'use strict';
  var CloudURL = (location.protocol === 'file:') ? 'https://c95fc7cf46d04a318a7413ccdf8ea4d6.app.workbuddy.link' : '';
  var S = {
    family: null,      // /api/sync/full 拉回的脱敏 raw family（本地权威工作副本）
    friends: [],       // childMe.friends 云端缓存
    invites: [],       // childMe.invites 云端缓存
    token: '', role: '', currentChildId: '',
    oplog: [],         // [{path, body, ts}]
    pendingFinishes: [], // [{battleId, mode, oppLevel, win, ts}]
    flushing: false, pulling: false
  };

  var SP = window.SpeciesMod, EN = window.EngineMod, BT = window.BattleMod, DB = window.LSDB;
  var ELEMENT_NAMES = SP.ELEMENT_NAMES;
  function speciesById(id) { return SP.speciesById(id); }
  function skillById(id) { return SP.skillById(id); }

  // LocalStore.familyById：对战结算奖励（grantBattleRewards）需要家庭快照
  window.LocalStore.familyById = function () { return S.family; };

  // —— 持久化 ——
  function persist() {
    DB.kvSet('state', { family: S.family, oplog: S.oplog, pendingFinishes: S.pendingFinishes, token: S.token, role: S.role, childId: S.currentChildId }).catch(function () {});
  }
  function persistFamily() { persist(); }

  // —— 视图复刻（与 server.js childMe/petView 逐字段对齐）——
  function petView(child) {
    if (!child.pet) return null;
    var sp = speciesById(child.pet.speciesId);
    if (!sp) return null;
    var st = EN.stageOf(child.level);
    var skills = sp.skills.map(skillById).map(function (s) { return Object.assign({}, s, { unlocked: child.level >= s.unlockLv }); });
    return {
      speciesId: sp.id, speciesName: sp.name, nickname: child.pet.nickname || sp.name,
      emoji: st.key === 'orb' ? '⚪' : sp.emoji, element: sp.element, elementName: ELEMENT_NAMES[sp.element],
      stats: child.pet.stats, freePoints: child.pet.freePoints || 0,
      skills: skills, stage: st.name, stageKey: st.key,
      xp: child.xp, xpNext: EN.xpForLevel(child.level + 1), xpCur: EN.xpForLevel(child.level), level: child.level,
      tier: sp.tier || null, fainted: !!child.fainted
    };
  }
  function childMe(family, child) {
    var now = new Date();
    EN.ensureSemester(family);
    EN.ensureMonth(family, child, now);
    var pausedDays = child.pausedAt ? Math.floor((Date.now() - child.pausedAt) / 86400000) : 0;
    return {
      id: child.id, name: child.name, grade: child.grade,
      intimacy: child.intimacy, xp: child.xp, level: child.level,
      pet: petView(child),
      fainted: !!child.fainted, faintedAt: child.faintedAt || null,
      hungerDays: (child.pet && !child.fainted && child.feedDate) ? EN.daysSince(child.feedDate, now) : 0,
      intimacyMult: EN.intimacyMult(child),
      feedStreak: child.feedStreak, fedToday: child.feedDate === EN.dateKey(),
      prideUsedThisWeek: child.prideWeekKey === EN.weekKey(),
      weekEarned: child.weekEarned || 0, weeklyCap: family.config.weeklyCap,
      battlesToday: child.battleCount && child.battleCount.date === EN.dateKey() ? child.battleCount.count : 0,
      battleDailyLimit: family.config.battleDailyLimit,
      holidayMode: family.config.holidayMode,
      paused: !!child.pausedAt, pausedDays: pausedDays,
      allowanceBase: family.config.baseAllowance,
      allowanceLocked: child.allowanceLocked,
      nextAllowance: family.config.baseAllowance + (child.allowanceLocked ? child.allowanceLocked.amount : 0),
      pending: child.pending, redemptions: child.redemptions.slice(0, 20), pokedex: child.pokedex,
      milestone: child.milestone, complaints: child.complaints,
      rules: child.rules || family.rules,
      rewards: family.rewards,
      semester: family.config.semester,
      eligibility: EN.hiddenPetEligibility(child),
      friendCode: localFriendCode(child),
      friends: S.friends, invites: S.invites,
      siblings: Object.values(family.children).map(function (c) { return { id: c.id, name: c.name, intimacy: c.intimacy, level: c.level, petEmoji: c.pet ? (speciesById(c.pet.speciesId) || {}).emoji : '⚪' }; })
    };
  }
  function localFriendCode(child) {
    if (child.friendCode && /^\d{6}$/.test(child.friendCode)) return child.friendCode;
    var code = String(Math.floor(100000 + Math.random() * 900000));
    child.friendCode = code;   // 本地占位，云端 pull 后对齐
    return code;
  }
  function ledger(family, child, delta, reason, by, xp) {
    family.ledger.unshift({
      id: window.LocalStore.newId('l'), ts: new Date().toISOString(),
      childId: child ? child.id : null, childName: child ? child.name : null,
      delta: delta, xp: xp || 0, reason: reason, by: by, reversed: false
    });
    if (family.ledger.length > 400) family.ledger.length = 400;
  }
  function err(msg) { return { error: msg }; }

  // —— 本地 handler（与 server.js 逻辑一致）——
  var localHandlers = {
    '/api/feed': function (f, c) {
      if (!c.pet) return err('先选一只宠物吧！');
      if (c.fainted) return err('宠物饿晕了，先复活再投喂');
      if (c.pausedAt) return err('暂停计期间休息养病，不扣分不计连击');
      if (!EN.inFeedWindow(f)) return err('投喂时间：' + f.config.feedWindow.startHour + ':00-' + f.config.feedWindow.endHour + ':00');
      var today = EN.dateKey();
      if (c.feedDate === today) return err('今天已经投喂过啦');
      var pts = (c.rules && c.rules.feed !== undefined) ? c.rules.feed : f.rules.feed;
      if (!EN.canEarnWeek(c, f.config.weeklyCap, pts)) return err('本周加分已达上限 ' + f.config.weeklyCap);
      c.feedStreak = (c.feedDate === EN.yesterdayKey()) ? c.feedStreak + 1 : 1;
      c.feedDate = today;
      EN.addIntimacy(c, pts); EN.addXP(c, pts); EN.noteWeekEarn(c, pts);
      ledger(f, c, pts, '每日作业投喂（连续第' + c.feedStreak + '天）', 'auto');
      var bonus = 0;
      if (c.feedStreak > 0 && c.feedStreak % 7 === 0) {
        bonus = (c.rules && c.rules.streak !== undefined) ? c.rules.streak : f.rules.streak;
        EN.addIntimacy(c, bonus); EN.addXP(c, bonus); EN.noteWeekEarn(c, bonus);
        ledger(f, c, bonus, '连续打卡 ' + c.feedStreak + ' 天奖励', 'auto');
      }
      var feedEvent = EN.rollFeedEvent(f, c);
      return { ok: true, intimacy: c.intimacy, streakBonus: bonus, feedEvent: feedEvent, state: childMe(f, c) };
    },
    '/api/pet/select': function (f, c, p) {
      if (c.pet) return err('本学期已选定宠物，学期结束后才能重挑');
      var sp = speciesById(p.speciesId);
      if (!sp) return err('物种不存在');
      if (sp.hidden) {
        var el = EN.hiddenPetEligibility(c);
        if (sp.tier === 'S' && !el.s) return err('S 级隐藏宠物需曾任一学期觉醒（Lv20）');
        if (sp.tier === 'SS' && !el.ss) return err('SS 级隐藏宠物需连续两个学期觉醒（Lv20）');
      }
      c.pet = { speciesId: sp.id, nickname: sp.name, stats: Object.assign({}, sp.base), freePoints: 0, skills: sp.skills.slice(), maxHpBonus: 0 };
      return { ok: true, state: childMe(f, c) };
    },
    '/api/pet/nickname': function (f, c, p) {
      if (!c.pet) return err('还没有宠物');
      c.pet.nickname = String(p.nickname || '').slice(0, 10) || speciesById(c.pet.speciesId).name;
      return { ok: true, state: childMe(f, c) };
    },
    '/api/pet/allocate': function (f, c, p) {
      if (!c.pet) return err('还没有宠物');
      var stat = p.stat, pts = Math.floor(Number(p.points) || 0);
      if (!['atk', 'def', 'hp', 'spd', 'wis'].includes(stat)) return err('无效属性');
      if (pts <= 0 || pts > (c.pet.freePoints || 0)) return err('点数不足');
      c.pet.stats[stat] += pts; c.pet.freePoints -= pts;
      return { ok: true, state: childMe(f, c) };
    },
    '/api/pet/revive': function (f, c, p) {
      if (!c.pet) return err('还没有宠物');
      var r = EN.revivePet(f, c, p.mode === 'intimacy' ? 'intimacy' : 'level');
      if (r.error) return r;
      return { ok: true, state: childMe(f, c) };
    },
    '/api/redeem': function (f, c, p) {
      var r = f.rewards.find(function (x) { return x.id === p.rewardId; });
      if (!r) return err('奖励不存在');
      if (c.intimacy < r.cost) return err('亲密度不够，还差 ' + (r.cost - c.intimacy) + ' 分');
      if (r.type === 'cash') {
        var mk = EN.monthKey();
        if (c.allowanceLocked && c.allowanceLocked.monthKey === mk) return err('本月已锁定过一次零花钱加成');
        c.allowanceLocked = { amount: r.cost, monthKey: mk };
      }
      var status = r.type === 'cash' ? 'fulfilled' : 'held';
      c.intimacy -= r.cost;
      c.redemptions.unshift({ id: 'rd' + Date.now() + Math.floor(Math.random() * 100), name: r.name, cost: r.cost, type: r.type, ts: new Date().toISOString(), status: status, requestedAt: null, fulfilled: status === 'fulfilled' });
      ledger(f, c, -r.cost, '兑换奖励：' + r.name + (r.type === 'cash' ? '（锁定下月零花钱加成 ' + r.cost + ' 元）' : ''), 'child');
      return { ok: true, state: childMe(f, c) };
    }
  };
  // 这些操作重放云端是安全的（幂等由业务校验兜底）
  var OPLOG_APIS = { '/api/feed': 1, '/api/pet/select': 1, '/api/pet/nickname': 1, '/api/pet/allocate': 1, '/api/pet/revive': 1, '/api/redeem': 1 };
  // 纯本地对战（不重放，结束时单独走 /api/battle/finish 结算）
  var BATTLE_APIS = { '/api/battle/start': 1, '/api/battle/move': 1, '/api/battle/state': 1 };

  // —— 本地对战 ——
  function battleHandler(f, c, path, p) {
    if (path === '/api/battle/start') {
      if (!c.pet) return err('先选宠物才能对战');
      if (c.fainted) return err('宠物饿晕了，先复活才能对战');
      var mode = p.mode, opp = null;
      if (mode === 'sibling' || mode === 'coop') {
        opp = f.children[p.opponentId];
        if (!opp || opp.id === c.id) return err('对手不存在');
        if (!opp.pet) return err('对方还没有宠物');
      } else if (mode !== 'boss') return err('未知模式');
      if (!BT.canBattleToday(c, f.config.battleDailyLimit)) return err('今日对战次数已满（上限' + f.config.battleDailyLimit + '场）');
      BT.noteBattle(c);
      var r = BT.startBattle(f, mode, c, opp);
      if (r.error) return err(r.error);
      return { ok: true, battleId: r.battleId, battle: r.state };
    }
    if (path === '/api/battle/move') {
      var st = window.LocalStore.getBattle(p.battleId);
      if (!st || !st.familyIds || !st.familyIds.includes(f.id)) return err('战斗不存在或已结束');
      var res = BT.playerMove(p.battleId, f, c, p.skillIndex);
      if (res.error) return res;
      if (res.finished) queueFinish(st);   // 结算：本地快照已加经验，云端再权威结算一次（pull 对齐去重）
      return { ok: true, battle: res.state, finished: !!res.finished, state: childMe(f, c) };
    }
    if (path === '/api/battle/state') {
      var pub = BT.getBattle(p.battleId, f);
      if (!pub) return err('战斗不存在');
      return { ok: true, battle: pub };
    }
    return null;
  }
  function queueFinish(st) {
    var meF = st.fighters.filter(function (x) { return x.childId && !x.isAI; })[0];
    var oppF = st.fighters.filter(function (x) { return x !== meF && x.side !== 'ally'; })[0];
    var win;
    if (st.mode === 'sibling') win = (st.winner === st.fighters.indexOf(meF));
    else win = (st.winner === 'kids');
    S.pendingFinishes.push({
      battleId: st.id, mode: st.mode,
      oppLevel: oppF ? oppF.level : (meF ? meF.level : 1),
      win: !!win, ts: Date.now()
    });
    persist();
    setTimeout(flushFinishes, 1500);
  }

  // —— 云端通信 ——
  function cloudPost(path, body) {
    return fetch(CloudURL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.token },
      body: JSON.stringify(Object.assign({}, body || {}, { token: S.token }))
    }).then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { return { status: res.status, data: d }; }); });
  }

  // 对战结算上报（不进通用 oplog：finish 不可盲目重放，单独确认制）
  function flushFinishes() {
    if (!S.pendingFinishes.length || !S.token) return Promise.resolve();
    var item = S.pendingFinishes[0];
    return cloudPost('/api/battle/finish', item).then(function (r) {
      if (r.status === 200 && r.data && r.data.ok) {
        S.pendingFinishes.shift();
        persist();
        if (S.oplog.length === 0) schedulePull(2000);
        if (S.pendingFinishes.length) return flushFinishes();
      } else if (r.status === 401) {
        // 会话失效：保留队列，等重新登录
      } else {
        S.pendingFinishes.shift(); persist();   // 业务失败（如场次超限）→ 丢弃，pull 对齐
        schedulePull(1000);
        if (S.pendingFinishes.length) return flushFinishes();
      }
    }).catch(function () { /* 网络失败：留在队列下次再试 */ });
  }

  // oplog 重放：按序重放到云端；全部成功后 pull 全量对齐（云端权威）
  function flush() {
    if (S.flushing || !S.oplog.length || !S.token) return Promise.resolve();
    S.flushing = true;
    var needPull = false;
    function step() {
      if (!S.oplog.length) return Promise.resolve();
      var op = S.oplog[0];
      return cloudPost(op.path, op.body).then(function (r) {
        if (r.status === 200 && r.data && r.data.ok !== false && !r.data.error) {
          S.oplog.shift(); persist();
          return step();
        }
        if (r.status === 401) return undefined;   // 会话失效，暂停重放（保 oplog）
        needPull = true;                           // 业务失败（云端状态已变化）→ 丢弃该 op，pull 对齐
        S.oplog.shift(); persist();
        return step();
      }).catch(function () { return undefined; });  // 网络失败：暂停，下次再试
    }
    return step().then(function () {
      S.flushing = false;
      if (needPull || S.oplog.length === 0) schedulePull(1200);
      if (S.pendingFinishes.length) flushFinishes();
    });
  }
  var pullTimer = null;
  function schedulePull(delay) {
    clearTimeout(pullTimer);
    pullTimer = setTimeout(pull, delay || 1500);
  }
  // 全量对齐：仅当本地无待重放操作时执行（否则以本地为准）
  function pull() {
    if (S.pulling || !S.token || S.oplog.length) return Promise.resolve();
    S.pulling = true;
    return cloudPost('/api/sync/full', {}).then(function (r) {
      if (r.status === 200 && r.data && r.data.ok && r.data.family) {
        S.family = r.data.family;
        persistFamily();
      }
    }).catch(function () {}).then(function () { S.pulling = false; });
  }

  // —— 对外：登录后初始化 / 启动恢复 ——
  function onAuth(token, role) {
    S.token = token; S.role = role;
    return cloudPost('/api/sync/full', {}).then(function (r) {
      if (r.status === 200 && r.data && r.data.ok && r.data.family) {
        S.family = r.data.family;
        persist();
      }
    }).catch(function () {});
  }
  function bootChild(token) {
    S.token = token; S.role = 'child';
    ensurePeriodicPull();
    return DB.kvGet('state').then(function (st) {
      if (!st || !st.family || st.token !== token) return null;
      S.family = st.family; S.oplog = st.oplog || []; S.pendingFinishes = st.pendingFinishes || [];
      S.currentChildId = st.childId || '';
      var child = S.currentChildId && S.family.children[S.currentChildId];
      if (!child && Object.keys(S.family.children).length === 1) child = Object.values(S.family.children)[0];
      if (!child) return null;
      if (S.oplog.length) flush();
      if (S.pendingFinishes.length) flushFinishes();
      schedulePull(800);   // 启动后立刻对齐云端（家长改的配置/奖励及时生效），oplog 未清时 pull 会自行跳过
      return childMe(S.family, child);
    }).catch(function () { return null; });
  }

  // 云端 childMe 响应回来时更新缓存（friends/invites 等云端数据）
  function updateFromState(state) {
    if (!state || !state.id) return;
    if (state.friends) S.friends = state.friends;
    if (state.invites) S.invites = state.invites;
    if (!S.currentChildId) S.currentChildId = state.id;
    schedulePull(800);   // 云端响应到达说明在线：尽快刷新本地家庭工作副本（家长配置改动生效）
    persist();
  }

  // 周期性对齐（每 60s）：孩子端闲置时家长改配置/奖励也能及时生效
  function ensurePeriodicPull() {
    if (S._periodicTimer) return;
    S._periodicTimer = setInterval(function () {
      if (S.token && S.role === 'child' && !S.oplog.length && document.visibilityState !== 'hidden') pull();
    }, 60000);
  }

  // —— 对外：API 分流 ——
  // 返回 null = 交云端；返回对象 = 本地结果（body 形状与云端一致）
  function dispatch(path, body) {
    if (!S.family || S.role !== 'child') return null;
    if (path in localHandlers || path in BATTLE_APIS) {
      var child = S.currentChildId && S.family.children[S.currentChildId];
      if (!child && Object.keys(S.family.children).length === 1) child = Object.values(S.family.children)[0];
      if (!child) return null;
      var out;
      if (localHandlers[path]) {
        out = localHandlers[path](S.family, child, body || {});
        if (out && !out.error) {
          if (OPLOG_APIS[path]) { S.oplog.push({ path: path, body: body || {}, ts: Date.now() }); }
          persistFamily();
          flush();
        } else if (out && out.error) {
          // 本地拒绝（如投喂时段不符）：可能是本地配置过期，立刻对齐云端后重试即用新规则
          schedulePull(600);
        }
        return out;
      }
      out = battleHandler(S.family, child, path, body || {});
      if (out && out.ok && (path === '/api/battle/start' || path === '/api/battle/move')) persistFamily();
      return out;
    }
    return null;
  }

  // 清空本地（登出/换账号）
  function reset() {
    if (S._periodicTimer) { clearInterval(S._periodicTimer); S._periodicTimer = null; }
    S.family = null; S.friends = []; S.invites = []; S.oplog = []; S.pendingFinishes = []; S.token = ''; S.role = ''; S.currentChildId = '';
    DB.kvDel('state').catch(function () {});
  }

  window.LocalRT = {
    API_BASE: CloudURL,
    dispatch: dispatch,
    onAuth: onAuth,
    bootChild: bootChild,
    updateFromState: updateFromState,
    setCurrentChild: function (id) { S.currentChildId = id; persist(); },
    reset: reset,
    pull: pull,
    state: S
  };
})();
