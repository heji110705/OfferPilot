/* =========================================================
   存储适配层
   - 扩展环境：chrome.storage.local（跨标签页/跨站点共享，与页面 localStorage 隔离）
   - 网页环境：降级到 localStorage（保留原方案可直接打开的能力）
   ========================================================= */
(function (global) {
  'use strict';

  var hasChrome = false;
  try {
    hasChrome = !!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local);
  } catch (e) { hasChrome = false; }

  function lsGet(key) {
    try {
      var raw = global.localStorage && global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function lsSet(key, val) {
    try { global.localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 配额溢出 */ }
  }

  function get(key) {
    return new Promise(function (resolve) {
      if (hasChrome) {
        try {
          chrome.storage.local.get(key, function (obj) {
            if (chrome.runtime && chrome.runtime.lastError) return resolve(lsGet(key));
            resolve(obj && obj[key] !== undefined ? obj[key] : null);
          });
        } catch (e) { resolve(lsGet(key)); }
      } else {
        resolve(lsGet(key));
      }
    });
  }

  function set(key, val) {
    // 始终写一份镜像：让首屏同步读取到最新数据，避免白屏
    lsSet(key, val);
    return new Promise(function (resolve) {
      if (!hasChrome) return resolve(false);
      try {
        var payload = {};
        payload[key] = val;
        chrome.storage.local.set(payload, function () {
          if (chrome.runtime && chrome.runtime.lastError) {
            console.warn('[OfferPilot] 存储写入失败', chrome.runtime.lastError.message);
            resolve(false);
            return;
          }
          resolve(true);
        });
      } catch (e) { resolve(false); }
    });
  }

  function remove(key) {
    try { global.localStorage.removeItem(key); } catch (e) { }
    return new Promise(function (resolve) {
      if (!hasChrome) return resolve();
      try { chrome.storage.local.remove(key, function () { resolve(); }); } catch (e) { resolve(); }
    });
  }

  function onChange(fn) {
    if (!hasChrome || !chrome.storage.onChanged) return function () { };
    var handler = function (changes, area) {
      if (area !== 'local') return;
      fn(changes);
    };
    chrome.storage.onChanged.addListener(handler);
    return function () { try { chrome.storage.onChanged.removeListener(handler); } catch (e) { } };
  }

  global.OPStorage = {
    backend: hasChrome ? 'chrome.storage.local' : 'localStorage',
    isExtension: hasChrome,
    get: get,
    set: set,
    remove: remove,
    onChange: onChange
  };
})(typeof window !== 'undefined' ? window : self);
