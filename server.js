/* =========================================================
 *  鸡狗杀 · 联机服务器（零依赖）
 *  - 静态文件服务
 *  - 手写 WebSocket（RFC6455 文本帧）
 *  - 房间 / 身份志愿 / 选角 / 服务端权威对局 / 断线重连
 *  启动：node server.js [port]
 * ========================================================= */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const D = require('./js/data.js');
const E = require('./js/engine.js');
const AI = require('./js/ai.js');

const PORT = parseInt(process.argv[2] || process.env.PORT || '8787', 10);
const ROOT = __dirname;
const MUSIC_DIR = path.join(ROOT, 'music');
try { fs.mkdirSync(MUSIC_DIR, { recursive: true }); } catch (e) { }
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const SEATS = 5;

/* ---------------- 账号 / 存档 ---------------- */
const DATA_DIR = path.join(ROOT, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SECRET_FILE = path.join(DATA_DIR, 'secret.txt');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { }

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) || []; } catch (e) { return []; }
}
let users = loadUsers();
function persistUsers() {
  try { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 1), 'utf8'); } catch (e) { console.error('users save fail', e.message); }
}

let SECRET = '';
try { SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch (e) { }
if (!SECRET) {
  SECRET = crypto.randomBytes(32).toString('hex');
  try { fs.writeFileSync(SECRET_FILE, SECRET, 'utf8'); } catch (e) { }
}

function hashPass(pass, salt) { return crypto.scryptSync(String(pass), salt, 32).toString('hex'); }
function signToken(name) {
  const body = Buffer.from(JSON.stringify({ n: name, e: Date.now() + 30 * 864e5 })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verifyToken(tok) {
  if (!tok || tok.indexOf('.') < 0) return null;
  const parts = tok.split('.');
  if (parts.length !== 2) return null;
  const good = crypto.createHmac('sha256', SECRET).update(parts[0]).digest('base64url');
  if (good.length !== parts[1].length) return null;
  try { if (!crypto.timingSafeEqual(Buffer.from(good), Buffer.from(parts[1]))) return null; } catch (e) { return null; }
  try {
    const o = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!o || !o.n || !o.e || o.e < Date.now()) return null;
    return users.find(u => u.name === o.n) || null;
  } catch (e) { return null; }
}
function tokenOf(req) {
  const h = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : '';
}
function readBody(req, cb) {
  let buf = '';
  let over = false;
  req.on('data', c => {
    buf += c;
    if (buf.length > 128 * 1024) { over = true; req.destroy(); }
  });
  req.on('end', () => { if (!over) cb(buf); });
  req.on('error', () => { });
}
function jsonRes(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function publicUser(u) { return { name: u.name, nick: u.nick || u.name, created: u.created }; }
const NAME_RE = /^[A-Za-z0-9_\u4e00-\u9fa5]{2,16}$/;

function handleAuth(req, res, urlPath) {
  if (urlPath === '/api/auth/register' && req.method === 'POST') {
    readBody(req, body => {
      let b = {};
      try { b = JSON.parse(body || '{}'); } catch (e) { return jsonRes(res, 400, { error: '请求格式错误' }); }
      const name = String(b.name || '').trim();
      const pass = String(b.pass || '');
      const nick = String(b.nick || '').trim().slice(0, 16);
      if (!NAME_RE.test(name)) return jsonRes(res, 400, { error: '用户名需为 2-16 位字母/数字/下划线/汉字' });
      if (pass.length < 4 || pass.length > 64) return jsonRes(res, 400, { error: '密码至少 4 位' });
      if (users.some(u => u.name.toLowerCase() === name.toLowerCase())) return jsonRes(res, 409, { error: '这个用户名已经被注册了' });
      const salt = crypto.randomBytes(16).toString('hex');
      const u = {
        name, nick: nick || name, salt, hash: hashPass(pass, salt),
        created: Date.now(), save: null
      };
      users.push(u);
      persistUsers();
      jsonRes(res, 200, { token: signToken(name), user: publicUser(u) });
    });
    return true;
  }
  if (urlPath === '/api/auth/login' && req.method === 'POST') {
    readBody(req, body => {
      let b = {};
      try { b = JSON.parse(body || '{}'); } catch (e) { return jsonRes(res, 400, { error: '请求格式错误' }); }
      const name = String(b.name || '').trim();
      const pass = String(b.pass || '');
      const u = users.find(x => x.name.toLowerCase() === name.toLowerCase());
      if (!u) return jsonRes(res, 401, { error: '用户名或密码不对' });
      if (hashPass(pass, u.salt) !== u.hash) return jsonRes(res, 401, { error: '用户名或密码不对' });
      jsonRes(res, 200, { token: signToken(u.name), user: publicUser(u) });
    });
    return true;
  }
  if (urlPath === '/api/auth/me' && req.method === 'GET') {
    const u = verifyToken(tokenOf(req));
    if (!u) return jsonRes(res, 401, { error: '未登录' }), true;
    jsonRes(res, 200, { user: publicUser(u) });
    return true;
  }
  if (urlPath.startsWith('/api/friends')) {
    const u = verifyToken(tokenOf(req));
    if (!u) { jsonRes(res, 401, { error: '未登录' }); return true; }
    u.lastSeen = Date.now();
    u.friends = u.friends || [];
    u.reqIn = u.reqIn || [];
    u.messages = u.messages || [];
    const findUser = n => users.find(x => x.name.toLowerCase() === String(n || '').toLowerCase());
    const pub = x => ({ name: x.name, nick: x.nick || x.name, online: Date.now() - (x.lastSeen || 0) < 90000 });

    if (urlPath === '/api/friends' && req.method === 'GET') {
      jsonRes(res, 200, {
        friends: u.friends.map(n => findUser(n)).filter(Boolean).map(pub),
        requests: u.reqIn.map(n => findUser(n)).filter(Boolean).map(pub),
        sent: (u.reqOut || []).map(n => findUser(n)).filter(Boolean).map(pub)
      });
      return true;
    }
    if (urlPath === '/api/friends/add' && req.method === 'POST') {
      readBody(req, body => {
        let b = {};
        try { b = JSON.parse(body || '{}'); } catch (e) { }
        const t = findUser(b.name);
        if (!t) return jsonRes(res, 404, { error: '找不到这个用户名' });
        if (t.name === u.name) return jsonRes(res, 400, { error: '不能加自己' });
        if (u.friends.includes(t.name)) return jsonRes(res, 400, { error: '已经是好友了' });
        u.reqOut = u.reqOut || [];
        if (u.reqOut.includes(t.name)) return jsonRes(res, 400, { error: '已经发过请求' });
        t.reqIn = t.reqIn || [];
        if (!t.reqIn.includes(u.name)) t.reqIn.push(u.name);
        u.reqOut.push(t.name);
        persistUsers();
        jsonRes(res, 200, { ok: true });
      });
      return true;
    }
    if (urlPath === '/api/friends/accept' && req.method === 'POST') {
      readBody(req, body => {
        let b = {};
        try { b = JSON.parse(body || '{}'); } catch (e) { }
        const t = findUser(b.name);
        if (!t || !(u.reqIn || []).includes(t.name)) return jsonRes(res, 404, { error: '没有这个请求' });
        u.reqIn = u.reqIn.filter(n => n !== t.name);
        t.reqOut = (t.reqOut || []).filter(n => n !== u.name);
        if (!u.friends.includes(t.name)) u.friends.push(t.name);
        t.friends = t.friends || [];
        if (!t.friends.includes(u.name)) t.friends.push(u.name);
        persistUsers();
        jsonRes(res, 200, { ok: true });
      });
      return true;
    }
    if (urlPath === '/api/friends/decline' && req.method === 'POST') {
      readBody(req, body => {
        let b = {};
        try { b = JSON.parse(body || '{}'); } catch (e) { }
        const t = findUser(b.name);
        if (!t) return jsonRes(res, 404, { error: '没有这个请求' });
        u.reqIn = (u.reqIn || []).filter(n => n !== t.name);
        t.reqOut = (t.reqOut || []).filter(n => n !== u.name);
        persistUsers();
        jsonRes(res, 200, { ok: true });
      });
      return true;
    }
    if (urlPath === '/api/friends/remove' && req.method === 'POST') {
      readBody(req, body => {
        let b = {};
        try { b = JSON.parse(body || '{}'); } catch (e) { }
        const t = findUser(b.name);
        u.friends = (u.friends || []).filter(n => n !== b.name);
        if (t) t.friends = (t.friends || []).filter(n => n !== u.name);
        persistUsers();
        jsonRes(res, 200, { ok: true });
      });
      return true;
    }
    if (urlPath === '/api/friends/messages') {
      const withName = new URL(req.url, 'http://x').searchParams.get('with') || '';
      if (req.method === 'GET') {
        const list = (u.messages || []).filter(m => m.with === withName).slice(-100);
        jsonRes(res, 200, { messages: list });
        return true;
      }
      readBody(req, body => {
        let b = {};
        try { b = JSON.parse(body || '{}'); } catch (e) { }
        const to = findUser(b.to);
        if (!to) return jsonRes(res, 404, { error: '找不到对方' });
        if (!(u.friends || []).includes(to.name)) return jsonRes(res, 403, { error: '还不是好友' });
        const text = String(b.text || '').slice(0, 500);
        if (!text) return jsonRes(res, 400, { error: '消息为空' });
        const msg = { from: u.name, to: to.name, text, code: b.code || '', at: Date.now() };
        u.messages.push(Object.assign({ with: to.name, dir: 'out' }, msg));
        to.messages = to.messages || [];
        to.messages.push(Object.assign({ with: u.name, dir: 'in' }, msg));
        u.messages = u.messages.slice(-300);
        to.messages = to.messages.slice(-300);
        persistUsers();
        jsonRes(res, 200, { ok: true });
      });
      return true;
    }
    jsonRes(res, 404, { error: 'unknown' });
    return true;
  }
  if (urlPath === '/api/save') {
    const u = verifyToken(tokenOf(req));
    if (!u) { jsonRes(res, 401, { error: '未登录' }); return true; }
    if (req.method === 'GET') { jsonRes(res, 200, { save: u.save || null }); return true; }
    if (req.method === 'PUT' || req.method === 'POST') {
      readBody(req, body => {
        let b = {};
        try { b = JSON.parse(body || '{}'); } catch (e) { return jsonRes(res, 400, { error: '请求格式错误' }); }
        const save = b.save;
        if (!save || typeof save !== 'object') return jsonRes(res, 400, { error: '存档格式错误' });
        const raw = JSON.stringify(save);
        if (raw.length > 96 * 1024) return jsonRes(res, 413, { error: '存档太大' });
        u.save = save;
        u.savedAt = Date.now();
        persistUsers();
        jsonRes(res, 200, { ok: true, savedAt: u.savedAt });
      });
      return true;
    }
  }
  return false;
}

/* ---------------- 静态服务 ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  if (handleAuth(req, res, urlPath)) return;
  if (urlPath === '/data' || urlPath.startsWith('/data/')) { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('forbidden'); return; }

  if (urlPath === '/api/health') {
    jsonRes(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
    return;
  }

  // 背景音乐列表：music/ 文件夹里的音频会被随机播放
  if (urlPath === '/api/music') {
    fs.readdir(MUSIC_DIR, (err, files) => {
      const exts = ['.mp3', '.ogg', '.m4a', '.wav', '.flac', '.opus', '.aac'];
      const tracks = (err ? [] : files)
        .filter(f => exts.includes(path.extname(f).toLowerCase()))
        .sort()
        .map(f => ({
          file: f,
          name: path.basename(f, path.extname(f)),
          url: '/music/' + encodeURIComponent(f)
        }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ tracks }));
    });
    return;
  }

  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache'
    });
    res.end(data);
  });
});

/* ---------------- WebSocket ---------------- */
const clients = new Map(); // ws -> client

function wsAccept(key) {
  return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = wsAccept(key);
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
  socket.setNoDelay(true);

  const client = {
    ws: socket, id: crypto.randomBytes(4).toString('hex'), token: null,
    name: '玩家', room: null, seat: -1, alive: true, buffer: Buffer.alloc(0)
  };
  clients.set(socket, client);

  socket.on('data', chunk => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    try { parseFrames(client); } catch (e) { console.error('ws parse', e); closeSocket(client); }
  });
  socket.on('close', () => onClose(client));
  socket.on('error', () => onClose(client));
});

function parseFrames(client) {
  let buf = client.buffer;
  for (;;) {
    if (buf.length < 2) break;
    const b0 = buf[0], b1 = buf[1];
    const fin = (b0 & 0x80) !== 0;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (buf.length < 4) break;
      len = buf.readUInt16BE(2); offset = 4;
    } else if (len === 127) {
      if (buf.length < 10) break;
      len = Number(buf.readBigUInt64BE(2)); offset = 10;
    }
    if (masked) {
      if (buf.length < offset + 4) break;
      offset += 4;
    }
    if (buf.length < offset + len) break;
    const mask = masked ? buf.slice(offset - 4, offset) : null;
    let payload = buf.slice(offset, offset + len);
    if (masked) {
      payload = Buffer.from(payload);
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    }
    buf = buf.slice(offset + len);
    client.buffer = buf;
    if (!fin) continue; // 不支持分片，忽略
    if (opcode === 0x1) {
      let msg;
      try { msg = JSON.parse(payload.toString('utf8')); } catch (e) { continue; }
      try { onMessage(client, msg); } catch (e) { console.error('[msg error]', msg && msg.t, e); }
    } else if (opcode === 0x8) {
      closeSocket(client);
      return;
    } else if (opcode === 0x9) {
      sendFrame(client.ws, 0xA, payload);
    }
  }
}

