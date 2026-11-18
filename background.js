/* =========================================================
   OfferPilot Service Worker (MV3)
   职责：种子数据初始化 / 各帧识别报告聚合与徽标 / 右键菜单 /
        快捷键 / 截止提醒 / 打开工作台
   ========================================================= */
'use strict';

// data.js、store.js 都以 window 为挂载对象，Service Worker 里做一个最小 shim
self.window = self;
try {
  importScripts('assets/js/data.js', 'assets/js/resumefields.js', 'assets/js/resumematch.js', 'assets/js/queue.js', 'assets/js/store.js');
} catch (e) {
  console.warn('[OfferPilot] 依赖加载失败', e);
}

var STATE_KEY = 'offerpilot.state.v1';
var APP_URL = 'index.html';

/* ---------------- 报告聚合 ---------------- */
// tabId -> { frameId -> report }
var reports = {};

function mergeReports(tabId) {
  var map = reports[tabId];
  if (!map) return null;
  var keys = Object.keys(map);
  if (!keys.length) return null;
  var out = {
    tabId: tabId, url: '', host: '', title: '', total: 0, ready: 0, manual: 0, unknown: 0,
    percent: 0, missingRequired: [], fields: [], frames: keys.length, at: 0
  };
  keys.forEach(function (k) {
    var r = map[k];
    if (!r) return;
    if (!out.host) { out.host = r.host; out.url = r.url; out.title = r.title; }
    out.total += r.total || 0;
    out.ready += r.ready || 0;
    out.manual += r.manual || 0;
    out.unknown += r.unknown || 0;
    out.at = Math.max(out.at, r.at || 0);
    (r.missingRequired || []).forEach(function (m) {
      if (out.missingRequired.indexOf(m) < 0) out.missingRequired.push(m);
    });
    if (r.fields) out.fields = out.fields.concat(r.fields);
  });
  out.percent = out.total ? Math.round(out.ready / out.total * 100) : 0;
  out.fields = out.fields.slice(0, 120);
  out.missingRequired = out.missingRequired.slice(0, 10);
  return out;
}

function paintBadge(tabId) {
  var r = mergeReports(tabId);
  var text = '';
  if (r && r.total) text = String(r.ready);
  try {
    chrome.action.setBadgeText({ tabId: tabId, text: text });
    chrome.action.setBadgeBackgroundColor({
      tabId: tabId,
      color: r && r.missingRequired.length ? '#d97706' : '#2563eb'
    });
    if (text) chrome.action.setBadgeTextColor({ tabId: tabId, color: '#ffffff' });
  } catch (e) { /* tab 已关闭 */ }
}

/* ---------------- 种子数据 ---------------- */
function seedIfEmpty() {
  return new Promise(function (resolve) {
    chrome.storage.local.get(STATE_KEY, function (obj) {
      if (obj && obj[STATE_KEY]) return resolve(false);
      var fresh = null;
      try {
        fresh = self.Store && self.Store.defaultState ? self.Store.defaultState() : null;
      } catch (e) { fresh = null; }
      if (!fresh) return resolve(false);
      var payload = {};
      payload[STATE_KEY] = fresh;
      chrome.storage.local.set(payload, function () { resolve(true); });
    });
  });
}

