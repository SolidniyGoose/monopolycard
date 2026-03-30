const socket = io();
let myPlayerId = null;
let myPlayerName = null;
let currentRoom = null;
let currentGameState = null;
let allCardsData = [];
let expandedStacks = new Set();
let winDeclared = false; // Чтобы не отправлять победу 10 раз

// --- Элементы UI Лобби ---
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const loginBox = document.getElementById('login-box');
const mainLobby = document.getElementById('main-lobby');
const playerNameInput = document.getElementById('player-name-input');
const btnLogin = document.getElementById('btn-login');
const roomsListEl = document.getElementById('rooms-list');
const leaderboardListEl = document.getElementById('leaderboard-list');
const newRoomName = document.getElementById('new-room-name');
const newRoomPass = document.getElementById('new-room-pass');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnChangeName = document.getElementById('btn-change-name');

// --- Элементы UI Игры ---
const statusEl = document.getElementById('status');
const turnIndicator = document.getElementById('turn-indicator');
const btnStart = document.getElementById('btn-start');
const btnLeave = document.getElementById('btn-leave');
const btnEndTurn = document.getElementById('btn-end-turn');
const handContainer = document.getElementById('player-hand');
const drawPileEl = document.getElementById('draw-pile');
const deckCountEl = document.getElementById('deck-count');
let previousHand = []; // Память для анимации новых карт
const discardCountEl = document.getElementById('discard-count');
const bankCardsEl = document.getElementById('bank-cards');
const propertyCardsEl = document.getElementById('property-cards');
const opponentsZone = document.getElementById('opponents-zone');
const targetModal = document.getElementById('target-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const btnCancelAction = document.getElementById('btn-cancel-action');

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const btnSendChat = document.getElementById('btn-send-chat');

let draggedCard = null; let shiftX = 0, shiftY = 0; let originalCardRect = null; let startX = 0, startY = 0; let isDragging = false; 
let currentTurnPlayerId = null; let hasDrawnThisTurn = false;

const colorNames = { 'brown': 'Коричневый', 'lightblue': 'Голубой', 'pink': 'Розовый', 'orange': 'Оранжевый', 'red': 'Красный', 'yellow': 'Желтый', 'green': 'Зеленый', 'darkblue': 'Темно-синий', 'railroad': 'Станции', 'utility': 'Предприятия', 'any': 'Разноцветный' };
const bgColors = { 'brown': '#8B4513', 'lightblue': '#87CEEB', 'pink': '#FF69B4', 'orange': '#FF8C00', 'red': '#FF0000', 'yellow': '#FFD700', 'green': '#008000', 'darkblue': '#00008B', 'railroad': '#000000', 'utility': '#7f8c8d' };

// =========================================
// ЗВУКОВЫЕ ЭФФЕКТЫ
// =========================================
const sfxDraw = new Audio('/sounds/draw.mp3');
const sfxPlay = new Audio('/sounds/play.mp3');
const sfxAlert = new Audio('/sounds/alert.mp3');
const sfxCash = new Audio('/sounds/cash.mp3');

function playSound(audioObj) {
    // Клонируем звук, чтобы они могли накладываться друг на друга (важно для раздачи)
    const sound = audioObj.cloneNode();
    sound.volume = 0.5; // Громкость 50%, чтобы не оглушить в наушниках
    // Браузеры иногда блокируют звук до первого клика по странице, поэтому ловим ошибку:
    sound.play().catch(err => console.log('Ожидание клика для разблокировки звука...'));
}

fetch('/cards_data.json?v=' + new Date().getTime()).then(res => res.json()).then(data => { allCardsData = data; });

// =========================================
// ЛОГИКА ЛОББИ И АВТОРИЗАЦИИ
// =========================================
socket.on('connect', () => { 
    socket.emit('req_lobby');
    const savedName = localStorage.getItem('monopoly_playerName');
    const savedRoom = localStorage.getItem('monopoly_currentRoom');
    const savedPid = localStorage.getItem('monopoly_playerId');

    if (savedName) {
        playerNameInput.value = savedName; // Просто подставляем имя в поле ввода
        
        // Если игрок был в комнате (за столом), возвращаем его туда
        if (savedRoom && savedPid) {
            socket.emit('join_room', { room: savedRoom, name: savedName, playerId: savedPid }, (res) => {
                if (res.ok) {
                    myPlayerId = res.playerId; myPlayerName = savedName; currentRoom = savedRoom;
                    showGameScreen();
                    if (currentGameState) renderGame();
                } else {
                    // Если комната закрылась, стираем старые ID
                    localStorage.removeItem('monopoly_currentRoom');
                    localStorage.removeItem('monopoly_playerId');
                    // Мы УБРАЛИ авто-логин отсюда. Теперь вы останетесь на экране входа.
                }
            });
        }
        // Мы УБРАЛИ авто-логин и отсюда. 
        // Теперь при входе на сайт вы всегда будете видеть кнопку "Войти в игру".
    }
});

btnLogin.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (name) doLogin(name);
});

function doLogin(name) {
    socket.emit('login', name, (res) => {
        if (res.ok) {
            myPlayerName = name;
            localStorage.setItem('monopoly_playerName', name);
            loginBox.classList.add('hidden');
            mainLobby.classList.remove('hidden');
            document.querySelector('.game-title').textContent = `Привет, ${name}!`;
        }
    });
}

// Обработка кнопки смены имени
if (btnChangeName) {
    btnChangeName.addEventListener('click', () => {
        const newName = prompt("Введите новое имя:", myPlayerName);
        if (!newName || newName === myPlayerName) return;

        socket.emit('change_name', { oldName: myPlayerName, newName: newName }, (res) => {
            if (res.error) {
                alert(res.error);
            } else {
                // Обновляем память браузера и интерфейс
                myPlayerName = newName;
                localStorage.setItem('monopoly_playerName', newName);
                document.querySelector('.game-title').textContent = `Привет, ${newName}!`;
                alert('Имя успешно изменено!');
            }
        });
    });
}

// Создание комнаты
btnCreateRoom.addEventListener('click', () => {
    const rName = newRoomName.value.trim() || 'Комната ' + myPlayerName;
    const rPass = newRoomPass.value.trim();
    socket.emit('create_room', { roomName: rName, password: rPass }, (res) => {
        if (res.ok) joinGameRoom(res.roomId, rPass);
    });
});

