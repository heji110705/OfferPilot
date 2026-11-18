/* =========================================================
   网申字段词典（双端共用）
   - 工作台页面（extension page）与 content script 共用同一份定义
   - 只做纯函数：输入 state，输出可写入表单的文本
   ========================================================= */
(function (global) {
  'use strict';

  var VERSION = 1;

  /* ---------------- 通用工具 ---------------- */
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

  function blank(v) {
    if (v == null) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    return false;
  }

  function toText(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) {
      if (!v.length) return '';
      if (typeof v[0] === 'string') return v.join('；');
      return v.map(toText).join('\n');
    }
    if (typeof v === 'object') {
      var head = [v.org, v.role].filter(Boolean).join('｜');
      var period = [v.start, v.end].filter(Boolean).join(' – ');
      var line = [head, period].filter(Boolean).join('　');
      var body = [];
      if (v.desc) body.push(v.desc);
      if (v.duties) body.push(v.duties);
      if (v.results) body.push(v.results);
      if (!body.length) body = (v.bullets || []).filter(Boolean).map(function (b) { return '· ' + b; });
      return line + (body.length ? '\n' + body.join('\n') : '');
    }
    return String(v);
  }

  function expText(list, resume) {
    return sortByResume(list, resume).filter(function (e) {
      return e && (e.org || e.desc || e.duties || e.results || (e.bullets && e.bullets.length));
    }).map(function (e) {
      var head = [e.org, e.role].filter(Boolean).join('｜');
      var period = e.period || [e.start, e.end].filter(Boolean).join(' – ');
      var line = [head, period].filter(Boolean).join('　');
      var body = [];
      if (e.desc) body.push(e.desc);
      if (e.duties) body.push(e.duties);
      if (e.results) body.push(e.results);
      if (!body.length) body = (e.bullets || []).filter(Boolean).map(function (b) { return '· ' + b; });
      return line + (body.length ? '\n' + body.join('\n') : '');
    }).join('\n\n');
  }

  /* 按简历版本的顺序排列经历：匹配到「后端」版本时，后端项目会排到最前面 */
  function orderOf(resume, e) {
    var order = (resume && resume.order) || [];
    var i = order.indexOf(e && e.id);
    return i < 0 ? 999 : i;
  }

  function sortByResume(list, resume) {
    var src = (list || []).slice();
    if (!resume || !(resume.order || []).length) return src;
    return src.sort(function (a, b) { return orderOf(resume, a) - orderOf(resume, b); });
  }

  /* 取第一条项目经历：用于「项目名称 / 职责 / 成果」这类单值字段 */
  function firstProject(profile, resume) {
    var exps = (profile && profile.experiences) || [];
    var list = sortByResume(exps.filter(function (e) { return e.type === 'project'; }), resume);
    return list[0] || null;
  }

  /* ---------------- 地址 → 省市 ----------------
     「所在地点」这类下拉的选项是省/市，档案里存的是详细地址，
     所以这里只取「省 + 市」两段：广东省湛江市麻章区海大路 1 号 → 广东省湛江市 */
  var MUNI = /^(北京|上海|天津|重庆)市?/;
  var PROV = /^(.{2,7}?(?:省|自治区|特别行政区))/;
  var CITY = /^(.{2,10}?(?:市|自治州|地区|盟))/;
  var DIST = /^(.{2,10}?(?:区|县|市|旗|新区))/;

  function placeText(b) {
    if (!b) return '';
    var list = [b.address, b.hukouPlace, b.hometown, b.sourceArea];
    for (var i = 0; i < list.length; i++) {
      var s = String(list[i] || '').replace(/[\s·•,，]/g, '');
      if (!s) continue;
      var seg = [];
      var m = MUNI.exec(s);
      if (m) {
        seg.push(m[1] + '市');
        s = s.slice(m[0].length);
        m = DIST.exec(s);
        if (m) seg.push(m[1]);
      } else {
        m = PROV.exec(s);
        if (m) { seg.push(m[1]); s = s.slice(m[1].length); }
        m = CITY.exec(s);
        if (m) { seg.push(m[1]); s = s.slice(m[1].length); }
        m = DIST.exec(s);
        if (m) seg.push(m[1]);
      }
      if (seg.length >= 2) return seg[0] === seg[1] ? seg[0] : seg[0] + seg[1];
      if (seg.length === 1 && /省|市|区|县/.test(seg[0])) return seg[0];
    }
    return '';
  }

  function clean2(t) {
    return String(t == null ? '' : t).replace(/[\s *＊:：、,，.。]+/g, ' ').trim();
  }

  function ageFrom(birth) {
    if (!birth) return '';
    var d = new Date(String(birth).replace(/-/g, '/'));
    if (isNaN(d.getTime())) return '';
    var now = new Date();
    var age = now.getFullYear() - d.getFullYear();
    var m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age > 0 && age < 100 ? String(age) : '';
  }

  /* ---------------- 归一化与关键词命中 ---------------- */
  function norm(s) {
    return String(s == null ? '' : s)
      .replace(/[\uFF01-\uFF5E]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[\u3000]/g, ' ')
      // camelCase / PascalCase 拆词：candidateName → candidate Name
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isCJK(s) { return /[\u4e00-\u9fa5]/.test(s); }

  function hit(n, kw) {
    if (!kw) return false;
    if (isCJK(kw)) return n.replace(/ /g, '').indexOf(kw.replace(/ /g, '')) >= 0;
    return (' ' + n + ' ').indexOf(' ' + kw + ' ') >= 0;
  }

  /* ---------------- 字段目录 ----------------
     type: text | textarea | select | radio | date | month | file
     path: 档案取值路径；derive / special：计算值
     manual: 识别但不代填（文件、紧急联系人等）
  ------------------------------------------- */
  var FIELDS = [
    /* ===== 基础信息 ===== */
    {
      id: 'name', label: '姓名', section: 'basic', type: 'text', path: 'basic.name',
      syn: ['姓名', '真实姓名', '中文姓名', '申请人姓名', '本人姓名', 'name', 'realname', 'fullname', 'applicantname', 'chinesename'],
      neg: ['用户名', '公司名', '企业名', '学校名', '文件', '英文', '拼音', '岗位', '职位', '紧急联系', '联系人姓名', '推荐人', 'username', 'company', 'filename']
    },
    {
      id: 'gender', label: '性别', section: 'basic', type: 'radio', path: 'basic.gender',
      syn: ['性别', 'gender', 'sex'],
      neg: ['性别要求', '性别比例']
    },
    {
      id: 'birth', label: '出生日期', section: 'basic', type: 'date', path: 'basic.birth',
      syn: ['出生日期', '出生年月日', '出生年月', '生日', '出生年份', 'birth', 'birthday', 'birthdate', 'dob'],
      neg: []
    },
    {
      id: 'age', label: '年龄', section: 'basic', type: 'text', derive: 'age',
      syn: ['年龄', 'age'], neg: ['年龄要求']
    },
    {
      id: 'political', label: '政治面貌', section: 'basic', type: 'select', path: 'basic.political',
      syn: ['政治面貌', '党派', '政治背景', 'political'], neg: []
    },
    {
      id: 'nation', label: '民族', section: 'basic', type: 'select', path: 'basic.nation',
      syn: ['民族', 'nation', 'ethnic', 'ethnicity'], neg: ['国籍', 'nationality']
    },
    {
      id: 'marital', label: '婚姻状况', section: 'basic', type: 'select', path: 'basic.marital',
      syn: ['婚姻状况', '婚姻状态', '婚否', '婚姻', 'marital', 'marriage'], neg: []
    },
    {
      id: 'hukouType', label: '户口性质', section: 'basic', type: 'select', path: 'basic.hukouType',
      syn: ['户口性质', '户口类型', '户籍性质', '户籍类型', 'hukoutype'], neg: ['所在地', '地址', '迁入']
    },
    {
      id: 'hometown', label: '籍贯', section: 'basic', type: 'text', path: 'basic.hometown',
      syn: ['籍贯', '生源地', '户籍所在地', '户籍', 'hometown', 'nativeplace', 'native'], neg: ['现居', '通讯']
    },
    {
      id: 'address', label: '现居住地', section: 'basic', type: 'text', path: 'basic.address',
      syn: ['现居住地', '现住址', '居住地址', '通讯地址', '联系地址', '详细地址', '邮寄地址', '家庭地址', '现家庭住址', '家庭住址', 'address', 'mailingaddress', 'residence'],
      neg: ['邮编', '邮箱', '邮政编码', 'email', '区号']
    },
    {
      /* 下拉形态的「所在地点 / 所在城市」：值只取省市，写入时按级联逐级选 */
      id: 'location', label: '所在地点', section: 'basic', type: 'select', derive: 'location',
      syn: ['所在地点', '所在城市', '当前所在地', '现居城市', '现居住城市', '居住城市', '常居地', '所在地', '所在地区', '目前所在城市'],
      neg: ['户籍', '籍贯', '出生', '期望', '意向', '面试', '工作地点', '邮编', '户口', '档案']
    },
    {
      id: 'idType', label: '证件类型', section: 'basic', type: 'select', path: 'basic.idType',
      syn: ['证件类型', '证件种类', '个人证件', '身份证件类型', '证件类别', '证件名称', 'idtype', 'idcardtype'],
      neg: ['证件号', '身份证号', '证件号码', '有效期', '签发']
    },
    {
      id: 'idNumber', label: '证件号码', section: 'basic', type: 'text', path: 'basic.idNumber',
      syn: ['证件号码', '身份证号码', '身份证号', '证件号', 'idnumber', 'idcardno', 'cardno'],
      neg: ['证件类型', '类型', '有效期', '签发机关']
    },
    {
      id: 'phone', label: '手机号码', section: 'basic', type: 'tel', path: 'basic.phone',
      syn: ['手机号码', '手机号', '手机', '联系电话', '联系方式', '电话号码', '移动电话', 'phone', 'mobile', 'mobilenumber', 'tel', 'telephone', 'cellphone', 'contactnumber'],
      neg: ['紧急', '家庭电话', '父亲', '母亲', '家长', '推荐人', '区号', '固话', '座机', '公司电话', '验证码', 'code', 'emergency']
    },
    {
      id: 'email', label: '电子邮箱', section: 'basic', type: 'email', path: 'basic.email',
      syn: ['电子邮箱', '邮箱地址', '邮箱', '电子邮件', '邮件地址', 'email', 'emailaddress', 'mail'],
      neg: ['验证码', '密码', 'password', 'code', '邮箱验证']
    },
    {
      id: 'wechat', label: '微信号', section: 'basic', type: 'text', path: 'basic.wechat',
      syn: ['微信号', '微信', 'wechat', 'weixin', 'wechatid'], neg: ['公众号']
    },

    /* ===== 求职意向 ===== */
    {
      id: 'targetRole', label: '应聘岗位', section: 'intent', type: 'text', path: 'basic.targetRole',
      syn: ['应聘职位', '应聘岗位', '申请职位', '申请岗位', '期望职位', '意向岗位', '期望岗位', '目标岗位', '求职意向', '职位名称', '岗位名称', 'position', 'jobtitle', 'appliedposition', 'applyposition'],
      neg: ['当前职位', '现有职位', '曾任']
    },
    {
      id: 'targetCity', label: '期望工作地', section: 'intent', type: 'text', path: 'basic.targetCity',
      syn: ['期望城市', '意向城市', '期望工作地点', '期望工作地', '期望工作城市', '工作地点', '意向地区', '期望地点', 'city', 'location', 'worklocation', 'preferredcity'],
      neg: ['户籍', '籍贯', '出生地', '现居', '面试地点']
    },
    {
      id: 'salary', label: '期望薪资', section: 'intent', type: 'text', derive: 'salary',
      syn: ['期望薪资', '期望月薪', '薪资要求', '期望年薪', '薪酬期望', '薪资', 'salary', 'expectedsalary'], neg: []
    },
    {
      id: 'jobType', label: '求职类型', section: 'intent', type: 'text', derive: 'jobType',
      syn: ['求职类型', '工作性质', '职位类型', 'jobtype', 'employmenttype'], neg: []
    },
    {
      id: 'available', label: '到岗时间', section: 'intent', type: 'text', derive: 'available',
      syn: ['到岗时间', '可到岗时间', '入职时间', '最快到岗', 'available', 'availability', 'onboard'],
      neg: ['实习时间', '实习周期']
    },
    {
      id: 'channel', label: '获知渠道', section: 'intent', type: 'text', derive: 'channel',
      syn: ['招聘渠道', '获知渠道', '信息来源', '从何处得知', '了解渠道', '渠道', 'channel', 'source'], neg: []
    },
    {
      id: 'acceptAdjust', label: '是否服从调剂', section: 'intent', type: 'select', path: 'intent.acceptAdjust',
      syn: ['是否服从调剂', '服从调剂', '是否接受调剂', '接受调剂', '是否服从调配', '服从调配', '是否接受调配', '调剂意愿'],
      neg: []
    },

    /* ===== 教育背景 ===== */
    {
      id: 'school', label: '毕业院校', section: 'edu', type: 'text', path: 'educations.0.school',
      syn: ['毕业院校', '学校名称', '毕业学校', '院校名称', '就读院校', '所在学校', '学校', 'school', 'university', 'schoolname'],
      neg: ['高中', '中学', '初中', '小学', '学院', '院系', '专业']
    },
    {
      id: 'college', label: '所在学院', section: 'edu', type: 'text', path: 'educations.0.college',
      syn: ['所在学院', '院系', '学院', '系别', 'faculty', 'department'], neg: ['学校', '大学', '院校']
    },
    {
      id: 'major', label: '所学专业', section: 'edu', type: 'text', path: 'educations.0.major',
      syn: ['所学专业', '专业名称', '主修专业', '专业', 'major', 'specialty', 'fieldofstudy'],
      neg: ['辅修', '第二专业', '双学位', '专业排名', '专业技能', '专业课程']
    },
    {
      id: 'degree', label: '学历学位', section: 'edu', type: 'select', path: 'educations.0.degree',
      syn: ['最高学历', '学历学位', '学历', '学位', '培养层次', 'degree', 'educationlevel', 'edulevel'],
      neg: ['学位证', '学历证']
    },
    {
      id: 'eduStart', label: '入学时间', section: 'edu', type: 'month', path: 'educations.0.start',
      syn: ['入学时间', '入学年月', '入学日期', '就读起始', '入校时间', '入校日期', '开学时间', '开始年月', '开始月份', 'enrollmentdate', 'startdate'], neg: []
    },
    {
      id: 'eduEnd', label: '毕业时间', section: 'edu', type: 'month', path: 'educations.0.end',
      syn: ['毕业时间', '毕业年月', '预计毕业时间', '毕业日期', '获得学位证时间', '学位证时间', '获得学位证', 'graduationdate', 'graduation', 'enddate'], neg: []
    },
    {
      id: 'gpa', label: 'GPA / 绩点', section: 'edu', type: 'text', path: 'educations.0.gpa',
      syn: ['gpa', '绩点', '平均绩点', '平均分', '成绩绩点', 'gradepoint'], neg: ['排名', '单科']
    },
    {
      id: 'rank', label: '专业排名', section: 'edu', type: 'text', derive: 'rank',
      syn: ['专业排名', '年级排名', '班级排名', '成绩排名', '排名', 'rank', 'ranking'], neg: []
    },
    {
      id: 'courses', label: '主修课程', section: 'edu', type: 'text', path: 'educations.0.courses',
      syn: ['主修课程', '核心课程', '专业课程', '课程', 'courses'], neg: ['课程成绩']
    },
    {
      id: 'eduType', label: '培养方式', section: 'edu', type: 'text', derive: 'eduType',
      syn: ['培养方式', '学习形式', '招生类型', '学历类型', '学习类型'], neg: []
    },
    {
      id: 'eduTransfer', label: '是否专升本', section: 'edu', type: 'text', path: 'educations.0.transferType',
      syn: ['专转本', '专升本', '自考', '是否专转本'], neg: ['自考本科说明']
    },

    /* ===== 经历与能力 ===== */
    {
      id: 'intern', label: '实习 / 工作经历', section: 'exp', type: 'textarea', special: 'intern',
      syn: ['实习经历', '实习经验', '工作经历', '工作经验', '实习情况', '实习描述', 'internship', 'workexperience'],
      neg: ['项目', '校园', '求职意向']
    },
    {
      id: 'project', label: '项目经历', section: 'exp', type: 'textarea', special: 'project',
      syn: ['项目经历', '项目经验', 'projectexperience', 'project'], neg: ['项目名称', '项目管理', '项目描述', '项目职责', '项目成果']
    },
    {
      id: 'projectName', label: '项目名称', section: 'exp', type: 'text', special: 'projectName',
      syn: ['项目名称', '项目名', '项目title', 'projectname'], neg: ['项目名称关键词']
    },
    {
      id: 'projectRole', label: '项目职务', section: 'exp', type: 'text', special: 'projectRole',
      syn: ['项目职务', '项目角色', '担任角色', '项目中的角色', 'projectrole'], neg: []
    },
    {
      id: 'projectTeam', label: '团队规模', section: 'exp', type: 'text', special: 'projectTeam',
      syn: ['团队规模', '团队人数', '项目人数', '项目规模', 'teamsize'], neg: []
    },
    {
      id: 'projectPractice', label: '实践方式', section: 'exp', type: 'text', special: 'projectPractice',
      syn: ['实践方式', '项目类型', '项目性质', '项目类别'], neg: []
    },
    {
      id: 'projectStart', label: '项目开始时间', section: 'exp', type: 'month', special: 'projectStart',
      syn: ['项目开始时间', '项目起始时间', '项目开始年月'], neg: []
    },
    {
      id: 'projectEnd', label: '项目结束时间', section: 'exp', type: 'month', special: 'projectEnd',
      syn: ['项目结束时间', '项目截止时间', '项目完成时间'], neg: []
    },
    {
      id: 'projectLink', label: '项目链接', section: 'exp', type: 'text', special: 'projectLink',
      syn: ['项目链接', '项目地址', '项目网址', 'projectlink', 'projecturl'], neg: ['项目所在地']
    },
    {
      id: 'projectDesc', label: '项目描述', section: 'exp', type: 'textarea', special: 'projectDesc',
      syn: ['项目描述', '项目介绍', '项目背景', '项目简介', 'projectdescription'], neg: []
    },
    {
      id: 'projectDuties', label: '项目职责', section: 'exp', type: 'textarea', special: 'projectDuties',
      syn: ['项目职责', '项目职责与贡献', '负责内容', '项目工作内容', 'projectduties'], neg: []
    },
    {
      id: 'projectResults', label: '项目成果', section: 'exp', type: 'textarea', special: 'projectResults',
      syn: ['项目成果', '项目结果', '项目业绩', '交付成果', 'projectresult'], neg: []
    },
    {
      id: 'refName', label: '证明人姓名', section: 'exp', type: 'text', special: 'refName',
      syn: ['证明人姓名', '证明人', '推荐人姓名', 'referee'], neg: ['紧急联系']
    },
    {
      id: 'refContact', label: '证明人联系方式', section: 'exp', type: 'text', special: 'refContact',
      syn: ['证明人联系方式', '证明人电话', '推荐人联系方式'], neg: ['紧急联系']
    },
    {
      id: 'campus', label: '校园经历', section: 'exp', type: 'textarea', special: 'campus',
      syn: ['校园经历', '校园活动', '社团经历', '学生工作', '社会实践', '社会活动', 'campus', 'activities', 'studentwork'],
      neg: []
    },
    {
      id: 'award', label: '获奖情况', section: 'exp', type: 'textarea', special: 'award',
      syn: ['获奖情况', '获奖经历', '荣誉奖项', '所获奖励', '奖项', '荣誉', 'award', 'honors'], neg: []
    },
    {
      id: 'skills', label: '专业技能', section: 'exp', type: 'textarea', special: 'skills',
      syn: ['专业技能', '技能特长', '技能', '专长', 'skills', 'skill', 'technicalskills'], neg: []
    },
    {
      id: 'cert', label: '证书', section: 'exp', type: 'textarea', special: 'cert',
      syn: ['资格证书', '证书', '职业资格', 'certificate', 'certification'], neg: []
    },
    {
      id: 'scholarship', label: '奖学金类型', section: 'exp', type: 'text', derive: 'scholarship',
      syn: ['奖学金类型', '奖学金等级', '奖学金', 'scholarship'], neg: ['证书', '竞赛名称']
    },
    {
      id: 'langCert', label: '语言证书', section: 'exp', type: 'text', path: 'foreigns.0.cert',
      syn: ['相关证书', '语言证书', '证书名称', '外语证书'], neg: ['证书扫描', '上传']
    },
    {
      id: 'paper', label: '发表论文', section: 'exp', type: 'textarea', special: 'paper',
      syn: ['发表论文情况', '发表论文', '论文情况', '论文', 'publication', 'paper'], neg: ['查重', '论文答辩']
    },
    {
      id: 'lang', label: '语言能力', section: 'exp', type: 'text', special: 'lang',
      syn: ['外语水平', '英语水平', '语言能力', '外语能力', '英语等级', 'language', 'englishlevel'], neg: []
    },
    {
      id: 'selfEval', label: '自我评价', section: 'exp', type: 'textarea', path: 'basic.selfEval',
      syn: ['自我评价', '自我介绍', '个人评价', '个人简介', '个人优势', '自我描述', '自荐理由', 'selfevaluation', 'selfintroduction', 'aboutme', 'summary'],
      neg: ['评价他人', '他人评价']
    },

    /* ===== 需人工处理（识别但不代填）===== */
    {
      id: 'workFile', label: '作品集附件', section: 'other', type: 'file', manual: true,
      reason: '「我的档案-附件材料」里没有存作品集（rar/zip），存一份即可自动上传',
      syn: ['作品上传', '上传作品', '作品集', '作品文件', '作品附件'], neg: ['链接', '网址', 'url', 'portfolio'],
      neg: ['简历', '证件照', '成绩单', '链接']
    },
    {
      id: 'photoFile', label: '证件照', section: 'other', type: 'file', manual: true,
      reason: '「我的档案-附件材料」里没有存证件照，存一张（png/jpg，小于 2M）即可自动上传',
      syn: ['证件照', '一寸照片', '一寸证件照', '个人照片', '个人证件照', '免冠照片', '头像照片', '上传照片', 'photo', 'avatar'],
      neg: ['简历', '成绩单', '作品', '证书扫描']
    },
    {
      id: 'resumeFile', label: '简历附件', section: 'other', type: 'file', manual: true,
      reason: '「我的档案-附件材料」里没有存简历文件，存一份即可自动上传',
      syn: ['简历附件', '上传简历', '简历文件', '附件', 'resume', 'attachment', 'upload'], neg: []
    },
    {
      id: 'transcriptFile', label: '成绩单', section: 'other', type: 'file', manual: true,
      reason: '「我的档案-附件材料」里没有存成绩单文件，存一份即可自动上传',
      syn: ['成绩单', '成绩证明', 'transcript'], neg: []
    },
    {
      id: 'emergencyName', label: '紧急联系人', section: 'other', type: 'text', manual: true,
      reason: '属于他人隐私信息，不建议由工具代填',
      syn: ['紧急联系人', '紧急联络人', 'emergencycontact'], neg: []
    },
    {
      id: 'emergencyPhone', label: '紧急联系人电话', section: 'other', type: 'tel', manual: true,
      reason: '属于他人隐私信息，不建议由工具代填',
      syn: ['紧急联系电话', '紧急联系人电话', '紧急联络电话', 'emergencyphone'], neg: []
    }
  ];

  var BY_ID = {};
  FIELDS.forEach(function (f) { BY_ID[f.id] = f; });

  /* ---------------- 取值 ----------------
     resume 可选：匹配到的简历版本。它只影响「顺序」和「概述」——
     经历排序按版本走，自我评价优先用版本的定制概述；数据本身仍来自同一份档案。
  ------------------------------------------- */
  function resolve(state, field, resume) {
    if (!field) return { ok: false };
    if (field.manual) return { ok: false, manual: true, reason: field.reason || '需手动填写' };
    var profile = (state && state.profile) || {};
    var text = '';

    if (field.derive) {
      if (field.derive === 'age') text = ageFrom(profile.basic && profile.basic.birth);
      if (field.derive === 'salary') text = '面议（可谈）';
      if (field.derive === 'jobType') text = '全职';
      if (field.derive === 'available') {
        var end = get(profile, 'educations.0.end') || '';
        text = end ? String(end).slice(0, 7) + '（毕业后）' : '随时到岗';
      }
      if (field.derive === 'channel') text = '校园招聘官网';
      if (field.derive === 'eduType') text = '全日制';
      if (field.derive === 'location') text = placeText(profile.basic || {});
      if (field.derive === 'rank') {
        var e0 = (profile.educations || [])[0] || {};
        var rk = parseInt(e0.rank, 10), tt = parseInt(e0.rankTotal, 10);
        if (rk > 0 && tt > 0 && rk <= tt) text = '前 ' + Math.ceil(rk / tt * 100) + '%';
        else text = e0.rank || '';
      }
      if (field.derive === 'scholarship') {
        /* 优先给完整奖项名（荣誉奖项里填什么就选什么，如「校级三等奖学金」正好对上
           下拉选项）；找不到再退回等级词（国家级>省级>校级>院级） */
        var schNames = (profile.awards || []).map(function (a) { return a && a.name; })
          .concat(((profile.skills && profile.skills.certs) || []))
          .filter(function (t) { return t && /奖学金|奖/.test(t); });
        if (schNames.length) {
          var t0 = clean2(schNames[0]).replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '')
            .replace(/\d{4}[\-–—~至.、\s]*(\d{0,4})?/g, '').replace(/^(两次|连续|年度)/, '').trim();
          if (t0 && t0.length >= 2 && t0.length <= 20) text = t0;
        }
        if (!text) {
          var hon = ((profile.skills && profile.skills.certs) || []).join('；')
            + '；' + ((profile.awards) || []).map(function (a) { return a && (a.name || a.title); }).filter(Boolean).join('；');
          var levels = [['国家奖学金', '国家级'], ['国家级', '国家级'], ['省级', '省级'], ['校级', '校级'], ['院级', '院级']];
          for (var li = 0; li < levels.length; li++) {
            if (hon.indexOf(levels[li][0]) >= 0 && /奖|学金/.test(hon)) { text = levels[li][1]; break; }
          }
        }
      }
    } else if (field.special) {
      var exps = profile.experiences || [];
      var pick = function (t) { return exps.filter(function (e) { return e.type === t; }); };
      if (field.special === 'intern') text = expText(pick('intern'), resume);
      if (field.special === 'project') text = expText(pick('project'), resume);
      if (field.special === 'campus') text = expText(pick('campus'), resume);

      /* 项目明细字段：取第一条项目经历（按版本顺序） */
      var pj = firstProject(profile, resume);
      var pjMap = {
        projectName: 'org', projectRole: 'role', projectTeam: 'teamSize',
        projectPractice: 'practice', projectStart: 'start', projectEnd: 'end',
        projectLink: 'link', projectDesc: 'desc', projectDuties: 'duties',
        projectResults: 'results', refName: 'refName', refContact: 'refContact'
      };
      if (pjMap[field.special]) text = pj ? (pj[pjMap[field.special]] || '') : '';
      if (field.special === 'award') {
        /* 荣誉奖项 UI 落在 profile.awards（name/level/rank/date/desc），
           旧数据里荣誉在 skills.certs —— 两处都认 */
        var awLines = (profile.awards || []).map(function (a) {
          if (!a) return '';
          var line = a.name || '';
          if (a.rank && line.indexOf(a.rank) < 0) line += (line ? '·' : '') + a.rank;
          if (a.date && line.indexOf(a.date) < 0) line += '（' + a.date + '）';
          if (a.desc && line.indexOf(a.desc) < 0) line += '：' + a.desc;
          return line;
        }).filter(Boolean);
        text = awLines.join('；');
        if (!text) {
          var certs2 = (profile.skills && profile.skills.certs) || [];
          text = certs2.filter(function (c) { return /奖|荣誉|获奖/.test(c); }).join('；');
          if (!text) text = certs2.join('；');
        }
      }
      if (field.special === 'cert') {
        var cs = (profile.skills && profile.skills.certs) || [];
        text = cs.filter(function (c) { return !/奖|荣誉/.test(c); }).join('；');
        if (!text) text = cs.join('；');
      }
      if (field.special === 'skills') {
        text = ((profile.skills && profile.skills.tech) || []).join('、');
      }
      if (field.special === 'lang') {
        text = ((profile.skills && profile.skills.langs) || []).join('；');
      }
      if (field.special === 'paper') {
        var papers = profile.papers || [];
        text = papers.map(function (pp) {
          if (!pp) return '';
          var line = [pp.title || pp.name, pp.journal || pp.source, pp.authors, pp.date].filter(Boolean).join('，');
          if (pp.desc) line = line ? (line.indexOf(pp.desc) < 0 ? line + '：' + pp.desc : line) : pp.desc;
          return line;
        }).filter(Boolean).join('；');
      }
    } else {
      text = toText(get(profile, field.path));
    }

    /* 简历版本自带的定制概述优先：同一份档案，不同岗位版本可以有不同的自我评价 */
    if (field.id === 'selfEval' && resume && !blank(resume.summary)) text = resume.summary;

    if (blank(text)) return { ok: false, empty: true };
    return { ok: true, text: text, from: field.type === 'textarea' ? '经历库' : '我的档案' };
  }

  /* ---------------- 语义匹配 ---------------- */
  function scoreField(field, signature) {
    var n = norm(signature);
    if (!n) return 0;
    var i;
    for (i = 0; i < (field.neg || []).length; i++) {
      if (hit(n, field.neg[i])) return 0;
    }
    var best = 0, hits = 0;
    for (i = 0; i < field.syn.length; i++) {
      var kw = field.syn[i];
      if (hit(n, kw)) {
        var w = kw.length * (isCJK(kw) ? 1.6 : 1);
        if (w > best) best = w;
        hits++;
      }
    }
    return hits ? best + hits * 0.1 : 0;
  }

  function match(signature) {
    var bestField = null, bestScore = 0;
    FIELDS.forEach(function (f) {
      var s = scoreField(f, signature);
      if (s > bestScore) { bestScore = s; bestField = f; }
    });
    return bestScore >= 2 ? { field: bestField, score: bestScore } : null;
  }

  global.OPSchema = {
    VERSION: VERSION,
    FIELDS: FIELDS,
    BY_ID: BY_ID,
    SECTIONS: [
      { key: 'basic', name: '基础信息' },
      { key: 'intent', name: '求职意向' },
      { key: 'edu', name: '教育背景' },
      { key: 'exp', name: '经历与能力' },
      { key: 'other', name: '需人工处理' }
    ],
    norm: norm,
    hit: hit,
    get: get,
    toText: toText,
    resolve: resolve,
    scoreField: scoreField,
    match: match
  };
})(typeof window !== 'undefined' ? window : self);