/* ---------------- 安装 ---------------- */
chrome.runtime.onInstalled.addListener(function (details) {
  seedIfEmpty().then(function () {
    // 首次安装打开工作台，帮助用户先完善档案
    if (details.reason === 'install') {
      chrome.tabs.create({ url: chrome.runtime.getURL(APP_URL) });
    }
  });

  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({
      id: 'op-fill',
      title: '用 OfferPilot 填充此页表单',
      contexts: ['page', 'editable', 'frame']
    });
    chrome.contextMenus.create({
      id: 'op-scan',
      title: 'OfferPilot：仅识别字段，不写入',
      contexts: ['page', 'editable', 'frame']
    });
    chrome.contextMenus.create({
      id: 'op-app',
      title: '打开 OfferPilot 工作台',
      contexts: ['page', 'action']
    });
  });

  chrome.alarms.create('op-deadline', { periodInMinutes: 60 * 6, delayInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(function () {
  chrome.alarms.create('op-deadline', { periodInMinutes: 60 * 6, delayInMinutes: 1 });
});

/* ---------------- 右键菜单 ---------------- */
chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (!tab || !tab.id) return;
  if (info.menuItemId === 'op-app') {
    chrome.tabs.create({ url: chrome.runtime.getURL(APP_URL) });
    return;
  }
  if (info.menuItemId === 'op-fill') {
    send(tab.id, { type: 'OP_FILL', mode: 'empty' }, function () {
      send(tab.id, { type: 'OP_TOGGLE' });
    });
  }
  if (info.menuItemId === 'op-scan') {
    send(tab.id, { type: 'OP_SCAN' }, function () {
      send(tab.id, { type: 'OP_TOGGLE' });
    });
  }
});

// 静默发送：页面没有内容脚本时不要抛错
function send(tabId, msg, done) {
  try {
    chrome.tabs.sendMessage(tabId, msg, function () {
      if (chrome.runtime.lastError) { /* 无接收方，忽略 */ }
      if (done) done();
    });
  } catch (e) {
    if (done) done();
  }
}

/* =========================================================
   自动网申队列执行器
   串行驱动：打开官网 → 等加载完成 → 让内容脚本填写 → 收结果 → 下一个
   ========================================================= */
var RUN = { active: false, ids: [], current: '', timers: {}, done: 0 };

function readState(cb) {
  chrome.storage.local.get(STATE_KEY, function (obj) { cb((obj && obj[STATE_KEY]) || null); });
}

function saveState(st, cb) {
  var payload = {};
  payload[STATE_KEY] = st;
  chrome.storage.local.set(payload, function () { if (cb) cb(); });
}

/* 任务状态更新：读最新 state → 改这条任务 → 写回，避免覆盖工作台的其他修改 */
function updateTask(taskId, ev, payload, cb) {
  readState(function (st) {
    if (!st || !st.queue) return cb && cb(null);
    var t = st.queue.filter(function (x) { return x.id === taskId; })[0];
    if (!t) return cb && cb(null);
    if (self.Queue) self.Queue.apply(st.queue, taskId, ev, payload);
    t.updatedAt = new Date().toISOString();
    saveState(st, function () { cb && cb(t); });
  });
}

function nextQueued() {
  return new Promise(function (resolve) {
    readState(function (st) {
      var list = ((st && st.queue) || []).filter(function (t) {
        return t.status === 'queued' && RUN.ids.indexOf(t.id) >= 0;
      });
      list.sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
      resolve(list[0] || null);
    });
  });
}

function notifyQueue(title, message) {
  try {
    chrome.notifications.create('op-queue-' + Date.now(), {
      type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: title, message: message, priority: 1
    });
  } catch (e) { /* 无通知权限 */ }
}

function stepQueue() {
  if (!RUN.active) return;
  nextQueued().then(function (t) {
    if (!t) {
      RUN.active = false;
      RUN.current = '';
      notifyQueue('网申队列已完成', '共执行 ' + RUN.done + ' 个任务，结果可在工作台「自动网申」里核对。');
      return;
    }
    RUN.current = t.id;
    updateTask(t.id, 'start', null, function () { openTask(t); });
  });
}

