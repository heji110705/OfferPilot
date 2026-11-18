/* =========================================================
   我的档案 / 简历填写
   版式参照 cv.playoffer.cn/resumes：
   左侧栏目进度 + 右侧字段编辑 + 「未补齐字段」清单
   —— 所有字段选填，不填也能正常使用 ——
   ========================================================= */
(function (global) {
  'use strict';
  var UI = global.UI, Store = global.Store, RF = global.ResumeFields;

  var cur = 'basic';
  var openIds = {};
  var firstPainted = false;
  var lastHashSec = null;

  /* 支持 #/profile?sec=project 直达某个栏目（也方便 AI 助手跳转） */
  function applyHash() {
    var m = (location.hash.split('?')[1] || '').match(/sec=([a-z]+)/);
    if (!m || lastHashSec === m[1]) return;
    lastHashSec = m[1];
    if (RF.BY_KEY[m[1]]) cur = m[1];
  }

  /* ---------------- 字段渲染 ---------------- */
  function isBlank(v) { return RF.blank(v); }

  function hintOf(f) {
    return f.hint ? '<span class="rf-hint">' + UI.esc(f.hint) + '</span>' : '';
  }

  function todoTag(empty) {
    return empty ? '<span class="rf-todo">待填写</span>' : '';
  }

  function control(secKey, itemId, f, value, empty) {
    var attrs = 'data-sec="' + secKey + '"' +
      (itemId ? ' data-id="' + itemId + '"' : '') +
      ' data-key="' + f.key + '"' +
      ' data-type="' + f.type + '"';

    if (f.type === 'period' || f.auto) {
      return '<input class="input rf-input rf-readonly" disabled ' + attrs +
        ' value="' + UI.esc(value || '') + '" placeholder="开始时间 - 结束时间" />';
    }
    if (f.type === 'select') {
      var opts = (f.options || []).map(function (o) {
        return '<option value="' + UI.esc(o) + '"' + (o === value ? ' selected' : '') + '>' + UI.esc(o) + '</option>';
      }).join('');
      return '<select class="select rf-input ' + (empty ? 'rf-empty' : '') + '" ' + attrs + '>' +
        '<option value="">' + UI.esc(f.empty || '请选择') + '</option>' + opts + '</select>';
    }
    if (f.type === 'textarea') {
      return '<textarea class="textarea rf-input ' + (empty ? 'rf-empty' : '') + '" ' + attrs +
        ' style="min-height:76px" placeholder="' + UI.esc(f.ph || '选填') + '">' + UI.esc(value || '') + '</textarea>';
    }
    var t = f.type === 'date' ? 'date' : f.type === 'month' ? 'month' : 'text';
    return '<input class="input rf-input ' + (empty ? 'rf-empty' : '') + '" type="' + t + '" ' + attrs +
      ' value="' + UI.esc(value || '') + '" placeholder="' + UI.esc(f.ph || '选填') + '" />';
  }

  function fieldHTML(secKey, itemId, f, value) {
    var empty = f.type !== 'period' && !f.auto && isBlank(value);
    return '<div class="rf-field ' + (f.span ? 'span-2' : '') + '">' +
      '<div class="rf-label">' + UI.esc(f.label) + todoTag(empty) + '</div>' +
      control(secKey, itemId, f, value, empty) +
      hintOf(f) +
      '</div>';
  }

  function gridFields(secKey, itemId, fields, getter) {
    return '<div class="rf-grid">' + fields.map(function (f) {
      return fieldHTML(secKey, itemId, f, getter(f));
    }).join('') + '</div>';
  }

  /* ---------------- 普通栏目（个人信息 / 求职意向 / 技能专长） ---------------- */
  function paneFields(sec) {
    var p = Store.state.profile;
    var stat = RF.sectionStat(p, sec.key);
    return '<div class="card rf-card">' +
      '<div class="rf-card-head">' +
        '<div><h3>' + UI.esc(sec.name) + '</h3><p>' + UI.esc(sec.desc || '') + '</p></div>' +
        '<div class="rf-count"><b>' + stat.filled + '</b>/' + stat.total +
          '<span>' + (stat.missing.length ? '未补齐 ' + stat.missing.length + ' 项' : '已填完') + '</span></div>' +
      '</div>' +
      gridFields(sec.key, '', sec.fields, function (f) {
        return RF.valueOfSection(p, sec, f);
      }) +
      '<div class="rf-foot">' + UI.icon('info', 'sm') +
        '<span>本页所有字段均为选填，按需填写即可；未填写的字段不会影响网申填写与简历生成。</span></div>' +
      '</div>';
  }

  /* ---------------- 重复栏目（经历 / 证书 / 奖项 …） ---------------- */
  function paneRepeat(sec) {
    var p = Store.state.profile;
    var list = RF.items(p, sec.key);
    var stat = RF.sectionStat(p, sec.key);

    if (!list.length) {
      return '<div class="rf-empty-state card">' +
        '<div class="empty-orb">' + UI.icon(sec.icon) + '</div>' +
        '<h3>尚未新增' + UI.esc(sec.empty || sec.name) + '</h3>' +
        '<p>' + UI.esc(sec.name) + '属于选填内容，有就写、没有可以直接跳过。新增后可逐项补充，随时保存。</p>' +
        '<div class="hstack" style="justify-content:center;gap:8px">' +
          '<button class="btn btn-primary" data-add-sec="' + sec.key + '">' + UI.icon('plus', 'sm') + '新增' + UI.esc(sec.itemName || sec.name) + '</button>' +
          '<button class="btn" data-jump="' + (sec.key === 'project' ? 'basic' : 'project') + '">先填其它栏目</button>' +
        '</div>' +
      '</div>';
    }

    var cards = list.map(function (item, idx) {
      var miss = RF.itemMissing(p, sec.key, item);
      var open = openIds[item.id] === undefined ? idx === 0 : openIds[item.id];
      var title = RF.itemTitle(sec.key, item);

      return '<div class="rf-item ' + (open ? 'on' : '') + '" data-item-card="' + item.id + '">' +
        '<div class="rf-item-head" data-toggle="' + item.id + '">' +
          '<span class="rf-caret">' + UI.icon('chevronDown', 'sm') + '</span>' +
          '<div class="rf-item-title">' +
            '<strong>' + UI.esc(title) + '</strong>' +
            '<div class="rf-item-meta">第 ' + (idx + 1) + ' 条 ' + UI.esc(sec.itemName || sec.name) + '</div>' +
            (miss.missing.length
              ? '<span class="rf-miss-tag">未补齐 ' + miss.missing.length + ' 项</span>'
              : '<span class="rf-done-tag">' + UI.icon('check', 'sm') + '已填完</span>') +
          '</div>' +
          '<div class="rf-item-ops">' +
            '<button class="rf-op" data-move="up" data-sec="' + sec.key + '" data-id="' + item.id + '" ' + (idx === 0 ? 'disabled' : '') + '>' +
              UI.icon('arrowRight', 'sm') + '上移</button>' +
            '<button class="rf-op danger" data-del-item="' + item.id + '" data-sec="' + sec.key + '" title="删除">' + UI.icon('trash', 'sm') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="rf-item-body"' + (open ? '' : ' hidden') + '>' +
          gridFields(sec.key, item.id, sec.fields, function (f) {
            return RF.valueOfItem(item, f);
          }) +
          '<div class="rf-item-foot">' +
            '<button class="rf-op" data-move="down" data-sec="' + sec.key + '" data-id="' + item.id + '" ' + (idx === list.length - 1 ? 'disabled' : '') + '>下移一条</button>' +
            (sec.key === 'project'
              ? '<button class="rf-op" data-act="ai-project" data-id="' + item.id + '">' + UI.icon('sparkles', 'sm') + 'AI 润色职责与成果</button>'
              : '') +
            '<span class="rf-saved" data-saved="' + item.id + '">已自动保存</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="rf-repeat">' +
      '<div class="rf-repeat-head">' +
        '<div><h3>' + UI.esc(sec.name) + '</h3>' +
          '<p>共 ' + list.length + ' 条，已填 ' + stat.filled + '/' + stat.total + ' 项' +
          (stat.missing.length ? '，还有 ' + stat.missing.length + ' 项待补充' : '') + '</p></div>' +
        '<button class="btn btn-sm btn-primary" data-add-sec="' + sec.key + '">' + UI.icon('plus', 'sm') + '新增' + UI.esc(sec.itemName || sec.name) + '</button>' +
      '</div>' +
      cards +
      '<button class="rf-add-more" data-add-sec="' + sec.key + '">' + UI.icon('plus', 'sm') + '新增一条' + UI.esc(sec.itemName || sec.name) + '</button>' +
      '</div>';
  }

  /* ---------------- 附件材料 ---------------- */
  function paneFiles() {
    var files = Store.state.files;
    var kindName = { resume: '简历', transcript: '成绩单', cert: '证书' };
    return '<div class="card rf-card">' +
      '<div class="rf-card-head">' +
        '<div><h3>附件材料</h3><p>简历、成绩单、证书扫描件；网申时可一键引用</p></div>' +
        '<div class="rf-count"><b>' + files.length + '</b><span>个文件</span></div>' +
      '</div>' +
      '<div class="upload-zone" id="uploadZone">' + UI.icon('upload') +
        '<strong>点击或拖拽上传材料</strong>' +
        '<span>支持 PDF / JPG / PNG，单个文件不超过 10MB；按文件名自动归类</span>' +
      '</div>' +
      '<div style="margin-top:12px">' +
        (files.length ? files.map(function (f) {
          var ext = (f.name.split('.').pop() || '').toLowerCase();
          var cls = ext === 'pdf' ? 'pdf' : /png|jpg|jpeg/.test(ext) ? 'img' : '';
          return '<div class="file-row">' +
            '<span class="file-ic ' + cls + '">' + UI.icon(ext === 'pdf' ? 'file' : 'upload', 'sm') + '</span>' +
            '<span class="file-main"><strong>' + UI.esc(f.name) + '</strong>' +
            '<span>' + (kindName[f.kind] || '其他') + ' · ' + UI.fileSize(f.size) + ' · ' + UI.relTime(f.uploadedAt) + '</span></span>' +
            (f.kind === 'resume' ? '<span class="badge badge-ok">网申默认</span>' : '') +
            '<button class="icon-btn" data-delfile="' + f.id + '">' + UI.icon('trash', 'sm') + '</button>' +
          '</div>';
        }).join('') : '<div class="empty">' + UI.icon('upload') + '<strong>暂无材料</strong><span>上传后可在网申表单中一键引用</span></div>') +
      '</div>' +
      '<div class="rf-foot">' + UI.icon('info', 'sm') + '<span>附件同样是选填项，不上传也能生成简历与填写网申。</span></div>' +
      '</div>';
  }

  /* ---------------- 侧边栏目 ---------------- */
  function railHTML() {
    var p = Store.state.profile;
    var all = RF.overall(p);
    var rows = RF.SECTIONS.map(function (s) {
      var st = all.sections.filter(function (x) { return x.key === s.key; })[0];
      var pending = s.kind === 'repeat' ? !st.items : st.total > st.filled;
      var pct = st.total ? Math.round(st.filled / st.total * 100) : 0;
      var countText = s.kind === 'repeat' && !st.items ? '0/0' : st.filled + '/' + st.total;
      var footText = s.kind === 'repeat' && !st.items
        ? '尚未新增内容'
        : (st.missing.length ? '未补齐 ' + st.missing.length + ' 项' : '已填完');
      return '<button class="rf-nav ' + (s.key === cur ? 'on' : '') + '" data-jump="' + s.key + '" data-nav="' + s.key + '">' +
        '<span class="rf-nav-top"><b>' + UI.esc(s.name) + '</b>' +
          '<em data-nav-count="' + s.key + '">' + countText + '</em>' +
          (pending ? '<i class="rf-dot"></i>' : '') + '</span>' +
        '<span class="rf-nav-bar"><i data-nav-bar="' + s.key + '" style="width:' + pct + '%"></i></span>' +
        '<span class="rf-nav-foot" data-nav-foot="' + s.key + '">' + footText + '</span>' +
        '</button>';
    }).join('');

    return '<aside class="rf-rail">' + rows +
      '<button class="rf-nav ' + (cur === 'file' ? 'on' : '') + '" data-jump="file">' +
        '<span class="rf-nav-top"><b>附件材料</b><em>' + Store.state.files.length + ' 个</em></span>' +
        '<span class="rf-nav-bar"><i style="width:' + (Store.state.files.length ? 100 : 0) + '%"></i></span>' +
        '<span class="rf-nav-foot">' + (Store.state.files.length ? '已上传' : '尚未上传') + '</span>' +
      '</button>' +
      '</aside>';
  }

  /* ---------------- 页面 ---------------- */
  function render() {
    applyHash();
    var p = Store.state.profile;
    var all = RF.overall(p);
    var pendingCount = all.total - all.filled;
    var sec = RF.section(cur);
    var body = cur === 'file' ? paneFiles()
      : sec.kind === 'repeat' ? paneRepeat(sec) : paneFields(sec);

    return '<div class="page-head">' +
        '<div><h1>简历填写</h1><p>这里是你所有网申信息的唯一来源。字段全部选填，填多少用多少，之后所有企业的表单都能一键引用。</p></div>' +
        '<div class="actions">' +
          '<button class="btn" data-act="missing">' + UI.icon('alert', 'sm') + '未补齐字段' + (pendingCount ? '（' + pendingCount + '）' : '') + '</button>' +
          '<button class="btn btn-primary" data-act="upload-pdf">' + UI.icon('upload', 'sm') + '上传简历 PDF</button>' +
          '<button class="btn" data-act="import">' + UI.icon('download', 'sm') + '粘贴文本导入</button>' +
        '</div>' +
      '</div>' +

      '<div class="rf-banner">' +
        '<span class="rf-banner-ic">' + UI.icon('checkCircle') + '</span>' +
        '<div><strong>所有信息都非必填，由你决定</strong>' +
          '<p>敏感信息可以按实际需要再填写；未填写的字段不会阻塞任何流程。</p></div>' +
        '<button class="link-btn" data-act="why">查看说明</button>' +
      '</div>' +

      '<div class="rf-layout">' +
        railHTML() +
        '<div class="rf-main" id="rfMain">' + body + '</div>' +
      '</div>';
  }

  /* ---------------- 局部刷新 ---------------- */
  function refreshStats() {
    var p = Store.state.profile;
    var all = RF.overall(p);
    all.sections.forEach(function (st) {
      var sec = RF.section(st.key);
      var countEl = document.querySelector('[data-nav-count="' + st.key + '"]');
      var barEl = document.querySelector('[data-nav-bar="' + st.key + '"]');
      var footEl = document.querySelector('[data-nav-foot="' + st.key + '"]');
      var navEl = document.querySelector('[data-nav="' + st.key + '"]');
      var empty = sec.kind === 'repeat' && !st.items;
      var pct = st.total ? Math.round(st.filled / st.total * 100) : 0;
      if (countEl) countEl.textContent = empty ? '0/0' : st.filled + '/' + st.total;
      if (barEl) barEl.style.width = pct + '%';
      if (footEl) footEl.textContent = empty ? '尚未新增内容' : (st.missing.length ? '未补齐 ' + st.missing.length + ' 项' : '已填完');
      if (navEl) {
        var dot = navEl.querySelector('.rf-dot');
        var pending = sec.kind === 'repeat' ? !st.items : st.total > st.filled;
        if (pending && !dot) {
          var i = document.createElement('i');
          i.className = 'rf-dot';
          navEl.querySelector('.rf-nav-top').appendChild(i);
        } else if (!pending && dot) dot.remove();
      }
    });

    var pending = all.total - all.filled;
    var btn = document.querySelector('[data-act="missing"]');
    if (btn) {
      btn.innerHTML = UI.icon('alert', 'sm') + '未补齐字段' + (pending ? '（' + pending + '）' : '');
    }

    /* 当前栏目的计数头 */
    var headCount = document.querySelector('.rf-card .rf-count');
    if (headCount && cur !== 'file' && RF.section(cur).kind === 'fields') {
      var st = RF.sectionStat(p, cur);
      headCount.innerHTML = '<b>' + st.filled + '</b>/' + st.total +
        '<span>' + (st.missing.length ? '未补齐 ' + st.missing.length + ' 项' : '已填完') + '</span>';
    }
    var repHead = document.querySelector('.rf-repeat-head p');
    if (repHead && RF.section(cur).kind === 'repeat') {
      var rs = RF.sectionStat(p, cur);
      repHead.textContent = '共 ' + rs.items + ' 条，已填 ' + rs.filled + '/' + rs.total + ' 项' +
        (rs.missing.length ? '，还有 ' + rs.missing.length + ' 项待补充' : '');
    }

    var side = document.getElementById('sideMeter');
    if (side) side.style.width = Store.completeness().percent + '%';
    var sc = document.getElementById('sideComplete');
    if (sc) sc.textContent = Store.completeness().percent + '%';
  }

  /* 单字段填/空时，就地切换「待填写」与黄色边框，避免整页重绘打断输入 */
  function markField(el, filled) {
    var wrap = el.closest('.rf-field');
    if (!wrap) return;
    var label = wrap.querySelector('.rf-label');
    var tag = label && label.querySelector('.rf-todo');
    if (filled && tag) tag.remove();
    if (!filled && label && !tag) {
      var s = document.createElement('span');
      s.className = 'rf-todo';
      s.textContent = '待填写';
      label.appendChild(s);
    }
    if (el.classList) el.classList.toggle('rf-empty', !filled);
  }

  function markItemHead(itemId) {
    var card = document.querySelector('[data-item-card="' + itemId + '"]');
    if (!card) return;
    var secKey = card.querySelector('[data-sec]') ? card.querySelector('[data-sec]').getAttribute('data-sec') : cur;
    var item = Store.findItem(secKey, itemId);
    if (!item) return;
    var miss = RF.itemMissing(Store.state.profile, secKey, item);
    var tag = card.querySelector('.rf-miss-tag, .rf-done-tag');
    if (!tag) return;
    if (miss.missing.length) {
      tag.className = 'rf-miss-tag';
      tag.textContent = '未补齐 ' + miss.missing.length + ' 项';
    } else {
      tag.className = 'rf-done-tag';
      tag.innerHTML = UI.icon('check', 'sm') + '已填完';
    }
    var saved = card.querySelector('[data-saved]');
    if (saved) {
      saved.textContent = '已保存 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
  }

  /* ---------------- 交互 ---------------- */
  function rerender() {
    var host = document.getElementById('view');
    host.innerHTML = render();
    mount(host);
    refreshStats();
  }

  function saveField(el) {
    var secKey = el.getAttribute('data-sec');
    var itemId = el.getAttribute('data-id');
    var key = el.getAttribute('data-key');
    var type = el.getAttribute('data-type');
    var value = el.value;

    if (type === 'period') return;
    if (!secKey || !key) return;

    if (itemId) {
      Store.setItem(secKey, itemId, key, value);
      if (key === 'start' || key === 'end') {
        var item = Store.findItem(secKey, itemId);
        var periodEl = document.querySelector('[data-sec="' + secKey + '"][data-id="' + itemId + '"][data-key="period"]');
        if (periodEl) periodEl.value = RF.periodOf(item);
      }
      markItemHead(itemId);
    } else {
      Store.setSectionField(secKey, key, value);
    }
    if (type !== 'period') markField(el, !isBlank(value));
    refreshStats();
  }

  function addItem(secKey) {
    var sec = RF.section(secKey);
    var item = Store.addItem(secKey);
    openIds[item.id] = true;
    cur = secKey;
    rerender();
    var card = document.querySelector('[data-item-card="' + item.id + '"]');
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var input = card.querySelector('.rf-input');
      if (input) input.focus();
    }
  }

  function jump(secKey) {
    cur = secKey;
    rerender();
    var main = document.getElementById('rfMain');
    if (main) window.scrollTo({ top: main.offsetTop - 80, behavior: 'smooth' });
  }

  /* 未补齐字段清单（参照参考页的「未补齐字段」抽屉） */
  function missingModal() {
    var p = Store.state.profile;
    var all = RF.overall(p);
    var groups = all.sections.map(function (st) {
      var sec = RF.section(st.key);
      var rows = [];
      if (sec.kind === 'repeat' && !st.items) {
        rows.push('<button class="mf-row" data-goto="' + sec.key + '"><span>' + UI.esc(sec.itemName || sec.name) + '</span><em>去新增</em></button>');
      } else if (sec.kind === 'repeat') {
        if (st.missing.length) {
          rows.push('<button class="mf-row" data-goto="' + sec.key + '"><span>' + UI.esc(sec.name) + ' · ' + st.missing.length + ' 项待补充</span><em>去填写</em></button>');
        }
      } else {
        st.missing.forEach(function (label) {
          rows.push('<button class="mf-row" data-goto="' + sec.key + '" data-label="' + UI.esc(label) + '"><span>' + UI.esc(label) + '</span><em>去填写</em></button>');
        });
      }
      if (!rows.length) return '';
      return '<div class="mf-group"><div class="mf-head">' + UI.esc(sec.name) +
        '<span>' + (sec.kind === 'repeat' && !st.items ? '尚未新增内容' : '未补齐 ' + (st.total - st.filled) + ' 项') + '</span></div>' +
        rows.join('') + '</div>';
    }).join('');

    var filled = all.filled, total = all.total;
    UI.modal({
      title: '未补齐字段',
      wide: true,
      body: '<p class="mini-note" style="margin-bottom:12px">当前已填写 ' + filled + ' / ' + total +
        ' 个字段，点击任一项可直接定位填写。全部为选填，不想填的可以留着。</p>' +
        '<div class="mf-list">' + (groups || '<div class="empty">' + UI.icon('checkCircle') + '<strong>所有字段都已填写</strong></div>') + '</div>',
      footer: '<button class="btn" data-close>关闭</button>'
    });

    setTimeout(function () {
      Array.prototype.forEach.call(document.querySelectorAll('.mf-row'), function (row) {
        row.addEventListener('click', function () {
          var key = row.getAttribute('data-goto');
          var label = row.getAttribute('data-label');
          UI.maskClose();
          jump(key);
          if (label) {
            setTimeout(function () {
              var field = Array.prototype.filter.call(document.querySelectorAll('#rfMain .rf-field'), function (w) {
                var l = w.querySelector('.rf-label');
                return l && l.textContent.indexOf(label) === 0;
              })[0];
              if (field) {
                field.scrollIntoView({ behavior: 'smooth', block: 'center' });
                field.classList.add('rf-flash');
                var input = field.querySelector('.rf-input');
                if (input) input.focus();
                setTimeout(function () { field.classList.remove('rf-flash'); }, 1600);
              }
            }, 220);
          }
        });
      });
    }, 0);
  }

  function whyModal() {
    UI.modal({
      title: '关于「全部选填」',
      body: '<div style="font-size:13px;line-height:1.85;color:#475569">' +
        '<p><b>1. 没有任何必填项。</b>姓名、电话、证件号、家庭情况、健康信息等全部可以不填，工具不会因此阻止你生成简历或填写网申。</p>' +
        '<p style="margin-top:8px"><b>2. 敏感字段按需填写。</b>身份证号、犯罪记录、病史、收入等信息只保存在本地浏览器，不会上传。</p>' +
        '<p style="margin-top:8px"><b>3. 未填字段会被标记。</b>每个空字段显示「待填写」，栏目左侧显示已填 / 总数，方便你决定补哪些。</p>' +
        '<p style="margin-top:8px"><b>4. 企业表单仍可能有自己的必填项。</b>那是对方页面的要求，工具会在填写时单独提示，但不会替你编造内容。</p>' +
        '</div>',
      footer: '<button class="btn btn-primary" data-close>明白了</button>'
    });
  }

  function importResume() {
    UI.modal({
      title: '从简历文本导入',
      wide: true,
      body: '<p class="mini-note" style="margin-bottom:10px">把简历全文粘贴进来，会按「教育 / 项目 / 技能」结构化识别，专业名走词典匹配，不会把相近专业混为一谈。</p>' +
        '<textarea class="textarea" id="impText" style="min-height:220px" placeholder="粘贴简历全文…"></textarea>',
      footer: '<button class="btn" data-close>取消</button><button class="btn btn-ai" data-ok>识别并预览</button>',
      onOk: function (box) {
        var text = box.querySelector('#impText').value;
        if (!text.trim()) { UI.toast('请先粘贴内容', 'warn'); return false; }
        if (!global.ResumeParse) { UI.toast('解析组件未加载，请刷新页面', 'warn'); return false; }
        var parsed = global.ResumeParse.parseText(text);
        var p = parsed.education;
        UI.confirm('识别结果确认',
          '专业：' + (p.major || '未识别') + '　学历：' + (p.degree || '未识别') + '；' +
          '学校：' + (p.school || '未识别') + '　时间：' + (p.start || '?') + ' – ' + (p.end || '?') + '；' +
          '项目经历：' + parsed.projects.length + ' 个，职责/成果 ' +
          parsed.projects.reduce(function (n, x) { return n + x.bullets.length; }, 0) + ' 条；' +
          (parsed.meta.warnings.length ? '待复核：' + parsed.meta.warnings.slice(0, 3).join('；') : '未发现缺漏'),
          function () {
            var res = Store.applyParsed(parsed, {});
            UI.toast('已写入档案：' + res.summary, 'ok');
            cur = 'project';
            rerender();
          }, '写入档案');
        return false;
      }
    });
  }

  function polishProject(id) {
    var item = Store.findItem('project', id);
    if (!item) return;
    var before = (item.duties || '') + (item.results || '');
    if (!before.trim()) { UI.toast('先写点职责或成果，AI 才能润色', 'warn'); return; }
    item.duties = (item.duties || '').split('\n').map(function (l) {
      var t = l.trim();
      if (!t) return '';
      return /^[•·\-*]/.test(t) ? t : '• ' + t;
    }).filter(Boolean).join('\n');
    Store.emit();
    var card = document.querySelector('[data-item-card="' + id + '"]');
    var dutyEl = card && card.querySelector('[data-key="duties"]');
    if (dutyEl) dutyEl.value = item.duties;
    UI.toast('已整理职责条目，建议再补一句量化结果', 'ok');
    refreshStats();
  }

  function mount(root) {
    if (root.__bound) return;
    root.__bound = true;

    root.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-jump]');
      if (nav && !nav.hasAttribute('data-label')) {
        jump(nav.getAttribute('data-jump'));
        return;
      }
      var toggle = e.target.closest('[data-toggle]');
      if (toggle && !e.target.closest('.rf-op')) {
        var id = toggle.getAttribute('data-toggle');
        var card = toggle.closest('.rf-item');
        var body = card.querySelector('.rf-item-body');
        var isOpen = !body.hidden;
        body.hidden = isOpen;
        card.classList.toggle('on', !isOpen);
        openIds[id] = !isOpen;
        return;
      }
      var add = e.target.closest('[data-add-sec]');
      if (add) { addItem(add.getAttribute('data-add-sec')); return; }

      var move = e.target.closest('[data-move]');
      if (move) {
        if (Store.moveItem(move.getAttribute('data-sec'), move.getAttribute('data-id'), move.getAttribute('data-move') === 'up' ? -1 : 1)) {
          openIds[move.getAttribute('data-id')] = true;
          rerender();
        }
        return;
      }
      var del = e.target.closest('[data-del-item]');
      if (del) {
        var secKey = del.getAttribute('data-sec');
        var itemId = del.getAttribute('data-del-item');
        UI.confirm('删除这条' + RF.section(secKey).itemName + '？', '删除后与该条内容相关的简历版本将不再展示，且无法撤销。', function () {
          Store.removeItem(secKey, itemId);
          rerender();
          UI.toast('已删除', 'ok');
        }, '删除');
        return;
      }

      var delFile = e.target.closest('[data-delfile]');
      if (delFile) {
        Store.removeFile(delFile.getAttribute('data-delfile'));
        rerender(); UI.toast('已移除材料', 'ok'); return;
      }
      if (e.target.closest('#uploadZone')) {
        UI.pickFile('.pdf,.jpg,.jpeg,.png,.doc,.docx', function (f) {
          Store.addFile(f);
          rerender();
          UI.toast('已上传：' + f.name, 'ok');
        });
        return;
      }

      var act = e.target.closest('[data-act]');
      if (!act) return;
      var a = act.getAttribute('data-act');
      if (a === 'missing') missingModal();
      if (a === 'why') whyModal();
      if (a === 'import') importResume();
      if (a === 'upload-pdf') {
        if (!global.ImportFlow) { UI.toast('导入组件未加载，请刷新页面', 'warn'); return; }
        global.ImportFlow.open();
      }
      if (a === 'ai-project') polishProject(act.getAttribute('data-id'));
    });

    /* 输入即存：text/textarea 用 input，select/date 用 change */
    var saveTimer = null;
    root.addEventListener('input', function (e) {
      var el = e.target.closest('.rf-input');
      if (!el || el.disabled) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { saveField(el); }, 240);
      markField(el, !isBlank(el.value));
    });
    root.addEventListener('change', function (e) {
      var el = e.target.closest('.rf-input');
      if (!el || el.disabled) return;
      if (el.tagName === 'SELECT' || el.type === 'date' || el.type === 'month') saveField(el);
    });
    root.addEventListener('blur', function (e) {
      var el = e.target.closest && e.target.closest('.rf-input');
      if (el && !el.disabled) saveField(el);
    }, true);

    var zone = root.querySelector('#uploadZone');
    if (zone) {
      ['dragover', 'dragenter'].forEach(function (ev) {
        zone.addEventListener(ev, function (e2) { e2.preventDefault(); zone.classList.add('drag'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        zone.addEventListener(ev, function (e2) { e2.preventDefault(); zone.classList.remove('drag'); });
      });
      zone.addEventListener('drop', function (e2) {
        var f = e2.dataTransfer.files[0];
        if (f) { Store.addFile(f); rerender(); UI.toast('已上传：' + f.name, 'ok'); }
      });
    }
  }

  global.Views = global.Views || {};
  global.Views.profile = {
    title: '简历填写', render: render, mount: mount,
    setTab: function (t) { cur = t; },
    openMissing: missingModal
  };
})(window);
