/* =========================================================
   扩展桥接层
   页面里所有 chrome.* 调用集中在此，网页环境下优雅降级为 no-op
   ========================================================= */
(function (global) {
  'use strict';

  var hasExt = false;
  try {
    hasExt = !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.tabs);
  } catch (e) { hasExt = false; }

  function bg(msg) {
    return new Promise(function (resolve) {
      if (!hasExt) return resolve(null);
      try {
        chrome.runtime.sendMessage(msg, function (res) {
          if (chrome.runtime.lastError) return resolve(null);
          resolve(res || null);
        });
      } catch (e) { resolve(null); }
    });
  }

  function queryTabs(q) {
    return new Promise(function (resolve) {
      try { chrome.tabs.query(q, function (t) { resolve(t || []); }); }
      catch (e) { resolve([]); }
    });
  }

  /* 找到用户真正在看的招聘页面：排除扩展自身页面与非 http(s) 页面 */
  function activeTab() {
    if (!hasExt) return Promise.resolve(null);
    return queryTabs({ active: true, lastFocusedWindow: true }).then(function (tabs) {
      var hit = tabs.filter(function (t) { return /^https?:/i.test(t.url || ''); })[0];
      if (hit) return hit;
      return queryTabs({}).then(function (all) {
        var cands = all.filter(function (t) { return /^https?:/i.test(t.url || ''); });
        var act = cands.filter(function (t) { return t.active; })[0];
        if (act) return act;
        cands.sort(function (a, b) { return (b.lastAccessed || 0) - (a.lastAccessed || 0); });
        return cands[0] || null;
      });
    });
  }

  var syncTimer = null;

  global.Bridge = {
    mode: hasExt ? 'extension' : 'web',
    available: hasExt,

    activeTab: activeTab,

    getReport: function (tabId) {
      return bg({ type: 'OP_GET_REPORT', tabId: tabId }).then(function (r) { return r && r.report; });
    },
    fillTab: function (tabId, mode) {
      return bg({ type: 'OP_FILL_TAB', tabId: tabId, mode: mode || 'empty' }).then(function (r) { return r && r.report; });
    },
    scanTab: function (tabId) {
      return bg({ type: 'OP_SCAN_TAB', tabId: tabId }).then(function (r) { return r && r.report; });
    },
    undoTab: function (tabId) {
      return bg({ type: 'OP_UNDO_TAB', tabId: tabId });
    },
    /* 让目标页打开浮窗的某个视图：flash（简历闪填）/ assist（辅助填写）/ pick（选区框选） */
    panelTab: function (tabId, view) {
      return bg({ type: 'OP_PANEL_TAB', tabId: tabId, view: view || 'flash' });
    },
    /* 自动网申队列：交给后台依次打开页面并驱动填写 */
    queueRun: function (taskIds) {
      return bg({ type: 'OP_QUEUE_RUN', taskIds: taskIds || [] });
    },
    queueStop: function () {
      return bg({ type: 'OP_QUEUE_STOP' });
    },
    /* 把用户补充的字段答案送回目标页面继续填写 */
    sendAnswers: function (taskId, tabId, answers) {
      return bg({ type: 'OP_ANSWERS', taskId: taskId, tabId: tabId, answers: answers || [] });
    },
    /* 接管：切到任务所在标签页 */
    focusTab: function (tabId) {
      return bg({ type: 'OP_FOCUS_TAB', tabId: tabId }).then(function (r) {
        return !!(r && r.ok);
      });
    },

    openApp: function (hash) {      if (!hasExt) { location.hash = hash || '#/dashboard'; return; }
      try { chrome.tabs.create({ url: chrome.runtime.getURL('index.html' + (hash || '')) }); } catch (e) { }
    },
    openOptions: function () {
      if (!hasExt) { location.hash = '#/copilot'; return; }
      try { chrome.runtime.openOptionsPage(); } catch (e) { }
    },

    /* 档案变更后，通知后台让所有招聘页重新识别 */
    syncState: function () {
      if (!hasExt) return;
      clearTimeout(syncTimer);
      syncTimer = setTimeout(function () { bg({ type: 'OP_STATE_CHANGED' }); }, 800);
    },

    onStorageChange: function (fn) {
      if (global.OPStorage) return global.OPStorage.onChange(fn);
      return function () { };
    }
  };
})(window);