function sendFrame(ws, opcode, payload) {
  if (!ws.writable) return;
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  try { ws.write(Buffer.concat([header, payload])); } catch (e) { /* ignore */ }
}

function send(ws, obj) {
  sendFrame(ws, 0x1, Buffer.from(JSON.stringify(obj), 'utf8'));
}

function closeSocket(client) {
  try { client.ws.end(); } catch (e) { /* ignore */ }
  onClose(client);
}

/* ---------------- 房间 ---------------- */
const rooms = new Map();

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    if (!rooms.has(s)) return s;
  }
}

function createRoom(host) {
  const code = makeCode();
  const room = {
    code, hostId: host.id, stage: 'lobby',
    players: [], game: null, timer: null, createdAt: Date.now(),
    config: { identityMode: 'wish' }, chat: [], lastActivity: Date.now()
  };
  rooms.set(code, room);
  host.room = room;
  host.seat = 0;
  room.players.push(makePlayer(host, 0));
  return room;
}

function makePlayer(client, seat) {
  return {
    id: client.id, token: client.token, name: client.name,
    seat, isAI: false, ready: false, connected: true,
    pref: [], pick: null, pickLocked: false, ws: client.ws
  };
}

function findPlayer(room, id) { return room.players.find(p => p.id === id); }

function sanitizeName(n) {
  return String(n || '').replace(/[<>&"']/g, '').trim().slice(0, 12) || '无名';
}

function sendRoom(room) {
  for (const p of room.players) {
    if (p.isAI || !p.connected || !p.ws) continue;
    send(p.ws, { t: 'room', room: roomView(room, p.id) });
  }
}

function roomView(room, viewerId) {
  return {
    code: room.code, hostId: room.hostId, stage: room.stage, config: room.config,
    players: room.players.map(p => ({
      id: p.id, name: p.name, seat: p.seat, isAI: p.isAI, ready: p.ready,
      connected: p.connected, pref: p.id === viewerId ? p.pref : null,
      pick: p.pick, pickLocked: p.pickLocked, isHost: p.id === room.hostId
    })),
    you: viewerId, seats: SEATS,
    chat: room.chat.slice(-30)
  };
}

function sendStage(room, extra) {
  for (const p of room.players) {
    if (p.isAI || !p.connected || !p.ws) continue;
    send(p.ws, Object.assign({ t: 'stage', stage: room.stage, room: roomView(room, p.id) }, extra || {}));
  }
}

function broadcastView(room) {
  if (!room.game) return;
  for (const p of room.players) {
    if (p.isAI || !p.connected || !p.ws) continue;
    const v = E.view(room.game.g, p.seat);
    v.players.forEach((pl, i) => { pl.connected = !room.players[i] || room.players[i].connected; });
    send(p.ws, { t: 'view', view: v });
  }
}

function broadcastChat(room, from, text) {
  room.chat.push({ from, text, at: Date.now() });
  if (room.chat.length > 60) room.chat.shift();
  for (const p of room.players) {
    if (p.isAI || !p.connected || !p.ws) continue;
    send(p.ws, { t: 'chat', from, text, at: Date.now() });
  }
}

function reseat(room) {
  room.players.sort((a, b) => a.seat - b.seat);
  room.players.forEach((p, i) => {
    p.seat = i;
    const cl = p.ws ? clients.get(p.ws) : null;
    if (cl) cl.seat = i;
  });
}

/* ---------------- 对局推进 ---------------- */
function startGame(room) {
  const identities = room.identityMap;
  const players = room.players
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map(p => ({
      id: p.id, name: p.name, charId: p.pick, identity: identities[p.id],
      isAI: p.isAI
    }));
  room.game = new E.Game({ players, seed: Math.floor(Math.random() * 1e9) });
  room.stage = 'game';
  room.game.start();
  room.lastActivity = Date.now();
  room.lastAction = Date.now();
  broadcastView(room);
  scheduleAI(room);
}

function scheduleAI(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(() => {
    room.timer = null;
    stepAI(room);
  }, 240);
}

function stepAI(room) {
  const game = room.game;
  if (!game || game.finished) {
    if (game && game.finished && room.stage !== 'over') {
      room.stage = 'over';
      sendStage(room, { winner: game.g.winner });
      broadcastView(room);
    }
    return;
  }
  const ask = game.pending;
  if (!ask) return;
  const p = game.g.players[ask.seat];
  if (!p || !p.isAI) { broadcastView(room); return; }
  game.act(AI.respond(game, ask));
  broadcastView(room);
  if (game.finished) {
    room.stage = 'over';
    sendStage(room, { winner: game.g.winner });
    broadcastView(room);
    return;
  }
  scheduleAI(room);
}

/* ---------------- 选角 ---------------- */
function resolveIdentity(room) {
  const ids = room.players.map(p => p.id);
  room.identityMap = E.assignIdentities(ids, {}, Math.random);
  room.stage = 'draft';
  for (const p of room.players) { p.pick = null; p.pickLocked = false; p.prefDone = false; }
  sendStage(room);
  draftAI(room);
}

function draftAI(room) {
  const taken = room.players.filter(p => p.pick).map(p => p.pick);
  for (const p of room.players) {
    if (!p.isAI || p.pick) continue;
    const id = AI.pickCharacter(D.CHARACTERS, taken, room.identityMap[p.id], Math.random);
    if (id) { p.pick = id; taken.push(id); }
  }
  checkDraft(room);
}

function checkDraft(room) {
  const humans = room.players.filter(p => !p.isAI);
  if (humans.some(p => !p.pick)) { sendStage(room); return; }
  // 冲突：按座位顺序优先，后者重选
  let changed = true, guard = 0;
  while (changed && guard++ < 20) {
    changed = false;
    const used = new Set();
    for (const p of room.players.slice().sort((a, b) => a.seat - b.seat)) {
      if (p.pick && used.has(p.pick)) {
        if (!p.isAI) {
          p.pick = null;
          p.pickLocked = false;
        } else {
          p.pick = AI.pickCharacter(D.CHARACTERS, [...used], room.identityMap[p.id], Math.random);
        }
        changed = true;
      }
      if (p.pick) used.add(p.pick);
    }
  }
  if (room.players.some(p => !p.pick)) { sendStage(room); return; }
  startGame(room);
}

/* ---------------- 消息处理 ---------------- */
function onMessage(client, msg) {
  if (!msg || typeof msg.t !== 'string') return;
  switch (msg.t) {
    case 'hello': {
      client.name = sanitizeName(msg.name);
      client.token = String(msg.token || '').slice(0, 40) || crypto.randomBytes(8).toString('hex');
      client.name = sanitizeName(msg.name);
      send(client.ws, { t: 'welcome', id: client.id, token: client.token, name: client.name });
      break;
    }
    case 'create': {
      if (client.room) leaveRoom(client);
      client.name = sanitizeName(msg.name || client.name);
      const room = createRoom(client);
      sendRoom(room);
      break;
    }
    case 'join': {
      const code = String(msg.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) { send(client.ws, { t: 'error', msg: '房间不存在' }); return; }
      if (room.stage !== 'lobby') { send(client.ws, { t: 'error', msg: '这局已经开始了' }); return; }
      if (room.players.length >= SEATS) { send(client.ws, { t: 'error', msg: '房间已满' }); return; }
      if (client.room) leaveRoom(client);
      client.name = sanitizeName(msg.name || client.name);
      const seat = [0, 1, 2, 3, 4].find(s => !room.players.some(p => p.seat === s));
      const p = makePlayer(client, seat);
      p.name = client.name;
      p.token = client.token;
      room.players.push(p);
      reseat(room);
      client.room = room; client.seat = p.seat;
      sendRoom(room);
      break;
    }
    case 'rejoin': {
      const code = String(msg.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) { send(client.ws, { t: 'error', msg: '房间不存在或已解散' }); return; }
      const p = room.players.find(x => x.token && x.token === msg.token);
      if (!p) { send(client.ws, { t: 'error', msg: '找不到你的座位' }); return; }
      p.connected = true; p.id = client.id; p.ws = client.ws;
      client.room = room; client.seat = p.seat;
      send(client.ws, { t: 'rejoinOk' });
      if (room.stage === 'game' || room.stage === 'over') broadcastView(room);
      sendRoom(room);
      sendStage(room);
      break;
    }
    case 'ai': {
      const room = client.room;
      if (!room || room.hostId !== client.id || room.stage !== 'lobby') return;
      const seat = parseInt(msg.seat, 10);
      if (!(seat >= 0 && seat < SEATS)) return;
      if ( msg.on && !room.players.some(p => p.seat === seat)) {
        room.players.push({ id: 'ai' + seat + '_' + Math.random().toString(36).slice(2, 6), token: null, name: 'AI·' + (seat + 1), seat, isAI: true, ready: true, connected: true, pref: [], pick: null, ws: null });
      } else if (!msg.on) {
        room.players = room.players.filter(p => !(p.seat === seat && p.isAI));
      }
      reseat(room);
      sendRoom(room);
      break;
    }
    case 'ready': {
      const room = client.room; if (!room) return;
      const p = findPlayer(room, client.id); if (!p) return;
      p.ready = !!msg.v;
      sendRoom(room);
      break;
    }
    case 'config': {
      // 预留：目前身份固定随机分配
      break;
    }
    case 'start': {
      const room = client.room;
      if (!room || room.hostId !== client.id || room.stage !== 'lobby') return;
      const humans = room.players.filter(p => !p.isAI);
      if (room.players.length < SEATS) { send(client.ws, { t: 'error', msg: '还缺 ' + (SEATS - room.players.length) + ' 个座位（可用 AI 补位）' }); return; }
      if (humans.some(p => !p.ready)) { send(client.ws, { t: 'error', msg: '还有玩家没有准备' }); return; }
      // 身份：随机分配
      resolveIdentity(room);
      break;
    }
    case 'pickChar': {
      const room = client.room; if (!room || room.stage !== 'draft') return;
      const p = findPlayer(room, client.id); if (!p) return;
      if (!D.CHAR_MAP[msg.charId]) return;
      p.pick = msg.charId;
      sendStage(room);
      checkDraft(room);
      break;
    }
    case 'act': {
      const room = client.room;
      if (!room || !room.game || room.stage !== 'game') return;
      const p = findPlayer(room, client.id);
      if (!p || p.isAI) return;
      const ask = room.game.pending;
      if (!ask || ask.seat !== p.seat) return;
      room.game.act(msg.resp || { type: 'pass' });
      room.lastActivity = Date.now();
      room.lastAction = Date.now();
      broadcastView(room);
      if (room.game.finished) {
        room.stage = 'over';
        sendStage(room, { winner: room.game.g.winner });
        broadcastView(room);
      } else scheduleAI(room);
      break;
    }
    case 'chat': {
      const room = client.room; if (!room) return;
      const p = findPlayer(room, client.id); if (!p) return;
      broadcastChat(room, p.name, sanitizeName(msg.text).slice(0, 80));
      break;
    }
    case 'again': {
      const room = client.room;
      if (!room || room.hostId !== client.id) return;
      resetRoom(room);
      break;
    }
    case 'leave': leaveRoom(client); break;
    case 'ping': send(client.ws, { t: 'pong' }); break;
  }
}

function AI_WISH(seat) {
  const wishes = [['producer', 'costar'], ['wrecker', 'wrecker'], ['soloist', 'producer'], ['wrecker', 'costar'], ['costar', 'wrecker']];
  return wishes[seat % 5][0];
}

function resetRoom(room) {
  room.stage = 'lobby';
  room.game = null;
  room.identityMap = null;
  room.identityChoices = null;
  room.players = room.players.filter(p => p.isAI ? true : p.connected);
  room.players.forEach(p => { p.ready = p.isAI; p.pick = null; p.pref = []; p.pickLocked = false; });
  reseat(room);
  if (room.timer) { clearTimeout(room.timer); room.timer = null; }
  sendRoom(room);
}

function leaveRoom(client) {
  const room = client.room;
  if (!room) return;
  const p = room.players.find(x => x.id === client.id);
  if (room.stage === 'lobby' && p) {
    room.players = room.players.filter(x => x !== p);
    if (room.hostId === client.id) {
      const next = room.players.find(x => !x.isAI);
      if (next) room.hostId = next.id;
    }
    client.room = null; client.seat = -1;
    if (!room.players.some(x => !x.isAI)) {
      if (room.timer) clearTimeout(room.timer);
      rooms.delete(room.code);
    } else sendRoom(room);
  } else if (p) {
    p.connected = false;
    client.room = null; client.seat = -1;
    sendRoom(room);
  }
}

function onClose(client) {
  if (client.closed) return;
  client.closed = true;
  clients.delete(client.ws);
  const room = client.room;
  if (!room) return;
  const p = room.players.find(x => x.id === client.id);
  if (!p) return;
  p.connected = false;
  if (room.stage === 'lobby') {
    leaveRoom(client);
  } else {
    sendRoom(room);
    // 人类玩家都掉线且没有 AI 推进时，收掉房间
    setTimeout(() => {
      if (!room.players.some(x => !x.isAI && x.connected) && room.stage !== 'over') {
        if (room.timer) clearTimeout(room.timer);
        rooms.delete(room.code);
      }
    }, 10 * 60 * 1000);
  }
}

/* ---------------- 启动 ---------------- */
server.listen(PORT, () => {
  console.log('');
  console.log('  ♪ 鸡狗杀 · 联机服务器已启动');
  console.log('  ♪ http://localhost:' + PORT);
  console.log('  ♪ 经典模式可离线游玩，联机模式需要保持此窗口开启');
  console.log('');
});

setInterval(() => {
  // 掉线托管：当前行动者离线超过 40 秒时由 AI 代打，避免整局卡死
  for (const room of rooms.values()) {
    if (room.stage !== 'game' || !room.game || room.game.finished) continue;
    const game = room.game;
    const ask = game.pending;
    if (!ask) continue;
    const p = room.players.find(x => x.seat === ask.seat);
    if (!p) continue;
    if (p.isAI) { if (!room.timer) scheduleAI(room); continue; }
    if (!p.connected && Date.now() - (room.lastAction || 0) > 40000) {
      console.log('[托管]', room.code, p.name);
      game.act(AI.respond(game, ask));
      room.lastAction = Date.now();
      broadcastView(room);
      if (game.finished) {
        room.stage = 'over';
        sendStage(room, { winner: game.g.winner });
        broadcastView(room);
      } else scheduleAI(room);
    }
  }
}, 4000);

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.timer === null && room.game && !room.game.finished) {
      const ask = room.game.pending;
      if (ask) {
        const p = room.game.g.players[ask.seat];
        if (p && p.isAI) scheduleAI(room);
      }
    }
  }
  // 心跳
  for (const [ws] of clients) {
    if (ws.writable) { try { sendFrame(ws, 0x9, Buffer.alloc(0)); } catch (e) { } }
  }
}, 25000);

process.on('SIGINT', () => { console.log('\n服务器已关闭'); process.exit(0); });
