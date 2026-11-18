/* ================= 投递进度 ================= */
(function (global) {
  'use strict';
  var UI = global.UI, Store = global.Store;
  var keyword = '';
  var dragId = null;

  function stageOf(key) {
    return global.SeedData.stages.filter(function (s) { return s.key === key; })[0];
  }

  function appsOf(key) {
    return Store.state.apps.filter(function (a) {
      if (a.status !== key) return false;
      if (!keyword) return true;
      return (a.company + a.role + a.city).toLowerCase().indexOf(keyword.toLowerCase()) >= 0;
    }).sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });
  }

  function renderCard(a) {
    var d = UI.daysLeft(a.deadline);
    var urgent = d != null && d >= 0 && d <= 3 && ['todo', 'applied'].indexOf(a.status) >= 0;
    return '<div class="job-card" draggable="true" data-app="' + a.id + '">' +
      '<div class="top">' + UI.logo(a.company, 28) +
        '<div style="min-width:0;flex:1"><h4>' + UI.esc(a.company) + '</h4>' +
        '<div class="role">' + UI.esc(a.role) + '</div></div></div>' +
      '<div class="foot">' +
        '<span class="badge ' + (a.match >= 85 ? 'badge-ok' : a.match >= 75 ? 'badge-brand' : 'badge-warn') + '" style="height:19px;font-size:10.5px">匹配 ' + a.match + '</span>' +
        (urgent ? '<span class="badge badge-danger" style="height:19px;font-size:10.5px">' + (d === 0 ? '今天截止' : d + ' 天截止') + '</span>' : '') +
        '<span style="margin-left:auto">' + UI.fmtShort(a.updatedAt) + '</span>' +
      '</div>' +
    '</div>';
  }

  function render() {
    var total = Store.state.apps.length;
    var st = Store.stats();

    return '<div class="page-head">' +
        '<div><h1>投递进度</h1><p>所有网申集中在一处跟踪。拖动卡片即可更新阶段，点击查看时间线与下一步动作。</p></div>' +
        '<div class="actions">' +
          '<button class="btn" data-act="refresh">' + UI.icon('refresh', 'sm') + '同步状态</button>' +
          '<button class="btn btn-primary" data-act="new">' + UI.icon('plus', 'sm') + '新增投递</button>' +
        '</div>' +
      '</div>' +

      '<div class="card" style="margin-bottom:14px">' +
        '<div style="padding:12px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
          '<div class="topbar-search" style="display:flex;flex:1;max-width:280px;margin:0">' +
            UI.icon('search', 'sm') +
            '<input id="pipeSearch" placeholder="搜索企业 / 岗位" value="' + UI.esc(keyword) + '" />' +
          '</div>' +
          '<span class="tiny">共 ' + total + ' 条 · 流程中 ' + st.active + ' 条 · Offer ' + (st.by.offer || 0) + ' 个</span>' +
          '<span class="spacer"></span>' +
          '<span class="tiny only-desktop">' + UI.icon('info', 'sm') + ' 拖动卡片可更新阶段</span>' +
        '</div>' +
      '</div>' +

      (total ? '' :
        '<div class="card card-pad" style="margin-bottom:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
          '<span class="empty-orb" style="width:42px;height:42px;border-radius:12px;margin:0">' + UI.icon('send') + '</span>' +
          '<div style="flex:1;min-width:200px">' +
            '<strong style="font-size:13.5px;display:block">还没有投递记录</strong>' +
            '<span class="tiny">只有你真正提交的网申才会出现在这里；在「网申填写」提交后会自动生成记录。</span>' +
          '</div>' +
          '<a class="btn btn-primary" href="#/apply">' + UI.icon('zap', 'sm') + '开始网申</a>' +
        '</div>') +

      '<div class="board" id="board">' +
        global.SeedData.stages.map(function (s) {
          var list = appsOf(s.key);
          return '<div class="col" data-col="' + s.key + '">' +
            '<div class="col-head"><span class="col-dot" style="background:' + s.color + '"></span>' +
              '<strong>' + s.name + '</strong><span class="n">' + list.length + '</span></div>' +
            (list.length ? list.map(renderCard).join('')
              : '<div class="empty" style="padding:22px 8px">' + UI.icon('plus') + '<span style="font-size:11.5px">暂无记录</span></div>') +
          '</div>';
        }).join('') +
      '</div>';
  }

  function detail(id) {
    var a = Store.state.apps.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    var stage = stageOf(a.status);
    var resume = Store.state.resumes.filter(function (r) { return r.id === a.resumeId; })[0];

    var body =
      '<div class="hstack" style="gap:12px;margin-bottom:14px">' + UI.logo(a.company, 42) +
        '<div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:650">' + UI.esc(a.company) + ' · ' + UI.esc(a.role) + '</div>' +
        '<div class="tiny" style="margin-top:2px">' + UI.esc(a.city) + ' · ' + UI.esc(a.channel) + ' · 创建于 ' + UI.fmtDate(a.createdAt) + '</div></div>' +
        '<span class="badge" style="background:' + stage.color + '14;color:' + stage.color + '">' + stage.name + '</span>' +
      '</div>' +

      '<div class="kv" style="padding:12px 14px;background:#f8fafc;border-radius:12px">' +
        '<div class="kv-row"><span class="k">匹配度</span><span class="v"><b style="color:' + (a.match >= 85 ? '#0e9f6e' : a.match >= 75 ? '#2563eb' : '#e08c04') + '">' + a.match + ' 分</b></span></div>' +
        '<div class="kv-row"><span class="k">截止时间</span><span class="v">' + (a.deadline ? UI.fmtDate(a.deadline) + '（' + (UI.daysLeft(a.deadline) >= 0 ? '还剩 ' + UI.daysLeft(a.deadline) + ' 天' : '已截止') + '）' : '未标注') + '</span></div>' +
        '<div class="kv-row"><span class="k">薪资范围</span><span class="v">' + UI.esc(a.salary || '面议') + '</span></div>' +
        '<div class="kv-row"><span class="k">投递简历</span><span class="v">' + UI.esc(resume ? resume.name : '未指定') + '</span></div>' +
      '</div>' +

      '<div style="margin-top:16px"><div class="section-title">流程时间线</div>' +
        '<ul class="stage-timeline">' + a.timeline.map(function (t) {
          return '<li><div class="t">' + UI.fmtDate(t.at) + ' ' + (new Date(t.at).getHours() < 10 ? '0' : '') + new Date(t.at).getHours() + ':' + String(new Date(t.at).getMinutes()).padStart(2, '0') + '</div>' +
            '<div class="d">' + UI.esc(t.text) + '</div></li>';
        }).join('') + '</ul></div>' +

      '<div style="margin-top:16px"><div class="section-title">更新阶段</div>' +
        '<div class="chip-row">' + global.SeedData.stages.map(function (s) {
          return '<button class="chip ' + (s.key === a.status ? 'on' : '') + '" data-stage="' + s.key + '">' +
            '<span class="col-dot" style="background:' + s.color + ';display:inline-block;width:6px;height:6px;border-radius:50%"></span>' +
            s.name + '</button>';
        }).join('') + '</div>' +
      '</div>' +

      '<div style="margin-top:16px"><div class="section-title">备注与下一步</div>' +
        '<textarea class="textarea" id="noteBox" style="min-height:70px">' + UI.esc(a.note || '') + '</textarea>' +
      '</div>';

    UI.modal({
      title: '投递详情',
      wide: true,
      body: body,
      footer:
        '<button class="btn btn-sm btn-danger" data-del>删除</button>' +
        '<span class="spacer" style="flex:1"></span>' +
        (a.status === 'todo' ? '<button class="btn" data-goto>去填写网申</button>' : '') +
        '<button class="btn btn-primary" data-save>保存备注</button>',
      onMount: function (box, close) {
        box.addEventListener('click', function (e) {
          if (e.target.closest('[data-save]')) {
            Store.updateApp(a.id, { note: box.querySelector('#noteBox').value });
            UI.toast('备注已保存', 'ok');
            close();
            global.App.render();
          }
          if (e.target.closest('[data-del]')) {
            close();
            UI.confirm('删除这条投递记录？', '删除后不可恢复，相关时间线会一起移除。', function () {
              Store.removeApp(a.id);
              global.App.render();
              UI.toast('已删除', 'ok');
            }, '删除');
          }
          if (e.target.closest('[data-goto]')) {
            close();
            global.Views.apply.enter({ company: a.company, role: a.role, city: a.city, deadline: a.deadline });
            location.hash = '#/apply';
            if (location.hash === '#/apply') global.App.render();
          }
          var chip = e.target.closest('[data-stage]');
          if (chip) {
            Store.moveApp(a.id, chip.getAttribute('data-stage'));
            UI.toast('已更新为「' + stageOf(chip.getAttribute('data-stage')).name + '」', 'ok');
            close();
            global.App.render();
          }
        });
      }
    });
  }

  function mount(root) {
    var board = root.querySelector('#board');

    root.addEventListener('input', function (e) {
      if (e.target.id !== 'pipeSearch') return;
      keyword = e.target.value;
      var pos = e.target.selectionStart;
      global.App.render();
      var next = document.getElementById('pipeSearch');
      if (next) { next.focus(); next.setSelectionRange(pos, pos); }
    });

    root.addEventListener('click', function (e) {
      var card = e.target.closest('[data-app]');
      if (card && !dragId) { detail(card.getAttribute('data-app')); return; }

      var act = e.target.closest('[data-act]');
      if (!act) return;
      var a = act.getAttribute('data-act');
      if (a === 'new') newApp();
      if (a === 'refresh') {
        UI.toast('已刷新，暂无新的状态变化');
        global.App.render();
      }
    });

    if (board) {
      board.addEventListener('dragstart', function (e) {
        var card = e.target.closest('[data-app]');
        if (!card) return;
        dragId = card.getAttribute('data-app');
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', dragId); } catch (err) { }
      });
      board.addEventListener('dragend', function (e) {
        var card = e.target.closest('[data-app]');
        if (card) card.classList.remove('dragging');
        UI.$$('.col', board).forEach(function (c) { c.classList.remove('drag-over'); });
        setTimeout(function () { dragId = null; }, 40);
      });
      board.addEventListener('dragover', function (e) {
        var col = e.target.closest('[data-col]');
        if (!col) return;
        e.preventDefault();
        UI.$$('.col', board).forEach(function (c) { c.classList.toggle('drag-over', c === col); });
      });
      board.addEventListener('drop', function (e) {
        var col = e.target.closest('[data-col]');
        if (!col) return;
        e.preventDefault();
        var id = dragId || e.dataTransfer.getData('text/plain');
        if (!id) return;
        var key = col.getAttribute('data-col');
        Store.moveApp(id, key);
        UI.toast('已更新为「' + stageOf(key).name + '」', 'ok');
        dragId = null;
        global.App.render();
      });
    }
  }

  function newApp() {
    var jd = global.AI.ctx.jd;
    UI.modal({
      title: '新增投递',
      body: '<div class="form-grid">' +
        '<div class="field"><label>企业名称</label><input class="input" id="nCompany" placeholder="如 京东" /></div>' +
        '<div class="field"><label>岗位</label><input class="input" id="nRole" placeholder="如 数据分析师" /></div>' +
        '<div class="field"><label>城市</label><input class="input" id="nCity" placeholder="如 北京" /></div>' +
        '<div class="field"><label>截止日期</label><input class="input" type="date" id="nDeadline" /></div>' +
        '<div class="field"><label>当前阶段</label><select class="select" id="nStatus">' +
          global.SeedData.stages.map(function (s) { return '<option value="' + s.key + '">' + s.name + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="field"><label>薪资范围</label><input class="input" id="nSalary" placeholder="选填" /></div>' +
        '</div>',
      onOk: function (box) {
        var company = box.querySelector('#nCompany').value.trim();
        var role = box.querySelector('#nRole').value.trim();
        if (!company || !role) { UI.toast('请填写企业和岗位', 'warn'); return false; }
        var m = global.AI.match(Store.state.profile, jd);
        Store.addApp({
          company: company, role: role,
          city: box.querySelector('#nCity').value.trim(),
          deadline: box.querySelector('#nDeadline').value,
          status: box.querySelector('#nStatus').value,
          salary: box.querySelector('#nSalary').value.trim(),
          match: m.score,
          firstLog: '创建投递任务'
        });
        global.App.render();
        UI.toast('已新增投递记录', 'ok');
      }
    });
  }

  global.Views = global.Views || {};
  global.Views.pipeline = { title: '投递进度', render: render, mount: mount };
})(window);
