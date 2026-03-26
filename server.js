// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const __dirnameServer = __dirname; 
const CARDS_JSON_PATH = path.join(__dirnameServer, 'cards_data.json'); 
let cardsData = [];
try {
  cardsData = JSON.parse(fs.readFileSync(CARDS_JSON_PATH, 'utf8'));
  console.log('[server] loaded cards_data.json', cardsData.length, 'cards');
} catch (e) {
  console.warn('[server] cards_data.json not found at', CARDS_JSON_PATH);
  cardsData = [];
}

app.use(express.static(path.join(__dirnameServer, 'public')));

const games = new Map();

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }
function generateId(prefix='id'){ return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6); }
function cardById(id){ return cardsData.find(c=>c.id === id); }
function cardValue(cardId){ const c = cardById(cardId); if(!c) return 0; if(c.type === 'money') return c.value || 0; return c.bank_value || 0; }

function getOrCreateGame(room){
  if(!games.has(room)){
    const g = {
      id: room, players: {}, deck: cardsData.map(c=>c.id).slice(), discard: [], turnOrder: [], turnIndex: 0, playsThisTurn: 0, pendingAction: null
    };
    shuffle(g.deck);
    games.set(room, g);
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
      id: game.id, players: playersSummary, deckCount: game.deck.length, discardCount: game.discard.length, turnPlayerId: game.turnOrder[game.turnIndex] || null, playsThisTurn: game.playsThisTurn,
      pendingAction: game.pendingAction ? { id: game.pendingAction.id, type: game.pendingAction.type, actor: game.pendingAction.actor, status: (game.pendingAction.resolved ? 'resolved' : 'pending') } : null
    };
    io.to(p.socketId).emit('game_state', st);
  }
}

function drawToPlayer(game, playerId, count){
  const drawn = [];
  for(let i=0;i<count;i++){
    if(game.deck.length === 0){ game.deck = game.discard.splice(0); shuffle(game.deck); }
    if(game.deck.length === 0) break;
    const c = game.deck.shift();
    game.players[playerId].hand.push(c);
    drawn.push(c);
  }
  return drawn;
}

function removeFromHand(game, playerId, cardId){
  const idx = game.players[playerId].hand.indexOf(cardId);
  if(idx === -1) return false;
  game.players[playerId].hand.splice(idx,1);
  return true;
}

function processManualPayment(game, payerId, recipientId, cardIds) {
  const payer = game.players[payerId];
  const recipient = game.players[recipientId];

  for (const cardId of cardIds) {
     let idx = payer.bank.indexOf(cardId);
     if (idx !== -1) {
        payer.bank.splice(idx, 1);
        recipient.bank.push(cardId);
        continue;
     }
     for (const color of Object.keys(payer.properties)) {
        idx = payer.properties[color].indexOf(cardId);
        if (idx !== -1) {
           payer.properties[color].splice(idx, 1);
           recipient.properties[color] = recipient.properties[color] || [];
           recipient.properties[color].push(cardId);
           break;
        }
     }
  }
}

function givePropertyTo(game, toId, cardId, chosenColor){
  const player = game.players[toId];
  let color = chosenColor;
  const meta = cardById(cardId);
  if(!color){
    if(meta && meta.colors && meta.colors.length>0) color = meta.colors[0];
    else color = 'unassigned';
  }
  player.properties[color] = player.properties[color] || [];
  player.properties[color].push(cardId);
}

function removePropertyFromOwner(game, ownerId, cardId){
  const owner = game.players[ownerId];
  if(!owner) return false;
  for(const [color,arr] of Object.entries(owner.properties)){
    const idx = arr.indexOf(cardId);
    if(idx !== -1){ arr.splice(idx,1); return true; }
  }
  return false;
}