// Обновление списка комнат и таблицы лидеров от сервера
socket.on('lobby_update', (data) => {
    // 1. Рисуем комнаты
    roomsListEl.innerHTML = '';
    if (data.rooms.length === 0) {
        roomsListEl.innerHTML = '<p style="color:#bdc3c7; text-align:center;">Нет активных комнат. Создайте свою!</p>';
    } else {
        data.rooms.forEach(room => {
            const item = document.createElement('div');
            item.className = 'room-item';
            const passIcon = room.hasPassword ? '🔒' : '🔓';
            item.innerHTML = `
                <div class="room-info">
                    <span class="room-name">${room.name} ${passIcon}</span>
                    <span class="room-meta">Игроков: ${room.playersCount}</span>
                </div>
                <button class="btn-primary" style="padding: 6px 12px;">Войти</button>
            `;
            item.querySelector('button').onclick = () => {
                let pass = '';
                if (room.hasPassword) {
                    pass = prompt(`Введите пароль для комнаты "${room.name}":`);
                    if (pass === null) return;
                }
                joinGameRoom(room.id, pass);
            };
            roomsListEl.appendChild(item);
        });
    }

    // 2. Рисуем таблицу лидеров
    leaderboardListEl.innerHTML = '';
    data.leaderboard.forEach((user, index) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        let medal = '';
        if (index === 0) medal = '🥇 '; else if (index === 1) medal = '🥈 '; else if (index === 2) medal = '🥉 ';
        item.innerHTML = `<span>${medal}${user.name}</span> <span>${user.wins} 🏆</span>`;
        leaderboardListEl.appendChild(item);
    });
});

function joinGameRoom(roomId, password) {
    socket.emit('join_room', { room: roomId, password: password, name: myPlayerName }, (res) => {
        if (res.error) { alert(res.error); return; }
        if (res.ok) {
            myPlayerId = res.playerId;
            currentRoom = roomId;
            localStorage.setItem('monopoly_currentRoom', currentRoom);
            localStorage.setItem('monopoly_playerId', myPlayerId);
            showGameScreen();
            if (currentGameState) renderGame(); // <--- ИСПРАВЛЕНИЕ 2
        }
    });
}

btnLeave.addEventListener('click', () => {
    if (confirm('Вы точно хотите выйти в Лобби?')) {
        socket.emit('leave_room', { room: currentRoom, playerId: myPlayerId });
        currentRoom = null; myPlayerId = null; winDeclared = false;
        localStorage.removeItem('monopoly_currentRoom'); localStorage.removeItem('monopoly_playerId');
        lobbyScreen.classList.remove('hidden'); gameScreen.classList.add('hidden');
        document.querySelector('.game-title').textContent = `Привет, ${myPlayerName}!`;
    }
});

function showGameScreen() {
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    winDeclared = false;
    statusEl.textContent = `🟢 Игрок: ${myPlayerName} (Комната: ${currentRoom})`;
}

// =========================================
// ИГРОВАЯ ЛОГИКА
// =========================================
btnStart.addEventListener('click', () => { socket.emit('start_game', { room: currentRoom }); });

drawPileEl.addEventListener('click', () => {
    if (!currentGameState || currentGameState.turnPlayerId !== myPlayerId) return;
    if (hasDrawnThisTurn) { alert('Вы уже брали карты!'); return; }
    const myHandCount = currentGameState.players[myPlayerId].hand.length;
    hasDrawnThisTurn = true; 
    socket.emit('intent_draw', { room: currentRoom, playerId: myPlayerId, count: (myHandCount === 0 ? 5 : 2) });
});

btnEndTurn.addEventListener('click', () => {
    if (currentGameState.turnPlayerId !== myPlayerId) return;
    socket.emit('intent_end_turn', { room: currentRoom, playerId: myPlayerId });
});

socket.on('game_state', (state) => {
    if (state.turnPlayerId !== currentTurnPlayerId) { currentTurnPlayerId = state.turnPlayerId; hasDrawnThisTurn = false; }
    currentGameState = state;
    btnStart.disabled = state.deckCount < 106 && state.deckCount > 0; // Блокируем старт, если игра идет
    renderGame();
});

// --- ПЕРЕТАСКИВАНИЕ ---
document.addEventListener('pointermove', (e) => {
    if (!draggedCard) return;
    if (!isDragging) {
        if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) {
            isDragging = true; draggedCard.style.width = originalCardRect.width + 'px'; draggedCard.style.height = originalCardRect.height + 'px'; draggedCard.classList.add('dragging');
        } else return; 
    }
    draggedCard.style.left = e.clientX - shiftX + 'px'; draggedCard.style.top = e.clientY - shiftY + 'px';
    draggedCard.style.visibility = 'hidden'; const elementBelow = document.elementFromPoint(e.clientX, e.clientY); draggedCard.style.visibility = 'visible';
    const zone = elementBelow?.closest('.board-section, #action-zone, #discard-pile');
    document.querySelectorAll('.board-section, #action-zone, #discard-pile').forEach(el => el.classList.remove('drag-over'));
    if (zone && (zone.id === 'player-bank' || zone.id === 'player-properties' || zone.id === 'action-zone' || zone.id === 'discard-pile')) zone.classList.add('drag-over');
});

