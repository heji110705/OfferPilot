/* ================= 简历库 ================= */
(function (global) {
  'use strict';
  var UI = global.UI, Store = global.Store;
  var curId = null;

  function currentResume() {
    var list = Store.state.resumes;
    if (!list.length) return null;
    if (!curId || !list.some(function (x) { return x.id === curId; })) {
      var def = list.filter(function (r) { return r.isDefault; })[0];
      curId = (def || list[0]).id;
    }
    return list.filter(function (x) { return x.id === curId; })[0] || list[0];
  }

  /* 还没有任何版本：引导上传 PDF 解析 */
  function emptyState() {
    return '<div class="page-head">' +
        '<div><h1>简历库</h1><p>上传一份 PDF 简历，自动拆成「教育 / 项目 / 技能」结构化字段，再按岗位生成不同版本。</p></div>' +
      '</div>' +
      '<div class="card card-pad" style="text-align:center;padding:46px 24px">' +
        '<div class="empty-orb">' + UI.icon('file') + '</div>' +
        '<h2 style="font-size:16px;margin:12px 0 6px">从简历 PDF 开始</h2>' +
        '<p style="font-size:13px;color:#64748b;max-width:460px;margin:0 auto 18px;line-height:1.75">' +
          '自动提取姓名、联系方式、学校、专业、项目经历的时间与职责成果，识别结果可逐项复核后再写入档案。</p>' +
        '<div class="hstack" style="justify-content:center">' +
          '<button class="btn btn-primary" data-act="upload">' + UI.icon('upload', 'sm') + '上传简历 PDF</button>' +
          '<button class="btn" data-act="new">' + UI.icon('plus', 'sm') + '手动新建版本</button>' +
        '</div>' +
        '<div class="tiny" style="margin-top:14px">支持文字版 PDF；扫描件无法提取文字</div>' +
      '</div>';
  }

  function experiencesOf(resume) {
    var all = Store.state.profile.experiences;
    var order = resume.order || [];
    var list = order.map(function (id) {
      return all.filter(function (e) { return e.id === id; })[0];
    }).filter(Boolean);
    all.forEach(function (e) { if (list.indexOf(e) < 0) list.push(e); });
    return list;
  }

  function renderPaper(resume) {
    var p = Store.state.profile;
    var edu = p.educations[0] || {};
    var exps = experiencesOf(resume);
    var intern = exps.filter(function (e) { return e.type === 'intern'; });
    var projects = exps.filter(function (e) { return e.type === 'project'; });
    var campus = exps.filter(function (e) { return e.type === 'campus'; });

    function bulletsOf(e) {
      var out = [];
      if (e.duties) out = out.concat(e.duties.split('\n'));
      if (e.results) out = out.concat(e.results.split('\n'));
      if (!out.filter(Boolean).length) out = (e.bullets || []);
      return out.map(function (b) { return String(b).replace(/^[•·\-*]\s*/, '').trim(); }).filter(Boolean);
    }

    function block(e) {
      var period = e.period || [e.start || '', e.end || ''].filter(Boolean).join(' – ');
      var extra = [e.practice, e.teamSize, e.link].filter(Boolean).join('　·　');
      return '<div class="p-item">' +
        '<div class="p-item-head"><b>' + UI.esc(e.org) + '　' + UI.esc(e.role) + '</b>' +
        '<span>' + UI.esc(period) + (e.city ? '　' + UI.esc(e.city) : '') + '</span></div>' +
        (e.desc ? '<div style="color:#475569;margin-top:3px">' + UI.esc(e.desc) + '</div>' : '') +
        '<ul>' + bulletsOf(e).map(function (b) { return '<li>' + UI.esc(b) + '</li>'; }).join('') + '</ul>' +
        (extra ? '<div style="color:#94a3b8;font-size:10.5px;margin-top:3px">' + UI.esc(extra) + '</div>' : '') +
        '</div>';
    }

    function sec(title, inner) {
      if (!inner) return '';
      return '<div class="p-sec"><div class="p-sec-title"><span>' + title + '</span>' +
        '<span style="font-weight:400;color:#93a3b8;font-size:10px;letter-spacing:0">' + (title === '教育背景' ? '' : '按岗位相关度排序') + '</span></div>' + inner + '</div>';
    }

    return '<div class="paper" id="paperNode">' +
      '<h1>' + UI.esc(p.basic.name || '你的姓名') + '<small>' + UI.esc(resume.target || p.basic.targetRole || '') + '</small></h1>' +
      '<div class="p-contact">' +
        [p.basic.phone, p.basic.email, p.basic.targetCity, p.basic.gradDate ? p.basic.gradDate.replace('-', '.') + ' 毕业' : '',
          edu.degree].filter(Boolean).map(function (x) { return '<span>' + UI.esc(x) + '</span>'; }).join('') +
      '</div>' +

      sec('自我评价', '<p style="margin-top:8px;color:#334155">' + UI.esc(resume.summary) + '</p>') +

      sec('教育背景', '<div class="p-item"><div class="p-item-head"><b>' + UI.esc(edu.school || '') + '　' + UI.esc(edu.college || '') + '</b>' +
        '<span>' + UI.esc(edu.period || ([edu.start, edu.end].filter(Boolean).join(' – '))) + '</span></div>' +
        '<div style="color:#475569;margin-top:2px">' + [edu.major, edu.degree].filter(Boolean).map(UI.esc).join(' · ') +
        (edu.gpa ? '　GPA ' + UI.esc(edu.gpa) + (edu.gpaFull ? '/' + UI.esc(edu.gpaFull) : '') : '') +
        (edu.rank ? '　排名 ' + UI.esc(edu.rank) + (edu.rankTotal ? '/' + UI.esc(edu.rankTotal) : '') : '') + '</div>' +
        (edu.courses ? '<div style="color:#64748b;font-size:11.5px;margin-top:2px">核心课程：' + UI.esc(edu.courses) + '</div>' : '') +
        '</div>') +

      sec('实习经历', intern.map(block).join('')) +
      sec('项目经历', projects.map(block).join('')) +
      sec('校园经历', campus.map(block).join('')) +

      sec('专业技能', '<div class="p-tags">' + (p.skills.tech || []).map(function (t) {
        return '<span class="p-tag">' + UI.esc(t) + '</span>';
      }).join('') + '</div>' +
        '<div style="margin-top:6px;color:#475569;font-size:11.5px">' +
          (p.skills.langs || []).join('　·　') + (p.skills.certs.length ? '<br/>' + p.skills.certs.join('　·　') : '') +
        '</div>') +
    '</div>';
  }

  function render() {
    var r = currentResume();
    if (!r) return emptyState();
    var list = Store.state.resumes;
    var jd = global.AI.ctx.jd;
    var m = global.AI.match(Store.state.profile, jd);

    return '<div class="page-head">' +
        '<div><h1>简历库</h1><p>同一份档案，生成多个岗位版本。投递时按岗位选择最合适的版本，避免一份简历投所有公司。</p></div>' +
        '<div class="actions">' +
          '<button class="btn" data-act="upload">' + UI.icon('upload', 'sm') + '上传简历 PDF</button>' +
          '<button class="btn" data-act="new">' + UI.icon('plus', 'sm') + '新建版本</button>' +
          '<button class="btn btn-ai" data-act="tailor">' + UI.icon('sparkles', 'sm') + 'AI 定制简历</button>' +
        '</div>' +
      '</div>' +

      '<div class="resume-layout">' +
        '<div class="resume-aside">' +
          '<div class="card" style="padding:12px">' +
            '<div class="hstack" style="margin-bottom:10px"><strong style="font-size:12.5px">共 ' + list.length + ' 个版本</strong>' +
            '<span class="tiny" style="margin-left:auto">按更新时间</span></div>' +
            list.slice().sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); }).map(function (x) {
              return '<div class="resume-item ' + (x.id === r.id ? 'on' : '') + '" data-rid="' + x.id + '">' +
                '<h4>' + (x.isDefault ? '<span class="dot-default"></span>' : '') + UI.esc(x.name) + '</h4>' +
                '<p>' + UI.esc(x.target) + '</p>' +
                '<p style="display:flex;justify-content:space-between;margin-top:6px">' +
                  '<span>' + UI.fmtShort(x.updatedAt) + ' 更新</span>' +
                  (x.isDefault ? '<span style="color:#0e9f6e">默认</span>' : '') +
                '</p>' +
              '</div>';
            }).join('') +
          '</div>' +
          '<div class="card" style="padding:13px;margin-top:12px">' +
            '<div class="tiny" style="margin-bottom:8px">当前目标岗位</div>' +
            '<strong style="font-size:12.5px;display:block">' + UI.esc(jd.company) + ' · ' + UI.esc(jd.role) + '</strong>' +
            '<div class="meter" style="margin-top:9px"><i style="width:' + m.score + '%"></i></div>' +
            '<div class="hstack" style="margin-top:6px"><span class="tiny">匹配度</span>' +
            '<strong style="margin-left:auto;font-size:13px;color:#2563eb">' + m.score + ' 分</strong></div>' +
          '</div>' +
        '</div>' +

        '<div>' +
          '<div class="card" style="margin-bottom:12px">' +
            '<div class="card-head">' +
              '<h3>' + UI.esc(r.name) + '</h3>' +
              '<span class="badge badge-brand">' + UI.esc(r.target) + '</span>' +
              '<span class="sub">' + UI.relTime(r.updatedAt) + '更新</span>' +
            '</div>' +
            '<div style="padding:12px 20px;display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid #f0f3f9">' +
              '<button class="btn btn-sm" data-act="default">' + UI.icon('star', 'sm') + (r.isDefault ? '已设为默认' : '设为默认') + '</button>' +
              '<button class="btn btn-sm" data-act="export">' + UI.icon('download', 'sm') + '导出 Markdown</button>' +
              '<button class="btn btn-sm" data-act="print">' + UI.icon('file', 'sm') + '打印 / PDF</button>' +
              '<span class="spacer"></span>' +
              (r.isDefault ? '' : '<button class="btn btn-sm btn-danger" data-act="del">' + UI.icon('trash', 'sm') + '删除</button>') +
            '</div>' +
          '</div>' +
          '<div class="paper-wrap">' + renderPaper(r) + '</div>' +
        '</div>' +
      '</div>';
  }

  function buildMarkdown(resume) {
    var p = Store.state.profile;
    var edu = p.educations[0] || {};
    var lines = [];
    lines.push('# ' + (p.basic.name || '你的姓名'));
    lines.push('');
    lines.push('> ' + [resume.target || p.basic.targetRole, p.basic.phone, p.basic.email, p.basic.targetCity]
      .filter(Boolean).join('　|　'));
    lines.push('');
    lines.push('## 自我评价');
    lines.push(resume.summary);
    lines.push('');
    lines.push('## 教育背景');
    lines.push('- **' + (edu.school || '') + '**　' + (edu.college || '') + '　' + (edu.period || ''));
    lines.push('  ' + [edu.major, edu.degree].filter(Boolean).join(' · ') +
      (edu.gpa ? '　GPA ' + edu.gpa : '') + (edu.rank ? '　排名 ' + edu.rank : ''));
    lines.push('');
    var groups = { intern: '实习经历', project: '项目经历', campus: '校园经历' };
    ['intern', 'project', 'campus'].forEach(function (t) {
      var arr = experiencesOf(resume).filter(function (e) { return e.type === t; });
      if (!arr.length) return;
      lines.push('## ' + groups[t]);
      arr.forEach(function (e) {
        lines.push('### ' + [e.org, e.role, e.period || [e.start, e.end].filter(Boolean).join('–')].filter(Boolean).join('　'));
        if (e.desc) lines.push(e.desc);
        var items = [];
        if (e.duties) items = items.concat(e.duties.split('\n'));
        if (e.results) items = items.concat(e.results.split('\n'));
        if (!items.filter(Boolean).length) items = e.bullets || [];
        items.map(function (b) { return String(b).replace(/^[•·\-*]\s*/, '').trim(); })
          .filter(Boolean).forEach(function (b) { lines.push('- ' + b); });
        lines.push('');
      });
    });
    lines.push('## 专业技能');
    lines.push(p.skills.tech.join(' / '));
    lines.push('');
    lines.push((p.skills.langs || []).join(' · '));
    if (p.skills.certs.length) lines.push(p.skills.certs.join(' · '));
    return lines.join('\n');
  }

  function download(name, text) {
    var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function tailorFlow() {
    UI.modal({
      title: 'AI 定制简历',
      wide: true,
      body:
        '<p class="mini-note" style="margin-bottom:10px">粘贴目标岗位 JD 或链接正文，AI 会解析关键词、重排经历、重写概述，生成一个独立版本。</p>' +
        '<textarea class="textarea" id="jdText" style="min-height:170px">' + UI.esc(global.AI.ctx.jd.raw || global.AI.seedJD) + '</textarea>' +
        '<div style="margin-top:10px" class="tiny">生成后会保存为新版本，原简历不受影响。</div>',
      footer: '<button class="btn" data-close>取消</button><button class="btn btn-ai" data-ok>开始生成</button>',
      onOk: function (box) {
        var text = box.querySelector('#jdText').value;
        if (!text.trim()) { UI.toast('请先粘贴 JD', 'warn'); return false; }
        var jd = global.AI.parseJD(text);
        global.AI.setJD(jd);

        var steps = ['解析 JD 关键词…', '匹配档案经历…', '重排经历顺序…', '重写自我评价…', '生成新版本…'];
        var step = 0;
        var tip = document.createElement('div');
        tip.className = 'alert-bar';
        tip.style.marginTop = '12px';
        tip.innerHTML = UI.icon('sparkles') + '<span id="tailorTip">' + steps[0] + '</span>';
        box.querySelector('.modal-body').appendChild(tip);
        var okBtn = box.querySelector('[data-ok]');
        okBtn.disabled = true;

        var timer = setInterval(function () {
          step++;
          if (step < steps.length) {
            var t = box.querySelector('#tailorTip');
            if (t) t.textContent = steps[step];
          } else {
            clearInterval(timer);
            var res = global.AI.tailor(currentResume(), Store.state.profile, jd);
            var nr = Store.addResume({
              name: '简历 · ' + (jd.company === '目标企业' ? (jd.role || '岗位定制') : jd.company),
              target: jd.role,
              tags: res.tags,
              summary: res.summary,
              order: res.order
            });
            curId = nr.id;
            box.querySelector('.modal-body').innerHTML =
              '<div class="alert-bar ok">' + UI.icon('checkCircle') +
              '<span>生成完成，匹配度预估 <b>' + res.scoreBefore + ' → ' + res.scoreAfter + '</b></span></div>' +
              '<div style="margin-top:12px">' + res.changes.map(function (c, i) {
                return '<div class="todo" style="padding:8px 4px"><span class="todo-ic ok">' + UI.icon('check', 'sm') + '</span>' +
                  '<span class="todo-body"><span class="todo-title">' + UI.esc(c) + '</span></span></div>';
              }).join('') + '</div>';
            var cancelBtn = box.querySelector('.modal-foot .btn');
            if (cancelBtn) cancelBtn.textContent = '关闭';
            okBtn.disabled = false;
            okBtn.textContent = '查看新版本';
            okBtn.setAttribute('data-close', '');
            okBtn.removeAttribute('data-ok');
            okBtn.onclick = function () {
              global.App.render();
              UI.toast('已生成「' + nr.name + '」', 'ok');
              UI.maskClose();
            };
            global.App.render();
          }
        }, 420);
        return false;
      }
    });
  }

  function mount(root) {
    root.addEventListener('click', function (e) {
      var item = e.target.closest('[data-rid]');
      if (item) { curId = item.getAttribute('data-rid'); global.App.render(); return; }

      var act = e.target.closest('[data-act]');
      if (!act) return;
      var a = act.getAttribute('data-act');
      var r = currentResume();

      if (a === 'upload') {
        if (!global.ImportFlow) { UI.toast('导入组件未加载，请刷新页面', 'warn'); return; }
        global.ImportFlow.open();
        return;
      }
      if (a === 'tailor') tailorFlow();
      if (!r) return;
      if (a === 'default') { Store.setDefaultResume(r.id); global.App.render(); UI.toast('已设为默认简历', 'ok'); }
      if (a === 'export') download(r.name.replace(/\s/g, '') + '.md', buildMarkdown(r));
      if (a === 'print') window.print();
      if (a === 'del') {
        UI.confirm('删除该简历版本？', '仅删除这个版本，档案与经历数据不受影响。', function () {
          Store.removeResume(r.id);
          curId = null;
          global.App.render();
          UI.toast('已删除', 'ok');
        }, '删除');
      }
      if (a === 'new') {
        UI.modal({
          title: '新建简历版本',
          body: '<div class="field"><label>版本名称</label><input class="input" id="rName" placeholder="如 简历 · 数据分析（快消）" /></div>' +
            '<div class="field" style="margin-top:12px"><label>目标岗位</label><input class="input" id="rTarget" placeholder="如 数据分析师 / 商业分析" /></div>',
          onOk: function (box) {
            var name = box.querySelector('#rName').value.trim();
            if (!name) { UI.toast('请填写版本名称', 'warn'); return false; }
            var nr = Store.addResume({
              name: name,
              target: box.querySelector('#rTarget').value.trim() || Store.state.profile.basic.targetRole,
              tags: [], summary: Store.state.profile.basic.selfEval.slice(0, 120),
              order: Store.state.profile.experiences.map(function (x) { return x.id; })
            });
            curId = nr.id;
            global.App.render();
            UI.toast('已创建新版本', 'ok');
          }
        });
      }
    });
  }

  global.Views = global.Views || {};
  global.Views.resumes = {
    title: '简历库', render: render, mount: mount,
    select: function (id) { curId = id; }
  };
})(window);
