/* ================= 岗位情报：行业 / 城市 / 截止预警 / 匹配推荐 ================= */
(function (global) {
  'use strict';
  var UI = global.UI, Store = global.Store, JD = global.JobData;

  function pool() {
    var mine = Store.jobs() || [];
    var ids = {};
    mine.forEach(function (j) { ids[j.id] = 1; });
    return JD.all().filter(function (j) { return !ids[j.id]; })
      .concat(mine.map(function (j) { return JD.decorate(j, Date.now()); }));
  }

  function bars(rows, total, color) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.total; }).concat([1]));
    return rows.map(function (r) {
      return '<div class="funnel-row">' +
        '<span class="funnel-name">' + UI.esc(r.key) + '</span>' +
        '<span class="funnel-bar"><i style="width:' + (r.total / max * 100) + '%;background:' + color + '"></i></span>' +
        '<span class="funnel-val">' + r.total + '</span>' +
        '<span class="funnel-pct">' + Math.round(r.total / total * 100) + '%</span>' +
      '</div>';
    }).join('');
  }

  /* 匹配度 = 岗位与当前简历库最合适版本的匹配分 */
  function topMatch(list) {
    if (!global.ResumeMatch || !(Store.state.resumes || []).length) return [];
    return list.map(function (j) {
      var text = [j.company, j.role, j.city, j.summary, (j.duty || []).join(' '), (j.req || []).join(' ')].join(' ');
      try {
        var r = global.ResumeMatch.rank(Store.state.resumes, {
          company: j.company, role: j.role, text: text,
          dirs: global.ResumeMatch.dirsOf(j.role + ' ' + text.slice(0, 3000))
        }, Store.state.profile);
        return { job: j, score: r.best ? r.best.score : null };
      } catch (e) { return { job: j, score: null }; }
    }).filter(function (x) { return x.score != null; })
      .sort(function (a, b) { return b.score - a.score; }).slice(0, 6);
  }

  function render() {
    var list = pool();
    var open = list.filter(function (j) { return !j.closed; });
    var byInd = JD.group(open, 'industry');
    var byCity = JD.group(open, 'city');
    var soon = open.filter(function (j) { return j.daysLeft != null && j.daysLeft <= 7; })
      .sort(function (a, b) { return a.daysLeft - b.daysLeft; }).slice(0, 6);
    var intern = open.filter(function (j) { return j.type === 'intern'; }).length;
    var top = topMatch(open);

    var insights = [];
    if (byInd.length) {
      insights.push('「' + byInd[0].key + '」岗位最多，共 ' + byInd[0].total + ' 个，占当前可投岗位的 ' +
        Math.round(byInd[0].total / open.length * 100) + '%。');
    }
    if (byCity.length) {
      insights.push('城市集中度：' + byCity.slice(0, 3).map(function (c) { return c.key + ' ' + c.total; }).join('、') +
        '，前三合计占 ' + Math.round(byCity.slice(0, 3).reduce(function (s, c) { return s + c.total; }, 0) / open.length * 100) + '%。');
    }
    if (soon.length) {
      insights.push(soon.length + ' 个岗位将在 7 天内截止，最近的是 ' + soon[0].company + ' · ' + soon[0].role +
        '（' + soon[0].daysLeft + ' 天）。');
    }

    return '' +
    '<section class="hero slim">' +
      '<div class="hero-inner"><div style="min-width:0">' +
        '<span class="hero-badge">' + UI.icon('trend', 'sm') + ' 数据来自岗位池实时快照</span>' +
        '<h1>岗位情报</h1>' +
        '<p>看清岗位分布、截止节奏与匹配机会，再决定这一周把时间花在哪。</p>' +
      '</div><div class="hero-actions">' +
        '<a class="btn" href="#/jobs">' + UI.icon('briefcase') + '去岗位大厅</a>' +
        '<a class="btn btn-primary" href="#/queue">' + UI.icon('zap') + '批量投递</a>' +
      '</div></div>' +
    '</section>' +

    '<div class="stats">' +
      '<div class="stat"><div class="stat-label">可投岗位</div><div class="stat-value">' + open.length + '</div>' +
        '<div class="stat-foot">已排除截止岗位 ' + (list.length - open.length) + ' 个</div></div>' +
      '<div class="stat"><div class="stat-label">覆盖企业</div><div class="stat-value">' +
        Object.keys(open.reduce(function (m, j) { m[j.company] = 1; return m; }, {})).length + '</div>' +
        '<div class="stat-foot">' + byInd.length + ' 个行业</div></div>' +
      '<div class="stat"><div class="stat-label">实习岗位</div><div class="stat-value">' + intern + '</div>' +
        '<div class="stat-foot">占比 ' + Math.round(intern / (open.length || 1) * 100) + '%</div></div>' +
      '<div class="stat"><div class="stat-label">7 天内截止</div><div class="stat-value warn">' + soon.length + '</div>' +
        '<div class="stat-foot">建议优先处理</div></div>' +
    '</div>' +

    '<div class="insight-strip">' + insights.map(function (t) {
      return '<div class="insight"><span>' + UI.icon('sparkles', 'sm') + '</span><p>' + UI.esc(t) + '</p></div>';
    }).join('') + '</div>' +

    '<div class="two-col">' +
      '<section class="card"><div class="card-head"><h3>行业分布</h3><span class="mute">可投岗位</span></div>' +
        bars(byInd, open.length, '#2563eb') + '</section>' +
      '<section class="card"><div class="card-head"><h3>城市分布</h3><span class="mute">Top 8</span></div>' +
        bars(byCity.slice(0, 8), open.length, '#0ea5a4') + '</section>' +
    '</div>' +

    '<div class="two-col">' +
      '<section class="card"><div class="card-head"><h3>截止预警</h3><span class="mute">7 天内</span></div>' +
        (soon.length ? soon.map(function (j) {
          return '<div class="row-item"><div class="row-main"><b>' + UI.esc(j.company) + ' · ' + UI.esc(j.role) + '</b>' +
            '<span>' + (j.typeName || '') + (j.city ? ' · ' + UI.esc(j.city) : '') + ' · 截止 ' + UI.esc(j.deadline) + '</span></div>' +
            '<span class="badge ' + (j.daysLeft <= 3 ? 'badge-danger' : 'badge-warn') + '">' +
              (j.daysLeft === 0 ? '今天' : j.daysLeft + ' 天') + '</span></div>';
        }).join('') : '<div class="empty" style="padding:24px">' + UI.icon('checkCircle') +
          '<strong>近期没有截止压力</strong><span>可以把精力放在匹配度更高的岗位上</span></div>') +
      '</section>' +
      '<section class="card"><div class="card-head"><h3>匹配机会</h3><span class="mute">按你的简历库</span></div>' +
        (top.length ? top.map(function (x) {
          return '<div class="row-item"><div class="row-main"><b>' + UI.esc(x.job.company) + ' · ' + UI.esc(x.job.role) + '</b>' +
            '<span>' + UI.esc(x.job.city || '') + ' · ' + UI.esc(x.job.industry || '') + '</span></div>' +
            '<span class="jmatch ' + (x.score >= 80 ? 'ok' : x.score >= 62 ? 'brand' : 'warn') + '">' + x.score + '</span></div>';
        }).join('') : '<div class="empty" style="padding:24px">' + UI.icon('file') +
          '<strong>还没有可比对的简历</strong><span>先上传简历建立档案</span></div>') +
      '</section>' +
    '</div>' +

    '<div class="jdnote" style="margin-top:8px">' + UI.icon('info', 'sm') +
      ' 岗位池为内置演示数据（企业官网招聘入口 + 岗位描述摘要），收藏或手动导入的岗位会与你本地档案一起参与统计。</div>';
  }

  function mount() { }

  global.Views = global.Views || {};
  global.Views.insights = { title: '岗位情报', render: render, mount: mount };
})(window);
