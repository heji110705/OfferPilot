/* ================= 岗位大厅：筛选 / 匹配 / 收藏 / 批量投递 ================= */
(function (global) {
  'use strict';
  var UI = global.UI, Store = global.Store, JD = global.JobData;

  var q = '';
  var type = 'all';
  var city = 'all';
  var industry = 'all';
  var degree = 'all';
  var sort = 'match';
  var onlyOpen = true;
  var onlySaved = false;
  var selected = {};
  var matchCache = {};
  var cacheKey = '';

  function resumeKey() {
    return (Store.state.resumes || []).map(function (r) {
      return r.id + ':' + (r.updatedAt || '') + ':' + (r.isDefault ? 1 : 0);
    }).join('|');
  }

  /* 岗位匹配度：复用简历版本匹配引擎，best 就是该岗位最合适的简历 */
  function matchOf(job) {
    if (!cacheKey || cacheKey !== resumeKey()) { matchCache = {}; cacheKey = resumeKey(); }
    if (matchCache[job.id]) return matchCache[job.id];
    var out = { score: null, resume: null, reasons: [], misses: [] };
    if (global.ResumeMatch && (Store.state.resumes || []).length) {
      var text = job.text || [job.company, job.role, job.city, job.summary,
        (job.tags || []).join(' '), (job.duty || []).join(' '), (job.req || []).join(' ')].join(' ');
      try {
        var r = global.ResumeMatch.rank(Store.state.resumes, {
          company: job.company, role: job.role, text: text,
          dirs: global.ResumeMatch.dirsOf(job.role + ' ' + text.slice(0, 3000))
        }, Store.state.profile);
        if (r.best) {
          out.score = r.best.score;
          out.resume = r.best.resume;
          out.reasons = (r.best.reasons || []).slice(0, 2);
          out.misses = (r.best.misses || []).slice(0, 3);
        }
      } catch (e) { /* 单个岗位算不出来不影响列表 */ }
    }
    matchCache[job.id] = out;
    return out;
  }

  /* 岗位池 = 内置岗位 + 我导入 / 收藏的岗位（同 id 以本地快照为准） */
  function pool() {
    var mine = Store.jobs() || [];
    var mineIds = {};
    mine.forEach(function (j) { mineIds[j.id] = 1; });
    var list = JD.all().filter(function (j) { return !mineIds[j.id]; }).concat(
      mine.map(function (j) { return JD.decorate(j, Date.now()); })
    );
    list.forEach(function (j) {
      j.saved = Store.isJobSaved(j.id);
      var m = matchOf(j);
      j.match = m.score;
      j.matchResume = m.resume;
      j.reasons = m.reasons;
      j.misses = m.misses;
    });
    return list;
  }

  function toneOf(score) {
    if (score == null) return '';
    return score >= 80 ? 'ok' : score >= 62 ? 'brand' : 'warn';
  }

  function dueText(j) {
    if (j.daysLeft == null) return { text: '长期', tone: '' };
    if (j.daysLeft < 0) return { text: '已截止', tone: 'mute' };
    if (j.daysLeft === 0) return { text: '今天截止', tone: 'danger' };
    if (j.daysLeft <= 3) return { text: j.daysLeft + ' 天后截止', tone: 'danger' };
    if (j.daysLeft <= 7) return { text: j.daysLeft + ' 天后截止', tone: 'warn' };
    return { text: j.daysLeft + ' 天后截止', tone: '' };
  }

  function cardHTML(j) {
    var due = dueText(j);
    var m = j.match;
    return '<article class="jcard' + (j.closed ? ' closed' : '') + '" data-job="' + j.id + '">' +
      '<label class="jpick" title="选中后批量投递"><input type="checkbox" data-pick="' + j.id + '"' +
        (selected[j.id] ? ' checked' : '') + '></label>' +
      '<div class="jlogo">' + UI.logo(j.company, 40) + '</div>' +
      '<div class="jbody">' +
        '<div class="jrow">' +
          '<strong class="jrole">' + UI.esc(j.role) + '</strong>' +
          (m != null ? '<span class="jmatch ' + toneOf(m) + '">匹配 ' + m + '</span>' : '') +
          (j.source === 'custom' ? '<span class="jtag src">手动导入</span>' : '') +
        '</div>' +
        '<div class="jmeta">' + UI.esc(j.company) + ' · ' + (j.typeName || '') +
          (j.city ? ' · ' + UI.esc(j.city) : '') + (j.degree ? ' · ' + UI.esc(j.degree) : '') +
          (j.salary ? ' · ' + UI.esc(j.salary) : '') + '</div>' +
        '<div class="jsummary">' + UI.esc(j.summary || '') + '</div>' +
        '<div class="jtags">' + (j.tags || []).slice(0, 4).map(function (t) {
          return '<span class="jtag">' + UI.esc(t) + '</span>';
        }).join('') +
          (j.reasons && j.reasons[0] ? '<span class="jtag hit">' + UI.esc(j.reasons[0]) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="jside">' +
        '<span class="jdue ' + due.tone + '">' + due.text + '</span>' +
        '<div class="jbtns">' +
          '<button class="icon-btn sm' + (j.saved ? ' on' : '') + '" data-save="' + j.id + '" title="' +
            (j.saved ? '取消收藏' : '收藏岗位') + '">' + UI.icon('star', 'sm') + '</button>' +
          '<button class="btn btn-sm" data-detail="' + j.id + '">详情</button>' +
          '<button class="btn btn-sm btn-primary" data-queue="' + j.id + '"' + (j.closed ? ' disabled' : '') + '>' +
            UI.icon('zap', 'sm') + '投递</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function chipsHTML() {
    var list = pool();
    var counts = { all: list.length, campus: 0, intern: 0 };
    list.forEach(function (j) { counts[j.type] = (counts[j.type] || 0) + 1; });
    return ['all', 'campus', 'intern'].map(function (k) {
      return '<button class="seg' + (type === k ? ' on' : '') + '" data-type="' + k + '">' +
        (k === 'all' ? '全部' : JD.TYPE_NAME[k]) + '<b>' + counts[k] + '</b></button>';
    }).join('');
  }

  function options(list, cur, label) {
    return '<option value="all">' + label + '</option>' + list.map(function (x) {
      return '<option value="' + UI.esc(x) + '"' + (x === cur ? ' selected' : '') + '>' + UI.esc(x) + '</option>';
    }).join('');
  }

  function render() {
    var list = pool();
    var view = JD.query(list, {
      q: q, type: type, city: city, industry: industry, degree: degree,
      onlyOpen: onlyOpen, savedIds: onlySaved
    }, sort);
    var picked = Object.keys(selected).filter(function (k) { return selected[k]; });
    var savedCount = list.filter(function (j) { return j.saved; }).length;

    return '' +
    '<section class="hero slim">' +
      '<div class="hero-inner">' +
        '<div style="min-width:0">' +
          '<span class="hero-badge">' + UI.icon('briefcase', 'sm') + ' 岗位池 ' + list.length + ' 个 · 已收藏 ' + savedCount + '</span>' +
          '<h1>岗位大厅</h1>' +
          '<p>按你的档案算匹配度，选中多个岗位一次性交给 AI 去填。完全免费，不限投递次数。</p>' +
        '</div>' +
        '<div class="hero-actions">' +
          '<button class="btn" data-add>' + UI.icon('link') + '粘贴岗位链接</button>' +
          '<a class="btn btn-primary" href="#/queue">' + UI.icon('zap') + '投递控制台</a>' +
        '</div>' +
      '</div>' +
    '</section>' +

    '<div class="jfilters">' +
      '<div class="seg-group">' + chipsHTML() + '</div>' +
      '<div class="jsearch">' + UI.icon('search', 'sm') +
        '<input id="jobQ" type="search" placeholder="搜企业、岗位、技能，如「数据分析」「广州」" value="' + UI.esc(q) + '" />' +
      '</div>' +
      '<select class="select sm" id="fCity">' + options(JD.CITIES, city, '全部城市') + '</select>' +
      '<select class="select sm" id="fIndustry">' + options(JD.INDUSTRIES, industry, '全部行业') + '</select>' +
      '<select class="select sm" id="fDegree">' + options(JD.DEGREES, degree, '学历不限') + '</select>' +
      '<select class="select sm" id="fSort">' +
        '<option value="match"' + (sort === 'match' ? ' selected' : '') + '>按匹配度</option>' +
        '<option value="deadline"' + (sort === 'deadline' ? ' selected' : '') + '>按截止时间</option>' +
        '<option value="new"' + (sort === 'new' ? ' selected' : '') + '>最近更新</option>' +
      '</select>' +
      '<label class="check"><input type="checkbox" id="fOpen"' + (onlyOpen ? ' checked' : '') + '>仅看可投</label>' +
      '<label class="check"><input type="checkbox" id="fSaved"' + (onlySaved ? ' checked' : '') + '>只看收藏</label>' +
    '</div>' +

    '<div class="jbulkbar">' +
      '<label class="check"><input type="checkbox" id="pickAll"' + (view.length && picked.length === view.length ? ' checked' : '') + '>全选本页</label>' +
      '<span class="jcount">共 <b>' + view.length + '</b> 个岗位' + (picked.length ? ' · 已选 <b>' + picked.length + '</b>' : '') + '</span>' +
      '<span style="flex:1"></span>' +
      (picked.length ? '<button class="btn btn-sm" data-clear-pick>清空选择</button>' : '') +
      '<button class="btn btn-sm btn-primary" data-bulk' + (picked.length ? '' : ' disabled') + '>' +
        UI.icon('zap', 'sm') + '批量投递' + (picked.length ? '（' + picked.length + '）' : '') + '</button>' +
    '</div>' +

    (view.length
      ? '<div class="jlist">' + view.map(cardHTML).join('') + '</div>'
      : '<div class="empty" style="padding:56px 0">' + UI.icon('search') +
        '<strong>没有符合条件的岗位</strong><span>放宽筛选条件，或粘贴一个岗位链接试试</span>' +
        '<button class="btn btn-sm" data-reset style="margin-top:12px">清空筛选</button></div>');
  }

  /* ---------------- 详情 ---------------- */
  function openDetail(id) {
    var list = pool();
    var j = list.filter(function (x) { return x.id === id; })[0];
    if (!j) return;
    var m = matchOf(j);
    var saved = Store.isJobSaved(j.id);
    var due = dueText(j);

    var body = '' +
      '<div class="jdetail">' +
        '<div class="jdhead">' + UI.logo(j.company, 48) +
          '<div style="min-width:0"><h3>' + UI.esc(j.role) + '</h3>' +
          '<div class="jmeta">' + UI.esc(j.company) + ' · ' + (j.typeName || '') +
            (j.city ? ' · ' + UI.esc(j.city) : '') + (j.degree ? ' · ' + UI.esc(j.degree) : '') +
            (j.salary ? ' · ' + UI.esc(j.salary) : '') + '</div></div>' +
          '<span class="jdue ' + due.tone + '" style="margin-left:auto">' + due.text + '</span>' +
        '</div>' +

        '<div class="jdgrid">' +
          '<div class="jdblock"><h4>岗位职责</h4>' +
            ((j.duty || []).length ? '<ol>' + j.duty.map(function (x) { return '<li>' + UI.esc(x) + '</li>'; }).join('') + '</ol>'
              : '<p class="mute">手动导入的岗位暂无结构化职责，可参考岗位描述原文。</p>') +
          '</div>' +
          '<div class="jdblock"><h4>任职要求</h4>' +
            ((j.req || []).length ? '<ol>' + j.req.map(function (x) { return '<li>' + UI.esc(x) + '</li>'; }).join('') + '</ol>'
              : '<p class="mute">—</p>') +
          '</div>' +
        '</div>' +

        '<div class="jdblock match-block">' +
          '<h4>简历匹配</h4>' +
          (m.score == null
            ? '<p class="mute">还没有可匹配的简历版本，先去「简历库」建一份。</p>'
            : '<div class="match-line"><b class="' + toneOf(m.score) + '">' + m.score + '</b>' +
              '<div><strong>' + UI.esc(m.resume ? m.resume.name : '') + '</strong>' +
              '<span>' + UI.esc((m.reasons || []).join('；') || '按岗位方向匹配') + '</span></div></div>' +
              ((m.misses || []).length
                ? '<p class="miss-line">档案里还缺：' + m.misses.map(UI.esc).join('、') + '（不影响投递，可在填写时补充）</p>'
                : '')) +
        '</div>' +

        (j.source === 'custom' && j.text
          ? '<details class="jdraw"><summary>岗位描述原文</summary><pre>' + UI.esc(j.text.slice(0, 2000)) + '</pre></details>'
          : '') +

        '<div class="jdnote">' + UI.icon('info', 'sm') +
          ' 投递会在新标签页打开企业招聘官网并自动填写；短信验证码、附件上传与最终提交由你本人完成。</div>' +
      '</div>';

    UI.modal({
      title: '岗位详情',
      wide: true,
      body: body,
      footer: '<button class="btn" data-save>' + (saved ? '取消收藏' : '收藏岗位') + '</button>' +
        '<span style="flex:1"></span>' +
        (j.url ? '<a class="btn" href="' + UI.esc(j.url) + '" target="_blank" rel="noopener">打开官网</a>' : '') +
        '<button class="btn btn-primary" data-go' + (j.closed ? ' disabled' : '') + '>交给 AI 投递</button>',
      onMount: function (box, close) {
        box.addEventListener('click', function (e) {
          if (e.target.closest('[data-save]')) {
            if (Store.isJobSaved(j.id)) { Store.unsaveJob(j.id); UI.toast('已取消收藏'); }
            else { Store.saveJob(j); UI.toast('已收藏，可在「只看收藏」里找到', 'ok'); }
            close();
            global.App.render();
            return;
          }
          if (e.target.closest('[data-go]')) {
            close();
            enqueueJobs([j]);
          }
        });
      }
    });
  }

  /* ---------------- 投递 ---------------- */
  function enqueueJobs(jobs) {
    jobs = jobs || [];
    if (!jobs.length) return;
    Store.consumeQuota(jobs.length);

    var created = jobs.map(function (j) {
      var m = matchOf(j);
      return Store.enqueue(j, {
        source: j.source === 'custom' ? '手动导入' : '岗位大厅',
        resumeId: m.resume ? m.resume.id : '',
        resumeName: m.resume ? m.resume.name : ''
      });
    });

    UI.modal({
      title: '已加入投递队列',
      body: '<p>已创建 <b>' + created.length + '</b> 个投递任务，将按顺序在新标签页打开企业官网并自动填写。</p>' +
        '<div class="qmini">' + created.map(function (t) {
          return '<div><b>' + UI.esc(t.company) + '</b><span>' + UI.esc(t.role) + '</span></div>';
        }).join('') + '</div>' +
        '<p class="mute">执行中请保持浏览器前台；遇到短信验证码会停下来等你处理。</p>',
      footer: '<button class="btn" data-later>稍后执行</button>' +
        '<button class="btn btn-primary" data-run>立即开始（' + created.length + '）</button>',
      onMount: function (box, close) {
        box.addEventListener('click', function (e) {
          if (e.target.closest('[data-run]')) {
            close();
            if (global.Bridge && global.Bridge.queueRun) {
              global.Bridge.queueRun(created.map(function (t) { return t.id; }));
            }
            global.App.go('#/queue');
          }
          if (e.target.closest('[data-later]')) {
            close();
            global.App.go('#/queue');
          }
        });
      }
    });
    selected = {};
  }

  /* 粘贴岗位链接 / JD 快速建任务 */
  function openAdd() {
    UI.modal({
      title: '粘贴岗位链接或 JD',
      wide: true,
      body: '<div class="form-grid">' +
        '<div class="field span2"><label>企业招聘官网链接</label>' +
          '<input class="input" id="addUrl" placeholder="https://jobs.bytedance.com/..." /></div>' +
        '<div class="field"><label>企业名称</label><input class="input" id="addCompany" placeholder="留空则从 JD 里识别" /></div>' +
        '<div class="field"><label>岗位名称</label><input class="input" id="addRole" placeholder="如 数据分析师" /></div>' +
        '<div class="field"><label>城市</label><input class="input" id="addCity" placeholder="如 深圳" /></div>' +
        '<div class="field"><label>类型</label><select class="select" id="addType">' +
          '<option value="campus">校招</option><option value="intern">实习</option></select></div>' +
        '<div class="field span2"><label>岗位描述（可选，用来算匹配度）</label>' +
          '<textarea class="input" id="addText" rows="6" placeholder="把岗位职责与任职要求整段粘贴进来"></textarea></div>' +
        '</div>',
      footer: '<button class="btn" data-close>取消</button><button class="btn btn-primary" data-ok>加入岗位池</button>',
      onOk: function (box) {
        var url = box.querySelector('#addUrl').value.trim();
        var company = box.querySelector('#addCompany').value.trim();
        var role = box.querySelector('#addRole').value.trim();
        var text = box.querySelector('#addText').value.trim();
        if (!url && !text) { UI.toast('链接和 JD 至少填一个', 'warn'); return false; }
        var job = Store.addCustomJob({
          url: url, company: company, role: role,
          city: box.querySelector('#addCity').value.trim(),
          type: box.querySelector('#addType').value,
          text: text, summary: text.slice(0, 40)
        });
        matchCache = {};
        UI.toast('已加入岗位池：' + job.company + ' · ' + job.role, 'ok');
        global.App.render();
      }
    });
  }

  /* 勾选后同步「批量投递」按钮：不重绘整页，避免列表滚动位置跳掉 */
  function syncBulk(root) {
    var bar = root.querySelector('.jbulkbar');
    if (!bar) return;
    var n = Object.keys(selected).filter(function (k) { return selected[k]; }).length;
    var c = bar.querySelector('.jcount');
    if (c) {
      c.innerHTML = '共 <b>' + root.querySelectorAll('.jcard').length + '</b> 个岗位' +
        (n ? ' · 已选 <b>' + n + '</b>' : '');
    }
    var btn = bar.querySelector('[data-bulk]');
    if (btn) {
      btn.disabled = !n;
      btn.innerHTML = UI.icon('zap', 'sm') + '批量投递' + (n ? '（' + n + '）' : '');
    }
    var all = bar.querySelector('#pickAll');
    if (all) {
      var cards = root.querySelectorAll('.jcard').length;
      all.checked = cards > 0 && n === cards;
    }
  }

  function mount(root) {
    var search = root.querySelector('#jobQ');
    if (search) {
      search.addEventListener('input', UI.debounce(function () {
        q = search.value;
        var box = root.querySelector('.jlist') || root.querySelector('.empty');
        global.App.render();
        var s2 = document.getElementById('jobQ');
        if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }
      }, 300));
    }

    root.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'fCity') { city = t.value; global.App.render(); }
      else if (t.id === 'fIndustry') { industry = t.value; global.App.render(); }
      else if (t.id === 'fDegree') { degree = t.value; global.App.render(); }
      else if (t.id === 'fSort') { sort = t.value; global.App.render(); }
      else if (t.id === 'fOpen') { onlyOpen = t.checked; global.App.render(); }
      else if (t.id === 'fSaved') { onlySaved = t.checked; global.App.render(); }
      else if (t.id === 'pickAll') {
        var cur = JD.query(pool(), {
          q: q, type: type, city: city, industry: industry, degree: degree,
          onlyOpen: onlyOpen, savedIds: onlySaved
        }, sort);
        cur.forEach(function (j) { selected[j.id] = t.checked; });
        global.App.render();
      }
      else if (t.hasAttribute && t.hasAttribute('data-pick')) {
        selected[t.getAttribute('data-pick')] = t.checked;
        syncBulk(root);
      }
    });

    root.addEventListener('click', function (e) {
      var seg = e.target.closest('[data-type]');
      if (seg) { type = seg.getAttribute('data-type'); global.App.render(); return; }

      if (e.target.closest('[data-reset]')) {
        q = ''; type = 'all'; city = 'all'; industry = 'all'; degree = 'all'; onlyOpen = false; onlySaved = false;
        global.App.render(); return;
      }
      if (e.target.closest('[data-add]')) { openAdd(); return; }
      if (e.target.closest('[data-clear-pick]')) { selected = {}; global.App.render(); return; }
      if (e.target.closest('[data-bulk]')) {
        var list = pool().filter(function (j) { return selected[j.id] && !j.closed; });
        enqueueJobs(list);
        return;
      }

      var save = e.target.closest('[data-save]');
      if (save) {
        e.stopPropagation();
        var sid = save.getAttribute('data-save');
        if (Store.isJobSaved(sid)) { Store.unsaveJob(sid); UI.toast('已取消收藏'); }
        else {
          var jj = pool().filter(function (x) { return x.id === sid; })[0];
          if (jj) { Store.saveJob(jj); UI.toast('已收藏', 'ok'); }
        }
        global.App.render();
        return;
      }

      var qbtn = e.target.closest('[data-queue]');
      if (qbtn) {
        e.stopPropagation();
        var qid = qbtn.getAttribute('data-queue');
        var job = pool().filter(function (x) { return x.id === qid; })[0];
        if (job) enqueueJobs([job]);
        return;
      }

      var detail = e.target.closest('[data-detail]');
      if (detail) {
        e.stopPropagation();
        openDetail(detail.getAttribute('data-detail'));
        return;
      }

      var card = e.target.closest('.jcard');
      if (card && !e.target.closest('button, input, label')) {
        openDetail(card.getAttribute('data-job'));
      }
    });
  }

  global.Views = global.Views || {};
  global.Views.jobs = { title: '岗位大厅', render: render, mount: mount };
})(window);