document.addEventListener('pointerup', (e) => {
    if (!draggedCard) return;
    const tempCard = draggedCard; const wasDragging = isDragging;
    draggedCard.style.visibility = 'hidden'; const elementBelow = document.elementFromPoint(e.clientX, e.clientY); draggedCard.style.visibility = 'visible';
    const zone = elementBelow?.closest('.board-section, #action-zone, #discard-pile');
    document.querySelectorAll('.board-section, #action-zone, #discard-pile').forEach(el => el.classList.remove('drag-over'));
    
    const cardId = tempCard.dataset.id; const origin = tempCard.dataset.origin; const currentColor = tempCard.dataset.currentColor;
    const cardData = allCardsData.find(c => c.id === cardId); const tempOriginalRect = originalCardRect;
    draggedCard = null; isDragging = false; 

    if (!wasDragging) { tempCard.classList.remove('dragging'); tempCard.style.cssText = ''; renderGame(); return; }

    const returnCardToHand = () => {
        tempCard.classList.add('returning'); tempCard.style.left = tempOriginalRect.left + 'px'; tempCard.style.top = tempOriginalRect.top + 'px'; tempCard.style.transform = 'scale(1) rotate(0deg)';
        setTimeout(() => { if (tempCard && tempCard.parentNode) { tempCard.classList.remove('dragging', 'returning'); tempCard.style.cssText = ''; } renderGame(); }, 300);
    };

    if (zone) {
        playSound(sfxPlay); // <--- ВОТ СЮДА! Звук шлепка карты по столу
        const callback = (res) => { if (res && res.error) { alert('Ошибка: ' + res.error); returnCardToHand(); } };
        if (origin === 'table') {
            if (zone.id === 'player-properties') {
                const targetStack = elementBelow?.closest('.card-stack'); let targetColor = null;
                if (targetStack && targetStack.id.startsWith('prop-my-')) targetColor = targetStack.id.replace('prop-my-', '');
                let availableColors = cardData.colors.includes('any') ? Object.keys(bgColors) : cardData.colors;
                if (targetColor && targetColor !== currentColor && availableColors.includes(targetColor)) {
                    socket.emit('flip_property', { room: currentRoom, playerId: myPlayerId, cardId: cardId, newColor: targetColor }, callback);
                } else returnCardToHand();
            } else returnCardToHand(); 
            return;
        }

        if (origin === 'hand') {
            if (cardData.action_type === 'just_say_no' && zone.id !== 'discard-pile') { alert('Карту "НЕТ" можно кинуть только в окно защиты или в сброс!'); return returnCardToHand(); }
            if (zone.id === 'discard-pile') {
                socket.emit('intent_discard', { room: currentRoom, playerId: myPlayerId, cardId: cardId }, callback);
            } else if (zone.id === 'player-bank') {
                if (cardData.type === 'property' || cardData.type === 'property_wild') { alert('Недвижимость нельзя в Банк!'); return returnCardToHand(); }
                socket.emit('intent_move_to_bank', { room: currentRoom, playerId: myPlayerId, cardId: cardId }, callback);
            } else if (zone.id === 'player-properties') {
                if (cardData.type !== 'property' && cardData.type !== 'property_wild') { alert('Сюда только недвижимость!'); return returnCardToHand(); }
                const targetStack = elementBelow?.closest('.card-stack'); let targetColor = null;
                if (targetStack && targetStack.id.startsWith('prop-my-')) targetColor = targetStack.id.replace('prop-my-', '');
                if (cardData && cardData.type === 'property_wild') {
                    let availableColors = cardData.colors.includes('any') ? Object.keys(bgColors) : cardData.colors;
                    if (targetColor && availableColors.includes(targetColor)) socket.emit('play_property', { room: currentRoom, playerId: myPlayerId, cardId: cardId, chosenColor: targetColor }, callback);
                    else openWildColorModal(cardId, cardData, returnCardToHand, false);
                } else socket.emit('play_property', { room: currentRoom, playerId: myPlayerId, cardId: cardId }, callback);
            } else if (zone.id === 'action-zone') {
                const type = cardData?.action_type || cardData?.type;
                if (['debt_collector', 'sly_deal', 'forced_deal', 'deal_breaker', 'rent', 'double_the_rent', 'house', 'hotel', 'birthday'].includes(type)) {
                    openTargetModal(cardId, cardData, type, returnCardToHand);
                } else socket.emit('play_action', { room: currentRoom, playerId: myPlayerId, cardId: cardId, opts: {} }, callback);
            }
        }
    } else returnCardToHand();
});

// --- СЕТЕВАЯ ОЧЕРЕДЬ ОКОН ---
let networkModalQueue = []; let isNetworkModalActive = false;
socket.on('action_request', (req) => { networkModalQueue.push({ type: 'action', data: req }); processNetworkModalQueue(); });
socket.on('counter_request', (req) => { networkModalQueue.push({ type: 'counter', data: req }); processNetworkModalQueue(); });
function processNetworkModalQueue() {
    if (isNetworkModalActive || networkModalQueue.length === 0) return;
    isNetworkModalActive = true; const item = networkModalQueue.shift();
    if (item.type === 'action') buildActionModal(item.data); else if (item.type === 'counter') buildCounterModal(item.data);
}
function closeNetworkModal() { targetModal.classList.add('hidden'); isNetworkModalActive = false; processNetworkModalQueue(); }

function buildActionModal(req) {
    playSound(sfxAlert);
    targetModal.classList.remove('hidden'); modalBody.innerHTML = ''; btnCancelAction.style.display = 'none'; 
    let isPayment = false; let amountOwed = req.amount || 0; const fromPlayer = currentGameState.players[req.from]?.name || 'Соперник';
    let actionText = 'применил против вас действие!';
    if (req.type === 'sly_deal') actionText = 'хочет украсть вашу недвижимость!'; if (req.type === 'deal_breaker') actionText = 'хочет украсть ваш комплект!'; if (req.type === 'forced_deal') actionText = 'предлагает вынужденный обмен!'; if (req.type === 'debt_collector') { actionText = 'требует 5M долга!'; isPayment = true; } if (req.type === 'birthday') { actionText = 'требует подарок на ДР (2M)!'; isPayment = true; } if (req.type === 'rent') { actionText = `требует уплатить ренту (${amountOwed}M)!`; isPayment = true; }
    if (req.counterNo) actionText = 'ОТВЕТИЛ СВОИМ "НЕТ" на ваше "НЕТ"! Действие снова в силе!';
    modalTitle.textContent = `⚠️ ВНИМАНИЕ! ${fromPlayer} ${actionText}`;

    const justSayNoCards = currentGameState.players[myPlayerId].hand.filter(cardId => { const c = allCardsData.find(data => data.id === cardId); return c && c.action_type === 'just_say_no'; });
    if (justSayNoCards.length > 0) {
        const btnNo = document.createElement('button'); btnNo.className = 'modal-btn'; btnNo.style.background = '#e74c3c'; btnNo.textContent = '🛑 Сыграть: Просто скажи "НЕТ"!';
        btnNo.onclick = () => { socket.emit('respond_action', { room: currentRoom, playerId: myPlayerId, pendingId: req.id, action: 'decline', playedJustSayNoCardId: justSayNoCards[0] }); closeNetworkModal(); }; modalBody.appendChild(btnNo);
    }
    if (isPayment) {
        const btnPay = document.createElement('button'); btnPay.className = 'modal-btn'; btnPay.style.background = '#f39c12'; btnPay.textContent = `Выбрать карты для оплаты (${amountOwed}M)`;
        btnPay.onclick = () => showPaymentSelection(amountOwed, req.id); modalBody.appendChild(btnPay);
    } else {
        const btnAccept = document.createElement('button'); btnAccept.className = 'modal-btn'; btnAccept.style.background = '#27ae60'; btnAccept.textContent = 'Смириться (Принять)';
        btnAccept.onclick = () => { socket.emit('respond_action', { room: currentRoom, playerId: myPlayerId, pendingId: req.id, action: 'accept' }); closeNetworkModal(); }; modalBody.appendChild(btnAccept);
    }
}

