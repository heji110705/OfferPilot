/* =========================================================
   自动网申：任务状态机 + 用量统计（纯逻辑，无 DOM 依赖，不限额）
   —— 工作台视图与后台执行器共用同一套状态定义
   ========================================================= */
(function (global) {
  'use strict';

  var STATUS = {
    QUEUED: 'queued',       // 排队中，等待执行
    OPENING: 'opening',     // 正在打开招聘官网
    FILLING: 'filling',     // 正在识别 / 填写
    NEED: 'need_input',     // 等你回复：档案里没有的字段
    DONE: 'done',           // 填写完成，待你核对提交
    FAILED: 'failed',       // 执行失败，可重试
    CLOSED: 'closed'        // 已关闭
  };

  var STATUS_NAME = {
    queued: '排队中', opening: '打开页面', filling: '填写中',
    need_input: '等你回复', done: '填写完成', failed: '失败', closed: '已关闭'
  };

  var STATUS_TONE = {
    queued: '', opening: 'brand', filling: 'brand',
    need_input: 'warn', done: 'ok', failed: 'danger', closed: ''
  };

  var STEPS = ['创建任务', '打开招聘官网', '识别表单字段', '写入档案信息', '核对并提交'];

  function uid(prefix) {
    return (prefix || 'q') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function nowISO() { return new Date().toISOString(); }

  function log(task, text, tone) {
    task.logs = task.logs || [];
    task.logs.unshift({ at: nowISO(), text: text, tone: tone || '' });
    if (task.logs.length > 40) task.logs.length = 40;
  }

  /* ---------------- 任务 ---------------- */
  function create(job, opts) {
    opts = opts || {};
    var task = {
      id: uid('task'),
      jobId: job.id || '',
      company: job.company || '未命名企业',
      role: job.role || '待确认岗位',
      city: job.city || '',
      url: job.url || '',
      resumeId: opts.resumeId || '',
      resumeName: opts.resumeName || '',
      status: STATUS.QUEUED,
      step: '创建任务',
      progress: 0,
      tabId: null,
      attempts: 0,
      source: opts.source || '岗位大厅',
      createdAt: nowISO(),
      startedAt: '',
      endedAt: '',
      duration: 0,
      report: null,
      asks: [],
      logs: []
    };
    log(task, '已加入投递队列 · ' + (opts.source || '岗位大厅'));
    return task;
  }

  function find(tasks, id) {
    return (tasks || []).filter(function (t) { return t.id === id; })[0] || null;
  }

  function next(tasks) {
    var q = (tasks || []).filter(function (t) { return t.status === STATUS.QUEUED; });
    q.sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
    return q[0] || null;
  }

  function active(tasks) {
    return (tasks || []).filter(function (t) {
      return t.status === STATUS.OPENING || t.status === STATUS.FILLING;
    });
  }

  /* ---------------- 状态流转 ---------------- */
  function start(task) {
    if (!task) return task;
    task.status = STATUS.OPENING;
    task.step = '打开招聘官网';
    task.progress = 8;
    task.startedAt = nowISO();
    task.attempts = (task.attempts || 0) + 1;
    log(task, '开始执行（第 ' + task.attempts + ' 次）', 'brand');
    return task;
  }

  function loaded(task) {
    if (!task) return task;
    task.status = STATUS.FILLING;
    task.step = '识别表单字段';
    task.progress = 26;
    log(task, '招聘页面已打开，开始识别字段', 'brand');
    return task;
  }

  function bindTab(task, tabId) {
    if (!task) return task;
    task.tabId = tabId == null ? null : tabId;
    return task;
  }

  function report(task, rep) {
    if (!task || !rep) return task;
    task.report = {
      total: rep.total || 0,
      ready: rep.ready || 0,
      percent: rep.percent || 0,
      host: rep.host || '',
      url: rep.url || task.url,
      missingRequired: (rep.missingRequired || []).slice(0, 8)
    };
    task.progress = Math.max(task.progress, 62);
    task.step = '写入档案信息';
    return task;
  }

  /* 字段级结果：filled 个写入 / missing 个档案没有 */
  function filled(task, res) {
    if (!task) return task;
    res = res || {};
    task.report = task.report || {};
    task.report.filled = res.filled || 0;
    task.report.total = res.total || task.report.total || 0;
    task.report.percent = res.total ? Math.round((res.filled || 0) / res.total * 100) : task.report.percent || 0;
    task.progress = 78;
    log(task, '写入 ' + (res.filled || 0) + ' / ' + (res.total || 0) + ' 个字段' +
      (res.picked ? '，下拉选中 ' + res.picked + ' 项' : ''), res.filled ? 'ok' : 'warn');
    return task;
  }

  /* 档案里没有的必填字段 → 暂停等用户回答 */
  function needInput(task, asks) {
    if (!task) return task;
    var list = (asks || []).map(function (a, i) {
      return {
        id: a.id || ('ask' + i),
        label: a.label || '未命名字段',
        required: !!a.required,
        options: a.options || [],
        answer: a.answer || ''
      };
    });
    if (!list.length) return task;
    task.asks = list;
    task.status = STATUS.NEED;
    task.step = '等待你补充 ' + list.length + ' 项信息';
    task.progress = 84;
    log(task, '有 ' + list.length + ' 个字段档案里没有，已暂停等你确认', 'warn');
    return task;
  }

  function answer(task, askId, value) {
    if (!task) return task;
    (task.asks || []).forEach(function (a) {
      if (a.id === askId) a.answer = value;
    });
    var pending = (task.asks || []).filter(function (a) { return !a.answer; });
    if (!pending.length && task.status === STATUS.NEED) {
      task.status = STATUS.FILLING;
      task.step = '正在回填补充信息';
      task.progress = 90;
      log(task, '补充信息已提交，继续填写', 'brand');
    }
    return task;
  }

  function finish(task, res) {
    if (!task) return task;
    res = res || {};
    task.status = STATUS.DONE;
    task.step = '填写完成，请核对后提交';
    task.progress = 100;
    task.endedAt = nowISO();
    task.duration = task.startedAt
      ? Math.max(1, Math.round((new Date(task.endedAt) - new Date(task.startedAt)) / 1000)) : 0;
    task.report = task.report || {};
    if (res.filled != null) task.report.filled = res.filled;
    if (res.total != null) task.report.total = res.total;
    /* 没经过 filled() 直接收尾时（例如用户跳过追问），覆盖率在这里补算 */
    if (task.report.total) {
      task.report.percent = Math.round((task.report.filled || 0) / task.report.total * 100);
    }
    log(task, '填写完成，共写入 ' + (task.report.filled || 0) + ' 个字段，请核对后在企业官网提交', 'ok');
    return task;
  }

  function fail(task, reason) {
    if (!task) return task;
    task.status = STATUS.FAILED;
    task.step = reason || '执行失败';
    task.progress = Math.min(task.progress || 0, 60);
    task.endedAt = nowISO();
    task.duration = task.startedAt
      ? Math.max(1, Math.round((new Date(task.endedAt) - new Date(task.startedAt)) / 1000)) : 0;
    log(task, reason || '执行失败', 'danger');
    return task;
  }

  function retry(task) {
    if (!task) return task;
    task.status = STATUS.QUEUED;
    task.step = '重新排队';
    task.progress = 0;
    task.asks = [];
    task.endedAt = '';
    task.duration = 0;
    log(task, '已重新加入队列', '');
    return task;
  }

  function close(task) {
    if (!task) return task;
    task.status = STATUS.CLOSED;
    task.step = '已关闭';
    task.endedAt = task.endedAt || nowISO();
    log(task, '任务已关闭', '');
    return task;
  }

  /* 统一的 patch 入口：视图与后台都走这里，避免状态字段各写各的 */
  function apply(tasks, id, ev, payload) {
    var task = find(tasks, id);
    if (!task) return null;
    switch (ev) {
      case 'start': return start(task);
      case 'loaded': return loaded(task);
      case 'bind': return bindTab(task, payload);
      case 'report': return report(task, payload);
      case 'filled': return filled(task, payload);
      case 'need': return needInput(task, payload);
      case 'answer': return answer(task, payload && payload.id, payload && payload.value);
      case 'finish': return finish(task, payload);
      case 'fail': return fail(task, payload);
      case 'retry': return retry(task);
      case 'close': return close(task);
      default: return task;
    }
  }

  /* ---------------- 统计 ---------------- */
  function sameDay(iso, ref) {
    if (!iso) return false;
    var a = new Date(iso), b = new Date(ref || Date.now());
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function stats(tasks, now) {
    var list = tasks || [];
    var out = {
      total: list.length, queued: 0, running: 0, need: 0, done: 0, failed: 0, closed: 0,
      todayDone: 0, successRate: 0, avgSec: 0, fieldsFilled: 0
    };
    var durations = [];
    list.forEach(function (t) {
      if (t.status === STATUS.QUEUED) out.queued++;
      else if (t.status === STATUS.OPENING || t.status === STATUS.FILLING) out.running++;
      else if (t.status === STATUS.NEED) out.need++;
      else if (t.status === STATUS.DONE) out.done++;
      else if (t.status === STATUS.FAILED) out.failed++;
      else if (t.status === STATUS.CLOSED) out.closed++;
      if (t.status === STATUS.DONE) {
        out.fieldsFilled += (t.report && t.report.filled) || 0;
        if (sameDay(t.endedAt, now)) out.todayDone++;
        if (t.duration) durations.push(t.duration);
      }
    });
    var finished = out.done + out.failed;
    out.successRate = finished ? Math.round(out.done / finished * 100) : 0;
    out.avgSec = durations.length
      ? Math.round(durations.reduce(function (s, x) { return s + x; }, 0) / durations.length) : 0;
    return out;
  }

  function fmtDuration(sec) {
    if (!sec) return '—';
    if (sec < 60) return sec + ' 秒';
    var m = Math.floor(sec / 60), s = sec % 60;
    return s ? m + ' 分 ' + s + ' 秒' : m + ' 分钟';
  }

  /* ---------------- 用量统计（不限额） ----------------
     OfferPilot 完全免费：这里只记录「今天建了几个任务」用于展示，
     不做任何次数限制、不做付费解锁、不设邀请门槛。 */
  var UNLIMITED = Infinity;

  function todayKey(now) {
    var d = new Date(now || Date.now());
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function quotaOf(q, now) {
    q = q || {};
    var today = todayKey(now);
    var used = q.day === today ? (q.used || 0) : 0;
    return {
      day: today,
      used: used,
      limit: UNLIMITED,
      remain: UNLIMITED,
      unlimited: true,
      records: q.records || []
    };
  }

  function consume(q, n, now) {
    if (!q) return { ok: true, quota: quotaOf(q, now) };
    var view = quotaOf(q, now);
    var cost = n == null ? 1 : n;
    q.day = view.day;
    q.used = (q.used && q.day === view.day ? q.used : 0) + cost;
    q.records = view.records || [];
    q.records.unshift({ at: nowISO(), delta: -cost, text: '创建 ' + cost + ' 个投递任务' });
    if (q.records.length > 60) q.records.length = 60;
    return { ok: true, quota: quotaOf(q, now) };
  }

  /* 邀请只用来分享，不再和额度挂钩 */
  function inviteText(origin) {
    return [
      '【OfferPilot · 网申领航】',
      '一份档案投遍全网申，AI 帮你把重复填表做完。完全免费，不限次数。',
      origin ? '安装地址：' + origin : ''
    ].filter(Boolean).join('\n');
  }

  global.Queue = {
    STATUS: STATUS,
    STATUS_NAME: STATUS_NAME,
    STATUS_TONE: STATUS_TONE,
    STEPS: STEPS,
    UNLIMITED: UNLIMITED,
    uid: uid,
    create: create,
    find: find,
    next: next,
    active: active,
    start: start,
    loaded: loaded,
    bindTab: bindTab,
    report: report,
    filled: filled,
    needInput: needInput,
    answer: answer,
    finish: finish,
    fail: fail,
    retry: retry,
    close: close,
    apply: apply,
    stats: stats,
    fmtDuration: fmtDuration,
    todayKey: todayKey,
    quotaOf: quotaOf,
    consume: consume,
    inviteText: inviteText
  };
})(typeof window !== 'undefined' ? window : self);
