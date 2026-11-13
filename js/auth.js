/* =========================================================
 *  鸡狗杀 · 账号与存档
 *  注册 / 登录 / 云端存档（服务端 data/users.json）
 * ========================================================= */
(function () {
  'use strict';
  const KEY = 'jgs.auth';
  const A = { token: '', user: null, ready: false };
  try { A.token = localStorage.getItem(KEY) || ''; } catch (e) { }

  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  function toast(msg) { try { if (window.JGSUI && window.JGSUI.toast) window.JGSUI.toast(msg); } catch (e) { } }

  async function api(path, opt) {
    const o = Object.assign({ headers: {} }, opt || {});
    o.headers = Object.assign({ 'Content-Type': 'application/json' }, o.headers);
    if (A.token) o.headers['Authorization'] = 'Bearer ' + A.token;
    const r = await fetch(path, o);
    let data = {};
    try { data = await r.json(); } catch (e) { }
    if (!r.ok) throw new Error(data.error || ('请求失败 ' + r.status));
    return data;
  }

  function setToken(t, u) {
    A.token = t || '';
    A.user = u || null;
    try {
      if (A.token) localStorage.setItem(KEY, A.token); else localStorage.removeItem(KEY);
    } catch (e) { }
    updateBadge();
    window.dispatchEvent(new CustomEvent('jgs:auth', { detail: A.user }));
  }

  function updateBadge() {
    const b = document.getElementById('btn-account');
    if (!b) return;
    b.textContent = A.user ? `${A.user.nick || A.user.name} · 账号` : '登录 / 注册';
    b.classList.toggle('on', !!A.user);
  }

  /* ---------------- 弹窗 ---------------- */
  let modal = null;
  function open(mode) {
    if (modal) return;
    const m = document.createElement('div');
    m.className = 'modal-backdrop on auth-backdrop';
    m.innerHTML = `<div class="modal auth-modal" role="dialog" aria-modal="true">
      <div class="auth-head">
        <div class="auth-logo">鶏 狗 殺</div>
        <div class="auth-sub">账号用于保存闯关存档</div>
      </div>
      ${A.user ? `
        <div class="auth-current">
          <div class="ac-name">${esc(A.user.nick || A.user.name)}</div>
          <div class="ac-sub">@${esc(A.user.name)} · 已登录</div>
        </div>
        <div class="auth-actions">
          <button class="btn btn-primary" data-x="sync">从账号拉取存档</button>
          <button class="btn" data-x="logout">退出登录</button>
        </div>
      ` : `
      <div class="auth-tabs">
        <button class="auth-tab ${mode === 'register' ? '' : 'on'}" data-tab="login">登录</button>
        <button class="auth-tab ${mode === 'register' ? 'on' : ''}" data-tab="register">注册</button>
      </div>
      <form class="auth-form" autocomplete="off">
        <label class="auth-field">
          <span>用户名</span>
          <input id="au-name" maxlength="16" placeholder="2-16 位字母/数字/汉字" autocomplete="username">
        </label>
        <label class="auth-field reg-only">
          <span>昵称 <i>可选</i></span>
          <input id="au-nick" maxlength="16" placeholder="显示在标题页">
        </label>
        <label class="auth-field">
          <span>密码</span>
          <input id="au-pass" type="password" maxlength="64" placeholder="至少 4 位" autocomplete="current-password">
        </label>
        <div class="auth-error" id="au-err"></div>
        <button class="btn btn-primary auth-submit" type="submit">登录</button>
      </form>
      <p class="auth-tip">注册后，闯关模式的卡组、道具、剧情进度会保存到账号里。</p>`}
      <button class="auth-close" data-x="close" aria-label="关闭">✕</button>
    </div>`;
    document.body.appendChild(m);
    modal = m;
    requestAnimationFrame(() => m.classList.add('on'));

    m.addEventListener('click', e => {
      if (e.target === m) close();
    });
    m.querySelector('[data-x=close]').addEventListener('click', close);
    const logoutBtn = m.querySelector('[data-x=logout]');
    if (logoutBtn) logoutBtn.addEventListener('click', () => { logout(); close(); });
    const syncBtn = m.querySelector('[data-x=sync]');
    if (syncBtn) syncBtn.addEventListener('click', async () => {
      const s = await pullSave();
      if (s) { window.dispatchEvent(new CustomEvent('jgs:save', { detail: s })); toast('已从账号拉取存档'); }
      else toast('账号里还没有存档');
    });

    if (!A.user) {
      let tab = mode === 'register' ? 'register' : 'login';
      const form = m.querySelector('.auth-form');
      const err = m.querySelector('#au-err');
      const submit = m.querySelector('.auth-submit');
      const setTab = t => {
        tab = t;
        m.querySelectorAll('.auth-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
        m.querySelectorAll('.reg-only').forEach(el => { el.style.display = t === 'register' ? '' : 'none'; });
        submit.textContent = t === 'register' ? '注册并登录' : '登录';
        err.textContent = '';
      };
      setTab(tab);
      m.querySelectorAll('.auth-tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const name = m.querySelector('#au-name').value.trim();
        const pass = m.querySelector('#au-pass').value;
        const nick = m.querySelector('#au-nick').value.trim();
        if (!name || !pass) { err.textContent = '用户名和密码都要填'; return; }
        submit.disabled = true;
        submit.textContent = '请稍候…';
        try {
          const d = tab === 'register'
            ? await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, pass, nick }) })
            : await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ name, pass }) });
          setToken(d.token, d.user);
          close();
          toast(`欢迎，${d.user.nick || d.user.name}`);
        } catch (ex) {
          err.textContent = ex.message;
          submit.disabled = false;
          submit.textContent = tab === 'register' ? '注册并登录' : '登录';
        }
      });
      setTimeout(() => { const n = m.querySelector('#au-name'); if (n) n.focus(); }, 60);
    }
  }

  function close() {
    if (!modal) return;
    const m = modal;
    modal = null;
    m.classList.remove('on');
    setTimeout(() => m.remove(), 220);
  }

  /* ---------------- 接口 ---------------- */
  async function register(name, pass, nick) {
    const d = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, pass, nick }) });
    setToken(d.token, d.user);
    return d.user;
  }
  async function login(name, pass) {
    const d = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ name, pass }) });
    setToken(d.token, d.user);
    return d.user;
  }
  function logout() {
    setToken('', null);
    toast('已退出登录');
  }
  async function pullSave() {
    if (!A.token) return null;
    try { const d = await api('/api/save'); return d.save || null; } catch (e) { return null; }
  }
  let saveTimer = null, saveBusy = false, pending = null;
  function queueSave(state) {
    if (!A.token) return;
    pending = state;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (saveBusy || !A.token) return;
      saveBusy = true;
      const payload = JSON.parse(JSON.stringify(pending));
      try { await api('/api/save', { method: 'PUT', body: JSON.stringify({ save: payload }) }); } catch (e) { }
      saveBusy = false;
    }, 900);
  }

  async function boot() {
    if (!A.token) { A.ready = true; updateBadge(); return; }
    try {
      const d = await api('/api/auth/me');
      A.user = d.user;
      updateBadge();
      window.dispatchEvent(new CustomEvent('jgs:auth', { detail: A.user }));
    } catch (e) {
      A.token = '';
      try { localStorage.removeItem(KEY); } catch (err) { }
      updateBadge();
    }
    A.ready = true;
  }

  window.JGSAuth = {
    open, close, register, login, logout, pullSave, queueSave,
    user: () => A.user,
    loggedIn: () => !!A.user,
    ready: () => A.ready
  };
  setTimeout(boot, 0);
})();