function buildCounterModal(req) {
    targetModal.classList.remove('hidden'); modalBody.innerHTML = ''; btnCancelAction.style.display = 'none';
    modalTitle.textContent = `Игрок ${req.fromName} сыграл "Просто скажи НЕТ"!`;
    const justSayNoCards = currentGameState.players[myPlayerId].hand.filter(cardId => { const c = allCardsData.find(data => data.id === cardId); return c && c.action_type === 'just_say_no'; });
    if (justSayNoCards.length > 0) {
        const btnNo = document.createElement('button'); btnNo.className = 'modal-btn'; btnNo.style.background = '#e74c3c'; btnNo.textContent = '🛑 Контр-удар! Сыграть своё "НЕТ"!';
        btnNo.onclick = () => { socket.emit('respond_action', { room: currentRoom, playerId: myPlayerId, pendingId: req.id, action: 'decline', playedJustSayNoCardId: justSayNoCards[0], targetId: req.targetId }); closeNetworkModal(); }; modalBody.appendChild(btnNo);
    }
    const btnAccept = document.createElement('button'); btnAccept.className = 'modal-btn'; btnAccept.style.background = '#27ae60'; btnAccept.textContent = 'Смириться (Ваше действие отменено)';
    btnAccept.onclick = () => { socket.emit('respond_action', { room: currentRoom, playerId: myPlayerId, pendingId: req.id, action: 'accept', targetId: req.targetId }); closeNetworkModal(); }; modalBody.appendChild(btnAccept);
}

socket.on('action_resolved', (res) => { if (res.executed === false) alert('Действие было полностью отменено картой "Просто скажи Нет"!'); });

// Оплата долга (сокращенно)
function showPaymentSelection(amountOwed, pendingId) {
    modalBody.innerHTML = ''; const myPlayerInfo = currentGameState.players[myPlayerId];
    let validPaymentCards = []; let totalAssetsValue = 0;
    myPlayerInfo.bank.forEach(cardId => { const cData = allCardsData.find(c => c.id === cardId); const val = cData.bank_value !== undefined ? cData.bank_value : (cData.value || 0); totalAssetsValue += val; validPaymentCards.push({ id: cardId, value: val, color: null }); });
    for (const color in myPlayerInfo.properties) {
        const cards = myPlayerInfo.properties[color]; const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length;
        const propCardInfo = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(color));
        if (propCount > 0 && propCount < (propCardInfo ? propCardInfo.set_size : 99)) {
            cards.forEach(cardId => { if(!cardId.startsWith('HOUSE') && !cardId.startsWith('HOTEL')) { const cData = allCardsData.find(c => c.id === cardId); totalAssetsValue += cData.bank_value || 0; validPaymentCards.push({ id: cardId, value: cData.bank_value || 0, color: color }); } });
        }
    }
    let selectedCards = new Set(); let currentSelectedValue = 0;
    const updateTitle = () => { modalTitle.textContent = `К оплате: ${amountOwed}M | Выбрано: ${currentSelectedValue}M`; const canPay = currentSelectedValue >= amountOwed || (currentSelectedValue === totalAssetsValue && totalAssetsValue > 0) || totalAssetsValue === 0; btnConfirmPayment.disabled = !canPay; btnConfirmPayment.style.opacity = canPay ? '1' : '0.5'; };
    const paymentGrid = document.createElement('div'); paymentGrid.style.cssText = 'display:flex; flex-wrap:wrap; justify-content:center; gap:5px; max-height:300px; overflow-y:auto; margin-bottom:15px;';
    if (validPaymentCards.length === 0) { paymentGrid.innerHTML = '<p style="color:#e74c3c; width:100%;">Банкротство! Платить нечем.</p>'; } 
    else {
        validPaymentCards.forEach(item => {
            const cardEl = createCardElement(item.id, item.color); cardEl.style.transform = 'scale(0.8)'; cardEl.style.margin = '0'; cardEl.style.cursor = 'pointer'; cardEl.style.transition = 'all 0.2s'; cardEl.style.border = '2px solid transparent';
            cardEl.onclick = () => { if (selectedCards.has(item.id)) { selectedCards.delete(item.id); currentSelectedValue -= item.value; cardEl.style.border = '2px solid transparent'; cardEl.style.boxShadow = 'none'; cardEl.style.transform = 'scale(0.8)'; } else { selectedCards.add(item.id); currentSelectedValue += item.value; cardEl.style.border = '2px solid #2ecc71'; cardEl.style.boxShadow = '0 0 10px #2ecc71'; cardEl.style.transform = 'scale(0.85)'; } updateTitle(); };
            paymentGrid.appendChild(cardEl);
        });
    }
    modalBody.appendChild(paymentGrid);
    const btnConfirmPayment = document.createElement('button'); btnConfirmPayment.className = 'modal-btn'; btnConfirmPayment.style.background = '#27ae60'; btnConfirmPayment.textContent = 'Подтвердить оплату';
    btnConfirmPayment.onclick = () => { 
            playSound(sfxCash); // <--- ВОТ СЮДА! Звон монет
            socket.emit('respond_action', { room: currentRoom, playerId: myPlayerId, pendingId: pendingId, action: 'accept', paymentCards: Array.from(selectedCards) }); 
            closeNetworkModal(); 
        };    modalBody.appendChild(btnConfirmPayment); updateTitle();
}

// Модалки целей и цветов...
function openWildColorModal(cardId, cardData, cancelCallback, isFlipping = false, currentColor = null) {
    targetModal.classList.remove('hidden'); modalBody.innerHTML = ''; modalTitle.textContent = isFlipping ? 'В какой цвет перевернуть?' : 'Как какой цвет выложить?'; btnCancelAction.style.display = 'block';
    let availableColors = cardData.colors; if (availableColors.includes('any')) availableColors = Object.keys(bgColors); if (isFlipping && currentColor) availableColors = availableColors.filter(c => c !== currentColor);
    availableColors.forEach(color => { const btn = document.createElement('button'); btn.className = 'modal-btn'; btn.style.background = bgColors[color] || '#3498db'; btn.style.textShadow = '1px 1px 2px black'; btn.textContent = `${colorNames[color] || color}`;
        btn.onclick = () => { targetModal.classList.add('hidden'); if (isFlipping) socket.emit('flip_property', { room: currentRoom, playerId: myPlayerId, cardId: cardId, newColor: color }, (res)=>{if(res.error)cancelCallback();}); else socket.emit('play_property', { room: currentRoom, playerId: myPlayerId, cardId: cardId, chosenColor: color }, (res)=>{if(res.error)cancelCallback();}); }; modalBody.appendChild(btn);
    }); btnCancelAction.onclick = () => { targetModal.classList.add('hidden'); cancelCallback(); };
}