io.on('connection', socket=>{
  socket.on('join_room', ({ room='default', name='Player' }, cb)=>{
    const game = getOrCreateGame(room);
    const pid = socket.id;
    game.players[pid] = game.players[pid] || { id: pid, name: name || 'Player', socketId: socket.id, hand: [], bank: [], properties: {}, flags: { doubleNextRent: false }, connected: true };
    if(!game.turnOrder.includes(pid)) game.turnOrder.push(pid);
    socket.join(room);
    sendGameState(room);
    if(cb) cb({ ok: true, playerId: pid });
  });

  socket.on('start_game', ({ room }, cb)=>{
    const game = games.get(room);
    if(!game) return cb && cb({ error: 'no_game' });
    game.deck = cardsData.map(c=>c.id).slice();
    shuffle(game.deck);
    game.discard = [];
    for(const pid of game.turnOrder){ game.players[pid].hand = []; drawToPlayer(game, pid, 5); }
    game.turnIndex = 0; game.playsThisTurn = 0; game.pendingAction = null;
    sendGameState(room);
    if(cb) cb({ ok: true });
  });

  socket.on('intent_draw', ({ room, playerId, count=1 }, cb)=>{
    const game = games.get(room);
    if(!game) return cb && cb({ error: 'no_game' });
    if(game.turnOrder[game.turnIndex] !== playerId) return cb && cb({ error: 'not_your_turn' });
    const drawn = drawToPlayer(game, playerId, count);
    sendGameState(room);
    if(cb) cb({ ok:true, drawn });
  });

  socket.on('intent_move_to_bank', ({ room, playerId, cardId }, cb)=>{
    const game = games.get(room);
    if(!game) return cb && cb({ error: 'no_game' });
    if(game.turnOrder[game.turnIndex] !== playerId) return cb && cb({ error: 'not_your_turn' });
    if(game.playsThisTurn >= 3) return cb && cb({ error: 'max_plays' });

    const ok = removeFromHand(game, playerId, cardId);
    if(!ok) return cb && cb({ error: 'card_not_in_hand' });
    game.players[playerId].bank.push(cardId);
    game.playsThisTurn++;
    sendGameState(room);
    if(cb) cb({ ok:true });
  });

  socket.on('play_property', ({ room, playerId, cardId, chosenColor }, cb)=>{
    const game = games.get(room);
    if(!game) return cb && cb({ error:'no_game' });
    if(game.turnOrder[game.turnIndex] !== playerId) return cb && cb({ error: 'not_your_turn' });
    if(game.playsThisTurn >= 3) return cb && cb({ error: 'max_plays' });

    const ok = removeFromHand(game, playerId, cardId);
    if(!ok) return cb && cb({ error: 'card_not_in_hand' });

    const meta = cardById(cardId);
    let assignColor = chosenColor;
    if(meta && meta.type === 'property_wild'){
      if(!assignColor) return cb && cb({ error: 'choose_color_for_wild' });
    } else if(meta && meta.type === 'property'){
      assignColor = meta.colors && meta.colors[0];
    }
    givePropertyTo(game, playerId, cardId, assignColor);
    game.playsThisTurn++;
    sendGameState(room);
    if(cb) cb({ ok:true });
  });

  socket.on('play_action', ({ room, playerId, cardId, opts }, cb)=>{
    const game = games.get(room);
    if(!game) return cb && cb({ error:'no_game' });
    if(game.turnOrder[game.turnIndex] !== playerId) return cb && cb({ error: 'not_your_turn' });
    if(game.playsThisTurn >= 3) return cb && cb({ error: 'max_plays' });

    const meta = cardById(cardId);
    // ИСПРАВЛЕНИЕ: Разрешаем и действия (action), и карты ренты (rent)
    if(!meta || (meta.type !== 'action' && meta.type !== 'rent')) return cb && cb({ error: 'not_action_card' });

    const ok = removeFromHand(game, playerId, cardId);
    if(!ok) return cb && cb({ error: 'card_not_in_hand' });

    const t = meta.action_type || meta.type;
    const finishPlay = () => { game.discard.push(cardId); game.playsThisTurn++; };

    if(t === 'pass_go'){
      drawToPlayer(game, playerId, 2);
      finishPlay(); sendGameState(room);
      return cb && cb({ ok:true, action:'pass_go' });
    }

    if(t === 'debt_collector'){
      const target = opts && opts.target;
      const targets = target ? [target] : Object.keys(game.players).filter(id=>id !== playerId);
      const pa = { id: generateId('pa'), type: 'debt_collector', actor: playerId, targets, payload: { amount: 5, cardId }, responses: {}, resolved: false };
      for(const tpid of targets) pa.responses[tpid] = { responded:false, playedNo:false };
      game.pendingAction = pa;
      for(const tpid of targets){
        io.to(game.players[tpid].socketId).emit('action_request', { id: pa.id, type: pa.type, from: playerId, amount: 5, payload: pa.payload });
      }
      sendGameState(room);
      return cb && cb({ ok:true, pending: pa.id });
    }

    // ИСПРАВЛЕНИЕ: Обычная рента и Двойная рента теперь обрабатываются одним мощным блоком
    if(t === 'rent' || t === 'double_the_rent'){
      const color = opts && opts.color;
      const targets = opts && opts.targets ? opts.targets : Object.keys(game.players).filter(id=>id!==playerId);
      const actor = game.players[playerId];
      
      // Если это универсальная (any) рента ИЛИ Двойная рента, берем цвет из opts, иначе берем из самой карты
      const chosenColors = (meta.colors && meta.colors.includes('any')) || t === 'double_the_rent' ? [color] : (meta.colors || []);
      
      let baseAmount = 0;
      for(const c of chosenColors) {
          const set = actor.properties[c] || [];
          const setCount = set.filter(x=> typeof x === 'string' && !x.startsWith('HOUSE_') && !x.startsWith('HOTEL_')).length;
          const hasHouse = set.some(x=> typeof x === 'string' && x.startsWith('HOUSE_'));
          const hasHotel = set.some(x=> typeof x === 'string' && x.startsWith('HOTEL_'));

          const metaExample = cardsData.find(card => card.type === 'property' && card.colors && card.colors.includes(c));
          if(metaExample && metaExample.rent_values && setCount > 0){
             let rent = metaExample.rent_values[Math.min(setCount, metaExample.set_size) - 1] || 0;
             if (hasHouse && setCount >= metaExample.set_size) rent += 3;
             if (hasHotel && setCount >= metaExample.set_size) rent += 4;
             baseAmount += rent;
          }
      }
      if (baseAmount === 0 && meta.bank_value) baseAmount = 1;
      
      // Магия Двойной Ренты:
      if (t === 'double_the_rent') baseAmount *= 2;

      const pa = { id: generateId('pa'), type: 'rent', actor: playerId, targets, payload: { cardId, colors: chosenColors, amount: baseAmount }, responses: {}, resolved:false };
      for(const tpid of targets) pa.responses[tpid] = { responded:false, playedNo:false };
      game.pendingAction = pa;
      for(const tpid of targets){
        io.to(game.players[tpid].socketId).emit('action_request', { id: pa.id, type: pa.type, from: playerId, amount: baseAmount, payload: pa.payload });
      }
      sendGameState(room);
      return cb && cb({ ok:true, pending: pa.id });
    }

    if(t === 'sly_deal'){
      const target = opts && opts.target; const targetCardId = opts && opts.targetCardId;
      const pa = { id: generateId('pa'), type: 'sly_deal', actor: playerId, targets: [target], payload: { cardId, targetCardId }, responses: {}, resolved:false };
      pa.responses[target] = { responded:false, playedNo:false };
      game.pendingAction = pa;
      io.to(game.players[target].socketId).emit('action_request', { id: pa.id, type: pa.type, from: playerId, payload: pa.payload });
      sendGameState(room);
      return cb && cb({ ok:true, pending: pa.id });
    }

    if(t === 'forced_deal'){
      const target = opts && opts.target; const myCardId = opts && opts.myCardId; const theirCardId = opts && opts.theirCardId;
      const pa = { id: generateId('pa'), type: 'forced_deal', actor: playerId, targets: [target], payload: { cardId, myCardId, theirCardId }, responses: {}, resolved:false };
      pa.responses[target] = { responded:false, playedNo:false };
      game.pendingAction = pa;
      io.to(game.players[target].socketId).emit('action_request', { id: pa.id, type: pa.type, from: playerId, payload: pa.payload });
      sendGameState(room);
      return cb && cb({ ok:true, pending: pa.id });
    }

    if(t === 'deal_breaker'){
      const target = opts && opts.target; const color = opts && opts.color; 
      const pa = { id: generateId('pa'), type: 'deal_breaker', actor: playerId, targets: [target], payload: { cardId, color }, responses: {}, resolved:false };
      pa.responses[target] = { responded:false, playedNo:false };
      game.pendingAction = pa;
      io.to(game.players[target].socketId).emit('action_request', { id: pa.id, type: pa.type, from: playerId, payload: pa.payload });
      sendGameState(room);
      return cb && cb({ ok:true, pending: pa.id });
    }

    if(t === 'just_say_no'){
      const pa = game.pendingAction;
      let used = false;
      if(pa && pa.targets.includes(playerId)){
        pa.responses[playerId] = pa.responses[playerId] || {};
        pa.responses[playerId].playedNo = true;
        pa.responses[playerId].responded = true;
        used = true;
      }
      game.discard.push(cardId);
      game.playsThisTurn++;
      attemptResolvePendingAction(game, room);
      sendGameState(room);
      return cb && cb({ ok:true, usedNo: used });
    }

    if(t === 'house' || t === 'hotel'){
      const color = opts && opts.color;
      const marker = (t === 'house') ? `HOUSE_${cardId}` : `HOTEL_${cardId}`;
      game.players[playerId].properties[color] = game.players[playerId].properties[color] || [];
      game.players[playerId].properties[color].push(marker);
      finishPlay();
      sendGameState(room);
      return cb && cb({ ok:true });
    }

    if(t === 'birthday'){
      const targets = Object.keys(game.players).filter(id => id !== playerId);
      const pa = { id: generateId('pa'), type: 'birthday', actor: playerId, targets, payload: { amount: 2, cardId }, responses: {}, resolved:false };
      for(const tpid of targets) pa.responses[tpid] = { responded:false, playedNo:false };
      game.pendingAction = pa;
      for(const tpid of targets){
        io.to(game.players[tpid].socketId).emit('action_request', { id: pa.id, type: pa.type, from: playerId, amount: 2, payload: pa.payload });
      }
      sendGameState(room);
      return cb && cb({ ok:true, pending: pa.id });
    }

    finishPlay();
    sendGameState(room);
    return cb && cb({ ok:true });
  });

  socket.on('respond_action', ({ room, playerId, pendingId, action, playedJustSayNoCardId, paymentCards }, cb)=>{
    const game = games.get(room);
    if(!game || !game.pendingAction) return cb && cb({ error:'no_pending' });
    const pa = game.pendingAction;
    
    if(playedJustSayNoCardId){
      const ok = removeFromHand(game, playerId, playedJustSayNoCardId);
      if(!ok) return cb && cb({ error:'no_card_not_in_hand' });
      game.discard.push(playedJustSayNoCardId);
      pa.responses[playerId].playedNo = true;
      pa.responses[playerId].responded = true;
      attemptResolvePendingAction(game, room);
      return cb && cb({ ok:true, playedNo:true });
    }

    pa.responses[playerId].responded = true;
    pa.responses[playerId].accept = (action === 'accept');
    pa.responses[playerId].paymentCards = paymentCards || [];
    attemptResolvePendingAction(game, room);
    return cb && cb({ ok:true });
  });

  socket.on('flip_property', ({ room, playerId, cardId, newColor }, cb)=>{
    const game = games.get(room);
    let foundColor = null;
    for(const color of Object.keys(game.players[playerId].properties)){
      const idx = game.players[playerId].properties[color].indexOf(cardId);
      if(idx !== -1){
        game.players[playerId].properties[color].splice(idx, 1);
        foundColor = color; break;
      }
    }
    game.players[playerId].properties[newColor] = game.players[playerId].properties[newColor] || [];
    game.players[playerId].properties[newColor].push(cardId);
    sendGameState(room);
    if(cb) cb({ ok:true });
  });

  socket.on('intent_end_turn', ({ room, playerId }, cb)=>{
    const game = games.get(room);
    game.playsThisTurn = 0;
    game.turnIndex = (game.turnIndex + 1) % game.turnOrder.length;
    sendGameState(room);
    if(cb) cb({ ok:true });
  });
  
  socket.on('disconnect', ()=>{
    for(const [room, game] of games.entries()){
      if(game.players[socket.id]){ game.players[socket.id].connected = false; sendGameState(room); }
    }
  });
});

