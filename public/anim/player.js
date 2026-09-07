// player.js — 灵汐大陆·焰狼 2D 精灵动画播放器（MVP + review-fix）
// 设计原则：
//   - 契约驱动：所有动作/帧数/FPS/事件映射/优先级来自 /anim/firam/contract.json
//   - 业务只抛事件（PetAnim.queueEvent('hero', eventName)），播放器自己决定播什么
//   - 阶段保护：仅当 data-stage === contract.canonicalStage（adult）时挂载精灵动画；
//     幼体（juvenile）/ 觉醒（awaken）/ 非 firam / 昏迷态一律保持原静态 WebP
//   - 事件调度：按契约 priority 确定性调度——高优先级抢占正在播放的事件，
//     低/同优先级进入 pending（同优先级后者覆盖前者），当前事件播完回 idle 后冲刷
//   - 首载竞态：契约未就绪时 queueEvent 只入 pending 不丢失，mount 完成后冲刷
//   - 失败降级：任一动作帧加载失败 → 恢复原静态 WebP（保留原始 img 元素），
//     本次会话内全局禁用精灵动画（确定性降级，不反复重试）
//   - 定时器安全：playGen 代次计数，新播放使旧链路全部失效；全局唯一 interval，
//     旧链路永远不会清掉新链路的定时器；页面隐藏时靠安全超时收尾，不泄漏
(function () {
  'use strict';
  var BASE = '/anim/firam/';
  var DEFAULT_STAGE = 'adult'; // 契约未加载时的保守缺省（与 contract.canonicalStage 一致）
  var FALLBACK_PRIORITY = { daily_idle: 0, feed_success: 10, return: 15, level_up: 20 }; // 契约未就绪时的确定性优先级镜像

  var contract = null;
  var loadPromise = null;
  var imgCache = {};        // action -> { imgs:[Image], c:actionCfg }
  var failedActions = {};   // action -> true（本会话不再尝试）
  var animDisabled = false; // 任一动作失败后本会话全局禁用
  var reduceMotion = false;
  var lowPerf = false;

  var playGen = 0;          // 播放代次
  var currentTimer = null;  // { id, gen } 全局唯一 interval
  var pending = {};         // target -> { event, priority }
  var playing = {};         // target -> { event, priority }
  var heroEl = null;        // 当前挂载的主视觉元素

  function detect() {
    reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var nav = window.navigator || {};
    var cores = nav.hardwareConcurrency || 4;
    var mem = nav.deviceMemory || 4;
    lowPerf = cores <= 2 || mem <= 2;
  }

  function canonicalStage() { return (contract && contract.canonicalStage) || DEFAULT_STAGE; }

  function loadContract() {
    if (contract) return Promise.resolve(contract);
    if (loadPromise) return loadPromise;
    loadPromise = fetch(BASE + 'contract.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (j) { contract = j; return j; })
      .catch(function () { contract = null; return null; });
    return loadPromise;
  }

  function eventPriority(name) {
    var e = contract && contract.events[name];
    if (e && typeof e.priority === 'number') return e.priority;
    return (FALLBACK_PRIORITY[name] !== undefined) ? FALLBACK_PRIORITY[name] : 0;
  }

  function loadImages(action) {
    if (failedActions[action]) return Promise.reject(new Error('action unavailable: ' + action));
    if (imgCache[action]) return Promise.resolve(imgCache[action]);
    return loadContract().then(function (c) {
      if (!c || !c.actions[action]) return null;
      var a = c.actions[action];
      var urls = [];
      for (var i = 0; i < a.frames; i++) urls.push(BASE + action + '/frame-' + i + '.png');
      return Promise.all(urls.map(function (u) {
        return new Promise(function (res, rej) {
          var im = new Image();
          im.onload = function () { res(im); };
          im.onerror = function () { rej(new Error('img load fail: ' + u)); };
          im.src = u;
        });
      })).then(function (imgs) {
        imgCache[action] = { imgs: imgs, c: a };
        return imgCache[action];
      });
    });
  }

  // —— 定时器：带代次，旧代次回调自愈退出 ——
  function clearTimer() {
    if (currentTimer) { clearInterval(currentTimer.id); currentTimer = null; }
  }
  function setTimer(fn, ms, gen) {
    clearTimer();
    var id = setInterval(function () {
      if (gen !== playGen) { clearTimer(); return; } // 旧代次：自愈清掉自己的定时器
      fn();
    }, ms);
    currentTimer = { id: id, gen: gen };
    return id;
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function setSrc(el, im) { var s = el.querySelector('.pa-sprite'); if (s) s.src = im.src; }

  // —— 静态 WebP 保留 / 恢复（原始 img 不销毁，精灵层叠加上去）——
  function mountSprite(el, firstImg) {
    var spr = el.querySelector('.pa-sprite');
    if (!spr) {
      var orig = el.querySelector('img:not(.pa-sprite)');
      spr = document.createElement('img');
      spr.className = 'pa-sprite';
      spr.alt = '';
      if (orig) orig.style.display = 'none';
      el.appendChild(spr);
    }
    spr.src = firstImg.src;
  }
  function restoreStatic(el) {
    if (!el) return;
    var spr = el.querySelector('.pa-sprite');
    if (spr && spr.parentNode) spr.parentNode.removeChild(spr);
    var orig = el.querySelector('img:not(.pa-sprite)');
    if (orig) orig.style.display = '';
  }

  function handleLoadFail(el, action, gen) {
    failedActions[action] = true;
    if (gen !== playGen) return;            // 已被新播放抢占，不打扰当前链路
    animDisabled = true;                    // 确定性降级：本会话回到纯静态
    playGen++; clearTimer();
    playing = {};
    restoreStatic(el);
  }

  // —— 循环播放（idle / tired / happy 循环段）——
  function startLoop(el, action, gen) {
    return loadImages(action).then(function (data) {
      if (!data || gen !== playGen) return;
      var imgs = data.imgs, c = data.c, i = 0;
      setSrc(el, imgs[0]);
      setTimer(function () {
        i = (i + 1) % c.frames;
        setSrc(el, imgs[i]);
      }, 1000 / c.fps, gen);
    }).catch(function () { handleLoadFail(el, action, gen); });
  }

  // —— 单次播放（eat / levelUp），holdLast 则定格末帧 ——
  function playOnce(el, action, holdLast, gen) {
    return loadImages(action).then(function (data) {
      if (!data || gen !== playGen) return;
      var imgs = data.imgs, c = data.c, i = 0;
      setSrc(el, imgs[0]);
      return new Promise(function (resolve) {
        var interval = 1000 / c.fps;
        var done = false;
        setTimer(function () {
          if (i < c.frames - 1) { i++; setSrc(el, imgs[i]); }
          else { done = true; clearTimer(); if (!holdLast) setSrc(el, imgs[0]); resolve(); }
        }, interval, gen);
        // 安全兜底：标签页挂起等极端情况下也能收尾
        // （代次失效或已正常收尾时不碰定时器——否则会误杀后续 idle 循环的定时器）
        setTimeout(function () { if (gen === playGen && !done) clearTimer(); resolve(); }, c.frames * interval + 400);
      });
    }).catch(function () { handleLoadFail(el, action, gen); });
  }

  function runEvent(el, ev, gen) {
    if (ev.sequence) {
      var chain = Promise.resolve();
      ev.sequence.forEach(function (a, k) {
        var isLast = k === ev.sequence.length - 1;
        chain = chain.then(function () {
          if (gen !== playGen) return;
          if (isLast && contract.actions[a] && contract.actions[a].loop) {
            return startLoop(el, a, gen).then(function () { return wait(1100); });
          }
          return playOnce(el, a, contract.actions[a] && contract.actions[a].holdLastFrame, gen);
        });
      });
      return chain;
    }
    var a = ev.action;
    if (contract.actions[a] && contract.actions[a].loop) {
      return startLoop(el, a, gen).then(function () { return wait(ev.maxDurationMs || 1500); });
    }
    return playOnce(el, a, contract.actions[a] && contract.actions[a].holdLastFrame, gen);
  }

  // —— 事件播放：代次抢占 + 播完回 idle + 冲刷 pending ——
  function playEvent(el, name) {
    var ev = contract && contract.events[name];
    if (!ev || animDisabled) return Promise.resolve();
    playGen++; clearTimer();              // 抢占：旧链路（含其定时器）全部失效
    var gen = playGen;
    playing['hero'] = { event: name, priority: eventPriority(name) };
    return runEvent(el, ev, gen).then(function () {
      if (gen !== playGen) return;        // 已被更高优先级事件接管
      delete playing['hero'];
      return startLoop(el, 'idle', gen).then(function () {
        if (gen !== playGen) return;
        var p = pending['hero'];
        if (p) { delete pending['hero']; return playEvent(el, p.event); }
      });
    });
  }

  // —— 挂载：静态 WebP 之上叠精灵层（原始 img 保留用于降级恢复）——
  function mount(el) {
    var sid = el.getAttribute('data-species');
    if (sid !== 'firam' || el.classList.contains('fainted')) {  // 种族/昏迷保护
      delete pending['hero'];                                   // 此元素永不播动画，积压事件直接丢弃
      return Promise.resolve();
    }
    detect();
    if (reduceMotion || lowPerf) {                              // 降级：保留原 WebP
      delete pending['hero'];
      return Promise.resolve();
    }
    return loadContract().then(function (c) {
      if (!c || (el.getAttribute('data-stage') || '') !== canonicalStage()) {
        // 契约失败或阶段不符（愿望球/幼体/觉醒）：保持静态，丢弃积压事件防「进化后乱播旧事件」
        delete pending['hero'];
        return;
      }
      return loadImages('idle').then(function (data) {
        if (!data || animDisabled) return;                          // 加载失败：静态
        heroEl = el;
        mountSprite(el, data.imgs[0]);
        var gen = ++playGen;
        playing['hero'] = { event: 'idle', priority: eventPriority('daily_idle') };
        var imgs = data.imgs, cf = data.c, i = 0;
        setTimer(function () {
          i = (i + 1) % cf.frames;
          setSrc(el, imgs[i]);
        }, 1000 / cf.fps, gen);
        // 冲刷挂起的事件（首载竞态 / 契约未就绪时排入的事件）
        var p = pending['hero'];
        if (p) { delete pending['hero']; playEvent(el, p.event); }
      });
    }).catch(function () { /* 保持静态 */ });
  }

  function scan(root) {
    detect();
    loadContract().then(function () {
      (root || document).querySelectorAll('[data-anim="hero"]').forEach(function (el) { mount(el); });
    });
  }

  // 业务调用：抛出事件。调度规则（确定性）：
  //   - 契约未就绪 / 主视觉未挂载 → 入 pending（保留最高优先级，同优先级后者覆盖）
  //   - 正在播的事件优先级更低 → 立即抢占播放
  //   - 否则 → 入 pending，当前事件播完回 idle 后冲刷
  function queueEvent(target, event) {
    var prio = eventPriority(event);
    var cur = playing[target];
    if (heroEl && target === 'hero' && contract && (!cur || prio > cur.priority)) {
      playEvent(heroEl, event);
      return;
    }
    var ex = pending[target];
    if (!ex || prio >= ex.priority) pending[target] = { event: event, priority: prio };
  }

  function canAnimate(speciesId, stage) {
    if (speciesId !== 'firam') return false;
    if (stage === undefined || stage === null || stage === '') return true; // 未提供阶段时不设卡
    return stage === canonicalStage();
  }
  function isEnabled() { detect(); return !reduceMotion && !lowPerf && !animDisabled; }

  // 测试/诊断钩子：可复现断言用，不参与业务
  function _debug() {
    return {
      contractLoaded: !!contract,
      canonicalStage: canonicalStage(),
      pending: JSON.parse(JSON.stringify(pending)),
      playing: JSON.parse(JSON.stringify(playing)),
      playGen: playGen,
      timerActive: !!currentTimer,
      failedActions: JSON.parse(JSON.stringify(failedActions)),
      animDisabled: animDisabled,
      heroMounted: !!(heroEl && heroEl.querySelector('.pa-sprite'))
    };
  }
  function _testReset() {
    playGen++; clearTimer();
    contract = null; loadPromise = null; imgCache = {}; failedActions = {};
    animDisabled = false; pending = {}; playing = {}; heroEl = null;
  }

  window.PetAnim = {
    ready: loadContract,
    scan: scan,
    queueEvent: queueEvent,
    canAnimate: canAnimate,
    isEnabled: isEnabled,
    _mount: mount,
    _restoreStatic: restoreStatic,
    _debug: _debug,
    _testReset: _testReset
  };
})();