function openTargetModal(actionCardId, cardData, actionType, cancelCallback) {
    targetModal.classList.remove('hidden'); modalBody.innerHTML = ''; btnCancelAction.style.display = 'block'; const myProps = currentGameState.players[myPlayerId].properties;
    if (actionType === 'rent' || actionType === 'double_the_rent') {
        modalTitle.textContent = 'За какой цвет возьмем ренту?'; let availableColors = (cardData.colors && cardData.colors.includes('any')) || actionType === 'double_the_rent' ? Object.keys(bgColors) : (cardData.colors || Object.keys(bgColors)); let validColors = availableColors.filter(c => myProps[c] && myProps[c].filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length > 0);
        if (validColors.length === 0) { modalBody.innerHTML = '<p style="color:#e74c3c">У вас нет недвижимости этих цветов!</p>'; } 
        else { validColors.forEach(color => { const btn = document.createElement('button'); btn.className = 'modal-btn'; btn.style.background = bgColors[color] || '#3498db'; btn.style.textShadow = '1px 1px 2px black'; const isUniversal = (cardData.colors && cardData.colors.includes('any')) || actionType === 'double_the_rent';
                if (isUniversal) { btn.textContent = `Рента за ${colorNames[color] || color} (с одного)`; btn.onclick = () => { modalTitle.textContent = 'С кого возьмем ренту?'; modalBody.innerHTML = ''; for (const [pId, pInfo] of Object.entries(currentGameState.players)) { if (pId === myPlayerId) continue; const tBtn = document.createElement('button'); tBtn.className = 'modal-btn'; tBtn.textContent = `Ограбить: ${pInfo.name}`; tBtn.onclick = () => { targetModal.classList.add('hidden'); socket.emit('play_action', { room: currentRoom, playerId: myPlayerId, cardId: actionCardId, opts: { color: color, targets: [pId] } }); }; modalBody.appendChild(tBtn); } }; } 
                else { btn.textContent = `Рента СО ВСЕХ за ${colorNames[color] || color}`; btn.onclick = () => { targetModal.classList.add('hidden'); socket.emit('play_action', { room: currentRoom, playerId: myPlayerId, cardId: actionCardId, opts: { color: color } }); }; } modalBody.appendChild(btn); }); }
    } else if (actionType === 'house' || actionType === 'hotel') {
        modalTitle.textContent = `Куда поставим ${actionType === 'house' ? 'Дом' : 'Отель'}?`; let hasOptions = false;
        for (const color in myProps) { const cards = myProps[color]; const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length; const hasHouse = cards.some(id => id.startsWith('HOUSE')); const hasHotel = cards.some(id => id.startsWith('HOTEL')); const propCardInfo = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(color)); const setSize = propCardInfo ? propCardInfo.set_size : 99;
            if (propCount >= setSize && color !== 'railroad' && color !== 'utility') { if (actionType === 'house' && !hasHouse) { hasOptions = true; createHouseHotelButton(color, actionCardId, cancelCallback); } else if (actionType === 'hotel' && hasHouse && !hasHotel) { hasOptions = true; createHouseHotelButton(color, actionCardId, cancelCallback); } } }
        if (!hasOptions) modalBody.innerHTML = `<p style="color:#e74c3c">Нет подходящих полных комплектов!</p>`;
    } else {
        modalTitle.textContent = 'Кого выберем целью?'; let opponentsCount = 0;
        for (const [pId, pInfo] of Object.entries(currentGameState.players)) {
            if (pId === myPlayerId) continue; opponentsCount++; const btn = document.createElement('button'); btn.className = 'modal-btn'; btn.textContent = `Игрок: ${pInfo.name}`;
            btn.onclick = () => {
                if (actionType === 'debt_collector' || actionType === 'birthday') { targetModal.classList.add('hidden'); socket.emit('play_action', { room: currentRoom, playerId: myPlayerId, cardId: actionCardId, opts: { target: pId } }); } 
                else if (actionType === 'deal_breaker') { modalTitle.textContent = `Какой комплект украдем у ${pInfo.name}?`; modalBody.innerHTML = ''; let hasColors = false; for (const color in pInfo.properties) { const cards = pInfo.properties[color]; const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length; const propCardInfo = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(color)); const setSize = propCardInfo ? propCardInfo.set_size : 99; if (propCount >= setSize) { hasColors = true; const btnColor = document.createElement('button'); btnColor.className = 'modal-btn'; btnColor.style.background = bgColors[color] || '#8e44ad'; btnColor.style.textShadow = '1px 1px 2px black'; btnColor.textContent = `Украсть набор: ${colorNames[color] || color}`; btnColor.onclick = () => { targetModal.classList.add('hidden'); socket.emit('play_action', { room: currentRoom, playerId: myPlayerId, cardId: actionCardId, opts: { target: pId, color: color } }); }; modalBody.appendChild(btnColor); } } if (!hasColors) modalBody.innerHTML = '<p style="color:#e74c3c">У игрока нет полных наборов!</p>'; } 
                else if (actionType === 'sly_deal') { modalTitle.textContent = `Что украдем у ${pInfo.name}?`; modalBody.innerHTML = ''; let hasProperties = false; for (const color in pInfo.properties) { const cards = pInfo.properties[color]; const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length; const propCardInfo = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(color)); const setSize = propCardInfo ? propCardInfo.set_size : 99; if (propCount > 0 && propCount < setSize) { cards.forEach(targetCardId => { if(typeof targetCardId === 'string' && (targetCardId.startsWith('HOUSE_') || targetCardId.startsWith('HOTEL_'))) return; hasProperties = true; const targetData = allCardsData.find(c => c.id === targetCardId); const cardBtn = document.createElement('button'); cardBtn.className = 'modal-btn'; cardBtn.style.background = bgColors[color] || '#27ae60'; cardBtn.style.textShadow = '1px 1px 2px black'; cardBtn.textContent = `Украсть: ${targetData ? targetData.name : targetCardId}`; cardBtn.onclick = () => { targetModal.classList.add('hidden'); socket.emit('play_action', { room: currentRoom, playerId: myPlayerId, cardId: actionCardId, opts: { target: pId, targetCardId: targetCardId } }); }; modalBody.appendChild(cardBtn); }); } } if (!hasProperties) modalBody.innerHTML = '<p style="color:#e74c3c">У игрока нет подходящей недвижимости!</p>'; } 
                else if (actionType === 'forced_deal') { modalTitle.textContent = `Какую карту ЗАБЕРЕМ у ${pInfo.name}?`; modalBody.innerHTML = ''; let hasProperties = false; for (const color in pInfo.properties) { const cards = pInfo.properties[color]; const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length; const propCardInfo = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(color)); const setSize = propCardInfo ? propCardInfo.set_size : 99; if (propCount > 0 && propCount < setSize) { cards.forEach(theirCardId => { if(typeof theirCardId === 'string' && (theirCardId.startsWith('HOUSE_') || theirCardId.startsWith('HOTEL_'))) return; hasProperties = true; const targetData = allCardsData.find(c => c.id === theirCardId); const cardBtn = document.createElement('button'); cardBtn.className = 'modal-btn'; cardBtn.style.background = bgColors[color] || '#2980b9'; cardBtn.style.textShadow = '1px 1px 2px black'; cardBtn.textContent = `Забрать: ${targetData ? targetData.name : theirCardId}`; cardBtn.onclick = () => chooseMyCardForForcedDeal(actionCardId, pId, theirCardId, cancelCallback); modalBody.appendChild(cardBtn); }); } } if (!hasProperties) modalBody.innerHTML = '<p style="color:#e74c3c">У игрока нет недвижимости для обмена!</p>'; }
            }; modalBody.appendChild(btn);
        }
        if (opponentsCount === 0) modalBody.innerHTML = '<p style="color:#e74c3c">Нет других игроков для выбора!</p>';
    } btnCancelAction.onclick = () => { targetModal.classList.add('hidden'); cancelCallback(); };
}

