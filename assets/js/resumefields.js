/* =========================================================
   简历填写字段字典（参照 cv.playoffer.cn/resumes 的字段设计）
   - 覆盖：个人信息 / 求职意向 / 教育背景 / 实习经历 / 项目经历
            校园经历 / 工作经历 / 社会实践 / 技能专长 / 证书
            外语能力 / 家庭情况 / 获奖经历 / 专利信息 / 论文发表 / 培训经历
   - 全字段选填：字典里没有 required，填写与否都不影响使用
   ========================================================= */
(function (global) {
  'use strict';

  var YES_NO = ['是', '否'];

  /* ---------------- 个人信息（60 项） ---------------- */
  var BASIC = [
    { key: 'name', label: '姓名', type: 'text', ph: '与证件一致' },
    { key: 'namePinyin', label: '姓名拼音', type: 'text', ph: '如 Lin Jiahe' },
    { key: 'enName', label: '英文姓名', type: 'text', ph: '如 Jiahe Lin' },
    { key: 'gender', label: '性别', type: 'select', options: ['男', '女'] },
    { key: 'phone', label: '电话', type: 'text', ph: '11 位手机号' },
    { key: 'email', label: '邮箱', type: 'text', ph: '常用邮箱' },
    { key: 'birth', label: '出生日期', type: 'date' },
    { key: 'age', label: '年龄', type: 'text', ph: '由出生日期自动计算', auto: 'age' },
    { key: 'nationality', label: '国籍', type: 'select', options: ['中国', '中国香港', '中国澳门', '中国台湾', '其他'] },
    { key: 'nation', label: '民族', type: 'text', ph: '如 汉族' },
    { key: 'political', label: '政治面貌', type: 'select', options: ['中共党员', '中共预备党员', '共青团员', '群众', '其他'] },
    { key: 'marital', label: '婚姻状况', type: 'select', options: ['未婚', '已婚', '离异'] },
    { key: 'idType', label: '证件类型', type: 'select', options: ['居民身份证', '护照', '港澳通行证', '台胞证', '其他'] },
    { key: 'idNumber', label: '身份证号', type: 'text', ph: '按需填写，仅保存在本地' },
    { key: 'address', label: '现居住地址', type: 'text', span: 2 },
    { key: 'hometown', label: '籍贯', type: 'text', ph: '省 / 市' },
    { key: 'sourceArea', label: '生源地', type: 'text', ph: '省 / 市' },
    { key: 'hukouType', label: '户口性质', type: 'select', options: ['城镇', '农村'] },
    { key: 'hukouPlace', label: '户口所在地', type: 'text' },
    { key: 'education', label: '最高学历', type: 'select', options: ['博士', '硕士', '本科', '大专', '高中及以下'] },
    { key: 'degree', label: '学位', type: 'select', options: ['博士学位', '硕士学位', '学士学位', '无'] },
    { key: 'school', label: '毕业院校', type: 'text' },
    { key: 'studyForm', label: '学习形式', type: 'select', options: ['全日制', '非全日制', '自考', '成人教育'] },
    { key: 'gradDate', label: '毕业时间', type: 'month' },
    { key: 'freshGrad', label: '是否应届生', type: 'select', options: YES_NO },
    { key: 'workStatus', label: '工作状态', type: 'select', options: ['在校生', '应届毕业生', '在职', '离职', '待业'] },
    { key: 'workYears', label: '工作年限', type: 'select', options: ['无', '1 年以内', '1-3 年', '3-5 年', '5 年以上'] },
    { key: 'lastCompany', label: '上一家公司', type: 'text' },
    { key: 'wechat', label: '微信号', type: 'text' },
    { key: 'qq', label: 'QQ 号', type: 'text' },
    { key: 'homepage', label: '个人主页/作品链接', type: 'text', span: 2, ph: 'GitHub / 博客 / 作品集' },
    { key: 'englishLevel', label: '英语等级', type: 'text', ph: '如 CET-6 538' },
    { key: 'gaokaoDate', label: '高考时间', type: 'month' },
    { key: 'gaokaoScore', label: '高考分数', type: 'text' },
    { key: 'gaokaoSubject', label: '高考科目', type: 'select', options: ['理科', '文科', '物理类', '历史类', '综合改革'] },
    { key: 'title', label: '专业技术职称', type: 'text', ph: '无则可留空' },
    { key: 'emergencyName', label: '紧急联系人姓名', type: 'text' },
    { key: 'emergencyRelation', label: '紧急联系人关系', type: 'text', ph: '如 父亲' },
    { key: 'emergencyPhone', label: '紧急联系电话', type: 'text' },
    { key: 'zipcode', label: '邮政编码', type: 'text' },
    { key: 'health', label: '健康状况', type: 'select', options: ['良好', '一般'] },
    { key: 'chronicDisease', label: '是否有长期病史', type: 'select', options: YES_NO },
    { key: 'criminalRecord', label: '是否有犯罪记录', type: 'select', options: YES_NO },
    { key: 'military', label: '是否服兵役', type: 'select', options: YES_NO },
    { key: 'veteran', label: '是否退伍军人', type: 'select', options: YES_NO },
    { key: 'bloodType', label: '血型', type: 'select', options: ['A 型', 'B 型', 'O 型', 'AB 型', '不详'] },
    { key: 'joinPartyDate', label: '入党时间', type: 'month' },
    { key: 'baoyan', label: '是否保研', type: 'select', options: YES_NO },
    { key: 'overseasStudy', label: '是否有留学经历', type: 'select', options: YES_NO },
    { key: 'poorStudent', label: '是否贫困生', type: 'select', options: YES_NO },
    { key: 'colorWeak', label: '是否色弱', type: 'select', options: YES_NO },
    { key: 'leagueDate', label: '入团/入党时间', type: 'month' },
    { key: 'archivePlace', label: '档案所在地', type: 'text' },
    { key: 'height', label: '身高', type: 'text', ph: 'cm' },
    { key: 'weight', label: '体重', type: 'text', ph: 'kg' },
    { key: 'selfEval', label: '自我介绍（自我评价）', type: 'textarea', span: 2, ph: '80–120 字，突出专业背景 + 一个量化成果' },
    { key: 'strength', label: '个人优势', type: 'textarea', span: 2, ph: '3 条以内，每条一个可验证的优势' },
    { key: 'hobbies', label: '兴趣爱好', type: 'text', span: 2 },
    { key: 'careerPlan', label: '职业规划', type: 'textarea', span: 2, ph: '1–3 年的方向与目标' },
    { key: 'foreignIdentity', label: '是否具有境外身份', type: 'select', options: YES_NO }
  ];

  /* ---------------- 求职意向（12 项） ---------------- */
  var INTENT = [
    { key: 'targetRole', label: '目标岗位', type: 'text', path: 'basic.targetRole', ph: '如 数据分析师' },
    { key: 'targetIndustry', label: '期望行业', type: 'text', ph: '如 互联网 / 消费零售' },
    { key: 'currentIndustry', label: '当前行业', type: 'text' },
    { key: 'onboardTime', label: '预计入职时间', type: 'month' },
    { key: 'expectCity', label: '期望城市', type: 'text', path: 'basic.targetCity', ph: '如 深圳 / 广州' },
    { key: 'interviewCity', label: '面试城市', type: 'text' },
    { key: 'expectSalary', label: '期望薪资', type: 'text', ph: '如 12–15K / 月' },
    { key: 'expectAnnual', label: '期望年薪', type: 'text', ph: '如 18–22 万' },
    { key: 'currentSalary', label: '当前薪资', type: 'text' },
    { key: 'relativeInCompany', label: '是否有亲人在当前求职公司', type: 'select', options: YES_NO },
    { key: 'source', label: '招聘信息来源', type: 'select', options: ['企业官网', '校园宣讲会', '招聘平台', '老师/学长推荐', '社交媒体', '其他'] },
    { key: 'acceptAdjust', label: '是否接受调剂', type: 'select', options: YES_NO }
  ];

  /* ---------------- 教育背景 ---------------- */
  var EDU = [
    { key: 'school', label: '学校名称', type: 'text', span: 2 },
    { key: 'college', label: '学院', type: 'text' },
    { key: 'major', label: '专业', type: 'text' },
    { key: 'degree', label: '学历', type: 'select', options: ['博士', '硕士', '本科', '大专', '高中及以下'] },
    { key: 'degreeType', label: '学位', type: 'select', options: ['博士学位', '硕士学位', '学士学位', '无'] },
    { key: 'studyForm', label: '学习形式', type: 'select', options: ['全日制', '非全日制', '自考', '成人教育'] },
    { key: 'start', label: '入学时间', type: 'month' },
    { key: 'end', label: '毕业时间', type: 'month' },
    { key: 'period', label: '起止时间', type: 'period' },
    { key: 'gpa', label: 'GPA / 平均分', type: 'text', ph: '如 3.62 / 4.0' },
    { key: 'gpaFull', label: 'GPA 满分', type: 'text', ph: '如 4.0 或 100' },
    { key: 'rank', label: '专业排名', type: 'text', ph: '如 8' },
    { key: 'rankTotal', label: '排名总人数', type: 'text', ph: '如 126' },
    { key: 'overseas', label: '是否海外院校', type: 'select', options: YES_NO },
    { key: 'tutor', label: '导师姓名', type: 'text' },
    { key: 'thesis', label: '毕业论文/设计', type: 'text', span: 2 },
    { key: 'courses', label: '主修课程', type: 'textarea', span: 2, ph: '与目标岗位相关的 4–6 门' },
    { key: 'honors', label: '在校荣誉', type: 'textarea', span: 2 }
  ];

  /* ---------------- 实习经历 ---------------- */
  var INTERN = [
    { key: 'org', label: '公司名称', type: 'text', span: 2 },
    { key: 'dept', label: '部门', type: 'text' },
    { key: 'role', label: '实习岗位', type: 'text' },
    { key: 'practice', label: '实践方式', type: 'select', options: ['实地实习', '远程实习', '兼职实习'] },
    { key: 'start', label: '开始时间', type: 'month' },
    { key: 'end', label: '结束时间', type: 'month' },
    { key: 'period', label: '起止时间', type: 'period' },
    { key: 'city', label: '实习城市', type: 'text' },
    { key: 'scale', label: '公司规模', type: 'select', options: ['20 人以下', '20-99 人', '100-499 人', '500-999 人', '1000 人以上'] },
    { key: 'refName', label: '证明人姓名', type: 'text' },
    { key: 'refContact', label: '证明人联系方式', type: 'text' },
    { key: 'refTitle', label: '证明人职位', type: 'text' },
    { key: 'desc', label: '工作描述', type: 'textarea', span: 2, ph: '业务背景 + 你负责的模块' },
    { key: 'duties', label: '工作职责', type: 'textarea', span: 2, ph: '动词开头，一条一行' },
    { key: 'results', label: '工作成果', type: 'textarea', span: 2, ph: '尽量量化：指标 + 幅度 + 时间' }
  ];

  /* ---------------- 项目经历（严格对齐参考页字段） ---------------- */
  var PROJECT = [
    { key: 'org', label: '项目名称', type: 'text', span: 2, ph: '如 豆瓣电影 · 电影数据采集分析与可视化大屏' },
    { key: 'teamSize', label: '团队规模', type: 'select', hint: '项目参与团队人数规模', options: ['1 人', '2-3 人', '4-5 人', '6-10 人', '11-20 人', '20 人以上'], empty: '未填写' },
    { key: 'overseas', label: '是否海外经历', type: 'select', hint: '该项目经历是否发生在海外', options: YES_NO, empty: '未填写' },
    { key: 'role', label: '项目职务', type: 'text', hint: '项目中的角色或职务', ph: '如 独立开发 / 数据负责人' },
    { key: 'practice', label: '实践方式', type: 'select', hint: '项目实践方式', options: ['个人项目', '课程项目', '科研项目', '企业项目', '竞赛项目', '开源项目', '创业项目', '志愿项目'] },
    { key: 'start', label: '开始时间', type: 'month', hint: '项目开始时间' },
    { key: 'end', label: '结束时间', type: 'month', hint: '项目结束时间' },
    { key: 'period', label: '起止时间', type: 'period', hint: '项目开始时间-项目结束时间' },
    { key: 'region', label: '项目地址', type: 'text', hint: '项目所在地区', ph: '如 广东省湛江市' },
    { key: 'link', label: '项目链接', type: 'text', hint: '项目在线链接', ph: 'https://', span: 2 },
    { key: 'refName', label: '证明人姓名', type: 'text', hint: '项目证明人姓名' },
    { key: 'refContact', label: '证明人联系方式', type: 'text', hint: '项目证明人联系方式' },
    { key: 'refTitle', label: '证明人职位', type: 'text', hint: '项目证明人职位' },
    { key: 'desc', label: '项目描述', type: 'textarea', span: 2, ph: '技术栈 + 项目背景与目标，2–3 句' },
    { key: 'duties', label: '项目职责', type: 'textarea', span: 2, ph: '你独立负责的环节，一条一行' },
    { key: 'results', label: '项目成果', type: 'textarea', span: 2, ph: '交付结果与量化成果' }
  ];

  /* ---------------- 校园经历 ---------------- */
  var CAMPUS = [
    { key: 'org', label: '组织/社团名称', type: 'text', span: 2 },
    { key: 'role', label: '担任职务', type: 'text' },
    { key: 'practice', label: '参与方式', type: 'select', options: ['学生组织', '社团活动', '志愿服务', '班级工作'] },
    { key: 'start', label: '开始时间', type: 'month' },
    { key: 'end', label: '结束时间', type: 'month' },
    { key: 'period', label: '起止时间', type: 'period' },
    { key: 'city', label: '活动地点', type: 'text' },
    { key: 'desc', label: '经历描述', type: 'textarea', span: 2 },
    { key: 'duties', label: '具体职责', type: 'textarea', span: 2 },
    { key: 'results', label: '成果与影响', type: 'textarea', span: 2 }
  ];

  /* ---------------- 工作经历 ---------------- */
  var WORK = [
    { key: 'org', label: '公司名称', type: 'text', span: 2 },
    { key: 'dept', label: '部门', type: 'text' },
    { key: 'role', label: '职位名称', type: 'text' },
    { key: 'start', label: '入职时间', type: 'month' },
    { key: 'end', label: '离职时间', type: 'month' },
    { key: 'period', label: '起止时间', type: 'period' },
    { key: 'city', label: '工作城市', type: 'text' },
    { key: 'salary', label: '薪资', type: 'text', ph: '可选填' },
    { key: 'refName', label: '证明人姓名', type: 'text' },
    { key: 'refContact', label: '证明人联系方式', type: 'text' },
    { key: 'desc', label: '工作描述', type: 'textarea', span: 2 },
    { key: 'duties', label: '工作职责', type: 'textarea', span: 2 },
    { key: 'results', label: '工作成果', type: 'textarea', span: 2 }
  ];

  /* ---------------- 社会实践 ---------------- */
  var SOCIAL = [
    { key: 'org', label: '活动/实践名称', type: 'text', span: 2 },
    { key: 'role', label: '担任角色', type: 'text' },
    { key: 'start', label: '开始时间', type: 'month' },
    { key: 'end', label: '结束时间', type: 'month' },
    { key: 'period', label: '起止时间', type: 'period' },
    { key: 'city', label: '实践地点', type: 'text' },
    { key: 'desc', label: '实践描述', type: 'textarea', span: 2 },
    { key: 'results', label: '实践成果', type: 'textarea', span: 2 }
  ];

  /* ---------------- 技能专长（4 项） ---------------- */
  var SKILL = [
    { key: 'techSkills', label: '技术技能', type: 'textarea', span: 2, ph: '如 Python / SQL / Pandas；用「；」分隔' },
    { key: 'langSkills', label: '语言能力', type: 'textarea', span: 2, ph: '如 英语 CET-6 538、普通话二级甲等' },
    { key: 'softSkills', label: '软件技能', type: 'textarea', span: 2, ph: '如 Excel、Tableau、Figma' },
    { key: 'peopleSkills', label: '软技能', type: 'textarea', span: 2, ph: '如 跨部门沟通、项目管理' }
  ];

  /* ---------------- 证书 ---------------- */
  var CERT = [
    { key: 'name', label: '证书名称', type: 'text', span: 2 },
    { key: 'issuer', label: '颁发机构', type: 'text' },
    { key: 'no', label: '证书编号', type: 'text' },
    { key: 'date', label: '获得时间', type: 'month' },
    { key: 'score', label: '成绩/等级', type: 'text' },
    { key: 'desc', label: '说明', type: 'textarea', span: 2 }
  ];

  var FOREIGN = [
    { key: 'lang', label: '语种', type: 'select', options: ['英语', '日语', '韩语', '法语', '德语', '西班牙语', '其他'] },
    { key: 'exam', label: '考试/等级名称', type: 'text', ph: '如 CET-6 / IELTS' },
    { key: 'score', label: '成绩', type: 'text' },
    { key: 'date', label: '获得时间', type: 'month' },
    { key: 'cert', label: '证书名称', type: 'text' },
    { key: 'desc', label: '说明', type: 'textarea', span: 2 }
  ];

  var FAMILY = [
    { key: 'name', label: '姓名', type: 'text' },
    { key: 'relation', label: '关系', type: 'select', options: ['父亲', '母亲', '配偶', '子女', '兄弟姐妹', '其他'] },
    { key: 'age', label: '年龄', type: 'text' },
    { key: 'workUnit', label: '工作单位', type: 'text' },
    { key: 'position', label: '职务', type: 'text' },
    { key: 'phone', label: '联系电话', type: 'text' }
  ];

  var AWARD = [
    { key: 'name', label: '奖项名称', type: 'text', span: 2 },
    { key: 'level', label: '级别', type: 'select', options: ['国家级', '省级', '市级', '校级', '院级', '企业/社会'] },
    { key: 'rank', label: '获奖等级/名次', type: 'text', ph: '如 一等奖 / 第 3 名' },
    { key: 'issuer', label: '颁发机构', type: 'text' },
    { key: 'date', label: '获得时间', type: 'month' },
    { key: 'desc', label: '说明', type: 'textarea', span: 2 }
  ];

  var PATENT = [
    { key: 'name', label: '专利名称', type: 'text', span: 2 },
    { key: 'type', label: '专利类型', type: 'select', options: ['发明专利', '实用新型', '外观设计', '软件著作权'] },
    { key: 'no', label: '专利号/登记号', type: 'text' },
    { key: 'role', label: '本人排名/角色', type: 'text', ph: '如 第 1 发明人' },
    { key: 'date', label: '申请/授权时间', type: 'month' },
    { key: 'status', label: '状态', type: 'select', options: ['已受理', '实质审查', '已授权'] },
    { key: 'desc', label: '说明', type: 'textarea', span: 2 }
  ];

  var PAPER = [
    { key: 'title', label: '论文题目', type: 'text', span: 2 },
    { key: 'journal', label: '期刊/会议', type: 'text' },
    { key: 'level', label: '级别', type: 'select', options: ['SCI', 'EI', 'CSSCI', '中文核心', '普刊', '会议'] },
    { key: 'authors', label: '作者排名', type: 'text', ph: '如 第一作者' },
    { key: 'date', label: '发表时间', type: 'month' },
    { key: 'link', label: '链接/DOI', type: 'text' },
    { key: 'desc', label: '摘要/说明', type: 'textarea', span: 2 }
  ];

  var TRAINING = [
    { key: 'name', label: '培训名称', type: 'text', span: 2 },
    { key: 'org', label: '培训机构', type: 'text' },
    { key: 'start', label: '开始时间', type: 'month' },
    { key: 'end', label: '结束时间', type: 'month' },
    { key: 'period', label: '起止时间', type: 'period' },
    { key: 'desc', label: '培训内容', type: 'textarea', span: 2 },
    { key: 'results', label: '获得证书/成果', type: 'textarea', span: 2 }
  ];

  var SECTIONS = [
    { key: 'basic', name: '个人信息', icon: 'user', kind: 'fields', fields: BASIC, desc: '身份、联系方式与背景信息，填多少算多少' },
    { key: 'intent', name: '求职意向', icon: 'target', kind: 'fields', fields: INTENT, desc: '决定投递方向，建议至少填写目标岗位' },
    { key: 'edu', name: '教育背景', icon: 'book', kind: 'repeat', fields: EDU, itemName: '教育背景', empty: '教育经历' },
    { key: 'intern', name: '实习经历', icon: 'briefcase', kind: 'repeat', fields: INTERN, itemName: '实习经历', empty: '实习经历' },
    { key: 'project', name: '项目经历', icon: 'grid', kind: 'repeat', fields: PROJECT, itemName: '项目经历', empty: '项目经历' },
    { key: 'campus', name: '校园经历', icon: 'star', kind: 'repeat', fields: CAMPUS, itemName: '校园经历', empty: '校园经历' },
    { key: 'work', name: '工作经历', icon: 'won', kind: 'repeat', fields: WORK, itemName: '工作经历', empty: '工作经历' },
    { key: 'social', name: '社会实践', icon: 'pin', kind: 'repeat', fields: SOCIAL, itemName: '社会实践', empty: '社会实践' },
    { key: 'skill', name: '技能专长', icon: 'zap', kind: 'fields', fields: SKILL, desc: '技能、语言、软件与软实力' },
    { key: 'cert', name: '证书', icon: 'checkCircle', kind: 'repeat', fields: CERT, itemName: '证书', empty: '证书' },
    { key: 'foreign', name: '外语能力', icon: 'link', kind: 'repeat', fields: FOREIGN, itemName: '外语能力', empty: '外语能力' },
    { key: 'family', name: '家庭情况', icon: 'user', kind: 'repeat', fields: FAMILY, itemName: '家庭成员', empty: '家庭情况' },
    { key: 'award', name: '获奖经历（奖学金）', icon: 'won', kind: 'repeat', fields: AWARD, itemName: '获奖经历', empty: '获奖经历' },
    { key: 'patent', name: '专利信息', icon: 'file', kind: 'repeat', fields: PATENT, itemName: '专利信息', empty: '专利信息' },
    { key: 'paper', name: '论文发表', icon: 'book', kind: 'repeat', fields: PAPER, itemName: '论文发表', empty: '论文发表' },
    { key: 'training', name: '培训经历', icon: 'book', kind: 'repeat', fields: TRAINING, itemName: '培训经历', empty: '培训经历' }
  ];

  var BY_KEY = {};
  SECTIONS.forEach(function (s) { BY_KEY[s.key] = s; });

  /* 经历类 section → profile.experiences 的 type */
  var EXP_TYPES = { intern: 'intern', project: 'project', campus: 'campus', work: 'work', social: 'social' };
  /* 其余重复 section → profile 上的数组字段 */
  var LISTS = {
    edu: 'educations',
    cert: 'certs', foreign: 'foreigns', family: 'families',
    award: 'awards', patent: 'patents', paper: 'papers', training: 'trainings'
  };

  function section(key) { return BY_KEY[key] || SECTIONS[0]; }

  function blank(v) {
    if (v == null) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    return false;
  }

  function toText(v) {
    if (v == null) return '';
    if (Array.isArray(v)) return v.filter(Boolean).join('；');
    return String(v);
  }

  /* ---------------- 取值 ---------------- */
  function valueOf(profile, field) {
    if (!profile) return '';
    if (field.path) {
      return field.path.split('.').reduce(function (o, k) {
        return o == null ? undefined : o[k];
      }, profile);
    }
    if (field.type === 'period') return '';
    var scope = field.scope || 'basic';
    return profile[scope] ? profile[scope][field.key] : '';
  }

  function valueOfItem(item, field) {
    if (!item) return '';
    if (field.type === 'period') return periodOf(item);
    return item[field.key];
  }

  function ageFrom(birth) {
    if (!birth) return '';
    var d = new Date(String(birth).replace(/-/g, '/'));
    if (isNaN(d.getTime())) return '';
    var now = new Date();
    var age = now.getFullYear() - d.getFullYear();
    var m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age > 0 && age < 120 ? String(age) : '';
  }

  function valueOfSection(profile, sec, field) {
    if (field.auto === 'age') return ageFrom(profile.basic && profile.basic.birth);
    if (sec.kind === 'fields') {
      if (sec.key === 'skill') {
        var sk = profile.skills || {};
        if (field.key === 'techSkills') return (sk.tech || []).join('；');
        if (field.key === 'langSkills') return (sk.langs || []).join('；');
        if (field.key === 'softSkills') return (sk.soft || []).join('；');
        if (field.key === 'peopleSkills') return (sk.people || []).join('；');
        return '';
      }
      if (sec.key === 'intent') return valueOf(profile, { path: field.path || ('intent.' + field.key) });
      return valueOf(profile, { path: 'basic.' + field.key });
    }
    return '';
  }

  /* ---------------- 起止时间 ---------------- */
  function normPeriod(v) {
    if (!v) return '';
    var s = String(v).trim().replace(/[./]/g, '-');
    var m = s.match(/^(\d{4})-(\d{1,2})$/);
    if (m) return m[1] + '.' + ('0' + m[2]).slice(-2);
    return s;
  }
  function periodOf(item) {
    if (!item) return '';
    var a = normPeriod(item.start), b = normPeriod(item.end);
    if (!a && !b) return '';
    return (a || '?') + ' - ' + (b || '至今');
  }

  /* ---------------- 集合操作 ---------------- */
  function items(profile, secKey) {
    if (!profile) return [];
    var t = EXP_TYPES[secKey];
    if (t) return (profile.experiences || []).filter(function (x) { return x.type === t; });
    var listKey = LISTS[secKey];
    if (listKey) {
      if (!profile[listKey]) profile[listKey] = [];
      return profile[listKey];
    }
    return [];
  }

  function newItem(secKey) {
    var id = 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (EXP_TYPES[secKey]) {
      return { id: id, type: EXP_TYPES[secKey], org: '', role: '', start: '', end: '', bullets: [] };
    }
    return { id: id };
  }

  /* ---------------- 完整度 ---------------- */
  function filledFields(profile, sec, item) {
    var out = { filled: 0, total: 0, missing: [] };
    sec.fields.forEach(function (f) {
      if (f.type === 'period' || f.auto) return;   // 自动计算，不参与统计
      out.total++;
      var v = item ? valueOfItem(item, f) : valueOfSection(profile, sec, f);
      if (!blank(v)) out.filled++;
      else out.missing.push(f.label);
    });
    return out;
  }

  function sectionStat(profile, secKey) {
    var sec = section(secKey);
    var stat = { key: sec.key, name: sec.name, filled: 0, total: 0, missing: [], items: 0, hasContent: false };
    if (sec.kind === 'fields') {
      var r = filledFields(profile, sec, null);
      stat.filled = r.filled;
      stat.total = r.total;
      stat.missing = r.missing;
      stat.hasContent = r.filled > 0;
      return stat;
    }
    var list = items(profile, secKey);
    stat.items = list.length;
    list.forEach(function (it) {
      var s = filledFields(profile, sec, it);
      stat.filled += s.filled;
      stat.total += s.total;
      s.missing.forEach(function (m) { stat.missing.push(m); });
    });
    stat.hasContent = list.length > 0;
    stat.missingItems = list.filter(function (it) {
      return filledFields(profile, sec, it).filled === 0;
    }).length;
    return stat;
  }

  function itemMissing(profile, secKey, item) {
    return filledFields(profile, section(secKey), item);
  }

  function overall(profile) {
    var filled = 0, total = 0, sections = [];
    SECTIONS.forEach(function (s) {
      var st = sectionStat(profile, s.key);
      sections.push(st);
      if (s.kind === 'repeat' && !st.items) return;   // 未新增的空 section 不计入分母
      filled += st.filled;
      total += st.total;
    });
    return {
      filled: filled,
      total: total,
      percent: total ? Math.round(filled / total * 100) : 0,
      sections: sections,
      pending: sections.filter(function (s) {
        return s.total > s.filled || (section(s.key).kind === 'repeat' && !s.items);
      })
    };
  }

  function itemTitle(secKey, item) {
    var sec = section(secKey);
    if (!item) return sec.name;
    var primary = item.org || item.name || item.title || item.school || '';
    return primary || ('未命名' + (sec.itemName || sec.name));
  }

  /* 把一条经历压成纯文本（供网申写入 / 简历渲染复用） */
  function itemText(item) {
    if (!item) return '';
    var head = [item.org || item.name || item.title, item.role].filter(Boolean).join('｜');
    var per = periodOf(item);
    var parts = [];
    if (item.desc) parts.push('描述：' + item.desc);
    if (item.duties) parts.push('职责：' + item.duties);
    if (item.results) parts.push('成果：' + item.results);
    if (!parts.length && item.bullets) parts = item.bullets.filter(Boolean);
    return [head, per].filter(Boolean).join('　') + (parts.length ? '\n' + parts.join('\n') : '');
  }

  global.ResumeFields = {
    SECTIONS: SECTIONS,
    BY_KEY: BY_KEY,
    EXP_TYPES: EXP_TYPES,
    LISTS: LISTS,
    section: section,
    items: items,
    newItem: newItem,
    valueOf: valueOf,
    valueOfItem: valueOfItem,
    valueOfSection: valueOfSection,
    ageFrom: ageFrom,
    periodOf: periodOf,
    normPeriod: normPeriod,
    blank: blank,
    toText: toText,
    filledFields: filledFields,
    itemMissing: itemMissing,
    sectionStat: sectionStat,
    overall: overall,
    itemTitle: itemTitle,
    itemText: itemText
  };
})(window);
