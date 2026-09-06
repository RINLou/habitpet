// v10.2 诊断条（临时排查用，定位后删除）
// 呼出方式：① 页面任意处长按 1.5 秒 ② 地址栏加 #diag
// 作用：把「系统字体缩放 / 页面缩放 / 字体自动放大」三种机制一次性量清楚
(function () {
  var BAR_ID = 'hpDiagBar';

  function vv() { return window.visualViewport || null; }

  function probeBoost() {
    var d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:-9999px;top:0;width:' + (document.documentElement.clientWidth || 360) + 'px;font-size:16px;line-height:normal;white-space:nowrap;visibility:hidden';
    d.textContent = '字体放大检测 ABCDEFG 1234';
    document.body.appendChild(d);
    var h = +d.getBoundingClientRect().height.toFixed(1);
    d.remove();
    return h;
  }

  function widest() {
    var w = document.documentElement.clientWidth, best = null;
    var all = Array.prototype.slice.call(document.querySelectorAll('*'));
    all.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > w + 1 && (!best || r.right > best.right)) {
        best = { right: +r.right.toFixed(1), sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '') };
      }
    });
    return best;
  }

  function collect() {
    var de = document.documentElement, env = null, envRaw = '';
    try { if (window.Android && window.Android.env) { envRaw = window.Android.env(); env = JSON.parse(envRaw); } } catch (e) { envRaw = 'ERR ' + e; }
    var v = vv(), cs = getComputedStyle(de);
    var tab = document.querySelector('.tab');
    var boost = probeBoost(), ov = widest();
    var fScale = env ? env.fontScale : null;
    var pScale = v ? +v.scale.toFixed(3) : null;
    return {
      env: env, envRaw: envRaw,
      summary: '字体×' + (fScale === null ? '?' : fScale.toFixed(2)) +
        ' 页面×' + (pScale === null ? '?' : pScale) +
        ' dpr' + (window.devicePixelRatio || 1) +
        ' 视口' + de.clientWidth + '/' + de.scrollWidth +
        ' 文字高' + boost,
      lines: [
        '【页面】innerW=' + window.innerWidth + ' clientW=' + de.clientWidth + ' scrollW=' + de.scrollWidth + ' 溢出=' + (de.scrollWidth > de.clientWidth ? '有(' + ov.sel + ' 右' + ov.right + ')' : '无'),
        '【缩放】visualViewport.scale=' + pScale + ' vvW=' + (v ? +v.width.toFixed(1) : '-') + ' dpr=' + (window.devicePixelRatio || 1) + ' outerW=' + window.outerWidth,
        '【文字】根字号=' + cs.fontSize + ' textSizeAdjust=' + (cs.webkitTextSizeAdjust || cs.textSizeAdjust || '-') + ' 探针高=' + boost + 'px(正常约22)',
        '【实测】.tab 字号=' + (tab ? getComputedStyle(tab).fontSize : '-') + ' 渲染高=' + (tab ? +tab.getBoundingClientRect().height.toFixed(1) + 'px(应39)' : '-'),
        '【系统】' + (envRaw || '非APK环境(无Android桥)'),
        '【UA】' + navigator.userAgent.slice(0, 90)
      ]
    };
  }

  function render() {
    var old = document.getElementById(BAR_ID);
    if (old) { old.remove(); return; }
    var d = collect();
    var bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;background:rgba(0,0,0,.88);color:#7CFFB2;font:12px/1.5 monospace;padding:8px 10px 10px;max-height:60vh;overflow:auto;white-space:pre-wrap;word-break:break-all;-webkit-text-size-adjust:100%';
    var head = document.createElement('div');
    head.style.cssText = 'font-weight:bold;color:#FFD166;margin-bottom:4px';
    head.textContent = d.summary;
    bar.appendChild(head);
    d.lines.forEach(function (t) {
      var p = document.createElement('div');
      p.textContent = t;
      bar.appendChild(p);
    });
    var tip = document.createElement('div');
    tip.style.cssText = 'margin-top:6px;color:#9aa';
    tip.textContent = '长按1.5秒关闭 · 点「复制」把上面内容发给我';
    bar.appendChild(tip);
    var btn = document.createElement('button');
    btn.textContent = '复制诊断信息';
    btn.style.cssText = 'margin-top:6px;padding:6px 10px;font-size:13px;border-radius:8px;border:0;background:#6d7bff;color:#fff';
    btn.onclick = function () {
      var txt = d.summary + '\n' + d.lines.join('\n');
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt); }
        else {
          var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        }
        btn.textContent = '已复制 ✓';
      } catch (e) { btn.textContent = '复制失败：' + e.message; }
    };
    bar.appendChild(btn);
    document.body.appendChild(bar);
  }

  var t0 = 0, x0 = 0, y0 = 0, timer = null;
  function down(e) {
    var p = e.touches ? e.touches[0] : e;
    x0 = p.clientX; y0 = p.clientY; t0 = Date.now();
    if (e.target && e.target.closest && e.target.closest('#' + BAR_ID)) return;
    clearTimeout(timer);
    timer = setTimeout(function () { render(); }, 1500);
  }
  function move(e) {
    var p = e.touches ? e.touches[0] : e;
    if (Math.abs(p.clientX - x0) > 12 || Math.abs(p.clientY - y0) > 12) clearTimeout(timer);
  }
  function up() { clearTimeout(timer); }

  window.addEventListener('touchstart', down, { passive: true });
  window.addEventListener('touchmove', move, { passive: true });
  window.addEventListener('touchend', up, { passive: true });
  window.addEventListener('mousedown', down);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  window.__diag = render;
  if (location.hash.indexOf('diag') > -1) {
    window.addEventListener('load', function () { setTimeout(render, 300); });
  }
})();