function createHouseHotelButton(color, actionCardId, cancelCallback) { const btn = document.createElement('button'); btn.className = 'modal-btn'; btn.style.background = bgColors[color]; btn.style.textShadow = '1px 1px 2px black'; btn.textContent = `Добавить: ${colorNames[color] || color}`; btn.onclick = () => { targetModal.classList.add('hidden'); socket.emit('play_action', { room: currentRoom, playerId: myPlayerId, cardId: actionCardId, opts: { color: color } }); }; modalBody.appendChild(btn); }
function chooseMyCardForForcedDeal(actionCardId, targetId, theirCardId, cancelCallback) { modalTitle.textContent = `Какую свою карту ОТДАДИМ взамен?`; modalBody.innerHTML = ''; let hasMyProperties = false; const myPlayerInfo = currentGameState.players[myPlayerId]; for (const color in myPlayerInfo.properties) { const cards = myPlayerInfo.properties[color]; const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length; const propCardInfo = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(color)); const setSize = propCardInfo ? propCardInfo.set_size : 99; if (propCount > 0 && propCount < setSize) { cards.forEach(myCardId => { if(typeof myCardId === 'string' && (myCardId.startsWith('HOUSE_') || myCardId.startsWith('HOTEL_'))) return; hasMyProperties = true; const cardData = allCardsData.find(c => c.id === myCardId); const myCardBtn = document.createElement('button'); myCardBtn.className = 'modal-btn'; myCardBtn.style.background = bgColors[color] || '#d35400'; myCardBtn.style.textShadow = '1px 1px 2px black'; myCardBtn.textContent = `Отдать: ${cardData ? cardData.name : myCardId}`; myCardBtn.onclick = () => { targetModal.classList.add('hidden'); socket.emit('play_action', { room: currentRoom, playerId: myPlayerId, cardId: actionCardId, opts: { target: targetId, theirCardId: theirCardId, myCardId: myCardId } }); }; modalBody.appendChild(myCardBtn); }); } } if (!hasMyProperties) modalBody.innerHTML = '<p style="color:#e74c3c">У вас нет недвижимости, чтобы совершить обмен!</p>'; }

function createCardElement(cardId, assignedColor = null) {
    const cardData = allCardsData.find(c => c.id === cardId); if (!cardData) return null;
    const cardEl = document.createElement('div'); cardEl.className = `card ${cardData.type}`; cardEl.dataset.id = cardId; cardEl.ondragstart = () => false;
    let displayName = cardData.name;
    if (!displayName) { if (cardData.type === 'money') displayName = `Деньги ${cardData.value}M`; else if (cardData.type === 'action' || cardData.type === 'rent') { const act = { 'pass_go': 'Пройди Старт', 'sly_deal': 'Хитрая сделка', 'forced_deal': 'Вынужденная сделка', 'deal_breaker': 'Аферист', 'just_say_no': 'Просто скажи Нет', 'debt_collector': 'Сборщик долгов', 'birthday': 'День Рождения', 'double_the_rent': 'Удвой ренту', 'house': 'Дом', 'hotel': 'Отель', 'rent': 'Рента' }; displayName = act[cardData.action_type] || 'Действие'; } else displayName = 'Карта'; }
    let colorsText = cardData.colors ? cardData.colors.map(c => colorNames[c] || c).join('/') : ''; let multiColorStripe = ''; 
    if (assignedColor && assignedColor !== 'unassigned') { colorsText = `<b style="color: #2c3e50;">(Как: ${colorNames[assignedColor] || assignedColor})</b>`; if (bgColors[assignedColor]) { cardEl.style.borderTopColor = bgColors[assignedColor]; cardEl.style.borderTopWidth = '8px'; } } else if (cardData.colors && cardData.colors.length > 0) { if (cardData.colors.length === 1 && cardData.colors[0] !== 'any') { if (bgColors[cardData.colors[0]]) { cardEl.style.borderTopColor = bgColors[cardData.colors[0]]; } } else { let gradient = ''; if (cardData.colors[0] === 'any') { gradient = 'linear-gradient(to right, #e74c3c, #e67e22, #f1c40f, #2ecc71, #3498db, #8e44ad)'; } else if (cardData.colors.length === 2) { const c1 = bgColors[cardData.colors[0]] || '#000'; const c2 = bgColors[cardData.colors[1]] || '#000'; gradient = `linear-gradient(to right, ${c1} 50%, ${c2} 50%)`; } if (gradient) { multiColorStripe = `<span style="display: block; position: absolute; top: -5px; left: -2px; right: -2px; height: 5px; background: ${gradient}; border-top-left-radius: 6px; border-top-right-radius: 6px; z-index: 1;"></span>`; cardEl.style.borderTopColor = 'transparent'; } } }
    let valText = cardData.bank_value !== undefined ? cardData.bank_value : (cardData.value || 0);
    let descText = cardData.description ? `<div style="font-size: 8px; color: #555; text-align: center; margin-top: 5px; position: relative; z-index: 2;">${cardData.description}</div>` : '';
    if (cardData.filename) { const imageUrl = cardData.filename.replace('/public', ''); cardEl.style.backgroundImage = `url('${imageUrl}')`; cardEl.style.backgroundSize = 'cover'; cardEl.style.backgroundPosition = 'center'; cardEl.style.backgroundRepeat = 'no-repeat'; cardEl.classList.add('has-image'); }
    cardEl.title = (cardData.name || cardData.action_type || 'Карта');
    cardEl.innerHTML = `${multiColorStripe}<div class="card-title" style="position: relative; z-index: 2;">${displayName}</div><div class="card-colors" style="position: relative; z-index: 2;">${colorsText}</div>${descText}<div class="card-val" style="position: relative; z-index: 2;">${valText}</div>`;
    return cardEl;
}

