/* =========================================================
   OfferPilot 内容脚本
   职责：在真实招聘官网上识别表单字段 → 语义匹配档案 → 写入 → 浮层反馈
   运行环境：每个 http(s) 页面的独立 JS 世界（isolated world）
   ========================================================= */
(function () {
  'use strict';

  if (window.__OP_CONTENT_READY__) return;
  window.__OP_CONTENT_READY__ = true;

  var S = window.OPSchema;
  if (!S) return;
  var RM = window.ResumeMatch;
  var OM = window.OptionMap;

  var STATE_KEY = 'offerpilot.state.v1';
  var PICK_KEY = 'offerpilot.pick.v1';
  var HOST_ID = '__offerpilot_host__';
  var isTop = (function () { try { return window.top === window.self; } catch (e) { return false; } })();

  var cache = { state: null, at: 0 };
  var report = null;
  var undoStack = [];
  /* 当前一轮填写的数据上下文：React 表单写入后会整棵重渲染，
     收集时的节点可能被换掉——断连时按字段 id 重新收集找替身 */
  var fillCtx = { state: null, resume: null };
  var ui = null;
  var uiMode = 'simple';
  var busy = false;
  var answerRound = false;        // 本轮是否来自「工作台补充答案」，用于避免重复追问

  /* 面板 / 匹配 / 选区 / 辅助 的状态 */
  var view = 'home';              // home | flash | assist
  var match = null;               // { job, best, list, unanswered }
  var pickedResumeId = '';        // 用户手动指定的版本
  var assistRows = [];            // 辅助填写草稿
  var pickActive = false;
  var pickStart = null;
  var flashResumeId = '';         // 「简历闪填」当前展开的版本
  var flashQuery = '';
  var pickOpen = false;           // 面板里「当前简历」下拉是否展开
  var switchAt = 0;               // 最近一次切换成功的时间（用于绿条提示）
  var switchTimer = null;
  var bubbleHidden = false;       // 唯一允许隐藏悬浮球的场景：选区填写进行中
  var bubblePos = null;           // 用户拖动过悬浮球后的坐标
  var dragMoved = false;          // 拖动结束的那次 click 不要当成「打开面板」
  var keepTimer = null;
  var POS_KEY = 'offerpilot.bubble.v1';

  /* ================= 1. 读取档案 ================= */
  function readState(force) {
    if (!force && cache.state && Date.now() - cache.at < 15000) return Promise.resolve(cache.state);
    return new Promise(function (res) {
      try {
        chrome.storage.local.get([STATE_KEY, PICK_KEY], function (obj) {
          cache.state = (obj && obj[STATE_KEY]) || null;
          if (obj && typeof obj[PICK_KEY] === 'string' && obj[PICK_KEY]) pickedResumeId = obj[PICK_KEY];
          cache.at = Date.now();
          res(cache.state);
        });
      } catch (e) { res(cache.state); }
    });
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'local' && changes[STATE_KEY]) {
        cache.state = changes[STATE_KEY].newValue;
        cache.at = Date.now();
        if (ui && !ui.hidden) refreshReport();
      }
    });
  }

  /* ================= 1.5 岗位识别与简历匹配 ================= */
  function detectJob() {
    var h1 = document.querySelector('h1');
    var text = '';
    try { text = (document.body && document.body.innerText || '').slice(0, 8000); } catch (e) { }
    if (!RM) {
      return { company: location.hostname, role: '', host: location.hostname, title: document.title, text: text, dirs: [] };
    }

    /* 很多招聘站的岗位名不在 h1 上，而是一个 class 带 job/position 的小标题 */
    var extra = '';
    var sels = [
      '[class*="job-title"]', '[class*="jobTitle"]', '[class*="job-name"]', '[class*="jobName"]',
      '[class*="position-name"]', '[class*="positionName"]', '[class*="position-title"]',
      '[class*="post-name"]', '[class*="postTitle"]'
    ];
    for (var i = 0; i < sels.length && !extra; i++) {
      var nodes = document.querySelectorAll(sels[i]);
      for (var j = 0; j < nodes.length; j++) {
        if (!visible(nodes[j])) continue;
        var t = clean(nodes[j].innerText || nodes[j].textContent);
        if (t && t.length >= 2 && t.length <= 30) { extra = t; break; }
      }
    }
    var og = document.querySelector('meta[property="og:title"]');

    return RM.extractJob({
      title: document.title,
      host: location.hostname,
      h1: h1 ? clean(h1.innerText || h1.textContent) : '',
      subtitle: extra || (og ? clean(og.getAttribute('content')) : ''),
      text: text
    });
  }

  /* 每次换页 / 数据变更都重新算一遍；用户手动选过就尊重手动选择 */
  function ensureMatch(state) {
    if (!RM) return null;
    var sameHost = match && match.job && match.job.host === location.hostname;
    var fresh = match && Date.now() - match.at < 60000;
    if (sameHost && fresh) {
      if (pickedResumeId && (!match.best || match.best.resume.id !== pickedResumeId)) applyPick();
      return match;
    }
    var job = detectJob();
    var out = RM.rank((state && state.resumes) || [], job, state && state.profile);
    match = { job: job, best: out.best, list: out.list, unanswered: out.unanswered, reason: out.reason, at: Date.now() };
    if (pickedResumeId) applyPick();
    return match;
  }

  function applyPick() {
    var hit = (match.list || []).filter(function (x) { return x.resume.id === pickedResumeId; })[0];
    if (!hit) return;
    match.best = { resume: hit.resume, score: hit.score, level: hit.level, reasons: ['手动指定这个版本'], hits: hit.hits, manual: true };
    match.unanswered = false;
    match.reason = '已手动指定版本';
  }

  function currentResume(state) {
    ensureMatch(state);
    if (match && match.best) return match.best.resume;
    var list = (state && state.resumes) || [];
    return list.filter(function (r) { return r.isDefault; })[0] || list[0] || null;
  }

  function matchSummary() {
    if (!match) return { job: '当前页面', resume: '未读取到简历版本', score: '', warn: '' };
    var job = match.job || {};
    var best = match.best;
    var jobText = [job.company, job.role].filter(Boolean).join(' · ') || job.host || '当前页面';
    var resumeText = best && best.resume ? best.resume.name : '还没有简历版本';
    var score = best && best.score != null ? best.score + '%' : '';
    var warn = '';
    if (match.unanswered) warn = match.reason || '没识别到岗位，按默认简历填写';
    else if (best && best.score != null && best.score < 58) {
      var dirName = job.dirs && job.dirs[0] ? job.dirs[0].name : '';
      warn = '这个岗位偏「' + (dirName || job.role || '该岗位') + '」，简历库里没有对应版本，先按当前版本填写，可点「换一份」';
    }
    else if (best && best.reasons && best.reasons[0]) warn = best.reasons[0];
    return { job: jobText, resume: resumeText, score: score, warn: warn, level: best && best.level || '' };
  }

  /* ================= 1.6 剪贴板 ================= */
  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-2000px;left:-2000px;opacity:0';
      document.documentElement.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      var ok = document.execCommand && document.execCommand('copy');
      document.documentElement.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }

  function copyText(text) {
    text = String(text || '');
    if (!text) return Promise.resolve(false);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return true; })
          .catch(function () { return legacyCopy(text); });
      }
    } catch (e) { /* 无权限时走兜底 */ }
    return Promise.resolve(legacyCopy(text));
  }

  function copyAndToast(text, label) {
    return copyText(text).then(function (ok) {
      if (ok) toast('已复制' + (label ? '「' + label + '」' : '') + '，共 ' + text.length + ' 字', 'ok');
      else toast('浏览器没允许写入剪贴板，请手动选择复制', 'warn');
      return ok;
    });
  }

  /* ================= 2. 字段文本推断 ================= */
  function clean(t) {
    return String(t == null ? '' : t)
      .replace(/[\u200b-\u200d\ufeff]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^[\s*＊:：·•\-—_]+/, '')
      .replace(/[\s*＊:：]+$/, '')
      .trim();
  }

  function textOf(node) {
    if (!node) return '';
    var t = node.innerText || node.textContent || '';
    return clean(t);
  }

  function byIds(str) {
    if (!str) return '';
    return str.split(/\s+/).map(function (id) {
      var n = document.getElementById(id);
      return n ? textOf(n) : '';
    }).filter(Boolean).join(' ');
  }

  /* 最近的、位于控件之前或包裹控件的短文本 */
  function nearestLabel(el) {
    var node = el, depth = 0;
    while (node && depth < 5) {
      var prev = node.previousElementSibling;
      while (prev) {
        if (!prev.querySelector('input,select,textarea')) {
          var t = textOf(prev);
          if (t && t.length >= 1 && t.length <= 24) return t;
        }
        prev = prev.previousElementSibling;
      }
      // 表格：<tr><th>姓名</th><td><input></td></tr>
      var cell = node.closest && node.closest('td,dd');
      if (cell) {
        var sib = cell.previousElementSibling;
        if (sib) {
          var st = textOf(sib);
          if (st && st.length <= 24) return st;
        }
      }
      node = node.parentElement;
      depth++;
    }
    return '';
  }

  /* 组合签名：强文本（label/aria/邻近文本）为主，name/id 为兜底 */
  function signatures(el) {
    var strong = [];
    var rawReq = false;

    if (el.labels && el.labels.length) {
      for (var i = 0; i < el.labels.length; i++) {
        var rt = el.labels[i].textContent || '';
        if (/\*/.test(rt)) rawReq = true;
        var t = clean(rt);
        if (t) strong.push(t);
      }
    }
    var aria = el.getAttribute('aria-label');
    if (aria) { stronglyPush(strong, aria); if (/\*/.test(aria)) rawReq = true; }
    var ariaby = byIds(el.getAttribute('aria-labelledby'));
    if (ariaby) stronglyPush(strong, ariaby);

    // 父级容器里的 label 元素（防止最近兄弟是图标/提示）
    var box = el.closest('.form-item,.form-group,.ant-form-item,.el-form-item,.weui-cell,.field,.form-row,.control-group,tr,li,dd,fieldset');
    if (box) {
      var legend = box.querySelector('legend');
      if (legend) stronglyPush(strong, textOf(legend));
      var labels = box.querySelectorAll('label,.form-label,.ant-form-item-label,.el-form-item__label,[class*="label"],[class*="Label"]');
      for (var j = 0; j < labels.length; j++) {
        if (labels[j].contains(el)) continue;
        var lt = labels[j].textContent || '';
        if (/\*/.test(lt)) rawReq = true;
        var cl = clean(lt);
        if (cl && cl.length <= 30) stronglyPush(strong, cl);
      }
    }

    var near = nearestLabel(el);
    if (near) stronglyPush(strong, near);

    /* 文件框兜底：antd Upload 把 input 藏在壳里、label 不关联（拼多多「上传一寸证件照」），
       沿祖先收一遍短文本，"请上传照片"这类提示就是它唯一的名片 */
    if (!strong.length && el.type === 'file') {
      var fnode = el, fdepth = 0;
      while (fnode && fnode !== document.body && fdepth < 6 && !strong.length) {
        fnode = fnode.parentElement;
        if (!fnode) break;
        var ftext = '';
        Array.prototype.slice.call(fnode.childNodes).forEach(function (ch) {
          if (ch.nodeType === 3) ftext += ch.textContent;
          else if (ch.nodeType === 1 && !/^(input|select|textarea)$/i.test(ch.tagName)) ftext += ' ' + (ch.textContent || '');
        });
        ftext = clean(ftext);
        if (ftext && ftext.length <= 60) stronglyPush(strong, ftext);
        fdepth++;
      }
    }

    var ph = clean(el.getAttribute('placeholder') || '');
    var title = clean(el.getAttribute('title') || '');
    if (/\*/.test(el.getAttribute('placeholder') || '')) rawReq = true;

    var attr = [el.getAttribute('name'), el.getAttribute('id'), el.getAttribute('data-field'), el.getAttribute('data-name')]
      .filter(Boolean).join(' ');

    return {
      strong: strong.join(' '),
      weak: [ph, title, attr].filter(Boolean).join(' '),
      placeholder: ph,
      required: !!(el.required || el.getAttribute('aria-required') === 'true' || rawReq)
    };
  }

  function stronglyPush(arr, t) {
    t = clean(t);
    if (t && arr.indexOf(t) < 0) arr.push(t);
  }

  /* ================= 3. 可见性与候选收集 ================= */
  function visible(el) {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    var cs = window.getComputedStyle(el);
    if (!cs || cs.visibility === 'hidden' || cs.display === 'none') return false;
    if (cs.opacity === '0') return false;
    var r = el.getBoundingClientRect();
    return r.width >= 4 && r.height >= 4;
  }

  /* 「结构上在场」：不管 opacity/尺寸。antd 的 radio/checkbox 原生 input 就是
     opacity:0 靠自绘样式展示的（g-bits 实测），按 visible() 判会把整组单选误杀，
     用户看到的是「性别永远填不上」。单选/复选要看它和它的自绘外壳是否在文档里。 */
  function visuallyThere(el) {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    var cs = window.getComputedStyle(el);
    return !!(cs && cs.visibility !== 'hidden' && cs.display !== 'none');
  }

  function radioUsable(el) {
    if (visuallyThere(el)) return true;
    /* input 本体被 display:none 的站：外壳/label 可见就算 */
    var shell = el.closest && (el.closest('label') || el.parentElement);
    while (shell) {
      if (visuallyThere(shell)) return true;
      shell = shell.parentElement;
    }
    return false;
  }

  var SKIP_INPUT = ['hidden', 'submit', 'button', 'reset', 'image', 'password', 'search', 'checkbox', 'range', 'color'];

  /* 招聘站（Moka / 北森 / 用 antd、arco、element 搭的页面）的「性别」「信息来源」这类下拉，
     内核是一个只读 input 或一个纯 div 容器，原生 value 写不进去，必须点开再选。
     不认这一类，整片字段会被当成「不可填」直接跳过——这是真实页面上填不动的主因。 */
  var SELBOX_SEL = '.ant-select,.arco-select,.el-select,.ivu-select,.semi-select,.rocket-select,[class*="select-wrap"],[class*="selectWrap"]';

  /* 日历选择器（antd DatePicker / RangePicker、element 的日期编辑器）：
     输入框是 readonly 的，普通文本路径写不进去，必须点开面板去选 —— 所以单独成一类。
     g-bits 的「出生年月」「入校时间」都是这一类，之前被 el.readOnly 直接跳过。 */
  var DATEBOX_SEL = '.ant-calendar-picker,.ant-calendar-range-picker,.ant-picker,.ant-picker-range,.el-date-editor,.el-range-editor,[class*="calendar-picker"],[class*="date-picker"],[class*="datePicker"]';

  function dateBoxOf(el) {
    if (!el || !el.closest) return null;
    return el.closest(DATEBOX_SEL);
  }

  /* 级联选择器（省 → 市 → 区），值显示在 .ant-cascader-picker-label 里，
     input.value 恒为空 —— 校验和撤销都不能看 input（g-bits 的「籍贯」实测）。 */
  var CAS_SEL = '.ant-cascader-picker,.ant-cascader,[class*="cascader"]';

  function cascaderOf(el) {
    if (!el || !el.closest) return null;
    var box = el.closest(CAS_SEL);
    if (box && !box.querySelector('select')) return box;
    return null;
  }

  function selectBoxOf(el) {
    if (!el || !el.closest) return null;
    var box = el.closest(SELBOX_SEL);
    if (box && !box.querySelector('select')) {
      /* 拼多多的「现家庭住址」：antd Select 只当级联的触发器用，外面套着 [class*=cascader] 的壳。
         这种"披着下拉皮的级联"让给 cascader 分支，否则点开找不到下拉面板白忙一场 */
      var cw = el.closest('[class*="cascader"]');
      if (cw && cw.contains(box)) return null;
      return box;
    }
    if (el.readOnly && el.getAttribute('role') === 'combobox') return el.closest('[class*="select"]') || el.parentElement;
    return null;
  }

  /* 自定义下拉的标签不在 input 上，得从 form-item 的 label / 占位文案里找 */
  function boxSignatures(box, el) {
    var strong = [];
    var required = false;
    var item = box.closest('.ant-form-item,.arco-form-item,.el-form-item,.form-item,.form-group,.field,tr,li,dd');
    if (item) {
      if (item.querySelector('.ant-form-item-required,.is-required,[class*="required"]')) required = true;
      var lab = item.querySelector('.ant-form-item-label,[class*="item-label"],label');
      if (lab) {
        var lt = lab.textContent || '';
        if (/\*/.test(lt)) required = true;
        stronglyPush(strong, lt);
      }
    }
    if (!strong.length) {
      /* 没有标准 form-item 的站点：往上找三层，取「自己不带表单控件」的那个 label */
      var up = box.parentElement;
      for (var d = 0; d < 3 && up && !strong.length; d++) {
        var labs = up.querySelectorAll('label,[class*="label"],[class*="Label"]');
        for (var li = 0; li < labs.length; li++) {
          var lb = labs[li];
          if (lb.contains(box) || lb.querySelector('input,select,textarea')) continue;
          var lt = lb.textContent || '';
          if (/\*/.test(lt)) required = true;
          var ct = clean(lt);
          if (ct && ct.length <= 30) { stronglyPush(strong, ct); break; }
        }
        up = up.parentElement;
      }
    }
    if (!strong.length) {
      var prev = box.previousElementSibling;
      if (prev && (prev.textContent || '').length <= 30) stronglyPush(strong, prev.textContent);
    }
    var byLab = box.getAttribute('aria-labelledby');
    if (byLab) {
      var lt2 = byIds(byLab);
      if (lt2) stronglyPush(strong, lt2);
    }
    var aria = (el && el.getAttribute('aria-label')) || box.getAttribute('aria-label') || '';
    if (aria) stronglyPush(strong, aria);
    var ph = box.querySelector('.ant-select-selection-placeholder,[class*="placeholder"]');
    var weak = ph ? clean(ph.textContent) : '';
    if (el) {
      var t = clean(el.getAttribute('title') || '');
      if (t) weak = weak || t;
    }
    return { strong: strong.join(' '), weak: weak, placeholder: weak, required: required };
  }

  function collect() {
    var out = [];
    var nodes = document.querySelectorAll('input, select, textarea, [contenteditable=""], [contenteditable="true"]');
    var radioGroups = {};
    var seenBox = [];
    var seenCas = [];

    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.closest('#' + HOST_ID)) continue;
      var tag = el.tagName.toLowerCase();
      var type = (el.type || '').toLowerCase();

      if (tag === 'input') {
        if (type === 'file') {
          out.push({ el: el, kind: 'file', sig: signatures(el), disabled: false });
          continue;
        }
        if (type === 'radio') {
          var nm = el.name || ('__r' + out.length);
          if (!radioGroups[nm]) radioGroups[nm] = [];
          radioGroups[nm].push(el);
          continue;
        }
      }
      if (el.disabled) continue;
      var sbox = selectBoxOf(el);
      var cbox = !sbox ? cascaderOf(el) : null;
      var dbox = (!sbox && !cbox) ? dateBoxOf(el) : null;
      /* 跳过规则只对「不在任何特殊组件里」的普通输入生效。
         antd Select 的搜索框 type=search、日期框 readOnly —— 它们是 selectx /
         datebox 的入口，先判组件再判跳过，顺序反了整片字段就没了（g-bits 实测）。 */
      if (!sbox && !cbox && !dbox) {
        if (tag === 'input' && SKIP_INPUT.indexOf(type) >= 0) continue;
        if (el.readOnly) continue;
      }
      if (!visible(el) && !(sbox && visible(sbox)) && !(dbox && visible(dbox))) continue;
      if (sbox) {
        if (seenBox.indexOf(sbox) >= 0) continue;
        seenBox.push(sbox);
        out.push({ el: el, box: sbox, kind: 'selectx', type: '', sig: boxSignatures(sbox, el), disabled: false });
        continue;
      }
      if (cbox) {
        if (seenCas.indexOf(cbox) >= 0) continue;
        seenCas.push(cbox);
        out.push({ el: el, box: cbox, kind: 'cascader', type: '', sig: boxSignatures(cbox, el), disabled: false });
        continue;
      }
      if (dbox && el.readOnly) {
        /* 范围选择器（入校时间 ~ 获得学位证时间）一头一尾两个输入框，
           各自成一项，签名靠各自的 placeholder 区分 */
        out.push({ el: el, box: dbox, kind: 'datebox', type: type || 'date', sig: signatures(el), disabled: false });
        continue;
      }

      out.push({
        el: el,
        kind: tag === 'select' ? 'select' : (tag === 'textarea' ? 'textarea' : (el.isContentEditable ? 'richtext' : 'input')),
        type: type,
        sig: signatures(el),
        disabled: false
      });
    }

    /* 有些自定义下拉连 input 都没有，就是一个可点的 div */
    var boxes = document.querySelectorAll(SELBOX_SEL);
    for (var k = 0; k < boxes.length; k++) {
      var box = boxes[k];
      if (box.closest('#' + HOST_ID)) continue;
      if (seenBox.indexOf(box) >= 0) continue;
      if (box.querySelector('input:not([readonly]):not([disabled]),textarea,select')) continue;
      if (!visible(box)) continue;
      /* 只认「像下拉」的：有 role=combobox，或带 ant/arco/element/rocket 的类名 */
      if (!/ant-select|arco-select|el-select|ivu-select|semi-select|rocket-select/i.test(box.className || '')) continue;
      /* 壳是 [class*=cascader] 的裸 select（拼多多「现家庭住址」）：它是级联触发器，
         点开的面板是 ant-cascader-menus，按 cascader 收集，别当普通下拉白点一场 */
      var cshell = cascaderOf(box);
      if (cshell) {
        if (seenCas.indexOf(cshell) >= 0) continue;
        seenCas.push(cshell);
        out.push({ el: box, box: cshell, kind: 'cascader', type: '', sig: boxSignatures(cshell, box), disabled: false });
        continue;
      }
      seenBox.push(box);
      out.push({ el: box, box: box, kind: 'selectx', type: '', sig: boxSignatures(box, null), disabled: false });
    }

    // 单选组：整组算一个字段（opacity:0 的 antd 自绘单选也要算，见 radioUsable）
    Object.keys(radioGroups).forEach(function (nm) {
      var group = radioGroups[nm].filter(radioUsable);
      if (!group.length) return;
      var first = group[0];
      var base = signatures(first);
      var legendText = '';
      var fs = first.closest('fieldset');
      if (fs) { var lg = fs.querySelector('legend'); if (lg) legendText = textOf(lg); }
      var near = nearestLabel(first);
      out.push({
        el: first,
        kind: 'radio',
        group: group,
        displayLabel: legendText || near || '',
        sig: {
          strong: [legendText, near, base.strong].filter(Boolean).join(' '),
          weak: [base.weak, nm].filter(Boolean).join(' '),
          required: base.required || group.some(function (x) { return x.required; })
        },
        disabled: false
      });
    });

    return out;
  }

  function optionText(radio) {
    if (radio.labels && radio.labels.length) return clean(radio.labels[0].textContent);
    var v = radio.value || '';
    var near = radio.nextSibling;
    if (near && near.nodeType === 3) return clean(near.textContent);
    if (near && near.nodeType === 1) return textOf(near);
    return clean(v);
  }

  /* ================= 3.5 分节表单展开 =================
     拼多多这类站把网申拆成「基本信息/教育经历/语言能力/…」多个分节，每节要点「编辑」
     才渲染输入框。一键填写前自动展开没打开的分节（已展开的跳过）；保存仍由人点。 */
  function expandSections() {
    var n = 0;
    var btns = Array.prototype.slice.call(document.querySelectorAll('button,a,[role="button"],span,div'));
    for (var i = 0; i < btns.length && n < 6; i++) {
      var b = btns[i];
      if (b.closest('#' + HOST_ID)) continue;
      var t = clean(b.textContent || '');
      if (!/^(编辑|填写|去填写|去完善|立即填写)$/.test(t)) continue;
      if (!visible(b)) continue;
      var sec = b.closest('div[class*="section"],div[class*="card"],div[class*="panel"],div[class*="item"],section,form,li,dd') || b.parentElement;
      if (sec) {
        var inputs = Array.prototype.slice.call(sec.querySelectorAll('input,textarea')).filter(function (x) { return x.type !== 'file'; });
        if (inputs.some(visible)) continue; /* 已展开 */
      }
      try { b.click(); n++; } catch (e) { }
    }
    return n;
  }

  /* ================= 4. 分析与匹配 ================= */
  function analyze(state, resume) {
    if (!resume) resume = currentResume(state);
    var list = collect();
    var items = [];
    var used = {};

    list.forEach(function (c) {
      var m = S.match(c.sig.strong);
      if (!m && c.sig.weak) m = S.match(c.sig.weak);
      /* 文件字段只能落到 file 输入上：文本框「个人作品集」不能被「作品集附件」认领 */
      if (m && m.field.type === 'file' && c.kind !== 'file') m = null;
      c.field = m ? m.field : null;
      c.score = m ? m.score : 0;
      c.label = c.displayLabel || clean(c.sig.strong).split(' ').slice(0, 3).join(' ').slice(0, 28)
        || clean(c.sig.weak).slice(0, 28) || (c.kind === 'file' ? '文件字段' : '未命名字段');
      items.push(c);
    });

    // 按页面视觉顺序排列，便于对照
    items.sort(function (a, b) {
      if (a.el === b.el) return 0;
      var pos = a.el.compareDocumentPosition(b.el);
      return (pos & 4) ? -1 : 1;
    });

    /* 同一字段多处出现（拼多多「毕业学校」在基本信息和教育经历各有一个）：
       两处都要填，不再按字段去重 —— 隐藏副本在 collect 里已被 visible() 过滤，
       重复写入不同节点是页面真实要求 */
    items.forEach(function (c) {
      c.res = c.field ? S.resolve(state, c.field, resume) : null;
      c.status = !c.field
        ? 'unknown'
        : (c.res.manual ? 'manual' : (c.res.ok ? 'ready' : 'empty'));
      /* 简历/成绩单/证件照/作品集：档案里存了文件本体（dataUrl）就能自动上传，
         浏览器允许脚本用 DataTransfer 往 file input 里塞 File（g-bits「上传简历」、拼多多「上传证件照」实测可行） */
      if (c.status === 'manual' && (c.field.id === 'resumeFile' || c.field.id === 'transcriptFile' || c.field.id === 'photoFile' || c.field.id === 'workFile')) {
        var fk = c.field.id === 'transcriptFile' ? 'transcript' : (c.field.id === 'photoFile' ? 'photo' : (c.field.id === 'workFile' ? 'work' : 'resume'));
        var rec = (state.files || []).filter(function (f) { return f.kind === fk && f.dataUrl; })[0];
        if (rec) {
          c.res = { ok: true, text: rec.name, from: '我的附件', file: rec };
          c.status = 'ready';
        }
      }
    });

    return items;
  }

  function summarize(items) {
    var total = items.filter(function (c) { return c.status !== 'dup'; }).length;
    var ready = items.filter(function (c) { return c.status === 'ready'; }).length;
    var manual = items.filter(function (c) { return c.status === 'manual'; }).length;
    var unknown = items.filter(function (c) { return c.status === 'unknown'; }).length;
    var missingReq = items.filter(function (c) {
      return c.status !== 'dup' && c.sig.required && (c.status === 'empty' || c.status === 'unknown');
    });

    return {
      url: location.href,
      host: location.hostname,
      title: (document.title || '').slice(0, 120),
      total: total,
      ready: ready,
      manual: manual,
      unknown: unknown,
      percent: total ? Math.round(ready / total * 100) : 0,
      missingRequired: missingReq.map(function (c) { return c.label; }).slice(0, 8),
      fields: items.filter(function (c) { return c.status !== 'dup'; }).map(function (c) {
        return {
          label: c.label,
          id: c.field ? c.field.id : '',
          name: c.field ? c.field.label : '未识别',
          status: c.status,
          required: !!c.sig.required,
          preview: c.status === 'ready' && c.res && c.res.text
            ? trunc(String(c.res.text).replace(/\s+/g, ' '), 18) : '',
          reason: c.status === 'manual' ? (c.res && c.res.reason) : ''
        };
      }).slice(0, 80),
      at: Date.now()
    };
  }

  function refreshReport(items) {
    items = items || analyze(cache.state);
    report = summarize(items);
    try {
      chrome.runtime.sendMessage({ type: 'OP_REPORT', report: report });
    } catch (e) { /* 扩展已重载 */ }
    if (ui) renderUI();
    return report;
  }

  /* ================= 5. 写入 ================= */
  function nativeSet(el, value) {
    var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
  }

  /* 聚焦但不滚动：否则连填十几个字段会把页面拽到最底部 */
  function safeFocus(el) {
    try { el.focus({ preventScroll: true }); }
    catch (e) { try { el.focus(); } catch (e2) { } }
  }

  function fire(el, types) {
    types.forEach(function (t) {
      el.dispatchEvent(new Event(t, { bubbles: true, cancelable: true }));
    });
  }

  function currentValue(el) {
    if (el.isContentEditable) return (el.textContent || '').trim();
    return String(el.value == null ? '' : el.value).trim();
  }

  /* 判断该字段是否已有内容（单选看选中态，不能看 value 属性） */
  function hasContent(item) {
    if (item.kind === 'radio') return item.group.some(function (r) { return r.checked; });
    if (item.kind === 'file') return !!(item.el.files && item.el.files.length);
    if (item.kind === 'cascader') {
      var cbox = item.box || item.el;
      var sv = cbox.querySelector('.ant-select-selection-selected-value');
      if (sv && clean(sv.textContent)) return true;
      var lab = cbox.querySelector('.ant-cascader-picker-label,[class*="cascader-picker-label"]');
      if (lab && clean(lab.textContent)) return true;
      var ren = cbox.querySelector('.ant-select-selection__rendered');
      if (ren) {
        var ph = ren.querySelector('.ant-select-selection__placeholder');
        var t = ren.textContent || '';
        if (ph) t = t.replace(ph.textContent, '');
        return !!clean(t);
      }
      return false;
    }
    if (item.kind === 'select') {
      var se = item.el;
      if (!se.value) return false;
      var si = se.selectedIndex != null ? se.selectedIndex : -1;
      var st = si >= 0 && se.options[si] ? (se.options[si].textContent || '') : '';
      /* 有些站的占位项 value 不是空串（"0" / "-1"），要按文本判 */
      return !/^(请选择|请填写|select|please|--|—|-)$/i.test(clean(st));
    }
    if (item.kind === 'selectx') {
      var box = item.box || item.el;
      var sel = box.querySelector('.ant-select-selection-item,.arco-select-view-value,.el-select__selected-item,[class*="selection-item"]');
      if (sel && clean(sel.textContent)) return true;
      var inp = box.querySelector('input');
      return !!(inp && clean(inp.value));
    }
    return !!currentValue(item.el);
  }

  /* ---------------- 选项匹配 ----------------
     原生 <select> 与自定义下拉共用 OptionMap 的评分：
     同义写法（本科 ↔ 大学本科）、括号补充（本科（学士））、
     序号前缀（3. 本科）、否定项（不同意 ≠ 同意）都在那里处理。
     OptionMap 缺失时退回原来的三级文本匹配，保证脚本单独也能跑。 */
  function optionListToTexts(opts) {
    return opts.map(function (o) {
      return { text: (o.textContent != null ? o.textContent : o.text) || '', value: o.value };
    });
  }

  function legacyPick(texts, text, allowEmpty) {
    var want = S.norm(text);
    if (!want) return -1;
    var exact = -1, prefix = -1, contain = -1;
    texts.forEach(function (o, i) {
      var n = S.norm(o.text || o.value || '');
      if (!n) return;
      if (n === want) { if (exact < 0) exact = i; }
      else if (prefix < 0 && (n.indexOf(want) === 0 || want.indexOf(n) === 0) && n.length > 1) prefix = i;
      else if (contain < 0 && (n.indexOf(want) >= 0 || want.indexOf(n) >= 0)) contain = i;
    });
    var hit = exact >= 0 ? exact : (prefix >= 0 ? prefix : contain);
    if (hit < 0) return -1;
    if (!allowEmpty && /^请选择|^--|^select/i.test(clean(texts[hit].text))) return -1;
    return hit;
  }

  function pickOption(el, text, fieldId) {
    var opts = Array.prototype.slice.call(el.options || []);
    if (!opts.length) return null;
    var list = optionListToTexts(opts);
    var hit = OM ? OM.best(list, fieldId || '', text) : null;
    if (hit) return opts[hit.index] || null;
    var i = legacyPick(list, text, false);
    return i >= 0 ? opts[i] : null;
  }

  /* ---------------- 自定义下拉（antd / arco / element / iview / semi） ---------------- */
  var DROP_SEL = '.ant-select-dropdown:not(.ant-select-dropdown-hidden),.arco-select-popup,.el-select-dropdown,.ivu-select-dropdown,.semi-select-option-list,[class*="select-dropdown"],[class*="selectDropdown"],.rocket-select-dropdown:not([class*="-hidden"])';
  var OPT_SEL = '.ant-select-item-option,.arco-select-option,.el-select-dropdown__item,.ivu-select-item,.semi-select-option,.ant-select-dropdown-menu-item,[role="option"],li';

  function openDropdown() {
    var list = document.querySelectorAll(DROP_SEL);
    for (var i = list.length - 1; i >= 0; i--) {
      if (visible(list[i])) return list[i];
    }
    return null;
  }

  /* 真实页面上可能同时挂着好几个「未隐藏」的下拉（路由切换/上次没关干净的残影），
     不能拿第一个就当自己的 —— 按几何位置挑和触发器挨得最近的那个。 */
  function dropdownForBox(box) {
    var r1 = box.getBoundingClientRect();
    var best = null, bestDist = Infinity;
    var list = document.querySelectorAll(DROP_SEL);
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (!visible(d)) continue;
      var r2 = d.getBoundingClientRect();
      if (r2.width < 10 || r2.height < 10) continue;
      var dx = (r2.left > r1.right || r2.right < r1.left) ? Math.min(Math.abs(r2.left - r1.left), Math.abs(r2.right - r1.right)) : 0;
      var dy = r2.top >= r1.bottom - 40 ? r2.top - r1.bottom : Math.abs(r2.top - r1.top);
      var dist = dx * 3 + dy;
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    return best;
  }

  /* 关掉所有下拉：antd 监听 document 的 mousedown，只发 click 关不掉（g-bits 实测） */
  function closeStrayDropdowns() {
    try {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      document.body.click();
    } catch (e) { }
  }

  function matchOption(drop, want, fieldId) {
    var nodes = Array.prototype.slice.call(drop.querySelectorAll(OPT_SEL));
    if (!nodes.length) return null;
    var list = optionListToTexts(nodes);
    var hit = OM ? OM.best(list, fieldId || '', want) : null;
    if (hit) return nodes[hit.index];
    var i = legacyPick(list, want, false);
    return i >= 0 ? nodes[i] : null;
  }

  /* 组件自带 listbox（rocket-select 这类把选项挂在 aria-controls 指到的 id 上，
     面板类名各家不同，但 aria 的契约是标准的） */
  function ariaListForBox(box) {
    var inp = box.querySelector('input[aria-controls],input[aria-owns]');
    if (!inp) return null;
    var id = inp.getAttribute('aria-controls') || inp.getAttribute('aria-owns');
    var el = id && document.getElementById(id);
    return el && visible(el) ? el : null;
  }

  /* 点开 → 等下拉挂载 → 按文本选 → 校验。异步是因为下拉是点击后才渲染的。
     两类下拉要多走一步：
     ① show-search + 远程过滤（g-bits 的「学校」、拼多多的 rocket-select）：点开时
        选项是空的，要把值打进搜索框等它过滤，才有得选；
     ② 固定短列表（意向城市只有 深圳/厦门/不限）：搜不到就是没有，
        如实报告，绝不硬塞。 */
  function writeSelectBox(item, text) {
    return new Promise(function (resolve) {
      var box = item.box || item.el;
      var want = String(text == null ? '' : text).trim();
      if (!want) { resolve({ ok: false, reason: '没有可写入的内容' }); return; }
      var fieldId = item.field ? item.field.id : '';
      closeStrayDropdowns();
      setTimeout(function () {
        var trigger = box.querySelector('.ant-select-selector,.rocket-select-selector,.arco-select-view,.el-input__inner,input') || box;
        try {
          trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          trigger.click();
        } catch (e) { }
        var started = Date.now();
        var typed = 0; /* 0 未打字；1 全值；2/3 剥前缀重试（脏值兜底） */
        var typeSearch = function (v) {
          var search = box.querySelector('.ant-select-selection-search-input,.rocket-select-selection-search-input,[role="combobox"]') ||
            (dropdownForBox(box) || openDropdown() || ariaListForBox(box) || { querySelector: function () { return null; } }).querySelector('input');
          if (search) {
            try {
              search.readOnly = false;
              safeFocus(search);
              nativeSet(search, v);
              fire(search, ['input']);
            } catch (e) { }
          }
        };
        var timer = setInterval(function () {
          var drop = dropdownForBox(box) || openDropdown() || ariaListForBox(box);
          var opt = drop ? matchOption(drop, want, fieldId) : null;
          if (opt) {
            clearInterval(timer);
            try {
              opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
              opt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
              opt.click();
            } catch (e) { }
            setTimeout(function () { resolve({ ok: true, before: '', picked: clean(opt.textContent) }); }, 40);
            return;
          }
          var waited = Date.now() - started;
          /* 直选失败：先把全值打进搜索框（远程过滤要输入才加载）。
             打了还没结果，就试剥前缀——档案值可能是「学的广东海洋大学」这种脏前缀 */
          if (typed === 0 && waited > 800) {
            typed = 1;
            typeSearch(want);
            return;
          }
          if (typed === 1 && waited > 1700 && want.length >= 5) {
            typed = 2;
            typeSearch(want.slice(1));
            return;
          }
          if (typed === 2 && waited > 2600 && want.length >= 6) {
            typed = 3;
            typeSearch(want.slice(2));
            return;
          }
          if (waited > 3400) {
            clearInterval(timer);
            closeStrayDropdowns();
            var n = drop ? drop.querySelectorAll(OPT_SEL).length : 0;
            resolve({
              ok: false,
              reason: drop ? '下拉里没有「' + trunc(want, 12) + '」（共 ' + n + ' 个选项）' : '下拉没展开'
            });
          }
        }, 60);
      }, 80);
    });
  }

  /* ---------------- 日历选择器（antd DatePicker / RangePicker） ----------------
     g-bits 实测：输入框 readOnly，纯赋值必被抹掉；面板点开后面板内也没有可输入框
     （月历），必须走「年面板 → 十年面板 → 年 → 月（中文数字）」这条点击链。
     验证看触发器 input.value：月历写完是 2003-06，日历是 2003-06-15。 */
  function calPanel() {
    var list = document.querySelectorAll('.ant-calendar-picker-container:not(.ant-calendar-picker-container-hidden),.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)');
    for (var i = list.length - 1; i >= 0; i--) if (visible(list[i])) return list[i];
    return null;
  }

  function calClick(el) {
    if (!el) return false;
    try {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.click();
    } catch (e) { }
    return true;
  }

  /* 在打开的日历面板里导航到 want 年：点年下拉 → 必要时切十年区 → 点目标年。
     导航是异步渲染的，走回调。depth 防止面板不响应时无限递归卡死 fill。 */
  function calNavYear(panel, y, done, depth) {
    depth = depth || 0;
    if (depth > 6) { setTimeout(done, 50); return; }
    var cells = panel.querySelectorAll('.ant-calendar-year-panel-year');
    if (cells.length) {
      for (var i = 0; i < cells.length; i++) {
        if (clean(cells[i].textContent) === String(y)) { calClick(cells[i]); setTimeout(done, 350); return; }
      }
      var decSel = panel.querySelector('.ant-calendar-year-panel-decade-select');
      if (calClick(decSel)) {
        setTimeout(function () {
          var p2 = calPanel() || panel;
          var dec = p2.querySelectorAll('.ant-calendar-decade-panel-decade');
          for (var k = 0; k < dec.length; k++) {
            var dm = /(\d+)\D+(\d+)/.exec(clean(dec[k].textContent));
            if (dm && y >= +dm[1] && y <= +dm[2]) { calClick(dec[k]); break; }
          }
          setTimeout(function () {
            var p3 = calPanel() || panel;
            var cs = p3.querySelectorAll('.ant-calendar-year-panel-year');
            for (var j = 0; j < cs.length; j++) {
              if (clean(cs[j].textContent) === String(y)) { calClick(cs[j]); break; }
            }
            setTimeout(done, 350);
          }, 350);
        }, 350);
      } else setTimeout(done, 100);
      return;
    }
    var ys = panel.querySelector('.ant-calendar-month-panel-year-select,.ant-calendar-header .ant-calendar-year-select,.ant-calendar-year-select');
    if (calClick(ys)) setTimeout(function () { calNavYear(calPanel() || panel, y, done, depth + 1); }, 350);
    else setTimeout(done, 100);
  }

  function calMonthCells(panel) {
    return panel.querySelectorAll('.ant-calendar-month-panel-month');
  }

  function writeDateBox(item, text) {
    return new Promise(function (resolve) {
      var el = item.el;
      var ftype = (item.field && item.field.type) || item.type || 'date';
      var want = dateValue(text, /month/i.test(ftype) ? 'month' : 'date');
      var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(want));
      if (!m) { resolve({ ok: false, reason: '日期「' + trunc(text, 14) + '」解析不出年月' }); return; }
      var y = +m[1], mo = +m[2];
      var hasDay = !!m[3];
      undoStack.push({ el: el, kind: 'value', prev: currentValue(el) });
      closeStrayDropdowns();
      setTimeout(function () {
        try {
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          el.click();
        } catch (e) { }
        var started = Date.now();
        var retried = false;
        var timer = setInterval(function () {
          var panel = calPanel();
          if (!panel) {
            /* 600ms 还没开：换个姿势再点一次——点壳（有些站把 mousedown 挂在壳上）+ 聚焦输入框 */
            if (!retried && Date.now() - started > 600) {
              retried = true;
              try {
                var wrap = el.closest('.ant-calendar-picker,.ant-picker,[class*="calendar-picker"],[class*="month-picker"],[class*="date-picker"]') || el.parentElement;
                if (wrap) { wrap.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); wrap.click(); }
                try { safeFocus(el); } catch (e4) { }
              } catch (e) { }
              return;
            }
            if (Date.now() - started > 1800) { clearInterval(timer); resolve({ ok: false, reason: '日历面板没展开' }); }
            return;
          }
          clearInterval(timer);
          var finish = function () {
            setTimeout(function () {
              var v = String(el.value || '').trim();
              var ok = v.indexOf(m[1]) === 0;
              if (!ok) closeStrayDropdowns();
              resolve(ok ? { ok: true, before: '', picked: v } : { ok: false, reason: '日历面板点了但没选上「' + trunc(want, 12) + '」' });
            }, 450);
          };
          var months = calMonthCells(panel);
          if (months.length) {
            /* 月历（出生年月这类只选年月的）：导航到年后点第 mo 个格子（一月..十二月固定顺序） */
            calNavYear(panel, y, function () {
              var p2 = calPanel() || panel;
              var ms = calMonthCells(p2);
              if (ms && ms.length >= mo) calClick(ms[mo - 1]);
              finish();
            });
            return;
          }
          var pinp = panel.querySelector('.ant-calendar-input');
          if (pinp && !pinp.readOnly) {
            /* 全日历带输入框：直接输入 + Enter（antd 3 实测支持） */
            try {
              safeFocus(pinp);
              nativeSet(pinp, want);
              fire(pinp, ['input']);
              pinp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
            } catch (e) { }
            finish();
            return;
          }
          calNavYear(panel, y, function () {
            var p2 = calPanel() || panel;
            var ms = calMonthCells(p2);
            if (ms.length >= mo) {
              calClick(ms[mo - 1]);
              setTimeout(function () {
                var p3 = calPanel() || panel;
                var day = p3.querySelector('.ant-calendar-date[title="' + want + '"]');
                if (!day) {
                  var days = p3.querySelectorAll('.ant-calendar-date');
                  var dnum = String(parseInt(m[3] || '1', 10));
                  for (var i = 0; i < days.length; i++) {
                    if (clean(days[i].textContent) === dnum) { day = days[i]; break; }
                  }
                }
                if (day) calClick(day);
                finish();
              }, 350);
            } else finish();
          });
        }, 80);
      }, 80);
    });
  }

  /* ---------------- 级联（省 → 市 → 区） ----------------
     选项在 .ant-cascader-menu 里逐级挂载；值显示在 .ant-cascader-picker-label，
     input.value 恒为空（g-bits 实测），验证只能看 label。
     匹配走「逐级吞前缀」：广东省广州市 → 广东省 + 广州市；广东茂名 → 广东省 + 茂名，
     不带行政区后缀的写法也能对上（剥掉 省/市/区 后比前缀）。 */
  function stripAdm(s) {
    return String(s == null ? '' : s).replace(/特别行政区|自治区|自治州|地区|盟|省|市|区|县/g, '');
  }

  function writeCascader(item, text) {
    return new Promise(function (resolve) {
      var box = item.box || item.el;
      var raw = String(text == null ? '' : text).trim().replace(/[\s·•,，/／]/g, '');
      if (!raw) { resolve({ ok: false, reason: '没有可写入的内容' }); return; }
      var want = raw;
      var pickedParts = [];
      closeStrayDropdowns();
      setTimeout(function () {
        /* 触发器三级寻找：有 input 用 input（g-bits 的 ant-cascader-picker）；没有就
           下探到 select 的 selection/selector（拼多多的 ant-select 壳）；再不行点壳本身 */
        var trigger = box.querySelector('input') ||
          box.querySelector('.ant-select-selection,.ant-select-selector,.rocket-select-selector') || box;
        try {
          trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          trigger.click();
        } catch (e) { }
        var started = Date.now();
        var visibleMenus = function () {
          return Array.prototype.slice.call(document.querySelectorAll('.ant-cascader-menu,.rc-cascader-menu')).filter(visible);
        };
        /* 读已选值：拼多多把值放在 .ant-select-selection-selected-value（placeholder 文本还混在
           rendered 里，要剥掉）；g-bits 在 .ant-cascader-picker-label */
        var readLabel = function () {
          var sel = box.querySelector('.ant-select-selection-selected-value');
          var lab = box.querySelector('.ant-cascader-picker-label,[class*="cascader-picker-label"]');
          var got = clean((sel && sel.textContent) || (lab && lab.textContent) || '');
          if (!got) {
            var ren = box.querySelector('.ant-select-selection__rendered');
            if (ren) {
              var ph = ren.querySelector('.ant-select-selection__placeholder');
              var t = ren.textContent || '';
              if (ph) t = t.replace(ph.textContent, '');
              got = clean(t);
            }
          }
          if (!got) got = clean(String(trigger.value || ''));
          return got;
        };
        var verify = function () {
          setTimeout(function () {
            closeStrayDropdowns();
            var got = readLabel();
            if (got && !/^(请选择|请输入)/.test(got)) resolve({ ok: true, before: '', picked: got });
            else resolve({ ok: false, reason: '级联选了「' + trunc(pickedParts.join('/'), 16) + '」但页面没认' });
          }, 450);
        };
        var step = function () {
          var menus = visibleMenus();
          var menu = menus[menus.length - 1];
          if (!menu) {
            /* 菜单消失有两种可能：还没展开，或者已经选完收起了（拼多多叶子项点完即收）。
               已经点过级联项就走验证，别把成功当失败 */
            if (pickedParts.length) { verify(); return; }
            if (Date.now() - started > 1500) { resolve({ ok: false, reason: '级联菜单没展开' }); return; }
            setTimeout(step, 80);
            return;
          }
          if (!want) { verify(); return; }
          var nodes = menu.querySelectorAll('.ant-cascader-menu-item,.rc-cascader-menu-item');
          var texts = optionListToTexts(Array.prototype.slice.call(nodes));
          var hit = OM ? OM.best(texts, 'location', want) : null;
          if (!hit) {
            /* 剥后缀前缀匹配：广东茂名 → 广东省（stripped 广东 是 want 的前缀） */
            var ws = stripAdm(want);
            for (var i = 0; i < texts.length; i++) {
              var ts = stripAdm(clean(texts[i].text));
              if (ts && ws && ts.length >= 2 && ws.indexOf(ts) === 0) { hit = { index: i, text: texts[i].text }; break; }
            }
          }
          if (!hit) {
            /* 本级没有想要的下一级：可能选择已在上一级完成（拼多多住址只到市），
               用已选值验证说话，不急着报错 */
            verify();
            return;
          }
          /* 菜单项只发 click：antd 的级联项挂在 onClick 上，mousedown 反而会触发
             站点「点外部关闭面板」的逻辑，菜单没点到就被收走（gbits/pdd 桩都踩过） */
          try { nodes[hit.index].click(); } catch (e) { }
          pickedParts.push(clean(hit.text));
          var rest = stripAdm(want).slice(stripAdm(clean(hit.text)).length);
          want = rest;
          setTimeout(function () {
            /* 点完一级：菜单长出了下一级就继续；没长（叶子/两级级联）就是选完了 */
            if (visibleMenus().length > menus.length) step();
            else verify();
          }, 350);
        };
        step();
      }, 80);
    });
  }

  /* ---------------- 原生 <select> ----------------
     虽然叫「原生」，行为并不比自定义下拉简单：
     ① 选项一次性渲染完 → 直接选；
     ② 选项是异步加载的（先请求字典再填 options）→ 等一拍再看；
     ③ 「所在地点」这类是省/市/区三个联动 select → 选完一级要等下一级刷新。
     三条都收进同一个函数，一键填写、选区填写、辅助填写共用。 */
  function wait(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function selectTexts(el) {
    return Array.prototype.slice.call(el.options || []).map(function (o) {
      return { text: o.textContent || '', value: o.value };
    });
  }

  function commitSelect(el, idx) {
    var prev = el.value;
    undoStack.push({ el: el, kind: 'select', prev: prev });
    nativeSet(el, el.options[idx].value);
    fire(el, ['input', 'change']);
    return prev;
  }

  /* 同一块表单里、紧跟在 el 后面的下一个 select（级联的下一级） */
  function nextSelect(el) {
    var scope = el.closest('.form-item,.form-group,.ant-form-item,.el-form-item,.field,tr,li,dd,section') || el.parentElement;
    if (scope) {
      var all = Array.prototype.slice.call(scope.querySelectorAll('select'));
      var i = all.indexOf(el);
      if (i >= 0 && all[i + 1]) return all[i + 1];
    }
    var sib = (el.parentElement || el).nextElementSibling;
    for (var d = 0; d < 2 && sib; d++) {
      var s = sib.querySelector && sib.querySelector('select');
      if (s) return s;
      sib = sib.nextElementSibling;
    }
    return null;
  }

  /* 选一个值；没命中就等一拍（选项可能刚被上一级触发加载） */
  function selectOnce(el, fieldId, part) {
    if (!el) return Promise.resolve(null);
    var hit = OM ? OM.best(selectTexts(el), fieldId, part) : null;
    if (hit) { commitSelect(el, hit.index); return Promise.resolve({ el: el, text: hit.text }); }
    return wait(200).then(function () {
      var again = OM ? OM.best(selectTexts(el), fieldId, part) : null;
      if (!again) return null;
      commitSelect(el, again.index);
      return { el: el, text: again.text };
    });
  }

  function writeNativeSelect(item, text) {
    var el = item.el;
    var fieldId = item.field ? item.field.id : '';
    var raw = String(text == null ? '' : text).trim();
    if (!raw) return Promise.resolve({ ok: false, reason: '没有可写入的内容' });

    var parts = OM ? OM.steps(raw) : [raw];

    /* 单值（学历 / 性别 / 证件类型…）：匹配一次就够 */
    if (parts.length < 2) {
      var hit = OM ? OM.best(selectTexts(el), fieldId, raw) : null;
      if (!hit) {
        var li = legacyPick(selectTexts(el), raw, false);
        if (li >= 0) hit = { index: li, text: selectTexts(el)[li].text };
      }
      if (hit) {
        commitSelect(el, hit.index);
        return Promise.resolve({ ok: true, picked: hit.text });
      }
      return Promise.resolve({
        ok: false,
        reason: '下拉里没有「' + trunc(raw, 12) + '」（共 ' + selectTexts(el).length + ' 个选项）'
      });
    }

    /* 多段（广东省湛江市）：省 → 市 → 区 逐级选。
       页面也可能只有一个 select、选项是「广东省-湛江市」合并的，
       那种情况下第一级就整串命中，nextSelect 为空，自然停在那里。 */
    var picked = [];
    var cur = el;
    var chain = Promise.resolve();
    parts.forEach(function (part) {
      chain = chain.then(function () {
        return selectOnce(cur, fieldId, part).then(function (used) {
          if (!used) return null;
          picked.push(used.text);
          /* 选中后下一级会重新渲染，留一拍再找它 */
          return wait(180).then(function () {
            var nxt = nextSelect(used.el);
            if (nxt) cur = nxt;
          });
        });
      });
    });

    return chain.then(function () {
      if (!picked.length) {
        return { ok: false, reason: '下拉里没有「' + trunc(raw, 12) + '」' };
      }
      return {
        ok: true,
        picked: picked.join(' / '),
        partial: picked.length < parts.length
      };
    });
  }

  function dateValue(raw, type) {
    var m = String(raw).match(/(\d{4})\D*(\d{1,2})?\D*(\d{1,2})?/);
    if (!m) return raw;
    var y = m[1], mo = m[2] ? ('0' + m[2]).slice(-2) : '01', d = m[3] ? ('0' + m[3]).slice(-2) : '01';
    if (type === 'year') return y;
    if (type === 'month') return y + '-' + mo;
    if (type === 'date') return y + '-' + mo + '-' + d;
    return raw;
  }

  function writeOne(item, text) {
    var el = item.el;
    var before = currentValue(el);

    if (item.kind === 'radio') {
      var want = S.norm(text);
      var target = null;
      item.group.forEach(function (r) {
        var ot = S.norm(optionText(r));
        if (!target && ot && (ot === want || ot.indexOf(want) >= 0 || want.indexOf(ot) >= 0)) target = r;
      });
      if (!target) return { ok: false, reason: '选项中没有「' + text + '」' };
      undoStack.push({ el: target, kind: 'radio', prev: target.checked });
      target.click();
      fire(target, ['change']);
      return { ok: true, before: '' };
    }

    if (item.kind === 'select') {
      var opt = pickOption(el, text, item.field ? item.field.id : '');
      if (!opt) {
        var n = (el.options || []).length;
        return { ok: false, reason: '下拉里没有「' + trunc(text, 12) + '」（共 ' + n + ' 个选项）' };
      }
      undoStack.push({ el: el, kind: 'select', prev: el.value });
      nativeSet(el, opt.value);
      fire(el, ['input', 'change']);
      return { ok: true, before: before, picked: clean(opt.textContent) };
    }

    if (item.kind === 'file') return { ok: false, reason: '文件框不可脚本赋值' };

    var v = text;
    if (item.type === 'number' || item.type === 'tel' && /[\d\-]/.test(text) && /\s\/\s/.test(text)) {
      var num = String(text).match(/-?\d+(\.\d+)?/);
      if (num) v = num[0];
    }
    if (item.type === 'date' || item.type === 'month' || item.type === 'year') v = dateValue(text, item.type);

    undoStack.push({ el: el, kind: 'value', prev: currentValue(el), rich: item.kind === 'richtext' });
    if (item.kind === 'richtext') {
      safeFocus(el);
      el.textContent = v;
      fire(el, ['input', 'change']);
    } else {
      safeFocus(el);
      nativeSet(el, v);
      fire(el, ['input', 'change']);
      el.dispatchEvent(new Event('blur', { bubbles: false }));
    }

    var after = currentValue(el);
    if (!after) return { ok: false, reason: '写入后被页面清空（可能被前端校验拦截）' };
    return { ok: true, before: before };
  }

  function markFilled(item, on) {
    var el = item.box || item.el;
    if (!el || !el.style) return;
    if (on) {
      if (!el.dataset.opOutline) el.dataset.opOutline = el.style.outline || '-';
      el.style.outline = '2px solid rgba(37,99,235,.55)';
      el.style.outlineOffset = '1px';
    } else if (el.dataset.opOutline) {
      el.style.outline = el.dataset.opOutline === '-' ? '' : el.dataset.opOutline;
      el.style.outlineOffset = '';
      delete el.dataset.opOutline;
    }
  }

  /* ================= 6. 填充主流程 ================= */
  /* 每个字段按 15 秒估算（手工点选 / 复制粘贴的平均耗时），仅作正向反馈，不宣称精确 */
  var SEC_PER_FIELD = 15;
  var lastFill = null;
  var missOpen = false;
  var skipOpen = false;

  function fmtSaved(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    if (!m) return s + ' 秒';
    return s ? m + ' 分 ' + s + ' 秒' : m + ' 分钟';
  }

  /* 结果卡：完成量 + 「因为简历没数据而没填上」的字段 */
  function resultHtml() {
    /* 始终保留容器：撤销 / 重新扫描时只隐藏，不销毁节点 */
    if (!lastFill) return '<div data-result hidden></div>';
    var miss = lastFill.missing || [];
    var skip = lastFill.skipped || [];
    var scope = lastFill.scope || '全部字段';
    var src = lastFill.resume ? '《' + escapeHtml(lastFill.resume) + '》· ' : '';
    return '<div data-result>' +
        '<div class="done"><b data-done-t>' + (lastFill.filled
          ? '填写完成，已写入 ' + lastFill.filled + ' 个字段'
          : '扫描完成，暂无可写入字段') + '</b>' +
          '<span data-done-s>' + (lastFill.filled
            ? '预计为你节约 ' + fmtSaved(lastFill.saved) + '，请检查页面中的填写结果'
            : '页面上还没有能自动填的字段，可先完善简历再试') + '</span>' +
          (lastFill.filled ? '<span class="src">' + src + scope +
            (lastFill.picked && lastFill.picked.length ? ' · 下拉 ' + lastFill.picked.length + ' 项已选中' : '') +
            '</span>' : '') +
        '</div>' +
        '<div class="miss" data-miss-box' + (miss.length ? '' : ' hidden') + '>' +
          '<div class="h"><i>!</i><span data-miss-t>' + (miss.length
            ? '预计有 ' + miss.length + ' 个字段因为【你的简历】无对应数据而未能填入' : '') + '</span></div>' +
          '<div class="row">' +
            '<button class="btn amber" data-miss>查看缺失字段</button>' +
            '<button class="btn green" data-improve>去完善简历</button>' +
          '</div>' +
        '</div>' +
        '<div class="miss" data-skip-box' + (skip.length ? '' : ' hidden') + '>' +
          '<div class="h"><i>!</i><span data-skip-t>' + (skip.length
            ? '有 ' + skip.length + ' 个字段识别了但没写进去，点「查看未写入原因」逐条排查' : '') + '</span></div>' +
          '<div class="row">' +
            '<button class="btn amber" data-skip>查看未写入原因</button>' +
          '</div>' +
        '</div>' +
        '<div class="mlist" data-skip-list' + (skipOpen && skip.length ? '' : ' hidden') + '>' +
          '<p>这些字段识别到了，但写入时被页面拒绝或选项里没有对应值——原因都在下面，可照着手动补。</p>' +
          skip.map(function (r2) {
            var i2 = r2.indexOf('：');
            return '<div>' + escapeHtml(i2 > 0 ? r2.slice(0, i2) : r2) + '<em>' + escapeHtml(i2 > 0 ? r2.slice(i2 + 1) : '写入失败') + '</em></div>';
          }).join('') +
        '</div>' +
        '<div class="mlist" data-miss-list' + (missOpen && miss.length ? '' : ' hidden') + '>' +
          '<p>在「简历填写」补齐后回到本页重新识别，就能一起填上（这些字段都是选填，不影响本次提交）</p>' +
          miss.map(function (f) {
            return '<div>' + escapeHtml(f.label) + '<em>' + escapeHtml(f.why || '简历未填') + '</em></div>';
          }).join('') +
        '</div>' +
      '</div>';
  }

  function missingOf(items) {
    var seen = {}, out = [];
    items.forEach(function (c) {
      if (c.status !== 'empty' || !c.field) return;
      var name = c.field.label || c.label;
      if (seen[name]) return;
      seen[name] = 1;
      out.push({ label: name, why: '简历未填' });
    });
    return out;
  }

  /* 自动网申要「问」的字段：带上可选项，工作台就不用再猜用户能填什么 */
  function asksOf(items) {
    var seen = {}, out = [];
    items.forEach(function (c) {
      if (c.status !== 'empty' || !c.field) return;
      var label = c.field.label || c.label;
      if (seen[label]) return;
      seen[label] = 1;
      var opts = [];
      if (c.kind === 'select' && c.el) {
        try {
          opts = selectTexts(c.el).map(function (o) { return o.text; })
            .filter(function (t) { return t && !/请选择|^--|^—|^全部$/.test(t); })
            .slice(0, 20);
        } catch (e) { /* 读不到选项就当文本框处理 */ }
      }
      out.push({ label: label, required: !!c.sig.required, options: opts });
    });
    /* 必填的排前面，最多问 5 个，避免一次抛十几个问题 */
    out.sort(function (a, b) { return (b.required ? 1 : 0) - (a.required ? 1 : 0); });
    return out.slice(0, 5);
  }

  /* 把一批字段写进页面：mode=empty 时只填空白。
     文本类同步写完；下拉（原生 select 与自定义下拉）要「点开 / 等选项 / 选」，
     所以统一排进异步队列串行执行——两个下拉同时点开会互相把对方的下拉关掉。
     三条填写入口（一键 / 选区 / 辅助）都走这里，行为保持一致。 */
  /* dataUrl → File：档案里存的简历本体转回文件对象，用 DataTransfer 塞进页面 */
  function dataUrlToFile(dataUrl, name) {
    var m = /^data:([^;,]*)?;base64,(.*)$/.exec(String(dataUrl));
    if (!m) return null;
    var bin = atob(m[2]);
    var buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    try { return new File([buf], name || 'resume.pdf', { type: m[1] || 'application/octet-stream' }); }
    catch (e) { return null; }
  }

  function writeResumeFile(item, rec) {
    return new Promise(function (resolve) {
      try {
        var file = dataUrlToFile(rec.dataUrl, rec.name);
        if (!file) { resolve({ ok: false, reason: '附件数据损坏，请重新上传简历' }); return; }
        var dt = new DataTransfer();
        dt.items.add(file);
        undoStack.push({ el: item.el, kind: 'value', prev: '' });
        item.el.files = dt.files;
        fire(item.el, ['change']);
        var ok = item.el.files && item.el.files.length > 0;
        resolve(ok ? { ok: true, picked: rec.name } : { ok: false, reason: '浏览器拒绝了脚本写入文件' });
      } catch (e) {
        resolve({ ok: false, reason: '无法自动上传：' + (e && e.message || e) });
      }
    });
  }

  function applyItems(items, mode) {
    var filled = 0, skipped = [];
    var async = [];

    items.forEach(function (item) {
      if (item.status !== 'ready' && item.status !== 'manual-ok') return;
      if (item.kind === 'selectx' || item.kind === 'select' || item.kind === 'datebox' ||
          item.kind === 'cascader' || (item.kind === 'file' && item.res && item.res.file)) { async.push(item); return; }
      if (mode === 'empty' && hasContent(item)) {
        skipped.push(item.label + '（已有内容）');
        return;
      }
      var r = writeOne(item, item.res.text);
      if (r.ok) {
        filled++;
        markFilled(item, true);
        item.status = 'filled';
        if (r.picked) item.res.picked = r.picked;
      } else {
        skipped.push(item.label + '：' + (r.reason || '写入失败'));
      }
    });

    if (!async.length) return Promise.resolve({ filled: filled, skipped: skipped, partial: [] });

    var partial = [];

    return async.reduce(function (chain, item) {
      return chain.then(function () {
        if (item.kind !== 'file' && mode === 'empty' && hasContent(item)) {
          skipped.push(item.label + '（已有内容）');
          return;
        }
        /* 节点断连（React 重渲染换掉了 DOM）：按字段 id 重新收集找替身，找不到如实跳过 */
        if (item.el && item.el.isConnected === false && item.field && fillCtx.state) {
          var again = analyze(fillCtx.state, fillCtx.resume);
          var twin = again.filter(function (c) {
            return c.field && c.field.id === item.field.id && c.status === 'ready' && c.el && c.el.isConnected;
          })[0];
          if (twin) {
            item.el = twin.el;
            item.box = twin.box;
            if (twin.group) item.group = twin.group;
            item.res = twin.res;
          } else {
            skipped.push(item.label + '（页面重渲染后找不到原来的输入框）');
            return;
          }
        }
        var job;
        if (item.kind === 'selectx') job = writeSelectBox(item, item.res.text);
        else if (item.kind === 'datebox') job = writeDateBox(item, item.res.text);
        else if (item.kind === 'cascader') job = writeCascader(item, item.res.text);
        else if (item.kind === 'file') job = writeResumeFile(item, item.res.file);
        else job = writeNativeSelect(item, item.res.text);
        return job.then(function (r) {
          if (r.ok) {
            filled++;
            markFilled(item, true);
            item.status = 'filled';
            item.res.picked = r.picked || '';
            if (r.partial) partial.push(item.label + '（只选到「' + r.picked + '」）');
          } else {
            skipped.push(item.label + '：' + (r.reason || '写入失败'));
          }
        });
      });
    }, Promise.resolve()).then(function () {
      return { filled: filled, skipped: skipped, partial: partial };
    });
  }

  function finishFill(items, scope, resume, skipped) {
    switchAt = 0;                       /* 已经开填了，绿条不必再占地方 */
    var missing = missingOf(items);
    var skipList = skipped || [];
    var picked = items.filter(function (c) { return c.kind === 'select' || c.kind === 'selectx' || c.kind === 'cascader' || c.kind === 'datebox'; })
      .filter(function (c) { return c.status === 'filled' && c.res && c.res.picked; })
      .map(function (c) { return { label: c.field ? c.field.label : c.label, value: c.res.picked }; });
    lastFill = {
      filled: items.filter(function (c) { return c.status === 'filled'; }).length,
      skipped: skipList,
      saved: Math.round((items.filter(function (c) { return c.status === 'filled'; }).length + missing.length) * SEC_PER_FIELD),
      missing: missing,
      picked: picked,
      resume: resume ? resume.name : '',
      scope: scope,
      at: Date.now()
    };
    refreshReport(items);
    /* 自动网申队列靠这条消息判断「填完了」以及「还缺什么」 */
    try {
      chrome.runtime.sendMessage({
        type: 'OP_FILL_DONE',
        filled: lastFill.filled,
        total: items.filter(function (c) { return c.status !== 'dup'; }).length,
        missing: asksOf(items),
        report: report,
        answered: answerRound
      });
    } catch (e) { /* 扩展已重载 */ }
    answerRound = false;
    renderPanel();
    try { chrome.runtime.sendMessage({ type: 'OP_MATCH_INFO', match: matchInfo() }); } catch (e) { }
    return lastFill;
  }

  function fill(mode, silent) {
    if (busy) return Promise.resolve(report);
    busy = true;
    var keep = { x: window.scrollX || 0, y: window.scrollY || 0 };
    return readState(true).then(function (state) {
      var resume = currentResume(state);
      fillCtx = { state: state, resume: resume };
      var expanded = expandSections();
      if (expanded && isTop && !silent) toast('已展开 ' + expanded + ' 个分节；填完后请逐节检查并点各节的「保存」', 'ok');
      var pre = expanded ? wait(900) : Promise.resolve();
      return pre.then(function () {
      var items = analyze(state, resume);
      return applyItems(items, mode).then(function (r) {
        /* 二次扫描：有的字段是前面写完才显示出来的——拼多多「证件号码」跟着「证件类型」
           出、部分站点的教育经历跟着「最高学历」出。首轮写完重新收集，把新露面的补上。 */
        var items2 = analyze(state, resume);
        var seen = items.map(function (p) { return p.el; });
        var fresh = items2.filter(function (c) { return c.status === 'ready' && seen.indexOf(c.el) < 0; });
        var fin = function (rr, list) {
          var res = finishFill(list, mode === 'all' ? '覆盖全部字段' : '全部空白字段', resume, r.skipped);
          busy = false;
          try { window.scrollTo(keep.x, keep.y); } catch (e) { }
          if (isTop && !silent) {
            if (rr.filled || res.missing.length) showResult(rr.filled, rr.skipped.length);
            if (!rr.filled && res.missing.length) toast('页面上这些字段档案里没有，属于选填，可留空', 'warn');
            if (!rr.filled && !res.missing.length && rr.skipped.length) toast('没有可写入的字段：' + rr.skipped[0], 'warn');
          }
          return report;
        };
        if (!fresh.length) return fin(r, items);
        return applyItems(fresh, mode).then(function (r2) {
          r.filled += r2.filled;
          r.skipped = r.skipped.concat(r2.skipped);
          r.partial = (r.partial || []).concat(r2.partial);
          /* 清单用「第一轮 + 二轮新增」合并：第一轮对象带着 filled 状态，
             不能拿重新 analyze 出来的替身（它们都是 ready，会把计数清零） */
          return fin(r, items.concat(fresh));
        });
      });
      });
    }).catch(function (e) {
      busy = false;
      if (isTop && !silent) toast('填充出错：' + e.message, 'warn');
      return report;
    });
  }

  /* ---------------- 选区填写 ---------------- */
  function intersects(el, r) {
    if (!el || !el.getBoundingClientRect) return false;
    var b;
    try { b = el.getBoundingClientRect(); } catch (e) { return false; }
    if (!b) return false;
    return b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom;
  }

  function fillRegion(rect) {
    if (busy) return Promise.resolve(report);
    busy = true;
    return readState(true).then(function (state) {
      var resume = currentResume(state);
      fillCtx = { state: state, resume: resume };
      var items = analyze(state, resume).filter(function (c) { return intersects(c.box || c.el, rect); });
      if (!items.length) {
        busy = false;
        if (isTop) toast('框选区域里没有识别到可填字段，换个范围试试', 'warn');
        return report;
      }
      return applyItems(items, 'empty').then(function (r) {
        finishFill(items, '框选区域（' + items.length + ' 个字段）', resume, r.skipped);
        busy = false;
        if (isTop) {
          toast(r.filled
            ? '框选区域写入 ' + r.filled + ' 个字段'
            : '框选区域里的字段都已经有内容了', r.filled ? 'ok' : 'warn');
          showResult(r.filled, r.skipped.length);
        }
        return report;
      });
    }).catch(function (e) {
      busy = false;
      if (isTop) toast('选区填写出错：' + e.message, 'warn');
      return report;
    });
  }

  /* 工作台补充的字段答案：直接写进页面，成功后按「一轮填写」收尾。
     自动网申里「档案没有 → 问用户 → 继续填」这条链路就靠它闭环。 */
  function normLabel(s) {
    return String(s == null ? '' : s)
      .replace(/[\s\u00a0*＊:：()（）\[\]【】、,，.。?？]/g, '')
      .toLowerCase();
  }

  function applyAnswers(answers) {
    if (busy) return Promise.resolve(report);
    if (!answers || !answers.length) return Promise.resolve(report);
    busy = true;
    return readState(true).then(function (state) {
      var resume = currentResume(state);
      fillCtx = { state: state, resume: resume };
      var items = analyze(state, resume);
      var map = {};
      answers.forEach(function (a) {
        if (!a || a.label == null) return;
        map[normLabel(a.label)] = a.value;
      });
      var hits = [];
      items.forEach(function (c) {
        var label = c.field ? c.field.label : c.label;
        var v = map[normLabel(label)];
        if (v == null || v === '') return;
        c.status = 'ready';
        c.res = { ok: true, text: String(v), from: '你的补充' };
        hits.push(c);
      });
      if (!hits.length) { busy = false; return report; }
      return applyItems(hits, 'all').then(function (r) {
        answerRound = true;
        finishFill(items, '补充 ' + hits.length + ' 项信息', resume, r.skipped);
        busy = false;
        if (isTop) toast(r.filled ? '已回填 ' + r.filled + ' 项补充信息' : '补充信息没写进去，请手动确认', r.filled ? 'ok' : 'warn');
        return report;
      });
    }).catch(function () {
      busy = false;
      return report;
    });
  }

  function startPick() {
    if (!isTop) return;
    var u = ensureUI();
    var layer = u.wrap.querySelector('[data-pick]');
    var box = u.wrap.querySelector('[data-pick-box]');
    if (!layer || !box) { toast('这个页面暂时无法框选，请用「一键填写」', 'warn'); return; }
    togglePanel(false);
    view = 'home';
    pickActive = true;
    pickStart = null;
    bubbleHidden = true;               /* 只有这一个场景允许隐藏 */
    u.data.bubble.style.display = 'none';
    box.hidden = true;
    box.style.cssText = '';
    layer.hidden = false;
  }

  function stopPick() {
    pickActive = false;
    pickStart = null;
    bubbleHidden = false;              /* 退出选区一定要把球放回来 */
    if (!ui) return;
    if (ui.data.bubble) { ui.data.bubble.style.display = ''; ui.data.bubble.hidden = false; }
    var layer = ui.wrap.querySelector('[data-pick]');
    var box = ui.wrap.querySelector('[data-pick-box]');
    if (layer) layer.hidden = true;
    if (box) box.hidden = true;
  }

  function bindPick() {
    var u = ensureUI();
    var layer = u.wrap.querySelector('[data-pick]');
    var box = u.wrap.querySelector('[data-pick-box]');
    if (!layer || !box) return;

    layer.addEventListener('pointerdown', function (e) {
      if (!pickActive) return;
      e.preventDefault();
      pickStart = { x: e.clientX, y: e.clientY };
      box.hidden = false;
      box.style.left = pickStart.x + 'px';
      box.style.top = pickStart.y + 'px';
      box.style.width = '0px';
      box.style.height = '0px';
    });
    layer.addEventListener('pointermove', function (e) {
      if (!pickActive || !pickStart) return;
      var x = Math.min(pickStart.x, e.clientX);
      var y = Math.min(pickStart.y, e.clientY);
      box.style.left = x + 'px';
      box.style.top = y + 'px';
      box.style.width = Math.abs(e.clientX - pickStart.x) + 'px';
      box.style.height = Math.abs(e.clientY - pickStart.y) + 'px';
    });
    layer.addEventListener('pointercancel', function () { if (pickActive) { stopPick(); toast('已退出选区填写', 'warn'); } });
    layer.addEventListener('pointerup', function (e) {
      if (!pickActive || !pickStart) return;
      var left = Math.min(pickStart.x, e.clientX);
      var top = Math.min(pickStart.y, e.clientY);
      var rect = { left: left, top: top, right: left + Math.abs(e.clientX - pickStart.x), bottom: top + Math.abs(e.clientY - pickStart.y) };
      stopPick();
      if (rect.right - rect.left < 16 || rect.bottom - rect.top < 16) {
        toast('框选范围太小，已取消', 'warn');
        return;
      }
      fillRegion(rect);
    });
  }

  /* ---------------- 辅助填写（本地草稿） ---------------- */
  function suggest(c, state, resume) {
    var p = (state && state.profile) || {};
    var b = p.basic || {};
    var skills = p.skills || {};
    var label = (c.field ? c.field.label : '') + ' ' + (c.label || '');
    var exps = (p.experiences || []);
    var first = function (type) {
      return exps.filter(function (e) { return e.type === type; })[0] || null;
    };
    var block = function (e) {
      if (!e) return '';
      var head = [e.org, e.role].filter(Boolean).join('｜');
      var body = [e.desc, e.duties, e.results].filter(Boolean).join('\n');
      return [head, body].filter(Boolean).join('\n');
    };

    if (/自我介绍|自我评价|个人优势|自荐|个人简介/.test(label)) return (resume && resume.summary) || b.selfEval || '';
    if (/项目/.test(label)) return block(first('project')) || ((resume && resume.summary) || '');
    if (/实习|工作经历|实践经历/.test(label)) return block(first('intern'));
    if (/校园|社团|学生工作/.test(label)) return block(first('campus'));
    if (/技能|专长|技术栈/.test(label)) return (skills.tech || []).join('、');
    if (/语言|英语|外语/.test(label)) return (skills.langs || []).join('；');
    if (/证书|资格|奖项|获奖|荣誉/.test(label)) return (skills.certs || []).join('；');
    if (/城市|地点|意向地|工作地/.test(label)) return b.targetCity || '';
    if (/岗位|职位|意向/.test(label)) return (resume && resume.target) || b.targetRole || '';
    if (/民族/.test(label)) return b.nation || '';
    if (/政治/.test(label)) return b.political || '';
    if (/籍贯|生源|户籍/.test(label)) return b.hometown || b.sourceArea || '';
    if (/微信/.test(label)) return b.wechat || '';
    if (/现居|地址|住址/.test(label)) return b.address || '';
    if (/毕业院校|学校/.test(label)) return b.school || '';
    if (/专业/.test(label)) return ((p.educations || [])[0] || {}).major || '';
    return '';
  }

  function buildAssist(state) {
    var resume = currentResume(state);
    var items = analyze(state, resume);
    var SKIP_ASSIST = /验证码|校验码|短信码|图形码|密码|重新输入/;
    assistRows = items.filter(function (c) {
      if (c.status !== 'empty' && c.status !== 'unknown') return false;
      return !SKIP_ASSIST.test(c.field ? c.field.label : c.label);
    }).slice(0, 24).map(function (c) {
      return {
        item: c,
        label: c.field ? c.field.label : (c.label || '未命名字段'),
        raw: c.label,
        hint: c.status === 'unknown' ? '没有认出这是哪个字段，可参照简历手填' : '档案里还没有这项',
        value: suggest(c, state, resume)
      };
    });
    view = 'assist';
    togglePanel(true);
    renderPanel();
    if (!assistRows.length) toast('当前页面没有需要辅助的字段', 'ok');
  }

  function applyAssist(pickIndex) {
    if (!ui) return;
    var bd = ui.wrap.querySelector('.bd');
    var jobs = [];
    assistRows.forEach(function (row, i) {
      if (pickIndex != null && i !== pickIndex) return;
      var input = bd.querySelector('[data-assist-input="' + i + '"]');
      var val = input ? String(input.value || '').trim() : '';
      if (val) jobs.push({ row: row, val: val });
    });
    if (!jobs.length) { toast('先填一条草稿再点填入', 'warn'); return; }

    var written = 0, failed = 0;
    jobs.reduce(function (chain, j) {
      return chain.then(function () {
        var item = j.row.item;
        var done = function (r) {
          if (r.ok) { written++; item.status = 'filled'; markFilled(item, true); }
          else failed++;
        };
        if (item.kind === 'selectx') return writeSelectBox(item, j.val).then(done);
        if (item.kind === 'select') return writeNativeSelect(item, j.val).then(done);
        if (item.kind === 'datebox') return writeDateBox(item, j.val).then(done);
        if (item.kind === 'cascader') return writeCascader(item, j.val).then(done);
        done(writeOne(item, j.val));
      });
    }, Promise.resolve()).then(function () {
      if (!written) {
        toast(failed ? '写入失败，可能是下拉选项里没有对应值' : '先填一条草稿再点填入', 'warn');
        return;
      }
      toast('已通过辅助填写写入 ' + written + ' 个字段', 'ok');
      view = 'home';
      renderPanel();
      refreshReport();
    });
  }

  function undo() {
    var n = 0;
    while (undoStack.length) {
      var rec = undoStack.pop();
      try {
        if (rec.kind === 'radio') rec.el.checked = rec.prev;
        else nativeSet(rec.el, rec.prev);
        fire(rec.el, ['input', 'change']);
        rec.el.style.outline = '';
        delete rec.el.dataset.opOutline;
        n++;
      } catch (e) { /* ignore */ }
    }
    lastFill = null;
    missOpen = false;
    refreshReport();
    renderPanel();
    if (isTop) toast(n ? '已撤销 ' + n + ' 处填充' : '没有可撤销的操作', n ? 'ok' : 'warn');
    return n;
  }

  function matchInfo() {
    if (!match) return null;
    return {
      host: location.hostname,
      company: match.job && match.job.company,
      role: match.job && match.job.role,
      resumeId: match.best && match.best.resume ? match.best.resume.id : '',
      resumeName: match.best && match.best.resume ? match.best.resume.name : '',
      score: match.best ? match.best.score : null,
      level: match.best ? match.best.level : '',
      manual: !!(match.best && match.best.manual),
      at: Date.now()
    };
  }

  function clearMarks() {
    document.querySelectorAll('[data-op-outline]').forEach(function (el) {
      el.style.outline = el.dataset.opOutline === '-' ? '' : el.dataset.opOutline;
      el.style.outlineOffset = '';
      delete el.dataset.opOutline;
    });
  }

  /* ================= 7. 浮层（Shadow DOM） ================= */
  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}',
    '.bubble{pointer-events:auto;position:fixed;right:18px;bottom:18px;display:flex;align-items:center;gap:8px;height:38px;padding:0 14px 0 11px;border-radius:999px;background:linear-gradient(135deg,#2563eb,#4f46e5);color:#fff;font-size:13px;line-height:1;cursor:pointer;box-shadow:0 8px 24px rgba(37,99,235,.4);border:0;user-select:none;transition:transform .15s}',
    '.bubble:hover{transform:translateY(-1px)}',
    '.bubble.dim{opacity:.8}',
    '.bubble.dragging{cursor:grabbing;transform:none;transition:none}',
    '.bubble .dot{width:7px;height:7px;border-radius:50%;background:#6ee7b7;box-shadow:0 0 0 3px rgba(110,231,183,.25)}',
    '.bubble b{font-weight:600}',
    '.bubble .num{color:#dbeafe;font-size:11px}',
    '.panel{pointer-events:auto;position:fixed;right:18px;bottom:66px;width:322px;max-height:min(680px,calc(100vh - 90px));display:flex;flex-direction:column;background:#fff;color:#1a2230;border-radius:16px;box-shadow:0 20px 60px rgba(15,23,42,.26),0 0 0 1px rgba(15,23,42,.06);overflow:hidden;font-size:13px}',
    '.panel.wide{width:560px}',
    '.hd{display:flex;align-items:center;gap:7px;padding:9px 10px;border-bottom:1px solid #e6ecfb;background:linear-gradient(120deg,#eef3ff,#f3f0ff);flex:0 0 auto}',
    '.logo{width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#2563eb,#6366f1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex:0 0 auto}',
    '.hd .t{flex:1;min-width:0}',
    '.hd .t strong{display:block;font-size:12.5px;font-weight:650;letter-spacing:-.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.hd .t span{display:block;font-size:10.5px;color:#7b8798;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.modes{display:flex;background:#e8eefc;border-radius:7px;padding:2px;flex:0 0 auto}',
    '.mode{border:0;background:transparent;font-size:10px;color:#5b6b86;padding:3px 6px;border-radius:5px;cursor:pointer;font-family:inherit;white-space:nowrap}',
    '.mode.on{background:#fff;color:#2563eb;font-weight:650;box-shadow:0 1px 2px rgba(15,23,42,.1)}',
    '.x{width:22px;height:22px;border:0;background:transparent;color:#8b96a6;font-size:15px;line-height:1;cursor:pointer;border-radius:5px;flex:0 0 auto}',
    '.x:hover{background:#e4eaf8;color:#3d4a5c}',
    '.bd{padding:11px;overflow:auto;flex:1 1 auto}',
    '.stat{display:flex;align-items:baseline;gap:6px;margin-bottom:8px}',
    '.stat b{font-size:19px;font-weight:650;letter-spacing:-.4px}',
    '.stat em{font-style:normal;font-size:11px;color:#7b8798}',
    '.stat .sp{margin-left:auto;font-size:10.5px;color:#b7791f}',
    '.meter{height:6px;border-radius:99px;background:#eef1f7;overflow:hidden;margin-bottom:10px}',
    '.meter i{display:block;height:100%;background:linear-gradient(90deg,#3b82f6,#22c55e);border-radius:99px;transition:width .5s}',
    '.btn{width:100%;height:32px;border-radius:9px;border:1px solid #dfe5ee;background:#fff;color:#2b3648;font-size:12px;font-weight:550;cursor:pointer;transition:.15s;font-family:inherit}',
    '.btn:hover{border-color:#c3ccd9;background:#f9fafc}',
    '.btn:disabled{opacity:.5;cursor:not-allowed}',
    '.btn.big{height:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;border-radius:10px;font-size:13px;font-weight:650;margin-bottom:8px}',
    '.btn.big small{font-size:10px;font-weight:400;opacity:.8;margin-top:1px}',
    '.btn.pri{background:linear-gradient(180deg,#3b74ea,#2354d6);border-color:#2354d6;color:#fff;box-shadow:0 6px 14px -8px rgba(37,99,235,.9)}',
    '.btn.pri:hover{filter:brightness(1.06);background:linear-gradient(180deg,#3b74ea,#2354d6)}',
    '.btn.line{background:#f5f9ff;border:1px solid #bcd4fb;color:#1d4ed8}',
    '.btn.line small{color:#7f93b3}',
    '.btn.line:hover{background:#eaf2ff}',
    '.btn.assist{width:100%;height:36px;border:1px dashed #c9d8f3;background:#fbfdff;border-radius:9px;color:#334155;font-size:12px;margin-bottom:2px;display:flex;align-items:center;justify-content:center;gap:4px}',
    '.btn.assist:hover{border-color:#a9c3ee;background:#f3f8ff}',
    '.btn.assist i{font-style:normal;font-size:9px;background:#eef4ff;color:#2563eb;border-radius:3px;padding:0 4px}',
    '.btn.assist span{font-size:10.5px;color:#8b96a6}',
    '.grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}',
    '.tile{display:flex;align-items:center;gap:5px;padding:9px 8px;border:1px solid #e8eef7;border-radius:9px;background:#fff;font-size:11.5px;color:#334155;cursor:pointer;font-family:inherit;text-align:left;transition:.14s}',
    '.tile:hover{border-color:#c9d8f3;background:#f9fbff;color:#2563eb}',
    '.sec{margin-top:12px}',
    '.sec h5{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:600;color:#7b8798;letter-spacing:.4px;margin-bottom:6px}',
    '.sec h5 .hint{margin-left:auto;font-weight:400;color:#a8b3c2;letter-spacing:0}',
    '.f{display:flex;gap:7px;align-items:center;padding:4px 0;border-bottom:1px dashed #f0f3f8;font-size:11.5px}',
    '.f:last-child{border-bottom:0}',
    '.f i{flex:0 0 auto;width:13px;height:13px;border-radius:50%;font-style:normal;font-size:8px;line-height:13px;text-align:center;font-weight:700}',
    '.f i.ok{background:#e7f7ef;color:#0e9f6e}',
    '.f i.no{background:#fdf3e2;color:#b7791f}',
    '.f i.man{background:#eef1f7;color:#7b8798}',
    '.f .k{flex:1;min-width:0;color:#3d4a5c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.f .v{flex:0 0 auto;font-size:10.5px;color:#93a0b0}',
    '.warn{margin-top:9px;padding:8px 10px;border-radius:9px;background:#fff8ec;border:1px solid #f6e3c4;color:#8a5a10;font-size:11px;line-height:1.5}',
    '.warn b{font-weight:650}',
    '.ft{display:flex;align-items:center;gap:6px;padding:9px 12px;border-top:1px solid #eef1f7;background:#fbfcfe;font-size:11.5px;color:#64748b;cursor:pointer;flex:0 0 auto}',
    '.ft:hover{color:#2563eb}',
    '.ft .arr{margin-left:auto;color:#94a3b8}',
    '.note{font-size:10.5px;color:#93a0b0;line-height:1.5;margin-top:8px}',
    '.note.warnline{color:#b7791f;background:#fffaf0;border:1px solid #f6e2b8;border-radius:8px;padding:7px 9px;margin:0 0 8px}',
    '.row2{display:flex;gap:7px;margin-top:8px}',

    /* 岗位 / 简历匹配条 */
    '.match{border:1px solid #e3ecfb;background:linear-gradient(135deg,#f7faff,#f4f7ff);border-radius:11px;padding:8px 9px;margin-bottom:9px}',
    '.m-top{display:flex;align-items:center;gap:5px}',
    '.m-ico{width:15px;height:15px;border-radius:5px;background:#e6efff;color:#2563eb;font-size:9px;line-height:15px;text-align:center;flex:0 0 auto}',
    '.m-job{flex:1;min-width:0;font-size:11.5px;color:#25344b;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.m-swap{border:0;background:transparent;color:#2563eb;font-size:10.5px;cursor:pointer;padding:0 2px;font-family:inherit;flex:0 0 auto}',
    '.m-res{display:flex;align-items:center;gap:6px;width:100%;margin-top:5px;padding:5px 6px;border:1px solid #dfe9fa;background:#fff;border-radius:8px;cursor:pointer;font-family:inherit;text-align:left}',
    '.m-res:hover{border-color:#bcd4fb}',
    '.m-res .rn{flex:1;min-width:0;font-size:11.5px;color:#1d4ed8;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.m-res .rs{flex:0 0 auto;font-size:10px;color:#0e9f6e;background:#e9f8f1;border-radius:999px;padding:1px 6px}',
    '.m-res .rs.low{color:#b7791f;background:#fdf3e2}',
    '.m-res .go{color:#9aa7b8;font-size:12px;flex:0 0 auto}',
    '.m-warn{margin-top:5px;font-size:10px;color:#8a5a10;line-height:1.5}',
    '.m-warn.soft{color:#93a0b0}',

    /* 简历导航 */
    '.rrow{display:flex;align-items:center;gap:3px;border-bottom:1px dashed #f0f3f8}',
    '.rrow:last-child{border-bottom:0}',
    '.rrow.on .rname{background:#f5f9ff}',
    '.rname{display:flex;align-items:center;gap:6px;flex:1;min-width:0;border:0;background:transparent;padding:6px 4px;cursor:pointer;font-family:inherit;text-align:left;border-radius:7px}',
    '.rname:hover{background:#f5f9ff}',
    '.rdot{width:5px;height:5px;border-radius:50%;background:#cbd5e1;flex:0 0 auto}',
    '.rrow.on .rdot{background:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.14)}',
    '.rt{flex:1;min-width:0}',
    '.rt b{display:block;font-size:11.5px;font-weight:600;color:#25344b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.rt em{display:block;font-style:normal;font-size:10px;color:#93a0b0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.rsc{flex:0 0 auto;font-size:10px;color:#0e9f6e;background:#e9f8f1;border-radius:999px;padding:1px 5px}',
    '.rsc.low{color:#b7791f;background:#fdf3e2}',
    '.rcp{flex:0 0 auto;font-size:11px;color:#b6c0cd}',
    '.rmore{flex:0 0 auto;width:20px;height:24px;border:0;background:transparent;color:#b6c0cd;font-size:13px;cursor:pointer}',
    '.rmore:hover{color:#2563eb}',
    /* 当前简历选择器（在投递网页就地切换） */
    '.rsel{display:flex;align-items:center;gap:6px;width:100%;margin-top:6px;padding:6px 8px;border:1px solid #e3e9f3;border-radius:8px;background:#fff;cursor:pointer;font-family:inherit;text-align:left}',
    '.rsel:hover{border-color:#9dbcf5;background:#f9fbff}',
    '.rsel .k{flex:0 0 auto;font-size:9.5px;color:#a8b3c2}',
    '.rsel b{flex:1 1 auto;min-width:0;font-size:11.5px;font-weight:600;color:#25344b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.rsel .sc{flex:0 0 auto;font-size:9.5px;color:#0e9f6e;background:#e9f8f1;border-radius:999px;padding:1px 5px}',
    '.rsel .cv{flex:0 0 auto;font-size:9.5px;color:#7b8ca3}',
    '.rlist{margin-top:5px;max-height:150px;overflow:auto;border:1px solid #eef1f7;border-radius:9px;background:#fcfdff}',
    '.rli{display:flex;align-items:center;gap:6px;width:100%;padding:6px 8px;border:0;border-bottom:1px dashed #f1f4f9;background:transparent;font-family:inherit;text-align:left;cursor:pointer}',
    '.rli:last-child{border-bottom:0}',
    '.rli:hover{background:#f4f8ff}',
    '.rli.on{background:#eaf2ff}',
    '.rli .rn{flex:1 1 auto;min-width:0;font-size:11px;font-weight:600;color:#25344b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.rli .s{flex:0 0 auto;font-size:9.5px;color:#0e9f6e}',
    '.rli .s.low{color:#b7791f}',
    '.rli .t{flex:0 0 auto;font-size:9.5px;color:#a8b3c2}',
    '.rli.on .t{color:#2563eb}',

    /* 切换成功的绿条 */
    '.swtip{margin-top:7px;padding:7px 8px;border:1px solid #c8eddc;border-radius:9px;background:#e9f8f1;display:flex;align-items:center;gap:6px}',
    '.swtip i{flex:0 0 auto;width:14px;height:14px;border-radius:50%;background:#0ea06e;color:#fff;font-style:normal;font-size:9px;line-height:14px;text-align:center}',
    '.swtip span{flex:1 1 auto;font-size:10.5px;line-height:1.45;color:#0b7a55}',
    '.swtip .swgo{flex:0 0 auto;border:1px solid #0ea06e;background:#0ea06e;color:#fff;font-size:10px;padding:3px 8px;border-radius:6px;cursor:pointer;font-family:inherit}',
    '.swtip .swgo:hover{filter:brightness(1.05)}',

    /* 没有档案时的引导卡 */
    '.empty-card{display:flex;flex-direction:column;gap:6px;margin-bottom:9px;padding:10px;border:1px dashed #d8e2f0;border-radius:11px;background:#fbfcff}',
    '.empty-card b{font-size:11.5px;color:#25344b}',
    '.empty-card span{font-size:10.5px;line-height:1.55;color:#7b8ca3}',
    '.empty-card .btn{height:28px;font-size:11px;margin-top:2px}',


    /* 填写完成后的结果卡 */
    '.done{margin-bottom:9px;padding:9px 10px;border-radius:10px;background:linear-gradient(135deg,#0ea06e,#12b981);color:#fff;box-shadow:0 6px 14px -10px rgba(14,159,110,.9)}',
    '.done b{display:block;font-size:12.5px;font-weight:650;margin-bottom:2px}',
    '.done span{display:block;font-size:11px;line-height:1.5;opacity:.94}',
    '.done span.src{font-size:10px;opacity:.78;margin-top:2px}',
    '.miss{margin-bottom:9px;padding:9px 10px;border-radius:10px;background:#fff8ec;border:1px solid #f6dfb8}',
    '.miss .h{display:flex;gap:6px;font-size:11.5px;color:#8a5a10;line-height:1.5}',
    '.miss .h i{flex:0 0 auto;width:14px;height:14px;border-radius:50%;background:#f0a01a;color:#fff;font-style:normal;font-size:9px;line-height:14px;text-align:center;font-weight:700;margin-top:1px}',
    '.miss .row{display:flex;gap:6px;margin-top:8px}',
    '.miss .row .btn{height:29px;font-size:11.5px}',
    '.btn.amber{background:#fdf1da;border-color:#f0d5a0;color:#8a5a10}',
    '.btn.amber:hover{background:#fbe6c0}',
    '.btn.green{background:linear-gradient(180deg,#14bd86,#0ea06e);border-color:#0e9f6e;color:#fff}',
    '.btn.green:hover{filter:brightness(1.05);background:linear-gradient(180deg,#14bd86,#0ea06e)}',
    '.mlist{margin-bottom:9px;max-height:152px;overflow:auto;border:1px solid #eef1f7;border-radius:9px;padding:5px 9px;background:#fcfdff}',
    '.mlist p{font-size:10px;color:#93a0b0;line-height:1.5;margin:3px 0 5px}',
    '.mlist div{display:flex;gap:6px;font-size:11px;color:#41506a;padding:3px 0;border-bottom:1px dashed #f1f4f9}',
    '.mlist div:last-child{border-bottom:0}',
    '.mlist em{font-style:normal;font-size:10px;color:#a8b3c2;margin-left:auto;flex:0 0 auto}',

    /* 简历闪填 */
    '.fhd{display:flex;align-items:center;gap:6px;padding:9px 10px;border-bottom:1px solid #eef1f7;background:#fbfcff;flex:0 0 auto}',
    '.fhd .back{width:22px;height:22px;border:0;background:#eef2fa;border-radius:6px;color:#4b5a70;font-size:13px;line-height:1;cursor:pointer;flex:0 0 auto}',
    '.fhd strong{font-size:12.5px;font-weight:650;color:#1f2c40}',
    '.fhd .fcount{font-size:10px;color:#93a0b0}',
    '.fhd .fcopy{margin-left:auto;border:1px solid #cfe0fd;background:#fff;color:#2563eb;font-size:10.5px;padding:4px 8px;border-radius:6px;cursor:pointer;font-family:inherit}',
    '.fhd .fcopy:hover{background:#f4f8ff}',
    '.fbody{display:grid;grid-template-columns:106px 1fr;gap:0;min-height:0;overflow:hidden;flex:1 1 auto}',
    '.fnav{border-right:1px solid #eef1f7;background:#fcfdff;padding:8px 6px;overflow:auto}',
    '.fnav h6{font-size:9px;color:#a8b3c2;letter-spacing:.6px;padding:0 6px 6px}',
    '.fnav-i{display:flex;align-items:center;gap:4px;width:100%;border:0;background:transparent;padding:6px;border-radius:6px;font-size:11px;color:#4b5a70;cursor:pointer;font-family:inherit;text-align:left}',
    '.fnav-i em{margin-left:auto;font-style:normal;font-size:9px;color:#a8b3c2}',
    '.fnav-i:hover{background:#f1f5fd;color:#2563eb}',
    '.fnav-i.on{background:#e8f0ff;color:#1d4ed8;font-weight:600}',
    '.fmain{padding:8px 10px;overflow:auto}',
    '.fsearch{width:100%;height:27px;border:1px solid #e3e9f3;border-radius:7px;padding:0 8px;font-size:11px;color:#334155;outline:none;font-family:inherit;background:#fbfcfe}',
    '.fsearch:focus{border-color:#9dbcf5;background:#fff}',
    '.fver{display:flex;gap:4px;flex-wrap:wrap;margin:7px 0 2px}',
    '.fver button{border:1px solid #e3e9f3;background:#fff;color:#5b6b86;font-size:10px;padding:3px 7px;border-radius:999px;cursor:pointer;font-family:inherit}',
    '.fver button:hover{border-color:#bcd4fb;color:#2563eb}',
    '.fver button.on{background:#e8f0ff;border-color:#9dbcf5;color:#1d4ed8;font-weight:600}',
    '.fsec{margin-top:11px}',
    '.fsec h5{display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;color:#3d4a5c;margin-bottom:6px}',
    '.fsec h5 em{margin-left:auto;font-style:normal;font-size:9px;color:#a8b3c2;background:#f1f4f9;border-radius:999px;padding:1px 6px}',
    '.chips{display:flex;flex-wrap:wrap;gap:5px}',
    '.chip{border:1px solid #e3e9f3;background:#f9fbff;color:#3d4a5c;font-size:10.5px;padding:4px 8px;border-radius:7px;cursor:pointer;font-family:inherit;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.chip:hover{border-color:#9dbcf5;background:#eef5ff;color:#1d4ed8}',
    '.fempty{font-size:10.5px;color:#a8b3c2;padding:10px 0}',

    /* 辅助填写 */
    '.anote{font-size:10.5px;color:#93a0b0;line-height:1.6;padding:9px 10px 0}',
    '.alist{padding:2px 10px 4px}',
    '.arow{padding:8px 0;border-bottom:1px dashed #eef1f7}',
    '.arow:last-child{border-bottom:0}',
    '.al{display:flex;align-items:baseline;gap:6px;margin-bottom:4px}',
    '.al b{font-size:11.5px;color:#25344b;font-weight:600}',
    '.al em{font-style:normal;font-size:9.5px;color:#a8b3c2}',
    '.as-input{width:100%;border:1px solid #e3e9f3;border-radius:7px;padding:5px 7px;font-size:11px;color:#334155;font-family:inherit;line-height:1.5;resize:vertical;min-height:34px;outline:none;background:#fbfcfe}',
    '.as-input:focus{border-color:#9dbcf5;background:#fff}',
    '.abtn{margin-top:5px;border:1px solid #cfe0fd;background:#fff;color:#2563eb;font-size:10.5px;padding:3px 9px;border-radius:6px;cursor:pointer;font-family:inherit}',
    '.abtn:hover{background:#f1f7ff}',
    '.afoot{display:flex;gap:7px;padding:9px 10px;border-top:1px solid #eef1f7;background:#fbfcfe;flex:0 0 auto}',

    /* 选区 */
    '.pick{pointer-events:auto;position:fixed;inset:0;z-index:2147483646;cursor:crosshair;background:rgba(37,99,235,.05);box-shadow:inset 0 0 0 2px rgba(37,99,235,.35)}',
    '.pick-hint{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1d2433;color:#fff;font-size:12px;line-height:1;padding:9px 15px;border-radius:999px;box-shadow:0 8px 24px rgba(15,23,42,.28);white-space:nowrap}',
    '.pick-box{position:fixed;border:1.5px solid #2563eb;background:rgba(37,99,235,.12);border-radius:6px;pointer-events:none;box-shadow:0 0 0 9999px rgba(15,23,42,.22)}',

    '.toast{position:fixed;right:18px;bottom:66px;max-width:300px;padding:11px 14px;border-radius:11px;background:#1d2433;color:#fff;font-size:12.5px;line-height:1.5;box-shadow:0 12px 30px rgba(15,23,42,.3);opacity:0;transform:translateY(6px);transition:.22s;pointer-events:none;z-index:2147483647}',
    '.toast.on{opacity:1;transform:none}',
    '.toast.warn{background:#7c2d12}',
    '[hidden]{display:none !important}',
    '@media (max-width:640px){.panel{right:10px;left:10px;width:auto;bottom:60px}.panel.wide{width:auto;left:10px}.fbody{grid-template-columns:88px 1fr}}'
  ].join('');

  function buildUI() {
    var host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'position:fixed;inset:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    document.documentElement.appendChild(host);
    var root = host.attachShadow({ mode: 'open' });

    try {
      var sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
    } catch (e) {
      var st = document.createElement('style');
      st.textContent = CSS;
      root.appendChild(st);
    }

    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<button class="bubble" part="b"><span class="dot"></span><b>智能助手</b><span class="num" data-num>—</span></button>' +
      '<div class="panel" hidden>' +
        '<div class="hd">' +
          '<div class="logo">简</div>' +
          '<div class="t"><strong data-hd-t>智能助手</strong><span data-host>正在识别页面…</span></div>' +
          '<div class="modes">' +
            '<button class="mode on" data-mode="simple">简单模式</button>' +
            '<button class="mode" data-mode="standard">标准模式</button>' +
          '</div>' +
          '<button class="x" data-close>×</button>' +
        '</div>' +
        '<div class="bd" data-bd></div>' +
        '<div class="ft" data-open="#/copilot">⚡ 求职神器<span class="arr">›</span></div>' +
      '</div>' +
      '<div class="pick" data-pick hidden><div class="pick-hint">拖住鼠标框选要填写的区域　·　按 Esc 取消</div><div class="pick-box" data-pick-box hidden></div></div>' +
      '<div class="toast" data-toast></div>';
    root.appendChild(wrap);
    return { host: host, root: root, wrap: wrap, hidden: true, data: {} };
  }

  function ensureUI() {
    if (ui) return ui;
    ui = buildUI();
    ui.data = {
      bubble: ui.wrap.querySelector('.bubble'),
      panel: ui.wrap.querySelector('.panel'),
      num: ui.wrap.querySelector('[data-num]'),
      toast: ui.wrap.querySelector('[data-toast]')
    };

    try {
      chrome.storage.local.get(POS_KEY, function (obj) {
        var p = obj && obj[POS_KEY];
        if (p && typeof p.left === 'number' && typeof p.top === 'number') {
          bubblePos = p;
          applyBubblePos();
        }
      });
    } catch (e) { }
    bindDrag();

    ui.wrap.addEventListener('click', onClick);
    ui.wrap.addEventListener('input', function (e) {
      var search = e.target.closest && e.target.closest('[data-search]');
      if (!search) return;
      flashQuery = search.value;
      var groups = ui.wrap.querySelector('[data-fgroups]');
      if (groups) groups.innerHTML = flashGroupsHtml();
    });
    bindPick();
    try {
      if (window.ResizeObserver) {
        new ResizeObserver(function () { placePanel(); }).observe(ui.data.panel);
      }
    } catch (e) { }
    return ui;
  }

  /* ---------------- 常驻：悬浮球不许自己消失 ---------------- */
  /* 球挂在 documentElement 上，页面 SPA 重渲染、换路由、被框架挪走都要能自己回来 */
  function mountUI() {
    var u = ensureUI();
    try {
      if (!u.host.isConnected || u.host.parentNode !== document.documentElement) {
        document.documentElement.appendChild(u.host);
      }
    } catch (e) { }
    return u;
  }

  function applyBubblePos() {
    if (!ui || !bubblePos) return;
    var b = ui.data.bubble;
    if (!b) return;
    var w = b.offsetWidth || 110, h = b.offsetHeight || 38;
    var left = Math.min(Math.max(6, bubblePos.left), Math.max(6, window.innerWidth - w - 6));
    var top = Math.min(Math.max(6, bubblePos.top), Math.max(6, window.innerHeight - h - 6));
    b.style.left = left + 'px';
    b.style.top = top + 'px';
    b.style.right = 'auto';
    b.style.bottom = 'auto';
  }

  function saveBubblePos() {
    if (!bubblePos) return;
    try { chrome.storage.local.set({ 'offerpilot.bubble.v1': bubblePos }); } catch (e) { }
  }

  /* 面板跟着球走：球拖到别处时，面板贴在上方（放不下就压高度或翻到下方），
     但绝不盖住球——球要一直看得见。 */
  function placePanel() {
    if (!ui || !ui.data.panel || ui.data.panel.hidden) return;
    var p = ui.data.panel, b = ui.data.bubble;
    if (!bubblePos) {
      p.style.left = ''; p.style.top = ''; p.style.right = ''; p.style.bottom = '';
      p.style.maxHeight = '';
      return;
    }
    var vw = window.innerWidth, vh = window.innerHeight;
    var br = b.getBoundingClientRect();
    var rect = p.getBoundingClientRect();
    var w = rect.width || 322;
    var above = Math.max(160, Math.floor(br.top - 16));
    var below = Math.max(160, Math.floor(vh - br.bottom - 16));
    var useAbove = above >= Math.min(rect.height || 360, 420) || above >= below;
    var maxH = Math.min(useAbove ? above : below, vh - 16);
    p.style.maxHeight = maxH + 'px';
    var h = Math.min(rect.height || 360, maxH);
    var left = Math.min(Math.max(8, br.right - w), Math.max(8, vw - w - 8));
    var top = useAbove ? (br.top - h - 8) : (br.bottom + 8);
    if (top < 8) top = 8;
    if (top + h > vh - 8) top = Math.max(8, vh - h - 8);
    p.style.right = 'auto';
    p.style.bottom = 'auto';
    p.style.left = left + 'px';
    p.style.top = top + 'px';
  }

  function bindDrag() {
    var b = ui.data.bubble;
    var drag = null;
    b.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      var r = b.getBoundingClientRect();
      drag = { x: e.clientX, y: e.clientY, ox: r.left, oy: r.top, moved: false, left: r.left, top: r.top };
      dragMoved = false;
      try { b.setPointerCapture(e.pointerId); } catch (err) { }
    });
    b.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (!drag.moved) { drag.moved = true; b.classList.add('dragging'); }
      var w = b.offsetWidth || 110, h = b.offsetHeight || 38;
      drag.left = Math.min(Math.max(6, drag.ox + dx), Math.max(6, window.innerWidth - w - 6));
      drag.top = Math.min(Math.max(6, drag.oy + dy), Math.max(6, window.innerHeight - h - 6));
      b.style.left = drag.left + 'px';
      b.style.top = drag.top + 'px';
      b.style.right = 'auto';
      b.style.bottom = 'auto';
    });
    function end() {
      if (!drag) return;
      if (drag.moved) {
        dragMoved = true;                 /* 拖完别顺手把面板打开 */
        bubblePos = { left: drag.left, top: drag.top };
        saveBubblePos();
        placePanel();
      }
      b.classList.remove('dragging');
      drag = null;
    }
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);
    b.addEventListener('lostpointercapture', end);
  }

  /* 每 1.2s 校准一次：节点还在、没被隐藏、没被页面样式干掉 */
  function keepBubble() {
    if (!isTop) return;
    var u = mountUI();
    if (pickActive) return;
    bubbleHidden = false;
    var b = u.data.bubble;
    if (!b) return;
    if (b.style.display === 'none') b.style.display = '';
    if (b.hidden) b.hidden = false;
    var cs = null;
    try { cs = window.getComputedStyle(b); } catch (e) { }
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) {
      b.style.setProperty('display', 'flex', 'important');
      b.style.setProperty('visibility', 'visible', 'important');
    }
    if (bubblePos) applyBubblePos();
  }

  /* ---------------- 面板内容 ---------------- */
  function esc(s) { return escapeHtml(s); }

  function resumeRowsHtml() {
    var list = (cache.state && cache.state.resumes) || [];
    if (!list.length) {
      return '<div class="note">还没有简历版本。点下面「编辑简历」先建一份，或上传 PDF 自动生成。</div>';
    }
    var bestId = match && match.best && match.best.resume ? match.best.resume.id : '';
    var scoreMap = {};
    (match && match.list || []).forEach(function (x) { scoreMap[x.resume.id] = x; });

    return list.map(function (r) {
      var hit = scoreMap[r.id] || {};
      var score = hit.score;
      var low = score != null && score < 58;
      return '<div class="rrow ' + (r.id === bestId ? 'on' : '') + '" data-rid="' + escapeAttr(r.id) + '">' +
          '<button class="rname" data-copy-resume="' + escapeAttr(r.id) + '" title="点击复制这份简历的全部内容">' +
            '<span class="rdot"></span>' +
            '<span class="rt"><b>' + esc(r.name) + '</b><em>' + esc(r.target || '未设置目标岗位') + '</em></span>' +
            (score != null ? '<span class="rsc' + (low ? ' low' : '') + '">' + score + '%</span>' : '') +
            '<span class="rcp">⧉</span>' +
          '</button>' +
          '<button class="rmore" data-flash="' + escapeAttr(r.id) + '" title="查看这份简历的字段">›</button>' +
        '</div>';
    }).join('');
  }

  /* 当前简历：点开就地切换，切完立刻能填（对齐参考产品的「选择当前简历」） */
  function resumePickHtml() {
    var list = (cache.state && cache.state.resumes) || [];
    if (!list.length) return '';
    var cur = (match && match.best && match.best.resume) || currentResume(cache.state);
    var scoreMap = {};
    (match && match.list || []).forEach(function (x) { scoreMap[x.resume.id] = x; });
    var hitCur = cur ? scoreMap[cur.id] : null;
    var rows = list.map(function (r) {
      var hit = scoreMap[r.id] || {};
      var on = cur && r.id === cur.id;
      return '<button class="rli' + (on ? ' on' : '') + '" data-resume-use="' + escapeAttr(r.id) + '">' +
          '<span class="rn">' + esc(r.name) + '</span>' +
          (hit.score != null ? '<span class="s' + (hit.score < 58 ? ' low' : '') + '">' + hit.score + '%</span>' : '') +
          '<span class="t">' + (on ? '当前使用' : esc(r.target || '未设目标岗位')) + '</span>' +
        '</button>';
    }).join('');
    return '<button class="rsel" data-pick-open title="切换本次填写使用的简历版本">' +
        '<span class="k">当前简历</span><b>' + esc(cur ? cur.name : '还没有简历') + '</b>' +
        (hitCur && hitCur.score != null ? '<span class="sc">' + hitCur.score + '%</span>' : '') +
        '<span class="cv">' + (pickOpen ? '收起 ▴' : '切换 ▾') + '</span>' +
      '</button>' +
      (pickOpen ? '<div class="rlist">' + rows + '</div>' : '');
  }

  function switchTipHtml() {
    if (!switchAt || Date.now() - switchAt > 8000) return '';
    return '<div class="swtip"><i>✓</i><span>已切换成功，当前网页会立即使用这份简历</span>' +
      '<button class="swgo" data-fill="empty">立即填写</button></div>';
  }

  function homeHtml() {
    var s = matchSummary();
    var hasResume = !!((cache.state && cache.state.resumes) || []).length;
    var uns = (report && report.fields || []).filter(function (f) {
      if (f.status !== 'empty' && f.status !== 'unknown') return false;
      return !/验证码|校验码|短信码|图形码|密码/.test(f.label);
    }).length;
    var low = match && match.best && match.best.score != null && match.best.score < 58;
    var warnCls = match && (match.unanswered || low) ? 'm-warn' : 'm-warn soft';

    return resultHtml() +
      (report && !report.total ?
        '<div class="empty-card"><b>这个页面没有识别到网申表单</b>' +
          '<span>如果表单嵌在页面里的框架中，先在该区域点一下再「重新识别」；普通网页上球会一直留着，不影响你浏览。</span>' +
          '<button class="btn pri" data-rescan>重新识别</button></div>' : '') +
      (hasResume ? '' :
        '<div class="empty-card"><b>还没读到你的简历档案</b>' +
          '<span>在招聘页填表需要先有一份简历，可以去简历库建一份，或上传 PDF 自动生成。</span>' +
          '<button class="btn pri" data-open="#/resumes">打开简历库</button></div>') +
      '<div class="match">' +
        '<div class="m-top"><span class="m-ico">岗</span>' +
          '<span class="m-job" title="' + escapeAttr(s.job) + '">' + esc(s.job) + '</span>' +
          '<button class="m-swap" data-pick-open>' + (pickOpen ? '收起' : '换一份') + '</button>' +
        '</div>' +
        resumePickHtml() +
        (s.warn ? '<div class="' + warnCls + '">' + esc(s.warn) + '</div>' : '') +
        switchTipHtml() +
      '</div>' +
      (report && report.ready === 0 && report.total > 0 ?
        '<div class="note warnline">这 ' + report.total + ' 个字段没读到字段名（Moka / 北森这类站点常见），自动填写会跳过它们，先手动填写更稳妥。</div>' : '') +
      '<button class="btn big pri" data-fill="empty">一键填写<small>按岗位匹配简历，填满所有可识别字段</small></button>' +
      '<button class="btn big line" data-pick-start>选区填写<small>拖拽框选区域，只填这一块</small></button>' +
      '<button class="btn assist" data-assist>✦ 辅助填写<i>AI</i><span>补上自动填不了的 ' + uns + ' 项</span></button>' +
      '<div class="grid">' +
        '<button class="tile" data-record>＋ 记录职位</button>' +
        '<button class="tile" data-open="#/pipeline">▤ 管理投递</button>' +
        '<button class="tile" data-open="#/profile">✎ 编辑简历</button>' +
        '<button class="tile" data-pick-open">⟳ 切换简历</button>' +
      '</div>' +
      '<div class="sec"><h5>简历导航<span class="hint">点名字复制全文</span></h5>' +
        resumeRowsHtml() +
      '</div>' +
      '<div data-standard' + (uiMode === 'standard' ? '' : ' hidden') + '>' +
        '<div class="sec"><h5>识别明细<span class="hint">' + (report ? report.ready + ' / ' + report.total : '—') + '</span></h5>' +
          '<div class="stat"><b data-pct>' + (report ? report.percent : 0) + '%</b>' +
            '<em data-cnt>识别 ' + (report ? report.ready : 0) + ' / ' + (report ? report.total : 0) + ' 个字段</em></div>' +
          '<div class="meter"><i data-bar style="width:' + (report ? report.percent : 0) + '%"></i></div>' +
          '<div data-list>' + (report ? report.fields.slice(0, 40).map(fieldRow).join('') : '') + '</div>' +
          '<div data-warn>' + (report && report.missingRequired.length
            ? '<div class="warn"><b>' + report.missingRequired.length + ' 个字段档案里还没有</b><br>' +
              escapeHtml(report.missingRequired.slice(0, 5).join('、')) + '，可留空或手动填写</div>'
            : '') + '</div>' +
          '<div class="note">文件类字段与紧急联系人受浏览器安全策略限制，需手动填写；本工具不会自动点击提交。</div>' +
          '<div class="row2"><button class="btn" data-fill="all">覆盖全部</button>' +
            '<button class="btn" data-rescan>重新识别</button></div>' +
          '<button class="btn" style="margin-top:7px" data-undo>撤销填写</button>' +
        '</div>' +
      '</div>';
  }

  function fieldRow(f) {
    var cls = f.status === 'ready' || f.status === 'filled' ? 'ok' : (f.status === 'manual' ? 'man' : 'no');
    var mark = cls === 'ok' ? '✓' : cls === 'man' ? '手' : '!';
    var v = f.status === 'ready' || f.status === 'filled' ? (f.preview || '已就绪')
      : f.status === 'manual' ? '需手动'
        : f.status === 'unknown' ? '未识别' : '档案缺此项';
    return '<div class="f"><i class="' + cls + '">' + mark + '</i>' +
      '<span class="k" title="' + escapeAttr(f.label) + '">' + escapeHtml(f.label) + '</span>' +
      '<span class="v">' + escapeHtml(v) + '</span></div>';
  }

  function flashResume() {
    var list = (cache.state && cache.state.resumes) || [];
    return list.filter(function (r) { return r.id === flashResumeId; })[0]
      || (match && match.best && match.best.resume)
      || list.filter(function (r) { return r.isDefault; })[0]
      || list[0] || null;
  }

  function flashSections() {
    var r = flashResume();
    if (!r || !RM || !cache.state) return [];
    return RM.sections(cache.state, r);
  }

  function flashGroupsHtml() {
    var secs = flashSections();
    var q = String(flashQuery || '').trim().toLowerCase();
    var out = secs.map(function (sec) {
      var fields = sec.fields.filter(function (f) {
        if (!q) return true;
        return (f.label + ' ' + f.value).toLowerCase().indexOf(q) >= 0;
      });
      if (!fields.length) return '';
      return '<section class="fsec" data-sec="' + sec.key + '"><h5>' + esc(sec.name) +
        '<em>' + fields.length + '</em></h5><div class="chips">' +
        fields.map(function (f, i) {
          return '<button class="chip" data-copy-field="' + sec.key + '|' + sec.fields.indexOf(f) + '" title="点击复制：' +
            escapeAttr(String(f.value).slice(0, 120)) + '">' + esc(f.label) + '</button>';
        }).join('') +
        '</div></section>';
    }).join('');
    return out || '<div class="fempty">没有匹配「' + esc(flashQuery) + '」的字段</div>';
  }

  function flashHtml() {
    var list = (cache.state && cache.state.resumes) || [];
    var r = flashResume();
    var secs = flashSections();
    var total = secs.reduce(function (n, s) { return n + s.count; }, 0);
    return '<div class="fhd">' +
        '<button class="back" data-back>‹</button>' +
        '<span class="fcount">共 ' + total + ' 项字段</span>' +
        '<button class="fcopy" data-copy-all>复制全部</button>' +
      '</div>' +
      '<div class="fbody">' +
        '<div class="fnav"><h6>导航</h6>' +
          secs.map(function (s) {
            return '<button class="fnav-i" data-jump="' + s.key + '">' + esc(s.name) + '<em>' + s.count + '</em></button>';
          }).join('') +
        '</div>' +
        '<div class="fmain">' +
          '<input class="fsearch" data-search value="' + escapeAttr(flashQuery) + '" placeholder="搜索字段" />' +
          '<div class="fver">' + list.map(function (x) {
            return '<button data-use="' + escapeAttr(x.id) + '" class="' + (r && x.id === r.id ? 'on' : '') + '" title="本次填写改用这个版本">' +
              esc(x.name.replace(/^简历\s*[·]\s*/, '')) + '</button>';
          }).join('') + '</div>' +
          '<div data-fgroups>' + flashGroupsHtml() + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="afoot"><span class="note" style="margin:0;flex:1">点任意字段复制该字段内容；点上方版本名切换本次填写使用的简历。</span></div>';
  }

  function assistHtml() {
    if (!assistRows.length) {
      return '<div class="fhd"><button class="back" data-back>‹</button><span class="fcount">0 项待补</span></div>' +
        '<div class="fempty" style="padding:18px 14px">当前页面没有需要补齐的字段，可以直接「一键填写」。</div>';
    }
    return '<div class="fhd">' +
        '<button class="back" data-back>‹</button>' +
        '<span class="fcount">' + assistRows.length + ' 项待补</span>' +
      '</div>' +
      '<p class="anote">自动匹配不了的字段，这里按你的档案生成草稿。可以改，确认后再写入；写入后仍建议逐项复核。</p>' +
      '<div class="alist">' +
        assistRows.map(function (row, i) {
          return '<div class="arow">' +
            '<div class="al"><b>' + esc(row.label) + '</b><em>' + esc(row.hint) + '</em></div>' +
            '<textarea class="as-input" data-assist-input="' + i + '" rows="2" placeholder="' +
              escapeAttr(row.raw || '在这里补一条') + '">' + esc(row.value) + '</textarea>' +
            '<button class="abtn" data-assist-one="' + i + '">填入这项</button>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<div class="afoot"><button class="btn" data-back>取消</button>' +
        '<button class="btn pri" data-assist-all>全部填入</button></div>';
  }

  function renderPanel() {
    if (!ui) return;
    var u = ui;
    var panel = u.wrap.querySelector('.panel');
    var bd = u.wrap.querySelector('[data-bd]');
    if (!panel || !bd) return;

    if (cache.state) ensureMatch(cache.state);
    var s = matchSummary();
    var title = view === 'flash' ? '简历闪填' : view === 'assist' ? '辅助填写' : '智能助手';
    var sub = view === 'flash' ? (flashResume() ? flashResume().name : '还没有简历版本')
      : view === 'assist' ? '按档案生成草稿，确认后写入'
        : s.job + (s.score ? '　·　匹配 ' + s.score : '');

    panel.className = 'panel' + (view === 'flash' ? ' wide' : '');
    panel.hidden = u.hidden;
    u.wrap.querySelector('[data-hd-t]').textContent = title;
    u.wrap.querySelector('[data-host]').textContent = sub;
    bd.innerHTML = view === 'flash' ? flashHtml() : view === 'assist' ? assistHtml() : homeHtml();
    placePanel();
    requestAnimationFrame(function () { placePanel(); });
  }

  function onClick(e) {
    var t = e.target.closest && e.target.closest(
      '[data-fill],[data-undo],[data-rescan],[data-close],[data-open],[data-mode],[data-record],' +
      '[data-miss],[data-improve],[data-pick-start],[data-assist],[data-assist-one],[data-assist-all],' +
      '[data-back],[data-copy-resume],[data-copy-all],[data-copy-field],[data-flash],[data-use],[data-swap],[data-jump],' +
      '[data-pick-open],[data-resume-use],.bubble'
    );
    if (!t) return;
    if (t.classList.contains('bubble')) {
      if (dragMoved) { dragMoved = false; return; }   /* 刚才是拖动，不是点击 */
      return togglePanel();
    }
    if (t.hasAttribute('data-close')) return togglePanel(false);
    if (t.hasAttribute('data-mode')) return setMode(t.getAttribute('data-mode'));
    if (t.hasAttribute('data-back')) { view = 'home'; renderPanel(); return; }
    if (t.hasAttribute('data-undo')) { undo(); return; }
    if (t.hasAttribute('data-record')) { recordJob(); return; }
    if (t.hasAttribute('data-improve')) { openApp('#/profile'); return; }
    if (t.hasAttribute('data-miss')) {
      missOpen = !missOpen;
      var list = ui.wrap.querySelector('[data-miss-list]');
      if (list) list.hidden = !missOpen;
      t.textContent = missOpen ? '收起缺失字段' : '查看缺失字段';
      return;
    }
    if (t.hasAttribute('data-skip')) {
      skipOpen = !skipOpen;
      var slist = ui.wrap.querySelector('[data-skip-list]');
      if (slist) slist.hidden = !skipOpen;
      t.textContent = skipOpen ? '收起未写入原因' : '查看未写入原因';
      return;
    }
    if (t.hasAttribute('data-rescan')) { refreshReport(); renderPanel(); toast('已重新识别 ' + (report ? report.ready : 0) + ' 个可填字段', 'ok'); return; }
    if (t.hasAttribute('data-pick-start')) { startPick(); return; }

    if (t.hasAttribute('data-copy-resume')) {
      var rid = t.getAttribute('data-copy-resume');
      var list = (cache.state && cache.state.resumes) || [];
      var r = list.filter(function (x) { return x.id === rid; })[0];
      if (!r) return;
      pickedResumeId = rid;
      applyPick();
      renderPanel();
      if (RM && cache.state) copyAndToast(RM.fullText(cache.state, r), r.name);
      return;
    }
    if (t.hasAttribute('data-copy-all')) {
      var fr = flashResume();
      if (!fr) { toast('还没有简历版本', 'warn'); return; }
      copyAndToast(RM ? RM.fullText(cache.state, fr) : '', fr.name);
      return;
    }
    if (t.hasAttribute('data-copy-field')) {
      var pair = String(t.getAttribute('data-copy-field')).split('|');
      var sec = flashSections().filter(function (x) { return x.key === pair[0]; })[0];
      var f = sec && sec.fields[Number(pair[1])];
      if (f) copyAndToast(f.value, f.label);
      return;
    }
    if (t.hasAttribute('data-flash')) {
      flashResumeId = t.getAttribute('data-flash') || '';
      view = 'flash';
      flashQuery = '';
      togglePanel(true);
      renderPanel();
      return;
    }
    if (t.hasAttribute('data-use')) {
      pickedResumeId = t.getAttribute('data-use');
      flashResumeId = pickedResumeId;
      applyPick();
      renderPanel();
      var used = match && match.best && match.best.resume;
      toast('本次填写改用「' + (used ? used.name : '所选版本') + '」', 'ok');
      return;
    }
    if (t.hasAttribute('data-pick-open')) {
      view = 'home';
      pickOpen = !pickOpen;
      if (ui.hidden) togglePanel(true); else renderPanel();
      return;
    }
    if (t.hasAttribute('data-resume-use')) {
      var pickId = t.getAttribute('data-resume-use');
      pickOpen = false;
      view = 'home';
      if (pickId === pickedResumeId) { renderPanel(); return; }
      pickedResumeId = pickId;
      try { chrome.storage.local.set({ 'offerpilot.pick.v1': pickId }); } catch (e) { }
      match = null;
      ensureMatch(cache.state);              /* 重新打分，并应用这次手动选择 */
      switchAt = Date.now();
      var usedR = match && match.best && match.best.resume;
      if (cache.state) refreshReport(analyze(cache.state, usedR));
      renderPanel();
      toast('已切换成功，当前网页会立即使用《' + (usedR ? usedR.name : '所选版本') + '》', 'ok');
      clearTimeout(switchTimer);
      switchTimer = setTimeout(function () { if (view === 'home') renderPanel(); }, 8200);
      return;
    }
    if (t.hasAttribute('data-swap')) {
      view = 'flash';
      flashQuery = '';
      togglePanel(true);
      renderPanel();
      return;
    }
    if (t.hasAttribute('data-jump')) {
      var id = t.getAttribute('data-jump');
      var target = ui.wrap.querySelector('.fsec[data-sec="' + id + '"]');
      if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      Array.prototype.forEach.call(ui.wrap.querySelectorAll('.fnav-i'), function (b) {
        b.classList.toggle('on', b === t);
      });
      return;
    }
    if (t.hasAttribute('data-assist')) {
      readState(true).then(function (st) { buildAssist(st); });
      return;
    }
    if (t.hasAttribute('data-assist-one')) { applyAssist(Number(t.getAttribute('data-assist-one'))); return; }
    if (t.hasAttribute('data-assist-all')) { applyAssist(null); return; }
    if (t.hasAttribute('data-open')) { openApp(t.getAttribute('data-open')); return; }

    var mode = t.getAttribute('data-fill');
    toast('正在写入…');
    fill(mode);
  }

  /* 简单模式：只保留主要动作；标准模式：额外显示识别统计与覆盖写入 */
  function setMode(m) {
    var u = ensureUI();
    uiMode = m === 'standard' ? 'standard' : 'simple';
    Array.prototype.forEach.call(u.wrap.querySelectorAll('.mode'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === uiMode);
    });
    renderPanel();
  }

  function openApp(hash) {
    try { chrome.runtime.sendMessage({ type: 'OP_OPEN_APP', hash: hash || '#/dashboard' }); } catch (e) { }
  }

  /* 记录职位：抓当前页面标题与域名，交给工作台生成待投递记录 */
  function recordJob() {
    var title = (document.title || '').replace(/\s+/g, ' ').trim();
    var job = detectJob();
    var company = (job.company || title.split(/[-_|｜—·]/)[0].trim() || location.hostname.replace(/^www\./, ''));
    var role = job.role || '';
    var m = title.match(/(招聘|校招|社会招聘|网申|职位)[^\s]{0,20}/);
    if (!role && m) role = m[0];
    try {
      chrome.runtime.sendMessage({
        type: 'OP_RECORD_JOB',
        job: {
          company: company.slice(0, 40),
          role: (role || title).slice(0, 40),
          url: location.href,
          host: location.hostname,
          title: title.slice(0, 120)
        }
      }, function (res) {
        if (chrome.runtime.lastError || !res || !res.ok) {
          toast('记录失败，请打开工作台手动添加', 'warn');
          return;
        }
        toast(res.dup ? '这个岗位已经在待投递里了' : '已记录职位，可在「管理投递」中跟进', 'ok');
      });
    } catch (e) {
      toast('记录失败，请打开工作台手动添加', 'warn');
    }
  }

  function togglePanel(force) {
    var u = mountUI();
    var show = force === undefined ? u.data.panel.hidden : !!force;
    u.data.panel.hidden = !show;
    u.hidden = !show;
    if (!show) return;
    renderPanel();                       /* 先把已有数据画出来，避免空面板/加载态 */
    requestAnimationFrame(placePanel);
    if (!cache.state) {
      readState(true).then(function (st) {
        ensureMatch(st);
        refreshReport(analyze(st));
        renderPanel();
      });
    } else {
      refreshReport();
      renderPanel();
    }
  }

  /* 角标：有表单显示「可填/总数」，没表单也照样常驻，只是写明「无表单」 */
  function updateBubbleState() {
    if (!ui) return;
    var b = ui.data.bubble, num = ui.data.num;
    if (!b || !num) return;
    if (report && report.total) {
      num.textContent = report.ready + '/' + report.total;
      b.classList.toggle('dim', report.ready === 0);
      b.title = '识别到 ' + report.total + ' 个字段，' + report.ready + ' 个可填';
    } else if (report) {
      num.textContent = '无表单';
      b.classList.remove('dim');
      b.title = '当前页面没有识别到网申表单';
    } else {
      num.textContent = '—';
      b.title = 'OfferPilot 智能助手';
    }
  }

  function renderUI() {
    if (!report) return;
    mountUI();
    updateBubbleState();
    if (view === 'home') renderPanel();
  }

  function trunc(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  var toastTimer = null;
  function toast(msg, kind) {
    var u = ensureUI();
    var t = u.data.toast;
    t.textContent = msg;
    t.className = 'toast on' + (kind === 'warn' ? ' warn' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 2600);
  }

  function showResult(filled, skipped) {
    toast('已填写 ' + filled + ' 个字段' + (skipped ? '，' + skipped + ' 项跳过' : ''), 'ok');
    togglePanel(true);
  }

  /* ================= 8. 消息通道 ================= */
  function openView(v) {
    if (v === 'pick') { startPick(); return; }
    if (v === 'assist') { readState(true).then(function (st) { buildAssist(st); }); return; }
    view = 'flash';
    flashQuery = '';
    togglePanel(true);
    renderPanel();
  }

  function handle(msg) {
    switch (msg.type) {
      case 'OP_PING':
        return Promise.resolve({ ok: true, url: location.href, host: location.hostname, report: report, match: matchInfo() });
      case 'OP_SCAN':
        return readState(true).then(function (st) {
          ensureMatch(st);
          return refreshReport(analyze(st));
        });
      case 'OP_FILL':
        return fill(msg.mode || 'empty', !!msg.silent);
      case 'OP_ANSWERS':
        return applyAnswers(msg.answers || []);
      case 'OP_FILL_REGION':
        if (msg.rect) return fillRegion(msg.rect);
        startPick();
        return Promise.resolve({ ok: true, picking: true });
      case 'OP_PANEL':
        openView(msg.view || 'flash');
        return Promise.resolve({ ok: true });
      case 'OP_UNDO':
        undo();
        return Promise.resolve(report);
      case 'OP_TOGGLE':
        if (isTop) togglePanel(true);
        return Promise.resolve({ ok: true });
      case 'OP_MARKS_CLEAR':
        clearMarks();
        return Promise.resolve({ ok: true });
      default:
        return null;
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (!msg || typeof msg.type !== 'string' || msg.type.indexOf('OP_') !== 0) return;
      if (msg.type === 'OP_REPORT' || msg.type === 'OP_MATCH_INFO') return;
      var p = handle(msg);
      if (!p) return;
      if (p.then) {
        p.then(function (r) { try { sendResponse(r); } catch (e) { } });
        return true;
      }
      sendResponse(p);
    });
  }

  /* ================= 9. 启动：静默识别一次，供徽标与弹窗使用 ================= */
  function boot() {
    /* 悬浮球是常驻入口：先挂上去，识别结果异步补到角标里。
       以前这里要求「页面有 ≥3 个可填字段」才建 UI，于是字段没匹配上的页面（如 Moka 的
       akr.jobs.feishu.cn）整块浮层都不存在，球自然就「消失」了。 */
    if (isTop) mountUI();
    readState(false).then(function (st) {
      ensureMatch(st);
      var items = analyze(st);
      refreshReport(items);
      if (!isTop) return;
      mountUI();
      updateBubbleState();
      if (ui && !ui.data.panel.hidden) renderPanel();
    });
  }

  /* 常驻守护：节点被页面删了/挪了/被隐藏，1.2s 内自己回来 */
  function startKeepAlive() {
    keepBubble();
    clearInterval(keepTimer);
    keepTimer = setInterval(keepBubble, 1200);
    ['pageshow', 'focus', 'hashchange', 'popstate'].forEach(function (t) {
      window.addEventListener(t, function () { keepBubble(); }, true);
    });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) keepBubble(); });
    window.addEventListener('resize', function () { applyBubblePos(); placePanel(); });
    try {
      new MutationObserver(function () {
        if (!ui || !ui.host.isConnected) keepBubble();
      }).observe(document.documentElement, { childList: true });
    } catch (e) { }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (pickActive) { stopPick(); toast('已退出选区填写', 'warn'); return; }
    if (!ui || ui.hidden) return;
    if (view !== 'home') { view = 'home'; renderPanel(); return; }
    togglePanel(false);
  });

  startKeepAlive();          /* 先进场：球立刻在，识别随后补 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 单页应用路由切换后重新识别（防抖）
  var mo = null, moTimer = null;
  try {
    mo = new MutationObserver(function () {
      clearTimeout(moTimer);
      moTimer = setTimeout(function () {
        if (!document.body) return;
        readState(false).then(function (st) { refreshReport(analyze(st)); });
      }, 1200);
    });
    document.addEventListener('DOMContentLoaded', function () {
      if (document.body) mo.observe(document.body, { childList: true, subtree: true });
    });
    if (document.body) mo.observe(document.body, { childList: true, subtree: true });
  } catch (e) { }
})();
