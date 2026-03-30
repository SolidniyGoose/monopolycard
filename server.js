// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose(); // Подключаем базу данных!

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const __dirnameServer = __dirname; 
const CARDS_JSON_PATH = path.join(__dirnameServer, 'cards_data.json'); 
let cardsData = [];
try {
  cardsData = JSON.parse(fs.readFileSync(CARDS_JSON_PATH, 'utf8'));
  console.log('[server] Загружена колода:', cardsData.length, 'карт');
} catch (e) {
  console.warn('[server] Файл cards_data.json не найден!', CARDS_JSON_PATH);
}

// === ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ ===
const db = new sqlite3.Database(path.join(__dirnameServer, 'database.sqlite'));
db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, wins INTEGER DEFAULT 0, avatar TEXT)");
  // Аккуратно добавляем колонку avatar в уже существующую базу (ошибки игнорируем)
  db.run("ALTER TABLE users ADD COLUMN avatar TEXT", (err) => {}); 
  db.run("CREATE TABLE IF NOT EXISTS friends (user1 TEXT, user2 TEXT, status TEXT, PRIMARY KEY(user1, user2))");
});

const activeUsers = new Map(); 


// Функция для отправки личных данных (теперь с аватарками через JOIN)
function sendPersonalData(name) {
    const socketId = activeUsers.get(name);
    if (!socketId) return;

    db.all(`
        SELECT f.user1, f.user2, f.status, u1.avatar as avatar1, u2.avatar as avatar2 
        FROM friends f 
        LEFT JOIN users u1 ON f.user1 = u1.name 
        LEFT JOIN users u2 ON f.user2 = u2.name 
        WHERE f.user1 = ? OR f.user2 = ?
    `, [name, name], (err, rows) => {
        if (err) return;
        const friends = []; const incoming = []; const outgoing = [];

        rows.forEach(r => {
            const isUser1 = r.user1 === name;
            const friendName = isUser1 ? r.user2 : r.user1;
            const friendAvatar = isUser1 ? r.avatar2 : r.avatar1;
            const data = { name: friendName, avatar: friendAvatar };
            
            if (r.status === 'accepted') friends.push(data);
            else if (r.status === 'pending') {
                if (isUser1) outgoing.push(data);
                else incoming.push(data);
            }
        });
        io.to(socketId).emit('personal_update', { friends, incoming, outgoing });
    });
}

app.get('/cards_data.json', (req, res) => { res.json(cardsData); });
app.use(express.static(path.join(__dirnameServer, 'public')));

const games = new Map(); 

// --- ВЕРНУВШИЕСЯ ФУНКЦИИ-ПОМОЩНИКИ ---
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }
function generateId(prefix='id'){ return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6); }
function cardById(id){ return cardsData.find(c=>c.id === id); }


// --- ФУНКЦИИ ЛОББИ И БД ---
function broadcastLobby() {
  const activeRooms = [];
  for(const [id, game] of games.entries()) {
     activeRooms.push({ id, name: game.name, hasPassword: !!game.password, playersCount: Object.keys(game.players).length });
  }
  // Теперь берем и аватарку для Топ-10
  db.all("SELECT name, wins, avatar FROM users ORDER BY wins DESC LIMIT 10", (err, leaderboard) => {
     io.emit('lobby_update', { rooms: activeRooms, leaderboard: leaderboard || [] });
  });
}

function getOrCreateGame(room, roomName = 'Комната', password = ''){
  if(!games.has(room)){
    const g = {
      id: room, name: roomName, password: password, players: {}, deck: cardsData.map(c=>c.id).slice(), discard: [], turnOrder: [], turnIndex: 0, playsThisTurn: 0, pendingAction: null
    };
    shuffle(g.deck);
    games.set(room, g);
    broadcastLobby(); // Обновляем лобби для всех при создании комнаты
  }
  return games.get(room);
}

