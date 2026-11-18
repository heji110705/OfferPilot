/* =========================================================
   状态存储：localStorage 持久化 + 派生数据
   ========================================================= */
(function (global) {
  'use strict';

  var KEY = 'offerpilot.state.v1';
  var VERSION = 5;

  /* 所有字段都是选填：这些数组只是「容器」，空着不算缺陷 */
  var LIST_KEYS = ['certs', 'foreigns', 'families', 'awards', 'patents', 'papers', 'trainings'];

  function profileBase() {
    var p = JSON.parse(JSON.stringify(global.SeedData.profile));
    return normalizeProfile(p);
  }

  function normalizeProfile(p) {
    p.basic = p.basic || {};
    p.intent = p.intent || {};
    p.educations = p.educations || [];
    p.experiences = p.experiences || [];
    p.skills = p.skills || { tech: [], langs: [], certs: [] };
    p.skills.soft = p.skills.soft || [];
    p.skills.people = p.skills.people || [];
    LIST_KEYS.forEach(function (k) { p[k] = p[k] || []; });
    return p;
  }

  function defaultState() {
    var S = global.SeedData;
    return {
      version: VERSION,
      profile: profileBase(),
      resumes: JSON.parse(JSON.stringify(S.resumes)),
      apps: JSON.parse(JSON.stringify(S.apps)),
      files: JSON.parse(JSON.stringify(S.files)),
      /* 岗位池：收藏的岗位与手动导入的链接（内置岗位不落库，避免体积膨胀） */
      jobs: [],
      /* 自动网申任务队列 */
      queue: [],
      /* 用量统计（只记录，不限额） */
      quota: { day: '', used: 0, records: [] },
      settings: { llmKey: '', llmModel: 'gpt-4o-mini', llmBase: 'https://api.openai.com/v1', userName: '' },
      ui: { lastView: 'dashboard' },
      aiLog: []
    };
  }

  var state;
  var subs = [];

  /* v1 → v2：清掉早期版本随包分发的演示投递与演示附件 */
  var LEGACY_DEMO_APPS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];
  var LEGACY_DEMO_FILES = ['f1', 'f2'];

  /* v4 → v5：把「吉比特雷霆-数据分析」投递版加进简历库（对应 shixijianli/吉比特雷霆-数据分析/ 的定制 PDF）。
     简历版本只存定位（name/target/tags/summary）与经历顺序，内容仍来自共享档案；
     order 按「InsightPilot 在前」排（这份 JD 的主打），匹配不到的经历保持档案默认顺序，绝不虚构 id。 */
  function seedGbitsResume(parsed) {
    try {
      var resumes = parsed.resumes || (parsed.resumes = []);
      for (var i = 0; i < resumes.length; i++) {
        if (resumes[i] && /吉比特/.test(resumes[i].name || '')) return; /* 已有，不重复塞 */
      }
      var exps = (parsed.profile && parsed.profile.experiences) || [];
      var order = exps.filter(function (e) { return /insightpilot/i.test(e.org || ''); })
        .map(function (e) { return e.id; });
      exps.forEach(function (e) { if (order.indexOf(e.id) < 0) order.push(e.id); });
      resumes.push({
        id: 'r_gbits_data',
        name: '简历 · 吉比特雷霆-数据分析',
        target: '数据分析师（游戏数据分析方向）',
        tags: ['数据分析师', '自然语言取数', 'SQL', '实验评估', '游戏数据'],
        summary: '数据科学与大数据技术 2027 届。两条 AI 落地主线：自然语言取数平台（60 题评测 18.3%→50.0%，单题 ¥0.005）'
          + '与文档问答系统（124 题金标、四组消融，敢写负结论）；SQL / Python 扎实，结论都带实验设计；'
          + '长期深度体验《鸣潮》（353 小时 / 494 天），从玩家视角关注版本与社区数据讨论。',
        order: order,
        updatedAt: new Date().toISOString(),
        isDefault: false
      });
    } catch (e) { /* 种子失败不阻塞启动 */ }
  }

  function migrate(parsed) {
    if (!parsed) return null;
    if (parsed.version >= 1 && parsed.version < VERSION) {
      if (parsed.version === 1) {
        parsed.apps = (parsed.apps || []).filter(function (a) {
          return LEGACY_DEMO_APPS.indexOf(a.id) < 0;
        });
        parsed.files = (parsed.files || []).filter(function (f) {
          return LEGACY_DEMO_FILES.indexOf(f.id) < 0;
        });
      }
      if (parsed.version < 3) backfillV3(parsed.profile);
      /* v3 → v4：新增岗位池 / 队列 / 用量统计，缺失时由 fill() 补空容器 */
      if (parsed.version < 5) seedGbitsResume(parsed);
      parsed.version = VERSION;
    }
    if (parsed.version !== VERSION) return null;
    return parsed;
  }

  /* v2 → v3：经历从「bullets 数组」升级为「项目描述 / 职责 / 成果」结构化字段 */
  function backfillV3(p) {
    if (!p) return;
    p.basic = p.basic || {};
    p.intent = p.intent || {};
    (p.experiences || []).forEach(function (e) {
      if (!e.duties) e.duties = (e.bullets || []).filter(Boolean).join('\n');
      if (!e.period && global.ResumeFields) e.period = global.ResumeFields.periodOf(e);
    });
    (p.educations || []).forEach(function (e) {
      if (!e.period && global.ResumeFields) e.period = global.ResumeFields.periodOf(e);
    });
    ['certs', 'foreigns', 'families', 'awards', 'patents', 'papers', 'trainings'].forEach(function (k) {
      p[k] = p[k] || [];
    });
    p.skills = p.skills || { tech: [], langs: [], certs: [] };
    if (!p.skills.soft) p.skills.soft = [];
    if (!p.skills.people) p.skills.people = [];
  }

  /* 补齐缺失键，兼容旧数据 */
  function fill(parsed) {
    var base = defaultState();
    Object.keys(base).forEach(function (k) {
      if (parsed[k] === undefined) parsed[k] = base[k];
    });
    parsed.profile = normalizeProfile(parsed.profile || {});
    return parsed;
  }

  /* 同步读取镜像（localStorage），保证首屏不白屏；扩展环境下随后由 hydrate 校正 */
  function load() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(KEY);
      if (!raw) return null;
      var parsed = migrate(JSON.parse(raw));
      if (!parsed) return null;
      return fill(parsed);
    } catch (e) {
      return null;
    }
  }

  var saveTimer = null;

  function persist() {
    // 镜像先写，保证本页刷新可秒开
    try { global.localStorage && global.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 配额错误 */ }
    if (global.OPStorage && global.OPStorage.isExtension) {
      // 输入过程中高频触发，节流写入扩展存储
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { global.OPStorage.set(KEY, state); }, 300);
    }
  }

  function publish() {
    subs.forEach(function (fn) { try { fn(state); } catch (e) { console.warn(e); } });
  }

  function emit() {
    persist();
    publish();
  }

  /* 从 chrome.storage.local 水合并校正内存状态（跨上下文/跨标签页一致） */
  function hydrate() {
    if (!global.OPStorage || !global.OPStorage.isExtension) return Promise.resolve(state);
    return global.OPStorage.get(KEY).then(function (remote) {
      var normalized = migrate(remote);
      if (!normalized) { persist(); return state; }
      var next = fill(normalized);
      if (JSON.stringify(next) === JSON.stringify(state)) return state;
      state = next;
      publish();
      return state;
    });
  }

  /* 外部上下文写入后同步进内存，不再回写存储（避免回环） */
  function replace(next) {
    var normalized = migrate(next);
    if (!normalized) return false;
    if (JSON.stringify(normalized) === JSON.stringify(state)) return false;
    state = fill(normalized);
    publish();
    return true;
  }

  function get(obj, path) {
    if (!path) return undefined;
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      var p = parts[i];
      if (/^\d+$/.test(p)) cur = cur[Number(p)];
      else cur = cur[p];
    }
    return cur;
  }

  function isBlank(v) {
    if (v == null) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    return false;
  }

  /* 把任意档案值转成表单可显示的文本 */
  function toText(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) {
      if (!v.length) return '';
      if (typeof v[0] === 'string') return v.join('；');
      return v.map(toText).join('\n');
    }
    if (typeof v === 'object') {
      var head = [v.org || v.name || v.title, v.role].filter(Boolean).join('｜');
      var period = [v.start, v.end].filter(Boolean).join(' – ');
      var line = [head, period].filter(Boolean).join('　');
      var body = [];
      if (v.desc) body.push(v.desc);
      if (v.duties) body.push(v.duties);
      if (v.results) body.push(v.results);
      if (!body.length) body = (v.bullets || []).filter(Boolean);
      var bullets = body.map(function (b) { return '• ' + b; }).join('\n');
      return line + (bullets ? '\n' + bullets : '');
    }
    return String(v);
  }

  /* resume 可选：按匹配到的版本调整「经历先后」与「自我评价」——
     同一份档案，不同岗位版本会把最相关的经历排到前面。 */
  function resolveField(field, resume) {
    if (field.type === 'file') {
      var f = state.files.filter(function (x) { return x.kind === field.kind; })[0];
      return { ok: !!f, value: f || null, text: f ? f.name : '', from: '材料库' };
    }
    if (field.value && (!field.map || isBlank(get(state.profile, field.map)))) {
      // 岗位特化字段（如意向岗位），以表单默认值为准
      return { ok: true, value: field.value, text: field.value, from: '岗位信息' };
    }

    /* 版本感知：实习 / 项目 / 校园经历取本版本排在最前的那一条 */
    if (resume && global.ResumeMatch && /^(intern|project|campus)$/.test(field.key)) {
      var list = global.ResumeMatch.experiencesOf(state.profile, resume).filter(function (e) {
        return e.type === field.key;
      });
      var top = list[0];
      if (top) return { ok: true, value: top, text: toText(top), from: '经历库 · 按版本排序' };
    }
    if (resume && field.key === 'selfEval' && !isBlank(resume.summary)) {
      return { ok: true, value: resume.summary, text: resume.summary, from: '简历版本概述' };
    }

    if (!field.map) return { ok: false, value: null, text: '', from: null };
    var v = get(state.profile, field.map);
    if (isBlank(v)) return { ok: false, value: null, text: '', from: null };
    return { ok: true, value: v, text: toText(v), from: field.type === 'textarea' ? '经历库 · AI 润色' : '我的档案' };
  }

  /* ---------------- 完整度 ---------------- */
  var COMPLETE_CHECKS = [
    { w: 10, label: '姓名/电话/邮箱', test: function (p) { return !!(p.basic.name && p.basic.phone && p.basic.email); } },
    { w: 8, label: '求职意向', test: function (p) { return !!(p.basic.targetRole && p.basic.targetCity); } },
    { w: 8, label: '自我评价', test: function (p) { return !!p.basic.selfEval; } },
    { w: 12, label: '教育背景', test: function (p) { return !!(p.educations[0] && p.educations[0].school && p.educations[0].major); } },
    { w: 10, label: 'GPA / 排名', test: function (p) { return !!(p.educations[0] && p.educations[0].gpa); } },
    { w: 14, label: '实习经历', test: function (p) { return p.experiences.some(function (e) { return e.type === 'intern'; }); } },
    { w: 12, label: '项目经历', test: function (p) { return p.experiences.filter(function (e) { return e.type === 'project'; }).length > 0; } },
    { w: 8, label: '技能标签', test: function (p) { return p.skills.tech.length >= 3; } },
    { w: 8, label: '获奖 / 证书', test: function (p) { return p.skills.certs.length > 0; } },
    { w: 10, label: '简历附件', test: function () { return state.files.some(function (f) { return f.kind === 'resume'; }); } }
  ];

  function completeness() {
    var total = 0, got = 0, missing = [];
    COMPLETE_CHECKS.forEach(function (c) {
      total += c.w;
      var ok = false;
      try { ok = !!c.test(state.profile); } catch (e) { ok = false; }
      if (ok) got += c.w; else missing.push(c.label);
    });
    return { percent: Math.round((got / total) * 100), missing: missing };
  }

  /* ---------------- 统计 ---------------- */
  function stats() {
    var by = {};
    global.SeedData.stages.forEach(function (s) { by[s.key] = 0; });
    state.apps.forEach(function (a) { by[a.status] = (by[a.status] || 0) + 1; });
    var active = state.apps.filter(function (a) { return ['applied', 'written', 'interview'].indexOf(a.status) >= 0; }).length;
    var withMatch = state.apps.filter(function (a) { return a.match; });
    var avg = withMatch.length ? Math.round(withMatch.reduce(function (s, a) { return s + a.match; }, 0) / withMatch.length) : 0;
    var week = state.apps.filter(function (a) {
      var t = new Date(a.createdAt).getTime();
      return Date.now() - t < 7 * 86400000;
    }).length;
    var upcoming = state.apps.filter(function (a) {
      var d = global.UI.daysLeft(a.deadline);
      return d != null && d >= 0 && d <= 3 && a.status !== 'rejected' && a.status !== 'offer';
    }).sort(function (x, y) { return global.UI.daysLeft(x.deadline) - global.UI.daysLeft(y.deadline); });
    return { by: by, active: active, avgMatch: avg, week: week, upcoming: upcoming, total: state.apps.length };
  }

  /* ---------------- 变更操作 ---------------- */
  function setProfile(path, value) {
    var parts = String(path).split('.');
    var cur = state.profile;
    for (var i = 0; i < parts.length - 1; i++) {
      var p = parts[i];
      if (/^\d+$/.test(p)) cur = cur[Number(p)];
      else { if (!cur[p]) cur[p] = {}; cur = cur[p]; }
      if (!cur) return;
    }
    var last = parts[parts.length - 1];
    if (/^\d+$/.test(last)) cur[Number(last)] = value;
    else cur[last] = value;
    emit();
  }

  /* --------- 简历栏目：重复型条目 --------- */
  function listOf(sectionKey) {
    var RF = global.ResumeFields;
    var p = state.profile;
    var t = RF.EXP_TYPES[sectionKey];
    if (t) return p.experiences;
    var k = RF.LISTS[sectionKey];
    if (!k) return null;
    p[k] = p[k] || [];
    return p[k];
  }

  function findItem(sectionKey, id) {
    var arr = listOf(sectionKey) || [];
    return arr.filter(function (x) { return x.id === id; })[0] || null;
  }

  function addItem(sectionKey) {
    var RF = global.ResumeFields;
    var item = RF.newItem(sectionKey);
    var arr = listOf(sectionKey);
    if (!arr) return null;
    arr.push(item);
    emit();
    return item;
  }

  function removeItem(sectionKey, id) {
    var RF = global.ResumeFields;
    var p = state.profile;
    var t = RF.EXP_TYPES[sectionKey];
    if (t) p.experiences = p.experiences.filter(function (x) { return !(x.id === id && x.type === t); });
    else {
      var k = RF.LISTS[sectionKey];
      if (!k) return;
      p[k] = (p[k] || []).filter(function (x) { return x.id !== id; });
    }
    emit();
  }

  function setItem(sectionKey, id, key, value) {
    var item = findItem(sectionKey, id);
    if (!item) return;
    item[key] = value;
    if (key === 'start' || key === 'end') item.period = global.ResumeFields.periodOf(item);
    emit();
  }

  /* 上移 / 下移：只在同类型条目内部交换，避免打乱其它经历 */
  function moveItem(sectionKey, id, dir) {
    var RF = global.ResumeFields;
    var arr = RF.items(state.profile, sectionKey);
    var i = -1;
    for (var n = 0; n < arr.length; n++) if (arr[n].id === id) i = n;
    if (i < 0) return false;
    var j = i + (dir < 0 ? -1 : 1);
    if (j < 0 || j >= arr.length) return false;
    var a = arr[i], b = arr[j];
    if (RF.EXP_TYPES[sectionKey]) {
      var all = state.profile.experiences;
      var ia = all.indexOf(a), ib = all.indexOf(b);
      all[ia] = b; all[ib] = a;
    } else {
      var k = RF.LISTS[sectionKey], list = state.profile[k];
      var ka = list.indexOf(a), kb = list.indexOf(b);
      list[ka] = b; list[kb] = a;
    }
    emit();
    return true;
  }

  function setSectionField(sectionKey, key, value) {
    var RF = global.ResumeFields;
    if (sectionKey === 'skill') {
      var sk = state.profile.skills;
      var arr = String(value || '').split(/[；;\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (key === 'techSkills') sk.tech = arr;
      if (key === 'langSkills') sk.langs = arr;
      if (key === 'softSkills') sk.soft = arr;
      if (key === 'peopleSkills') sk.people = arr;
      emit();
      return;
    }
    var sec = RF.section(sectionKey);
    sec.fields.forEach(function (f) {
      if (f.key !== key) return;
      if (f.path) setProfile(f.path, value);
      else setProfile(sectionKey + '.' + key, value);
    });
  }

  function touchResume(resume) {
    if (resume) resume.updatedAt = new Date().toISOString();
  }

  var Store = {
    get state() { return state; },
    KEY: KEY,
    VERSION: VERSION,
    defaultState: defaultState,
    init: function () { state = load() || defaultState(); return state; },
    hydrate: hydrate,
    replace: replace,
    subscribe: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (x) { return x !== fn; }); }; },
    emit: emit,
    persist: persist,

    reset: function () {
      state = defaultState();
      emit();
    },

    /* profile */
    setProfile: setProfile,
    setSectionField: setSectionField,
    addItem: addItem,
    removeItem: removeItem,
    setItem: setItem,
    moveItem: moveItem,
    listOf: listOf,
    findItem: findItem,
    addExperience: function (type) {
      var exp = {
        id: global.UI.uid('exp'), type: type || 'project', org: '新的经历', role: '',
        start: '', end: '', city: '', tags: [], bullets: [], desc: '', duties: '', results: ''
      };
      state.profile.experiences.push(exp);
      emit();
      return exp;
    },
    removeExperience: function (id) {
      state.profile.experiences = state.profile.experiences.filter(function (e) { return e.id !== id; });
      emit();
    },

    /* files */
    addFile: function (file) {
      var kind = /作品|portfolio/i.test(file.name) ? 'work'
        : /照片|证件照|头像|photo|avatar/i.test(file.name) ? 'photo'
        : /简历|resume/i.test(file.name) ? 'resume'
        : /成绩|transcript/i.test(file.name) ? 'transcript' : 'cert';
      var rec = {
        id: global.UI.uid('f'), name: file.name, size: file.size, type: file.type,
        kind: kind, uploadedAt: new Date().toISOString()
      };
      state.files.unshift(rec);
      /* 存文件本体（dataUrl），网申页的「上传简历」才能由插件自动塞进文件框。
         简历 PDF 一般 1-3MB，8MB 上限 + manifest 的 unlimitedStorage 足够。 */
      if (file.size < 8 * 1024 * 1024) {
        var reader = new FileReader();
        reader.onload = function () { rec.dataUrl = reader.result; persist(); };
        reader.readAsDataURL(file);
      }
      emit();
      return rec;
    },
    removeFile: function (id) {
      state.files = state.files.filter(function (f) { return f.id !== id; });
      emit();
    },
    filesByKind: function (kind) {
      return state.files.filter(function (f) { return f.kind === kind; });
    },

    /* resumes */
    addResume: function (data) {
      var r = {
        id: global.UI.uid('r'), name: data.name || '新简历', target: data.target || '',
        tags: data.tags || [], summary: data.summary || '', order: data.order || ['exp1', 'exp2', 'exp3'],
        updatedAt: new Date().toISOString(), isDefault: false
      };
      state.resumes.push(r);
      emit();
      return r;
    },
    removeResume: function (id) {
      var r = state.resumes.filter(function (x) { return x.id === id; })[0];
      if (r && r.isDefault) return false;
      state.resumes = state.resumes.filter(function (x) { return x.id !== id; });
      emit();
      return true;
    },
    setDefaultResume: function (id) {
      state.resumes.forEach(function (r) { r.isDefault = r.id === id; });
      emit();
    },
    updateResume: function (id, patch) {
      var r = state.resumes.filter(function (x) { return x.id === id; })[0];
      if (!r) return;
      Object.assign(r, patch);
      r.updatedAt = new Date().toISOString();
      emit();
    },

    /* apps */
    addApp: function (data) {
      var app = {
        id: global.UI.uid('a'),
        company: data.company, role: data.role, city: data.city || '',
        status: data.status || 'applied', match: data.match || 0,
        resumeId: data.resumeId || (state.resumes.filter(function (r) { return r.isDefault; })[0] || state.resumes[0] || {}).id,
        deadline: data.deadline || '',
        salary: data.salary || '', channel: data.channel || '校招官网',
        note: data.note || '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        timeline: [{ at: new Date().toISOString(), text: data.firstLog || '完成网申并提交', status: data.status || 'applied' }]
      };
      state.apps.unshift(app);
      emit();
      return app;
    },
    updateApp: function (id, patch) {
      var a = state.apps.filter(function (x) { return x.id === id; })[0];
      if (!a) return;
      Object.assign(a, patch);
      a.updatedAt = new Date().toISOString();
      emit();
    },
    moveApp: function (id, status) {
      var a = state.apps.filter(function (x) { return x.id === id; })[0];
      if (!a || a.status === status) return;
      var stage = global.SeedData.stages.filter(function (s) { return s.key === status; })[0];
      a.status = status;
      a.updatedAt = new Date().toISOString();
      a.timeline.push({ at: a.updatedAt, text: '状态更新为「' + stage.name + '」', status: status });
      emit();
    },
    removeApp: function (id) {
      state.apps = state.apps.filter(function (a) { return a.id !== id; });
      emit();
    },

    /* 把「简历解析结果」写入档案：经验替换、字段更新、生成新简历版本 */
    applyParsed: function (parsed, opts) {
      opts = opts || {};
      var profile = state.profile;
      var filled = [];

      function put(path, value) {
        if (value == null || String(value).trim() === '') return;
        var parts = String(path).split('.');
        var cur = profile;
        for (var i = 0; i < parts.length - 1; i++) {
          var key = parts[i];
          if (!cur[key]) cur[key] = {};
          cur = cur[key];
        }
        cur[parts[parts.length - 1]] = value;
        filled.push(path);
      }

      var b = parsed.basic || {};
      [['name', 'basic.name'], ['gender', 'basic.gender'], ['birth', 'basic.birth'],
        ['political', 'basic.political'], ['phone', 'basic.phone'], ['email', 'basic.email'],
        ['wechat', 'basic.wechat'], ['hometown', 'basic.hometown']].forEach(function (pair) {
        put(pair[1], b[pair[0]]);
      });
      if (b.city) {
        if (!profile.basic.targetCity) put('basic.targetCity', b.city);
        if (!profile.basic.address) put('basic.address', b.city);
      }

      var e = parsed.education || {};
      if (!profile.educations.length) profile.educations.push({ id: 'edu1' });
      ['school', 'college', 'major', 'degree', 'start', 'end', 'gpa', 'rank', 'courses'].forEach(function (k) {
        if (e[k]) { profile.educations[0][k] = e[k]; filled.push('edu.' + k); }
      });

      function toExp(src, type) {
        var id = global.UI.uid('exp');
        var tags = [];
        var bullets = (src.bullets || []).slice(0, 8);
        var hay = [src.org, src.role, src.tech].concat(bullets).join(' ');
        (global.SeedData.skillDict || []).forEach(function (s) {
          if (tags.length < 6 && hay.toLowerCase().indexOf(String(s).toLowerCase()) >= 0) tags.push(s);
        });
        // 技术栈没有独立字段，并进「项目描述」首行；描述为空时它就是唯一内容
        var desc = [src.tech ? '技术栈：' + src.tech : '', src.desc || '']
          .filter(function (x) { return x; }).join('\n');
        return {
          id: id, type: type || 'project', org: src.org || '', role: src.role || '',
          start: src.start || '', end: src.end || '', city: src.city || '',
          practice: src.practice || '',
          teamSize: src.teamSize || '',
          desc: desc,
          duties: src.duties || bullets.join('\n'),
          results: src.results || '',
          period: global.ResumeFields ? global.ResumeFields.periodOf(src) : '',
          tags: tags, bullets: bullets
        };
      }

      var incoming = [];
      (parsed.projects || []).forEach(function (x) { incoming.push(toExp(x, 'project')); });
      (parsed.interns || []).forEach(function (x) { incoming.push(toExp(x, 'intern')); });
      (parsed.campus || []).forEach(function (x) { incoming.push(toExp(x, 'campus')); });

      if (incoming.length) {
        // 解析出经历时整体替换：简历是唯一事实来源，避免旧内容混进新简历
        var kept = opts.merge ? profile.experiences.filter(function (x) {
          return !incoming.some(function (y) { return y.type === x.type; });
        }) : [];
        profile.experiences = incoming.concat(kept);
      }

      var sk = parsed.skills || {};
      function merge(list, add) {
        (add || []).forEach(function (x) {
          if (x && list.indexOf(x) < 0) list.push(x);
        });
      }
      profile.skills = profile.skills || { tech: [], langs: [], certs: [] };
      profile.skills.tech = profile.skills.tech || [];
      profile.skills.langs = profile.skills.langs || [];
      profile.skills.certs = profile.skills.certs || [];
      merge(profile.skills.tech, sk.tech);
      merge(profile.skills.langs, sk.langs);
      merge(profile.skills.certs, sk.certs);

      if (parsed.summary) profile.basic.selfEval = parsed.summary;

      if (opts.fileName) {
        var dup = state.files.filter(function (f) { return f.name === opts.fileName; })[0];
        if (!dup) {
          state.files.unshift({
            id: global.UI.uid('f'), name: opts.fileName, size: opts.size || 0,
            type: 'application/pdf', kind: 'resume', uploadedAt: new Date().toISOString()
          });
        }
      }

      var order = profile.experiences.map(function (x) { return x.id; });
      var baseName = (opts.fileName || '').replace(/\.pdf$/i, '').trim();
      var resume = {
        id: global.UI.uid('r'),
        name: baseName || ('简历 · ' + (profile.basic.targetRole || '上传版')),
        target: profile.basic.targetRole || '',
        tags: (profile.skills.tech || []).slice(0, 4),
        summary: parsed.summary || profile.basic.selfEval || '',
        order: order,
        updatedAt: new Date().toISOString(),
        isDefault: state.resumes.length === 0
      };
      state.resumes.push(resume);

      emit();
      return {
        resume: resume,
        projects: (parsed.projects || []).length,
        into: filled.length,
        summary: '项目 ' + (parsed.projects || []).length + ' 个 / 实习 ' + (parsed.interns || []).length +
          ' 个 / 字段 ' + filled.length + ' 项'
      };
    },

    /* ---------------- 岗位池 ---------------- */
    jobs: function () { return state.jobs || []; },
    jobById: function (id) {
      return (state.jobs || []).filter(function (j) { return j.id === id; })[0] || null;
    },
    isJobSaved: function (id) {
      return (state.jobs || []).some(function (j) { return j.id === id; });
    },
    /* 收藏 = 把岗位快照存进本地，之后即使岗位池更新也不会丢 */
    saveJob: function (job) {
      if (!job || !job.id) return null;
      var hit = state.jobs.filter(function (j) { return j.id === job.id; })[0];
      if (hit) return hit;
      var rec = {};
      ['id', 'company', 'role', 'city', 'type', 'typeName', 'industry', 'degree', 'salary',
        'url', 'deadline', 'summary', 'tags', 'duty', 'req', 'text'].forEach(function (k) {
        if (job[k] !== undefined) rec[k] = job[k];
      });
      rec.source = job.source || 'seed';
      rec.savedAt = new Date().toISOString();
      state.jobs.unshift(rec);
      emit();
      return rec;
    },
    unsaveJob: function (id) {
      state.jobs = (state.jobs || []).filter(function (j) { return j.id !== id; });
      emit();
    },
    /* 手动导入：粘贴企业官网链接或整段 JD */
    addCustomJob: function (data) {
      var g = global.JobData ? global.JobData.guess((data.role || '') + ' ' + (data.text || '') + ' ' + (data.company || '')) : {};
      var rec = {
        id: global.UI.uid('cj'),
        company: (data.company || g.company || '待补企业').trim(),
        role: (data.role || g.role || '待补岗位').trim(),
        city: data.city || g.city || '',
        type: data.type || 'campus',
        typeName: data.type === 'intern' ? '实习' : '校招',
        industry: data.industry || '其他',
        degree: data.degree || '',
        salary: '',
        url: (data.url || '').trim(),
        deadline: data.deadline || '',
        summary: (data.summary || '').slice(0, 60),
        tags: [],
        duty: [],
        req: [],
        text: [data.company, data.role, data.text].filter(Boolean).join(' ').slice(0, 4000),
        source: 'custom',
        savedAt: new Date().toISOString()
      };
      state.jobs.unshift(rec);
      emit();
      return rec;
    },

    /* ---------------- 投递队列 ---------------- */
    tasks: function () { return state.queue || []; },
    taskById: function (id) {
      return (state.queue || []).filter(function (t) { return t.id === id; })[0] || null;
    },
    enqueue: function (job, opts) {
      if (!global.Queue) return null;
      opts = opts || {};
      var t = global.Queue.create(job, opts);
      state.queue.unshift(t);
      emit();
      return t;
    },
    taskEvent: function (id, ev, payload) {
      if (!global.Queue) return null;
      var t = global.Queue.apply(state.queue, id, ev, payload);
      emit();
      return t;
    },
    removeTask: function (id) {
      state.queue = (state.queue || []).filter(function (t) { return t.id !== id; });
      emit();
    },
    /* 只清「已完成 / 失败 / 已关闭」，进行中的任务不动 */
    clearTasks: function (statuses) {
      var keep = statuses || ['done', 'failed', 'closed'];
      state.queue = (state.queue || []).filter(function (t) { return keep.indexOf(t.status) < 0; });
      emit();
    },

    /* ---------------- 用量统计（完全免费，不限额） ---------------- */
    quota: function () {
      return global.Queue
        ? global.Queue.quotaOf(state.quota)
        : { limit: Infinity, used: 0, remain: Infinity, unlimited: true, records: [] };
    },
    /* 只记录「今天建了几个任务」，永远返回成功 */
    consumeQuota: function (n) {
      if (!global.Queue) return { ok: true };
      var r = global.Queue.consume(state.quota, n);
      emit();
      return r;
    },
    usage: function () {
      return this.quota();
    },

    /* settings */
    setSetting: function (k, v) {
      state.settings[k] = v;
      emit();
    },

    /* derived */
    get: get,
    resolveField: resolveField,
    toText: toText,
    isBlank: isBlank,
    completeness: completeness,
    resumeStats: function () {
      return global.ResumeFields ? global.ResumeFields.overall(state.profile) : null;
    },
    sectionStat: function (key) {
      return global.ResumeFields ? global.ResumeFields.sectionStat(state.profile, key) : null;
    },
    stats: stats
  };

  global.Store = Store;
})(window);
