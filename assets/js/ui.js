/* =========================================================
   UI 基础能力：图标 / 提示 / 弹窗 / 格式化
   ========================================================= */
(function (global) {
  'use strict';

  var ICONS = {
    grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
    user: '<path d="M20 21v-1.8a4.2 4.2 0 0 0-4.2-4.2H8.2A4.2 4.2 0 0 0 4 19.2V21"/><circle cx="12" cy="7.5" r="4"/>',
    file: '<path d="M14 2.5H6.5A2 2 0 0 0 4.5 4.5v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5"/>',
    edit: '<path d="M12 20h9"/><path d="M16.6 3.6a2.1 2.1 0 0 1 3 3L7.5 18.7 3.5 20l1.3-4z"/>',
    kanban: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18"/><path d="M15 3v11"/>',
    sparkles: '<path d="M12 3.2l1.85 4.45L18.3 9.5l-4.45 1.85L12 15.8l-1.85-4.45L5.7 9.5l4.45-1.85z"/><path d="M18.6 15.4l.75 1.85 1.85.75-1.85.75-.75 1.85-.75-1.85L16 17.9l1.85-.75z"/>',
    check: '<path d="M20 6.5 9.2 17.3l-5.2-5.2"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8.4 12.2l2.4 2.4 4.8-4.8"/>',
    alert: '<path d="M10.3 3.9 2.6 17.2A1.9 1.9 0 0 0 4.3 20h15.4a1.9 1.9 0 0 0 1.7-2.8L13.7 3.9a1.9 1.9 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 16.6h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.8h.01"/>',
    x: '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5 16.8 16.8"/>',
    bell: '<path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8-2.5 8h17s-2.5-1.5-2.5-8"/><path d="M13.7 20.5a2 2 0 0 1-3.4 0"/>',
    upload: '<path d="M20.5 15.5v3.4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-3.4"/><path d="M16.5 8 12 3.5 7.5 8"/><path d="M12 3.5v12"/>',
    download: '<path d="M20.5 15.5v3.4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-3.4"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M12 15V3"/>',
    trash: '<path d="M3.5 6h17"/><path d="M8.5 6V4.2A1.2 1.2 0 0 1 9.7 3h4.6a1.2 1.2 0 0 1 1.2 1.2V6"/><path d="M18.5 6l-.9 13.1a2 2 0 0 1-2 1.9H8.4a2 2 0 0 1-2-1.9L5.5 6"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2.4"/><path d="M6 15H5a2 2 0 0 1-2-2V4.8a2 2 0 0 1 2-2h8.4A2 2 0 0 1 15.4 5v.9"/>',
    send: '<path d="M21.5 2.5 10.8 13.2"/><path d="M21.5 2.5 14.8 21.5 10.8 13.2 2.5 9.2z"/>',
    target: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1"/>',
    briefcase: '<rect x="2.6" y="7" width="18.8" height="13.4" rx="2.4"/><path d="M15.8 20.4V5.2A2 2 0 0 0 13.8 3.2h-3.6a2 2 0 0 0-2 2v15.2"/>',
    calendar: '<rect x="3" y="4.8" width="18" height="16.4" rx="2.4"/><path d="M16 2.8v4"/><path d="M8 2.8v4"/><path d="M3 10.4h18"/>',
    trend: '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16.5 7H22v5.5"/>',
    refresh: '<path d="M21.5 4v6h-6"/><path d="M2.5 20v-6h6"/><path d="M3.9 9.2A8.6 8.6 0 0 1 18 5.9l3.5 3.4"/><path d="M20.1 14.8A8.6 8.6 0 0 1 6 18.1l-3.5-3.4"/>',
    chevronRight: '<path d="M9 18l6-6-6-6"/>',
    chevronDown: '<path d="M6 9l6 6 6-6"/>',
    arrowRight: '<path d="M4.5 12h15"/><path d="M12.5 5l7 7-7 7"/>',
    arrowLeft: '<path d="M19.5 12h-15"/><path d="M11.5 5l-7 7 7 7"/>',
    menu: '<path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
    star: '<path d="M12 3.2l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.6l6-.8z"/>',
    filter: '<path d="M3.5 5h17l-6.6 8v6l-3.8 2v-8z"/>',
    link: '<path d="M10.5 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.4 1.4"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.4-1.4"/>',
    zap: '<path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z"/>',
    book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/>',
    mail: '<rect x="2.6" y="4.6" width="18.8" height="14.8" rx="2.4"/><path d="M3.4 6.5 12 13l8.6-6.5"/>',
    phone: '<path d="M21 16.9v2.6a2 2 0 0 1-2.2 2 19.4 19.4 0 0 1-8.4-3 19 19 0 0 1-5.9-5.9 19.4 19.4 0 0 1-3-8.5A2 2 0 0 1 3.5 2H6a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.1 9.8a15.6 15.6 0 0 0 6 6l1.2-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2z"/>',
    pin: '<path d="M20 10.5c0 6-8 11.5-8 11.5s-8-5.5-8-11.5a8 8 0 0 1 16 0z"/><circle cx="12" cy="10.3" r="2.8"/>',
    won: '<circle cx="12" cy="9" r="6"/><path d="M8.2 14.2 7 22l5-2.6L17 22l-1.2-7.8"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 7 2.6h.1A1.7 1.7 0 0 0 8.2 1V1a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 2.6a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7c.2.6.7 1 1.3 1.2H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
  };

  function icon(name, cls) {
    var p = ICONS[name] || ICONS.info;
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9);
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait || 260);
    };
  }

  /* ---------- toast ---------- */
  function toast(msg, type, ms) {
    var root = document.getElementById('toastRoot');
    if (!root) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    var ic = type === 'ok' ? 'checkCircle' : (type === 'warn' ? 'alert' : 'info');
    el.innerHTML = icon(ic) + '<span>' + esc(msg) + '</span>';
    root.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s, transform .25s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(function () { el.remove(); }, 260);
    }, ms || 2600);
  }

  /* ---------- modal ---------- */
  var modalStack = [];
  function modal(opts) {
    var mask = document.createElement('div');
    mask.className = 'mask';
    var box = document.createElement('div');
    box.className = 'modal' + (opts.wide ? ' wide' : '');
    box.innerHTML =
      '<div class="modal-head"><h3>' + esc(opts.title || '') + '</h3>' +
      '<button class="icon-btn" data-close>' + icon('x') + '</button></div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.footer === false ? '' : '<div class="modal-foot">' + (opts.footer ||
        '<button class="btn" data-close>取消</button><button class="btn btn-primary" data-ok>确定</button>') + '</div>');

    document.body.appendChild(mask);
    document.body.appendChild(box);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () { mask.classList.add('show'); box.classList.add('show'); });

    function close() {
      mask.classList.remove('show');
      box.classList.remove('show');
      setTimeout(function () {
        mask.remove(); box.remove();
        modalStack = modalStack.filter(function (m) { return m !== close; });
        if (!modalStack.length) document.body.style.overflow = '';
      }, 240);
    }
    modalStack.push(close);

    box.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { close(); }
      if (e.target.closest('[data-ok]')) {
        if (opts.onOk) { if (opts.onOk(box, close) === false) return; }
        close();
      }
    });
    mask.addEventListener('click', close);
    if (opts.onMount) opts.onMount(box, close);
    return close;
  }

  function confirmDialog(title, text, onOk, okText) {
    modal({
      title: title,
      body: '<p style="font-size:13px;color:#475569;line-height:1.7">' + esc(text) + '</p>',
      footer: '<button class="btn" data-close>取消</button><button class="btn btn-primary" data-ok>' + esc(okText || '确定') + '</button>',
      onOk: function () { onOk && onOk(); }
    });
  }

  /* ---------- format ---------- */
  var MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  function toDate(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    var s = String(v).trim();
    var d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s.replace(/-/g, '/')) : new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  function fmtDate(v, withYear) {
    var d = toDate(v);
    if (!d) return '—';
    return (withYear === false ? '' : d.getFullYear() + '年') + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function fmtShort(v) {
    var d = toDate(v);
    if (!d) return '—';
    return (d.getMonth() + 1) + '/' + d.getDate();
  }
  function daysLeft(v) {
    var d = toDate(v);
    if (!d) return null;
    var now = new Date();
    var a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((b - a) / 86400000);
  }
  function relTime(v) {
    var d = toDate(v);
    if (!d) return '—';
    var diff = Date.now() - d.getTime();
    if (diff < 0) return '刚刚';
    var m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    var dd = Math.floor(h / 24);
    if (dd < 30) return dd + ' 天前';
    return fmtDate(d);
  }
  function nowISO() { return new Date().toISOString(); }
  function todayStr() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function fileSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  /* ---------- ring ---------- */
  function ring(percent, size) {
    var s = size || 52, r = (s - 8) / 2, c = 2 * Math.PI * r;
    var off = c * (1 - Math.max(0, Math.min(100, percent)) / 100);
    return '<div class="ring" style="width:' + s + 'px;height:' + s + 'px">' +
      '<svg width="' + s + '" height="' + s + '">' +
      '<circle cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + r + '" fill="none" stroke="#e2e9f6" stroke-width="4.5"/>' +
      '<circle cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + r + '" fill="none" stroke="url(#g1)" stroke-width="4.5" ' +
      'stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" ' +
      'style="transition:stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)"/>' +
      '<defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs>' +
      '</svg><div class="ring-num">' + Math.round(percent) + '%</div></div>';
  }

  function colorOf(name) {
    var palette = ['#2563eb', '#7c3aed', '#0e9f6e', '#e08c04', '#db2777', '#0891b2', '#dc2626', '#4f46e5'];
    var sum = 0;
    for (var i = 0; i < String(name).length; i++) sum += String(name).charCodeAt(i);
    return palette[sum % palette.length];
  }
  function logo(company, size) {
    var s = size || 34;
    var ch = String(company || '?').replace(/[（(].*$/, '').trim().slice(0, 1);
    return '<span class="logo-box" style="width:' + s + 'px;height:' + s + 'px;background:' + colorOf(company) + ';font-size:' + (s * 0.36) + 'px">' + esc(ch) + '</span>';
  }

  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        var ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
      }
      toast('已复制到剪贴板', 'ok');
    } catch (e) { toast('复制失败，请手动选择', 'warn'); }
  }

  function pickFile(accept, cb) {
    var input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.onchange = function () {
      if (input.files && input.files[0]) cb(input.files[0]);
    };
    input.click();
  }

  function typeText(node, text, speed) {
    return new Promise(function (resolve) {
      var i = 0;
      node.textContent = '';
      node.classList.add('typing-caret');
      var step = speed || 12;
      var timer = setInterval(function () {
        i += 2 + Math.floor(Math.random() * 3);
        node.textContent = text.slice(0, i);
        if (i >= text.length) {
          clearInterval(timer);
          node.textContent = text;
          node.classList.remove('typing-caret');
          resolve();
        }
      }, step);
    });
  }

  global.UI = {
    ICONS: ICONS, icon: icon, esc: esc, $: $, $$: $$, uid: uid, debounce: debounce,
    toast: toast, modal: modal, confirm: confirmDialog, maskClose: function () { modalStack.forEach(function (f) { f(); }); },
    fmtDate: fmtDate, fmtShort: fmtShort, daysLeft: daysLeft, relTime: relTime,
    nowISO: nowISO, todayStr: todayStr, fileSize: fileSize, ring: ring, logo: logo,
    colorOf: colorOf, copyText: copyText, pickFile: pickFile, typeText: typeText, MONTHS: MONTHS
  };
})(window);
