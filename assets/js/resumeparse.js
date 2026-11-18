/* =========================================================
   简历结构化解析：从纯文本还原 教育 / 项目 / 技能 等
   设计要点：
   1) 专业名用「词典最长匹配」，避免把「数据科学与大数据技术」误判成「计算机科学与技术」
   2) 项目经历先切条目，再判定「名称 / 角色 / 时间 / 职责」，每行都要有归属，不静默丢弃
   3) 每条结论都带原文与置信度，便于人工复核
   ========================================================= */
(function (global) {
  'use strict';

  /* ---------------- 专业词典（按长度倒序匹配） ---------------- */
  var MAJORS = [
    '数据科学与大数据技术', '计算机科学与技术', '信息管理与信息系统', '机械设计制造及其自动化',
    '电气工程及其自动化', '电子信息科学与技术', '微电子科学与工程', '光电信息科学与工程',
    '数学与应用数学', '信息与计算科学', '统计学', '应用统计学', '数据科学', '大数据管理与应用',
    '人工智能', '软件工程', '网络工程', '物联网工程', '信息安全', '网络空间安全', '数字媒体技术',
    '智能科学与技术', '计算机应用技术', '通信工程', '电子信息工程', '电子科学与技术', '自动化',
    '测控技术与仪器', '材料科学与工程', '高分子材料与工程', '化学工程与工艺', '应用化学', '化学',
    '生物科学', '生物技术', '生物工程', '环境工程', '环境科学', '食品科学与工程', '食品质量与安全',
    '土木工程', '建筑学', '城乡规划', '测绘工程', '地质工程', '采矿工程', '安全工程',
    '车辆工程', '能源与动力工程', '新能源科学与工程', '船舶与海洋工程', '海洋技术', '海洋科学',
    '水产养殖学', '农学', '园艺', '动物医学', '林学',
    '临床医学', '口腔医学', '预防医学', '护理学', '药学', '中医学', '医学影像学',
    '经济学', '金融学', '金融工程', '国际经济与贸易', '财政学', '税收学', '保险学',
    '会计学', '财务管理', '审计学', '工商管理', '市场营销', '人力资源管理', '物流管理',
    '电子商务', '旅游管理', '行政管理', '公共事业管理', '社会学', '社会工作', '法学',
    '汉语言文学', '汉语国际教育', '英语', '商务英语', '日语', '翻译', '新闻学', '传播学',
    '广告学', '编辑出版学', '网络与新媒体', '视觉传达设计', '环境设计', '产品设计', '工业设计',
    '数字媒体艺术', '音乐学', '美术学', '教育学', '学前教育', '小学教育', '体育教育',
    '心理学', '应用心理学', '地理信息科学', '遥感科学与技术', '资源勘查工程', '石油工程'
  ].sort(function (a, b) { return b.length - a.length; });

  var DEGREES = [
    { k: '博士', re: /(博士研究生|博士)/ },
    { k: '硕士', re: /(硕士研究生|硕士|研究生)/ },
    { k: '本科', re: /(本科|学士)/ },
    { k: '大专', re: /(大专|专科|高职)/ }
  ];

  var HEADINGS = [
    { key: 'basic', re: /^(基本信息|个人信息|个人资料|联系方式|个人档案)$/ },
    { key: 'edu', re: /^(教育背景|教育经历|学习经历|教育情况|学历背景|求学经历|教育)$/ },
    { key: 'project', re: /^(项目经历|项目经验|项目实践|项目实训|项目履历|科研经历|科研项目|主要项目|重点项目|实践经历|项目)$/ },
    { key: 'intern', re: /^(实习经历|工作经历|实习经验|工作经验|职业经历|从业经历|实习)$/ },
    { key: 'campus', re: /^(校园经历|社团经历|学生工作|校园活动|社会实践|在校经历|校园实践)$/ },
    { key: 'skill', re: /^(专业技能|技能特长|技能证书|技能清单|个人技能|IT技能|技术栈|技能)$/ },
    { key: 'award', re: /^(获奖情况|获奖经历|荣誉奖项|所获荣誉|荣誉|奖项|证书|证书奖项)$/ },
    { key: 'summary', re: /^(自我评价|个人总结|自我介绍|个人简介|自我描述|求职意向|职业规划|个人优势)$/ }
  ];

  /* 从正则里取出关键词，供「宽松兜底」使用（要求 ≥3 字，避免「项目/教育/技能」这类过短词乱命中） */
  HEADINGS.forEach(function (h) {
    h.roots = h.re.source.replace(/^\^\(?/, '').replace(/\)?\$$/, '').split('|')
      .filter(function (r) { return r.length >= 3; });
  });

  /* ---------------- 文本规整 ---------------- */
  function normalize(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      /* Word / WPS 的项目符号常用 Wingdings 私用区字符（U+F06C、U+F0B7…），
         直接当正文会既看不出是列表、又切不出条目，这里统一成「•」。 */
      .replace(/[\uf000-\uf0ff]/g, function (c) {
        return /[\uf06c\uf0a7\uf0b7\uf0d8\uf0fc\uf076\uf0a8]/.test(c) ? '•' : '';
      })
      .replace(/[ \t]+/g, ' ')
      .split('\n')
      .map(function (l) { return l.replace(/^[\s\u3000]+|[\s\u3000]+$/g, ''); })
      .filter(function (l) { return l.trim() !== ''; });
  }

  function compact(s) { return String(s || '').replace(/[\s\u3000]/g, ''); }

  /* 剥离标题前的装饰符与序号。
     关键：序号常常是「01 项目经历」这种「数字 + 空格」的形式，没有「、」「.」之类标点，
     只看标点会漏掉，导致整个栏目消失 —— 这里允许序号后无标点。 */
  function cleanHeading(line) {
    var c = compact(line);
    c = c.replace(/^[•·▪▫●○◆◇■□▸▹►▶▷▻➢➤→✓✔※⁃∙\-–—_*#>＞]+/, '');
    c = c.replace(/^第[一二三四五六七八九十百\d]{1,3}[大部分章节篇单元][、.．:：]?/, '');
    c = c.replace(/^[（(][一二三四五六七八九十\d]{1,3}[)）][、.．:：]?/, '');
    c = c.replace(/^[一二三四五六七八九十]{1,3}[、.．)）:：]/, '');
    c = c.replace(/^(?:PART|Part|part)[.．:：]?\d{1,2}[、.．:：]?/, '');
    c = c.replace(/^\d{1,2}[、.．)）:：]?/, '');   // ← 允许「01项目经历」这种无标点序号
    c = c.replace(/[（(]\s*\d{1,3}\s*[)）]\s*$/, '');  // 尾部计数：「项目经历（3）」
    c = c.replace(/[:：]+\s*$/, '');
    return c;
  }

  function headingOf(line, fuzzy) {
    if (!line) return null;
    var c = cleanHeading(line);
    if (!c || c.length > 16) return null;
    // 允许标题后带英文，如「教育背景 EDUCATION」
    var cut = c.replace(/[A-Za-z\s&/]+$/, '');
    for (var i = 0; i < HEADINGS.length; i++) {
      if (HEADINGS[i].re.test(c) || (cut && HEADINGS[i].re.test(cut))) return HEADINGS[i].key;
    }
    if (!fuzzy || c.length > 12) return null;
    // 宽松兜底：标题被写成「主要项目经历」「教育背景与主修课程」等非常规形态
    for (var j = 0; j < HEADINGS.length; j++) {
      for (var k = 0; k < HEADINGS[j].roots.length; k++) {
        if (c.indexOf(HEADINGS[j].roots[k]) >= 0) return HEADINGS[j].key;
      }
    }
    return null;
  }

  /* ---------------- 时间 ---------------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function normMonth(y, m) {
    if (!y) return '';
    y = String(y);
    if (y.length === 2) y = (parseInt(y, 10) > 50 ? '19' : '20') + y;
    var mm = m == null ? 0 : parseInt(m, 10);
    if (!mm || mm < 1 || mm > 12) return y;
    return y + '-' + pad(mm);
  }

  var DATE_RE = /((?:19|20)\d{2})\s*(?:[.\-/年]\s*(\d{1,2})\s*月?)?\s*[-–—~～至到]+\s*((((?:19|20)\d{2})\s*(?:[.\-/年]\s*(\d{1,2})\s*月?)?)|至今|现在|今)/;

  function dateRange(line) {
    var m = DATE_RE.exec(line);
    if (!m) return null;
    var start = normMonth(m[1], m[2]);
    var end;
    if (/至今|现在|今/.test(m[3])) end = '至今';
    else {
      var ty = /((?:19|20)\d{2})/.exec(m[3]);
      var tm = /[.\-/年]\s*(\d{1,2})/.exec(m[3]);
      end = normMonth(ty && ty[1], tm && tm[1]);
    }
    return { start: start, end: end, text: m[0], index: m.index, length: m[0].length };
  }

  /* ---------------- 专业 / 学历 ---------------- */
  function detectMajor(text) {
    var c = compact(text);
    var best = null;
    for (var i = 0; i < MAJORS.length; i++) {
      var at = c.indexOf(MAJORS[i]);
      if (at >= 0 && (!best || MAJORS[i].length > best.major.length)) {
        best = { major: MAJORS[i], at: at };
      }
    }
    if (best) return best.major;
    // 词典未覆盖时，取「XX专业 / 专业：XX」的原文，不硬套
    var m = /专业[:：]\s*([\u4e00-\u9fa5A-Za-z（）()]{2,20})/.exec(c) ||
      /([\u4e00-\u9fa5]{2,15}专业)/.exec(c);
    return m ? m[1] : '';
  }

  function detectDegree(text) {
    var c = compact(text);
    for (var i = 0; i < DEGREES.length; i++) if (DEGREES[i].re.test(c)) return DEGREES[i].k;
    return '';
  }

  /* ---------------- 基础信息 ---------------- */
  var CITY_RE = /(北京|上海|广州|深圳|杭州|成都|武汉|南京|西安|苏州|重庆|天津|长沙|青岛|厦门|合肥|郑州|济南|大连|宁波|福州|东莞|佛山|珠海|无锡|昆明|南昌|贵阳|太原|石家庄|哈尔滨|长春|沈阳|兰州|海口|三亚|湛江|茂名|汕头|惠州|中山|江门|肇庆|清远|揭阳|香港|澳门|台北)/;

  /* 表格式简历把「姓名 / 性别 / 民族 / 出生年月」挤在同一行，
     直接跑正则会把相邻字段一起吃进值里（姓名变成「张三求职意向」）。
     这里先按标签打散成「标签：值」的片段，再逐段取值。 */
  var BASIC_LABELS = ['姓名', '性别', '民族', '出生年月', '出生日期', '生日', '年龄', '政治面貌',
    '籍贯', '现居', '现居住', '所在城市', '期望城市', '意向城市', '工作地点', '联系方式', '电话',
    '手机', '电子邮箱', '邮箱', '求职意向', '期望岗位', '应聘岗位', '学历', '专业', '毕业时间',
    '身份证号', '微信', 'QQ', '身高', '体重', '婚姻状况', '到岗时间', '英语水平'];
  var BASIC_LABEL_RE = new RegExp('(' + BASIC_LABELS.slice().sort(function (a, b) { return b.length - a.length; }).join('|') + ')\\s*[:：]', 'g');

  function labelMap(text) {
    var out = {};
    String(text).replace(BASIC_LABEL_RE, '\n$1：').split('\n').forEach(function (seg) {
      var m = /^([\u4e00-\u9fa5A-Za-z ]{2,6})\s*[:：]\s*([\s\S]*)$/.exec(seg.trim());
      if (!m) return;
      var key = m[1].replace(/\s/g, '');
      var val = m[2].replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');
      if (val && !out[key]) out[key] = val;
    });
    return out;
  }
  function pick(map, keys) {
    for (var i = 0; i < keys.length; i++) if (map[keys[i]]) return map[keys[i]];
    return '';
  }

  function parseBasic(lines) {
    var head = lines.slice(0, Math.min(8, lines.length));
    var all = lines.join('\n');
    var out = { name: '', gender: '', birth: '', political: '', phone: '', email: '', wechat: '', city: '', hometown: '' };
    var map = labelMap(all);

    var nameFromLabel = pick(map, ['姓名']);
    if (nameFromLabel) {
      var nm = /^([\u4e00-\u9fa5·]{2,6}|[A-Za-z][A-Za-z .]{2,30})/.exec(nameFromLabel);
      if (nm) out.name = nm[1].replace(/\s+/g, ' ').trim();
    }
    if (!out.name) {
      var m = /(?:姓名|Name)[:：]?\s*([\u4e00-\u9fa5·]{2,6}|[A-Za-z][A-Za-z\s.]{2,30})/.exec(compact(all));
      if (m) out.name = m[1].trim();
    }

    if (!out.name) {
      for (var i = 0; i < head.length; i++) {
        var c = compact(head[i]).replace(/^(个人简历|简历|RESUME)$/i, '');
        if (/^[\u4e00-\u9fa5·]{2,4}$/.test(c) && !/男|女|大学|学院|专业|简历/.test(c)) { out.name = c; break; }
      }
    }
    if (!out.name) {
      var first = compact(head[0] || '');
      var mm = /^([\u4e00-\u9fa5]{2,4})/.exec(first);
      if (mm && !/大学|学院|简历/.test(mm[1])) out.name = mm[1];
    }

    var phone = all.match(/(?<!\d)(1[3-9]\d{9})(?!\d)/) || all.match(/(?:\+?86[-\s]?)?(1[3-9]\d)[-\s]?(\d{4})[-\s]?(\d{4})/);
    if (phone) out.phone = phone.length > 2 ? phone[1] + phone[2] + phone[3] : phone[1];
    if (!out.phone) {
      var pf = pick(map, ['联系方式', '电话', '手机']).replace(/[^\d]/g, '');
      if (/^1[3-9]\d{9}$/.test(pf)) out.phone = pf;
    }

    var email = all.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    if (email) out.email = email[0];

    var wechat = all.match(/(?:微信|WeChat|wechat)[:：]?\s*([A-Za-z0-9_-]{4,20})/);
    if (wechat) out.wechat = wechat[1];

    var headText = head.join(' ');
    var genderVal = pick(map, ['性别']);
    if (/^[男女]/.test(genderVal)) out.gender = genderVal.charAt(0);
    if (!out.gender) {
      var gender = /(?:性别[:：]?\s*)?(男|女)(?![\u4e00-\u9fa5])/.exec(headText);
      if (gender) out.gender = gender[1];
    }

    var polVal = pick(map, ['政治面貌']);
    var pol = /(中共党员|中共预备党员|共青团员|党员|群众|民主党派)/.exec(polVal || headText);
    if (pol) out.political = pol[1] === '党员' ? '中共党员' : pol[1];

    var birthRaw = pick(map, ['出生年月', '出生日期', '生日']);
    if (birthRaw) {
      var b = /((?:19|20)\d{2})[.\-/年]?(\d{1,2})?[.\-/月]?(\d{1,2})?/.exec(birthRaw);
      if (b && parseInt(b[1], 10) <= 2008) {
        out.birth = b[1] + (b[2] ? '-' + pad(b[2]) : '') + (b[3] ? '-' + pad(b[3]) : '');
      }
    }
    if (!out.birth) {
      var birth = /((?:19|20)\d{2})[.\-/年](\d{1,2})[.\-/月]?(\d{1,2})?/.exec(headText.replace(/20\d{2}[.\-/]\d{1,2}\s*[-–—]\s*20\d{2}/g, ''));
      if (birth && parseInt(birth[1], 10) <= 2008) {
        out.birth = birth[1] + '-' + pad(birth[2]) + (birth[3] ? '-' + pad(birth[3]) : '');
      }
    }

    var cityVal = pick(map, ['所在城市', '现居', '现居住', '期望城市', '意向城市', '工作地点']);
    /* 表格里「所在城市」右边常并排着邮箱/电话，值只取开头那段中文地名 */
    var cityText = cityVal ? (cityVal.match(/^[\u4e00-\u9fa5·]{2,15}/) || [''])[0] : '';
    var cityM = cityText ? CITY_RE.exec(cityText) : null;
    if (cityM) out.city = cityText;
    else {
      var cityM2 = /(?:现居|现居住|所在城市|期望城市|意向城市|工作地点)[:：]?\s*([\u4e00-\u9fa5]{2,12})/.exec(all);
      if (cityM2) out.city = cityM2[1];
      else {
        var cities = all.match(CITY_RE);
        if (cities) out.city = cities[1];
      }
    }

    var home = /(?:籍贯|生源地)[:：]?\s*([\u4e00-\u9fa5]{2,12})/.exec(all);
    if (home) out.hometown = home[1];
    else if (pick(map, ['籍贯'])) out.hometown = pick(map, ['籍贯']).slice(0, 12);

    return out;
  }

  /* ---------------- 教育 ---------------- */
  function parseEducation(lines, section, fallbackLines) {
    var src = section && section.lines.length ? section.lines.slice() : fallbackLines;
    var edu = { school: '', college: '', major: '', degree: '', start: '', end: '', gpa: '', rank: '', courses: '' };
    var text = src.join('\n');
    // 去掉残留的栏目名，否则「教育背景广东海洋大学」会被整串当成校名
    var c = compact(text).replace(/^(教育背景|教育经历|学习经历|教育情况|学历背景|求学经历)/, '');

    var schoolM = /([\u4e00-\u9fa5]{2,20}(?:大学|学院|学校|研究院|研究所|职业技术学院))/.exec(c);
    if (schoolM) {
      edu.school = schoolM[1];
      // 「XX大学XX学院」：学校名到「大学」为止
      var uni = /([\u4e00-\u9fa5]{2,20}大学)/.exec(schoolM[1]);
      if (uni) edu.school = uni[1];
    }
    var collegeM = /([\u4e00-\u9fa5]{2,12}学院)/.exec(c.replace(edu.school, ''));
    if (collegeM && collegeM[1] !== edu.school) edu.college = collegeM[1];

    edu.major = detectMajor(text);
    edu.degree = detectDegree(text);

    // 毕业时间优先：「2027-07 毕业」比「2023-2024 学年奖学金」更能代表在校时间
    var grad = /((?:19|20)\d{2})\s*[.\-/年]\s*(\d{1,2})?\s*月?\s*毕业/.exec(c);
    var d = dateRange(text);
    if (grad) {
      edu.end = normMonth(grad[1], grad[2]);
      if (d && d.end && d.end !== edu.end && parseInt(d.start, 10) < parseInt(grad[1], 10)) edu.start = d.start;
    } else if (d) {
      edu.start = d.start;
      edu.end = d.end;
    }

    var gpa = /(?:GPA|绩点|平均分)[:：\s]*([0-9]{1,3}(?:\.[0-9]{1,2})?)\s*(?:\/\s*([0-9]{1,3}(?:\.[0-9]{1,2})?))?/i.exec(c);
    if (gpa) edu.gpa = gpa[1] + (gpa[2] ? ' / ' + gpa[2] : '');

    var rank = /(?:专业排名|年级排名|排名|名次)[:：\s]*([0-9]{1,3}\s*\/\s*[0-9]{1,4}|[0-9]{1,3}\s*%|前\s*[0-9]{1,2}\s*%|[0-9]{1,3}\s*\/\s*[0-9]{1,4}\s*[（(]?前\s*[0-9]{1,2}\s*%?[)）]?)/.exec(c);
    if (rank) edu.rank = rank[1].replace(/\s+/g, ' ');

    var courses = /(?:核心课程|主修课程|主要课程|相关课程)[:：]?\s*([^\n]+)/.exec(text);
    if (courses) edu.courses = courses[1].replace(/^[\s:：]+/, '').trim();

    return edu;
  }

  /* ---------------- 项目经历 ---------------- */
  var ROLE_RE = /(负责人|组长|队长|核心成员|成员|独立开发|独立完成|主导|参与|开发者|开发|工程师|实习生|算法|前端|后端|全栈|数据|产品|设计|运营|主讲)/;

  /* 项目符号：常见的有 ▸ ▶ ► ✓ 等，之前漏掉 ▸，导致整段职责都不算「条目行」。
     数字序号必须排除小数：`16.6%` 曾被当成「16.」开头的编号，把「16.」吃掉只剩「6%」。 */
  var BULLET_RE = /^([•·▪▫●○◆◇■□▸▹►▶▷▻➢➤→⇒✓✔✗✘※⁃∙\-–—*]|\d{1,2}\s*[.、)）](?!\d)|[（(]\d{1,2}[)）])\s*/;

  /* 项目内的元信息标签行，如「技术栈：…」「项目职责：…」 */
  var META_LABEL = /^(技术栈|技术选型|技术方案|核心技术|所用技术|使用技术|开发环境|开发工具|运行环境|开发语言|项目描述|项目简介|项目背景|项目概述|项目职责|负责内容|主要工作|工作内容|项目内容|项目成果|项目收获|项目亮点|项目难点|成果|职责|收获)$/;

  /* 名称末尾紧跟的实践方式 / 职务词 */
  var PRACTICE_WORD = /^(个人项目|课程项目|科研项目|企业项目|竞赛项目|开源项目|创业项目|志愿项目|团队项目|毕业设计|实训项目|课程设计)$/;
  var ROLE_WORD = /^(项目负责人|负责人|组长|队长|核心成员|成员|队员|独立开发|独立完成|独立开发者|开发者|主开发|主讲人|主讲者|主讲|参与者|主要参与人|前端开发|后端开发|全栈开发|算法工程师|数据开发|数据分析|产品经理|设计|运营|实习生)$/;

  function stripBullet(s) { return s.replace(BULLET_RE, '').trim(); }

  function isBulletLine(s) {
    return BULLET_RE.test(s.trim());
  }

  /* 「Doub an Movie」→「Douban Movie」：PDF 文字层偶尔把单词拆成两段，
     只合并「两侧都是拉丁字母、中间夹 1~2 个小写字母」的情况，避免误伤正常空格。 */
  function fixLatinGaps(s) {
    return String(s || '').replace(/([A-Za-z]{2,})\s+([a-z]{1,2})\s+([A-Za-z]{2,})/g, function (m, a, b, c) {
      return a + b + ' ' + c;
    });
  }

  /* 名称 / 职务 / 实践方式 拆分。
     重点：`·` 是「主名 · 副名」的连接符，不是分隔符，不能拿来切角色。 */
  function splitNameRole(rest) {
    var s = String(rest || '').replace(/\u00a0/g, ' ').trim();
    var parts = s.split(/[\u3000]+|\s*[|｜]\s*/).map(function (t) { return t.trim(); }).filter(Boolean);
    var name = parts[0] || '';
    var role = '', practice = '';

    for (var i = 1; i < parts.length; i++) {
      var p = parts[i];
      if (!practice && PRACTICE_WORD.test(p)) { practice = p; continue; }
      if (!role && p.length <= 14 && (ROLE_WORD.test(p) || ROLE_RE.test(p))) { role = p; continue; }
    }

    // 「豆瓣电影 · 组长」这种用一个点把角色吊在后面的写法
    if (!role) {
      var tail = /[·•]\s*([^·•]{2,10})$/.exec(name);
      if (tail && (ROLE_WORD.test(tail[1]) || PRACTICE_WORD.test(tail[1]))) {
        if (PRACTICE_WORD.test(tail[1])) practice = tail[1]; else role = tail[1];
        name = name.slice(0, tail.index).trim();
      }
    }

    // 「XX 项目 负责数据采集」这种内联写法
    if (!role) {
      var inline = /^(.{2,40}?)\s+((?:负责|担任|主导|参与|作为)[^|｜]{0,20})$/.exec(name);
      if (inline) { name = inline[1].trim(); role = inline[2].trim(); }
    }

    return { name: fixLatinGaps(name.replace(/\s+/g, ' ').trim()), role: role, practice: practice };
  }

  /* 判断一行（无时间）是否是项目标题。
     真实简历里项目标题经常不带时间，只靠「名称 · 副标题　角色」+ 下一行是技术栈来决定边界。 */
  function isTitleLine(body, ctx) {
    if (!body) return false;
    var len = body.length;
    if (len < 2 || len > 50) return false;
    if (/[。；;]$/.test(body)) return false;          // 整句 = 职责，不是标题
    if (/^[，,、：:）)]/.test(body)) return false;      // 明显是上一句的续行
    if (META_LABEL.test(body)) return false;
    if (ctx.prevUnfinished) return false;             // 上一行以逗号/冒号收尾 → 续写

    var seg0 = body.split(/\s*[·•|｜]\s*/)[0].trim();
    // 「项目负责人 · 4 人团队 · 深圳」是角色/元信息行，不是标题
    if (ROLE_WORD.test(seg0) || (seg0.length <= 12 && ROLE_RE.test(seg0) && /·/.test(body))) return false;
    if (len <= 14 && ROLE_WORD.test(body)) return false;
    // 「算法负责人」「项目组长」这种光秃秃的角色行，不能因为以「负责人」结尾就当标题
    if (len <= 12 && !/[·•]/.test(body) && /(负责人|组长|队长|成员|开发者|独立开发|独立完成)$/.test(body)) return false;

    var sep = /[·•]/.test(body);
    var tailRole = /(独立开发|独立完成|独立开发者|负责人|组长|队长|核心成员|开发者|主讲人|个人项目|课程项目|团队项目|竞赛项目|科研项目|企业项目|开源项目|创业项目|毕业设计|课程设计)$/.test(body);

    if (ctx.nextMeta) return true;                    // 下一行「技术栈：…」→ 强信号
    if (ctx.nextDate) return true;
    if (tailRole) return true;
    if (sep && ctx.nextBullet) return true;
    if (sep && len <= 40) return true;
    if (!ctx.hasCur && ctx.nextBullet && len <= 30) return true;
    return false;
  }

  function metaKind(label) {
    if (/技术栈|技术选型|技术方案|核心技术|所用技术|使用技术|开发环境|开发工具|运行环境|开发语言/.test(label)) return 'tech';
    if (/成果|收获|亮点|难点/.test(label)) return 'results';
    if (/职责|负责|工作|内容/.test(label)) return 'duties';
    return 'desc';
  }

  function nextNonEmpty(lines, from) {
    for (var i = from; i < lines.length; i++) if (lines[i] && lines[i].trim()) return lines[i].trim();
    return '';
  }

  function parseProjects(section) {
    if (!section) return { items: [], orphan: [], consumed: 0, total: 0 };
    var lines = section.lines;
    var items = [], orphan = [], cur = null, pendingTitle = '';
    var consumed = 0;

    function newItem(name, role, d) {
      var it = {
        type: 'project',
        org: name || pendingTitle || '',
        role: role || '',
        practice: '',
        teamSize: '',
        start: d ? d.start : '',
        end: d ? d.end : '',
        city: '',
        tech: '',
        desc: '',
        duties: '',
        results: '',
        bullets: [],
        _raw: []
      };
      pendingTitle = '';
      items.push(it);
      return it;
    }

    /* 把一行元信息（技术栈 / 项目描述 / 职责 / 成果）写进对应字段 */
    function putMeta(kind, value) {
      if (!cur) cur = newItem(pendingTitle, '', null);
      if (kind === 'tech') cur.tech = cur.tech ? cur.tech + '；' + value : value;
      else if (kind === 'desc') cur.desc = cur.desc ? cur.desc + '\n' + value : value;
      else if (kind === 'results') cur.results = cur.results ? cur.results + '\n' + value : value;
      else {
        cur.duties = cur.duties ? cur.duties + '\n' + value : value;
        cur.bullets.push(value);
      }
      consumed++;
    }

    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i].trim();
      if (!raw) continue;
      var d = dateRange(raw);
      var bullet = isBulletLine(raw);
      var body = stripBullet(raw);

      var prevRaw = i > 0 ? (lines[i - 1] || '').trim() : '';
      var nextRaw = nextNonEmpty(lines, i + 1);
      var nextBody = nextRaw ? stripBullet(nextRaw) : '';

      // 0) 元信息标签行：「技术栈：…」「项目职责：…」
      var meta = /^([^:：]{2,10})[:：]\s*(.+)$/.exec(body);
      if (meta && META_LABEL.test(meta[1].trim())) {
        putMeta(metaKind(meta[1]), meta[2].trim());
        continue;
      }

      // 0.1) 「项目名称：X / 项目时间：X / 项目角色：X」这类标签行
      var label = /^(项目名称|项目名|项目标题|课题名称|项目角色|担任角色|角色|项目时间|起止时间|时间)[:：]\s*(.+)$/.exec(body);
      if (label) {
        var val = label[2].trim();
        if (/名称|标题/.test(label[1])) {
          cur = newItem(val, '', null);
          consumed++;
        } else if (/角色/.test(label[1])) {
          if (!cur) cur = newItem(pendingTitle, val, null);
          else cur.role = val;
          consumed++;
        } else {
          var ld = dateRange(val);
          if (!cur) cur = newItem(pendingTitle, '', ld);
          else if (ld) { cur.start = ld.start; cur.end = ld.end; }
          consumed++;
        }
        continue;
      }

      // 1) 带时间的标题行 → 新条目
      if (d && !bullet) {
        var rest = (raw.slice(0, d.index) + ' ' + raw.slice(d.index + d.length)).replace(/\s+/g, ' ').trim();
        rest = rest.replace(/^[-–—|｜\s　]+|[-–—|｜\s　]+$/g, '');
        if (rest.length >= 2 && rest.length <= 90) {
          var cut = rest.search(/[，,]/);
          var headTxt = cut > 0 ? rest.slice(0, cut) : rest;
          var trail = cut > 0 ? rest.slice(cut + 1).replace(/^[，,]\s*/, '') : '';
          headTxt = headTxt.replace(/[。；;]$/, '');
          var nr = splitNameRole(headTxt);
          if (nr.name && nr.name.length <= 40) {
            cur = newItem(nr.name, nr.role, d);
            if (nr.practice) cur.practice = nr.practice;
            if (trail) { cur.duties = trail; cur.bullets.push(trail.replace(/^[•·\-\s]+/, '')); }
            consumed++;
            continue;
          }
        }
      }

      // 2) 纯时间行（标题在上一行）
      if (d && (body === '' || /^[-–—~至到\s]+$/.test(body))) {
        var prev = lines[i - 1] ? stripBullet(lines[i - 1]) : '';
        cur = newItem(prev || pendingTitle, '', d);
        consumed += 2;
        continue;
      }

      // 3) 无时间的标题行（多信号判定）——「名称 · 副标题　角色」+ 下一行技术栈
      if (!bullet && isTitleLine(body, {
        hasCur: !!cur,
        nextBullet: nextBody ? isBulletLine(nextRaw) : false,
        nextMeta: nextBody ? (function () {
          var m = /^([^:：]{2,10})[:：]/.exec(nextBody);
          return !!(m && META_LABEL.test(m[1].trim()));
        })() : false,
        nextDate: nextRaw ? dateRange(nextRaw) : null,
        prevUnfinished: /[，,、：:（(]$/.test(prevRaw)
      })) {
        var t = splitNameRole(body);
        if (t.name) {
          cur = newItem(t.name, t.role, null);
          if (t.practice) cur.practice = t.practice;
          consumed++;
          continue;
        }
      }

      if (!cur) {
        // 还没进入条目：把较短的非句子行当作候选标题
        if (!bullet && body.length <= 40 && !/[。；;]$/.test(body) && !META_LABEL.test(body)) pendingTitle = body;
        else orphan.push(raw);
        continue;
      }

      // 4) 角色/元信息行（紧随标题、尚无条目内容）：「项目负责人 · 4 人团队 · 深圳」
      if (!bullet && cur.bullets.length === 0 && !cur.desc) {
        var rt = body.replace(/^[-–—·\s]+/, '');
        var segs = rt.split(/\s*[·•|｜]\s*/).filter(Boolean);
        var head = segs[0] || '';
        var teamM = /(\d{1,3})\s*(?:人|名)/.exec(rt);
        if (segs.length && head.length <= 12 && (ROLE_WORD.test(head) || ROLE_RE.test(head) || teamM) && rt.length <= 40) {
          if (!cur.role) cur.role = head;
          if (teamM && !cur.teamSize) cur.teamSize = teamM[1] + ' 人';
          if (!cur.city) {
            var cm = CITY_RE.exec(rt);
            if (cm) cur.city = cm[1];
          }
          // 剩下的分片里可能藏着实践方式（团队项目 / 课程项目）
          segs.forEach(function (s) { if (!cur.practice && PRACTICE_WORD.test(s)) cur.practice = s; });
          consumed++;
          continue;
        }
      }

      // 5) 职责 / 成果
      if (!body) continue;
      consumed++;
      if (bullet) {
        cur.bullets.push(body);
        cur._raw.push(raw);
      } else if (cur.bullets.length) {
        var last = cur.bullets[cur.bullets.length - 1];
        // 上一句没有句末标点 → 视为同一条被排版折行，直接拼回去（不再限制长度：
        // 中文简历一句话折成两行时，后半行经常超过 60 字）
        if (!/[。！？；;.]$/.test(last)) {
          cur.bullets[cur.bullets.length - 1] = last + body;
        } else {
          cur.bullets.push(body);
        }
        cur._raw.push(raw);
      } else {
        cur.bullets.push(body);
        cur._raw.push(raw);
      }
    }

    // 清理与校验
    items.forEach(function (it) {
      it.bullets = it.bullets.map(function (b) { return b.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
      it.org = fixLatinGaps((it.org || '').replace(/\s+/g, ' ').trim());
      if (!it.role && it.org) {
        var nr = splitNameRole(it.org);
        if (nr.role && nr.name) { it.org = nr.name; it.role = nr.role; }
        if (nr.practice && !it.practice) it.practice = nr.practice;
      }
      if (!it.duties && it.bullets.length) it.duties = it.bullets.join('\n');
      if (it.tech) it.tech = it.tech.replace(/\s+/g, ' ').trim();
      var cityM = /(?:·|\||｜|\s)\s*([\u4e00-\u9fa5]{2,8})(?:\s*)$/.exec(it.role);
      if (cityM && /市$/.test(cityM[1])) { it.city = cityM[1]; it.role = it.role.replace(cityM[0], ''); }
    });

    return {
      items: items.filter(function (x) { return x.org || x.bullets.length || x.desc; }),
      orphan: orphan,
      consumed: consumed,
      total: lines.filter(function (l) { return l.trim(); }).length
    };
  }

  /* ---------------- 技能 / 证书 ---------------- */
  var PROSE_RE = /(熟练|熟悉|掌握|了解|具备|能力|经验|基础|能够|可以|进行|负责|完成)/;

  /* 常见技能白名单：正文写成散文时，靠它把真正会用到的名词捞出来 */
  var TECH_DICT = ('Python|Java|C\\+\\+|C#|Go|Rust|PHP|Ruby|Scala|R|MATLAB|JavaScript|TypeScript|HTML|CSS|SQL|MySQL|PostgreSQL|Oracle|MongoDB|Redis|SQLite|' +
    'Flask|Django|Tornado|FastAPI|Spring|SpringBoot|Vue|React|Angular|Node\\.js|jQuery|Bootstrap|ElementUI|' +
    'Pandas|NumPy|Matplotlib|PyEcharts|ECharts|Seaborn|Scikit-learn|sklearn|PyTorch|TensorFlow|Keras|XGBoost|LightGBM|jieba|LDA|TF-IDF|' +
    'Git|GitHub|GitLab|Linux|Docker|Kubernetes|Jenkins|Nginx|Hadoop|Hive|Spark|Flink|Kafka|ETL|' +
    'Excel|Word|PowerPoint|PPT|Tableau|Power BI|Axure|Photoshop|Figma|Sketch|SPSS|Stata|LaTeX').split('|');

  function dictScan(text, limit) {
    var out = [], seen = {};
    TECH_DICT.forEach(function (name) {
      var re = new RegExp('(^|[^A-Za-z0-9+#.])(' + name + ')([^A-Za-z0-9+#.]|$)', 'i');
      if (re.test(text) && !seen[name.toLowerCase()]) { seen[name.toLowerCase()] = 1; out.push(name.replace(/\\/g, '')); }
    });
    return out.slice(0, limit || 24);
  }

  function parseSkills(lines) {
    var tech = [], certs = [], langs = [];
    var text = lines.join('\n');
    var seen = {};

    /* 第一步：只从「关键词行」里取词。
       中文简历里技能栏目常写成整段描述（「熟练使用 Python…」），
       那种段落切出来的词全是「能独立」「限速」这类碎片，不如不要。 */
    var kvLines = lines.filter(function (l) {
      var s = String(l || '').trim();
      if (!s) return false;
      if (/[。；;]/.test(s)) return false;
      if (s.length > 40 && /[，,：:]/.test(s)) return false;
      return true;
    });

    kvLines.join('\n').split(/[\n\u3000,，、;；|｜·•]+/).forEach(function (t0) {
      var t = t0.replace(/^[\s:：•·\-–—]+|[\s:：]+$/g, '').trim();
      if (!t || seen[t]) return;
      if (/[。，；;]/.test(t) || PROSE_RE.test(t)) return;
      var open = (t.match(/[（(]/g) || []).length;
      var close = (t.match(/[）)]/g) || []).length;
      if (open !== close) return;
      var hasCJK = /[\u4e00-\u9fa5]/.test(t);
      if (t.length > (hasCJK ? 20 : 40)) return;
      seen[t] = 1;
      if (/(CET|雅思|托福|IELTS|TOEFL|四级|六级|普通话)/i.test(t)) { if (langs.length < 8) langs.push(t); return; }
      if (t.length <= 18 && /(奖学金|证书|大赛|竞赛|杯赛|认证|资格|计算机[一二三四]级|专业[一二三四]级|软考)/.test(t)) {
        if (certs.length < 10) certs.push(t);
        return;
      }
      if (tech.length < 24) tech.push(t.replace(/[:：].*$/, ''));
    });

    /* 第二步：关键词行为空时，用白名单在正文里扫一遍 */
    if (!tech.length) tech = dictScan(text, 24);

    /* 证书：栏目里没有时，从全文找「CET-4 / 计算机二级 / 奖学金」这类独立短语 */
    if (!certs.length) {
      var m = text.match(/(?:CET[- ]?[46]|英语[四六]级|计算机[一二三四]级|普通话[一二三]?[甲乙]?等|软考[^\s，,。；;]{0,12}|[^\s，,。；;]{0,10}(?:奖学金|资格证|等级证书))/g);
      if (m) {
        m.forEach(function (s) {
          var v = s.trim();
          if (v && v.length <= 18 && certs.indexOf(v) < 0 && certs.length < 10) certs.push(v);
        });
      }
    }
    if (!langs.length) {
      var lm = text.match(/(?:CET[- ]?[46]|英语[四六]级|雅思|托福|IELTS|TOEFL)/gi);
      if (lm) lm.forEach(function (s) { if (langs.length < 8 && langs.indexOf(s) < 0) langs.push(s.toUpperCase()); });
    }

    return { tech: tech, certs: certs, langs: langs };
  }

  /* 只允许这些词走「标题：内容」同行写法。
     不能放开到所有栏目名 —— 「技术栈：Python + Flask …」是项目里的元信息，
     一旦被当成小标题，整段项目就会被切碎。 */
  var INLINE_HEADING = /^(教育背景|教育经历|学习经历|项目经历|项目经验|项目实践|实习经历|工作经历|校园经历|社会实践|专业技能|技能特长|获奖情况|荣誉奖项|自我评价|个人总结|个人信息|基本信息)$/;

  /* ---------------- 主流程 ---------------- */
  /* 切栏目：严格模式先跑一遍；一个栏目都没切到时用宽松模式兜底，
     避免「标题写法不常规 → 整份简历被当成一坨正文」这种灾难性降级。 */
  function splitSections(lines, fuzzy) {
    var sections = [];
    var cur = null;
    var headEnd = lines.length;

    lines.forEach(function (line, i) {
      var key = headingOf(line, fuzzy);
      if (!key) {
        var h = /^(.{2,14}?)[:：]\s*(.+)$/.exec(line);
        var inlineKey = h && INLINE_HEADING.test(compact(h[1])) ? headingOf(h[1], fuzzy) : null;
        if (inlineKey) {
          if (sections.length === 0 && headEnd === lines.length) headEnd = i;
          cur = { key: inlineKey, title: h[1], lines: [h[2]] };
          sections.push(cur);
          return;
        }
      }
      if (key) {
        if (sections.length === 0 && headEnd === lines.length) headEnd = i;
        cur = { key: key, title: line, lines: [] };
        sections.push(cur);
      } else if (cur) {
        cur.lines.push(line);
      }
    });

    return { sections: sections, headEnd: headEnd };
  }

  function parseText(text) {
    var lines = normalize(text);
    var warnings = [];
    var pass = splitSections(lines, false);
    var fuzzyUsed = false;
    if (!pass.sections.length) {
      var loose = splitSections(lines, true);
      if (loose.sections.length) {
        pass = loose;
        fuzzyUsed = true;
        warnings.push('小标题格式不常见（可能带序号或装饰符），已按关键词宽松识别，请复核栏目归属');
      }
    }
    var sections = pass.sections;
    var headEnd = pass.headEnd;

    var header = lines.slice(0, headEnd);
    function sec(key) {
      var s = sections.filter(function (x) { return x.key === key; });
      if (!s.length) return null;
      return { lines: s.reduce(function (a, b) { return a.concat(b.lines); }, []) };
    }

    /* 「基本信息」是独立栏目时，姓名/电话/邮箱都在它下面，
       只把标题之前那几行交给 parseBasic 会整段漏掉。 */
    var basicSec = sec('basic');
    var basicSource = basicSec ? header.concat(basicSec.lines) : (header.length ? header : lines);
    var basic = parseBasic(basicSource);
    var eduSec = sec('edu');
    var education = parseEducation(eduSec ? lines : lines, eduSec, eduSec ? eduSec.lines : lines);

    var projSec = sec('project');
    if (!projSec) {
      // 没有明确「项目经历」标题时，从实习/校园之外寻找带时间与职责的段落
      var alt = sec('campus') || sec('intern');
      if (alt && /项目/.test(alt.lines.join(''))) projSec = alt;
      else warnings.push('未找到「项目经历」标题，已尝试按时间与结构推断，请重点复核');
    }
    var proj = parseProjects(projSec);

    var internSec = sec('intern');
    var intern = parseProjects(internSec);
    intern.items.forEach(function (x) { x.type = 'intern'; });

    var campusSec = sec('campus');
    var campus = parseProjects(campusSec);
    campus.items.forEach(function (x) { x.type = 'campus'; });

    var skills = parseSkills((sec('skill') || { lines: [] }).lines);
    var awardLines = (sec('award') || { lines: [] }).lines;
    awardLines.forEach(function (l) {
      l.split(/[\n,，、;；|]/).forEach(function (t) {
        t = t.replace(/^[•·\-]\s*/, '').trim();
        if (t && t.length <= 40 && skills.certs.length < 12) skills.certs.push(t);
      });
    });

    var summarySec = sec('summary');
    var summary = summarySec ? summarySec.lines.join('').replace(/\s+/g, '') : '';

    // 校验
    if (!education.major) warnings.push('未识别到专业名称，请手动确认（避免误填相近专业）');
    if (!education.school) warnings.push('未识别到学校名称');
    if (!education.start && !education.end) warnings.push('未识别到在校时间');
    var noTime = 0;
    proj.items.forEach(function (it, i) {
      if (!it.org) warnings.push('第 ' + (i + 1) + ' 个项目未识别到名称');
      if (!it.start && !it.end) noTime++;
      if (!it.bullets.length && !it.desc) warnings.push('项目「' + (it.org || i + 1) + '」未识别到职责/成果');
      if (it.bullets.length > 8) it.bullets = it.bullets.slice(0, 8);
    });
    if (noTime) warnings.push(noTime + ' 个项目未标注起止时间（简历里没有写），可在「简历填写 - 项目经历」补上');
    if (!proj.items.length) {
      warnings.push(projSec
        ? '「项目经历」栏目已定位，但内部没有可切分的条目，请核对标题与项目符号是否为图形元素'
        : '未识别到项目经历，请检查 PDF 是否为可复制文字的版本');
    }

    // 覆盖率：正文行有多少被归入结构
    var bodyLines = sections.reduce(function (a, s) { return a.concat(s.lines); }, []);
    var consumed = proj.consumed + intern.consumed + campus.consumed +
      (eduSec ? eduSec.lines.length : 0) +
      (basicSec ? basicSec.lines.length : 0) +
      ((sec('skill') || { lines: [] }).lines.length) +
      ((sec('award') || { lines: [] }).lines.length) +
      ((sec('summary') || { lines: [] }).lines.length);
    var coverage = bodyLines.length ? Math.min(1, consumed / Math.max(1, bodyLines.length)) : 0;

    var result = {
      basic: basic,
      education: education,
      projects: proj.items,
      interns: intern.items,
      campus: campus.items,
      skills: skills,
      summary: summary,
      meta: {
        lineCount: bodyLines.length,
        sectionCount: sections.length,
        sectionKeys: sections.map(function (s) { return s.key; }),
        sectionTitles: sections.map(function (s) { return s.title; }),
        fuzzyHeadings: fuzzyUsed,
        coverage: Math.round(coverage * 100),
        warnings: warnings,
        orphan: proj.orphan.slice(0, 6),
        majorCandidates: MAJORS.filter(function (m) {
          return compact(eduSec ? eduSec.lines.join('') : '').indexOf(m) >= 0;
        }).slice(0, 5)
      }
    };
    return result;
  }

  global.ResumeParse = {
    parseText: parseText,
    parse: parseText,
    detectMajor: detectMajor,
    dateRange: dateRange,
    normalize: normalize,
    majors: MAJORS
  };
})(typeof window !== 'undefined' ? window : globalThis);
