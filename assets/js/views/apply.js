/* ================= 网申填写：真实页面 + 演示表单 ================= */
(function (global) {
  'use strict';
  var UI = global.UI, Store = global.Store;

  var canLive = !!(global.Bridge && global.Bridge.available);
  var mode = canLive ? 'live' : 'demo';

  /* ---------------- 演示表单状态 ---------------- */
  var job = null;          // 当前填写的岗位
  var values = {};         // 表单当前值
  var filled = {};         // 已由 AI 填充的字段
  var attempted = false;   // 是否已尝试识别
  var filling = false;

  /* ---------------- 真实页面状态 ---------------- */
  var live = { loading: canLive, tab: null, report: null, err: '', busy: '' };

  /* ================= 通用 ================= */
  function tabsHTML() {
    return '<div class="tabs">' +
      '<button class="tab ' + (mode === 'live' ? 'on' : '') + '" data-mode="live">' +
        UI.icon('link', 'sm') + ' 当前网页' + (canLive ? '' : '（需安装扩展）') + '</button>' +
      '<button class="tab ' + (mode === 'demo' ? 'on' : '') + '" data-mode="demo">' +
        UI.icon('edit', 'sm') + ' 演示表单</button>' +
      '</div>';
  }

  function render() {
    if (mode === 'live' && canLive) return renderLive();
    return renderDemo();
  }

  /* =========================================================
     真实页面模式
     ========================================================= */
  function renderLive() {
    var r = live.report;

    var head = '<div class="page-head">' +
      '<div><h1>网申填写</h1><p>在企业官网的真实网申页上识别字段，用你的档案一键写入。脚本只写内容、不点提交，最终由你复核后手动投递。</p></div>' +
      '<div class="actions">' +
        '<button class="btn" data-act="l-refresh">' + UI.icon('refresh', 'sm') + '重新检测</button>' +
      '</div></div>' + tabsHTML();

    if (live.loading) {
      return head + '<div class="card card-pad" style="padding:26px;text-align:center;color:#8b96a6">' +
        '<span class="ai-orb sm" style="margin:0 auto 10px"></span><div>正在读取当前标签页…</div></div>';
    }

    if (!live.tab || live.err) {
      return head + renderNoTarget();
    }

    var total = r ? r.total : 0;
    var ready = r ? r.ready : 0;
    var pct = r ? r.percent : 0;
    var missing = (r && r.missingRequired) || [];
    var fields = (r && r.fields) || [];

    var rows = fields.map(function (f) {
      var ok = f.status === 'ready' || f.status === 'filled';
      var man = f.status === 'manual';
      var color = ok ? '#0e9f6e' : man ? '#8b96a6' : '#b0873a';
      var ic = ok ? 'check' : man ? 'info' : 'alert';
      var right = ok ? (f.preview || '已就绪')
        : man ? '需手动填写'
          : f.status === 'unknown' ? '未识别字段' : '档案缺此项';
      return '<div class="recog-row">' +
        UI.icon(ic, 'sm').replace('class="ic sm"', 'class="ic sm" style="color:' + color + '"') +
        '<span class="k">' + UI.esc(f.label) + '</span>' +
        '<span class="v" style="' + (ok ? '' : 'color:' + color) + '">' + UI.esc(right) + '</span>' +
        '</div>';
    }).join('');

    var empty = !total;
    var body = empty
      ? '<div class="empty" style="padding:34px 20px">' + UI.icon('search') +
        '<strong>这个页面没有识别到网申表单</strong><span>请确认已打开企业的网申填写页（不是职位列表页），然后点「重新检测」。</span></div>'
      : '<div class="recog-list" style="max-height:none;padding:4px 8px 10px">' + rows + '</div>';

    var toolbar = '<div style="padding:12px 14px;border-bottom:1px solid #f0f3f9;display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<button class="btn btn-sm btn-ai" data-act="l-fill-empty"' + (ready ? '' : ' disabled') + '>' +
        UI.icon('zap', 'sm') + (live.busy === 'empty' ? '正在写入…' : '填充空白字段') + '</button>' +
      '<button class="btn btn-sm" data-act="l-fill-all"' + (ready ? '' : ' disabled') + '>' +
        (live.busy === 'all' ? '正在写入…' : '覆盖全部字段') + '</button>' +
      '<button class="btn btn-sm" data-act="l-undo">' + UI.icon('refresh', 'sm') + '撤销</button>' +
      '<span class="tiny" style="margin-left:auto">仅填空白 = 不动你已经写过的内容</span>' +
      '</div>';

    return head +
      '<div class="steps">' +
        '<div class="step done"><span class="step-num">✓</span><span class="lbl">打开网页</span></div><span class="step-line"></span>' +
        '<div class="step ' + (total ? 'done' : 'on') + '"><span class="step-num">' + (total ? '✓' : '2') + '</span><span class="lbl">识别字段</span></div><span class="step-line"></span>' +
        '<div class="step ' + (total ? 'on' : '') + '"><span class="step-num">3</span><span class="lbl">一键填充</span></div>' +
      '</div>' +

      '<div class="apply-layout">' +
        '<div class="card apply-form">' +
          '<div class="apply-company">' +
            '<span class="brand-mark" style="width:38px;height:38px;border-radius:11px;background:#eef4ff;color:#2563eb;display:grid;place-items:center;font-weight:700">' +
              siteMark(live.tabHost) + '</span>' +
            '<div style="min-width:0"><h3>' + UI.esc(live.tabHost || '当前页面') + '</h3>' +
              '<div class="meta" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:420px">' +
                UI.esc((r && r.title) || live.tab.title || '') + '</div>' +
            '</div>' +
            '<span class="badge badge-brand" style="margin-left:auto">真实网页</span>' +
          '</div>' +
          toolbar +
          '<div id="liveBody">' + body + '</div>' +
          '<div style="padding:13px 16px;border-top:1px solid #f0f3f9;display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
            '<span class="tiny">填充完成后请回到官网页面逐项核对，再点官网的「提交」按钮。</span>' +
            '<span class="spacer"></span>' +
            '<button class="btn btn-sm" data-act="l-progress">' + UI.icon('kanban', 'sm') + '记入投递进度</button>' +
          '</div>' +
        '</div>' +

        '<div class="apply-side">' +
          '<div class="card meter-card">' +
            '<div class="meter-top">' + UI.icon('target', 'sm') + '<strong>表单支持度</strong>' +
              '<span class="big">' + pct + '%</span></div>' +
            '<div class="meter"><i style="width:' + pct + '%"></i></div>' +
            '<div class="hstack" style="margin-top:9px"><span class="tiny">可填 ' + ready + ' / ' + total + ' 个字段</span>' +
              '<span class="tiny" style="margin-left:auto">' + (pct >= 70 ? '覆盖良好' : total ? '部分需手填' : '—') + '</span></div>' +
            '<button class="btn btn-ai btn-block" style="margin-top:12px" data-act="l-fill-empty"' + (ready ? '' : ' disabled') + '>' +
              UI.icon('zap', 'sm') + '一键智能填充</button>' +
            '<button class="btn btn-block btn-sm" style="margin-top:8px" data-act="l-refresh">' + UI.icon('refresh', 'sm') + '重新识别字段</button>' +
          '</div>' +

          (missing.length
            ? '<div class="alert-bar">' + UI.icon('alert') +
              '<span><b>' + missing.length + ' 个字段档案里还没有</b><br/>' + UI.esc(missing.join('、')) + '。都可以留空，或在官网上手动填写。</span></div>'
            : total
              ? '<div class="alert-bar ok">' + UI.icon('checkCircle') + '<span>可识别字段已全部就绪，可以在官网复核后提交。</span></div>'
              : '<div class="alert-bar">' + UI.icon('info') + '<span>在官网网申页点击扩展图标，或直接用快捷键 Ctrl+Shift+Y 填充。</span></div>') +

          '<div class="card card-pad advice-card" style="padding:13px 14px">' +
            '<div class="hstack" style="margin-bottom:6px"><span class="ai-orb sm"></span><strong style="font-size:12.5px">AI 投递建议</strong></div>' +
            '<div class="mini-note">' + UI.esc(liveAdvice(total, ready, missing)) + '</div>' +
            '<div class="hstack" style="margin-top:9px;gap:6px">' +
              '<a class="btn btn-sm" href="#/resumes">' + UI.icon('sparkles', 'sm') + '定制简历</a>' +
              (canLive ? '<button class="btn btn-sm" data-act="l-open">打开官网页</button>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function siteMark(host) {
    var c = String(host || '').replace(/^www\./i, '').slice(0, 1);
    return /[a-z\u4e00-\u9fa5]/i.test(c) ? UI.esc(c.toUpperCase())
      : '<span style="display:grid;place-items:center">' + UI.icon('link', 'sm') + '</span>';
  }

  function liveAdvice(total, ready, missing) {
    if (!total) return '先在企业官网打开网申填写页，再回到这里点「重新检测」。也可以直接点浏览器工具栏的扩展图标，在弹窗里一键填充。';
    if (missing.length) return '还有 ' + missing.length + ' 个字段不在你的档案里（' + missing.slice(0, 2).join('、') + ' 等），可以手动填写，也可以去「简历填写」补上，下次就能自动带上。';
    if (ready < 8) return '可识别字段偏少，通常是因为该页面把字段放在了 iframe 或富文本编辑器里。可以在官网页面点扩展图标，用浮层上的「重新识别」再试一次。';
    return '页面字段已基本覆盖。建议填充后重点核对：期望薪资、到岗时间这两项每个企业口径不同，容易出错。';
  }

  function renderNoTarget() {
    return '<div class="card card-pad" style="padding:30px 22px;text-align:center">' +
      '<div style="width:46px;height:46px;border-radius:14px;background:#eef4ff;color:#2563eb;display:grid;place-items:center;margin:0 auto 12px">' + UI.icon('link') + '</div>' +
      '<h3 style="font-size:15px;margin-bottom:6px">还没有可填充的网页</h3>' +
      '<p class="mini-note" style="max-width:460px;margin:0 auto 14px">' +
        '扩展只能在普通网页（http / https）上工作。请先在浏览器里打开某家企业的网申填写页，然后回到这里，或直接点工具栏的 OfferPilot 图标。' +
      '</p>' +
      '<div class="hstack" style="justify-content:center;gap:8px">' +
        '<button class="btn btn-primary btn-sm" data-act="l-refresh">' + UI.icon('refresh', 'sm') + '重新检测</button>' +
        '<button class="btn btn-sm" data-mode="demo">' + UI.icon('edit', 'sm') + '先用演示表单体验</button>' +
      '</div>' +
      '<div class="mini-note" style="margin-top:14px">当前页面：' + UI.esc(live.err || '未检测到活动网页') + '</div>' +
      '</div>';
  }

  /* ---------------- 真实页面动作 ---------------- */
  /* 视图可能被外层重新挂载，绘制目标始终取当前生效的容器 */
  function paint(host) {
    var target = (host && host.isConnected) ? host : document.getElementById('view');
    if (target) target.innerHTML = render();
  }

  var liveSeq = 0;

  function loadLive(host) {
    if (!canLive) return;
    var seq = ++liveSeq;
    live.loading = true;
    live.err = '';
    paint(host);

    global.Bridge.activeTab().then(function (t) {
      if (seq !== liveSeq) return;
      live.tab = t;
      if (!t) {
        live.loading = false;
        live.err = '没有找到 http/https 网页标签';
        paint(host);
        return;
      }
      try { live.tabHost = new URL(t.url).hostname; } catch (e) { live.tabHost = ''; }
      return global.Bridge.getReport(t.id).then(function (r) {
        if (seq !== liveSeq) return;
        live.report = r;
        live.loading = false;
        paint(host);
        if (!r || !r.total) {
          return global.Bridge.scanTab(t.id).then(function (r2) {
            if (seq !== liveSeq) return;
            live.report = r2;
            if (!r2 || !r2.total) live.err = '页面已连接，但暂未识别到表单字段';
            paint(host);
          });
        }
      });
    }).catch(function () {
      if (seq !== liveSeq) return;
      live.loading = false;
      live.err = '读取当前页面失败';
      paint(host);
    });
  }

  function liveFill(host, how) {
    if (!live.tab || live.busy) return;
    live.busy = how;
    paint(host);
    global.Bridge.fillTab(live.tab.id, how).then(function (r) {
      setTimeout(function () {
        live.busy = '';
        if (r) live.report = r;
        paint(host);
        global.Bridge.getReport(live.tab.id).then(function (r2) {
          if (r2) { live.report = r2; paint(host); }
        });
      }, 450);
    });
  }

  function logApplication() {
    var host = live.tabHost || '目标企业';
    var r = live.report || {};
    UI.modal({
      title: '记入投递进度',
      body: '<p class="mini-note" style="margin-bottom:12px">填充完成不等于投递成功。请确认你在官网点了提交，再把这条记录加入看板。</p>' +
        '<div class="form-grid">' +
        '<div class="field"><label>企业名称</label><input class="input" id="lgCompany" value="' + UI.esc(host) + '" /></div>' +
        '<div class="field"><label>岗位名称</label><input class="input" id="lgRole" placeholder="如 数据分析师" /></div>' +
        '</div>' +
        '<div class="hstack" style="margin-top:10px;gap:14px"><span class="tiny">识别字段：' + (r.ready || 0) + ' / ' + (r.total || 0) + '</span>' +
        '<span class="tiny">来源：' + UI.esc(r.url || '') + '</span></div>',
      footer: '<button class="btn" data-close>取消</button><button class="btn btn-primary" data-ok>加入看板</button>',
      onOk: function (box) {
        var c = box.querySelector('#lgCompany').value.trim();
        var role = box.querySelector('#lgRole').value.trim();
        if (!c || !role) { UI.toast('请填写企业和岗位', 'warn'); return false; }
        Store.addApp({
          company: c, role: role, status: 'applied',
          match: 0, channel: '企业官网',
          firstLog: '在官网完成网申填写（识别 ' + (r.ready || 0) + '/' + (r.total || 0) + ' 个字段）'
        });
        UI.toast('已加入投递进度', 'ok');
        setTimeout(function () { location.hash = '#/pipeline'; }, 260);
      }
    });
  }

  /* =========================================================
     演示表单模式（原有能力，保持不变）
     ========================================================= */
  function defaultJob() {
    var todo = Store.state.apps.filter(function (a) { return a.status === 'todo'; })[0];
    var base = todo || Store.state.apps[0] || {};
    return {
      id: base.id || '',
      company: base.company || '目标企业',
      role: base.role || Store.state.profile.basic.targetRole,
      city: base.city || Store.state.profile.basic.targetCity,
      deadline: base.deadline || '',
      match: base.match || 0,
      isNew: !todo
    };
  }

  function ensureJob() { if (!job) job = defaultJob(); }

  /* 按当前岗位挑简历版本：演示表单与真网页用的是同一套匹配逻辑 */
  function activeResume() {
    if (!global.ResumeMatch) return null;
    var j = job || {};
    var jd = (global.AI && global.AI.ctx && global.AI.ctx.jd) || {};
    var role = j.role || jd.role || '';
    var text = [j.role, jd.raw].filter(Boolean).join(' ');
    var out = global.ResumeMatch.rank(Store.state.resumes || [], {
      company: j.company || jd.company || '',
      role: role,
      text: text,
      dirs: global.ResumeMatch.dirsOf(role + ' ' + String(text).slice(0, 3000))
    }, Store.state.profile);
    return out.best ? out.best.resume : null;
  }

  function allFields() {
    var out = [];
    global.SeedData.applyForm.forEach(function (g) {
      g.fields.forEach(function (f) { out.push({ f: f, g: g }); });
    });
    return out;
  }

  function stats() {
    var list = allFields();
    var resume = activeResume();
    var recog = list.filter(function (x) { return Store.resolveField(x.f, resume).ok; });
    /* 全部字段均为选填：这里只统计「还没填」的，用于提示，不作为提交前置条件 */
    var unfilled = list.filter(function (x) {
      if (x.f.type === 'file') {
        var typed = values[x.f.key];
        return !typed && !Store.resolveField(x.f, activeResume()).ok;
      }
      var v = values[x.f.key] || '';
      return !String(v).trim();
    });
    return {
      total: list.length,
      recog: recog.length,
      percent: Math.round(recog.length / list.length * 100),
      unfilled: unfilled,
      missingReq: unfilled,
      list: list
    };
  }

  function renderField(f) {
    var res = Store.resolveField(f, activeResume());
    var val = values[f.key] != null ? values[f.key] : '';
    var isFilled = f.type === 'file' ? !!(val || res.ok) : !!filled[f.key];
    var isMiss = attempted && !isFilled;
    var cls = isFilled ? 'f-filled' : (isMiss ? 'f-miss' : '');
    var flag = isFilled
      ? '<span class="field-flag ok">' + UI.icon('check') + '已识别</span>'
      : (attempted ? '<span class="field-flag no">' + UI.icon('info') + '未填（选填）</span>' : '');

    var control = '';
    if (f.type === 'file') {
      var file = res.value;
      control = '<div class="file-row" style="margin-top:0">' +
        '<span class="file-ic pdf">' + UI.icon('file', 'sm') + '</span>' +
        '<span class="file-main"><strong>' + (val ? UI.esc(val) : (file ? UI.esc(file.name) : '未上传')) + '</strong>' +
        '<span>' + (val ? '来自材料库' : '点击右侧按钮上传') + '</span></span>' +
        '<button class="btn btn-sm" data-upload="' + f.key + '">' + (val ? '重新选择' : '上传') + '</button>' +
        '</div>';
    } else if (f.type === 'select') {
      var opts = (f.options || []).slice();
      /* 档案值与选项写法不一致时（本科 ↔ 本科（学士））先按枚举词典映射，
         映射不到才把档案值补成一项，避免「显示已选、提交对不上」 */
      if (res.ok && res.text) {
        var mapped = window.OptionMap ? window.OptionMap.best(opts, f.key, res.text) : null;
        if (!mapped && opts.indexOf(res.text) < 0) opts.unshift(res.text);
      }
      control = '<select class="select ' + cls + '" data-key="' + f.key + '">' +
        '<option value="">请选择</option>' +
        opts.map(function (o) { return '<option ' + (o === val ? 'selected' : '') + '>' + UI.esc(o) + '</option>'; }).join('') +
        '</select>';
    } else if (f.type === 'textarea') {
      control = '<textarea class="textarea ' + cls + '" data-key="' + f.key + '" style="min-height:74px" placeholder="' + (res.text ? '点击「一键填充」自动写入' : '请填写') + '">' + UI.esc(val) + '</textarea>' +
        '<button class="btn btn-sm btn-ghost" data-gen="' + f.key + '" style="align-self:flex-start;padding:0 4px;height:22px;font-size:11.5px;color:#2563eb">' +
        UI.icon('sparkles', 'sm') + 'AI 帮我写</button>';
    } else {
      control = '<input class="input ' + cls + '" type="' + f.type + '" data-key="' + f.key + '" value="' + UI.esc(val) + '" placeholder="' + (f.type === 'date' || f.type === 'month' ? '' : '请填写') + '" />';
    }

    return '<div class="field ' + (f.span ? 'span-2' : '') + '">' +
      '<label>' + UI.esc(f.label) + flag + '</label>' +
      control +
      '</div>';
  }

  function renderDemo() {
    ensureJob();
    var st = stats();
    var comp = Store.completeness();
    var dLeft = UI.daysLeft(job.deadline);
    var score = job.match || global.AI.match(Store.state.profile, global.AI.ctx.jd).score;
    var advice = (job.deadline && dLeft >= 0 ? '距截止还有 ' + dLeft + ' 天，' : '') +
      (comp.missing.length
        ? '档案还差「' + comp.missing.slice(0, 2).join('、') + '」，补齐后再提交可提升通过率。'
        : '档案已完整，建议在自我评价中补充与岗位直接相关的量化成果。');

    var stepIdx = filling ? 2 : (attempted ? 3 : 1);

    var formHTML = global.SeedData.applyForm.map(function (g) {
      return '<div class="form-sec">' +
        '<div class="form-sec-head">' + UI.icon(g.icon, 'sm') + '<h4>' + g.group + '</h4><span class="line"></span></div>' +
        '<div class="form-grid">' + g.fields.map(renderField).join('') + '</div>' +
        '</div>';
    }).join('');

    var recogRows = st.list.map(function (x) {
      var r = Store.resolveField(x.f, activeResume());
      return '<div class="recog-row">' +
        (r.ok ? UI.icon('check', 'sm').replace('class="ic sm"', 'class="ic sm" style="color:#0e9f6e"')
              : UI.icon('alert', 'sm').replace('class="ic sm"', 'class="ic sm" style="color:#e08c04"')) +
        '<span class="k">' + UI.esc(x.f.label) + '</span>' +
        '<span class="v" style="' + (r.ok ? '' : 'color:#b0873a') + '">' + (r.ok ? UI.esc((r.text || '').replace(/\n/g, ' ').slice(0, 22)) : '无对应信息') + '</span>' +
      '</div>';
    }).join('');

    return '<div class="page-head">' +
        '<div><h1>网申填写</h1><p>AI 自动识别企业表单字段，从档案中匹配对应信息一键写入；提交前保留人工复核，绝不等同于自动投递。</p></div>' +
        '<div class="actions">' +
          '<button class="btn" data-act="switch">' + UI.icon('briefcase', 'sm') + '切换岗位</button>' +
        '</div>' +
      '</div>' + tabsHTML() +

      '<div class="steps">' +
        '<div class="step ' + (stepIdx > 1 ? 'done' : 'on') + '"><span class="step-num">' + (stepIdx > 1 ? '✓' : '1') + '</span><span class="lbl">选择岗位</span></div><span class="step-line"></span>' +
        '<div class="step ' + (stepIdx === 2 ? 'on' : stepIdx > 2 ? 'done' : '') + '"><span class="step-num">' + (stepIdx > 2 ? '✓' : '2') + '</span><span class="lbl">一键填写</span></div><span class="step-line"></span>' +
        '<div class="step ' + (stepIdx === 3 ? 'on' : '') + '"><span class="step-num">3</span><span class="lbl">复核并提交</span></div>' +
      '</div>' +

      '<div class="apply-layout">' +
        '<div class="card apply-form">' +
          '<div class="apply-company">' +
            UI.logo(job.company, 38) +
            '<div style="min-width:0"><h3>' + UI.esc(job.company) + ' · ' + UI.esc(job.role) + '</h3>' +
              '<div class="meta">' + UI.esc(job.city) + '　·　' + (job.deadline ? (dLeft >= 0 ? '距截止 ' + dLeft + ' 天' : '已截止') : '长期开放') + '　·　匹配度 ' + score + ' 分</div>' +
              '<div class="meta" style="margin-top:2px;color:#2563eb">' + UI.icon('file', 'sm') +
                ' 本次使用《' + UI.esc((activeResume() || {}).name || '默认简历') + '》填写' +
                '　<a href="#/resumes" style="color:#2563eb;text-decoration:underline">换一份</a></div>' +
            '</div>' +
            '<span class="badge badge-brand" style="margin-left:auto">2027 校招 · 演示表单</span>' +
          '</div>' +
          '<div id="formBody">' + formHTML + '</div>' +
          '<div style="padding:14px 18px;border-top:1px solid #f0f3f9;display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
            '<button class="btn btn-sm" data-act="clear">' + UI.icon('refresh', 'sm') + '清空表单</button>' +
            '<span class="tiny">这是内置的仿真表单，用于熟悉流程；真实填充请切到「当前网页」</span>' +
            '<span class="spacer"></span>' +
            '<button class="btn btn-primary" data-act="submit">' + UI.icon('send', 'sm') + '复核并提交</button>' +
          '</div>' +
        '</div>' +

        '<div class="apply-side">' +
          '<div class="card meter-card">' +
            '<div class="meter-top">' + UI.icon('target', 'sm') + '<strong>表单支持度</strong>' +
              '<span class="big">' + st.percent + '%</span></div>' +
            '<div class="meter"><i style="width:' + st.percent + '%"></i></div>' +
            '<div class="hstack" style="margin-top:9px"><span class="tiny">已识别 ' + st.recog + ' / ' + st.total + ' 个字段</span>' +
              '<span class="tiny" style="margin-left:auto">' + (st.recog >= 24 ? '覆盖良好' : '部分需手填') + '</span></div>' +
            '<button class="btn btn-ai btn-block" style="margin-top:12px" data-act="fill">' +
              UI.icon('zap', 'sm') + (filling ? '正在填写…' : '一键智能填充') + '</button>' +
            '<button class="btn btn-block btn-sm" style="margin-top:8px" data-act="recheck">' + UI.icon('refresh', 'sm') + '重新识别字段</button>' +
          '</div>' +

          (attempted && st.unfilled.length
            ? '<div class="alert-bar">' + UI.icon('info') +
              '<span><b>' + st.unfilled.length + ' 个字段暂未填写</b><br/>' +
              st.unfilled.slice(0, 6).map(function (x) { return x.f.label; }).join('、') +
              (st.unfilled.length > 6 ? ' 等' : '') + '。这些字段都是选填，可以直接提交。</span></div>'
            : attempted
              ? '<div class="alert-bar ok">' + UI.icon('checkCircle') + '<span>可识别字段已全部填写，可以复核后提交。</span></div>'
              : '<div class="alert-bar">' + UI.icon('info') + '<span>点击「一键智能填充」，AI 会把档案信息写入右侧表单；没识别的字段都是选填，不填也能提交。</span></div>') +

          '<div class="card recog-card">' +
            '<div class="card-head" style="padding:12px 14px"><h3 style="font-size:12.5px">字段识别明细</h3>' +
              '<span class="sub">' + st.recog + '/' + st.total + '</span></div>' +
            '<div style="padding:6px 8px 10px"><div class="recog-list">' + recogRows + '</div></div>' +
          '</div>' +

          '<div class="card card-pad advice-card" style="padding:13px 14px">' +
            '<div class="hstack" style="margin-bottom:6px"><span class="ai-orb sm"></span><strong style="font-size:12.5px">AI 投递建议</strong></div>' +
            '<div class="mini-note">' + UI.esc(advice) + '</div>' +
            '<a class="btn btn-sm" style="margin-top:9px" href="#/resumes">' + UI.icon('sparkles', 'sm') + '生成定制简历</a>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ---------------- 演示表单交互 ---------------- */
  function syncValues(root) {
    UI.$$('[data-key]', root).forEach(function (el) {
      var k = el.getAttribute('data-key');
      if (el.value) values[k] = el.value;
      else delete values[k];
    });
  }

  function doFill(hostRoot) {
    if (filling) return;
    var resume = activeResume();
    var list = allFields().filter(function (x) { return Store.resolveField(x.f, resume).ok; });
    filling = true;
    attempted = true;
    hostRoot.innerHTML = render();
    mount(hostRoot);

    var i = 0, written = 0;
    function step() {
      if (i >= list.length) {
        filling = false;
        hostRoot.innerHTML = render();
        mount(hostRoot);
        UI.toast('已填写 ' + written + ' 个字段，请复核标黄部分', 'ok');
        // 把结果交给浮窗助手：它要在面板里提示「哪些字段因为档案没数据而没填上」
        var missLabels = allFields().filter(function (x) {
          return !filled[x.f.key] && !Store.resolveField(x.f, resume).ok;
        }).map(function (x) { return x.f.label; });
        global.__opaFill = { written: written, missing: missLabels, at: Date.now() };
        return;
      }
      var item = list[i];
      var res = Store.resolveField(item.f, resume);
      var el = hostRoot.querySelector('[data-key="' + item.f.key + '"]');
      var out = res.text;
      var writable = true;
      /* 下拉不能直接赋值：必须命中已有选项，否则 value 会被浏览器清成空串，
         界面上就出现「标为已识别、下拉却是未选择」的假填充 */
      if (item.f.type === 'select') {
        var opts = el ? Array.prototype.map.call(el.options, function (o) { return o.textContent; }) : [];
        var hit = window.OptionMap ? window.OptionMap.best(opts, item.f.key, res.text) : null;
        out = hit ? hit.text : res.text;
        writable = !!hit || opts.indexOf(res.text) >= 0;
      }
      if (el && writable) {
        el.value = out;
        el.classList.add('f-filled');
        values[item.f.key] = out;
        filled[item.f.key] = true;
        written++;
        var flagBox = el.closest('.field').querySelector('.field-flag');
        if (flagBox) { flagBox.className = 'field-flag ok'; flagBox.innerHTML = UI.icon('check') + '已识别'; }
      }
      var progress = hostRoot.querySelector('.meter i');
      if (progress) progress.style.width = (60 + (i / list.length) * 40) + '%';
      i++;
      setTimeout(step, 55);
    }
    setTimeout(step, 120);
  }

  function submit(hostRoot) {
    syncValues(hostRoot);
    attempted = true;
    var st = stats();
    /* 全部选填：不做必填拦截，未填的字段只在复核弹窗里提示 */

    var score = job.match || global.AI.match(Store.state.profile, global.AI.ctx.jd).score;
    var resume = Store.state.resumes.filter(function (r) { return r.isDefault; })[0] || Store.state.resumes[0];

    UI.modal({
      title: '复核并提交',
      body: '<div class="alert-bar ok" style="margin-bottom:12px">' + UI.icon('checkCircle') +
          '<span>共 ' + st.total + ' 个字段，已识别 ' + st.recog + ' 个；其余为选填，可留空。提交前请最后确认以下关键信息。</span></div>' +
        '<div class="kv">' +
          '<div class="kv-row"><span class="k">企业</span><span class="v">' + UI.esc(job.company) + ' · ' + UI.esc(job.role) + '</span></div>' +
          '<div class="kv-row"><span class="k">联系方式</span><span class="v">' + UI.esc(values.phone || '') + ' / ' + UI.esc(values.email || '') + '</span></div>' +
          '<div class="kv-row"><span class="k">院校专业</span><span class="v">' + UI.esc(values.school || '') + ' · ' + UI.esc(values.major || '') + '</span></div>' +
          '<div class="kv-row"><span class="k">投递简历</span><span class="v">' + UI.esc(resume.name) + '</span></div>' +
          '<div class="kv-row"><span class="k">匹配度</span><span class="v">' + score + ' 分</span></div>' +
        '</div>' +
        '<p class="mini-note" style="margin-top:12px">本工具不会替你自动提交。确认信息无误后，点击「记入投递进度」，我们会在进度看板中跟踪这条记录。</p>',
      footer: '<button class="btn" data-close>再检查一下</button><button class="btn btn-primary" data-ok>记入投递进度</button>',
      onOk: function () {
        var app = Store.state.apps.filter(function (a) { return a.id === job.id; })[0];
        if (app) {
          Store.updateApp(app.id, {
            match: score,
            deadline: job.deadline,
            note: app.note || '已完成网申填写'
          });
          if (app.status === 'applied') {
            app.timeline.push({ at: new Date().toISOString(), text: '重新提交网申表单（字段识别 ' + st.recog + '/' + st.total + '）', status: 'applied' });
            Store.emit();
          } else {
            Store.moveApp(app.id, 'applied');
          }
        } else {
          Store.addApp({
            company: job.company, role: job.role, city: job.city,
            status: 'applied', match: score, deadline: job.deadline,
            firstLog: '完成网申表单填写并提交（字段识别 ' + st.recog + '/' + st.total + '）'
          });
        }
        UI.toast('已记入投递进度 · ' + job.company, 'ok');
        job = null; values = {}; filled = {}; attempted = false;
        setTimeout(function () { location.hash = '#/pipeline'; }, 320);
      }
    });
  }

  function switchJob() {
    var apps = Store.state.apps.slice().sort(function (a, b) {
      var order = { todo: 0, applied: 1, written: 2, interview: 3, offer: 4, rejected: 5 };
      return order[a.status] - order[b.status];
    });
    var body = '<p class="mini-note" style="margin-bottom:10px">选择一个待投递岗位继续填写，或手动输入新的企业岗位。</p>' +
      apps.map(function (a) {
        var stage = global.SeedData.stages.filter(function (s) { return s.key === a.status; })[0];
        return '<div class="resume-item" data-pick="' + a.id + '" style="display:flex;align-items:center;gap:10px">' +
          UI.logo(a.company, 30) +
          '<div style="flex:1;min-width:0"><h4>' + UI.esc(a.company) + ' · ' + UI.esc(a.role) + '</h4>' +
          '<p>' + UI.esc(a.city) + ' · ' + (a.deadline ? '截止 ' + UI.fmtShort(a.deadline) : '长期开放') + '</p></div>' +
          '<span class="badge" style="background:' + stage.color + '14;color:' + stage.color + '">' + stage.name + '</span></div>';
      }).join('') +
      '<div class="divider"></div>' +
      '<div class="form-grid"><div class="field"><label>企业名称</label><input class="input" id="jCompany" placeholder="如 京东" /></div>' +
      '<div class="field"><label>岗位名称</label><input class="input" id="jRole" placeholder="如 数据分析师" /></div></div>';

    UI.modal({
      title: '切换网申岗位',
      body: body,
      footer: '<button class="btn" data-close>取消</button><button class="btn btn-primary" data-ok>使用自定义岗位</button>',
      onMount: function (box, close) {
        box.addEventListener('click', function (e) {
          var pick = e.target.closest('[data-pick]');
          if (!pick) return;
          var a = Store.state.apps.filter(function (x) { return x.id === pick.getAttribute('data-pick'); })[0];
          job = { id: a.id, company: a.company, role: a.role, city: a.city, deadline: a.deadline, match: a.match, note: a.note };
          global.AI.setJD(global.AI.parseJD(a.company + ' · ' + a.role + '\n' + (a.note || '')));
          values = {}; filled = {}; attempted = false;
          close();
          global.App.render();
          UI.toast('已切换至 ' + a.company, 'ok');
        });
      },
      onOk: function (box) {
        var c = box.querySelector('#jCompany').value.trim();
        var r = box.querySelector('#jRole').value.trim();
        if (!c || !r) { UI.toast('请填写企业和岗位名称', 'warn'); return false; }
        job = { id: '', company: c, role: r, city: Store.state.profile.basic.targetCity, deadline: '', match: 0, isNew: true };
        values = {}; filled = {}; attempted = false;
        global.App.render();
        UI.toast('已切换到自定义岗位', 'ok');
      }
    });
  }

  /* ---------------- 事件绑定 ---------------- */
  function mount(root) {
    if (root.__bound) return;   // 内部重绘复用同一容器，避免重复绑定
    root.__bound = true;

    root.addEventListener('input', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-key');
      if (!k) return;
      values[k] = e.target.value;
      if (e.target.classList.contains('f-miss') && e.target.value.trim()) {
        e.target.classList.remove('f-miss');
      }
    });

    root.addEventListener('change', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-key');
      if (k) values[k] = e.target.value;
    });

    root.addEventListener('click', function (e) {
      /* 模式切换 */
      var mt = e.target.closest('[data-mode]');
      if (mt) {
        var next = mt.getAttribute('data-mode');
        if (next === mode) return;
        mode = next === 'live' && !canLive ? 'demo' : next;
        if (mode === 'live') loadLive(root);
        else paint(root);
        return;
      }

      /* 真实页面动作 */
      var lAct = e.target.closest('[data-act^="l-"]');
      if (lAct) {
        var la = lAct.getAttribute('data-act');
        if (la === 'l-refresh') return loadLive(root);
        if (la === 'l-fill-empty') return liveFill(root, 'empty');
        if (la === 'l-fill-all') return liveFill(root, 'all');
        if (la === 'l-undo') {
          if (!live.tab) return;
          global.Bridge.undoTab(live.tab.id).then(function () {
            setTimeout(function () { loadLive(root); }, 300);
          });
          return;
        }
        if (la === 'l-progress') return logApplication();
        if (la === 'l-open') {
          UI.toast('请切换到官网标签页操作', 'ok');
          return;
        }
        return;
      }

      var up = e.target.closest('[data-upload]');
      if (up) {
        var key = up.getAttribute('data-upload');
        var field = allFields().filter(function (x) { return x.f.key === key; })[0].f;
        UI.pickFile('.pdf,.jpg,.jpeg,.png', function (file) {
          var rec = Store.addFile(file);
          values[key] = rec.name;
          filled[key] = true;
          global.App.render();
          UI.toast('已上传：' + rec.name, 'ok');
        });
        return;
      }

      var gen = e.target.closest('[data-gen]');
      if (gen) {
        var gk = gen.getAttribute('data-gen');
        var jd = global.AI.ctx.jd;
        var text = '';
        if (gk === 'selfEval') {
          text = global.AI.tailor(Store.state.resumes[0], Store.state.profile, jd).summary;
        } else if (gk === 'intern' || gk === 'project' || gk === 'campus') {
          var type = gk === 'intern' ? 'intern' : gk === 'project' ? 'project' : 'campus';
          var ex = Store.state.profile.experiences.filter(function (x) { return x.type === type; })[0];
          text = ex ? experienceText(ex) : '暂无对应经历，先到档案中补充。';
        } else if (gk === 'award') {
          text = Store.state.profile.skills.certs.join('；');
        } else {
          text = values[gk] || '';
        }
        values[gk] = text;
        filled[gk] = true;
        global.App.render();
        UI.toast('AI 已生成内容，可直接修改', 'ok');
        return;
      }

      var act = e.target.closest('[data-act]');
      if (!act) return;
      var a = act.getAttribute('data-act');
      if (a === 'fill') doFill(root);
      if (a === 'recheck') {
        syncValues(root);
        attempted = true;
        global.App.render();
        UI.toast('已重新识别 ' + stats().recog + ' 个字段', 'ok');
      }
      if (a === 'clear') {
        values = {}; filled = {}; attempted = false;
        global.App.render();
        UI.toast('表单已清空');
      }
      if (a === 'submit') submit(root);
      if (a === 'switch') switchJob();
    });

    /* 每次进入真实页面模式都重新读取当前标签页（防止跨页切换后数据过期） */
    if (mode === 'live' && canLive) loadLive(root);
  }

  function experienceText(ex) {
    var head = [ex.org, ex.role].filter(Boolean).join('｜') + '　' + (ex.period || [ex.start, ex.end].filter(Boolean).join(' – '));
    var body = [];
    if (ex.desc) body.push(ex.desc);
    if (ex.duties) body.push(ex.duties);
    if (ex.results) body.push('成果：' + ex.results);
    if (!body.length) body = (ex.bullets || []).map(function (b) { return '· ' + b; });
    return head + (body.length ? '\n' + body.join('\n') : '');
  }

  global.Views = global.Views || {};
  global.Views.apply = {
    title: '网申填写', render: render, mount: mount,
    enter: function (opts) {
      if (opts && opts.company) {
        mode = 'demo';
        job = { id: '', company: opts.company, role: opts.role || '', city: opts.city || '', deadline: opts.deadline || '', match: 0 };
        values = {}; filled = {}; attempted = false;
      }
    }
  };
})(window);