function sendGameState(room){
  const game = games.get(room);
  if(!game) return;
  for(const pid of Object.keys(game.players)){
    const p = game.players[pid];
    const playersSummary = {};
    for(const [id,pl] of Object.entries(game.players)){
      playersSummary[id] = { id, name: pl.name, bank: pl.bank.slice(), properties: pl.properties, handCount: pl.hand.length, connected: pl.connected, flags: pl.flags || {} };
    }
    playersSummary[pid].hand = game.players[pid].hand.slice();
    const st = {
      id: game.id, name: game.name, players: playersSummary, deckCount: game.deck.length, discardCount: game.discard.length, turnPlayerId: game.turnOrder[game.turnIndex] || null, playsThisTurn: game.playsThisTurn,
      pendingAction: game.pendingAction ? { id: game.pendingAction.id, type: game.pendingAction.type, actor: game.pendingAction.actor, status: (game.pendingAction.resolved ? 'resolved' : 'pending') } : null
    };
    io.to(p.socketId).emit('game_state', st);
  }
}

// --- ИГРОВАЯ МЕХАНИКА ---
function drawToPlayer(game, playerId, count){
  const drawn = [];
  for(let i=0;i<count;i++){
    if(game.deck.length === 0){ game.deck = game.discard.splice(0); shuffle(game.deck); }
    if(game.deck.length === 0) break;
    const c = game.deck.shift(); game.players[playerId].hand.push(c); drawn.push(c);
  }
  return drawn;
}

function removeFromHand(game, playerId, cardId){
  const idx = game.players[playerId].hand.indexOf(cardId);
  if(idx === -1) return false;
  game.players[playerId].hand.splice(idx,1); return true;
}

function processManualPayment(game, payerId, recipientId, cardIds) {
  const payer = game.players[payerId]; const recipient = game.players[recipientId];
  for (const cardId of cardIds) {
     let idx = payer.bank.indexOf(cardId);
     if (idx !== -1) { payer.bank.splice(idx, 1); recipient.bank.push(cardId); continue; }
     for (const color of Object.keys(payer.properties)) {
        idx = payer.properties[color].indexOf(cardId);
        if (idx !== -1) { payer.properties[color].splice(idx, 1); recipient.properties[color] = recipient.properties[color] || []; recipient.properties[color].push(cardId); break; }
     }
  }
}

function givePropertyTo(game, toId, cardId, chosenColor){
  const player = game.players[toId]; let color = chosenColor; const meta = cardById(cardId);
  if(!color){ color = (meta && meta.colors && meta.colors.length>0) ? meta.colors[0] : 'unassigned'; }
  player.properties[color] = player.properties[color] || []; player.properties[color].push(cardId);
}

function removePropertyFromOwner(game, ownerId, cardId){
  const owner = game.players[ownerId]; if(!owner) return false;
  for(const [color,arr] of Object.entries(owner.properties)){
    const idx = arr.indexOf(cardId); if(idx !== -1){ arr.splice(idx,1); return true; }
  }
  return false;
}

