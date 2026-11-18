/* =========================================================
   简历匹配与内容导出（双端共用）
   - 从页面标题 / h1 / 正文里抽岗位与企业，判断岗位方向
   - 用「岗位方向 + 关键词 + 版本定位」给简历版本打分，选最合适的一份
   - 导出简历全文 / 分栏目文本，供浮窗「简历导航 · 点击复制」使用
   纯函数：不碰 DOM、不碰 Store，只吃 state + job
   ========================================================= */
(function (global) {
  'use strict';

  var VERSION = 1;

  /* ---------------- 基础工具 ---------------- */
  function str(v) { return v == null ? '' : String(v); }

  function clean(s) {
    return str(s)
      .replace(/[\u200b-\u200d\ufeff]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^[\s·•\-—_|｜]+|[\s·•\-—_|｜]+$/g, '')
      .trim();
  }

  function norm(s) {
    return str(s)
      .replace(/[\u3000]/g, ' ')
      .replace(/[（(]/g, ' ')
      .replace(/[）)]/g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function has(n, kw) { return !!kw && n.indexOf(norm(kw)) >= 0; }

  /* ---------------- 岗位方向词表 ----------------
     只用于「判断方向」，不追求覆盖所有职位。
     命中越具体的方向词权重越高，避免「数据」这种泛词主导。
  ------------------------------------------- */
  var DIRS = [
    { key: 'data', name: '数据分析', words: ['数据分析', '数据运营', '商业分析', '数据挖掘', '指标体系', '数据看板', '报表开发', 'sql', 'tableau', 'power bi', 'ab 测试', 'a/b 测试', '用户增长', '数据科学'] },
    { key: 'backend', name: '后端开发', words: ['后端', '服务端', 'java', 'django', 'flask', 'spring', 'mysql', 'redis', '微服务', 'restful', '接口开发'] },
    { key: 'frontend', name: '前端开发', words: ['前端', 'vue', 'react', 'javascript', 'typescript', 'h5', 'css', '小程序开发', 'web 开发'] },
    { key: 'algorithm', name: '算法', words: ['算法', '机器学习', '深度学习', '自然语言', 'nlp', '推荐系统', '计算机视觉', 'pytorch', 'tensorflow', '模型训练', '人工智能', '大模型', 'llm', 'aigc', 'ai应用', 'ai 应用', 'ai工程', '智能体', 'agent'] },
    { key: 'product', name: '产品', words: ['产品经理', '产品运营', '产品助理', '产品专员', '需求分析', '原型', 'prd', '产品设计'] },
    { key: 'operation', name: '运营', words: ['运营', '活动策划', '用户运营', '内容运营', '社群', '新媒体', '用户分层', '增长运营'] },
    { key: 'test', name: '测试', words: ['测试工程师', '软件测试', '自动化测试', '测试用例', 'qa'] },
    { key: 'design', name: '设计', words: ['视觉设计', '交互设计', 'ui 设计', 'ux', '平面设计', '设计规范'] },
    { key: 'sales', name: '销售商务', words: ['销售', '商务', '客户经理', '渠道', 'bd'] },
    { key: 'hr', name: '人力资源', words: ['人力资源', '招聘专员', '人事', '薪酬', 'hrbp'] },
    { key: 'finance', name: '财务金融', words: ['财务', '会计', '审计', '金融', '风控', '税务'] }
  ];

  /* 岗位名的常见尾缀：用来从标题里切出岗位 */
  var ROLE_TAIL = /(工程师|分析师|运营|专员|经理|助理|实习生|开发|设计师|研究员|顾问|主管|总监|架构师|测试|产品|销售|管培生|算法|策划|编辑|讲师|教师|会计|审计|法务|采购|客服|美工|摄影)/;

  /* 章节标题不能当岗位 */
  var NOT_ROLE = /^(实习经历|工作经历|项目经历|教育背景|个人信息|自我评价|校园经历|技能特长|专业技能|求职意向|岗位职责|任职要求|职位描述|公司简介|关于我们|招聘岗位|职位列表|搜索结果)$/;

  /* ---------------- 岗位方向识别 ---------------- */
  function dirsOf(input) {
    var n = norm(input);
    var out = [];
    if (!n) return out;
    DIRS.forEach(function (d) {
      var hits = [];
      d.words.forEach(function (w) { if (has(n, w)) hits.push(w); });
      if (hits.length) out.push({ key: d.key, name: d.name, hits: hits, weight: hits.length });
    });
    out.sort(function (a, b) { return b.weight - a.weight || b.hits[0].length - a.hits[0].length; });
    return out;
  }

  /* ---------------- 从页面信息里抽岗位 ---------------- */
  function extractJob(input) {
    input = input || {};
    var title = clean(input.title);
    var host = clean(input.host).replace(/^www\./, '');
    var h1 = clean(input.h1);
    var subtitle = clean(input.subtitle);
    var text = str(input.text).slice(0, 8000);

    var segs = title.split(/\s*[-_|｜—–·]\s*/).map(clean).filter(Boolean);
    var company = (segs[0] || '')
      .replace(/校园招聘|社会招聘|招聘官网|招聘网站|招聘|官网|网申|职位详情|工作机会|首页/g, '')
      .trim();

    /* 1) 正文里的标签式写法最可靠：应聘岗位：数据分析师 */
    var role = '';
    var labelled = /(?:应聘岗位|应聘职位|申请职位|申请岗位|目标岗位|职位名称|岗位名称|职位|岗位)[:：]\s*([^\n，,。；;|｜]{2,24})/.exec(text);
    if (labelled) role = clean(labelled[1]);

    /* 2) 标题 / h1 里带岗位尾缀的片段 */
    if (!role) {
      var cands = [h1, subtitle].concat(segs).filter(Boolean);
      for (var i = 0; i < cands.length; i++) {
        var c = cands[i];
        if (c.length < 2 || c.length > 26) continue;
        if (NOT_ROLE.test(c)) continue;
        if (ROLE_TAIL.test(c)) { role = c; break; }
      }
    }

    /* 3) 正文前 40 行里的短行，且以岗位尾缀收尾 */
    if (!role) {
      var lines = text.split(/\n+/).map(clean).filter(Boolean).slice(0, 40);
      for (var j = 0; j < lines.length; j++) {
        var l = lines[j];
        if (l.length < 2 || l.length > 18) continue;
        if (NOT_ROLE.test(l)) continue;
        if (ROLE_TAIL.test(l)) { role = l; break; }
      }
    }

    role = role.replace(/^(应聘|申请|目标)/, '').replace(/[（(].*?[)）]$/, '').trim().slice(0, 24);

    var dirs = dirsOf([role, role, text.slice(0, 3000)].join(' '));
    return {
      company: company.slice(0, 30) || host,
      role: role,
      host: host,
      title: title.slice(0, 120),
      text: text,
      dirs: dirs
    };
  }

  /* ---------------- 简历版本打分 ---------------- */
  /* 版本定位只看「名称 / 目标岗位 / 标签 / 概述」。
     经历放进来会把所有版本都拉成「数据分析」——因为同一份档案里的经历是共享的。 */
  function resumeHaystack(resume) {
    return [resume.name, resume.target, (resume.tags || []).join(' '), resume.summary]
      .filter(Boolean).join(' ');
  }

  /* 版本里排在最前的两段经历，用来判断这个版本「主打哪段经历」 */
  function expHaystack(resume, profile) {
    var order = (resume && resume.order) || [];
    var all = (profile && profile.experiences) || [];
    var parts = [];
    order.slice(0, 2).forEach(function (id) {
      var e = all.filter(function (x) { return x.id === id; })[0];
      if (e) parts.push(e.org, e.role, (e.tags || []).join(' '));
    });
    return parts.filter(Boolean).join(' ');
  }

  function scoreResume(resume, job, profile) {
    var rText = resumeHaystack(resume, profile);
    var rDirs = dirsOf(rText);
    var jDirs = (job && job.dirs && job.dirs.length) ? job.dirs
      : dirsOf([job && job.role, str(job && job.text).slice(0, 3000)].join(' '));

    var out = { score: null, reasons: [], hits: [], misses: [], rdirs: rDirs, jdirs: jDirs, empty: true };
    if (!jDirs.length && !(job && job.role)) {
      out.reasons.push('页面里没有可识别的岗位信息');
      return out;
    }

    var score = 44;
    var reason = [];

    if (jDirs.length) {
      /* 岗位可能同时属于两个方向（如「产品运营」），前两个方向都算分，
         第二方向权重减半，避免因为词表排序把结果判反。 */
      var gained = 0;
      var matched = [];
      jDirs.slice(0, 2).forEach(function (d, rank) {
        var idx = -1;
        for (var i = 0; i < rDirs.length; i++) { if (rDirs[i].key === d.key) { idx = i; break; } }
        if (idx < 0) return;
        var add = (idx === 0 ? 40 : 20) * (rank === 0 ? 1 : 0.5);
        gained += add;
        matched.push({ dir: d, idx: idx });
      });
      gained = Math.min(44, Math.round(gained));
      score += gained;
      if (matched.length) {
        var first = matched[0];
        if (first.idx === 0) reason.push('岗位方向「' + first.dir.name + '」与本版本定位一致');
        else reason.push('本版本覆盖「' + first.dir.name + '」，但主定位是「' + rDirs[0].name + '」');
      } else {
        score -= 8;
        reason.push('本版本没有「' + jDirs[0].name + '」方向的内容');
      }
    } else if (job.role) {
      score += 4;
      reason.push('识别到岗位名「' + job.role + '」，但方向不明确');
    }

    var jn = norm([job && job.role, str(job && job.text).slice(0, 4000)].join(' '));
    var hits = [];
    (resume.tags || []).forEach(function (t) {
      if (t && has(jn, t) && hits.indexOf(t) < 0) hits.push(t);
    });
    /* 版本主打经历里的标签，算少量加分（避免和上面重复计满） */
    var expHits = [];
    (resume.order || []).slice(0, 2).forEach(function (id) {
      var e = ((profile && profile.experiences) || []).filter(function (x) { return x.id === id; })[0];
      if (!e) return;
      (e.tags || []).forEach(function (t) {
        if (t && has(jn, t) && hits.indexOf(t) < 0 && expHits.indexOf(t) < 0) expHits.push(t);
      });
    });
    if (hits.length) {
      score += Math.min(14, hits.length * 4);
      reason.push('命中岗位关键词：' + hits.slice(0, 3).join('、'));
    }
    if (expHits.length) {
      score += Math.min(6, expHits.length * 2);
      reason.push('主打经历里有「' + expHits.slice(0, 2).join('、') + '」');
    }

    if (job.role && resume.target && norm(resume.target).indexOf(norm(job.role)) >= 0) {
      score += 10;
      reason.push('目标岗位名称直接命中');
    }
    if (resume.isDefault) score += 2;

    score = Math.max(28, Math.min(96, Math.round(score)));
    var level = score >= 85 ? '高度匹配' : score >= 72 ? '较为匹配' : score >= 58 ? '可以尝试' : '匹配偏弱';
    var misses = jDirs.slice(0, 2).filter(function (d) {
      return !rDirs.some(function (r) { return r.key === d.key; });
    }).map(function (d) { return d.name; });

    return {
      score: score, level: level, reasons: reason, hits: hits, misses: misses,
      rdirs: rDirs, jdirs: jDirs, empty: false
    };
  }

  /* 排序 + 选最佳；全都没信号时回落到默认版本 */
  function rank(resumes, job, profile) {
    var list = (resumes || []).map(function (r) {
      var s = scoreResume(r, job, profile);
      return {
        resume: r, score: s.score, level: s.level, reasons: s.reasons,
        hits: s.hits, misses: s.misses, dirs: s.jdirs, empty: s.empty
      };
    });

    list.sort(function (a, b) {
      var sa = a.score == null ? -1 : a.score;
      var sb = b.score == null ? -1 : b.score;
      if (sb !== sa) return sb - sa;
      if (a.resume.isDefault !== b.resume.isDefault) return a.resume.isDefault ? -1 : 1;
      return 0;
    });

    var best = list[0] || null;
    if (!best) {
      return { best: null, list: [], job: job, unanswered: true, reason: '还没有简历版本' };
    }
    if (best.score == null) {
      var def = list.filter(function (x) { return x.resume.isDefault; })[0] || best;
      return {
        best: def, list: list, job: job, unanswered: true,
        reason: '没识别到岗位方向，先按默认简历填写'
      };
    }
    return { best: best, list: list, job: job, unanswered: false, reason: best.reasons[0] || '' };
  }

  /* ---------------- 简历内容导出 ---------------- */
  function periodOf(e) {
    if (!e) return '';
    if (e.period) return e.period;
    return [e.start, e.end].filter(Boolean).join(' - ');
  }

  function experiencesOf(profile, resume) {
    var all = ((profile && profile.experiences) || []).slice();
    var order = (resume && resume.order) || [];
    var picked = [];
    order.forEach(function (id) {
      var e = all.filter(function (x) { return x.id === id; })[0];
      if (e && picked.indexOf(e) < 0) picked.push(e);
    });
    all.forEach(function (e) { if (picked.indexOf(e) < 0) picked.push(e); });
    return picked;
  }

  function bulletsOf(e) {
    var out = [];
    if (e.duties) out = out.concat(str(e.duties).split('\n'));
    if (e.results) out = out.concat(str(e.results).split('\n'));
    if (!out.filter(Boolean).length) out = (e.bullets || []).slice();
    return out.map(function (b) { return clean(str(b).replace(/^[•·\-*]\s*/, '')); }).filter(Boolean);
  }

  function expBlock(e) {
    var head = [e.org, e.role].filter(Boolean).join('｜');
    var period = periodOf(e);
    var line = [head, period].filter(Boolean).join('　');
    var body = [];
    if (e.desc) body.push(clean(e.desc));
    bulletsOf(e).forEach(function (b) { body.push('· ' + b); });
    return line + (body.length ? '\n' + body.join('\n') : '');
  }

  /* 分栏目：供「简历闪填」的导航与字段 chips 使用 */
  function sections(state, resume) {
    var p = (state && state.profile) || {};
    var b = p.basic || {};
    var edu = (p.educations || [])[0] || {};
    var skills = p.skills || {};
    var exps = experiencesOf(p, resume);
    var out = [];

    function sec(key, name, fields) {
      var list = fields.filter(function (f) { return clean(f.value); });
      if (!list.length) return;
      out.push({
        key: key, name: name, count: list.length,
        fields: list,
        text: list.map(function (f) { return f.label + '：' + f.value; }).join('\n')
      });
    }

    function chips(prefix) {
      return function (e) {
        var v = expBlock(e);
        if (!v) return null;
        return { label: clean(e.org || e.role || prefix), value: v, sub: periodOf(e) };
      };
    }

    sec('basic', '个人信息', [
      { label: '姓名', value: b.name },
      { label: '性别', value: b.gender },
      { label: '出生日期', value: b.birth },
      { label: '手机号码', value: b.phone },
      { label: '电子邮箱', value: b.email },
      { label: '微信号', value: b.wechat },
      { label: '现居住地', value: b.address },
      { label: '籍贯 / 生源地', value: b.hometown || b.sourceArea },
      { label: '政治面貌', value: b.political },
      { label: '民族', value: b.nation },
      { label: '学历', value: b.education || edu.degree },
      { label: '毕业院校', value: b.school || edu.school },
      { label: '所学专业', value: edu.major },
      { label: '预计毕业时间', value: b.gradDate || edu.end },
      { label: '英语水平', value: b.englishLevel || (skills.langs || [])[0] },
      { label: '个人主页', value: b.homepage }
    ]);

    sec('intent', '求职意向', [
      { label: '目标岗位', value: (resume && resume.target) || b.targetRole },
      { label: '期望城市', value: b.targetCity },
      { label: '求职类型', value: '全职' },
      { label: '到岗时间', value: edu.end ? str(edu.end).slice(0, 7) + ' 毕业后' : '随时到岗' }
    ]);

    sec('edu', '教育背景', [
      { label: '学校', value: edu.school },
      { label: '学院', value: edu.college },
      { label: '专业', value: edu.major },
      { label: '学历 / 学位', value: [edu.degree, edu.degreeName].filter(Boolean).join(' / ') },
      { label: '起止时间', value: periodOf(edu) },
      { label: 'GPA', value: edu.gpa ? edu.gpa + (edu.gpaFull ? ' / ' + edu.gpaFull : '') : '' },
      { label: '专业排名', value: edu.rank ? edu.rank + (edu.rankTotal ? ' / ' + edu.rankTotal : '') : '' },
      { label: '核心课程', value: edu.courses }
    ]);

    var intern = exps.filter(function (e) { return e.type === 'intern'; }).map(chips('实习')).filter(Boolean);
    sec('intern', '实习经历', intern);

    var projects = exps.filter(function (e) { return e.type === 'project'; }).map(chips('项目')).filter(Boolean);
    sec('project', '项目经历', projects);

    var campus = exps.filter(function (e) { return e.type === 'campus'; }).map(chips('校园')).filter(Boolean);
    sec('campus', '校园经历', campus);

    sec('skill', '技能专长', (skills.tech || []).map(function (t, i) {
      return { label: t, value: t, index: i };
    }).concat([{ label: '全部技能', value: (skills.tech || []).join(' / ') }]));

    sec('lang', '外语能力', (skills.langs || []).map(function (t) {
      return { label: t, value: t };
    }));

    sec('cert', '证书奖项', (skills.certs || []).map(function (t) {
      return { label: t, value: t };
    }));

    return out;
  }

  /* 整份简历的纯文本：复制到剪贴板 / 粘贴进别的表单都用它 */
  function fullText(state, resume) {
    var p = (state && state.profile) || {};
    var b = p.basic || {};
    var edu = (p.educations || [])[0] || {};
    var skills = p.skills || {};
    var exps = experiencesOf(p, resume);
    var lines = [];

    lines.push(clean(b.name) || '未命名');
    var target = (resume && resume.target) || b.targetRole || '';
    var contact = [target, b.phone, b.email, b.address].filter(Boolean).join('　|　');
    if (contact) lines.push(contact);
    lines.push('');

    var summary = (resume && clean(resume.summary)) || clean(b.selfEval);
    if (summary) { lines.push('【自我评价】'); lines.push(summary); lines.push(''); }

    if (edu.school || edu.major) {
      lines.push('【教育背景】');
      lines.push([edu.school, edu.college].filter(Boolean).join('　'));
      var eduLine = [edu.major, edu.degree, periodOf(edu)].filter(Boolean).join('　');
      if (eduLine) lines.push(eduLine);
      var extra = [];
      if (edu.gpa) extra.push('GPA ' + edu.gpa + (edu.gpaFull ? '/' + edu.gpaFull : ''));
      if (edu.rank) extra.push('排名 ' + edu.rank + (edu.rankTotal ? '/' + edu.rankTotal : ''));
      if (extra.length) lines.push(extra.join('　'));
      if (edu.courses) lines.push('核心课程：' + edu.courses);
      lines.push('');
    }

    [['intern', '实习经历'], ['project', '项目经历'], ['campus', '校园经历']].forEach(function (pair) {
      var list = exps.filter(function (e) { return e.type === pair[0]; });
      if (!list.length) return;
      lines.push('【' + pair[1] + '】');
      list.forEach(function (e) {
        var block = expBlock(e);
        if (block) { lines.push(block); lines.push(''); }
      });
    });

    if ((skills.tech || []).length) {
      lines.push('【专业技能】');
      lines.push(skills.tech.join(' / '));
      lines.push('');
    }
    if ((skills.langs || []).length) {
      lines.push('【外语能力】');
      lines.push(skills.langs.join('；'));
      lines.push('');
    }
    if ((skills.certs || []).length) {
      lines.push('【证书奖项】');
      lines.push(skills.certs.join('；'));
      lines.push('');
    }

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function sectionOf(state, resume, key) {
    var list = sections(state, resume);
    return list.filter(function (s) { return s.key === key; })[0] || null;
  }

  global.ResumeMatch = {
    VERSION: VERSION,
    DIRS: DIRS,
    extractJob: extractJob,
    dirsOf: dirsOf,
    score: scoreResume,
    rank: rank,
    sections: sections,
    sectionOf: sectionOf,
    fullText: fullText,
    periodOf: periodOf,
    experiencesOf: experiencesOf
  };
})(typeof window !== 'undefined' ? window : self);
