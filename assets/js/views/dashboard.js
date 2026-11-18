/* ================= 工作台 ================= */
(function (global) {
  'use strict';
  var UI = global.UI, Store = global.Store;

  function greeting() {
    var h = new Date().getHours();
    if (h < 6) return '夜深了';
    if (h < 11) return '早上好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  function buildTodos() {
    var st = Store.stats();
    var p = Store.state.profile;
    var todos = [];

    /* 自动网申里「等你回复」的任务优先级最高：不处理就卡在那儿 */
    (Store.tasks ? Store.tasks() : []).filter(function (t) {
      return t.status === 'need_input';
    }).forEach(function (t) {
      todos.push({
        tone: 'warn', icon: 'alert',
        title: '待确认：' + t.company + ' · ' + t.role,
        meta: 'AI 已填到 ' + (t.progress || 0) + '%，有 ' + (t.asks || []).length + ' 项信息需要你补充',
        action: '去处理', hash: '#/queue'
      });
    });

    st.upcoming.forEach(function (a) {
      var d = UI.daysLeft(a.deadline);
      todos.push({
        tone: d <= 1 ? 'warn' : '',
        icon: d <= 1 ? 'alert' : 'clock',
        title: a.company + ' · ' + a.role,
        meta: (d === 0 ? '今天截止' : '还剩 ' + d + ' 天截止') + ' · 匹配度 ' + a.match + ' 分',
        action: a.status === 'todo' ? '去填写' : '查看',
        hash: a.status === 'todo' ? '#/apply' : '#/pipeline'
      });
    });

    Store.state.apps.filter(function (a) { return a.status === 'interview'; }).forEach(function (a) {
      todos.push({
        tone: '', icon: 'calendar',
        title: '准备「' + a.company + '」面试',
        meta: a.note || '面试进行中，建议先准备项目复盘与岗位理解',
        action: '看进度', hash: '#/pipeline'
      });
    });

    var c = Store.completeness();
    if (c.percent < 100) {
      todos.push({
        tone: '', icon: 'user',
        title: '档案完整度 ' + c.percent + '%，还差 ' + c.missing.length + ' 项',
        meta: '缺：' + c.missing.slice(0, 3).join('、') + (c.missing.length > 3 ? ' 等' : ''),
        action: '去完善', hash: '#/profile'
      });
    }

    var stale = Store.state.apps.filter(function (a) {
      return ['applied', 'written'].indexOf(a.status) >= 0 &&
        (Date.now() - new Date(a.updatedAt).getTime()) > 7 * 86400000;
    });
    if (stale.length) {
      todos.push({
        tone: '', icon: 'refresh',
        title: stale.length + ' 个投递超过 7 天没有进展',
        meta: stale.map(function (s) { return s.company; }).join('、') + ' — 建议登录官网确认状态',
        action: '去跟进', hash: '#/pipeline'
      });
    }

    return todos.slice(0, 5);
  }

  var STAGE_COLORS = { todo: '#cbd5e1', applied: '#2563eb', written: '#7c3aed', interview: '#e08c04', offer: '#0e9f6e', rejected: '#e2e8f0' };

  function render() {
    var st = Store.stats();
    var c = Store.completeness();
    var max = Math.max.apply(null, Object.keys(st.by).map(function (k) { return st.by[k]; }).concat([1]));
    var todos = buildTodos();

    /* 自动网申队列：排在最上面，用户一眼能看到「有几件事在等我」 */
    var qs = (global.Queue && Store.tasks) ? global.Queue.stats(Store.tasks()) : null;
    var qstrip = (qs && (qs.queued || qs.running || qs.need)) ? (
      '<div class="qstrip">' +
        '<span class="qstrip-ic">' + UI.icon('zap', 'sm') + '</span>' +
        '<div class="qstrip-body"><b>自动网申队列</b><span>' +
          (qs.running ? qs.running + ' 个填写中 · ' : '') +
          (qs.queued ? qs.queued + ' 个排队 · ' : '') +
          (qs.need ? qs.need + ' 个等你确认 · ' : '') +
          (qs.todayDone ? '今日已完成 ' + qs.todayDone + ' 个' : '累计完成 ' + qs.done + ' 个') +
        '</span></div>' +
        '<a class="btn btn-sm ' + (qs.need ? 'btn-primary' : '') + '" href="#/queue">' +
          (qs.need ? '去确认' : '查看队列') + '</a>' +
      '</div>'
    ) : '';
    var recent = Store.state.apps.slice().sort(function (a, b) {
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    }).slice(0, 4);

    var stageRow = global.SeedData.stages.map(function (s) {
      var n = st.by[s.key] || 0;
      return '<div class="funnel-row">' +
        '<span class="funnel-name">' + s.name + '</span>' +
        '<span class="funnel-bar"><i style="width:' + (n / max * 100) + '%;background:' + STAGE_COLORS[s.key] + '"></i></span>' +
        '<span class="funnel-val">' + n + '</span></div>';
    }).join('');

    return '' +
    '<section class="hero">' +
      '<div class="hero-inner">' +
        '<div style="min-width:0">' +
          '<span class="hero-badge">' + UI.icon('sparkles', 'sm') + ' ' +
            (Store.state.apps.length
              ? 'AI 已为你分析 ' + Store.state.apps.length + ' 条投递记录'
              : '投递记录为空 · 上传简历后即可开始网申') + '</span>' +
          '<h1>' + greeting() + '，' + UI.esc(Store.state.profile.basic.name) + '</h1>' +
          '<p>今天是 ' + UI.fmtDate(new Date()) + '。' +
            (st.upcoming.length
              ? '有 <b>' + st.upcoming.length + '</b> 个岗位即将截止，最快的是「' + UI.esc(st.upcoming[0].company) + '」' +
                (UI.daysLeft(st.upcoming[0].deadline) === 0 ? '今天截止' : '还剩 ' + UI.daysLeft(st.upcoming[0].deadline) + ' 天') + '。'
              : '暂无临近截止的岗位，可以集中精力准备面试。') +
          '</p>' +
        '</div>' +
        '<div class="hero-actions">' +
          '<a class="btn btn-primary" href="#/apply">' + UI.icon('zap') + '开始智能网申</a>' +
          '<a class="btn" href="#/resumes">' + UI.icon('sparkles') + '定制简历</a>' +
        '</div>' +
      '</div>' +
    '</section>' +

    qstrip +

    '<div class="stats">' +
      '<div class="stat"><div class="stat-label">' + UI.icon('send', 'sm') + '本周投递</div>' +
        '<div class="stat-value">' + st.week + '<small>次</small></div>' +
        '<div class="stat-foot">累计 ' + st.total + ' 条投递记录</div></div>' +
      '<div class="stat"><div class="stat-label">' + UI.icon('trend', 'sm') + '流程中</div>' +
        '<div class="stat-value">' + st.active + '<small>个</small></div>' +
        '<div class="stat-foot">已投递 / 笔试 / 面试</div></div>' +
      '<div class="stat"><div class="stat-label">' + UI.icon('clock', 'sm') + '近 3 天截止</div>' +
        '<div class="stat-value" style="color:' + (st.upcoming.length ? '#e08c04' : 'inherit') + '">' + st.upcoming.length + '<small>个</small></div>' +
        '<div class="stat-foot">' + (st.upcoming[0] ? UI.esc(st.upcoming[0].company) + ' 最紧急' : '暂无临近截止') + '</div></div>' +
      '<div class="stat"><div class="stat-label">' + UI.icon('target', 'sm') + '平均匹配度</div>' +
        '<div class="stat-value">' + (st.total ? st.avgMatch + '<small>分</small>' : '—') + '</div>' +
        '<div class="stat-foot">档案完整度 ' + c.percent + '%</div></div>' +
    '</div>' +

    '<div class="grid-2">' +
      '<div>' +
        '<div class="card">' +
          '<div class="card-head"><h3>接下来做什么</h3><span class="sub">按截止时间与流程状态排序</span></div>' +
          '<div class="todo-list">' +
            (todos.length ? todos.map(function (t) {
              return '<a class="todo" href="' + t.hash + '">' +
                '<span class="todo-ic ' + t.tone + '">' + UI.icon(t.icon) + '</span>' +
                '<span class="todo-body"><span class="todo-title">' + UI.esc(t.title) + '</span>' +
                '<span class="todo-meta">' + UI.esc(t.meta) + '</span></span>' +
                '<span class="badge badge-brand">' + t.action + '</span></a>';
            }).join('') : '<div class="empty">' + UI.icon('checkCircle') + '<strong>全部处理完毕</strong><span>可以开始投递新岗位了</span></div>') +
          '</div>' +
        '</div>' +

        '<div class="card" style="margin-top:16px">' +
          '<div class="card-head"><h3>最近的投递</h3><a class="sub" href="#/pipeline">查看全部 ' + UI.icon('chevronRight', 'sm') + '</a></div>' +
          '<div class="recent">' +
            (recent.length ? recent.map(function (a) {
              var stage = global.SeedData.stages.filter(function (s) { return s.key === a.status; })[0];
              return '<a class="recent-row" href="#/pipeline">' + UI.logo(a.company) +
                '<span class="recent-main"><strong>' + UI.esc(a.company) + ' · ' + UI.esc(a.role) + '</strong>' +
                '<span>' + UI.esc(a.city) + ' · ' + UI.relTime(a.updatedAt) + '更新</span></span>' +
                '<span class="badge" style="background:' + stage.color + '14;color:' + stage.color + '">' + stage.name + '</span></a>';
            }).join('') : '<div class="empty" style="padding:26px 12px">' + UI.icon('send') +
              '<strong>还没有投递记录</strong><span>完成一次网申后，这里会按时间倒序显示</span></div>') +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div>' +
        '<div class="card">' +
          '<div class="card-head"><h3>投递漏斗</h3><span class="sub">共 ' + st.total + ' 条</span></div>' +
          '<div class="funnel">' + stageRow + '</div>' +
        '</div>' +

        '<div class="card" style="margin-top:16px">' +
          '<div class="card-head"><h3>快捷操作</h3></div>' +
          '<div style="padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:9px">' +
            '<a class="btn" style="height:64px;flex-direction:column;gap:4px;font-size:12px" href="#/profile">' + UI.icon('user') + '完善档案</a>' +
            '<a class="btn" style="height:64px;flex-direction:column;gap:4px;font-size:12px" href="#/resumes">' + UI.icon('file') + '简历库</a>' +
            '<a class="btn" style="height:64px;flex-direction:column;gap:4px;font-size:12px" href="#/jobs">' + UI.icon('briefcase') + '岗位大厅</a>' +
            '<a class="btn" style="height:64px;flex-direction:column;gap:4px;font-size:12px" href="#/queue">' + UI.icon('send') + '自动网申</a>' +
            '<a class="btn" style="height:64px;flex-direction:column;gap:4px;font-size:12px" href="#/apply">' + UI.icon('edit') + '网申填写</a>' +
            '<button class="btn" style="height:64px;flex-direction:column;gap:4px;font-size:12px" data-ai>' + UI.icon('sparkles') + 'AI 助手</button>' +
          '</div>' +
        '</div>' +

        '<div class="card" style="margin-top:16px">' +
          '<div class="card-head"><h3>档案完整度</h3><span class="sub">' + c.percent + '%</span></div>' +
          '<div style="padding:16px 18px 18px">' +
            '<div class="meter"><i style="width:' + c.percent + '%"></i></div>' +
            '<p class="mini-note" style="margin-top:10px">' +
              (c.missing.length ? '尚未完善：' + UI.esc(c.missing.join('、')) : '档案已完善，可放心投递。') +
            '</p>' +
            '<a class="btn btn-sm" style="margin-top:12px" href="#/profile">查看档案</a>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function mount(root) {
    var ai = root.querySelector('[data-ai]');
    if (ai) ai.addEventListener('click', function () { global.App.openAI(); });
  }

  global.Views = global.Views || {};
  global.Views.dashboard = { title: '工作台', render: render, mount: mount };
})(window);
