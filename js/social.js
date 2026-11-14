/* =========================================================
 *  鸡狗杀 · 好友系统（加好友 / 私聊 / 邀请进房）
 * ========================================================= */
(function () {
  'use strict';
  const token = () => { try { return localStorage.getItem('jgs.auth') || ''; } catch (e) { return ''; } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const toast = m => { try { window.JGSUI && window.JGSUI.toast && window.JGSUI.toast(m); } catch (e) { } };

  async function api(path, opt) {
    const o = Object.assign({ headers: { 'Content-Type': 'application/json' } }, opt || {});
    if (token()) o.headers.Authorization = 'Bearer ' + token();
    const r = await fetch(path, o);
    let d = {};
    try { d = await r.json(); } catch (e) { }
    if (!r.ok) throw new Error(d.error || ('请求失败 ' + r.status));
    return d;
  }

  let modal = null, data = { friends: [], requests: [], sent: [] }, chatWith = null, chatMsgs = [], timer = null;

  function close() {
    if (!modal) return;
    clearInterval(timer); timer = null;
    modal.classList.remove('on');
    const m = modal; modal = null;
    setTimeout(() => m.remove(), 200);
  }

  async function open() {
    if (!token()) { toast('请先登录账号'); if (window.JGSAuth) window.JGSAuth.open(); return; }
    if (modal) { close(); return; }
    modal = document.createElement('div');
    modal.className = 'modal-backdrop on social-backdrop';
    modal.innerHTML = '<div class="social-panel"><div class="sp-head"><b>好友</b><button class="sp-x" data-x="close">✕</button></div><div class="sp-body" id="sp-body">加载中…</div></div>';
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('on'));
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modal.querySelector('[data-x=close]').addEventListener('click', close);
    await refresh();
    timer = setInterval(() => { if (!document.hidden && chatWith) loadChat(); }, 4000);
  }

  async function refresh() {
    try { data = await api('/api/friends'); } catch (e) { data = { friends: [], requests: [], sent: [] }; }
    render();
  }

  function render() {
    const b = document.getElementById('sp-body');
    if (!b) return;
    const me = (window.JGSAuth && window.JGSAuth.user()) || null;
    const myLine = me ? `<div class="sp-me">我的用户名 <b>${esc(me.name)}</b><button class="btn btn-mini" data-x="copy">复制</button></div>` : '';
    if (!data.friends.length && !data.requests.length) {
      b.innerHTML = `${myLine}<div class="sp-empty">还没有好友<br><span>输入对方的用户名，发一个好友请求</span></div>
        <div class="sp-add"><input id="sp-name" placeholder="对方的用户名（不是昵称）" maxlength="16"><button class="btn btn-primary" data-x="add">添加</button></div>`;
      bindAdd();
      return;
    }
    b.innerHTML = `${myLine}
      <div class="sp-add"><input id="sp-name" placeholder="输入用户名添加（不是昵称）" maxlength="16"><button class="btn" data-x="add">添加</button></div>
      ${data.requests.length ? `<div class="sp-sec">好友请求</div>` + data.requests.map(r => `
        <div class="sp-row"><span class="sp-dot on"></span><span class="sp-name">${esc(r.nick)}</span>
          <button class="btn btn-mini" data-x="accept" data-n="${esc(r.name)}">同意</button>
          <button class="btn btn-mini" data-x="decline" data-n="${esc(r.name)}">拒绝</button></div>`).join('') : ''}
      <div class="sp-sec">好友 ${data.friends.length}</div>
      ${data.friends.map(f => `
        <div class="sp-row"><span class="sp-dot ${f.online ? 'on' : ''}"></span>
          <span class="sp-name">${esc(f.nick)}<i>${esc(f.name)}</i></span>
          <button class="btn btn-mini" data-x="chat" data-n="${esc(f.name)}">聊天</button>
          <button class="btn btn-mini" data-x="invite" data-n="${esc(f.name)}">邀请</button></div>`).join('')}
      ${chatWith ? renderChat() : ''}`;
    bindAdd();
    b.querySelectorAll('[data-x]').forEach(el => el.addEventListener('click', () => act(el.dataset.x, el.dataset.n)));
  }

  function renderChat() {
    const f = data.friends.find(x => x.name === chatWith);
    const nm = f ? f.nick : chatWith;
    return `<div class="sp-chat">
      <div class="sp-chat-head">与 ${esc(nm)} 的对话 <button class="btn btn-mini" data-x="closechat">收起</button></div>
      <div class="sp-chat-list" id="sp-chat-list">${chatMsgs.map(m => `
        <div class="sp-msg ${m.dir}">${m.code ? `<div class="sp-invite">房间 ${esc(m.code)} <button class="btn btn-mini" data-x="join" data-code="${esc(m.code)}">加入</button></div>` : ''}<div>${esc(m.text)}</div></div>`).join('') || '<div class="sp-empty">还没有消息</div>'}</div>
      <div class="sp-chat-input"><input id="sp-msg" placeholder="说点什么…" maxlength="200"><button class="btn btn-primary" data-x="send">发送</button></div>
    </div>`;
  }

  function bindAdd() {
    const btn = document.querySelector('#sp-body [data-x=add]');
    if (btn) btn.addEventListener('click', () => act('add'));
    const inp = document.getElementById('sp-name');
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') act('add'); });
    const msg = document.getElementById('sp-msg');
    if (msg) msg.addEventListener('keydown', e => { if (e.key === 'Enter') act('send'); });
  }

  async function loadChat() {
    if (!chatWith) return;
    try { const d = await api('/api/friends/messages?with=' + encodeURIComponent(chatWith)); chatMsgs = d.messages || []; } catch (e) { }
    const list = document.getElementById('sp-chat-list');
    if (list) list.innerHTML = chatMsgs.map(m => `<div class="sp-msg ${m.dir}">${m.code ? `<div class="sp-invite">房间 ${esc(m.code)} <button class="btn btn-mini" data-x="join" data-code="${esc(m.code)}">加入</button></div>` : ''}<div>${esc(m.text)}</div></div>`).join('') || '<div class="sp-empty">还没有消息</div>';
    const body = document.getElementById('sp-body');
    if (body) body.querySelectorAll('[data-x=join]').forEach(el => el.addEventListener('click', () => joinRoom(el.dataset.code)));
  }

  async function act(x, n) {
    try {
      if (x === 'add') {
        const inp = document.getElementById('sp-name');
        const name = (inp && inp.value || '').trim();
        if (!name) return;
        await api('/api/friends/add', { method: 'POST', body: JSON.stringify({ name }) });
        if (inp) inp.value = '';
        toast('好友请求已发送');
        await refresh();
      } else if (x === 'accept') { await api('/api/friends/accept', { method: 'POST', body: JSON.stringify({ name: n }) }); await refresh(); }
      else if (x === 'decline') { await api('/api/friends/decline', { method: 'POST', body: JSON.stringify({ name: n }) }); await refresh(); }
      else if (x === 'copy') {
        const me = (window.JGSAuth && window.JGSAuth.user()) || null;
        if (me) {
          try { await navigator.clipboard.writeText(me.name); toast('已复制用户名：' + me.name); }
          catch (e) { prompt('你的用户名', me.name); }
        }
      }
      else if (x === 'chat') { chatWith = n; await refresh(); await loadChat(); }
      else if (x === 'closechat') { chatWith = null; chatMsgs = []; render(); }
      else if (x === 'send') {
        const inp = document.getElementById('sp-msg');
        const text = (inp && inp.value || '').trim();
        if (!text || !chatWith) return;
        await api('/api/friends/messages', { method: 'POST', body: JSON.stringify({ to: chatWith, text }) });
        if (inp) inp.value = '';
        await loadChat();
      } else if (x === 'invite') {
        const code = (window.__jgs && __jgs.net && __jgs.net.room && __jgs.net.room.code) || '';
        if (!code) { toast('请先在「联机对战」里创建或加入房间'); return; }
        await api('/api/friends/messages', { method: 'POST', body: JSON.stringify({ to: n, text: '来一起打一局？', code }) });
        toast('邀请已发送');
      } else if (x === 'join') joinRoom(n);
    } catch (e) { toast(e.message); }
  }

  async function joinRoom(code) {
    if (!code) return;
    close();
    const ui = window.JGSUI;
    if (ui && ui.showScreen) ui.showScreen('online');
    setTimeout(() => {
      const inp = document.querySelector('#screen-online input[maxlength="6"]') || document.querySelector('#screen-online input');
      if (inp) {
        inp.value = code;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        const btn = Array.from(document.querySelectorAll('#screen-online .btn')).find(b => /加入/.test(b.textContent));
        if (btn) btn.click();
      } else {
        prompt('房间号（复制到联机对战里加入）', code);
      }
    }, 400);
  }

  window.JGSSocial = { open, close };
})();
