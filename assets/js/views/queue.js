/* ================= 投递控制台：队列 / 待确认 / 免费说明 ================= */
(function (global) {
  'use strict';
  var UI = global.UI, Store = global.Store, Q = global.Queue;

  var seg = 'all';
  var keyword = '';
  var openAsks = {};
  var timer = null;
  var lastSig = '';

  var SEGS = [
    { key: 'all', name: '全部' },
    { key: 'active', name: '进行中' },
    { key: 'need', name: '等你回复' },
    { key: 'done', name: '已完成' },
    { key: 'failed', name: '失败' }
  ];

  function tasks() { return Store.tasks() || []; }

  function inSeg(t) {
    if (seg === 'all') return true;
    if (seg === 'active') return t.status === 'queued' || t.status === 'opening' || t.status === 'filling';
    if (seg === 'need') return t.status === 'need_input';
    if (seg === 'done') return t.status === 'done';
    if (seg === 'failed') return t.status === 'failed';
    return true;
  }

  function visible() {
    var k = keyword.trim().toLowerCase();
    return tasks().filter(function (t) {
      if (!inSeg(t)) return false;
      if (k && (t.company + t.role + t.city).toLowerCase().indexOf(k) < 0) return false;
      return true;
    });
  }

  function sig() {
    return tasks().map(function (t) { return t.id + t.status + t.progress + (t.asks || []).length; }).join(',');
  }

  function statCard(label, value, hint, tone) {
    return '<div class="stat"><div class="stat-label">' + label + '</div>' +
      '<div class="stat-value ' + (tone || '') + '">' + value + '</div>' +
      '<div class="stat-foot">' + (hint || '') + '</div></div>';
  }

  function statsHTML() {
    var s = Q.stats(tasks());
    return '<div class="stats stats-5">' +
      statCard('总任务', s.total, s.queued + ' 个排队中') +
      statCard('今日完成', s.todayDone, '共写入 ' + s.fieldsFilled + ' 个字段', 'ok') +
      statCard('成功率', s.total ? s.successRate + '%' : '—', s.done + ' 成功 / ' + s.failed + ' 失败', s.successRate >= 80 ? 'ok' : '') +
      statCard('平均耗时', Q.fmtDuration(s.avgSec), '单次填写耗时') +
      statCard('待你处理', s.need, s.need ? '补充信息后可继续' : '没有需要你处理的', s.need ? 'warn' : '') +
    '</div>';
  }

  /* 完全免费：这里只展示今日用量，没有任何次数限制或付费入口 */
  function freeHTML() {
    var q = Store.quota();
    return '<div class="qcard quota free">' +
      '<div class="qhead">' + UI.icon('zap', 'sm') + '<b>完全免费 · 不限次数</b>' +
        '<span class="badge badge-ok">无额度限制</span>' +
        '<span style="flex:1"></span>' +
        '<button class="btn btn-sm" data-share>分享给同学</button>' +
      '</div>' +
      '<div class="qstep">今日已建 ' + q.used + ' 个投递任务；所有功能（岗位匹配、自动网申、PDF 解析、AI 助手）' +
        '都可直接使用，不需要付费、不需要邀请解锁。</div>' +
      ((q.records || []).length
        ? '<div class="qlog"><span>最近：' + UI.esc(q.records[0].text) +
            (q.records.length > 1 ? ' · 共 ' + q.records.length + ' 次操作' : '') + '</span></div>'
        : '') +
    '</div>';
  }

  function askHTML(t) {
    if (t.status !== 'need_input' || !(t.asks || []).length) return '';
    return '<div class="qasks">' +
      '<div class="qasks-h">' + UI.icon('alert', 'sm') + '档案里没有这些信息，确认后继续填写</div>' +
      (t.asks || []).map(function (a) {
        if (a.answer) {
          return '<div class="qask done"><span>' + UI.esc(a.label) + '</span><b>' + UI.esc(a.answer) + '</b></div>';
        }
        var input = (a.options || []).length
          ? '<select class="select sm" data-ask="' + a.id + '"><option value="">请选择</option>' +
            a.options.map(function (o) {
              return '<option value="' + UI.esc(o) + '">' + UI.esc(o) + '</option>';
            }).join('') + '</select>'
          : '<input class="input sm" data-ask="' + a.id + '" placeholder="' + (a.required ? '必填' : '选填，留空则跳过') + '" />';
        return '<div class="qask"><span>' + UI.esc(a.label) +
          (a.required ? '<i class="req">*</i>' : '') + '</span>' + input + '</div>';
      }).join('') +
      '<div class="qask-foot">' +
        '<button class="btn btn-sm" data-skipask="' + t.id + '">跳过，先按现有档案填</button>' +
        '<button class="btn btn-sm btn-primary" data-submitask="' + t.id + '">提交并继续填写</button>' +
      '</div>' +
    '</div>';
  }

  function taskHTML(t) {
    var badge = 'badge' + (Q.STATUS_TONE[t.status] ? ' badge-' + Q.STATUS_TONE[t.status] : '');
    var running = t.status === 'opening' || t.status === 'filling';
    var acts = [];
    if (t.status === 'queued') acts.push('<button class="btn btn-sm btn-primary" data-run="' + t.id + '">开始</button>');
    if (t.status === 'failed') acts.push('<button class="btn btn-sm btn-primary" data-retry="' + t.id + '">重试</button>');
    if (running) acts.push('<button class="btn btn-sm" data-take="' + t.id + '">接管</button>');
    if (t.status === 'done') acts.push('<button class="btn btn-sm" data-take="' + t.id + '">去官网提交</button>');
    acts.push('<button class="btn btn-sm" data-detail="' + t.id + '">详情</button>');

    return '<div class="qcard st-' + t.status + '" data-task="' + t.id + '">' +
      '<div class="qhead">' +
        UI.logo(t.company, 30) +
        '<div class="qname"><b>' + UI.esc(t.company) + '</b><span>' + UI.esc(t.role) +
          (t.city ? ' · ' + UI.esc(t.city) : '') + '</span></div>' +
        '<span class="badge ' + badge + '">' + Q.STATUS_NAME[t.status] + '</span>' +
        '<span class="qtime">' + (t.endedAt ? UI.fmtShort(t.endedAt) : t.startedAt ? UI.fmtShort(t.startedAt) : UI.fmtShort(t.createdAt)) + '</span>' +
      '</div>' +
      '<div class="qbar' + (running ? ' live' : '') + '"><i style="width:' + (t.progress || 0) + '%"></i></div>' +
      '<div class="qstep">' + UI.esc(t.step || '') +
        (t.report && t.report.total
          ? ' · 字段 ' + (t.report.filled || 0) + '/' + t.report.total + '（' + (t.report.percent || 0) + '%）'
          : '') +
        (t.duration ? ' · 耗时 ' + Q.fmtDuration(t.duration) : '') +
        '<span style="flex:1"></span>' +
        '<span class="qacts">' + acts.join('') + '</span>' +
      '</div>' +
      askHTML(t) +
    '</div>';
  }

  function listHTML() {
    var list = visible();
    if (!tasks().length) {
      return '<div class="empty" style="padding:48px 0">' + UI.icon('send') +
        '<strong>还没有投递任务</strong><span>去岗位大厅挑几个岗位，交给 AI 批量填写</span>' +
        '<div style="margin-top:12px;display:flex;gap:8px">' +
          '<a class="btn btn-sm btn-primary" href="#/jobs">去岗位大厅</a>' +
          '<button class="btn btn-sm" data-paste>粘贴链接建任务</button>' +
        '</div></div>';
    }
    if (!list.length) {
      return '<div class="empty" style="padding:40px 0">' + UI.icon('filter') +
        '<strong>这个状态下没有任务</strong><span>换个筛选条件看看</span></div>';
    }
    return list.map(taskHTML).join('');
  }

  function render() {
    var s = Q.stats(tasks());
    return '' +
    '<section class="hero slim">' +
      '<div class="hero-inner">' +
        '<div style="min-width:0">' +
          '<span class="hero-badge">' + UI.icon('send', 'sm') + ' ' +
            (s.running ? '正在填写 ' + s.running + ' 个任务' : s.queued ? s.queued + ' 个任务排队中' : '队列空闲') + '</span>' +
          '<h1>自动网申</h1>' +
          '<p>AI 按顺序打开企业官网、识别字段、写入档案；遇到档案里没有的信息会停下来问你，' +
            '短信验证码与最终提交始终由你本人完成。</p>' +
        '</div>' +
        '<div class="hero-actions">' +
          '<a class="btn" href="#/jobs">' + UI.icon('briefcase') + '选岗位</a>' +
          '<button class="btn btn-primary" data-runall' + (s.queued ? '' : ' disabled') + '>' +
            UI.icon('zap') + '启动队列' + (s.queued ? '（' + s.queued + '）' : '') + '</button>' +
        '</div>' +
      '</div>' +
    '</section>' +
    statsHTML() +
    freeHTML() +
    '<div class="qtools">' +
      '<div class="seg-group">' + SEGS.map(function (x) {
        var n = tasks().filter(function (t) {
          if (x.key === 'all') return true;
          if (x.key === 'active') return t.status === 'queued' || t.status === 'opening' || t.status === 'filling';
          if (x.key === 'need') return t.status === 'need_input';
          return t.status === x.key;
        }).length;
        return '<button class="seg' + (seg === x.key ? ' on' : '') + '" data-seg="' + x.key + '">' +
          x.name + (n ? '<b>' + n + '</b>' : '') + '</button>';
      }).join('') + '</div>' +
      '<div class="jsearch sm">' + UI.icon('search', 'sm') +
        '<input id="taskQ" type="search" placeholder="搜索企业 / 岗位" value="' + UI.esc(keyword) + '" /></div>' +
      '<span style="flex:1"></span>' +
      '<button class="btn btn-sm" data-retryall>全部重试</button>' +
      '<button class="btn btn-sm" data-clear>清空已完成</button>' +
      '<button class="btn btn-sm" data-paste>' + UI.icon('link', 'sm') + '粘贴链接</button>' +
    '</div>' +
    '<div class="qlist" id="qList">' + listHTML() + '</div>';
  }

  /* ---------------- 局部刷新 ---------------- */
  function repaint() {
    var box = document.getElementById('qList');
    if (!box) return;
    box.innerHTML = listHTML();
    var head = document.querySelector('.stats');
    if (head) head.outerHTML = statsHTML();
    var qbox = document.querySelector('.qcard.quota');
    if (qbox) qbox.outerHTML = freeHTML();
    lastSig = sig();
  }

  /* ---------------- 执行 ---------------- */
  function needBridge() {
    if (global.Bridge && global.Bridge.available) return true;
    UI.modal({
      title: '需要安装扩展才能自动执行',
      body: '<p>自动网申要打开企业官网并操作页面，必须运行在浏览器扩展环境。</p>' +
        '<p class="mute">在 <code>chrome://extensions</code> 打开开发者模式，加载本项目目录即可。</p>',
      footer: '<button class="btn btn-primary" data-close>知道了</button>'
    });
    return false;
  }

  function run(ids) {
    if (!needBridge()) return;
    ids = (ids || []).filter(Boolean);
    if (!ids.length) { UI.toast('没有可执行的任务', 'warn'); return; }
    global.Bridge.queueRun(ids).then(function (r) {
      if (r && r.ok) UI.toast('已开始执行 ' + (r.started || ids.length) + ' 个任务', 'ok');
      else UI.toast((r && r.reason) || '任务启动失败，请确认页面可访问', 'warn');
      repaint();
    });
  }

  function take(t) {
    if (!t.tabId) { UI.toast('任务还没有绑定页面，先点「开始」', 'warn'); return; }
    if (global.Bridge && global.Bridge.focusTab) {
      global.Bridge.focusTab(t.tabId).then(function (ok) {
        if (!ok) UI.toast('页面已关闭，请重新执行该任务', 'warn');
      });
    }
  }

  function submitAsks(id) {
    var box = document.querySelector('[data-task="' + id + '"]');
    if (!box) return;
    var t = Store.taskById(id);
    if (!t) return;
    var answers = [];
    var missed = [];
    (t.asks || []).forEach(function (a) {
      if (a.answer) { answers.push({ label: a.label, value: a.answer }); return; }
      var el = box.querySelector('[data-ask="' + a.id + '"]');
      var v = el ? String(el.value || '').trim() : '';
      if (!v && a.required) { missed.push(a.label); return; }
      if (v) {
        Store.taskEvent(id, 'answer', { id: a.id, value: v });
        answers.push({ label: a.label, value: v });
      }
    });
    if (missed.length) { UI.toast('还有必填项没填：' + missed[0], 'warn'); return; }

    if (global.Bridge && global.Bridge.available && t.tabId) {
      global.Bridge.sendAnswers(id, t.tabId, answers).then(function (r) {
        UI.toast(r && r.ok ? '已回填并继续填写' : '已记录，请回到页面手动确认', r && r.ok ? 'ok' : 'warn');
      });
    } else {
      UI.toast('已记录你的回答', 'ok');
    }
    Store.taskEvent(id, 'filled', { filled: (t.report && t.report.filled) || 0, total: (t.report && t.report.total) || 0 });
    setTimeout(function () { repaint(); }, 60);
  }

  function detail(id) {
    var t = Store.taskById(id);
    if (!t) return;
    var body = '<div class="qdetail">' +
      '<div class="jdhead">' + UI.logo(t.company, 44) +
        '<div style="min-width:0"><h3>' + UI.esc(t.role) + '</h3>' +
        '<div class="jmeta">' + UI.esc(t.company) + (t.city ? ' · ' + UI.esc(t.city) : '') +
          ' · ' + Q.STATUS_NAME[t.status] + (t.resumeName ? ' · 使用《' + UI.esc(t.resumeName) + '》' : '') + '</div></div>' +
        '<span class="badge badge-brand" style="margin-left:auto">' + (t.progress || 0) + '%</span>' +
      '</div>' +
      '<div class="qsteps">' + Q.STEPS.map(function (s, i) {
        var done = (t.progress || 0) >= [0, 20, 45, 70, 95][i];
        return '<span class="' + (done ? 'on' : '') + '">' + (i + 1) + '. ' + s + '</span>';
      }).join('') + '</div>' +
      (t.url ? '<div class="jdnote">' + UI.icon('link', 'sm') + ' ' + UI.esc(t.url) + '</div>' : '') +
      '<div class="jdblock"><h4>操作记录</h4><ul class="qlog-list">' +
        (t.logs || []).map(function (l) {
          return '<li class="' + (l.tone || '') + '"><time>' + UI.fmtShort(l.at) + '</time><span>' + UI.esc(l.text) + '</span></li>';
        }).join('') + '</ul></div>' +
      (t.report && (t.report.total || t.report.filled)
        ? '<div class="jdblock"><h4>字段结果</h4><p>共识别 <b>' + t.report.total + '</b> 个字段，写入 <b>' +
          (t.report.filled || 0) + '</b> 个，覆盖率 <b>' + (t.report.percent || 0) + '%</b>。</p>' +
          ((t.report.missingRequired || []).length
            ? '<p class="miss-line">仍需你手动确认：' + t.report.missingRequired.map(UI.esc).join('、') + '</p>' : '') +
          '</div>'
        : '') +
      '<div class="jdnote warn">' + UI.icon('alert', 'sm') +
        ' 附件上传与最终提交不会自动完成，请在页面上核对后自行点击提交。</div>' +
      '</div>';

    UI.modal({
      title: '任务详情',
      wide: true,
      body: body,
      footer: '<button class="btn btn-sm btn-danger" data-del>删除任务</button>' +
        '<span style="flex:1"></span>' +
        '<button class="btn" data-close>关闭</button>' +
        (t.tabId ? '<button class="btn" data-take>接管页面</button>' : '') +
        (t.status === 'failed' || t.status === 'closed'
          ? '<button class="btn btn-primary" data-retry>重试</button>'
          : t.status === 'queued' ? '<button class="btn btn-primary" data-run>开始执行</button>' : ''),
      onMount: function (box, close) {
        box.addEventListener('click', function (e) {
          if (e.target.closest('[data-del]')) {
            Store.removeTask(t.id); close(); global.App.render(); return;
          }
          if (e.target.closest('[data-take]')) { take(t); close(); return; }
          if (e.target.closest('[data-retry]')) {
            Store.taskEvent(t.id, 'retry'); close(); run([t.id]); return;
          }
          if (e.target.closest('[data-run]')) { close(); run([t.id]); }
        });
      }
    });
  }

  /* 分享（不含任何奖励/解锁逻辑） */
  function openShare() {
    var text = Q.inviteText(location.origin);
    UI.modal({
      title: '分享给同学',
      body: '<div class="invite-box">' +
        '<div class="invite-note">OfferPilot 全程免费、开源可自托管，没有额度也没有会员。' +
          '分享只是让同学少填几份重复表格，不涉及任何奖励。</div>' +
        '<div class="invite-card"><pre id="shareText">' + UI.esc(text) + '</pre>' +
          '<button class="btn btn-sm" data-copy-card>复制</button></div>' +
        '</div>',
      footer: '<button class="btn" data-close>关闭</button>' +
        '<button class="btn btn-primary" data-copy-card>复制分享文案</button>',
      onMount: function (box) {
        box.addEventListener('click', function (e) {
          if (e.target.closest('[data-copy-card]')) {
            UI.copyText(text);
            UI.toast('已复制，粘贴给同学即可', 'ok');
          }
        });
      }
    });
  }

  function pasteJob() {
    UI.modal({
      title: '粘贴岗位链接建任务',
      body: '<div class="form-grid">' +
        '<div class="field span2"><label>网申链接</label><input class="input" id="pUrl" placeholder="https://...（必填，AI 会打开这个页面）" /></div>' +
        '<div class="field"><label>企业</label><input class="input" id="pCompany" placeholder="如 库洛游戏" /></div>' +
        '<div class="field"><label>岗位</label><input class="input" id="pRole" placeholder="如 游戏运营" /></div>' +
        '</div>',
      footer: '<button class="btn" data-close>取消</button><button class="btn btn-primary" data-ok>创建并加入队列</button>',
      onOk: function (box) {
        var url = box.querySelector('#pUrl').value.trim();
        if (!/^https?:\/\//i.test(url)) { UI.toast('请填写完整的 http(s) 链接', 'warn'); return false; }
        var job = Store.addCustomJob({
          url: url,
          company: box.querySelector('#pCompany').value.trim(),
          role: box.querySelector('#pRole').value.trim(),
          text: url
        });
        Store.consumeQuota(1);
        Store.enqueue(job, { source: '手动导入' });
        UI.toast('任务已创建', 'ok');
        global.App.render();
      }
    });
  }

  function mount(root) {
    root.addEventListener('change', function (e) {
      if (e.target.id === 'taskQ') {
        keyword = e.target.value;
        var box = document.getElementById('qList');
        if (box) box.innerHTML = listHTML();
      }
    });
    root.querySelector('#taskQ') && root.querySelector('#taskQ').addEventListener('input', UI.debounce(function (e) {
      keyword = e.target.value;
      var box = document.getElementById('qList');
      if (box) box.innerHTML = listHTML();
    }, 240));

    root.addEventListener('click', function (e) {
      var s = e.target.closest('[data-seg]');
      if (s) { seg = s.getAttribute('data-seg'); global.App.render(); return; }

      if (e.target.closest('[data-share]')) { openShare(); return; }
      if (e.target.closest('[data-paste]')) { pasteJob(); return; }

      if (e.target.closest('[data-runall]')) {
        var ids = tasks().filter(function (t) { return t.status === 'queued'; }).map(function (t) { return t.id; });
        run(ids); return;
      }
      var runBtn = e.target.closest('[data-run]');
      if (runBtn) { run([runBtn.getAttribute('data-run')]); return; }

      var rt = e.target.closest('[data-retry]');
      if (rt) {
        var id = rt.getAttribute('data-retry');
        Store.taskEvent(id, 'retry');
        run([id]);
        return;
      }
      if (e.target.closest('[data-retryall]')) {
        var failed = tasks().filter(function (t) { return t.status === 'failed'; });
        if (!failed.length) { UI.toast('没有失败的任务'); return; }
        failed.forEach(function (t) { Store.taskEvent(t.id, 'retry'); });
        run(failed.map(function (t) { return t.id; }));
        return;
      }
      if (e.target.closest('[data-clear]')) {
        UI.confirm('清空已完成', '清空已完成 / 失败 / 已关闭的任务？进行中的不受影响。', function () {
          Store.clearTasks(['done', 'failed', 'closed']);
          global.App.render();
        });
        return;
      }

      var takeBtn = e.target.closest('[data-take]');
      if (takeBtn) {
        var t2 = Store.taskById(takeBtn.getAttribute('data-take'));
        if (t2) take(t2);
        return;
      }

      var dt = e.target.closest('[data-detail]');
      if (dt) { detail(dt.getAttribute('data-detail')); return; }

      var sub = e.target.closest('[data-submitask]');
      if (sub) { submitAsks(sub.getAttribute('data-submitask')); return; }

      var skip = e.target.closest('[data-skipask]');
      if (skip) {
        var sid = skip.getAttribute('data-skipask');
        var tt = Store.taskById(sid);
        Store.taskEvent(sid, 'finish', tt && tt.report ? tt.report : {});
        repaint();
        UI.toast('已按现有档案完成，缺的字段请在页面上手动补', 'warn');
        return;
      }
    });

    /* 执行中定时刷新：后台更新进度后前端跟随 */
    clearInterval(timer);
    timer = setInterval(function () {
      if (!document.getElementById('qList')) { clearInterval(timer); return; }
      if (sig() !== lastSig) repaint();
    }, 1500);
    lastSig = sig();
  }

  global.Views = global.Views || {};
  global.Views.queue = { title: '自动网申', render: render, mount: mount };
})(window);
