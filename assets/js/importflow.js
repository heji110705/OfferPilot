/* =========================================================
   简历 PDF 导入：读取 → 提取文字 → 结构化 → 确认入库
   ========================================================= */
(function (global) {
  'use strict';
  var UI = global.UI, Store = global.Store;
  var MAX_BYTES = 12 * 1024 * 1024;

  function esc(s) { return UI.esc(s); }

  function shell() {
    return '' +
      '<div class="imp-drop" id="impDrop">' +
        '<div class="imp-drop-ic">' + UI.icon('upload') + '</div>' +
        '<strong>把简历 PDF 拖到这里</strong>' +
        '<p>或 <button class="link-btn" data-pick>选择文件</button>　支持文字版 PDF（Word / WPS / LaTeX / 在线简历导出）</p>' +
        '<div class="tiny" style="margin-top:8px">扫描件、纯图片 PDF 无法提取文字，会明确提示</div>' +
      '</div>' +
      '<div class="imp-steps" id="impSteps" hidden></div>' +
      '<div id="impResult"></div>' +
      '<input type="file" id="impFile" accept="application/pdf,.pdf" hidden />';
  }

  function stepList(names) {
    return names.map(function (n, i) {
      return '<div class="imp-step" data-i="' + i + '"><span class="dot"></span><span>' + n + '</span></div>';
    }).join('');
  }

  function setStep(box, i, state) {
    var nodes = box.querySelectorAll('.imp-step');
    for (var k = 0; k < nodes.length; k++) {
      nodes[k].classList.toggle('on', k === i);
      nodes[k].classList.toggle('done', k < i || (k === i && state === 'done'));
    }
  }

  function readBytes(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(new Uint8Array(r.result)); };
      r.onerror = function () { reject(new Error('读取文件失败')); };
      r.readAsArrayBuffer(file);
    });
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function fmtSize(n) {
    if (!n) return '—';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function projectCard(p, i) {
    return '<div class="imp-proj" data-pi="' + i + '">' +
      '<div class="imp-proj-head">' +
        '<label class="imp-check"><input type="checkbox" data-use checked /><span></span></label>' +
        '<div class="imp-meta">' +
          '<input class="imp-in name" data-f="org" value="' + esc(p.org) + '" placeholder="项目名称" title="' + esc(p.org) + '" />' +
          '<input class="imp-in role" data-f="role" value="' + esc(p.role) + '" placeholder="角色" title="' + esc(p.role) + '" />' +
        '</div>' +
        '<div class="imp-dates">' +
          '<input class="imp-in date" data-f="start" value="' + esc(p.start) + '" placeholder="开始" />' +
          '<span class="imp-dash">–</span>' +
          '<input class="imp-in date" data-f="end" value="' + esc(p.end) + '" placeholder="结束" />' +
        '</div>' +
      '</div>' +
      (p.bullets.length
        ? '<ul class="imp-bullets">' + p.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>'
        : '<div class="imp-empty">未识别到职责与成果，建议在档案中手动补充</div>') +
      '<div class="tiny" style="margin-top:6px">' + p.bullets.length + ' 条职责 / 成果 · 原文已保留</div>' +
    '</div>';
  }

  /* 提不到字时把原因说清楚：扫描件 / 字体无映射 / 纯图形，而不是一律「可能是扫描件」 */
  function emptyReason(pdf) {
    if (pdf && pdf.unknownGlyphs > 50) return '字体缺少 Unicode 映射（常见于老版 WPS / 特殊排版），建议换一份用 Word 或 Chrome 重新导出的 PDF';
    return '页面里没有可提取的文字，可能是扫描件或纯图片 PDF';
  }

  function renderResult(box, ctx) {
    var p = ctx.parsed, meta = p.meta, pdf = ctx.pdf;
    var totalBullets = p.projects.reduce(function (n, x) { return n + x.bullets.length; }, 0);
    var majorOk = !!p.education.major;

    var html = '' +
      '<div class="imp-head">' +
        '<div class="imp-file"><span class="file-ic pdf">' + UI.icon('file', 'sm') + '</span>' +
          '<div><strong>' + esc(ctx.file.name) + '</strong>' +
          '<div class="tiny">' + fmtSize(ctx.file.size) + ' · ' + pdf.pageCount + ' 页 · ' +
            pdf.chars + ' 字 · 覆盖率 ' + meta.coverage + '%</div></div>' +
        '</div>' +
        '<button class="btn btn-sm" data-pick>重新选择</button>' +
      '</div>' +

      (pdf.chars < 40
        ? '<div class="alert-bar warn">' + UI.icon('alert') + '<span>这份 PDF 几乎没有可提取的文字：' +
            esc(emptyReason(pdf)) + '。请上传由 Word / WPS / 网页导出的文字版 PDF。</span></div>'
        : '') +

      '<div class="imp-grid">' +
        '<div class="imp-card">' +
          '<div class="imp-card-head">' + UI.icon('user', 'sm') + '<span>基本信息</span></div>' +
          '<div class="imp-kv"><span>姓名</span><b>' + (esc(p.basic.name) || '—') + '</b></div>' +
          '<div class="imp-kv"><span>电话</span><b>' + (esc(p.basic.phone) || '—') + '</b></div>' +
          '<div class="imp-kv"><span>邮箱</span><b>' + (esc(p.basic.email) || '—') + '</b></div>' +
          '<div class="imp-kv"><span>城市</span><b>' + (esc(p.basic.city) || '—') + '</b></div>' +
        '</div>' +
        '<div class="imp-card">' +
          '<div class="imp-card-head">' + UI.icon('book', 'sm') + '<span>教育背景</span>' +
            (majorOk ? '<span class="imp-ok">词典匹配</span>' : '<span class="imp-bad">待确认</span>') + '</div>' +
          '<div class="imp-kv"><span>学校</span><input class="imp-in" data-edu="school" value="' + esc(p.education.school) + '" /></div>' +
          '<div class="imp-kv"><span>学院</span><input class="imp-in" data-edu="college" value="' + esc(p.education.college) + '" /></div>' +
          '<div class="imp-kv"><span>专业</span><input class="imp-in" data-edu="major" value="' + esc(p.education.major) + '" /></div>' +
          '<div class="imp-kv"><span>学历</span><input class="imp-in" data-edu="degree" value="' + esc(p.education.degree) + '" /></div>' +
          '<div class="imp-kv"><span>时间</span><span class="imp-range">' +
            '<input class="imp-in date" data-edu="start" value="' + esc(p.education.start) + '" /> – ' +
            '<input class="imp-in date" data-edu="end" value="' + esc(p.education.end) + '" /></span></div>' +
          '<div class="imp-kv"><span>GPA</span><input class="imp-in" data-edu="gpa" value="' + esc(p.education.gpa) + '" /></div>' +
        '</div>' +
      '</div>' +

      '<div class="imp-sec-title"><span>项目经历</span><span class="tiny">' + p.projects.length + ' 个项目 · ' + totalBullets + ' 条职责</span></div>' +
      (p.projects.length
        ? p.projects.map(projectCard).join('')
        : '<div class="imp-empty" style="padding:16px">未识别到项目经历。若 PDF 里确有项目段落，请把「项目经历」作为小标题后重试，或直接在档案中手动添加。</div>') +

      '<div class="imp-sec-title"><span>技能与证书</span></div>' +
      '<div class="imp-tags">' +
        (p.skills.tech.length ? p.skills.tech.map(function (t) { return '<span class="p-tag">' + esc(t) + '</span>'; }).join('') : '<span class="tiny">未识别</span>') +
        (p.skills.certs.length ? p.skills.certs.map(function (t) { return '<span class="p-tag cert">' + esc(t) + '</span>'; }).join('') : '') +
        (p.skills.langs.length ? p.skills.langs.map(function (t) { return '<span class="p-tag">' + esc(t) + '</span>'; }).join('') : '') +
      '</div>' +

      (meta.warnings.length
        ? '<div class="imp-warn">' + UI.icon('alert') + '<div><strong>需要复核 ' + meta.warnings.length + ' 处</strong><ul>' +
            meta.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div></div>'
        : '<div class="alert-bar ok" style="margin-top:12px">' + UI.icon('checkCircle') + '<span>结构与字段完整，未发现缺漏</span></div>') +

      '<details class="imp-raw"><summary>查看 PDF 提取的原文（' + pdf.chars + ' 字）</summary><pre>' + esc(pdf.text) + '</pre></details>' +
      '<div class="tiny" style="margin-top:10px">应用后会以解析结果替换现有的项目 / 实习经历（' +
        Store.state.profile.experiences.length + ' 条），并生成一个新的简历版本；旧版本仍保留可回退。</div>';

    box.querySelector('#impResult').innerHTML = html;
    var btn = box.querySelector('[data-ok]');
    if (btn) {
      var hasAny = p.projects.length || (p.education && p.education.school) ||
        (p.basic && (p.basic.name || p.basic.phone || p.basic.email));
      btn.disabled = !hasAny;
      btn.textContent = hasAny ? '应用到档案' : '没有可用内容';
    }
  }

  function collect(box, ctx) {
    var parsed = JSON.parse(JSON.stringify(ctx.parsed));
    ['school', 'college', 'major', 'degree', 'start', 'end', 'gpa'].forEach(function (k) {
      var el = box.querySelector('[data-edu="' + k + '"]');
      if (el) parsed.education[k] = el.value.trim();
    });
    var keep = [];
    box.querySelectorAll('[data-pi]').forEach(function (row) {
      var use = row.querySelector('[data-use]');
      if (!use || !use.checked) return;
      var idx = Number(row.getAttribute('data-pi'));
      var p = parsed.projects[idx];
      if (!p) return;
      ['org', 'role', 'start', 'end'].forEach(function (f) {
        var el = row.querySelector('[data-f="' + f + '"]');
        if (el) p[f] = el.value.trim();
      });
      if (!p.org && !p.bullets.length) return;
      keep.push(p);
    });
    parsed.projects = keep;
    return parsed;
  }

  function open(opts) {
    opts = opts || {};
    var ctx = { file: null, pdf: null, parsed: null };
    var close = UI.modal({
      title: '上传简历 PDF · 解析项目经历',
      wide: true,
      body: shell(),
      footer: '<button class="btn" data-close>取消</button>' +
        '<button class="btn btn-primary" data-ok disabled>应用到档案</button>',
      onMount: function (box) {
        var drop = box.querySelector('#impDrop');
        var input = box.querySelector('#impFile');

        function pick() { input.value = ''; input.click(); }

        box.addEventListener('click', function (e) {
          if (e.target.closest('[data-pick]')) { pick(); }
        });

        input.addEventListener('change', function () {
          if (input.files && input.files[0]) handle(input.files[0]);
        });

        ['dragenter', 'dragover'].forEach(function (t) {
          drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); });
        });
        ['dragleave', 'drop'].forEach(function (t) {
          drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); });
        });
        drop.addEventListener('drop', function (e) {
          var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
          if (f) handle(f);
        });

        async function handle(file) {
          if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
            UI.toast('请选择 PDF 文件', 'warn');
            return;
          }
          if (file.size > MAX_BYTES) {
            UI.toast('文件超过 12MB，请压缩后再上传', 'warn');
            return;
          }
          if (!global.PDFText || !global.ResumeParse) {
            UI.toast('解析组件未加载，请刷新页面', 'warn');
            return;
          }

          ctx.file = file;
          drop.hidden = true;
          var steps = box.querySelector('#impSteps');
          steps.hidden = false;
          steps.innerHTML = stepList([
            '读取文件（' + fmtSize(file.size) + '）',
            '提取 PDF 文字',
            '识别章节与专业',
            '结构化项目经历'
          ]);
          setStep(box, 0, 'done');
          box.querySelector('#impResult').innerHTML = '';
          var btn = box.querySelector('[data-ok]');
          btn.disabled = true;
          btn.textContent = '解析中…';

          try {
            var bytes = await readBytes(file);
            setStep(box, 1);
            ctx.pdf = await global.PDFText.extract(bytes);
            setStep(box, 2);
            ctx.parsed = global.ResumeParse.parseText(ctx.pdf.text);
            setStep(box, 3);
            await wait(320);
            setStep(box, 3, 'done');
            steps.hidden = true;
            renderResult(box, ctx);
            if (!ctx.pdf.chars) UI.toast('未提取到文字：' + emptyReason(ctx.pdf), 'warn');
            else UI.toast('识别到 ' + ctx.parsed.projects.length + ' 个项目经历', 'ok');
          } catch (err) {
            steps.hidden = true;
            drop.hidden = false;
            var code = err && err.code;
            var hint = code === 'ENCRYPTED'
              ? '处理办法：用 PDF 阅读器打开 → 另存为不加密的副本；或在 Chrome 里打开后「打印 → 另存为 PDF」再上传。'
              : code === 'NOT_PDF'
                ? '处理办法：确认文件确实是 PDF（有些下载工具会把网页存成 .pdf 后缀）。'
                : '可换一份 PDF 重试，或直接在档案中手动填写。';
            box.querySelector('#impResult').innerHTML =
              '<div class="alert-bar warn">' + UI.icon('alert') +
              '<div><strong>这份文件没法解析</strong><p>' + esc(err && err.message || '未知错误') + '</p>' +
              '<p class="tiny">' + esc(hint) + '</p></div></div>';
            btn.disabled = true;
            btn.textContent = '应用到档案';
            /* 加密 / 非 PDF 属于用户输入问题，不该刷红色错误日志 */
            if (code === 'ENCRYPTED' || code === 'NOT_PDF' || code === 'EMPTY_FILE') console.warn('[OfferPilot] ' + err.message);
            else console.error(err);
          }
        }
      },
      onOk: function (box) {
        var btn = box.querySelector('[data-ok]');
        if (!ctx.parsed || (btn && btn.disabled)) return false;
        var parsed = collect(box, ctx);
        var res = Store.applyParsed(parsed, { fileName: ctx.file && ctx.file.name });
        UI.toast('已写入档案：' + res.summary, 'ok');
        if (global.Views.resumes && global.Views.resumes.select) global.Views.resumes.select(res.resume.id);
        location.hash = '#/resumes';
        global.App.render();
        return true;
      }
    });
    return close;
  }

  global.ImportFlow = { open: open };
})(window);
