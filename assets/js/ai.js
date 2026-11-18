/* =========================================================
   AI 引擎
   1) 本地规则引擎：JD 解析 / 匹配打分 / 简历定制 / 开放题生成
   2) 远程适配器：配置 API Key 后可切换到真实 LLM（失败自动回退）
   ========================================================= */
(function (global) {
  'use strict';

  var S = global.SeedData;
  var UI = global.UI;

  var CITIES = ['北京', '上海', '深圳', '广州', '杭州', '成都', '南京', '武汉', '西安', '东莞', '苏州', '厦门', '长沙', '合肥', '重庆', '天津'];
  var COMPANY_HINTS = ['字节跳动', '腾讯', '阿里巴巴', '美团', '百度', '华为', '京东', '网易', '小米', '拼多多', 'SHEIN', '中国移动', '招商银行', '顺丰', '滴滴', '蔚来', '大疆', 'OPPO', 'vivo', '中兴'];

  /* ---------------- 工具 ---------------- */
  function uniq(arr) { return arr.filter(function (v, i) { return arr.indexOf(v) === i; }); }

  function normalizeSkill(s) {
    return String(s).toLowerCase().replace(/\s+/g, '');
  }

  function profileSkills(profile) {
    return (profile.skills.tech || []).concat(
      (profile.skills.langs || []).map(function (x) { return '英语'; })
    );
  }

  function hasSkill(list, skill) {
    var n = normalizeSkill(skill);
    return list.some(function (x) {
      var m = normalizeSkill(x);
      return m === n || m.indexOf(n) >= 0 || n.indexOf(m) >= 0;
    });
  }

  function expTags(profile) {
    var t = [];
    (profile.experiences || []).forEach(function (e) { t = t.concat(e.tags || []); });
    return uniq(t);
  }

  function allNumbers(profile) {
    var str = (profile.basic.selfEval || '') + ' ' +
      profile.experiences.map(function (e) { return (e.bullets || []).join(' '); }).join(' ');
    return (str.match(/\d+(\.\d+)?%?/g) || []);
  }

  /* ---------------- JD 解析 ---------------- */
  function parseJD(text) {
    var raw = String(text || '').trim();
    var lines = raw.split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);

    // 公司 & 岗位
    var company = '', role = '';
    var head = raw.match(/[【\[]\s*([^】\]·|]+?)\s*[·|]\s*([^】\]]+?)\s*[】\]]/);
    if (head) { company = head[1].trim(); role = head[2].trim(); }
    if (!company) {
      COMPANY_HINTS.forEach(function (c) { if (!company && raw.indexOf(c) >= 0) company = c; });
    }
    if (!company) {
      var m = raw.match(/(?:公司|企业)[:：]\s*([^\n，,。]{2,18})/);
      if (m) company = m[1].trim();
    }
    if (!role) {
      var r2 = raw.match(/(?:岗位|职位)[:：]\s*([^\n，,。]{2,24})/);
      if (r2) role = r2[1].trim();
    }
    if (!role) {
      var r3 = lines.filter(function (l) { return /(工程师|分析师|运营|产品经理|专员|管培|开发|算法)/.test(l); })[0];
      if (r3) role = r3.replace(/[【】\[\]]/g, '').trim().slice(0, 28);
    }
    if (!company) company = '目标企业';
    if (!role) role = '目标岗位';

    // 城市
    var city = '';
    var cm = raw.match(/(?:工作地点|base|地点)[:：]\s*([^\n，,。]{2,10})/i);
    if (cm) city = cm[1].trim();
    if (!city) {
      CITIES.forEach(function (c) { if (!city && raw.indexOf(c) >= 0) city = c; });
    }

    // 技能关键词
    var lower = raw.toLowerCase();
    var skills = [];
    S.skillDict.forEach(function (k) {
      if (lower.indexOf(k.toLowerCase()) >= 0) skills.push(k);
    });
    // 合并同义
    if (skills.indexOf('AB 测试') >= 0 && skills.indexOf('A/B 测试') < 0) skills.push('A/B 测试');
    skills = uniq(skills).slice(0, 12);

    // 职责 / 要求
    function section(titleRe) {
      var out = [], inSec = false;
      lines.forEach(function (l) {
        if (titleRe.test(l) && l.length < 20) { inSec = true; return; }
        if (/^(任职要求|岗位要求|任职资格|岗位职责|工作职责|我们希望你|加分项)/.test(l) && l.length < 20) { inSec = false; return; }
        if (inSec && l.length > 4) out.push(l.replace(/^\d+[.、)]\s*/, '').replace(/^[-•·]\s*/, ''));
      });
      return out;
    }
    var duties = section(/(岗位职责|工作职责|职位描述|你将负责)/);
    var requires = section(/(任职要求|岗位要求|任职资格|我们希望你)/);

    // 方向推断
    var scores = S.roleHints.map(function (h) {
      var s = 0;
      h.keys.forEach(function (k) { if (lower.indexOf(k) >= 0) s += 1; });
      return { role: h.role, s: s };
    }).sort(function (a, b) { return b.s - a.s; });
    var direction = scores[0] && scores[0].s > 0 ? scores[0].role : '综合岗';

    return {
      raw: raw, company: company, role: role, city: city,
      skills: skills, duties: duties, requires: requires,
      direction: direction,
      isCampus: /校招|校园招聘|应届|2027|2026 ?届/.test(raw)
    };
  }

  /* ---------------- 匹配打分 ---------------- */
  function match(profile, jd) {
    var pSkills = profileSkills(profile).concat(expTags(profile));
    var hits = [], misses = [];
    (jd.skills || []).forEach(function (s) {
      if (hasSkill(pSkills, s)) hits.push(s); else misses.push(s);
    });

    var skillRate = jd.skills.length ? hits.length / jd.skills.length : 0.6;

    // 经历相关度
    var relExp = (profile.experiences || []).filter(function (e) {
      var txt = ((e.tags || []).join(' ') + ' ' + (e.bullets || []).join(' ')).toLowerCase();
      return (jd.skills || []).some(function (s) { return txt.indexOf(String(s).toLowerCase()) >= 0; });
    });
    var expRate = Math.min(1, relExp.length / 2);

    // 学历/专业
    var edu = (profile.educations || [])[0] || {};
    var eduRate = 0.5;
    if (/计算机|软件|数据|统计|数学|人工智能|信息/.test(edu.major || '')) eduRate += 0.35;
    if (edu.degree === '本科' || edu.degree === '硕士') eduRate += 0.1;
    eduRate = Math.min(1, eduRate);

    var langRate = (profile.skills.langs || []).join(' ').indexOf('CET-6') >= 0 ? 0.9 : 0.65;

    var score = Math.round(
      (skillRate * 0.52 + expRate * 0.24 + eduRate * 0.16 + langRate * 0.08) * 100
    );
    score = Math.max(48, Math.min(96, score));

    // 建议
    var advice = [];
    if (misses.length) {
      advice.push('JD 提到「' + misses.slice(0, 3).join('、') + '」，档案中缺少对应证据。建议补充一段相关实践，或在现有经历里补充可迁移的能力描述。');
    }
    if (hits.length) {
      advice.push('已命中「' + hits.slice(0, 4).join('、') + '」等 ' + hits.length + ' 项关键词，可把相关经历前置到简历第一屏。');
    }
    if (jd.city && (profile.basic.targetCity || '').indexOf(jd.city) < 0) {
      advice.push('岗位工作地在' + jd.city + '，你的意向城市为「' + profile.basic.targetCity + '」，投递前建议确认异地意愿。');
    }
    if (/硕士|研究生/.test((jd.raw || '')) && edu.degree === '本科') {
      advice.push('JD 中出现硕士相关表述，本科背景需用项目深度与量化结果补足竞争力。');
    }

    var level = score >= 85 ? '高度匹配' : score >= 75 ? '较为匹配' : score >= 62 ? '可以尝试' : '匹配偏弱';
    var levelType = score >= 85 ? 'ok' : score >= 75 ? 'brand' : score >= 62 ? 'warn' : 'danger';

    return {
      score: score, level: level, levelType: levelType,
      hits: hits, misses: misses, advice: advice,
      dims: [
        { name: '技能关键词', value: Math.round(skillRate * 100) },
        { name: '经历相关', value: Math.round(expRate * 100) },
        { name: '专业背景', value: Math.round(eduRate * 100) },
        { name: '语言能力', value: Math.round(langRate * 100) }
      ]
    };
  }

  /* ---------------- 简历定制 ---------------- */
  function tailor(resume, profile, jd) {
    var m = match(profile, jd);
    var exps = (profile.experiences || []).slice();

    function scoreExp(e) {
      var txt = ((e.tags || []).join(' ') + ' ' + (e.bullets || []).join(' ')).toLowerCase();
      var s = 0;
      (jd.skills || []).forEach(function (k) { if (txt.indexOf(String(k).toLowerCase()) >= 0) s += 2; });
      if (e.type === 'intern') s += 1.2;
      return s;
    }
    var ordered = exps.slice().sort(function (a, b) { return scoreExp(b) - scoreExp(a); });

    var edu = (profile.educations || [])[0] || {};
    var topExp = ordered[0] || {};
    var hits = m.hits.slice(0, 4);
    var missingSoft = m.misses.slice(0, 2);

    var summary = [
      edu.major + ' ' + (edu.degree || '本科') + ' ' + (edu.end ? edu.end.slice(0, 4) : '2027') + ' 届',
      edu.gpa ? 'GPA ' + edu.gpa.replace(/\s*\/\s*/, '/') : '',
      edu.rank ? '专业排名 ' + edu.rank : ''
    ].filter(Boolean).join('，') + '。';

    summary += '目标岗位「' + (jd.role || resume.target) + '」，' + (hits.length ? '已具备 ' + hits.join(' / ') + ' 等核心能力' : '具备扎实的工科基础') + '。';

    if (topExp.org) {
      var num = (topExp.bullets || []).map(function (b) {
        var mm = b.match(/(\d+(?:\.\d+)?%|\d+ ?万|\d{3,})/);
        return mm ? mm[0] : null;
      }).filter(Boolean)[0];
      summary += '在' + topExp.org + '担任' + (topExp.role || '核心成员') + '期间' +
        (num ? '取得 ' + num + ' 的可量化结果' : '完整参与业务闭环') + '，具备从需求理解到落地复盘的独立执行能力。';
    }
    if (missingSoft.length) {
      summary += '正在系统补齐 ' + missingSoft.join('、') + ' 方向的方法论，可快速上手。';
    }

    var newTags = uniq(hits.concat(resume.tags || [])).slice(0, 6);

    return {
      summary: summary,
      order: ordered.map(function (e) { return e.id; }),
      tags: newTags,
      scoreBefore: match(profile, jd).score,
      scoreAfter: Math.min(96, m.score + 6),
      changes: [
        '自我评价按「' + jd.role + '」重写，前置 ' + (hits.slice(0, 3).join('、') || '核心能力') + ' 关键词',
        '经历顺序按 JD 相关度重排，' + (ordered[0] ? '「' + ordered[0].org + '」置顶' : '实习经历置顶'),
        '技能标签更新为 ' + newTags.slice(0, 4).join(' / '),
        ordered[0] && ordered[0].bullets && ordered[0].bullets[0]
          ? '首条要点改写为结果先行：「' + ordered[0].bullets[0].slice(0, 26) + '…」'
          : '补充可量化的结果描述'
      ]
    };
  }

  /* ---------------- 自我介绍 ---------------- */
  function selfIntro(profile, jd) {
    var edu = (profile.educations || [])[0] || {};
    var intern = (profile.experiences || []).filter(function (e) { return e.type === 'intern'; })[0];
    var proj = (profile.experiences || []).filter(function (e) { return e.type === 'project'; })[0];
    var role = (jd && jd.role) || profile.basic.targetRole || '目标岗位';
    var company = (jd && jd.company) || '贵公司';

    var p1 = '面试官您好，我是' + profile.basic.name + '，' + (edu.school || '') + (edu.major || '') + '专业 ' +
      (edu.end ? edu.end.slice(0, 4) : '2027') + ' 届' + (edu.degree || '本科') + '生，' +
      (edu.gpa ? 'GPA ' + edu.gpa + '，' : '') + (edu.rank ? '专业排名 ' + edu.rank + '。' : '成绩稳定。');

    var p2 = '';
    if (intern) {
      var b = (intern.bullets || [])[0] || '';
      p2 = '和' + role + '最相关的是我在' + intern.org + '的' + (intern.role || '实习') + '经历。' + b.replace(/^负责/, '我负责') +
        ((intern.bullets || [])[1] ? (intern.bullets[1].indexOf('通过') === 0 ? intern.bullets[1] : '另外，' + intern.bullets[1]) : '');
      p2 = p2.replace(/。$/, '。');
    } else if (proj) {
      p2 = '和' + role + '最相关的是「' + proj.org + '」这个项目。' + (proj.bullets || []).join(' ');
    }

    var p3 = '我选择' + company + '，是因为' + (jd && jd.direction ? '岗位方向和我的能力积累高度一致' : '团队做的事情和我长期想深耕的方向一致') +
      '。我习惯先把问题拆成可验证的假设，再用数据或最小可行方案去验证，' +
      '这一点在' + (intern ? intern.org : (proj ? proj.org : '过往项目')) + '的实践中已经验证过。' +
      '如果能加入，我希望前三个月先把业务指标和数据口径吃透，独立承担一块可衡量的模块。';

    return { title: '自我介绍（约 1 分钟）', body: p1 + '\n\n' + p2 + '\n\n' + p3, tip: '面试时按「我是谁 → 我做过什么 → 我为什么来」三段讲，控制在 60–80 秒。' };
  }

  /* ---------------- 开放题 ---------------- */
  function openQuestion(question, profile, jd) {
    var q = String(question || '');
    var company = (jd && jd.company) || '贵公司';
    var role = (jd && jd.role) || profile.basic.targetRole || '该岗位';
    var edu = (profile.educations || [])[0] || {};
    var intern = (profile.experiences || []).filter(function (e) { return e.type === 'intern'; })[0] || profile.experiences[0] || {};
    var skills = (jd && jd.skills && jd.skills.length ? jd.skills : profile.skills.tech).slice(0, 3).join('、');

    var kind = 'generic';
    if (/为什么|为何|选择我们|加入我们/.test(q)) kind = 'why';
    else if (/职业规划|五年|未来规划|发展方向/.test(q)) kind = 'plan';
    else if (/优点|优势|长处|胜任/.test(q)) kind = 'strength';
    else if (/缺点|不足|短板/.test(q)) kind = 'weakness';
    else if (/团队|协作|冲突|沟通/.test(q)) kind = 'team';
    else if (/挫折|失败|困难|挑战/.test(q)) kind = 'fail';

    var map = {
      why: {
        title: '为什么选择' + company + ' / 为什么应聘' + role,
        body: '第一，业务上我一直在关注' + company + '在' + (jd && jd.direction ? jd.direction : '这一领域') + '的进展，' +
          '这个岗位需要的' + (skills || '核心能力') + '恰好是我过去两年重点投入的方向。\n\n' +
          '第二，能力上我有可验证的积累：' + (intern.org ? '在' + intern.org + '做' + (intern.role || '实习') + '时，' + (intern.bullets || [''])[0] : '在项目实践中' + (intern.bullets || [''])[0]) + '\n\n' +
          '第三，长期看，我想在' + (jd && jd.direction ? jd.direction : '这个方向') + '做深，而' + company + '能提供足够复杂的业务场景。' +
          '我不希望只做执行，更希望能在真实业务里持续验证自己的判断。',
        tip: '三段式：认同业务 → 能力匹配 → 长期意愿。避免只说"公司平台大、发展好"。'
      },
      plan: {
        title: '你的职业规划是什么',
        body: '我的规划分三步，都围绕' + (jd && jd.direction ? jd.direction : '专业方向') + '展开。\n\n' +
          '1–2 年：把岗位的基本功做扎实。' + (intern.org ? '参考我在' + intern.org + '的经验，' : '') +
          '先吃透业务指标与数据口径，能独立负责一块可衡量的模块，做到交付可控。\n\n' +
          '3 年：从"做事"走向"定义问题"。希望能主导一个完整项目，从目标拆解、方案设计到跨团队推动落地，形成自己的方法论。\n\n' +
          '5 年：成为团队里在' + (skills || '该领域') + '方向可以被依赖的人，能带小规模项目或新人，把经验沉淀成可复用的流程。',
        tip: '规划要"可验证"，讲清每个阶段你能交付什么，而不是职位头衔。'
      },
      strength: {
        title: '你最大的优势是什么',
        body: '我最大的优势是「把模糊问题拆成可执行动作」的能力，具体体现在两件事上。\n\n' +
          '一是数据落地能力。' + (intern.bullets || [''])[0] + '\n\n' +
          '二是独立推进能力。「' + (profile.experiences[1] ? profile.experiences[1].org : '项目') + '」从选题、数据、建模到可视化都由我独立完成，' +
          (profile.experiences[1] && profile.experiences[1].bullets[1] ? profile.experiences[1].bullets[1] : '最终形成了可复用的成果。') + '\n\n' +
          '这两点结合，让我在拿到一个陌生业务问题时，能比较快地给出可验证的第一步。',
        tip: '优势 = 能力 + 证据 + 对岗位的价值，三个要素缺一不可。'
      },
      weakness: {
        title: '你的缺点是什么',
        body: '我比较明显的一个不足是「过度追求一次做对」，早期会花太多时间在方案打磨上，导致节奏偏慢。\n\n' +
          '意识到这个问题是在' + (intern.org || '实习') + '期间：当时为了把看板做得更完整，我推迟了两天交付，' +
          '但业务方其实只需要核心的三个指标先跑起来。\n\n' +
          '后来我调整了做法：先给最小可用版本，明确告知后续迭代计划，再逐步补齐。现在我会在动手前先和需求方确认"这次最晚什么时候要、最关键的是什么"。' +
          '这个习惯让我在保证质量的同时，交付节奏更可控。',
        tip: '真实的小缺点 + 具体场景 + 已采取的改进，比"我太追求完美"更有说服力。'
      },
      team: {
        title: '举例说明你如何处理团队分歧',
        body: '在「' + (profile.experiences[2] ? profile.experiences[2].org : '校园二手交易平台') + '」项目中，我和前端同学在接口设计上有分歧：' +
          '他希望一次返回完整数据，我担心列表页性能。\n\n' +
          '我没有直接争论方案，而是先把两种方案的成本量化：分别估算单次响应体积和首屏时间，用一组实测数据摆出来。' +
          '结论是列表页用精简字段、详情页再取全量，双方都能接受。\n\n' +
          '这件事让我形成一个习惯：分歧往往不是立场问题，而是信息不对称。先把判断依据变成双方都能看到的事实，讨论会快很多。',
        tip: '用 STAR：情境 → 分歧点 → 你做的具体动作 → 结果与沉淀。'
      },
      fail: {
        title: '讲一次你失败的经历',
        body: '大三上学期我参加数学建模竞赛，第一轮我们选了"城市交通流量预测"，前 30 小时都在调模型，' +
          '但数据本身存在大量缺失，最后论文没有跑出有效结论，只拿了省三。\n\n' +
          '复盘时我发现问题不在模型，而在前期没有做数据质量评估。第二次参赛时，我们把前 6 小时固定用来做数据探索和缺失机制分析，' +
          '再决定建模路线，最终拿到了省二。\n\n' +
          '这次失败让我把"先验证数据、再投入方法"变成了固定动作，后来做课程预警模型时也是先花时间处理 1.8 万条学籍数据的缺失与异常。',
        tip: '失败题的重点不是失败本身，而是你从中提炼出并复用过的动作。'
      },
      generic: {
        title: '关于「' + q.slice(0, 18) + (q.length > 18 ? '…' : '') + '」的回答',
        body: '可以按「观点 → 证据 → 与岗位的关联」来组织：\n\n' +
          '观点：先用一句话给出明确判断，不要绕。\n' +
          '证据：用' + (intern.org || '项目') + '中的具体动作和结果支撑，尽量带数字。\n' +
          '关联：说明这件事如何让你更适合' + role + '。\n\n' +
          '参考素材：' + (intern.bullets || [''])[0],
        tip: '不确定题目意图时，先复述一遍问题确认理解，再作答。'
      }
    };
    return map[kind];
  }

  /* ---------------- 要点润色（STAR + 量化） ---------------- */
  function polish(text) {
    var t = String(text || '').trim();
    var notes = [];
    var out = t
      .replace(/^负责/, '主导')
      .replace(/^参与了?/, '深度参与')
      .replace(/^协助/, '配合推进')
      .replace(/做好/g, '完成')
      .replace(/一些/g, '')
      .replace(/\s+/g, ' ');

    if (/^主导|^独立|^推动|^搭建|^设计|^牵头/.test(out)) notes.push('已使用结果导向的动词开头');
    else { out = '主导' + out.replace(/^[，,。]/, ''); notes.push('补上动作动词，避免「负责…」式描述'); }

    if (!/\d/.test(out)) {
      out += '（建议补充量化结果，如效率提升 %、覆盖用户数、耗时缩短）';
      notes.push('检测到缺少数字，已提示补充量化结果');
    } else {
      notes.push('已包含量化数据，保留原有数字');
    }
    if (out.length > 90) notes.push('长度偏长，面试口述时建议压缩到 60 字内');
    return { text: out, notes: notes };
  }

  /* ---------------- 简历诊断 ---------------- */
  function review(profile, resume) {
    var items = [];
    var edu = (profile.educations || [])[0] || {};

    if (!profile.basic.selfEval || profile.basic.selfEval.length < 60) {
      items.push({ level: 'high', title: '自我评价过于单薄', detail: '招聘方第一眼看到的是概述，建议 80–120 字，包含「专业背景 + 核心能力 + 一个量化成果」。', fix: '用 AI 重写自我评价' });
    }
    var intern = profile.experiences.filter(function (e) { return e.type === 'intern'; })[0];
    if (!intern) {
      items.push({ level: 'high', title: '缺少实习经历', detail: '校招简历中实习是重要筛选维度，可用项目经历包装成"类实习"描述，突出业务目标与结果。', fix: '把项目改写为业务视角' });
    }
    var noNum = [];
    profile.experiences.forEach(function (e) {
      (e.bullets || []).forEach(function (b) { if (!/\d/.test(b)) noNum.push(e.org); });
    });
    if (noNum.length) {
      items.push({ level: 'mid', title: '部分要点缺少量化', detail: '「' + uniq(noNum).join('、') + '」中有描述没有数字支撑，建议补充规模、效率、增长率三类指标。', fix: '逐条润色要点' });
    }
    if (!edu.gpa) {
      items.push({ level: 'mid', title: '未填写 GPA / 排名', detail: '若 GPA 或排名在前 30%，建议明确写出；否则可改为列出核心课程成绩。', fix: '补充教育背景' });
    }
    var techCount = (profile.skills.tech || []).length;
    if (techCount < 6) {
      items.push({ level: 'low', title: '技能标签偏少', detail: '建议补充工具链（如 SQL / Tableau / Git）与业务方法论关键词，便于 JD 关键词匹配。', fix: '完善技能标签' });
    }
    if ((profile.experiences || []).length < 3) {
      items.push({ level: 'low', title: '经历数量偏少', detail: '建议保持 3 段以上经历（实习 + 项目 + 校园），并按目标岗位相关度排序。', fix: '新增一段经历' });
    }
    if (!items.length) {
      items.push({ level: 'low', title: '整体结构完整', detail: '简历结构、量化程度与关键词覆盖均达标，可针对不同 JD 做定向微调。', fix: '生成岗位定制版' });
    }
    return items;
  }

  /* ---------------- 面试预测 ---------------- */
  function interviewQuestions(jd, profile) {
    var role = (jd && jd.role) || profile.basic.targetRole;
    var skills = (jd && jd.skills && jd.skills.length ? jd.skills : profile.skills.tech).slice(0, 3);
    return [
      '请用 1 分钟做个自我介绍，重点讲和' + role + '相关的经历。',
      '你在' + (profile.experiences[0] ? profile.experiences[0].org : '实习') + '做的最有代表性的一件事是什么？如果重做一次会怎么改？',
      '针对' + (skills[0] || '核心技能') + '：如果让你从 0 搭建一套指标体系，你会怎么拆？',
      '业务方给的需求很模糊，指标还在下降，你会用哪三步定位问题？',
      '你如何评估一次 A/B 实验的结果是否可信？',
      '讲一个你和团队意见不一致的例子，最后怎么解决的？',
      '为什么选择我们公司？如果同时拿到其他 offer 你会怎么选？',
      '你还有什么想问我们的？'
    ];
  }

  /* ---------------- 远程 LLM 适配 ---------------- */
  function remoteAvailable() {
    var st = global.Store.state.settings;
    return !!(st && st.llmKey);
  }

  function remoteGenerate(system, user) {
    var st = global.Store.state.settings;
    var base = (st.llmBase || 'https://api.openai.com/v1').replace(/\/$/, '');
    return fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + st.llmKey },
      body: JSON.stringify({
        model: st.llmModel || 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.6
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      return j.choices && j.choices[0] && j.choices[0].message.content;
    });
  }

  /* ---------------- 对话路由 ---------------- */
  function chat(message, ctx) {
    var t = String(message || '');
    var profile = global.Store.state.profile;
    var jd = (ctx && ctx.jd) || AI.ctx.jd || parseJD(S.sampleJD);

    if (/定制|生成简历|改简历|适配/.test(t) && /简历/.test(t)) {
      var res = tailor(global.Store.state.resumes[0], profile, jd);
      return {
        title: '已为「' + jd.company + ' · ' + jd.role + '」生成定制简历',
        body: '匹配度从 ' + res.scoreBefore + ' 提升到 ' + res.scoreAfter + '（预估）。\n\n' +
          '改动点：\n' + res.changes.map(function (c, i) { return (i + 1) + '. ' + c; }).join('\n') +
          '\n\n新版自我评价：\n' + res.summary + '\n\n已保存到简历库，可直接用于本次网申。',
        action: { label: '打开简历库查看', hash: '#/resumes' }
      };
    }
    if (/匹配|jd|职位描述|岗位要求|分析.*岗/i.test(t)) {
      var m = match(profile, jd);
      return {
        title: '匹配分析：' + jd.company + ' · ' + jd.role,
        body: '综合匹配度 ' + m.score + ' 分（' + m.level + '）。\n\n' +
          '命中关键词（' + m.hits.length + '）：' + (m.hits.join('、') || '暂无') + '\n' +
          '缺口关键词（' + m.misses.length + '）：' + (m.misses.join('、') || '暂无') + '\n\n' +
          m.advice.map(function (a) { return '· ' + a; }).join('\n'),
        action: { label: '去定制这份简历', hash: '#/resumes' }
      };
    }
    if (/自我介绍|自我介绍一下|一分钟/.test(t)) {
      var si = selfIntro(profile, jd);
      return { title: si.title, body: si.body + '\n\n提示：' + si.tip };
    }
    if (/为什么|开放题|职业规划|优缺点|缺点|优势|团队|挫折|失败|举例/.test(t)) {
      var q = t.replace(/^(帮我|请|能不能)?(写|回答|生成|准备)?(一下)?/, '').trim() || t;
      var ans = openQuestion(q, profile, jd);
      return { title: ans.title, body: ans.body + '\n\n提示：' + ans.tip };
    }
    if (/润色|优化.*(描述|要点)|改写|star/i.test(t)) {
      var b = (profile.experiences[0].bullets || [])[0];
      var p = polish(b);
      return {
        title: '要点润色示例',
        body: '原文：\n' + b + '\n\n改写后：\n' + p.text + '\n\n改动说明：\n' + p.notes.map(function (n) { return '· ' + n; }).join('\n')
      };
    }
    if (/诊断|体检|评估|打分|问题/.test(t)) {
      var items = review(profile, global.Store.state.resumes[0]);
      return {
        title: '简历诊断报告',
        body: items.map(function (it, i) {
          return (i + 1) + '. ' + it.title + '\n' + it.detail;
        }).join('\n\n') + '\n\n建议优先处理「高」优先级的 ' + items.filter(function (x) { return x.level === 'high'; }).length + ' 项。',
        action: { label: '打开我的档案', hash: '#/profile' }
      };
    }
    if (/面试|题目|问题预测/.test(t)) {
      var qs = interviewQuestions(jd, profile);
      return {
        title: '面试问题预测（' + jd.role + '）',
        body: qs.map(function (q, i) { return (i + 1) + '. ' + q; }).join('\n') + '\n\n建议先准备第 2、3、6 题，这三题出现频率最高。'
      };
    }

    return {
      title: '我可以帮你做这些',
      body: '· 解析 JD 并给出匹配度分析（把 JD 粘给我即可）\n' +
        '· 按岗位定制简历，自动重排经历与关键词\n' +
        '· 生成 1 分钟自我介绍、开放题答案\n' +
        '· 简历诊断 + 要点 STAR 化润色\n' +
        '· 预测面试问题并给出答题框架\n\n' +
        '当前上下文：' + jd.company + ' · ' + jd.role + '。你可以直接说「帮我把这份 JD 匹配到主简历」。',
      action: { label: '去网申填写', hash: '#/apply' }
    };
  }

  var AI = {
    ctx: { jd: parseJD(S.sampleJD) },
    parseJD: parseJD,
    match: match,
    tailor: tailor,
    selfIntro: selfIntro,
    openQuestion: openQuestion,
    polish: polish,
    review: review,
    interviewQuestions: interviewQuestions,
    chat: chat,
    remoteAvailable: remoteAvailable,
    remoteGenerate: remoteGenerate,
    setJD: function (jd) { AI.ctx.jd = jd; },
    seedJD: S.sampleJD
  };

  global.AI = AI;
})(window);
