// localstore.js — 本地优先运行时地基（浏览器）
// 提供 window.LocalStore（battle.umd.js 的浏览器依赖）+ window.LSDB（IndexedDB kv 工具）
// 加载顺序：species.umd.js → localstore.js → engine.umd.js → battle.umd.js → local.js
(function () {
  'use strict';
  var DB_NAME = 'habitpet-local', DB_VER = 1;
  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var rq = indexedDB.open(DB_NAME, DB_VER);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
      rq.onsuccess = function () { resolve(rq.result); };
      rq.onerror = function () { reject(rq.error); };
    });
    return dbPromise;
  }
  function kvSet(key, val) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(val, key);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function kvGet(key) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('kv', 'readonly');
        var rq = tx.objectStore('kv').get(key);
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  }
  function kvDel(key) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').delete(key);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }

  // —— 战斗状态：内存为准 + 防抖 400ms 全量持久化（app 中途杀掉也不丢对局）——
  var battles = {};
  var flushTimer = null;
  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(function () {
      flushTimer = null;
      kvSet('battles', battles).catch(function () {});
    }, 400);
  }
  // 启动恢复（清掉 1 小时前已结束的对局）
  kvGet('battles').then(function (saved) {
    if (!saved) return;
    var now = Date.now();
    for (var id in saved) {
      var st = saved[id];
      if (st && st.status === 'finished' && st.finishedAt && now - st.finishedAt > 3600e3) continue;
      battles[id] = st;
    }
  }).catch(function () {});

  window.LSDB = { kvGet: kvGet, kvSet: kvSet, kvDel: kvDel };
  window.LocalStore = {
    getBattle: function (id) { return battles[id] || null; },
    putBattle: function (id, st) { battles[id] = st; scheduleFlush(); },
    delBattle: function (id) { delete battles[id]; scheduleFlush(); },
    newId: function (p) { return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
    // familyById 由 local.js 运行时后挂（对战结算奖励需要家庭快照）
    familyById: function () { return null; }
  };
})();
