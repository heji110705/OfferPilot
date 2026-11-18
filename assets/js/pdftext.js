/* =========================================================
   PDF 文本提取（零依赖）
   - 直接解析 PDF 对象（含 1.5+ 的对象流 / 交叉引用损坏的文件）
   - 支持 FlateDecode / ASCIIHex / ASCII85，ToUnicode CMap（中文 CID 字体）
   - 按文本矩阵还原行结构，保留「姓名　电话　邮箱」这类同行多段信息
   ========================================================= */
(function (global) {
  'use strict';

  /* ---------------- 字节工具 ---------------- */
  function isWS(c) { return c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32; }
  function isDelim(c) {
    return c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 ||
      c === 123 || c === 125 || c === 47 || c === 37;
  }

  function strToBytes(s) {
    var u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff;
    return u;
  }

  function bytesToStr(b) {
    var out = '', CH = 8192;
    for (var i = 0; i < b.length; i += CH) {
      out += String.fromCharCode.apply(null, b.subarray(i, Math.min(i + CH, b.length)));
    }
    return out;
  }

  /* ---------------- 解压 ---------------- */
  function inflate(bytes) {
    var DS = global.DecompressionStream;
    if (typeof DS !== 'function' || typeof global.Response !== 'function') {
      return Promise.reject(new Error('当前环境不支持解压 PDF 数据流'));
    }
    function run(fmt) {
      return new Promise(function (resolve, reject) {
        try {
          var stream = new global.Blob([bytes]).stream().pipeThrough(new DS(fmt));
          new global.Response(stream).arrayBuffer().then(function (b) {
            resolve(new Uint8Array(b));
          }, reject);
        } catch (e) { reject(e); }
      });
    }
    return run('deflate').catch(function () { return run('deflate-raw'); });
  }

  function asciiHex(str) {
    var h = str.replace(/[^0-9a-fA-F]/g, '');
    var out = new Uint8Array(Math.floor(h.length / 2));
    for (var i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
  }

  function ascii85(str) {
    var s = str.replace(/^<~|~>$/g, '').replace(/\s+/g, '');
    var out = [], i = 0;
    while (i < s.length) {
      if (s[i] === 'z') { out.push(0, 0, 0, 0); i++; continue; }
      var chunk = s.substr(i, 5), pad = 5 - chunk.length;
      while (chunk.length < 5) chunk += 'u';
      var v = 0;
      for (var k = 0; k < 5; k++) v = v * 85 + (chunk.charCodeAt(k) - 33);
      var b = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
      out.push.apply(out, b.slice(0, 4 - pad));
      i += 5;
    }
    return new Uint8Array(out);
  }

  /* PNG 预测器（对象流/图像流偶见） */
  function unpredict(data, parms) {
    var pred = parms && parms.Predictor ? parms.Predictor : 1;
    if (pred < 10) return data;
    var colors = (parms.Colors || 1), bpc = (parms.BitsPerComponent || 8), cols = parms.Columns || 1;
    var bpp = Math.ceil(colors * bpc / 8), rowLen = Math.ceil(colors * bpc * cols / 8);
    var rows = Math.floor(data.length / (rowLen + 1));
    var out = new Uint8Array(rows * rowLen);
    var prev = new Uint8Array(rowLen);
    for (var r = 0; r < rows; r++) {
      var type = data[r * (rowLen + 1)];
      var row = data.subarray(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1));
      var cur = new Uint8Array(rowLen);
      for (var x = 0; x < rowLen; x++) {
        var raw = row[x] || 0, left = x >= bpp ? cur[x - bpp] : 0, up = prev[x], ul = x >= bpp ? prev[x - bpp] : 0, v;
        if (type === 0) v = raw;
        else if (type === 1) v = raw + left;
        else if (type === 2) v = raw + up;
        else if (type === 3) v = raw + ((left + up) >> 1);
        else {
          var p = left + up - ul, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul);
          v = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : ul);
        }
        cur[x] = v & 255;
      }
      out.set(cur, r * rowLen);
      prev = cur;
    }
    return out;
  }

  /* ---------------- 词法 / 语法 ---------------- */
  function Parser(s, p) { this.s = s; this.p = p || 0; }

  Parser.prototype.skip = function () {
    var s = this.s, n = s.length;
    while (this.p < n) {
      var c = s.charCodeAt(this.p);
      if (isWS(c)) { this.p++; continue; }
      if (c === 37) {
        while (this.p < n && s.charCodeAt(this.p) !== 10 && s.charCodeAt(this.p) !== 13) this.p++;
        continue;
      }
      break;
    }
  };

  Parser.prototype.name = function () {
    this.p++; // '/'
    var s = this.s, st = this.p, n = s.length;
    while (this.p < n) {
      var c = s.charCodeAt(this.p);
      if (isWS(c) || isDelim(c)) break;
      this.p++;
    }
    var raw = s.slice(st, this.p);
    // #XX 转义
    var out = raw.replace(/#([0-9a-fA-F]{2})/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); });
    return { k: 'n', v: out };
  };

  Parser.prototype.literal = function () {
    var s = this.s, n = s.length;
    this.p++; // '('
    var depth = 1, out = '';
    while (this.p < n) {
      var c = s.charCodeAt(this.p), ch = s[this.p];
      if (ch === '\\') {
        this.p++;
        var e = s[this.p];
        if (e === 'n') { out += '\n'; this.p++; }
        else if (e === 'r') { out += '\r'; this.p++; }
        else if (e === 't') { out += '\t'; this.p++; }
        else if (e === 'b') { out += '\b'; this.p++; }
        else if (e === 'f') { out += '\f'; this.p++; }
        else if (e === '\r') { this.p++; if (s[this.p] === '\n') this.p++; }
        else if (e === '\n') { this.p++; }
        else if (e >= '0' && e <= '7') {
          var oct = '';
          for (var k = 0; k < 3 && s[this.p] >= '0' && s[this.p] <= '7'; k++) { oct += s[this.p]; this.p++; }
          out += String.fromCharCode(parseInt(oct, 8) & 255);
        } else { out += e; this.p++; }
        continue;
      }
      if (ch === '(') { depth++; out += ch; this.p++; continue; }
      if (ch === ')') {
        depth--;
        this.p++;
        if (depth === 0) break;
        out += ch;
        continue;
      }
      out += ch;
      this.p++;
    }
    return { k: 's', v: out };
  };

  Parser.prototype.hex = function () {
    var s = this.s;
    this.p++; // '<'
    var end = s.indexOf('>', this.p);
    if (end < 0) end = s.length;
    var h = s.slice(this.p, end).replace(/[^0-9a-fA-F]/g, '');
    this.p = end + 1;
    if (h.length % 2) h += '0';
    var out = '';
    for (var i = 0; i < h.length; i += 2) out += String.fromCharCode(parseInt(h.substr(i, 2), 16));
    return { k: 's', v: out };
  };

  Parser.prototype.value = function () {
    this.skip();
    var s = this.s;
    if (this.p >= s.length) return null;
    var ch = s[this.p];

    if (ch === '/') return this.name();
    if (ch === '(') return this.literal();
    if (ch === '<') {
      if (s[this.p + 1] === '<') return this.dict();
      return this.hex();
    }
    if (ch === '[') {
      this.p++;
      var arr = [];
      for (;;) {
        this.skip();
        if (this.p >= s.length) break;
        if (s[this.p] === ']') { this.p++; break; }
        var v = this.value();
        if (v === undefined) { this.p++; continue; }
        arr.push(v);
      }
      return { k: 'a', v: arr };
    }
    if (ch === ']' || ch === '>' || ch === '}' || ch === ')') { this.p++; return undefined; }

    var rest = s.substr(this.p, 12);
    if (rest.indexOf('true') === 0) { this.p += 4; return { k: 'b', v: true }; }
    if (rest.indexOf('false') === 0) { this.p += 5; return { k: 'b', v: false }; }
    if (rest.indexOf('null') === 0) { this.p += 4; return { k: 'z' }; }

    var start = this.p;
    while (this.p < s.length && !isWS(s.charCodeAt(this.p)) && !isDelim(s.charCodeAt(this.p))) this.p++;
    var numStr = s.slice(start, this.p);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(numStr)) {
      var num = parseFloat(numStr);
      if (/^\d+$/.test(numStr)) {
        // 可能是间接引用：num gen R
        var save = this.p;
        var p2 = new Parser(s, this.p);
        p2.skip();
        var g = p2.value();
        if (g && g.k === 'num' && /^\d+$/.test(String(g.raw))) {
          p2.skip();
          if (s[p2.p] === 'R') {
            this.p = p2.p + 1;
            return { k: 'ref', v: num };
          }
        }
        this.p = save;
        return { k: 'num', v: num, raw: numStr };
      }
      return { k: 'num', v: num, raw: numStr };
    }
    // 未知关键字
    return { k: 'kw', v: numStr };
  };

  Parser.prototype.dict = function () {
    this.p += 2; // '<<'
    var map = {}, s = this.s;
    for (;;) {
      this.skip();
      if (this.p >= s.length) break;
      if (s[this.p] === '>' && s[this.p + 1] === '>') { this.p += 2; break; }
      if (s[this.p] !== '/') { // 容错：跳过非法 token
        var bad = this.value();
        if (bad === undefined) this.p++;
        continue;
      }
      var key = this.name().v;
      var val = this.value();
      if (val === undefined) continue;
      map[key] = val;
    }
    return { k: 'd', v: map };
  };

  /* ---------------- 文档 ---------------- */
  function Doc(bytes) {
    this.buf = bytes;
    this.str = bytesToStr(bytes);
    this.objs = {};
    this.order = [];
  }

  /* 是否加密：看 trailer 里的 /Encrypt（直接字典或间接引用） */
  Doc.prototype.encrypted = function () {
    var s = this.str;
    var i = s.lastIndexOf('/Encrypt');
    if (i < 0) return false;
    if (/^\/Encrypt\s*<</.test(s.slice(i, i + 32))) return true;
    var ref = /^\/Encrypt\s+(\d+)\s+\d+\s+R/.exec(s.slice(i, i + 40));
    if (!ref) return false;
    var rec = this.objs && this.objs[ref[1]];
    return !!(rec && rec.value && rec.value.k === 'd');
  };

  Doc.prototype.scan = function () {    var s = this.str;
    var re = /(\d{1,10})[\s\x00]+(\d{1,5})[\s\x00]+obj\b/g;
    var m, hits = [];
    while ((m = re.exec(s))) hits.push({ num: parseInt(m[1], 10), at: m.index + m[0].length });

    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      var p = new Parser(s, h.at);
      var val;
      try { val = p.value(); } catch (e) { continue; }
      if (!val) continue;
      var rec = { num: h.num, value: val, stream: null };
      try {
        p.skip();
        if (s.substr(p.p, 6) === 'stream') {
          if (val.k === 'd') rec.stream = this.readStream(p, val.v);
        }
      } catch (e) { /* 忽略 */ }
      // 同名对象取后者（增量更新）
      this.objs[h.num] = rec;
      this.order.push(h.num);
      if (val && typeof val === 'object') val.__num = h.num;
    }
  };

  Doc.prototype.readStream = function (p, dict) {
    var s = this.str, i = p.p + 6;
    if (s.charCodeAt(i) === 13) i++;
    if (s.charCodeAt(i) === 10) i++;
    var len = dict.Length && dict.Length.k === 'num' ? dict.Length.v : -1;
    var start = i, end = -1;
    if (len >= 0 && i + len <= s.length) {
      var tail = s.substr(i + len, 24).replace(/^[\s\x00]+/, '');
      if (tail.indexOf('endstream') === 0) end = i + len;
    }
    if (end < 0) {
      end = s.indexOf('endstream', i);
      if (end < 0) end = s.length;
      while (end > start && (s.charCodeAt(end - 1) === 10 || s.charCodeAt(end - 1) === 13)) end--;
    }
    p.p = end;
    return { start: start, end: end };
  };

  Doc.prototype.resolve = function (v) {
    if (!v) return null;
    if (v.k === 'ref') {
      var o = this.objs[v.v];
      return o ? o.value : null;
    }
    return v;
  };

  Doc.prototype.streamText = function (val) {
    var self = this;
    var num = val && val.__num;
    var rec = num != null ? this.objs[num] : null;
    if (!rec || !rec.stream) return Promise.resolve('');
    var raw = strToBytes(this.str.slice(rec.stream.start, rec.stream.end));
    return this.decode(raw, val.v).then(bytesToStr);
  };

  Doc.prototype.streamBytes = function (val) {
    var num = val && val.__num;
    var rec = num != null ? this.objs[num] : null;
    if (!rec || !rec.stream) return Promise.resolve(null);
    var raw = strToBytes(this.str.slice(rec.stream.start, rec.stream.end));
    return this.decode(raw, val.v);
  };

  Doc.prototype.decode = function (bytes, dict) {
    var f = dict && dict.Filter ? this.resolve(dict.Filter) : null;
    var parms = dict && dict.DecodeParms ? this.resolve(dict.DecodeParms) : null;
    var filters = [];
    if (f) filters = f.k === 'a' ? f.v.map(function (x) { return x; }) : [f];
    if (!filters.length) return Promise.resolve(bytes);
    var self = this;
    return filters.reduce(function (p, item, idx) {
      return p.then(function (data) {
        var name = self.resolve(item);
        var nm = name && name.v;
        var pm = parms && parms.k === 'a' ? self.resolve(parms.v[idx]) : parms;
        if (nm === 'FlateDecode' || nm === 'Fl') {
          return inflate(data).then(function (out) {
            return pm ? unpredict(out, pm.v) : out;
          }).catch(function () { return data; });
        }
        if (nm === 'ASCIIHexDecode' || nm === 'AHx') return asciiHex(bytesToStr(data));
        if (nm === 'ASCII85Decode' || nm === 'A85') return ascii85(bytesToStr(data));
        return data;
      });
    }, Promise.resolve(bytes));
  };

  /* 展开对象流（PDF 1.5+，Word/WPS 导出常见） */
  Doc.prototype.expandObjectStreams = function () {
    var self = this;
    var jobs = [];
    Object.keys(this.objs).forEach(function (k) {
      var rec = self.objs[k];
      if (!rec.stream || !rec.value || rec.value.k !== 'd') return;
      var t = rec.value.v.Type;
      if (!t || t.v !== 'ObjStm') return;
      jobs.push(self.streamText(rec.value).then(function (txt) {
        var n = rec.value.v.N ? rec.value.v.N.v : 0;
        var first = rec.value.v.First ? rec.value.v.First.v : 0;
        var head = txt.slice(0, first).trim().split(/[\s\x00]+/);
        for (var i = 0; i < n; i++) {
          var num = parseInt(head[i * 2], 10);
          var off = parseInt(head[i * 2 + 1], 10);
          if (!isFinite(num) || !isFinite(off)) continue;
          if (self.objs[num] && self.objs[num].stream) continue;
          try {
            var p = new Parser(txt, first + off);
            var v = p.value();
            if (v && !self.objs[num]) { v.__num = num; self.objs[num] = { num: num, value: v, stream: null }; }
          } catch (e) { /* 跳过损坏对象 */ }
        }
      }).catch(function () { /* 忽略 */ }));
    });
    return Promise.all(jobs);
  };

  Doc.prototype.catalog = function () {
    var self = this, found = null;
    Object.keys(this.objs).some(function (k) {
      var v = self.objs[k].value;
      if (v && v.k === 'd' && v.v.Type && v.v.Type.v === 'Catalog') { found = v; return true; }
      return false;
    });
    return found;
  };

  Doc.prototype.pages = function () {
    var out = [], self = this;
    var cat = this.catalog();
    var root = cat && cat.v.Pages ? this.resolve(cat.v.Pages) : null;

    function walk(node, inherited, depth) {
      if (!node || node.k !== 'd' || depth > 80) return;
      var d = node.v;
      var type = d.Type ? d.Type.v : '';
      var res = d.Resources ? self.resolve(d.Resources) : inherited;
      if (type === 'Pages' || (!type && d.Kids)) {
        var kids = self.resolve(d.Kids);
        if (kids && kids.k === 'a') kids.v.forEach(function (k) { walk(self.resolve(k), res, depth + 1); });
      } else if (type === 'Page') {
        out.push({ dict: node, res: res });
      }
    }
    if (root) walk(root, null, 0);

    if (!out.length) {
      // 容错：直接收集所有 Page 对象
      var self2 = this;
      Object.keys(this.objs).sort(function (a, b) { return a - b; }).forEach(function (k) {
        var v = self2.objs[k].value;
        if (v && v.k === 'd' && v.v.Type && v.v.Type.v === 'Page') {
          out.push({ dict: v, res: v.v.Resources ? self2.resolve(v.v.Resources) : null });
        }
      });
    }
    return out;
  };

  /* ---------------- CMap ---------------- */
  function hexToUnicode(h) {
    if (h.length % 4) h = ('0000' + h).slice(-Math.ceil(h.length / 4) * 4);
    var out = '';
    for (var i = 0; i < h.length; i += 4) {
      var code = parseInt(h.substr(i, 4), 16);
      if (!isNaN(code)) out += String.fromCharCode(code);
    }
    return out;
  }

  function incUnicode(str, delta) {
    if (!str) return '';
    var c = str.charCodeAt(str.length - 1) + delta;
    return str.slice(0, -1) + String.fromCharCode(c);
  }

  function parseCMap(text) {
    var map = {}, m;
    var bfchar = /beginbfchar([\s\S]*?)endbfchar/g;
    while ((m = bfchar.exec(text))) {
      var pair = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g, p;
      while ((p = pair.exec(m[1]))) map[parseInt(p[1], 16)] = hexToUnicode(p[2]);
    }
    var bfrange = /beginbfrange([\s\S]*?)endbfrange/g;
    while ((m = bfrange.exec(text))) {
      var item = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]+)>|\[([\s\S]*?)\])/g, q;
      while ((q = item.exec(m[1]))) {
        var lo = parseInt(q[1], 16), hi = parseInt(q[2], 16);
        if (q[3]) {
          var base = hexToUnicode(q[3]);
          for (var c = lo; c <= hi && c - lo < 65535; c++) map[c] = incUnicode(base, c - lo);
        } else {
          var arr = (q[4].match(/<([0-9a-fA-F]+)>/g) || []);
          for (var i = 0; i < arr.length; i++) map[lo + i] = hexToUnicode(arr[i].slice(1, -1));
        }
      }
    }
    return map;
  }

  /* ---------------- 字体解码器 ---------------- */
  Doc.prototype.fontDecoder = function (fontRef) {
    var self = this;
    var fd = this.resolve(fontRef);
    if (!fd || fd.k !== 'd') return Promise.resolve({ cjk: false, decode: function (s) { return s; }, known: false, adv: null });
    var d = fd.v;
    var subtype = d.Subtype && d.Subtype.v;
    var twoByte = subtype === 'Type0';
    var tu = d.ToUnicode ? this.resolve(d.ToUnicode) : null;

    /* 字形宽度（1/1000 em）：有 /Widths、/W 就用真实值，
       没有才退回按字符类型估算。宽度准了才不会把「广东」切成「广 东」。 */
    function num(v) {
      v = self.resolve(v);
      return v && v.k === 'num' ? v.v : null;
    }
    function widthsOf() {
      if (twoByte) {
        var dfs = d.DescendantFonts ? self.resolve(d.DescendantFonts) : null;
        var df = dfs && dfs.k === 'a' ? self.resolve(dfs.v[0]) : null;
        var w = df && df.v.W ? self.resolve(df.v.W) : null;
        var dw = df && df.v.DW ? num(df.v.DW) : 1000;
        if (!w || w.k !== 'a') return null;
        var table = {};
        var arr = w.v;
        for (var i = 0; i < arr.length; i++) {
          var a = self.resolve(arr[i]);
          if (!a) continue;
          if (a.k === 'num') {
            var next = self.resolve(arr[i + 1]);
            if (next && next.k === 'a') {
              for (var k = 0; k < next.v.length; k++) table[a.v + k] = num(next.v[k]);
              i += 1;
            } else if (next && next.k === 'num') {
              var last = num(arr[i + 2]);
              for (var c = a.v; c <= next.v; c++) table[c] = last;
              i += 2;
            }
          }
        }
        return { table: table, first: -1, def: dw == null ? 1000 : dw };
      }
      var ws = d.Widths ? self.resolve(d.Widths) : null;
      if (!ws || ws.k !== 'a') return null;
      var desc = d.FontDescriptor ? self.resolve(d.FontDescriptor) : null;
      return {
        table: null,
        arr: ws.v.map(function (x) { return num(x) || 0; }),
        first: d.FirstChar ? num(d.FirstChar) || 0 : 0,
        def: desc && desc.v.MissingWidth ? (num(desc.v.MissingWidth) || 0) : 0
      };
    }
    var wtab = null;
    try { wtab = widthsOf(); } catch (e) { wtab = null; }

    function adv(str) {
      if (!wtab || !str) return null;
      var total = 0, step = twoByte ? 2 : 1;
      for (var i = 0; i < str.length; i += step) {
        var code = twoByte ? ((str.charCodeAt(i) << 8) | (str.charCodeAt(i + 1) || 0)) : str.charCodeAt(i);
        var w;
        if (twoByte) w = wtab.table[code] != null ? wtab.table[code] : wtab.def;
        else {
          var idx = code - wtab.first;
          w = (idx >= 0 && idx < wtab.arr.length) ? wtab.arr[idx] : wtab.def;
        }
        total += w;
      }
      return total / 1000;   // em 倍数
    }

    var p = tu ? this.streamText(tu).then(function (txt) {
      var map = parseCMap(txt);
      return { map: map };
    }).catch(function () { return { map: {} }; }) : Promise.resolve({ map: {} });

    return p.then(function (res) {
      var map = res.map, has = Object.keys(map).length > 0;
      function decode(s) {
        if (has) {
          var out = '', step = twoByte ? 2 : 1;
          for (var i = 0; i < s.length; i += step) {
            var code = twoByte
              ? ((s.charCodeAt(i) << 8) | (s.charCodeAt(i + 1) || 0))
              : s.charCodeAt(i);
            out += map[code] != null ? map[code] : '';
          }
          return out;
        }
        if (twoByte) return '';           // 无 ToUnicode 的 CID 字体无法还原文字
        return s;                          // 简单字体按 latin1 处理
      }
      return { cjk: twoByte, decode: decode, known: has || !twoByte, adv: adv };
    });
  };

  Doc.prototype.fontMap = function (resRef) {
    var self = this;
    var res = resRef ? this.resolve(resRef) : null;
    var fonts = res && res.k === 'd' && res.v.Font ? this.resolve(res.v.Font) : null;
    var out = {};
    if (!fonts || fonts.k !== 'd') return Promise.resolve(out);
    var jobs = Object.keys(fonts.v).map(function (name) {
      return self.fontDecoder(fonts.v[name]).then(function (dec) { out[name] = dec; });
    });
    return Promise.all(jobs).then(function () { return out; });
  };

  /* ---------------- 内容流 ---------------- */
  function estWidth(text, size) {
    var w = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      w += (c > 0x2e80 && c < 0xffef) ? size : size * 0.52;
    }
    return w;
  }

  function readToken(s, i, n) {
    while (i < n && isWS(s.charCodeAt(i))) i++;
    if (i >= n) return null;
    var ch = s[i];
    if (ch === '%') {
      while (i < n && s.charCodeAt(i) !== 10 && s.charCodeAt(i) !== 13) i++;
      return { t: 'skip', end: i };
    }
    if (ch === '(') {
      var p = new Parser(s, i);
      var v = p.literal();
      return { t: 'str', v: v.v, end: p.p };
    }
    if (ch === '<' && s[i + 1] !== '<') {
      var p2 = new Parser(s, i);
      var v2 = p2.hex();
      return { t: 'str', v: v2.v, end: p2.p };
    }
    if (ch === '<' && s[i + 1] === '<') {
      // 跳过字典：平衡计数
      var depth = 0, j = i;
      while (j < n) {
        if (s[j] === '<' && s[j + 1] === '<') { depth++; j += 2; continue; }
        if (s[j] === '>' && s[j + 1] === '>') { depth--; j += 2; if (depth <= 0) break; continue; }
        j++;
      }
      return { t: 'skip', end: j };
    }
    if (ch === '[') return { t: 'arr', end: i + 1 };
    if (ch === ']') return { t: 'arrend', end: i + 1 };
    if (ch === '/') {
      var p3 = new Parser(s, i);
      var nm = p3.name();
      return { t: 'name', v: nm.v, end: p3.p };
    }
    if (ch === '{' || ch === '}') return { t: 'skip', end: i + 1 };
    if (ch === ')') return { t: 'skip', end: i + 1 };

    var st = i;
    while (i < n) {
      var c = s.charCodeAt(i);
      if (isWS(c) || isDelim(c)) break;
      i++;
    }
    if (i === st) return { t: 'skip', end: i + 1 };
    var word = s.slice(st, i);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) return { t: 'num', v: parseFloat(word), end: i };
    if (/^[A-Za-z'"*][A-Za-z0-9'"*]*$/.test(word)) return { t: 'op', v: word, end: i };
    return { t: 'skip', end: i };
  }

  function interpret(content, fonts, runs, stats) {
    var tm = [1, 0, 0, 1, 0, 0], tlm = tm.slice();
    var ctm = [1, 0, 0, 1, 0, 0], ctmStack = [];
    var leading = 0, size = 12, font = null;
    var stack = [], ti = 0, n = content.length, arrStack = [];

    function reset() { tm = [1, 0, 0, 1, 0, 0]; tlm = tm.slice(); }

    function mul(m1, m2) {
      return [
        m1[0] * m2[0] + m1[1] * m2[2],
        m1[0] * m2[1] + m1[1] * m2[3],
        m1[2] * m2[0] + m1[3] * m2[2],
        m1[2] * m2[1] + m1[3] * m2[3],
        m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
        m1[4] * m2[1] + m1[5] * m2[3] + m2[5]
      ];
    }

    function push(text, x, y, sz, adv) {
      var dx = ctm[0] * x + ctm[2] * y + ctm[4];
      var dy = ctm[1] * x + ctm[3] * y + ctm[5];
      // 文本 y 轴在设备坐标中的方向：>0 表示向上（原点在左下），<0 表示向下
      var vdir = ctm[1] * tm[2] + ctm[3] * tm[3];
      var vscale = Math.abs(vdir) || 1;
      var hscale = Math.sqrt(ctm[0] * ctm[0] + ctm[1] * ctm[1]) || 1;
      runs.push({
        x: dx, y: dy, size: (Math.abs(sz) || 12) * vscale, text: text, up: vdir >= 0,
        w: (adv == null ? estWidth(text, Math.abs(sz) || 12) : adv) * hscale
      });
    }

    /* 单个文本片段在文本空间里推进多少（未乘字号）：优先用字体的真实宽度表 */
    function advOf(str) {
      if (font && font.adv) {
        var a = font.adv(str);
        if (a != null && a > 0) return a;
      }
      return null;
    }

    function show(str) {
      if (str == null || !font) return;
      var text = font.decode(str);
      if (!text) { if (str.replace(/\x00/g, '').length) stats.unknown += str.length; return; }
      var em = advOf(str);
      push(text, tm[4], tm[5], size, em == null ? null : em * Math.abs(size || 12));
    }

    /* TJ 数组里的元素由 readToken 直接入栈：数字是裸 number，字符串是 {str}。
       Word / WPS / 多数在线简历导出的 PDF 只用 TJ（没有 Tj），
       这里必须同时兼容裸值和旧的对象形态，否则整页文字会被丢掉。 */
    function showTJ(items) {
      var x = tm[4];
      for (var k = 0; k < items.length; k++) {
        var it = items[k];
        var num = typeof it === 'number' ? it
          : (it && it.t === 'num' ? it.v : null);
        var str = typeof it === 'string' ? it
          : (it && it.str != null ? it.str
            : (it && it.t === 'str' ? it.v : null));
        if (num != null && str == null) {
          x -= (num / 1000) * size;
        } else if (str != null) {
          var txt = font ? font.decode(str) : '';
          if (txt) {
            var em = advOf(str);
            var adv = em == null ? estWidth(txt, Math.abs(size) || 12) : em * Math.abs(size || 12);
            push(txt, x, tm[5], size, adv);
            // TJ 内需要自行推进（没有 Td），按真实字宽 / 估算值前进
            x += adv;
          } else if (String(str).replace(/\x00/g, '').length) {
            stats.unknown += str.length;
          }
        }
      }
    }

    while (ti < n) {
      var tok = readToken(content, ti, n);
      if (!tok) break;
      ti = tok.end;
      if (tok.t === 'skip') continue;
      if (tok.t === 'num') { stack.push(tok.v); continue; }
      if (tok.t === 'name') { stack.push({ name: tok.v }); continue; }
      if (tok.t === 'str') { stack.push({ str: tok.v }); continue; }
      if (tok.t === 'arr') { arrStack.push(stack); stack = []; continue; }
      if (tok.t === 'arrend') {
        var arr = stack;
        stack = arrStack.pop() || [];
        stack.push({ arr: arr });
        continue;
      }
      if (tok.t === 'op') {
        var op = tok.v;
        if (op === 'q') { ctmStack.push(ctm.slice()); }
        else if (op === 'Q') { ctm = ctmStack.pop() || [1, 0, 0, 1, 0, 0]; }
        else if (op === 'cm' && stack.length >= 6) {
          ctm = mul(stack.slice(-6).map(Number), ctm);
        } else if (op === 'BT') { reset(); }
        else if (op === 'Tf') {
          for (var a = stack.length - 1; a >= 0; a--) {
            if (stack[a] && stack[a].name) { font = fonts[stack[a].name] || null; break; }
          }
          var last = stack[stack.length - 1];
          if (typeof last === 'number') size = last;
        } else if (op === 'Tm' && stack.length >= 6) {
          tm = stack.slice(-6).map(Number); tlm = tm.slice();
        } else if (op === 'Td' && stack.length >= 2) {
          var tx = Number(stack[stack.length - 2]), ty = Number(stack[stack.length - 1]);
          tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[4] + tx, tlm[5] + ty];
          tm = tlm.slice();
        } else if (op === 'TD' && stack.length >= 2) {
          var tx2 = Number(stack[stack.length - 2]), ty2 = Number(stack[stack.length - 1]);
          leading = -ty2;
          tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[4] + tx2, tlm[5] + ty2];
          tm = tlm.slice();
        } else if (op === 'T*') {
          tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[4], tlm[5] - leading];
          tm = tlm.slice();
        } else if (op === 'TL' && stack.length) {
          leading = Number(stack[stack.length - 1]);
        } else if (op === 'Tj') {
          for (var b = stack.length - 1; b >= 0; b--) if (stack[b] && stack[b].str != null) { show(stack[b].str); break; }
        } else if (op === 'TJ') {
          for (var c = stack.length - 1; c >= 0; c--) if (stack[c] && stack[c].arr) { showTJ(stack[c].arr); break; }
        } else if (op === "'") {
          tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[4], tlm[5] - leading];
          tm = tlm.slice();
          for (var d = stack.length - 1; d >= 0; d--) if (stack[d] && stack[d].str != null) { show(stack[d].str); break; }
        } else if (op === '"') {
          tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[4], tlm[5] - leading];
          tm = tlm.slice();
          for (var e = stack.length - 1; e >= 0; e--) if (stack[e] && stack[e].str != null) { show(stack[e].str); break; }
        }
        stack = [];
      }
    }
  }

  function toLines(runs) {
    if (!runs.length) return [];
    // PDF 设备坐标可能以顶部或底部为原点，用 CTM 的 d 分量判断后统一成「从上到下」
    function key(r) { return r.up ? -r.y : r.y; }
    runs.forEach(function (r) { r.__k = key(r); });
    runs.sort(function (a, b) {
      if (Math.abs(b.__k - a.__k) > 1.5) return a.__k - b.__k;
      return a.x - b.x;
    });
    var groups = [], cur = null;
    runs.forEach(function (r) {
      var tol = Math.max(2.2, (r.size || 10) * 0.42);
      if (!cur || Math.abs(r.__k - cur.k) > tol) {
        cur = { k: r.__k, runs: [r] };
        groups.push(cur);
      } else {
        cur.runs.push(r);
      }
    });

    var NO_SPACE_BEFORE = /^[，。、；：？！）】》”’%.,;:?!)\]}]/;
    var NO_SPACE_AFTER = /[（【《“‘(\[{]$/;
    var CJK = /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]/;

    return groups.map(function (g) {
      g.runs.sort(function (a, b) { return a.x - b.x; });
      var line = '', prevEnd = null, prevSize = 10;
      g.runs.forEach(function (r) {
        if (prevEnd != null) {
          var gap = r.x - prevEnd;
          var ch = r.text.charAt(0);
          var last = line.slice(-1);
          // 中文排版里字与字本来就只有很小的字距，用 0.55em 判断会切出「广 东」；
          // 只有明显的一个字宽以上空隙才算真正的分隔。
          var need = gap > prevSize * (CJK.test(ch) && CJK.test(last) ? 0.92 : 0.55) &&
            !/\s$/.test(line) && !/^\s/.test(r.text) &&
            !NO_SPACE_BEFORE.test(ch) && !NO_SPACE_AFTER.test(last);
          if (need) line += gap > prevSize * 2.2 ? '　' : ' ';
        }
        line += r.text;
        prevEnd = r.x + (r.w != null ? r.w : estWidth(r.text, r.size || 10));
        prevSize = r.size || 10;
      });
      return line.replace(/[ \t]+/g, ' ').trim();
    }).filter(function (s) { return s.length > 0; });
  }

  /* ---------------- 对外接口 ---------------- */
  async function extract(input) {
    var bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (!bytes.length) {
      var e0 = new Error('这个文件是空的');
      e0.code = 'EMPTY_FILE';
      throw e0;
    }
    var head = bytesToStr(bytes.subarray(0, 1024));
    if (head.indexOf('%PDF') < 0) {
      var e1 = new Error('这不是 PDF 文件（文件头缺少 %PDF 标识），可能已损坏或被改过扩展名');
      e1.code = 'NOT_PDF';
      throw e1;
    }
    var doc = new Doc(bytes);
    doc.scan();
    /* 加密 PDF 的字符串与流都是密文，硬解只会得到空文本，
       之前会被误判成「扫描件」。这里提前识别并如实告知。 */
    if (doc.encrypted()) {
      var e2 = new Error('这份 PDF 加了密（设置了打开密码或权限密码），浏览器里无法读取正文。' +
        '请用阅读器打开后「另存为」一份不加密的副本，或在 Chrome 里打印成新的 PDF 再上传');
      e2.code = 'ENCRYPTED';
      throw e2;
    }
    await doc.expandObjectStreams();

    var pages = doc.pages();
    var stats = { unknown: 0 };
    var out = [];

    for (var i = 0; i < pages.length; i++) {
      var page = pages[i];
      var d = page.dict.v;
      var resRef = d.Resources ? d.Resources : page.res;
      // Resources 可能是继承的间接引用，需要拿到其 dict
      var resVal = resRef ? doc.resolve(resRef) : null;
      var fonts = await doc.fontMap(resVal ? resVal : resRef);

      var contents = d.Contents ? doc.resolve(d.Contents) : null;
      var parts = [];
      if (contents && contents.k === 'a') {
        for (var k = 0; k < contents.v.length; k++) {
          var c = doc.resolve(contents.v[k]);
          if (c) parts.push(await doc.streamText(c));
        }
      } else if (contents) {
        parts.push(await doc.streamText(contents));
      }

      var runs = [];
      interpret(parts.join('\n'), fonts, runs, stats);

      /* 有些排版工具把整页文字放进 Form XObject（页内容只有一行 Do），
         只读页内容会得到空文本。这里把表单对象里的文字也解释一遍。 */
      var xobjs = resVal && resVal.k === 'd' && resVal.v.XObject ? doc.resolve(resVal.v.XObject) : null;
      if (xobjs && xobjs.k === 'd') {
        var names = Object.keys(xobjs.v);
        for (var xi = 0; xi < names.length; xi++) {
          var xo = doc.resolve(xobjs.v[names[xi]]);
          if (!xo || xo.k !== 'd' || !xo.v.Subtype || xo.v.Subtype.v !== 'Form') continue;
          var xres = xo.v.Resources ? doc.resolve(xo.v.Resources) : null;
          var xfonts = xres && xres.k === 'd' && xres.v.Font ? await doc.fontMap(xres) : fonts;
          var xtxt = await doc.streamText(xo);
          if (xtxt) interpret(xtxt, xfonts || fonts, runs, stats);
        }
      }

      var lines = toLines(runs);
      out.push({ index: i + 1, lines: lines, text: lines.join('\n'), runs: runs.length });
    }

    var allText = out.map(function (p) { return p.text; }).join('\n');
    return {
      pageCount: out.length,
      pages: out,
      text: allText,
      chars: allText.replace(/\s/g, '').length,
      unknownGlyphs: stats.unknown,
      empty: out.every(function (p) { return p.lines.length === 0; })
    };
  }

  global.PDFText = { extract: extract, _internals: { toLines: toLines, parseCMap: parseCMap } };
})(typeof window !== 'undefined' ? window : globalThis);
