/* =========================================================
   智能助手浮窗（工作台内）
   一键填写 / 选区填写 / 辅助填写 + 记录职位 / 管理投递 / 编辑简历 / 切换简历
   简历导航：按岗位匹配版本，点一下复制整份简历内容
   ========================================================= */
(function (global) {
  'use strict';
  var UI = global.UI, Store = global.Store, RM = global.ResumeMatch;

  var mode = 'simple';
  var open = false;
  var dock = null;
  var result = null;      // 最近一次填写的结果：{written, missing[]}
  var missOpen = false;
  var pickedId = '';

  function esc(s) { return UI.esc(s); }

  function fmtSaved(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    if (!m) return s + ' 秒';
    return s ? m + ' 分 ' + s + ' 秒' : m + ' 分钟';
  }

  /* ---------------- 岗位 → 简历匹配 ---------------- */
  function currentJob() {
    var jd = (global.AI && global.AI.ctx && global.AI.ctx.jd) || {};
    return {
      company: jd.company || '',
      role: jd.role || '',
      text: jd.raw || '',
      dirs: RM ? RM.dirsOf([jd.role, jd.company, String(jd.raw || '').slice(0, 3000)].join(' ')) : []
    };
  }

  function ranking() {
    if (!RM) return { best: null, list: [] };
    var job = currentJob();
    var out = RM.rank(Store.state.resumes || [], job, Store.state.profile);
    if (pickedId) {
      var hit = (out.list || []).filter(function (x) { return x.resume.id === pickedId; })[0];
      if (hit) {
        out.best = { resume: hit.resume, score: hit.score, level: hit.level, reasons: ['手动指定这个版本'], manual: true };
        out.unanswered = false;
      }
    }
    return out;
  }

  function currentResume() {
    var r = ranking();
    if (r.best) return r.best.resume;
    var list = Store.state.resumes || [];
    return list.filter(function (x) { return x.isDefault; })[0] || list[0] || null;
  }

  function copyText(text) {
    text = String(text || '');
    if (!text) return Promise.resolve(false);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return legacy(text); });
      }
    } catch (e) { /* ignore */ }
    return Promise.resolve(legacy(text));
  }

  function legacy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-2000px;left:-2000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }

  function copyResume(id) {
    var r = (Store.state.resumes || []).filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    pickedId = id;
    var text = RM ? RM.fullText(Store.state, r) : '';
    copyText(text).then(function (ok) {
      UI.toast(ok ? '已复制《' + r.name + '》全文，共 ' + text.length + ' 字' : '剪贴板被浏览器拦截，请到简历库导出', ok ? 'ok' : 'warn');
      paint();
    });
  }

  /* 填完之后等页面把结果写回来，再在面板里提示缺失字段 */
  function waitFill(since) {
    var tries = 0;
    (function tick() {
      var r = global.__opaFill;
      if (r && r.at >= since) {
        result = { written: r.written, missing: r.missing || [], saved: (r.written + (r.missing || []).length) * 15 };
        openPanel();
        return;
      }
      if (++tries > 40) return;
      setTimeout(tick, 150);
    })();
  }

  function resultHtml() {
    if (!result) return '';
    var miss = result.missing || [];
    return '<div class="opa-done"><b>填写完成，已写入 ' + result.written + ' 个字段</b>' +
        '<span>预计为你节约 ' + fmtSaved(result.saved) + '，请检查页面中的填写结果</span></div>' +
      (miss.length
        ? '<div class="opa-miss">' +
            '<div class="opa-miss-h"><i>!</i><span>预计有 ' + miss.length + ' 个字段因为【你的简历】无对应数据而未能填入</span></div>' +
            '<div class="opa-miss-row">' +
              '<button class="opa-miss-btn" data-opa-act="miss">' + (missOpen ? '收起缺失字段' : '查看缺失字段') + '</button>' +
              '<button class="opa-miss-btn go" data-opa-act="improve">去完善简历</button>' +
            '</div>' +
          '</div>' +
          (missOpen
            ? '<div class="opa-miss-list">' + miss.map(function (m) { return '<div>' + esc(m) + '<em>简历未填</em></div>'; }).join('') + '</div>'
            : '')
        : '');
  }

  function currentView() {
    return (location.hash || '').replace(/^#\/?/, '').split('?')[0] || 'dashboard';
  }

  function go(hash, delay) {
    setTimeout(function () { location.hash = hash; }, delay || 0);
  }

  /* 触发当前页面上的按钮：用于「一键填写 / 撤销」复用页面既有逻辑 */
  function press(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && !el.disabled) { el.click(); return true; }
    }
    return false;
  }

  function liveTab() {
    if (!global.Bridge || !global.Bridge.available) return Promise.resolve(null);
    return global.Bridge.activeTab();
  }

  /* 让目标网申页打开指定视图（选区框选 / 辅助填写 / 简历闪填） */
  function openOnTab(viewName) {
    return liveTab().then(function (tab) {
      if (!tab) {
        UI.toast('没找到可操作的网申页面，请先打开企业官网', 'warn');
        return false;
      }
      if (!global.Bridge || !global.Bridge.panelTab) {
        UI.toast('请升级扩展后再用这个功能', 'warn');
        return false;
      }
      global.Bridge.panelTab(tab.id, viewName);
      var host = String(tab.url || '').replace(/^https?:\/\//, '').split('/')[0];
      UI.toast('已把面板发到 ' + host + '，切过去就能看到', 'ok');
      return true;
    });
  }

  /* ---------------- 记录职位 ---------------- */
  function recordJob() {
    UI.modal({
      title: '记录职位',
      wide: true,
      body: '<p class="mini-note" style="margin-bottom:12px">把正在看的岗位先记下来，之后在投递进度里推进阶段，不会自动投递。</p>' +
        '<div class="form-grid">' +
          '<div class="field"><label>企业名称</label><input class="input" id="rjCompany" placeholder="如 中国电信" /></div>' +
          '<div class="field"><label>岗位名称</label><input class="input" id="rjRole" placeholder="如 数据分析师" /></div>' +
          '<div class="field"><label>工作城市</label><input class="input" id="rjCity" placeholder="如 广州" /></div>' +
          '<div class="field"><label>截止时间</label><input class="input" type="date" id="rjDeadline" /></div>' +
          '<div class="field span-2"><label>岗位链接</label><input class="input" id="rjLink" placeholder="https://（选填）" /></div>' +
          '<div class="field span-2"><label>备注</label><textarea class="textarea" id="rjNote" style="min-height:64px" placeholder="投递要求、内推码等（选填）"></textarea></div>' +
        '</div>',
      footer: '<button class="btn" data-close>取消</button><button class="btn btn-primary" data-ok>保存到投递进度</button>',
      onOk: function (box) {
        var company = box.querySelector('#rjCompany').value.trim();
        var role = box.querySelector('#rjRole').value.trim();
        if (!company || !role) { UI.toast('企业和岗位名称至少填一个就够', 'warn'); return false; }
        var link = box.querySelector('#rjLink').value.trim();
        var note = box.querySelector('#rjNote').value.trim();
        Store.addApp({
          company: company, role: role,
          city: box.querySelector('#rjCity').value.trim(),
          deadline: box.querySelector('#rjDeadline').value,
          status: 'todo',
          channel: link ? '岗位链接' : '手动记录',
          note: [note, link].filter(Boolean).join(' · '),
          firstLog: '记录职位（尚未投递）'
        });
        UI.toast('已加入待投递列表', 'ok');
        go('#/pipeline', 200);
      }
    });
  }

  /* ---------------- 切换简历 ---------------- */
  function switchResume() {
    var list = Store.state.resumes;
    if (!list.length) {
      UI.toast('还没有简历版本，先上传一份简历 PDF', 'warn');
      go('#/resumes', 200);
      return;
    }
    var rk = ranking();
    var def = currentResume();
    UI.modal({
      title: '切换简历',
      body: '<p class="mini-note" style="margin-bottom:10px">网申填写与导出默认使用选中的版本；带「匹配」标记的是按当前岗位算出来的推荐版本。</p>' +
        list.map(function (r) {
          var hit = (rk.list || []).filter(function (x) { return x.resume.id === r.id; })[0] || {};
          return '<button class="rs-pick ' + (def && r.id === def.id ? 'on' : '') + '" data-pick="' + r.id + '">' +
            '<span class="rs-radio"></span>' +
            '<span class="rs-main"><strong>' + esc(r.name) + '</strong><em>' + esc(r.target || '未设置目标岗位') + '</em></span>' +
            (hit.score != null ? '<span class="badge badge-brand">匹配 ' + hit.score + '%</span>' : '') +
            (r.isDefault ? '<span class="badge badge-ok">默认</span>' : '') +
            '</button>';
        }).join(''),
      footer: '<button class="btn" data-close>取消</button><button class="btn btn-primary" data-ok>设为默认</button>',
      onMount: function (box) {
        box.addEventListener('click', function (e) {
          var pick = e.target.closest('[data-pick]');
          if (!pick) return;
          Array.prototype.forEach.call(box.querySelectorAll('.rs-pick'), function (x) { x.classList.remove('on'); });
          pick.classList.add('on');
        });
      },
      onOk: function (box) {
        var pick = box.querySelector('.rs-pick.on');
        if (!pick) { UI.toast('先选一个版本', 'warn'); return false; }
        Store.setDefaultResume(pick.getAttribute('data-pick'));
        pickedId = pick.getAttribute('data-pick');
        UI.toast('已切换默认简历', 'ok');
        if (currentView() === 'resumes') global.App.render();
        paint();
      }
    });
  }

  /* ---------------- 动作分发 ---------------- */
  function act(key, el) {
    var view = currentView();
    if (key === 'fill') {
      close();
      if (view === 'apply') {
        var since = Date.now();
        if (press(['[data-act="l-fill-empty"]', '[data-act="fill"]'])) {
          UI.toast('正在把档案写入表单…');
          waitFill(since);
        } else {
          UI.toast('当前页面没有可填写的表单，先选择岗位', 'warn');
        }
      } else {
        go('#/apply', 0);
        UI.toast('已打开网申填写，点「一键智能填充」即可');
      }
      return;
    }
    if (key === 'region') {
      close();
      openOnTab('pick').then(function (ok) {
        if (!ok) go('#/apply', 0);
      });
      return;
    }
    if (key === 'assist') {
      close();
      openOnTab('assist').then(function (ok) {
        if (!ok) {
          go('#/apply', 0);
          UI.toast('辅助填写会针对单个字段给草稿，请到网申页面上操作', 'warn');
        }
      });
      return;
    }
    if (key === 'undo') {
      close();
      var ok = press(['[data-act="l-undo"]']);
      if (!ok) ok = press(['[data-act="clear"]']);
      result = null;
      UI.toast(ok ? '已撤销最近一次填写' : '当前页面没有可撤销的内容', ok ? 'ok' : 'warn');
      return;
    }
    if (key === 'miss') { missOpen = !missOpen; openPanel(); return; }
    if (key === 'improve') { close(); go('#/profile'); return; }
    if (key === 'record') { close(); recordJob(); return; }
    if (key === 'pipeline') { close(); go('#/pipeline'); return; }
    if (key === 'switch') { close(); switchResume(); return; }
    if (key === 'resume') { close(); go('#/resumes'); return; }
    if (key === 'flash') { close(); openOnTab('flash'); return; }
    if (key === 'copy') { copyResume(el.getAttribute('data-rid')); return; }
    if (key === 'use') {
      pickedId = el.getAttribute('data-rid');
      UI.toast('本次填写改用《' + (currentResume() || {}).name + '》', 'ok');
      paint();
      return;
    }
    if (key === 'tools') { close(); go('#/copilot'); return; }
    if (key === 'profile') { close(); go('#/profile'); return; }
  }

  /* ---------------- 渲染 ---------------- */
  function matchHtml() {
    if (!RM) return '';
    var rk = ranking();
    var job = currentJob();
    var best = rk.best;
    var jobText = [job.company, job.role].filter(Boolean).join(' · ') || '当前岗位未识别';
    var score = best && best.score != null ? best.score : null;
    var tip = rk.unanswered ? (rk.reason || '没识别到岗位，按默认简历填写')
      : score != null && score < 58 ? '没有特别贴合的版本，建议先补一份针对该岗位的简历'
        : (best && best.reasons && best.reasons[0]) || '';
    return '<div class="opa-match">' +
        '<div class="mt"><span class="i">岗</span><b title="' + esc(jobText) + '">' + esc(jobText) + '</b>' +
          '<button class="sw" data-opa-act="switch">换一份</button></div>' +
        '<div class="mr"><span class="n">' + esc(best ? best.resume.name : '还没有简历版本') + '</span>' +
          (score != null ? '<em class="' + (score < 58 ? 'low' : '') + '">' + score + '%</em>' : '') + '</div>' +
        (tip ? '<div class="tip' + (rk.unanswered || (score != null && score < 58) ? '' : ' soft') + '">' + esc(tip) + '</div>' : '') +
      '</div>';
  }

  function resumeListHtml() {
    var list = Store.state.resumes || [];
    if (!list.length) return '<div class="opa-note">还没有简历版本，先去「简历库」上传或新建。</div>';
    var rk = ranking();
    var bestId = rk.best ? rk.best.resume.id : '';
    var scores = {};
    (rk.list || []).forEach(function (x) { scores[x.resume.id] = x.score; });

    return list.map(function (r) {
      var s = scores[r.id];
      return '<div class="opa-rrow ' + (r.id === bestId ? 'on' : '') + '">' +
          '<button class="opa-rname" data-opa-act="copy" data-rid="' + r.id + '" title="点击复制这份简历的全部内容">' +
            '<i></i><span class="t"><b>' + esc(r.name) + '</b><em>' + esc(r.target || '未设置目标岗位') + '</em></span>' +
            (s != null ? '<em class="s' + (s < 58 ? ' low' : '') + '">' + s + '%</em>' : '') +
            '<span class="cp">⧉</span>' +
          '</button>' +
          '<button class="opa-ruse" data-opa-act="use" data-rid="' + r.id + '" title="这次填写用它">' +
            (r.id === bestId ? '✓' : '') + '</button>' +
        '</div>';
    }).join('');
  }

  function html() {
    var comp = Store.completeness();
    var view = currentView();
    return '<button class="opa-fab" data-opa="open" aria-label="智能助手">' +
        '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12 3.2l1.85 4.45L18.3 9.5l-4.45 1.85L12 15.8l-1.85-4.45L5.7 9.5l4.45-1.85z"/></svg>' +
        '智能助手' +
      '</button>' +
      '<div class="opa-panel" hidden>' +
        '<div class="opa-head">' +
          '<span class="opa-logo">简</span>' +
          '<div class="opa-title"><strong>智能助手</strong>' +
            '<span>' + (mode === 'simple' ? '按岗位匹配简历，点一下就填好' : '显示识别明细与覆盖写入') + '</span></div>' +
          '<div class="opa-modes">' +
            '<button class="opa-mode ' + (mode === 'simple' ? 'on' : '') + '" data-mode="simple">简单</button>' +
            '<button class="opa-mode ' + (mode === 'standard' ? 'on' : '') + '" data-mode="standard">标准</button>' +
          '</div>' +
          '<button class="opa-x" data-opa="close" aria-label="收起">×</button>' +
        '</div>' +
        '<div class="opa-body">' +
          resultHtml() +
          (mode === 'standard'
            ? '<div class="opa-stat"><span>档案完整度</span><div class="bar"><i style="width:' + comp.percent + '%"></i></div><b>' + comp.percent + '%</b></div>'
            : '') +
          matchHtml() +
          '<button class="opa-main" data-opa-act="fill">一键填写<small>按岗位匹配简历，填满所有可识别字段</small></button>' +
          '<button class="opa-main line" data-opa-act="region">选区填写<small>拖拽框选区域，只填这一块</small></button>' +
          '<button class="opa-assist" data-opa-act="assist">' + UI.icon('sparkles', 'sm') +
            '辅助填写<span class="tag">AI</span><em>补上自动填不了的字段</em></button>' +
          '<div class="opa-grid">' +
            '<button class="opa-tile" data-opa-act="record">' + UI.icon('plus', 'sm') + '记录职位</button>' +
            '<button class="opa-tile" data-opa-act="pipeline">' + UI.icon('kanban', 'sm') + '管理投递</button>' +
            '<button class="opa-tile" data-opa-act="profile">' + UI.icon('edit', 'sm') + '编辑简历</button>' +
            '<button class="opa-tile" data-opa-act="switch">' + UI.icon('refresh', 'sm') + '切换简历</button>' +
          '</div>' +
          '<div class="opa-sec"><h5>简历导航<span>点名字复制全文</span></h5>' + resumeListHtml() + '</div>' +
          (mode === 'standard'
            ? '<div class="opa-note">当前页面：' + esc(view === 'apply' ? '网申填写' : view === 'profile' ? '简历填写' : '工作台') +
              '　·　已有 ' + Store.state.resumes.length + ' 个版本' + '</div>' +
              '<button class="opa-mini" data-opa-act="undo">撤销最近一次填写</button>'
            : '') +
        '</div>' +
        '<div class="opa-foot" data-opa-act="tools">' +
          UI.icon('zap', 'sm') + '<span>求职神器</span>' +
          '<span class="arr">' + UI.icon('chevronRight', 'sm') + '</span>' +
        '</div>' +
      '</div>';
  }

  function paint() {
    if (!dock) {
      dock = document.createElement('div');
      dock.className = 'opa-dock';
      dock.id = 'opaDock';
      document.body.appendChild(dock);
      dock.addEventListener('click', onClick);
    }
    var pct = Store.completeness().percent;
    var bar = dock.querySelector('.opa-stat .bar i');
    if (bar) bar.style.width = pct + '%';
    dock.innerHTML = html();
    if (open) {
      var panel = dock.querySelector('.opa-panel');
      var fab = dock.querySelector('.opa-fab');
      if (panel) panel.hidden = false;
      if (fab) fab.hidden = true;
    }
  }

  function onClick(e) {
    var modeBtn = e.target.closest('[data-mode]');
    if (modeBtn) { mode = modeBtn.getAttribute('data-mode'); paint(); return; }

    var opa = e.target.closest('[data-opa]');
    if (opa) {
      if (opa.getAttribute('data-opa') === 'open') openPanel();
      else close();
      return;
    }
    var actBtn = e.target.closest('[data-opa-act]');
    if (actBtn) act(actBtn.getAttribute('data-opa-act'), actBtn);
  }

  function openPanel() {
    open = true;
    paint();
  }
  function close() {
    open = false;
    paint();
  }

  /* 重新渲染时保持当前模式；数据变更只更新进度条 */
  function refresh() {
    if (!dock) { paint(); return; }
    var stat = dock.querySelector('.opa-stat .bar i');
    if (stat) stat.style.width = Store.completeness().percent + '%';
    var num = dock.querySelector('.opa-stat b');
    if (num) num.textContent = Store.completeness().percent + '%';
  }

  function boot() {
    paint();
    Store.subscribe(refresh);
    window.addEventListener('hashchange', function () { if (open) paint(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) close();
    });
  }

  global.AssistantDock = { open: openPanel, close: close, toggle: function () { open ? close() : openPanel(); } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