function attemptResolvePendingAction(game, room){
  const pa = game.pendingAction;
  if(!pa) return;
  
  const anyNo = Object.values(pa.responses).some(r=>r.playedNo);
  if(anyNo){
    if(pa.payload && pa.payload.cardId) game.discard.push(pa.payload.cardId);
    pa.resolved = true;
    for(const pid of Object.keys(game.players)) io.to(game.players[pid].socketId).emit('action_resolved', { id: pa.id, type: pa.type, result: 'cancelled_by_no' });
    game.pendingAction = null;
    sendGameState(room);
    return;
  }

  const allResponded = Object.values(pa.responses).every(r => r.responded === true);
  if(!allResponded) return;

  if(pa.type === 'debt_collector' || pa.type === 'birthday' || pa.type === 'rent'){
    for(const t of pa.targets){
      const resp = pa.responses[t];
      if (resp && resp.paymentCards && resp.paymentCards.length > 0) {
          processManualPayment(game, t, pa.actor, resp.paymentCards);
      }
    }
    if(pa.payload.cardId) game.discard.push(pa.payload.cardId);
    pa.resolved = true;
    for(const pid of Object.keys(game.players)) io.to(game.players[pid].socketId).emit('action_resolved', { id: pa.id, type: pa.type, result: 'collected' });
    game.pendingAction = null;
    sendGameState(room);
    return;
  }

  if(pa.type === 'sly_deal'){
    const target = pa.targets[0]; const victimCard = pa.payload.targetCardId;
    const removed = removePropertyFromOwner(game, target, victimCard);
    if(removed){ const meta = cardById(victimCard); const color = (meta && meta.colors && meta.colors[0]) || 'unassigned'; givePropertyTo(game, pa.actor, victimCard, color); }
    if(pa.payload.cardId) game.discard.push(pa.payload.cardId);
    pa.resolved = true;
    io.to(room).emit('action_resolved', { id: pa.id, type: pa.type, result: removed ? 'stolen' : 'not_found' });
    game.pendingAction = null;
    sendGameState(room);
    return;
  }

  if(pa.type === 'forced_deal'){
    const target = pa.targets[0]; const myCard = pa.payload.myCardId; const theirCard = pa.payload.theirCardId;
    const removedMine = removePropertyFromOwner(game, pa.actor, myCard);
    const removedTheirs = removePropertyFromOwner(game, target, theirCard);
    if(removedMine) givePropertyTo(game, target, myCard);
    if(removedTheirs) givePropertyTo(game, pa.actor, theirCard);
    if(pa.payload.cardId) game.discard.push(pa.payload.cardId);
    pa.resolved = true;
    io.to(room).emit('action_resolved', { id: pa.id, type: pa.type, result: 'swapped' });
    game.pendingAction = null;
    sendGameState(room);
    return;
  }

  if(pa.type === 'deal_breaker'){
    const target = pa.targets[0]; const color = pa.payload.color;
    const set = game.players[target].properties[color] || [];
    if(set && set.length>0){
      game.players[pa.actor].properties[color] = game.players[pa.actor].properties[color] || [];
      game.players[pa.actor].properties[color] = game.players[pa.actor].properties[color].concat(set);
      game.players[target].properties[color] = [];
    }
    if(pa.payload.cardId) game.discard.push(pa.payload.cardId);
    pa.resolved = true;
    io.to(room).emit('action_resolved', { id: pa.id, type: pa.type, result: 'stolen_set' });
    game.pendingAction = null;
    sendGameState(room);
    return;
  }

  pa.resolved = true;
  if(pa.payload && pa.payload.cardId) game.discard.push(pa.payload.cardId);
  io.to(room).emit('action_resolved', { id: pa.id, type: pa.type, result: 'noop' });
  game.pendingAction = null;
  sendGameState(room);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', ()=>{
  console.log(`[server] listening on 0.0.0.0:${PORT}`);
}); 