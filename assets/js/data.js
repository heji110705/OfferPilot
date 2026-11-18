/* =========================================================
   演示数据 / 词库 / 网申表单定义
   ========================================================= */
(function (global) {
  'use strict';

  function dayOffset(n) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function isoOffset(n, h) {
    var d = new Date();
    d.setDate(d.getDate() + n);
    if (h != null) d.setHours(h, 20, 0, 0);
    return d.toISOString();
  }

  /* ---------------- 用户档案 ----------------
     字段设计对齐 cv.playoffer.cn/resumes：全部选填，空着也能正常使用 */
  var PROFILE = {
    basic: {
      name: '林嘉禾',
      namePinyin: 'Lin Jiahe',
      enName: 'Jiahe Lin',
      gender: '男',
      birth: '2004-08-16',
      nationality: '中国',
      nation: '汉族',
      political: '共青团员',
      marital: '未婚',
      idType: '居民身份证',
      hometown: '广东茂名',
      sourceArea: '广东茂名',
      hukouType: '城镇',
      hukouPlace: '广东省茂名市',
      address: '广东省湛江市麻章区海大路 1 号',
      education: '本科',
      degree: '学士学位',
      school: '广东海洋大学',
      studyForm: '全日制',
      gradDate: '2027-06',
      freshGrad: '是',
      workStatus: '在校生',
      workYears: '无',
      phone: '13802718842',
      email: 'linjiahe@stu.gdou.edu.cn',
      wechat: 'ljh_2004',
      homepage: 'github.com/linjiahe',
      englishLevel: 'CET-6（538 分）',
      gaokaoSubject: '物理类',
      health: '良好',
      height: '178',
      weight: '65',
      targetRole: '数据分析师',
      targetCity: '深圳 / 广州',
      selfEval: '数据科学与大数据技术专业 2027 届本科生，GPA 3.62/4.0，专业排名前 7%。有两段数据分析相关实践：在 SHEIN 实习期间独立负责女装品类经营看板，把周报产出时间从 6 小时压缩到 40 分钟；在校独立完成课程成绩预警模型，AUC 0.87 并已在学院试点。习惯用数据讲故事，能独立完成从取数、清洗、建模到可视化的完整链路。',
      strength: '1. 完整的取数—清洗—建模—可视化链路能力；2. 能把分析结论落到业务动作上，实习期间 2 条结论被采纳进选品清单；3. 工程基础扎实，可独立完成数据看板的前后端实现。',
      hobbies: '长跑、篮球、数据分析类播客',
      careerPlan: '短期（1–2 年）在消费/互联网业务侧做数据分析，建立指标体系与实验能力；中期向商业分析/数据产品方向延伸。'
    },
    intent: {
      targetIndustry: '互联网 / 消费零售',
      currentIndustry: '在校学生',
      onboardTime: '2027-06',
      interviewCity: '深圳',
      expectSalary: '12–15K / 月',
      expectAnnual: '18–22 万',
      relativeInCompany: '否',
      source: '企业官网',
      acceptAdjust: '是'
    },
    educations: [{
      id: 'edu1',
      school: '广东海洋大学',
      college: '数学与计算机学院',
      major: '数据科学与大数据技术',
      degree: '本科',
      degreeType: '学士学位',
      studyForm: '全日制',
      start: '2023-09',
      end: '2027-06',
      period: '2023.09 - 2027.06',
      gpa: '3.62',
      gpaFull: '4.0',
      rank: '8',
      rankTotal: '126',
      overseas: '否',
      courses: '数据结构、数据库原理、Hadoop 分布式计算、机器学习、数据可视化',
      honors: '校一等奖学金（2024、2025）、蓝桥杯省赛二等奖'
    }],
    experiences: [{
      id: 'exp1', type: 'intern', org: '广州希音（SHEIN）', dept: '女装品类运营部', role: '数据分析实习生',
      practice: '实地实习', start: '2026-07', end: '2026-09', period: '2026.07 - 2026.09', city: '广州',
      scale: '1000 人以上',
      desc: '负责女装品类周度经营看板与用户分层分析，支撑买手与运营的选品、投放决策。',
      duties: '搭建女装品类周度经营看板，使用 SQL + Pandas 清洗 12 万行订单数据\n通过 RFM 分层定位高价值用户群，推动复购券投放策略调整\n与买手团队协作完成 3 次新品测款复盘，输出分析结论',
      results: '周报产出时间从 6 小时压缩至 40 分钟；试点人群 30 天复购率提升 8.6%；5 份分析结论中 2 条被采纳进 Q4 选品清单。',
      tags: ['SQL', 'Python', '用户增长', '数据看板'],
      bullets: [
        '负责女装品类周度经营看板搭建，使用 SQL + Pandas 清洗 12 万行订单数据，将周报产出时间从 6 小时压缩至 40 分钟。',
        '通过 RFM 分层定位高价值用户群，推动复购券投放策略调整，试点人群 30 天复购率提升 8.6%。',
        '与买手团队协作完成 3 次新品测款复盘，输出 5 份分析结论，其中 2 条被采纳进 Q4 选品清单。'
      ]
    }, {
      id: 'exp2', type: 'project', org: '高校课程成绩预警系统', role: '独立开发 / 算法负责人',
      practice: '课程项目', teamSize: '1 人', overseas: '否',
      start: '2026-03', end: '2026-06', period: '2026.03 - 2026.06', city: '湛江',
      desc: '面向学院教务的成绩风险预警系统：基于学籍与学习行为数据构建分类模型，输出挂科风险名单，供辅导员按周跟进。',
      duties: '独立完成数据采集与特征工程，处理 1.8 万条学籍与学习行为数据，构建 26 维特征\n训练 XGBoost 分类模型并做阈值调优，兼顾召回率与误报率\n使用 Flask + ECharts 搭建可视化后台，支持按周查看预警名单与风险因子',
      results: '模型 AUC 0.87，对挂科风险学生的召回率 81%，已在学院 2 个班级试点运行。',
      tags: ['Python', 'XGBoost', '特征工程', 'Flask'],
      bullets: [
        '独立完成数据采集与特征工程，处理 1.8 万条学籍与学习行为数据，构建 26 维特征。',
        '模型 AUC 0.87，对挂科风险学生的召回率 81%，已在学院 2 个班级试点运行。',
        '使用 Flask + ECharts 搭建可视化后台，辅导员可按周查看预警名单与风险因子。'
      ]
    }, {
      id: 'exp3', type: 'project', org: '校园二手交易平台「海淘集」', role: '后端负责人（4 人团队）',
      practice: '创业项目', teamSize: '4-5 人', overseas: '否',
      start: '2025-09', end: '2026-01', period: '2025.09 - 2026.01', city: '湛江',
      desc: '面向本校学生的二手交易平台，包含商品发布、搜索、下单与站内消息，前端为微信小程序。',
      duties: '使用 Django + MySQL 设计 12 张核心数据表，实现商品、订单、消息三大模块\n对接微信小程序端，完成登录、支付回调与消息推送\n引入 Redis 缓存热门列表与商品详情，优化接口响应',
      results: '平台累计注册用户 2100+，日均订单 60 单；接口平均响应时间从 420ms 降至 90ms。',
      tags: ['Django', 'MySQL', 'Redis', '微信小程序'],
      bullets: [
        '使用 Django + MySQL 设计 12 张核心数据表，实现商品、订单、消息三大模块。',
        '对接微信小程序端，平台累计注册用户 2100+，日均订单 60 单。',
        '引入 Redis 缓存热门列表，接口平均响应时间从 420ms 降至 90ms。'
      ]
    }, {
      id: 'exp4', type: 'campus', org: '数计学院学生会', role: '技术部部长',
      practice: '学生组织', start: '2024-09', end: '2025-06', period: '2024.09 - 2025.06', city: '湛江',
      desc: '负责学院公众号与活动报名系统的技术维护，带 8 人小组。',
      duties: '带领 8 人小组维护学院公众号与活动报名系统\n主导迎新系统改版，重做报名表单与数据校验',
      results: '累计服务 1200+ 人次；报名信息录入错误率下降 70%。',
      tags: ['团队协作', '活动运营'],
      bullets: [
        '带领 8 人小组维护学院公众号与活动报名系统，累计服务 1200+ 人次。',
        '主导迎新系统改版，报名信息录入错误率下降 70%。'
      ]
    }],
    skills: {
      tech: ['Python', 'SQL', 'Pandas', 'NumPy', 'MySQL', 'Excel', 'Tableau', 'Git', 'Django', 'XGBoost', '微信小程序'],
      langs: ['英语 CET-6（538 分）', '普通话二级甲等'],
      certs: ['计算机二级（Python）', '蓝桥杯省赛二等奖', '全国大学生数学建模竞赛省三等奖'],
      soft: ['Excel', 'Tableau', 'Power BI', 'Figma'],
      people: ['跨部门沟通', '项目推动', '结构化表达']
    },
    certs: [{
      id: 'c1', name: '计算机二级（Python）', issuer: '教育部考试中心', date: '2024-09', score: '合格'
    }],
    foreigns: [{
      id: 'fo1', lang: '英语', exam: 'CET-6', score: '538', date: '2025-12'
    }],
    families: [],
    awards: [{
      id: 'aw1', name: '校一等奖学金', level: '校级', rank: '一等', issuer: '广东海洋大学', date: '2025-10'
    }, {
      id: 'aw2', name: '蓝桥杯省赛', level: '省级', rank: '二等奖', date: '2025-04'
    }],
    patents: [],
    papers: [],
    trainings: []
  };

  /* ---------------- 简历库 ---------------- */
  var RESUMES = [{
    id: 'r1',
    name: '主简历 · 数据分析',
    target: '数据分析师 / 数据运营',
    tags: ['SQL', 'Python', '用户增长', 'A/B 测试'],
    summary: '数据科学与大数据技术 2027 届本科生，GPA 3.62/4.0（专业前 7%）。具备完整的数据分析链路能力：SQL 取数、Pandas 清洗、建模与可视化；在 SHEIN 实习期间独立负责品类经营看板，复购率提升 8.6%。',
    order: ['exp1', 'exp2', 'exp3', 'exp4'],
    updatedAt: isoOffset(-2, 21),
    isDefault: true
  }, {
    id: 'r2',
    name: '简历 · 后端开发',
    target: '后端开发工程师 / 服务端研发',
    tags: ['Django', 'MySQL', 'Redis', '接口性能'],
    summary: '数据科学与大数据技术 2027 届本科生，主攻 Python 后端开发。独立设计并上线校园二手交易平台后端，服务 2100+ 注册用户，通过 Redis 缓存将接口响应从 420ms 优化至 90ms。',
    order: ['exp3', 'exp2', 'exp1', 'exp4'],
    updatedAt: isoOffset(-6, 15),
    isDefault: false
  }, {
    id: 'r3',
    name: '简历 · 产品运营',
    target: '产品运营 / 用户运营',
    tags: ['用户分层', '活动策划', '数据分析'],
    summary: '具备数据敏感度的运营方向候选人。曾在 SHEIN 通过 RFM 分层推动复购策略优化，30 天复购率 +8.6%；在校主导迎新系统改版，服务 1200+ 新生。',
    order: ['exp1', 'exp4', 'exp3', 'exp2'],
    updatedAt: isoOffset(-11, 10),
    isDefault: false
  }];

  /* ---------------- 投递记录 ----------------
     默认留空：投递记录应由用户真实投递产生，不预置演示数据。
     新增投递在「投递进度 → 新增投递」或网申填写提交后自动写入。 */
  var APPS = [];

  /* ---------------- 附件 ----------------
     默认留空：材料由用户上传（简历 PDF 解析会自动登记）。 */
  var FILES = [];

  /* ---------------- 网申表单定义（字段 → 档案映射） ---------------- */
  var APPLY_FORM = [
    {
      group: '基本信息', icon: 'user', fields: [
        { key: 'name', label: '姓名', type: 'text', required: false, map: 'basic.name', syn: ['姓名', '真实姓名', '申请人姓名'] },
        { key: 'gender', label: '性别', type: 'select', required: false, map: 'basic.gender', options: ['男', '女'], syn: ['性别'] },
        { key: 'birth', label: '出生日期', type: 'date', required: false, map: 'basic.birth', syn: ['出生日期', '生日', '出生年月'] },
        { key: 'political', label: '政治面貌', type: 'select', required: false, map: 'basic.political', options: ['中共党员', '中共预备党员', '共青团员', '群众'], syn: ['政治面貌'] },
        { key: 'hometown', label: '籍贯', type: 'text', required: false, map: 'basic.hometown', syn: ['籍贯', '生源地', '户口所在地'] },
        { key: 'phone', label: '手机号码', type: 'text', required: false, map: 'basic.phone', syn: ['手机号码', '联系电话', '手机号'] },
        { key: 'email', label: '电子邮箱', type: 'text', required: false, map: 'basic.email', syn: ['电子邮箱', 'Email', '邮箱地址'] },
        { key: 'wechat', label: '微信号', type: 'text', required: false, map: 'basic.wechat', syn: ['微信号', '微信'] }
      ]
    },
    {
      group: '教育背景', icon: 'book', fields: [
        { key: 'degree', label: '最高学历', type: 'select', required: false, map: 'educations.0.degree', options: ['本科', '硕士', '博士', '大专'], syn: ['最高学历', '学历', '学位'] },
        { key: 'school', label: '毕业院校', type: 'text', required: false, map: 'educations.0.school', syn: ['毕业院校', '学校', '就读学校'] },
        { key: 'college', label: '学院', type: 'text', required: false, map: 'educations.0.college', syn: ['学院', '院系'] },
        { key: 'major', label: '专业', type: 'text', required: false, map: 'educations.0.major', syn: ['专业', '所学专业'] },
        { key: 'enroll', label: '入学时间', type: 'month', required: false, map: 'educations.0.start', syn: ['入学时间', '入学年月'] },
        { key: 'grad', label: '预计毕业时间', type: 'month', required: false, map: 'educations.0.end', syn: ['毕业时间', '预计毕业时间', '毕业年月'] },
        { key: 'gpa', label: '平均绩点', type: 'text', required: false, map: 'educations.0.gpa', syn: ['GPA', '平均绩点', '成绩'] },
        { key: 'rank', label: '专业排名', type: 'text', required: false, map: 'educations.0.rank', syn: ['专业排名', '年级排名'] },
        { key: 'english', label: '英语水平', type: 'text', required: false, map: 'skills.langs.0', syn: ['英语水平', '外语等级', '四六级'] }
      ]
    },
    {
      group: '求职意向', icon: 'target', fields: [
        { key: 'targetRole', label: '意向岗位', type: 'text', required: false, map: 'basic.targetRole', syn: ['意向岗位', '应聘岗位', '求职岗位'], value: '数据分析师' },
        { key: 'targetCity', label: '意向城市', type: 'text', required: false, map: 'basic.targetCity', syn: ['意向城市', '期望工作城市'], value: '深圳' },
        { key: 'available', label: '可到岗时间', type: 'select', required: false, map: null, options: ['随时到岗', '2027 年 3 月', '2027 年 7 月', '毕业后到岗'], syn: ['到岗时间', '可入职时间'] },
        { key: 'salary', label: '期望薪资', type: 'text', required: false, map: null, syn: ['期望薪资', '薪资要求'] }
      ]
    },
    {
      group: '经历与评价', icon: 'briefcase', fields: [
        { key: 'intern', label: '实习经历', type: 'textarea', required: false, map: 'experiences.0', syn: ['实习经历', '工作经历'], span: 2 },
        { key: 'project', label: '项目经历', type: 'textarea', required: false, map: 'experiences.1', syn: ['项目经历', '项目经验'], span: 2 },
        { key: 'campus', label: '校园经历', type: 'textarea', required: false, map: 'experiences.3', syn: ['校园经历', '社团经历'], span: 2 },
        { key: 'selfEval', label: '自我评价', type: 'textarea', required: false, map: 'basic.selfEval', syn: ['自我评价', '个人简介', '自我介绍'], span: 2 },
        { key: 'award', label: '获奖情况', type: 'textarea', required: false, map: 'skills.certs', syn: ['获奖情况', '荣誉奖项'], span: 2 }
      ]
    },
    {
      group: '材料上传', icon: 'upload', fields: [
        { key: 'resumeFile', label: '简历附件', type: 'file', required: false, map: 'files.resume', kind: 'resume', syn: ['简历附件', '上传简历'] },
        { key: 'transcript', label: '成绩单', type: 'file', required: false, map: 'files.transcript', kind: 'transcript', syn: ['成绩单', '成绩证明'] }
      ]
    }
  ];

  /* ---------------- 阶段定义 ---------------- */
  var STAGES = [
    { key: 'todo', name: '待投递', color: '#94a3b8' },
    { key: 'applied', name: '已投递', color: '#2563eb' },
    { key: 'written', name: '笔试中', color: '#7c3aed' },
    { key: 'interview', name: '面试中', color: '#e08c04' },
    { key: 'offer', name: 'Offer', color: '#0e9f6e' },
    { key: 'rejected', name: '未通过', color: '#cbd5e1' }
  ];

  /* ---------------- 技能词库（JD 解析用） ---------------- */
  var SKILL_DICT = [
    'Python', 'SQL', 'Excel', 'Tableau', 'Power BI', 'Pandas', 'NumPy', 'Spark', 'Hive',
    '机器学习', '深度学习', 'XGBoost', 'A/B 测试', 'AB 测试', '数据建模', '指标体系', '数据可视化',
    '用户增长', '用户运营', '活动策划', '增长实验', '统计分析', '假设检验', '回归分析',
    'Java', 'Go', 'C++', 'Django', 'Flask', 'Spring Boot', 'MySQL', 'Redis', 'Kafka',
    'Linux', 'Docker', 'Kubernetes', '微服务', '分布式', '高并发', '接口开发', 'Git',
    'React', 'Vue', 'JavaScript', 'TypeScript', '微信小程序', 'HTML/CSS',
    '产品原型', 'Axure', '需求分析', '竞品分析', 'PRD', '项目管理', '跨部门协作',
    'TensorFlow', 'PyTorch', 'NLP', '推荐系统', '计算机视觉'
  ];

  var ROLE_HINTS = [
    { role: '数据分析师', keys: ['数据分析', '商业分析', '数据运营', 'bi', '看板', '指标体系', 'sql'] },
    { role: '算法工程师', keys: ['算法', '机器学习', '模型', '深度学习', 'nlp', '推荐'] },
    { role: '后端开发工程师', keys: ['后端', '服务端', 'java', 'go', 'django', '微服务', '接口'] },
    { role: '前端开发工程师', keys: ['前端', 'react', 'vue', 'javascript', 'h5'] },
    { role: '产品经理', keys: ['产品经理', '产品设计', 'prd', '需求', '原型'] },
    { role: '运营岗', keys: ['运营', '活动', '内容', '用户增长', '社群'] },
    { role: '测试工程师', keys: ['测试', '自动化测试', '质量'] }
  ];

  var SAMPLE_JD = '【字节跳动 · 数据分析师（2027 校招）】\n工作地点：深圳\n\n岗位职责：\n1. 负责业务核心指标体系建设，搭建经营看板，支撑管理层决策；\n2. 通过数据分析定位业务问题，输出可落地的增长策略并跟踪效果；\n3. 与产品、运营、算法团队协作，设计并评估 A/B 测试实验。\n\n任职要求：\n1. 2027 届本科及以上学历，计算机、统计、数学等相关专业；\n2. 熟练使用 SQL 进行数据提取与处理，掌握 Python / Pandas 者优先；\n3. 具备较强的统计分析能力，熟悉假设检验、回归分析等方法；\n4. 有用户增长、数据可视化（Tableau / Power BI）相关经验者优先；\n5. 良好的沟通与跨部门协作能力，能独立推动项目落地。';

  global.SeedData = {
    profile: PROFILE,
    resumes: RESUMES,
    apps: APPS,
    files: FILES,
    applyForm: APPLY_FORM,
    stages: STAGES,
    skillDict: SKILL_DICT,
    roleHints: ROLE_HINTS,
    sampleJD: SAMPLE_JD,
    dayOffset: dayOffset,
    isoOffset: isoOffset
  };
})(window);
