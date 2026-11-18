/* =========================================================
   应用外壳：路由 / 导航 / AI 抽屉 / 全局交互
   ========================================================= */
(function (global) {
  'use strict';
  var UI = global.UI, Store = global.Store;

  var NAV = [
    { key: 'dashboard', name: '工作台', short: '工作台', icon: 'grid', group: '主要' },
    { key: 'profile', name: '简历填写', short: '简历', icon: 'edit' },
    { key: 'resumes', name: '简历库', short: '版本', icon: 'file' },
    { key: 'jobs', name: '岗位大厅', short: '岗位', icon: 'briefcase', group: '投递' },
    { key: 'queue', name: '自动网申', short: '网申', icon: 'send' },
    { key: 'apply', name: '网申填写', short: '填写', icon: 'edit' },
    { key: 'pipeline', name: '投递进度', short: '进度', icon: 'kanban' },
    { key: 'insights', name: '岗位情报', short: '情报', icon: 'trend', group: '洞察' },
    { key: 'copilot', name: 'AI 助手', short: 'AI', icon: 'sparkles', group: '智能' }
  ];

  function currentKey() {
    var h = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return h || 'dashboard';
  }

  /* ---------------- 导航 ---------------- */
  function renderNav() {
    var key = currentKey();
    var html = '';
    var lastGroup = null;
    NAV.forEach(function (n) {
      if (n.group && n.group !== lastGroup) {
        html += '<div class="nav-label">' + n.group + '</div>';
        lastGroup = n.group;
      }
      var badge = '';
      if (n.key === 'pipeline') {
        var pending = Store.state.apps.filter(function (a) { return a.status === 'todo'; }).length;
        if (pending) badge = '<span class="nav-badge">' + pending + '</span>';
      }
      if (n.key === 'queue') {
        var need = (Store.state.queue || []).filter(function (t) { return t.status === 'need_input'; }).length;
        if (need) badge = '<span class="nav-badge">' + need + '</span>';
      }
      html += '<a class="nav-item ' + (n.key === key ? 'active' : '') + '" href="#/' + n.key + '">' +
        UI.icon(n.icon) + '<span>' + n.name + '</span>' + badge + '</a>';
    });
    document.getElementById('nav').innerHTML = html;

    /* 移动端只放 5 个主入口，其余从「工作台」里的卡片进入，避免底栏挤成蚂蚁字 */
    var TAB_KEYS = ['dashboard', 'jobs', 'queue', 'pipeline', 'copilot'];
    document.getElementById('tabbar').innerHTML = NAV.filter(function (n) {
      return TAB_KEYS.indexOf(n.key) >= 0;
    }).map(function (n) {
      var badge = '';
      if (n.key === 'pipeline') {
        var pending = Store.state.apps.filter(function (a) { return a.status === 'todo'; }).length;
        if (pending) badge = '<span style="position:absolute;top:2px;right:50%;margin-right:-16px;width:6px;height:6px;border-radius:50%;background:#e0484a"></span>';
      }
      if (n.key === 'queue') {
        var need = (Store.state.queue || []).filter(function (t) { return t.status === 'need_input'; }).length;
        if (need) badge = '<span style="position:absolute;top:2px;right:50%;margin-right:-16px;width:6px;height:6px;border-radius:50%;background:#e08c04"></span>';
      }
      return '<a class="tab-item ' + (n.key === key ? 'active' : '') + '" href="#/' + n.key + '" style="position:relative">' +
        UI.icon(n.icon) + '<span>' + (n.short || n.name) + '</span>' + badge + '</a>';
    }).join('');
  }

  function syncChrome() {
    var c = Store.completeness();
    var m = document.getElementById('sideMeter');
    if (m) m.style.width = c.percent + '%';
    var s = document.getElementById('sideComplete');
    if (s) s.textContent = c.percent + '%';
    var name = Store.state.profile.basic.name || '同学';
    var nm = document.getElementById('sideName');
    if (nm) nm.textContent = name;
    var av = document.getElementById('sideAvatar');
    if (av) av.textContent = name.slice(0, 1);
    var dot = document.getElementById('bellDot');
    var st = Store.stats();
    if (dot) dot.style.display = st.upcoming.length ? 'block' : 'none';
  }

  /* ---------------- 路由 ---------------- */
  function render() {
    var key = currentKey();
    var view = global.Views[key] || global.Views.dashboard;
    var old = document.getElementById('view');
    // 每次渲染替换容器节点，避免事件监听器重复绑定
    var host = document.createElement('main');
    host.id = 'view';
    host.className = 'view';
    old.parentNode.replaceChild(host, old);

    document.getElementById('pageTitle').textContent = view.title || '';
    host.innerHTML = view.render();
    if (view.mount) view.mount(host);
    renderNav();
    syncChrome();
    try { window.scrollTo(0, 0); } catch (e) { }
  }

  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  /* ---------------- AI 抽屉 ---------------- */
  var drawerOpen = false;
  var drawerMsgs = [];

  function drawerRich(t) { return UI.esc(t).replace(/\*\*(.+?)\*\*/g, '<span class="hl">$1</span>'); }

  function drawerPush(role, text) {
    drawerMsgs.push({ role: role, text: text });
    var body = document.getElementById('aiDrawerBody');
    var wrap = document.createElement('div');
    wrap.className = 'msg ' + (role === 'me' ? 'me' : 'ai');
    wrap.innerHTML = role === 'me'
      ? '<span class="msg-av you">我</span><div class="msg-body"><div class="bubble">' + drawerRich(text) + '</div></div>'
      : '<span class="msg-av ai">AI</span><div class="msg-body"><div class="bubble"><span class="typing"><span></span><span></span><span></span></span></div></div>';
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
    return wrap;
  }

  function drawerSend(text) {
    if (!text || !text.trim()) return;
    drawerPush('me', text);
    var wrap = drawerPush('ai', '');
    var bubble = wrap.querySelector('.bubble');
    if (/岗位职责|任职要求|工作职责/.test(text)) global.AI.setJD(global.AI.parseJD(text));
    setTimeout(function () {
      var res = global.AI.chat(text, { jd: global.AI.ctx.jd });
      UI.typeText(bubble, (res.title ? res.title + '\n\n' : '') + res.body, 8).then(function () {
        if (res.action) {
          var a = document.createElement('a');
          a.className = 'btn btn-sm';
          a.style.marginTop = '8px';
          a.href = res.action.hash;
          a.innerHTML = UI.esc(res.action.label) + UI.icon('arrowRight', 'sm');
          a.addEventListener('click', closeDrawer);
          bubble.parentNode.appendChild(a);
        }
        var body = document.getElementById('aiDrawerBody');
        body.scrollTop = body.scrollHeight;
      });
    }, 420);
  }

  function openDrawer(prefill) {
    var mask = document.getElementById('aiDrawerMask');
    var drawer = document.getElementById('aiDrawer');
    mask.classList.add('show');
    drawer.classList.add('show');
    drawer.setAttribute('aria-hidden', 'false');
    drawerOpen = true;
    var input = document.getElementById('aiInput');
    if (prefill) { input.value = prefill; }
    setTimeout(function () { input && input.focus(); }, 260);
    if (!drawerMsgs.length) {
      drawerMsgs.push({
        role: 'ai',
        text: '你好，我是 OfferPilot AI。当前上下文：' + global.AI.ctx.jd.company + ' · ' + global.AI.ctx.jd.role + '。\n\n可以直接问我：匹配度怎么样、帮我改简历、写自我介绍、预测面试题。'
      });
      document.getElementById('aiDrawerBody').innerHTML =
        '<div class="msg ai"><span class="msg-av ai">AI</span><div class="msg-body">' +
        '<div class="bubble">' + drawerRich(drawerMsgs[0].text) + '</div></div></div>';
    }
  }

  function closeDrawer() {
    document.getElementById('aiDrawerMask').classList.remove('show');
    document.getElementById('aiDrawer').classList.remove('show');
    document.getElementById('aiDrawer').setAttribute('aria-hidden', 'true');
    drawerOpen = false;
  }

  /* ---------------- 通知 ---------------- */
  function showNotifications() {
    var st = Store.stats();
    var rows = [];
    st.upcoming.forEach(function (a) {
      var d = UI.daysLeft(a.deadline);
      rows.push('<div class="todo"><span class="todo-ic warn">' + UI.icon('clock') + '</span>' +
        '<span class="todo-body"><span class="todo-title">' + UI.esc(a.company) + ' · ' + UI.esc(a.role) + '</span>' +
        '<span class="todo-meta">' + (d === 0 ? '今天截止' : '还剩 ' + d + ' 天') + ' · 建议今天完成</span></span></div>');
    });
    Store.state.apps.filter(function (a) { return a.status === 'interview'; }).forEach(function (a) {
      rows.push('<div class="todo"><span class="todo-ic">' + UI.icon('calendar') + '</span>' +
        '<span class="todo-body"><span class="todo-title">' + UI.esc(a.company) + ' 面试待准备</span>' +
        '<span class="todo-meta">' + UI.esc(a.note || '') + '</span></span></div>');
    });
    if (!rows.length) rows.push('<div class="empty">' + UI.icon('checkCircle') + '<strong>没有待处理提醒</strong><span>所有投递都在正常推进</span></div>');

    UI.modal({
      title: '提醒',
      body: '<div style="margin:0 -8px">' + rows.join('') + '</div>',
      footer: '<button class="btn" data-close>关闭</button><button class="btn btn-primary" data-ok>去进度看板</button>',
      onOk: function () { go('#/pipeline'); }
    });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    Store.init();
    if (!location.hash) location.hash = '#/dashboard';

    renderNav();
    render();

    window.addEventListener('hashchange', function () { render(); closeDrawer(); });

    Store.subscribe(function () {
      syncChrome();
      renderNav();
      if (global.Bridge) global.Bridge.syncState();
    });

    /* 扩展环境：从 chrome.storage.local 校正状态，并跟随其他标签页的修改 */
    if (global.Bridge && global.Bridge.available) {
      global.Bridge.onStorageChange(function (changes) {
        var c = changes[Store.KEY];
        if (!c) return;
        if (Store.replace(c.newValue)) { renderNav(); render(); }
      });
      Store.hydrate().then(function () { renderNav(); render(); });
    }

    /* 移动端菜单 */
    var sidebar = document.getElementById('sidebar');
    document.getElementById('menuBtn').addEventListener('click', function () {
      sidebar.classList.toggle('open');
    });
    document.addEventListener('click', function (e) {
      if (window.innerWidth > 900) return;
      if (e.target.closest('#view a[href^="#/"]') || e.target.closest('#tabbar a')) {
        sidebar.classList.remove('open');
      }
    });

    /* AI 抽屉 */
    document.getElementById('aiBtn').addEventListener('click', function () { openDrawer(); });
    document.getElementById('aiDrawerClose').addEventListener('click', closeDrawer);
    document.getElementById('aiDrawerMask').addEventListener('click', closeDrawer);

    var chips = ['匹配分析', '写自我介绍', '定制简历', '面试预测'];
    document.getElementById('aiChips').innerHTML = chips.map(function (c) {
      return '<button class="chip" data-chip="' + c + '">' + c + '</button>';
    }).join('');

    document.getElementById('aiChips').addEventListener('click', function (e) {
      var c = e.target.closest('[data-chip]');
      if (!c) return;
      var map = { '匹配分析': '帮我分析一下这个岗位的匹配度', '写自我介绍': '写一段一分钟自我介绍', '定制简历': '帮我把这个 JD 定制到主简历', '面试预测': '预测一下面试会问什么' };
      drawerSend(map[c.getAttribute('data-chip')] || c.getAttribute('data-chip'));
    });

    var form = document.getElementById('aiForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = document.getElementById('aiInput');
      drawerSend(input.value);
      input.value = '';
      input.style.height = 'auto';
    });
    var aiInput = document.getElementById('aiInput');
    aiInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });
    aiInput.addEventListener('input', function () {
      aiInput.style.height = 'auto';
      aiInput.style.height = Math.min(96, aiInput.scrollHeight) + 'px';
    });

    /* 通知 */
    document.getElementById('bellBtn').addEventListener('click', showNotifications);

    /* 用户区 */
    document.getElementById('sideUser').addEventListener('click', function () { go('#/profile'); });

    /* 全局搜索 = 指令入口 */
    var search = document.getElementById('globalSearch');
    search.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var v = search.value.trim();
      if (!v) return;
      var hit = Store.state.apps.filter(function (a) {
        return (a.company + a.role).indexOf(v) >= 0;
      })[0];
      if (hit) {
        go('#/pipeline');
        UI.toast('已定位到 ' + hit.company + ' 的投递记录');
      } else {
        openDrawer(v);
        UI.toast('已交给 AI 处理');
      }
      search.value = '';
    });

    /* 键盘 */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeDrawer();
        UI.maskClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('globalSearch').focus();
      }
    });
  }

  global.App = {
    render: render,
    go: go,
    openAI: openDrawer,
    closeAI: closeDrawer,
    boot: boot
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
