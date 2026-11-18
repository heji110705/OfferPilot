/* =========================================================
   OfferPilot Popup
   ========================================================= */
(function () {
  'use strict';

  var tab = null;
  var report = null;
  var busy = false;

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setConn(state) {
    var dot = $('dot');
    dot.className = 'dot ' + (state === 'on' ? 'on' : state === 'off' ? 'off' : '');
    $('conn').textContent = state === 'on'
      ? '已连接当前页面'
      : state === 'off' ? '当前页面不支持填充' : '正在连接当前页面…';
  }

  function ping(tabId) {
    return new Promise(function (res) {
      try {
        chrome.tabs.sendMessage(tabId, { type: 'OP_PING' }, function (r) {
          if (chrome.runtime.lastError) return res(false);
          res(!!(r && r.ok));
        });
      } catch (e) { res(false); }
    });
  }

  function render(r) {
    report = r;
    var total = r ? r.total : 0;
    $('pct').textContent = (r ? r.percent : 0) + '%';
    $('cnt').textContent = '识别 ' + (r ? r.ready : 0) + ' / ' + total + ' 个字段';
    $('bar').style.width = (r ? r.percent : 0) + '%';

    var req = $('reqTag');
    req.textContent = r && r.missingRequired.length ? ('档案缺 ' + r.missingRequired.length) : '';
    req.style.color = '#b7791f';

    $('fillEmpty').disabled = busy || !total;
    $('fillAll').disabled = busy || !total;
    $('rescan').disabled = busy;
    $('undo').disabled = busy;

    var warn = $('warnBox');
    if (r && r.missingRequired.length) {
      warn.innerHTML = '<div class="warn"><b>' + r.missingRequired.length + ' 个字段档案里还没有</b><br>' +
        esc(r.missingRequired.slice(0, 5).join('、')) +
        (r.missingRequired.length > 5 ? ' 等' : '') + '</div>';
    } else {
      warn.innerHTML = '';
    }

    var fields = (r && r.fields) || [];
    $('listCnt').textContent = fields.length ? fields.length + ' 项' : '—';
    $('list').innerHTML = fields.length ? fields.slice(0, 40).map(function (f) {
      var cls = (f.status === 'ready' || f.status === 'filled') ? 'ok' : (f.status === 'manual' ? 'man' : 'no');
      var mark = cls === 'ok' ? '✓' : cls === 'man' ? '手' : '!';
      var val = cls === 'ok' ? (f.preview || '已就绪') : cls === 'man' ? '需手动' : (f.status === 'unknown' ? '未识别' : '档案缺此项');
      return '<div class="item"><i class="' + cls + '">' + mark + '</i>' +
        '<span class="k" title="' + esc(f.label) + '">' + esc(f.label) + '</span>' +
        '<span class="v">' + esc(val) + '</span></div>';
    }).join('') : '<div class="item"><span class="k" style="color:#93a0b0">页面里没有找到可识别的表单字段</span></div>';

    if (tab) {
      $('host').textContent = tab.url ? safeHost(tab.url) : '';
      $('title').textContent = tab.title || '';
      $('fav').textContent = mark(safeHost(tab.url));
    }
  }

  function mark(host) {
    var c = String(host || '').replace(/^www\./i, '').slice(0, 1);
    return /[a-z\u4e00-\u9fa5]/i.test(c) ? c.toUpperCase() : '·';
  }

  function safeHost(u) {
    try { return new URL(u).hostname; } catch (e) { return u || ''; }
  }

  function unsupported(msg) {
    setConn('off');
    $('pageCard').hidden = true;
    $('listCard').hidden = true;
    $('warnBox').innerHTML = '';
    $('emptyBox').hidden = false;
    if (msg) $('emptyBox').querySelector('p').textContent = msg;
    if (tab) {
      $('host').textContent = tab.url ? safeHost(tab.url) : '';
      $('title').textContent = tab.title || '';
      $('fav').textContent = mark(safeHost(tab.url));
    }
  }

  function scan() {
    if (!tab) return Promise.resolve();
    busy = true;
    return Bridge.scanTab(tab.id).then(function (r) {
      busy = false;
      render(r);
      return r;
    });
  }

  function doFill(mode) {
    if (!tab || busy) return;
    busy = true;
    var btn = mode === 'all' ? $('fillAll') : $('fillEmpty');
    var old = btn.textContent;
    btn.textContent = '正在写入…';
    render(report);
    Bridge.fillTab(tab.id, mode).then(function (r) {
      setTimeout(function () {
        busy = false;
        btn.textContent = old;
        if (r) render(r);
        // 内容脚本会持续上报，再拉一次确保拿到最终状态
        Bridge.getReport(tab.id).then(function (r2) { if (r2) render(r2); });
      }, 550);
    });
  }

  function init() {
    $('fillEmpty').disabled = true;
    $('fillAll').disabled = true;

    Bridge.activeTab().then(function (t) {
      if (!t) return unsupported('没有找到可操作的网页标签，请在招聘网站上打开网申页面后再试。');
      tab = t;
      setConn('');
      $('host').textContent = t.url ? safeHost(t.url) : '';
      $('title').textContent = t.title || '';
      $('fav').textContent = (t.url ? safeHost(t.url) : '·').slice(0, 1);

      return ping(t.id).then(function (ok) {
        if (!ok) return unsupported('这个页面无法注入脚本（可能是浏览器内置页、扩展商店页，或页面尚未加载完成）。请回到招聘官网刷新后重试。');
        setConn('on');
        return Bridge.getReport(t.id).then(function (r) {
          if (r && r.total) { render(r); return; }
          return scan();
        });
      });
    }).catch(function () {
      unsupported('读取当前页面失败，请刷新页面后重试。');
    });
  }

  $('fillEmpty').addEventListener('click', function () { doFill('empty'); });
  $('fillAll').addEventListener('click', function () { doFill('all'); });
  $('rescan').addEventListener('click', function () { scan(); });
  $('undo').addEventListener('click', function () {
    if (!tab || busy) return;
    busy = true;
    Bridge.undoTab(tab.id).then(function () {
      setTimeout(function () { busy = false; scan(); }, 260);
    });
  });
  $('openApp').addEventListener('click', function () { Bridge.openApp('#/dashboard'); window.close(); });
  $('openHelp').addEventListener('click', function () { Bridge.openApp('#/profile'); window.close(); });

  init();
})();