function renderStack(cardsArr, stackId, containerEl, isMini = false, assignedColor = null, isMyTurn = false) {
    if (cardsArr.length === 0) return;
    const stackEl = document.createElement('div'); stackEl.className = `card-stack ${isMini ? 'mini-stack' : ''}`; stackEl.id = stackId; if (expandedStacks.has(stackId)) stackEl.classList.add('expanded');
    stackEl.addEventListener('click', () => { if (expandedStacks.has(stackId)) { expandedStacks.delete(stackId); stackEl.classList.remove('expanded'); } else { expandedStacks.add(stackId); stackEl.classList.add('expanded'); } });
    cardsArr.forEach(rawId => {
        let cardId = rawId; if (typeof rawId === 'string') { if (rawId.startsWith('HOUSE_')) cardId = rawId.replace('HOUSE_', ''); else if (rawId.startsWith('HOTEL_')) cardId = rawId.replace('HOTEL_', ''); }
        const cardEl = createCardElement(cardId, assignedColor);
        if (cardEl) {
            if (isMini) cardEl.classList.add('mini-card'); cardEl.dataset.origin = 'table'; cardEl.dataset.currentColor = assignedColor; const cardData = allCardsData.find(c => c.id === cardId);
            if (isMyTurn && !isMini && cardData && cardData.type === 'property_wild') { cardEl.style.cursor = 'grab'; cardEl.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); openWildColorModal(cardId, cardData, () => {}, true, assignedColor); }); cardEl.addEventListener('pointerdown', (e) => { if (e.button === 2) return; e.stopPropagation(); if (!isMyTurn) return; isDragging = false; startX = e.clientX; startY = e.clientY; draggedCard = cardEl; originalCardRect = cardEl.getBoundingClientRect(); shiftX = e.clientX - originalCardRect.left; shiftY = e.clientY - originalCardRect.top; }); }
            stackEl.appendChild(cardEl);
        }
    }); containerEl.appendChild(stackEl);
}

function renderGame() {
    if (!currentGameState || !myPlayerId) return; if (draggedCard) return;
    const myPlayerInfo = currentGameState.players[myPlayerId]; const isMyTurn = currentGameState.turnPlayerId === myPlayerId;
    
    // --- ЛОГИКА ПАМЯТИ ДЛЯ АНИМАЦИИ ---
    const currentHand = myPlayerInfo.hand;
    const newCardIds = currentHand.filter(id => !previousHand.includes(id));
    previousHand = [...currentHand];
    // ----------------------------------

    deckCountEl.textContent = currentGameState.deckCount; discardCountEl.textContent = currentGameState.discardCount; btnEndTurn.disabled = !isMyTurn;
    if (isMyTurn) turnIndicator.textContent = `⭐ ВАШ ХОД! (Сыграно: ${currentGameState.playsThisTurn}/3)`; else turnIndicator.textContent = `⏳ Ходит: ${currentGameState.players[currentGameState.turnPlayerId]?.name || '...'}`;
    
    handContainer.innerHTML = '';
    myPlayerInfo.hand.forEach(cardId => {
        const cardEl = createCardElement(cardId);
        if (cardEl) { 
            cardEl.dataset.origin = 'hand'; 
            
            // Если это только что взятая карта - делаем её прозрачной до конца полета клона
            if (newCardIds.includes(cardId)) {
                cardEl.style.opacity = '0';
                cardEl.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            }

            cardEl.addEventListener('pointerdown', (e) => { 
                if (e.button === 2) return; 
                if (!isMyTurn) { alert('Дождитесь своего хода!'); return; } 
                isDragging = false; startX = e.clientX; startY = e.clientY; draggedCard = cardEl; 
                originalCardRect = cardEl.getBoundingClientRect(); shiftX = e.clientX - originalCardRect.left; shiftY = e.clientY - originalCardRect.top; 
            }); 
            handContainer.appendChild(cardEl); 
        } else {
            console.error(`🚨 ОШИБКА: Сервер выдал карту с ID [${cardId}], но её нет в cards_data.json!`);
        }
    });

    bankCardsEl.innerHTML = ''; renderStack(myPlayerInfo.bank, `bank-my-${myPlayerId}`, bankCardsEl, false, null, isMyTurn);
    propertyCardsEl.innerHTML = ''; for (const color in myPlayerInfo.properties) { renderStack(myPlayerInfo.properties[color], `prop-my-${color}`, propertyCardsEl, false, color, isMyTurn); }
    
    opponentsZone.innerHTML = '';
    for (const [pId, pInfo] of Object.entries(currentGameState.players)) {
        if (pId === myPlayerId) continue;
        const oppEl = document.createElement('div'); oppEl.className = 'opponent-board'; const statusColor = pInfo.connected ? '#f39c12' : '#7f8c8d'; 
        oppEl.innerHTML = `<div class="opponent-header" style="color: ${statusColor}"><span class="opp-name">${pInfo.name} ${!pInfo.connected ? '(Откл)' : ''}</span><span class="opp-hand">В руке: ${pInfo.handCount} шт.</span></div><div class="opp-table"><div class="opp-bank"><div class="opp-title">Банк</div><div class="opp-cards" id="opp-bank-${pId}"></div></div><div class="opp-props"><div class="opp-title">Недвижимость</div><div class="opp-cards" id="opp-props-${pId}"></div></div></div>`; opponentsZone.appendChild(oppEl);
        renderStack(pInfo.bank, `bank-opp-${pId}`, document.getElementById(`opp-bank-${pId}`), true);
        for (const color in pInfo.properties) { renderStack(pInfo.properties[color], `prop-opp-${color}-${pId}`, document.getElementById(`opp-props-${pId}`), true, color); }
    }
    checkWinCondition();

    // ЗАПУСК АНИМАЦИИ, ЕСЛИ ЕСТЬ НОВЫЕ КАРТЫ
    if (newCardIds.length > 0) {
        animateDrawnCards(newCardIds);
    }
}

function checkWinCondition() {
    for (const [pId, pInfo] of Object.entries(currentGameState.players)) {
        let fullSetsCount = 0;
        for (const color in pInfo.properties) {
            const cards = pInfo.properties[color]; const propCount = cards.filter(id => !(typeof id === 'string' && (id.startsWith('HOUSE') || id.startsWith('HOTEL')))).length;
            const propCard = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(color)); const setSize = propCard ? propCard.set_size : 99;
            if (propCount >= setSize && propCount > 0) fullSetsCount++;
        }
        if (fullSetsCount >= 3) {
            // ИСПРАВЛЕНИЕ: Записываем победу в БД только один раз
            if (pId === myPlayerId && !winDeclared) {
                socket.emit('player_won', { room: currentRoom, playerName: myPlayerName });
                winDeclared = true;
            }
            targetModal.classList.remove('hidden'); btnCancelAction.style.display = 'none'; 
            if (pId === myPlayerId) { modalTitle.textContent = '🏆 ВЫ ПОБЕДИЛИ! 🏆'; modalTitle.style.color = '#f1c40f'; modalTitle.style.fontSize = '28px'; } 
            else { modalTitle.textContent = `😭 ПОБЕДИЛ: ${pInfo.name.toUpperCase()} 😭`; modalTitle.style.color = '#e74c3c'; }
            modalBody.innerHTML = `<p style="color: white; font-size: 16px;">Игра окончена. Собрано 3 полных комплекта недвижимости!</p>`;
        }
    }
}