function waitComplete(tabId, cb, timeout, onTimeout) {
  var finished = false;
  function listener(id, info) {
    if (id !== tabId || info.status !== 'complete' || finished) return;
    finished = true;
    try { chrome.tabs.onUpdated.removeListener(listener); } catch (e) { }
    cb();
  }
  chrome.tabs.onUpdated.addListener(listener);
  try {
    chrome.tabs.get(tabId, function (t) {
      if (t && t.status === 'complete' && !finished) {
        finished = true;
        try { chrome.tabs.onUpdated.removeListener(listener); } catch (e) { }
        cb();
      }
    });
  } catch (e) { }
  setTimeout(function () {
    if (finished) return;
    finished = true;
    try { chrome.tabs.onUpdated.removeListener(listener); } catch (e) { }
    if (onTimeout) onTimeout();
  }, timeout || 25000);
}

function openTask(t) {
  if (!t.url) {
    updateTask(t.id, 'fail', '任务没有网申链接', function () { stepQueue(); });
    return;
  }
  chrome.tabs.create({ url: t.url, active: true }, function (tab) {
    if (!tab || !tab.id) {
      updateTask(t.id, 'fail', '浏览器无法打开该链接', function () { stepQueue(); });
      return;
    }
    updateTask(t.id, 'bind', tab.id);

    /* 单个任务 70 秒还没回报 → 判定失败，避免卡住整个队列 */
    clearTimeout(RUN.timers[t.id]);
    RUN.timers[t.id] = setTimeout(function () {
      updateTask(t.id, 'fail', '页面无响应（可能要求登录或验证码）', function () {
        RUN.done++;
        stepQueue();
      });
    }, 70000);

    waitComplete(tab.id, function () {
      updateTask(t.id, 'loaded');
      /* SPA 首屏渲染完还要再等一下，否则字段还不在 DOM 里 */
      setTimeout(function () {
        send(tab.id, { type: 'OP_FILL', mode: 'empty', silent: true }, function () { });
      }, 700);
    }, 25000, function () {
      updateTask(t.id, 'fail', '页面加载超时，请检查链接是否可访问', function () {
        clearTimeout(RUN.timers[t.id]);
        stepQueue();
      });
    });
  });
}

function finishTaskFromContent(task, msg) {
  clearTimeout(RUN.timers[task.id]);
  updateTask(task.id, 'report', msg.report);
  updateTask(task.id, 'filled', { filled: msg.filled, total: msg.total });
  /* 已经回答过的字段不再追问，否则「补充 → 再追问」会死循环 */
  var answered = {};
  (task.asks || []).forEach(function (a) { if (a.answer) answered[a.label] = 1; });
  var asks = msg.answered ? [] : (msg.missing || []).filter(function (m) {
    return !answered[m.label];
  }).slice(0, 5);
  if (asks.length) {
    updateTask(task.id, 'need', asks);
    notifyQueue('有 ' + asks.length + ' 项信息需要你确认', task.company + ' · ' + task.role + '：档案里没有这些字段');
  } else {
    updateTask(task.id, 'finish', { filled: msg.filled, total: msg.total });
  }
  RUN.done++;
  stepQueue();
}

function findTaskByTab(tabId, cb) {
  readState(function (st) {
    var list = ((st && st.queue) || []).filter(function (t) {
      return t.tabId === tabId && ['opening', 'filling', 'need_input'].indexOf(t.status) >= 0;
    });
    cb(list[0] || null);
  });
}

/* ---------------- 快捷键 ---------------- */
chrome.commands.onCommand.addListener(function (cmd) {
  if (cmd === 'open-app') {
    chrome.tabs.create({ url: chrome.runtime.getURL(APP_URL) });
    return;
  }
  if (cmd === 'fill-page') {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || !tab.id) return;
      send(tab.id, { type: 'OP_FILL', mode: 'empty' }, function () {
        send(tab.id, { type: 'OP_TOGGLE' });
      });
    });
  }
});