// === SOCKET.IO ===
io.on('connection', socket => {
  // Запрос данных лобби (при входе на сайт)
  socket.on('req_lobby', () => { broadcastLobby(); });

  // Регистрация / Логин
  // Регистрация / Логин
  socket.on('login', (name, cb) => {
    db.run("INSERT OR IGNORE INTO users (name) VALUES (?)", [name], () => {
       db.get("SELECT avatar FROM users WHERE name = ?", [name], (err, row) => {
           activeUsers.set(name, socket.id); 
           cb({ ok: true, name, avatar: row ? row.avatar : null });
           sendPersonalData(name); 
       });
    });
  });

  // --- СИСТЕМА ДРУЗЕЙ ---
  socket.on('send_friend_request', ({ from, to }, cb) => {
      if (from === to) return cb({ error: 'Нельзя добавить самого себя!' });
      db.get("SELECT name FROM users WHERE name = ?", [to], (err, row) => {
          if (!row) return cb({ error: 'Игрок с таким ником не найден!' });
          
          db.get("SELECT status FROM friends WHERE (user1=? AND user2=?) OR (user1=? AND user2=?)", [from, to, to, from], (err, existing) => {
              if (existing) return cb({ error: 'Запрос уже отправлен или вы уже друзья!' });
              
              db.run("INSERT INTO friends (user1, user2, status) VALUES (?, ?, 'pending')", [from, to], () => {
                  sendPersonalData(from);
                  if (activeUsers.has(to)) sendPersonalData(to); // Если друг онлайн, уведомляем его мгновенно
                  cb({ ok: true });
              });
          });
      });
  });

  socket.on('resolve_friend_request', ({ from, to, action }) => {
      // to - это тот, кому пришел запрос (текущий игрок), from - кто отправил
      if (action === 'accept') {
          db.run("UPDATE friends SET status = 'accepted' WHERE user1 = ? AND user2 = ?", [from, to], () => {
              sendPersonalData(from); sendPersonalData(to);
          });
      } else if (action === 'reject' || action === 'remove') {
          db.run("DELETE FROM friends WHERE (user1 = ? AND user2 = ?) OR (user1 = ? AND user2 = ?)", [from, to, to, from], () => {
              sendPersonalData(from); sendPersonalData(to);
          });
      }
  });

  // Обработка отключения из лобби (чтобы не слать запросы в пустоту)
    // ... остальной код disconnect для игр оставляем без изменений ...
  // Смена имени
  socket.on('change_name', ({ oldName, newName }, cb) => {
    if (!newName || newName.trim() === '') return cb({ error: 'Имя не может быть пустым' });
    db.get("SELECT name FROM users WHERE name = ?", [newName], (err, row) => {
        if (row) return cb({ error: 'Это имя уже занято кем-то другим!' });
        db.run("UPDATE users SET name = ? WHERE name = ?", [newName, oldName], (err) => {
            if (err) return cb({ error: 'Ошибка базы данных' });
            for (const [roomId, game] of games.entries()) {
                for (const pid of Object.keys(game.players)) {
                    if (game.players[pid].name === oldName) { game.players[pid].name = newName; sendGameState(roomId); }
                }
            }
            broadcastLobby(); cb({ ok: true });
        });
    });
  });

  socket.on('change_avatar', ({ name, avatarBase64 }, cb) => {
      db.run("UPDATE users SET avatar = ? WHERE name = ?", [avatarBase64, name], (err) => {
          if (err) return cb({ error: 'Ошибка сохранения картинки' });
          broadcastLobby();
          sendPersonalData(name);
          cb({ ok: true });
      });
  });

  // Создание комнаты
  socket.on('create_room', ({ roomName, password }, cb) => {
    const roomId = generateId('r');
    getOrCreateGame(roomId, roomName, password);
    cb({ ok: true, roomId });
  });

  // Вход в комнату
  socket.on('join_room', ({ room, password, name, playerId }, cb) => {
    const game = games.get(room);
    if (!game) return cb && cb({ error: 'Комната не найдена или удалена' });

    // Проверка пароля (только для новых подключений)
    if (game.password && !playerId && game.password !== password) {
       return cb && cb({ error: 'Неверный пароль!' });
    }

    let pid = playerId;
    if (pid && game.players[pid]) {
      game.players[pid].socketId = socket.id; game.players[pid].connected = true; game.players[pid].name = name || game.players[pid].name;
      socket.join(room); sendGameState(room); broadcastLobby();
      return cb && cb({ ok: true, playerId: pid });
    } else if (pid) {
      return cb && cb({ error: 'session_not_found' });
    }

    pid = generateId('p');
    game.players[pid] = { id: pid, name: name, socketId: socket.id, hand: [], bank: [], properties: {}, flags: {}, connected: true };
    game.turnOrder.push(pid);
    socket.join(room); sendGameState(room); broadcastLobby();
    if(cb) cb({ ok: true, playerId: pid });
  });

  // Выход из комнаты
  // Выход из комнаты (Полный сброс игрока)
  socket.on('leave_room', ({ room, playerId }) => {
     const game = games.get(room);
     if (game && game.players[playerId]) {
         socket.leave(room);
         
         // 1. Скидываем все карты игрока в мусорку (Сброс)
         const p = game.players[playerId];
         if (p.hand.length > 0) game.discard.push(...p.hand);
         if (p.bank.length > 0) game.discard.push(...p.bank);
         for (const color in p.properties) {
             game.discard.push(...p.properties[color]);
         }
         
         // 2. Удаляем игрока из памяти комнаты
         delete game.players[playerId];
         
         // 3. Корректируем очередь хода
         const tIdx = game.turnOrder.indexOf(playerId);
         if (tIdx !== -1) {
             game.turnOrder.splice(tIdx, 1);
             // Если сейчас был ход вышедшего игрока, передаем ход следующему
             if (game.turnIndex === tIdx) {
                 game.playsThisTurn = 0;
                 if (game.turnIndex >= game.turnOrder.length) game.turnIndex = 0;
             } else if (game.turnIndex > tIdx) {
                 game.turnIndex--;
             }
         }

         // Если все отключились - удаляем комнату
         const anyConnected = Object.values(game.players).some(pl => pl.connected);
         if (!anyConnected) games.delete(room);
         else sendGameState(room); // Обновляем стол для оставшихся
         
         broadcastLobby();
     }
  });

  // Победа (Запись в БД)
  socket.on('player_won', ({ room, playerName }) => {
      db.run("UPDATE users SET wins = wins + 1 WHERE name = ?", [playerName], () => {
          broadcastLobby(); // Обновляем таблицу лидеров
      });
  });

  socket.on('start_game', ({ room }, cb)=>{
    const game = games.get(room); if(!game) return cb && cb({ error: 'no_game' });
    game.deck = cardsData.map(c=>c.id).slice(); shuffle(game.deck); game.discard = [];
    for(const pid of game.turnOrder){ game.players[pid].hand = []; drawToPlayer(game, pid, 5); }
    game.turnIndex = 0; game.playsThisTurn = 0; game.pendingAction = null;
    sendGameState(room); if(cb) cb({ ok: true });
  });

  socket.on('intent_draw', ({ room, playerId, count=1 }, cb)=>{
    const game = games.get(room); if(!game) return;
    if(game.turnOrder[game.turnIndex] !== playerId) return;
    drawToPlayer(game, playerId, count); sendGameState(room); if(cb) cb({ ok:true });
  });

  socket.on('intent_discard', ({ room, playerId, cardId }, cb)=>{
    const game = games.get(room); if(!game) return;
    if(game.turnOrder[game.turnIndex] !== playerId) return;
    const ok = removeFromHand(game, playerId, cardId); if(!ok) return;
    game.discard.push(cardId); sendGameState(room); if(cb) cb({ ok:true });
  });

  socket.on('intent_move_to_bank', ({ room, playerId, cardId }, cb)=>{
    const game = games.get(room); if(!game) return;
    if(game.turnOrder[game.turnIndex] !== playerId || game.playsThisTurn >= 3) return;
    const ok = removeFromHand(game, playerId, cardId); if(!ok) return;
    game.players[playerId].bank.push(cardId); game.playsThisTurn++;
    sendGameState(room); if(cb) cb({ ok:true });
  });

  socket.on('play_property', ({ room, playerId, cardId, chosenColor }, cb)=>{
    const game = games.get(room); if(!game) return;
    if(game.turnOrder[game.turnIndex] !== playerId || game.playsThisTurn >= 3) return;
    const ok = removeFromHand(game, playerId, cardId); if(!ok) return;
    const meta = cardById(cardId); let assignColor = chosenColor || (meta.colors ? meta.colors[0] : 'unassigned');
    givePropertyTo(game, playerId, cardId, assignColor); game.playsThisTurn++;
    sendGameState(room); if(cb) cb({ ok:true });
  });

  socket.on('play_action', ({ room, playerId, cardId, opts }, cb)=>{
    const game = games.get(room); if(!game) return;
    if(game.turnOrder[game.turnIndex] !== playerId || game.playsThisTurn >= 3) return;
    const meta = cardById(cardId); if(!meta) return;
    const ok = removeFromHand(game, playerId, cardId); if(!ok) return;
    const t = meta.action_type || meta.type;
    const finishPlay = () => { game.discard.push(cardId); game.playsThisTurn++; };

    if(t === 'pass_go'){ drawToPlayer(game, playerId, 2); finishPlay(); sendGameState(room); return cb && cb({ ok:true }); }
    if(t === 'house' || t === 'hotel'){
      const marker = (t === 'house') ? `HOUSE_${cardId}` : `HOTEL_${cardId}`;
      game.players[playerId].properties[opts.color] = game.players[playerId].properties[opts.color] || [];
      game.players[playerId].properties[opts.color].push(marker); finishPlay(); sendGameState(room); return cb && cb({ ok:true });
    }

    // Обработка Атак
    let targets = []; let amount = 0;
    if(t === 'debt_collector'){ targets = opts.target ? [opts.target] : Object.keys(game.players).filter(id=>id!==playerId); amount = 5; }
    if(t === 'birthday'){ targets = Object.keys(game.players).filter(id=>id!==playerId); amount = 2; }
    if(t === 'rent' || t === 'double_the_rent'){
      targets = opts.targets ? opts.targets : Object.keys(game.players).filter(id=>id!==playerId);
      const chosenColors = (meta.colors && meta.colors.includes('any')) || t === 'double_the_rent' ? [opts.color] : (meta.colors || []);
      for(const c of chosenColors) {
          const set = game.players[playerId].properties[c] || [];
          const setCount = set.filter(x=> typeof x === 'string' && !x.startsWith('HOUSE_') && !x.startsWith('HOTEL_')).length;
          const metaEx = cardsData.find(card => card.type === 'property' && card.colors && card.colors.includes(c));
          if(metaEx && metaEx.rent_values && setCount > 0){
             amount += metaEx.rent_values[Math.min(setCount, metaEx.set_size) - 1] || 0;
             if (set.some(x=> typeof x === 'string' && x.startsWith('HOUSE_')) && setCount >= metaEx.set_size) amount += 3;
             if (set.some(x=> typeof x === 'string' && x.startsWith('HOTEL_')) && setCount >= metaEx.set_size) amount += 4;
          }
      }
      if (amount === 0 && meta.bank_value) amount = 1;
      if (t === 'double_the_rent') amount *= 2;
    }
    if(t === 'sly_deal' || t === 'forced_deal' || t === 'deal_breaker') targets = [opts.target];

    const pa = { id: generateId('pa'), type: t, actor: playerId, targets, payload: { cardId, ...opts, amount }, responses: {}, resolved:false };
    for(const tpid of targets) pa.responses[tpid] = { state: 'pending_target', paymentCards: [] };
    game.pendingAction = pa;
    for(const tpid of targets) io.to(game.players[tpid].socketId).emit('action_request', { id: pa.id, type: pa.type, from: playerId, amount: amount, payload: pa.payload });
    
    sendGameState(room); if(cb) cb({ ok:true, pending: pa.id });
  });

  socket.on('respond_action', ({ room, playerId, pendingId, action, playedJustSayNoCardId, paymentCards, targetId }, cb)=>{
    const game = games.get(room); if(!game || !game.pendingAction || game.pendingAction.id !== pendingId) return;
    const pa = game.pendingAction;
    
    if(action === 'decline' && playedJustSayNoCardId){
      const ok = removeFromHand(game, playerId, playedJustSayNoCardId); if(!ok) return;
      game.discard.push(playedJustSayNoCardId);
      if (playerId === pa.actor) {
         pa.responses[targetId].state = 'pending_target';
         io.to(game.players[targetId].socketId).emit('action_request', { id: pa.id, type: pa.type, from: playerId, amount: pa.payload.amount || 0, payload: pa.payload, counterNo: true });
      } else {
         pa.responses[playerId].state = 'pending_actor';
         io.to(game.players[pa.actor].socketId).emit('counter_request', { id: pa.id, type: pa.type, targetId: playerId, fromName: game.players[playerId].name });
      }
      sendGameState(room); return cb && cb({ ok:true });
    }

    if (action === 'accept') {
       if (playerId === pa.actor) { pa.responses[targetId].state = 'cancelled'; } 
       else { pa.responses[playerId].state = 'accepted'; pa.responses[playerId].paymentCards = paymentCards || []; }
       attemptResolvePendingAction(game, room); return cb && cb({ ok:true });
    }
  });

  socket.on('flip_property', ({ room, playerId, cardId, newColor }, cb)=>{
    const game = games.get(room);
    for(const color of Object.keys(game.players[playerId].properties)){
      const idx = game.players[playerId].properties[color].indexOf(cardId);
      if(idx !== -1){ game.players[playerId].properties[color].splice(idx, 1); break; }
    }
    game.players[playerId].properties[newColor] = game.players[playerId].properties[newColor] || [];
    game.players[playerId].properties[newColor].push(cardId); sendGameState(room); if(cb) cb({ ok:true });
  });

  socket.on('intent_end_turn', ({ room, playerId }, cb)=>{
    const game = games.get(room); game.playsThisTurn = 0; game.turnIndex = (game.turnIndex + 1) % game.turnOrder.length;
    sendGameState(room); if(cb) cb({ ok:true });
  });

  // --- ЧАТ ---
  socket.on('send_chat_message', ({ room, playerId, message }) => {
    const game = games.get(room);
    if (!game || !game.players[playerId]) return;
    
    // Рассылаем сообщение всем в комнате
    io.to(room).emit('chat_message', { 
        sender: game.players[playerId].name, 
        text: message 
    });
  });
  
  socket.on('disconnect', ()=>{
    // 1. Очистка для системы друзей (убираем из онлайна)
    for (let [name, sId] of activeUsers.entries()) {
        if (sId === socket.id) activeUsers.delete(name);
    }

    // 2. Очистка для игрового стола (помечаем как отключенного)
    for(const [room, game] of games.entries()){
      for(const pid of Object.keys(game.players)){
        if(game.players[pid].socketId === socket.id){
          game.players[pid].connected = false; sendGameState(room);
        }
      }
    }
    broadcastLobby();
  });
});