// =========================================
// ЛОГИКА ЧАТА
// =========================================
function sendChatMessage() {
    const text = chatInput.value.trim();
    if (text && currentRoom && myPlayerId) {
        socket.emit('send_chat_message', { room: currentRoom, playerId: myPlayerId, message: text });
        chatInput.value = ''; // Очищаем поле ввода
    }
}

btnSendChat.addEventListener('click', sendChatMessage);

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage(); // Отправка по Enter
});

// Получаем сообщение от сервера и рисуем его
socket.on('chat_message', ({ sender, text, isSystem }) => {
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg';
    
    if (isSystem) {
        msgEl.style.color = '#bdc3c7';
        msgEl.style.fontStyle = 'italic';
        msgEl.innerHTML = text;
    } else {
        msgEl.innerHTML = `<b>${sender}:</b> ${text}`;
    }
    
    chatMessages.appendChild(msgEl);
    // Автоматически прокручиваем чат вниз
    chatMessages.scrollTop = chatMessages.scrollHeight;
});
// Переменные для сворачивания
const chatToggleBubble = document.getElementById('chat-toggle-bubble');
const chatHeader = document.querySelector('.chat-header'); // Заголовок, по которому будем кликать для сворачивания
const roomChatEl = document.getElementById('room-chat'); // <--- ДОБАВЬТЕ ЭТУ СТРОКУ

// ФУНКЦИЯ: Свернуть чат
function collapseChat() {
    roomChatEl.classList.add('collapsed');
    chatToggleBubble.classList.add('visible'); // Показываем кружок
}

// ФУНКЦИЯ: Развернуть чат
function expandChat() {
    roomChatEl.classList.remove('collapsed');
    chatToggleBubble.classList.remove('visible'); // Скрываем кружок
}

// НАВЕШИВАЕМ ОБРАБОТЧИКИ СОБЫТИЙ

// 1. Клик по кружку -> Развернуть
chatToggleBubble.addEventListener('click', (e) => {
    e.stopPropagation(); // Не даем клику уйти на карты
    expandChat();
});

// 2. Клик по заголовку чата -> Свернуть
chatHeader.addEventListener('click', (e) => {
    e.stopPropagation(); // Не даем клику уйти на карты
    collapseChat();
});

// Дополнительно: При отправке сообщения разворачиваем чат (если был свернут программно)
const originalSendMessage = sendChatMessage;
sendChatMessage = function() {
    originalSendMessage();
    if (roomChatEl.classList.contains('collapsed')) expandChat();
};

// =========================================
// АНИМАЦИЯ ПОЛЕТА КАРТ ПО ДУГЕ (КРИВАЯ БЕЗЬЕ)
// =========================================
function animateDrawnCards(newCardIds) {
    const deckRect = drawPileEl.getBoundingClientRect();
    if (deckRect.width === 0) return; // Предохранитель

    newCardIds.forEach((cardId, index) => {
        // Задержка вылета каждой следующей карты
        setTimeout(() => {
            const realCard = handContainer.querySelector(`.card[data-id="${cardId}"]`);
            if (!realCard) return;

            const targetRect = realCard.getBoundingClientRect();
            
            // Создаем клона карты
            const flyingCard = createCardElement(cardId);
            flyingCard.className = realCard.className;
            flyingCard.style.position = 'fixed';
            flyingCard.style.pointerEvents = 'none';
            flyingCard.style.transition = 'none'; // Управляем движением через JS
            
            // Начальный размер (как у колоды)
            flyingCard.style.width = deckRect.width + 'px';
            flyingCard.style.height = deckRect.height + 'px';
            flyingCard.style.zIndex = '90'; 
            
            document.body.appendChild(flyingCard);
            
            // --- МАТЕМАТИКА ПОЛЕТА ПО КРИВОЙ ---
            
            // ... создание клона flyingCard ...
            document.body.appendChild(flyingCard);
            
            playSound(sfxDraw); // <--- ВОТ СЮДА! Звук вылета карты

            // --- МАТЕМАТИКА ПОЛЕТА ПО КРИВОЙ ---
            
            // Точка А (Начало - Колода)
            const xA = deckRect.left;
            const yA = deckRect.top;
            
            // Точка B (Конец - Слот в руке)
            const xB = targetRect.left;
            const yB = targetRect.top;
            
            // Точка P (Контрольная - Создает дугу).
            // Чтобы получить дугу, похожую на ветвь гиперболы, 
            // мы выносим точку P сильно в сторону (влево) от прямой AB.
            const distanceX = Math.abs(xB - xA);
            const midY = (yA + yB) / 2;
            
            // Контрольная точка сильно левее колоды и посередине по вертикали
            const xP = xA - (distanceX * 0.8); // Сила "выгиба" дуги влево
            const yP = midY - 50; // Немного приподнимаем дугу
            
            // Данные для анимации
            const startTime = performance.now();
            const duration = 600; // Продолжительность полета (мс)
            
            function step(currentTime) {
                let progress = (currentTime - startTime) / duration;
                if (progress > 1) progress = 1;
                
                // 1. Формула кривой Безье 2-го порядка:
                // Point(t) = (1-t)^2 * A + 2*(1-t)*t * P + t^2 * B
                const invT = 1 - progress;
                const currentX = (invT * invT * xA) + (2 * invT * progress * xP) + (progress * progress * xB);
                const currentY = (invT * invT * yA) + (2 * invT * progress * yP) + (progress * progress * yB);
                
                // 2. Анимация трансформаций
                // Плавное вращение (1 оборот)
                const rotate = progress * 360;
                // Изменение размера от колоды к руке
                const scaleW = 1 + (targetRect.width / deckRect.width - 1) * progress;
                const scaleH = 1 + (targetRect.height / deckRect.height - 1) * progress;
                
                flyingCard.style.transform = `translate(${currentX}px, ${currentY}px) rotate(${rotate}deg) scale(${scaleW}, ${scaleH})`;
                
                if (progress < 1) {
                    requestAnimationFrame(step);
                } else {
                    // Конец полета
                    flyingCard.remove();
                    realCard.style.opacity = '1'; // Проявляем настоящую карту
                    
                    // Поп-эффект приземления
                    realCard.style.transform = 'scale(1.1)';
                    setTimeout(() => realCard.style.transform = 'scale(1)', 100);
                }
            }
            
            requestAnimationFrame(step); // Запуск цикла анимации
            
        }, index * 200); // Каждая следующая карта вылетает на 0.2 сек позже
    });
}