/* ---------------- 消息中枢 ---------------- */
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) return;

  if (msg.type === 'OP_REPORT' && sender.tab && sender.tab.id) {
    var tabId = sender.tab.id;
    var fid = sender.frameId == null ? 0 : sender.frameId;
    reports[tabId] = reports[tabId] || {};
    reports[tabId][fid] = msg.report;
    paintBadge(tabId);
    return;
  }

  if (msg.type === 'OP_GET_REPORT') {
    sendResponse({ report: mergeReports(msg.tabId) });
    return true;
  }

  if (msg.type === 'OP_OPEN_APP') {
    chrome.tabs.create({ url: chrome.runtime.getURL(APP_URL) + (msg.hash || '') });
    return;
  }

  /* 页面浮层「记录职位」：直接把当前页面写成一条待投递记录 */
  if (msg.type === 'OP_RECORD_JOB' && msg.job) {
    chrome.storage.local.get(STATE_KEY, function (obj) {
      var st = obj && obj[STATE_KEY];
      if (!st || !st.apps) { sendResponse({ ok: false, reason: 'no-state' }); return; }
      var j = msg.job;
      var dup = st.apps.filter(function (a) {
        return a.company === j.company && a.role === j.role;
      })[0];
      if (dup) { sendResponse({ ok: true, dup: true, id: dup.id }); return; }
      st.apps.unshift({
        id: 'a_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        company: j.company || j.host || '未命名企业',
        role: j.role || '待确认岗位',
        city: '',
        status: 'todo',
        match: 0,
        resumeId: (st.resumes || []).filter(function (r) { return r.isDefault; })[0]
          ? (st.resumes || []).filter(function (r) { return r.isDefault; })[0].id
          : ((st.resumes || [])[0] || {}).id || '',
        deadline: '',
        salary: '',
        channel: '浏览器插件',
        note: j.url || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timeline: [{ at: new Date().toISOString(), text: '在 ' + (j.host || '招聘页面') + ' 记录职位', status: 'todo' }]
      });
      var payload = {};
      payload[STATE_KEY] = st;
      chrome.storage.local.set(payload, function () {
        /* 工作台监听 storage 变更，会自动同步这条记录 */
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (msg.type === 'OP_FILL_TAB') {
    send(msg.tabId, { type: 'OP_FILL', mode: msg.mode || 'empty' }, function () {
      setTimeout(function () {
        sendResponse({ report: mergeReports(msg.tabId) });
      }, 500);
    });
    return true;
  }

  if (msg.type === 'OP_SCAN_TAB') {
    send(msg.tabId, { type: 'OP_SCAN' }, function () {
      setTimeout(function () {
        sendResponse({ report: mergeReports(msg.tabId) });
      }, 400);
    });
    return true;
  }

  if (msg.type === 'OP_UNDO_TAB') {
    send(msg.tabId, { type: 'OP_UNDO' }, function () {
      sendResponse({ ok: true });
    });
    return true;
  }

  /* 工作台浮窗：让目标标签页打开「简历闪填 / 辅助填写 / 选区框选」面板 */
  if (msg.type === 'OP_PANEL_TAB') {
    send(msg.tabId, { type: 'OP_PANEL', view: msg.view || 'flash' }, function () {
      sendResponse({ ok: true });
    });
    return true;
  }

  /* 选区填写：把框选矩形交给内容脚本，只写这块区域里的字段 */
  if (msg.type === 'OP_FILL_REGION_TAB') {
    send(msg.tabId, { type: 'OP_FILL_REGION', rect: msg.rect }, function () {
      setTimeout(function () { sendResponse({ report: mergeReports(msg.tabId) }); }, 600);
    });
    return true;
  }

  if (msg.type === 'OP_FILL_DONE' && sender.tab && sender.tab.id) {
    findTaskByTab(sender.tab.id, function (t) {
      if (!t) return;
      finishTaskFromContent(t, msg);
    });
    return;
  }

  /* 自动网申：启动队列 / 停止 / 补充答案 / 接管标签页 */
  if (msg.type === 'OP_QUEUE_RUN') {
    var want = msg.taskIds || [];
    readState(function (st) {
      var queued = ((st && st.queue) || []).filter(function (t) {
        return t.status === 'queued' && (!want.length || want.indexOf(t.id) >= 0);
      });
      if (!queued.length) {
        sendResponse({ ok: false, reason: '没有排队中的任务' });
        return;
      }
      var ids = queued.map(function (t) { return t.id; });
      if (RUN.active) {
        ids.forEach(function (id) { if (RUN.ids.indexOf(id) < 0) RUN.ids.push(id); });
      } else {
        RUN.active = true;
        RUN.ids = ids;
        RUN.done = 0;
        stepQueue();
      }
      sendResponse({ ok: true, started: ids.length });
    });
    return true;
  }

  if (msg.type === 'OP_QUEUE_STOP') {
    RUN.active = false;
    Object.keys(RUN.timers).forEach(function (k) { clearTimeout(RUN.timers[k]); });
    RUN.timers = {};
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'OP_FOCUS_TAB' && msg.tabId) {
    chrome.tabs.update(msg.tabId, { active: true }, function (tab) {
      if (chrome.runtime.lastError || !tab) { sendResponse({ ok: false }); return; }
      if (tab.windowId != null) {
        chrome.windows.update(tab.windowId, { focused: true }, function () { sendResponse({ ok: true }); });
      } else {
        sendResponse({ ok: true });
      }
    });
    return true;
  }

  if (msg.type === 'OP_ANSWERS' && msg.tabId) {
    send(msg.tabId, { type: 'OP_ANSWERS', answers: msg.answers || [] }, function () {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'OP_STATE_CHANGED') {
    // 工作台改了档案：让各标签页重新识别
    chrome.tabs.query({}, function (tabs) {
      (tabs || []).forEach(function (t) {
        if (t.id && /^https?:/.test(t.url || '')) send(t.id, { type: 'OP_SCAN' });
      });
    });
    return;
  }
});

/* ---------------- 标签页生命周期 ---------------- */
chrome.tabs.onRemoved.addListener(function (tabId) { delete reports[tabId]; });

chrome.tabs.onUpdated.addListener(function (tabId, info) {
  if (info.status === 'loading') {
    delete reports[tabId];
    try { chrome.action.setBadgeText({ tabId: tabId, text: '' }); } catch (e) { }
  }
});

chrome.tabs.onActivated.addListener(function (info) {
  paintBadge(info.tabId);
});

/* ---------------- 截止提醒 ---------------- */
chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name !== 'op-deadline') return;
  chrome.storage.local.get(STATE_KEY, function (obj) {
    var st = obj && obj[STATE_KEY];
    if (!st || !st.apps) return;
    var soon = st.apps.filter(function (a) {
      if (!a.deadline || a.status === 'rejected' || a.status === 'offer') return false;
      var d = new Date(String(a.deadline).replace(/-/g, '/'));
      if (isNaN(d.getTime())) return false;
      var days = Math.ceil((d.getTime() - Date.now()) / 86400000);
      a.__days = days;
      return days >= 0 && days <= 2;
    });
    if (!soon.length) return;
    var body = soon.slice(0, 3).map(function (a) {
      return a.company + ' · ' + a.role + '（' + (a.__days === 0 ? '今天截止' : a.__days + ' 天内截止') + '）';
    }).join('\n');
    try {
      chrome.notifications.create('op-deadline-' + Date.now(), {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: '还有 ' + soon.length + ' 个网申即将截止',
        message: body,
        priority: 2
      });
    } catch (e) { }
  });
});

chrome.notifications.onClicked.addListener(function (id) {
  if (String(id).indexOf('op-deadline') === 0) {
    chrome.tabs.create({ url: chrome.runtime.getURL(APP_URL + '#/pipeline') });
    chrome.notifications.clear(id);
  }
});

/* ---------------- 首次唤醒也确保种子存在 ---------------- */
seedIfEmpty();
