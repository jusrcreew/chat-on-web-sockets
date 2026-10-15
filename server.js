const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;


const server = http.createServer((req, res) => {
  const file = path.join(__dirname, 'public', 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(500);
      return res.end('Ошибка чтения index.html');
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});


const wss = new WebSocketServer({ server });


const users = new Map();

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(obj, except = null) {
  for (const ws of users.keys()) {
    if (ws !== except) send(ws, obj);
  }
}

function userList() {
  return [...users.values()].map(u => ({ name: u.name, color: u.color }));
}

function broadcastUserList() {
  broadcast({ type: 'users', users: userList() });
}

function findByName(name) {
  for (const [ws, u] of users) if (u.name === name) return ws;
  return null;
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }


    if (msg.type === 'join') {
      if (users.has(ws)) return;

      const name = String(msg.name || '').trim().slice(0, 20);
      const color = /^#[0-9a-fA-F]{6}$/.test(msg.color) ? msg.color : '#000000';

      if (!name) {
        return send(ws, { type: 'error', text: 'Введите имя.' });
      }
      if (findByName(name)) {
        return send(ws, { type: 'error', text: 'Это имя уже занято.' });
      }

      const others = userList().map(u => u.name);
      users.set(ws, { name, color });

      send(ws, { type: 'joined', name });
      send(ws, {
        type: 'system',
        text: others.length
          ? `Добро пожаловать. В чате уже присутствуют: ${others.join(', ')}.`
          : 'Добро пожаловать. Вы первый в чате.',
      });
      broadcast({ type: 'system', text: `К нам присоединился ${name}.` }, ws);
      broadcastUserList();
      return;
    }


    const user = users.get(ws);
    if (!user) return;


    if (msg.type === 'message') {
      const text = String(msg.text || '').trim().slice(0, 1000);
      if (!text) return;

      if (msg.to) {
        const target = findByName(msg.to);
        if (!target) {
          return send(ws, { type: 'error', text: `Пользователь ${msg.to} не найден.` });
        }
        const payload = {
          type: 'message', name: user.name, color: user.color,
          text, private: true, to: msg.to,
        };
        send(target, payload);
        if (target !== ws) send(ws, payload); // отправитель тоже видит своё сообщение
      } else {
        broadcast({ type: 'message', name: user.name, color: user.color, text });
      }
    }
  });

  ws.on('close', () => {
    const user = users.get(ws);
    if (!user) return;
    users.delete(ws);
    broadcast({ type: 'system', text: `${user.name} нас покинул.` });
    broadcastUserList();
  });
});

server.listen(PORT, () => {
  console.log(`Чат запущен: http://localhost:${PORT}`);
});