function attemptResolvePendingAction(game, room){
  const pa = game.pendingAction; if(!pa) return;
  const allResolved = Object.values(pa.responses).every(r => r.state === 'accepted' || r.state === 'cancelled');
  if(!allResolved) return;

  let executed = false;
  if(pa.type === 'debt_collector' || pa.type === 'birthday' || pa.type === 'rent'){
    for(const t of pa.targets){
      if (pa.responses[t].state === 'accepted') { executed = true; if (pa.responses[t].paymentCards) processManualPayment(game, t, pa.actor, pa.responses[t].paymentCards); }
    }
  } else if(pa.type === 'sly_deal' && pa.responses[pa.targets[0]].state === 'accepted'){
    executed = true; const removed = removePropertyFromOwner(game, pa.targets[0], pa.payload.targetCardId);
    if(removed){ const meta = cardById(pa.payload.targetCardId); givePropertyTo(game, pa.actor, pa.payload.targetCardId, (meta.colors ? meta.colors[0] : 'unassigned')); }
  } else if(pa.type === 'forced_deal' && pa.responses[pa.targets[0]].state === 'accepted'){
    executed = true; const removedMine = removePropertyFromOwner(game, pa.actor, pa.payload.myCardId); const removedTheirs = removePropertyFromOwner(game, pa.targets[0], pa.payload.theirCardId);
    if(removedMine) givePropertyTo(game, pa.targets[0], pa.payload.myCardId); if(removedTheirs) givePropertyTo(game, pa.actor, pa.payload.theirCardId);
  } else if(pa.type === 'deal_breaker' && pa.responses[pa.targets[0]].state === 'accepted'){
    executed = true; const set = game.players[pa.targets[0]].properties[pa.payload.color] || [];
    if(set.length>0){ game.players[pa.actor].properties[pa.payload.color] = (game.players[pa.actor].properties[pa.payload.color] || []).concat(set); game.players[pa.targets[0]].properties[pa.payload.color] = []; }
  }

  if(pa.payload && pa.payload.cardId) game.discard.push(pa.payload.cardId);
  pa.resolved = true; io.to(room).emit('action_resolved', { id: pa.id, type: pa.type, executed: executed });
  game.pendingAction = null; sendGameState(room);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', ()=> console.log(`[server] listening on 0.0.0.0:${PORT}`));