/* =========================================================
   枚举选项词典（下拉填写共用）
   ---------------------------------------------------------
   网申里的「性别 / 最高学历 / 政治面貌 / 证件类型 / 所在地点」
   都是下拉。同一个含义在每个站点的写法都不一样：

     学历：本科 / 大学本科 / 本科（学士） / 3. 本科 / 本科生
     性别：男 / 男性 / 男生 / Male / M
     证件：居民身份证 / 身份证 / 中国·居民身份证

   原来只用「精确 → 前缀 → 包含」三级文本匹配，遇到括号补充、
   序号前缀、同义写法就选不中；遇到「本科以下」还会误选。

   本模块只做纯函数：给「档案值 + 页面上的选项文本」，
   返回得分最高的那一个，以及为什么选它。原生 <select> 与
   antd / arco / element 的自定义下拉共用同一套评分。
   ========================================================= */
(function (global) {
  'use strict';

  /* ---------------- 归一化 ---------------- */
  function norm(s) {
    return String(s == null ? '' : s)
      .replace(/[\uFF01-\uFF5E]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[\u3000]/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* 去掉「补充说明 / 序号 / 占位词」后再归一化。
     本科（学士） → 本科     3. 本科 → 本科
     （可接受）   → 空       ① 男   → 男      */
  function base(text) {
    var s = String(text == null ? '' : text);
    s = s.replace(/[（(][^)）]{0,24}[)）]/g, ' ');
    s = s.replace(/^[\s\-*·]*(?:\d{1,2}\s*[.、)）]|[①-⑳]|[一二三四五六七八九十]\s*[、.])\s*/, '');
    s = s.replace(/(?:请选择|请填写|please\s*select|select\s*one|select)/gi, ' ');
    return norm(s);
  }

  function compact(text) { return base(text).replace(/\s+/g, ''); }

  /* ---------------- 同义写法 ----------------
     每组第一个是「档案里的标准值」，后面是各站点的等价写法。
     匹配时整组互通，所以档案写「本科」，页面写「大学本科」也能中。 */
  var ALIAS = {
    gender: {
      '男': ['男', '男性', '男生', '男士', 'male', 'm', 'man'],
      '女': ['女', '女性', '女生', '女士', 'female', 'f', 'woman']
    },
    education: {
      '博士': ['博士', '博士研究生', '博士学历', 'phd', 'doctor', 'doctoral'],
      '硕士': ['硕士', '硕士研究生', '研究生', '硕士学历', 'master', 'msc', 'masterdegree'],
      '本科': ['本科', '大学本科', '本科生', '学士', '本科学历', 'bachelor', 'undergraduate', 'bsc'],
      '大专': ['大专', '专科', '高职', '大学专科', '专科生', 'associate', 'college'],
      '高中及以下': ['高中', '中专', '职高', '技校', '高中及以下', '高中及以下学历']
    },
    degree: {
      '博士学位': ['博士学位', '博士', '博士研究生'],
      '硕士学位': ['硕士学位', '硕士', '硕士研究生'],
      '学士学位': ['学士学位', '学士', '本科'],
      '无': ['无', '无学位', '没有']
    },
    political: {
      '中共党员': ['中共党员', '党员', '中国共产党党员', '中共正式党员'],
      '中共预备党员': ['中共预备党员', '预备党员', '中国共产党预备党员'],
      '共青团员': ['共青团员', '团员', '中国共产主义青年团团员', '共青团'],
      '群众': ['群众', '普通群众', '无党派', '无党派人士', '普通公民']
    },
    nation: {
      '汉族': ['汉族', '汉'],
      '回族': ['回族', '回'],
      '满族': ['满族', '满'],
      '壮族': ['壮族', '壮']
    },
    idType: {
      '居民身份证': ['居民身份证', '身份证', '中国居民身份证', '中华人民共和国居民身份证', '二代身份证', '大陆居民身份证', '身份证件'],
      '护照': ['护照', '因私护照', '普通护照', 'passport'],
      '港澳通行证': ['港澳通行证', '往来港澳通行证', '港澳居民来往内地通行证'],
      '台胞证': ['台胞证', '台湾居民来往大陆通行证']
    },
    marital: {
      '未婚': ['未婚', '单身', 'single', '未结婚'],
      '已婚': ['已婚', 'married'],
      '离异': ['离异', '离婚', 'divorced']
    },
    hukouType: {
      '城镇': ['城镇', '城镇户口', '非农业', '非农业户口', '城市户口', '居民户口'],
      '农村': ['农村', '农村户口', '农业', '农业户口']
    },
    studyForm: {
      '全日制': ['全日制', '普通全日制', '全日制普通高校', 'fulltime', 'full time'],
      '非全日制': ['非全日制', '在职', 'parttime', 'part time']
    },
    workStatus: {
      '在校生': ['在校生', '在读', '在校学生', '学生'],
      '应届毕业生': ['应届毕业生', '应届生', '应届', 'freshgraduate'],
      '在职': ['在职', '已就业'],
      '离职': ['离职', '待业', '未在职']
    },
    workYears: {
      '无': ['无', '无经验', '应届', '0年', '没有'],
      '1 年以内': ['1年以内', '一年以内', '不足1年', '1年以下'],
      '1-3 年': ['1-3年', '1至3年', '一到三年'],
      '3-5 年': ['3-5年', '3至5年', '三到五年'],
      '5 年以上': ['5年以上', '五年以上']
    },
    yesno: {
      '是': ['是', '同意', '接受', '愿意', '可以', '服从', '符合', 'yes', 'y', 'true'],
      '否': ['否', '不同意', '不接受', '不愿意', '不可以', '不服从', '不符合', 'no', 'n', 'false']
    },
    health: {
      '良好': ['良好', '健康', '正常', '优秀'],
      '一般': ['一般', '较差']
    }
  };

  /* 字段 id → 词表 key（fieldschema 的 id 与这里不完全一致） */
  var GROUP = {
    gender: 'gender', degree: 'education', education: 'education', eduLevel: 'education',
    degreeType: 'degree', political: 'political', nation: 'nation', idType: 'idType',
    marital: 'marital', hukouType: 'hukouType', studyForm: 'studyForm', eduType: 'studyForm',
    workStatus: 'workStatus', workYears: 'workYears', freshGrad: 'yesno',
    acceptAdjust: 'yesno', relativeInCompany: 'yesno', chronicDisease: 'yesno',
    criminalRecord: 'yesno', military: 'yesno', veteran: 'yesno', baoyan: 'yesno',
    overseasStudy: 'yesno', poorStudent: 'yesno', colorWeak: 'yesno',
    foreignIdentity: 'yesno', overseas: 'yesno', health: 'health'
  };

  function groupOf(fieldId) { return GROUP[fieldId] || ''; }

  /* 档案值 → 一组候选写法（第一个权重最高：原值） */
  function candidates(fieldId, value) {
    var v = String(value == null ? '' : value).trim();
    if (!v) return [];
    var out = [{ text: v, w: 1 }];
    var group = ALIAS[groupOf(fieldId)];
    if (!group) return out;

    var key = null;
    Object.keys(group).forEach(function (k) {
      if (key) return;
      if (compact(k) === compact(v)) { key = k; return; }
      if (group[k].some(function (a) { return compact(a) === compact(v); })) key = k;
    });
    if (!key) return out;
    group[key].forEach(function (a) {
      if (compact(a) === compact(v)) return;
      out.push({ text: a, w: 0.97 });
    });
    return out;
  }

  /* ---------------- 单个选项打分 ---------------- */
  var PLACEHOLDER = /^(请选择|请填写|select|pleasechoose|choose|-+|—+|无|不限|notselected)$/;
  var REQUIRE_UP = /(及以上|以上|或以上|至少)/;
  var REQUIRE_DOWN = /(及以下|以下|或以下|不含|以内|之外|以外)/;
  var NEVER = /(不限|均可|无要求|不限制)/;

  function scoreOption(optText, cands) {
    var o = compact(optText);
    if (!o) return 0;
    if (PLACEHOLDER.test(o)) return 0;
    if (NEVER.test(o)) return 0;
    if ((o === '其他' || o === '其它') && !cands.some(function (c) { return compact(c.text) === o; })) return 0;

    var best = 0;
    for (var i = 0; i < cands.length; i++) {
      var w = compact(cands[i].text);
      if (!w) continue;
      var s = 0;

      if (o === w) s = 100;
      /* 单字值（男 / 女 / 汉）只认同字，不能靠包含——否则「男女不限」会被选中 */
      else if (w.length === 1) s = 0;
      /* 否定项不做反向匹配：「不同意」不等于「同意」 */
      else if (/^[不非未无]/.test(o) && !/^[不非未无]/.test(w)) s = 0;
      else if (o.indexOf(w) === 0) s = 92;
      else if (w.indexOf(o) === 0) s = 88;
      else if (o.indexOf(w) > 0) s = 74;
      else if (w.indexOf(o) > 0) s = 68;

      if (!s) continue;
      s *= cands[i].w;
      /* 「本科及以上」可以接受，「本科以下」不接受 */
      if (REQUIRE_DOWN.test(o)) s *= 0.45;
      else if (REQUIRE_UP.test(o)) s *= 0.75;
      if (s > best) best = s;
    }
    return Math.round(best);
  }

  var MIN_SCORE = 56;

  /* options: ['男','女'] 或 [{text,value}]；返回 {index,text,score} */
  function best(options, fieldId, value) {
    var cands = candidates(fieldId, value);
    if (!cands.length || !options || !options.length) return null;
    var top = 0, idx = -1, text = '';
    for (var i = 0; i < options.length; i++) {
      var o = options[i];
      var t = typeof o === 'string' ? o : (o && o.text != null ? o.text : (o && o.value) || '');
      var s = scoreOption(t, cands);
      if (s > top) { top = s; idx = i; text = String(t); }
    }
    if (idx < 0 || top < MIN_SCORE) return null;
    return { index: idx, text: text, score: top };
  }

  /* ---------------- 地址拆级 ---------------- */
  var MUNI = /^(北京|上海|天津|重庆)市?/;
  var PROV = /^(.{2,7}?(?:省|自治区|特别行政区))/;
  var CITY = /^(.{2,10}?(?:市|自治州|地区|盟))/;
  var DIST = /^(.{2,10}?(?:区|县|市|旗|新区))/;

  function splitAddress(text) {
    var s = String(text == null ? '' : text).replace(/[\s·•,，]/g, '');
    var out = [];
    var m = MUNI.exec(s);
    if (m) {
      var city = m[1] + '市';
      out.push(city);
      s = s.slice(m[0].length);
      m = DIST.exec(s);
      if (m) out.push(m[1]);
      return out;
    }
    m = PROV.exec(s);
    if (m) { out.push(m[1]); s = s.slice(m[1].length); }
    m = CITY.exec(s);
    if (m) { out.push(m[1]); s = s.slice(m[1].length); }
    m = DIST.exec(s);
    if (m) out.push(m[1]);
    return out;
  }

  /* 档案里最像「当前所在地」的一串：先详细地址，再户口所在地、籍贯 */
  function placeFrom(profile) {
    var b = (profile && profile.basic) || {};
    var list = [b.address, b.hukouPlace, b.hometown, b.sourceArea];
    for (var i = 0; i < list.length; i++) {
      var seg = splitAddress(list[i]);
      if (!seg.length) continue;
      if (seg.length >= 2) return seg[0] === seg[1] ? seg[0] : seg[0] + seg[1];
      if (/省|市|区|县/.test(seg[0])) return seg[0];
    }
    return '';
  }

  /* 把一个地址串拆成「逐级要选的值」；「深圳 / 广州」这种多选就不拆 */
  function steps(text) {
    var s = String(text == null ? '' : text).trim();
    if (!s) return [];
    if (/[\/|、]/.test(s)) return [s];
    var seg = splitAddress(s);
    return seg.length > 1 ? seg : [s];
  }

  global.OptionMap = {
    norm: norm,
    base: base,
    compact: compact,
    ALIAS: ALIAS,
    candidates: candidates,
    scoreOption: scoreOption,
    MIN_SCORE: MIN_SCORE,
    best: best,
    splitAddress: splitAddress,
    placeFrom: placeFrom,
    steps: steps
  };
})(typeof window !== 'undefined' ? window : self);
