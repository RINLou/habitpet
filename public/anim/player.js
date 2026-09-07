// player.js — 灵汐大陆·焰狼 2D 精灵动画播放器（MVP）
// 设计原则：
//   - 契约驱动：所有动作/帧数/FPS/事件映射来自 /anim/firam/contract.json
//   - 业务只抛事件（PetAnim.queueEvent('hero', eventName)），播放器自己决定播什么
//   - 三道降级：prefers-reduced-motion / 低性能（核数或内存过低）/ 资源加载失败
//     任一道触发都保留原有静态 WebP（.pet-art 里本来就渲染了降级图），页面核心操作不受影响
//   - 只服务主视觉焰狼（firam）；其它种族或无精灵资源时直接不挂载，保持原样
//   - 不动战斗系统、地图系统、P0/P1 持久化逻辑
(function () {
  'use strict';
  var BASE = '/anim/firam/';
  var contract = null;
  var loadPromise = null;
  var imgCache = {};        // action -> { imgs:[Image], c:actionCfg }
  var reduceMotion = false;
  var lowPerf = false;
  var currentTimer = null;  // 全局只跑一个 interval（同一时刻只有一个主视觉在播）
  var pending = {};         // target(如 'hero') -> eventName（最后写入者生效）

  function detect() {
    reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var nav = window.navigator || {};
    var cores = nav.hardwareConcurrency || 4;
    var mem = nav.deviceMemory || 4;
    lowPerf = cores <= 2 || mem <= 2;
  }

  function loadContract() {
    if (contract) return Promise.resolve(contract);
    if (loadPromise) return loadPromise;
    loadPromise = fetch(BASE + 'contract.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (j) { contract = j; return j; })
      .catch(function () { contract = null; return null; });
    return loadPromise;
  }

  function loadImages(action) {
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

  function clearTimer() {
    if (currentTimer) { clearInterval(currentTimer); currentTimer = null; }
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function setSrc(el, im) { var s = el.querySelector('.pa-sprite'); if (s) s.src = im.src; }

  // —— 循环播放（idle / tired / happy 作为循环段）——
  function startLoop(el, action) {
    return loadImages(action).then(function (data) {
      if (!data) return;
      clearTimer();
      var imgs = data.imgs, c = data.c, i = 0;
      setSrc(el, imgs[0]);
      currentTimer = setInterval(function () {
        i = (i + 1) % c.frames;
        setSrc(el, imgs[i]);
      }, 1000 / c.fps);
    }).catch(function () {});
  }

  // —— 单次播放（eat / levelUp），到末帧后 holdLast 则定格，否则回到首帧 ——
  function playOnce(el, action, holdLast) {
    return loadImages(action).then(function (data) {
      if (!data) return;
      clearTimer();
      var imgs = data.imgs, c = data.c, i = 0;
      setSrc(el, imgs[0]);
      return new Promise(function (resolve) {
        var interval = 1000 / c.fps;
        currentTimer = setInterval(function () {
          if (i < c.frames - 1) {
            i++; setSrc(el, imgs[i]);
          } else {
            clearTimer();
            if (!holdLast) setSrc(el, imgs[0]);
            resolve();
          }
        }, interval);
        // 安全兜底：极端情况下（如标签页挂起）也能收尾
        setTimeout(function () { if (currentTimer) clearTimer(); resolve(); }, c.frames * interval + 400);
      });
    }).catch(function () {});
  }

  function playEvent(el, event) {
    var ev = contract.events[event];
    if (!ev) return Promise.resolve();
    var autoIdle = !!ev.autoReturnToIdle;
    if (ev.sequence) {
      var chain = Promise.resolve();
      ev.sequence.forEach(function (a, k) {
        var isLast = k === ev.sequence.length - 1;
        chain = chain.then(function () {
          if (isLast && contract.actions[a] && contract.actions[a].loop) {
            return startLoop(el, a).then(function () { return wait(1100); });
          }
          return playOnce(el, a, contract.actions[a] && contract.actions[a].holdLastFrame);
        });
      });
      return chain.then(function () { if (autoIdle) return startLoop(el, 'idle'); });
    }
    var a = ev.action;
    if (contract.actions[a] && contract.actions[a].loop) {
      return startLoop(el, a).then(function () { return wait(ev.maxDurationMs || 1500); })
        .then(function () { if (autoIdle) return startLoop(el, 'idle'); });
    }
    return playOnce(el, a, contract.actions[a] && contract.actions[a].holdLastFrame)
      .then(function () { if (autoIdle) return wait(500).then(function () { return startLoop(el, 'idle'); }); });
  }

  // —— 挂载：把 .pet-art 内的静态 WebP 换成精灵 <img> 并播放 ——
  function mount(el) {
    var sid = el.getAttribute('data-species');
    if (sid !== 'firam') return;                 // 仅主视觉焰狼
    if (el.classList.contains('fainted')) return; // 昏迷态保持静态降级
    detect();
    return loadContract().then(function () {
      if (!contract || reduceMotion || lowPerf) return; // 降级：保留原 WebP
      return loadImages('idle').then(function (data) {
        if (!data) return;                        // 加载失败：保留原 WebP
        el.innerHTML = '<img class="pa-sprite" alt="">';
        setSrc(el, data.imgs[0]);
        clearTimer();
        var i = 0, c = data.c;
        currentTimer = setInterval(function () {
          i = (i + 1) % c.frames; setSrc(el, data.imgs[i]);
        }, 1000 / c.fps);
        // 冲刷挂起的事件（如升级/回归/投喂）
        var pend = pending['hero'];
        if (pend) { delete pending['hero']; playEvent(el, pend); }
      }).catch(function () {});
    });
  }

  function scan(root) {
    detect();
    loadContract().then(function () {
      (root || document).querySelectorAll('[data-anim="hero"]').forEach(function (el) { mount(el); });
    });
  }

  // 业务调用：抛出事件。最后写入者（优先级更高）生效。
  function queueEvent(target, event) {
    pending[target] = event;
  }

  function canAnimate(speciesId) { return speciesId === 'firam'; }
  function isEnabled() { detect(); return !!contract && !reduceMotion && !lowPerf; }

  window.PetAnim = {
    ready: loadContract,
    scan: scan,
    queueEvent: queueEvent,
    canAnimate: canAnimate,
    isEnabled: isEnabled,
    _mount: mount
  };
})();
