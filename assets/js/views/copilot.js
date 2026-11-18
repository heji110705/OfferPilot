/* ================= AI 助手 ================= */
(function (global) {
  'use strict';
  var UI = global.UI, Store = global.Store;

  var messages = [{
    role: 'ai',
    text: '你好，我是 OfferPilot 的 AI 助手（由 WorkBuddy 智能体驱动）。\n\n' +
      '我已经读过你的档案：计算机科学与技术 2027 届，2 段实习/项目主线，11 个技能标签。\n' +
      '当前上下文岗位：' + global.AI.ctx.jd.company + ' · ' + global.AI.ctx.jd.role + '。\n\n' +
      '你可以让我做这些事：\n' +
      '· 解析 JD，告诉我匹配在哪里、缺什么\n' +
      '· 按岗位定制简历，自动重排经历\n' +
      '· 写 1 分钟自我介绍、开放题答案\n' +
      '· 诊断简历问题，把要点改成 STAR 结构\n' +
      '· 预测面试题并给答题框架'
  }];

  var CHIPS = [
    { label: '匹配分析', text: '帮我分析一下这个岗位的匹配度' },
    { label: '定制简历', text: '帮我把这个 JD 定制到主简历' },
    { label: '自我介绍', text: '写一段一分钟自我介绍' },
    { label: '开放题', text: '为什么选择我们公司？帮我写一段回答' },
    { label: '简历诊断', text: '诊断一下我的简历有什么问题' },
    { label: '面试预测', text: '预测一下面试会问什么' }
  ];

  function rich(text) {
    return UI.esc(text).replace(/\*\*(.+?)\*\*/g, '<span class="hl">$1</span>');
  }

  function render() {
    var jd = global.AI.ctx.jd;
    var remote = global.AI.remoteAvailable();

    return '<div class="page-head">' +
        '<div><h1>AI 助手</h1><p>对话式完成网申里最费脑的部分：匹配分析、简历定制、开放题、面试准备。</p></div>' +
        '<div class="actions">' +
          '<button class="btn" data-act="settings">' + UI.icon('settings', 'sm') + (remote ? '已接入模型' : '接入模型') + '</button>' +
          '<button class="btn" data-act="clearchat">' + UI.icon('refresh', 'sm') + '新会话</button>' +
        '</div>' +
      '</div>' +

      '<div class="copilot-grid">' +
        '<div class="card chat">' +
          '<div class="card-head" style="padding:12px 18px">' +
            '<span class="ai-orb"></span>' +
            '<div><h3 style="line-height:1.2">OfferPilot Copilot</h3>' +
            '<span class="tiny">' + (remote ? '已接入 ' + UI.esc(Store.state.settings.llmModel) : '本地规则引擎 · 不联网、免费') + '</span></div>' +
            '<span class="badge badge-ok" style="margin-left:auto">在线</span>' +
          '</div>' +
          '<div class="chat-scroll" id="chatScroll">' +
            messages.map(function (m) {
              if (m.role === 'me') {
                return '<div class="msg me"><span class="msg-av you">我</span>' +
                  '<div class="msg-body"><div class="bubble">' + rich(m.text) + '</div>' +
                  '<div class="msg-time" style="text-align:right">' + (m.time || '') + '</div></div></div>';
              }
              return '<div class="msg ai"><span class="msg-av ai">AI</span>' +
                '<div class="msg-body"><div class="bubble">' + rich(m.text) + '</div>' +
                (m.action ? '<a class="btn btn-sm" style="margin-top:8px" href="' + m.action.hash + '">' + UI.esc(m.action.label) + UI.icon('arrowRight', 'sm') + '</a>' : '') +
                '</div></div>';
            }).join('') +
          '</div>' +
          '<div class="chip-row" style="padding:0 16px 8px;overflow-x:auto;flex-wrap:nowrap">' +
            CHIPS.map(function (c) {
              return '<button class="chip" data-quick="' + UI.esc(c.text) + '" style="flex:none">' + c.label + '</button>';
            }).join('') +
          '</div>' +
          '<form class="composer" id="chatForm">' +
            '<textarea id="chatInput" rows="1" placeholder="输入问题，或粘贴一段 JD…（Enter 发送，Shift+Enter 换行）"></textarea>' +
            '<button class="send-btn" type="submit" aria-label="发送">' + UI.icon('send') + '</button>' +
          '</form>' +
        '</div>' +

        '<div>' +
          '<div class="card card-pad" style="margin-bottom:12px">' +
            '<div class="hstack" style="margin-bottom:10px"><span class="ai-orb sm"></span>' +
              '<strong style="font-size:13px">WorkBuddy 集成</strong></div>' +
            '<div class="kv">' +
              '<div class="kv-row"><span class="k">档案读写</span><span class="v">本地工作区文件 + 浏览器存储，随时可导出</span></div>' +
              '<div class="kv-row"><span class="k">AI 生成</span><span class="v">' + (remote ? '远程模型已启用' : '内置规则引擎，可选接入任意 OpenAI 兼容模型') + '</span></div>' +
              '<div class="kv-row"><span class="k">自动化</span><span class="v">截止提醒、状态巡检、周报生成</span></div>' +
            '</div>' +
            '<button class="btn btn-sm btn-block" style="margin-top:11px" data-act="settings">' + UI.icon('settings', 'sm') + '模型与数据设置</button>' +
          '</div>' +

          '<div class="card card-pad" style="margin-bottom:12px">' +
            '<div class="hstack" style="margin-bottom:10px"><strong style="font-size:13px">当前岗位上下文</strong>' +
              '<button class="btn btn-sm btn-ghost" style="margin-left:auto;padding:0 6px;height:24px;font-size:11.5px" data-act="setjd">更换</button></div>' +
            '<div style="font-size:13px;font-weight:600">' + UI.esc(jd.company) + ' · ' + UI.esc(jd.role) + '</div>' +
            '<div class="tiny" style="margin-top:3px">' + UI.esc(jd.city || '未标注地点') + ' · ' + jd.skills.length + ' 个关键词 · ' + jd.direction + '</div>' +
            '<div class="chip-row" style="margin-top:9px">' + jd.skills.slice(0, 6).map(function (s) {
              return '<span class="chip" style="height:24px;font-size:11px;cursor:default">' + UI.esc(s) + '</span>';
            }).join('') + '</div>' +
          '</div>' +

          '<div class="card card-pad">' +
            '<div class="hstack" style="margin-bottom:9px"><strong style="font-size:13px">指令模板</strong>' +
              '<span class="tiny" style="margin-left:auto">点击填入</span></div>' +
            '<div class="prompt-card" data-quick="把这段 JD 解析一下，并告诉我该怎么改简历：&#10;">' +
              '<strong>解析 JD 并给改简历建议</strong><span>适合刚看到新岗位时</span></div>' +
            '<div class="prompt-card" data-quick="帮我把字节跳动的 JD 定制到主简历">' +
              '<strong>生成岗位定制简历</strong><span>自动重排经历与关键词</span></div>' +
            '<div class="prompt-card" data-quick="用 STARR 结构帮我润色实习经历的第一条要点">' +
              '<strong>STAR 化润色要点</strong><span>把「负责…」改成结果导向</span></div>' +
            '<div class="prompt-card" data-quick="根据我的档案和岗位，生成 8 道面试预测题">' +
              '<strong>面试题预测</strong><span>含答题框架提示</span></div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ---------------- 发送 ---------------- */
  function appendMsg(role, text, action) {
    var box = document.getElementById('chatScroll');
    if (!box) return null;
    var wrap = document.createElement('div');
    wrap.className = 'msg ' + (role === 'me' ? 'me' : 'ai');
    if (role === 'me') {
      wrap.innerHTML = '<span class="msg-av you">我</span><div class="msg-body">' +
        '<div class="bubble">' + rich(text) + '</div></div>';
    } else {
      wrap.innerHTML = '<span class="msg-av ai">AI</span><div class="msg-body">' +
        '<div class="bubble"><span class="typing"><span></span><span></span><span></span></span></div></div>';
    }
    box.appendChild(wrap);
    box.scrollTop = box.scrollHeight;
    return wrap;
  }

  function send(text) {
    if (!text.trim()) return;
    var input = document.getElementById('chatInput');
    if (input) { input.value = ''; input.style.height = 'auto'; }

    messages.push({ role: 'me', text: text, time: '刚刚' });
    appendMsg('me', text);

    var aiWrap = appendMsg('ai', '');
    var bubble = aiWrap.querySelector('.bubble');

    // 如果文本看起来像 JD，就先更新上下文
    if (/岗位职责|任职要求|工作职责|我们希望你/.test(text)) {
      var jd = global.AI.parseJD(text);
      global.AI.setJD(jd);
    }

    var delay = 480;
    setTimeout(function () {
      var res = global.AI.chat(text, { jd: global.AI.ctx.jd });
      var body = (res.title ? res.title + '\n\n' : '') + res.body;
      UI.typeText(bubble, body, 9).then(function () {
        messages.push({ role: 'ai', text: body, action: res.action });
        if (res.action) {
          var link = document.createElement('a');
          link.className = 'btn btn-sm';
          link.style.marginTop = '8px';
          link.href = res.action.hash;
          link.innerHTML = UI.esc(res.action.label) + UI.icon('arrowRight', 'sm');
          bubble.parentNode.appendChild(link);
        }
        var box = document.getElementById('chatScroll');
        if (box) box.scrollTop = box.scrollHeight;
      });
    }, delay);
  }

  /* ---------------- 设置 ---------------- */
  function settings() {
    var s = Store.state.settings;
    UI.modal({
      title: '模型与数据设置',
      body:
        '<div class="alert-bar" style="margin-bottom:14px">' + UI.icon('info') +
          '<span>不填写 API Key 时使用内置规则引擎，所有计算都在本地完成，不上传任何数据。填入任意 OpenAI 兼容服务的 Key 后，可切换为真实大模型生成。</span></div>' +
        '<div class="field"><label>API Base</label><input class="input" id="sBase" value="' + UI.esc(s.llmBase) + '" placeholder="https://api.openai.com/v1" /></div>' +
        '<div class="field" style="margin-top:12px"><label>模型名称</label><input class="input" id="sModel" value="' + UI.esc(s.llmModel) + '" placeholder="gpt-4o-mini / deepseek-chat / qwen-plus" /></div>' +
        '<div class="field" style="margin-top:12px"><label>API Key（仅保存在本机 localStorage）</label><input class="input" id="sKey" type="password" value="' + UI.esc(s.llmKey) + '" placeholder="sk-…" /></div>' +
        '<div class="divider"></div>' +
        '<div class="hstack"><span class="tiny">数据保存在浏览器本地，换设备不会同步。</span>' +
          '<button class="btn btn-sm btn-danger" style="margin-left:auto" data-reset>清空所有数据</button></div>',
      onMount: function (box, close) {
        box.querySelector('[data-reset]').addEventListener('click', function () {
          close();
          UI.confirm('清空全部本地数据？', '档案、简历、投递记录与设置会恢复到初始演示状态。', function () {
            Store.reset();
            location.hash = '#/dashboard';
            global.App.render();
            UI.toast('已恢复初始数据', 'ok');
          }, '清空并重置');
        });
      },
      onOk: function (box) {
        Store.setSetting('llmBase', box.querySelector('#sBase').value.trim() || 'https://api.openai.com/v1');
        Store.setSetting('llmModel', box.querySelector('#sModel').value.trim() || 'gpt-4o-mini');
        Store.setSetting('llmKey', box.querySelector('#sKey').value.trim());
        global.App.render();
        UI.toast(Store.state.settings.llmKey ? '已启用远程模型' : '已切回本地规则引擎', 'ok');
      }
    });
  }

  function setJD() {
    UI.modal({
      title: '设置当前岗位上下文',
      wide: true,
      body: '<p class="mini-note" style="margin-bottom:10px">粘贴 JD 全文，AI 会解析企业、岗位、城市与关键词，作为后续所有生成的上下文。</p>' +
        '<textarea class="textarea" id="jdBox" style="min-height:180px">' + UI.esc(global.AI.ctx.jd.raw || global.AI.seedJD) + '</textarea>',
      onOk: function (box) {
        var t = box.querySelector('#jdBox').value.trim();
        if (!t) { UI.toast('请粘贴 JD', 'warn'); return false; }
        var jd = global.AI.parseJD(t);
        global.AI.setJD(jd);
        global.App.render();
        UI.toast('已更新上下文：' + jd.company + ' · ' + jd.role, 'ok');
      }
    });
  }

  function mount(root) {
    var form = root.querySelector('#chatForm');
    var input = root.querySelector('#chatInput');
    var scroll = root.querySelector('#chatScroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        send(input.value);
        input.value = '';
        input.style.height = 'auto';
      });
    }
    if (input) {
      input.addEventListener('input', function () {
        input.style.height = 'auto';
        input.style.height = Math.min(110, input.scrollHeight) + 'px';
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          send(input.value);
          input.value = '';
          input.style.height = 'auto';
        }
      });
    }

    root.addEventListener('click', function (e) {
      var q = e.target.closest('[data-quick]');
      if (q) {
        var text = q.getAttribute('data-quick');
        if (q.classList.contains('prompt-card')) {
          if (input) { input.value = text; input.focus(); }
          return;
        }
        send(text);
        return;
      }
      var act = e.target.closest('[data-act]');
      if (!act) return;
      var a = act.getAttribute('data-act');
      if (a === 'settings') settings();
      if (a === 'setjd') setJD();
      if (a === 'clearchat') {
        messages = messages.slice(0, 1);
        global.App.render();
        UI.toast('已开启新会话');
      }
    });
  }

  global.Views = global.Views || {};
  global.Views.copilot = { title: 'AI 助手', render: render, mount: mount, send: send };
})(window);
