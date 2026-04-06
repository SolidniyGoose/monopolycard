const socket = io();
let myPlayerId = null;
let myPlayerName = null;
let currentRoom = null;
let currentGameState = null;
let allCardsData = [];
let expandedStacks = new Set();
let winDeclared = false;
let myPlayerAvatar = null;
const DEFAULT_AVATAR = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect fill=%22%232c3e50%22 width=%22100%22 height=%22100%22/%3E%3Ctext fill=%22%23ecf0f1%22 font-size=%2250%22 x=%2250%22 y=%2265%22 text-anchor=%22middle%22%3E%26%23128100%3B%3C/text%3E%3C/svg%3E';

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

// --- Элементы UI Профиля и Правил ---
const btnRules = document.getElementById('btn-rules');
const rulesModal = document.getElementById('rules-modal');
const btnCloseRules = document.getElementById('btn-close-rules');
const profileTrigger = document.getElementById('profile-trigger');
const myAvatarMini = document.getElementById('my-avatar-mini');
const myNameDisplay = document.getElementById('my-name-display');
const profileModal = document.getElementById('profile-modal');
const profileAvatarPreview = document.getElementById('profile-avatar-preview');
const avatarUploadInput = document.getElementById('avatar-upload-input');
const btnUploadAvatar = document.getElementById('btn-upload-avatar');
const newNameInput = document.getElementById('new-name-input');
const btnSaveName = document.getElementById('btn-save-name');
const btnCloseProfile = document.getElementById('btn-close-profile');

// --- Элементы UI Игры ---
const statusEl = document.getElementById('status');
const turnIndicator = document.getElementById('turn-indicator');
const btnStart = document.getElementById('btn-start');
const btnLeave = document.getElementById('btn-leave');
const btnEndTurn = document.getElementById('btn-end-turn');
const handContainer = document.getElementById('player-hand');
const drawPileEl = document.getElementById('draw-pile');
const deckCountEl = document.getElementById('deck-count');
let previousHand = []; 
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
let unreadChatMessages = 0; 
const chatUnreadBadge = document.getElementById('chat-unread-badge');

const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const notifBadge = document.getElementById('notif-badge');
const friendSearchInput = document.getElementById('friend-search-input');
const btnAddFriend = document.getElementById('btn-add-friend');
const friendsListEl = document.getElementById('friends-list');
const notifsListEl = document.getElementById('notifs-list');

// --- Переменные перетаскивания ---
let draggedCard = null; 
let shiftX = 0, shiftY = 0; 
let originalCardRect = null; 
let startX = 0, startY = 0; 
let isDragging = false; 

let currentTurnPlayerId = null; let hasDrawnThisTurn = false;

const colorNames = { 'brown': 'Коричневый', 'lightblue': 'Голубой', 'pink': 'Розовый', 'orange': 'Оранжевый', 'red': 'Красный', 'yellow': 'Желтый', 'green': 'Зеленый', 'darkblue': 'Темно-синий', 'railroad': 'Станции', 'utility': 'Предприятия', 'any': 'Разноцветный' };
const bgColors = { 'brown': '#8B4513', 'lightblue': '#87CEEB', 'pink': '#FF69B4', 'orange': '#FF8C00', 'red': '#FF0000', 'yellow': '#FFD700', 'green': '#008000', 'darkblue': '#00008B', 'railroad': '#000000', 'utility': '#7f8c8d' };

const sfxDraw = new Audio('/sounds/draw.mp3');
const sfxPlay = new Audio('/sounds/play.mp3');
const sfxAlert = new Audio('/sounds/alert.mp3');
const sfxCash = new Audio('/sounds/cash.mp3');

function playSound(audioObj) {
    const sound = audioObj.cloneNode();
    sound.volume = 0.5;
    sound.play().catch(err => console.log('Ожидание клика для разблокировки звука...'));
}

// === СИСТЕМА УВЕДОМЛЕНИЙ ===
function showNotification(message, type = 'error') {
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    let icon = '⚠️';
    if (type === 'success') icon = '✅';
    if (type === 'info') icon = 'ℹ️';
    toast.innerHTML = `<span class="toast-icon">${icon}</span> <div>${message}</div>`;
    toast.addEventListener('click', () => {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 300);
    });
    container.appendChild(toast);
    if (type === 'error') playSound(sfxAlert);
    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.add('toast-fade-out');
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
        }
    }, 4000);
}

fetch('/cards_data.json?v=' + new Date().getTime())
    .then(res => res.json())
    .then(data => { 
        allCardsData = data; 
        // 🔥 Как только база докачалась - заставляем игру стереть ошибки и нарисовать нормальные карты
        if (currentGameState) renderGame(); 
    });

socket.on('connect', () => { 
    socket.emit('req_lobby');
    const savedName = localStorage.getItem('monopoly_playerName');
    const savedRoom = localStorage.getItem('monopoly_currentRoom');
    const savedPid = localStorage.getItem('monopoly_playerId');

    if (savedName) {
        playerNameInput.value = savedName; 
        if (savedRoom && savedPid) {
            socket.emit('join_room', { room: savedRoom, name: savedName, playerId: savedPid }, (res) => {
                if (res.ok) {
                    myPlayerId = res.playerId; myPlayerName = savedName; currentRoom = savedRoom;
                    socket.emit('login', savedName, (loginRes) => {
                        if (loginRes.ok) { myPlayerAvatar = loginRes.avatar || DEFAULT_AVATAR; updateMyProfileUI(); }
                    });
                    showGameScreen();
                    if (currentGameState) renderGame();
                } else {
                    localStorage.removeItem('monopoly_currentRoom');
                    localStorage.removeItem('monopoly_playerId');
                }
            });
        }
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
            myPlayerAvatar = res.avatar || DEFAULT_AVATAR;
            localStorage.setItem('monopoly_playerName', name);
            loginBox.classList.add('hidden');
            mainLobby.classList.remove('hidden');
            updateMyProfileUI();
        }
    });
}

function updateMyProfileUI() {
    if (myAvatarMini) myAvatarMini.src = myPlayerAvatar;
    if (myNameDisplay) myNameDisplay.textContent = myPlayerName;
    if (profileAvatarPreview) profileAvatarPreview.src = myPlayerAvatar;
    const titleEl = document.querySelector('.game-title');
    if (titleEl) titleEl.textContent = `Привет, ${myPlayerName}!`;
}

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
    });
});

if (btnAddFriend) {
    btnAddFriend.addEventListener('click', () => {
        const friendName = friendSearchInput.value.trim();
        if (!friendName) return;
        socket.emit('send_friend_request', { from: myPlayerName, to: friendName }, (res) => {
            if (res.error) showNotification(res.error, 'error');
            else { showNotification(`Запрос игроку ${friendName} успешно отправлен!`, 'success'); friendSearchInput.value = ''; }
        });
    });
}

socket.on('personal_update', (data) => {
    if (data.incoming.length > 0) { notifBadge.textContent = data.incoming.length; notifBadge.classList.remove('hidden'); } 
    else { notifBadge.classList.add('hidden'); }

    friendsListEl.innerHTML = '';
    if (data.friends.length === 0) {
        friendsListEl.innerHTML = '<p style="color:#bdc3c7; text-align:center; margin-top:20px;">Ваш список друзей пуст.</p>';
    } else {
        data.friends.forEach(f => {
            const item = document.createElement('div'); item.className = 'friend-item'; const ava = f.avatar || DEFAULT_AVATAR;
            item.innerHTML = `<div style="display:flex; align-items:center; gap:10px;"><img src="${ava}" style="width:30px; height:30px; border-radius:50%; object-fit:cover; border:1px solid rgba(255,255,255,0.2);"><span class="friend-name">${f.name}</span></div><button class="btn-small btn-reject" title="Удалить из друзей">Удалить</button>`;
            item.querySelector('button').onclick = () => { if (confirm(`Точно удалить ${f.name} из друзей?`)) socket.emit('resolve_friend_request', { from: f.name, to: myPlayerName, action: 'remove' }); };
            friendsListEl.appendChild(item);
        });
    }

    notifsListEl.innerHTML = '';
    if (data.incoming.length === 0 && data.outgoing.length === 0) {
        notifsListEl.innerHTML = '<p style="color:#bdc3c7; text-align:center; margin-top:20px;">Нет новых запросов.</p>';
    } else {
        data.incoming.forEach(f => {
            const item = document.createElement('div'); item.className = 'notif-item'; const ava = f.avatar || DEFAULT_AVATAR;
            item.innerHTML = `<div style="display:flex; align-items:center; gap:10px;"><img src="${ava}" style="width:30px; height:30px; border-radius:50%; object-fit:cover;"><span class="friend-name">Запрос от: ${f.name}</span></div><div style="display:flex; gap:5px;"><button class="btn-small btn-accept">Принять</button><button class="btn-small btn-reject">Отклонить</button></div>`;
            item.querySelector('.btn-accept').onclick = () => socket.emit('resolve_friend_request', { from: f.name, to: myPlayerName, action: 'accept' });
            item.querySelector('.btn-reject').onclick = () => socket.emit('resolve_friend_request', { from: f.name, to: myPlayerName, action: 'reject' });
            notifsListEl.appendChild(item);
        });
        data.outgoing.forEach(f => {
            const item = document.createElement('div'); item.className = 'notif-item'; const ava = f.avatar || DEFAULT_AVATAR;
            item.innerHTML = `<div style="display:flex; align-items:center; gap:10px; opacity:0.6;"><img src="${ava}" style="width:30px; height:30px; border-radius:50%; object-fit:cover; filter: grayscale(100%);"><span class="friend-name" style="color:#7f8c8d;">⏳ Вы отправили запрос: ${f.name}</span></div>`;
            notifsListEl.appendChild(item);
        });
    }
});

if (btnRules) btnRules.addEventListener('click', () => rulesModal.classList.remove('hidden'));
if (btnCloseRules) btnCloseRules.addEventListener('click', () => rulesModal.classList.add('hidden'));

if (profileTrigger) {
    profileTrigger.addEventListener('click', () => {
        newNameInput.value = myPlayerName;
        profileModal.classList.remove('hidden');
    });
}
if (btnCloseProfile) btnCloseProfile.addEventListener('click', () => profileModal.classList.add('hidden'));

if (btnSaveName) {
    btnSaveName.addEventListener('click', () => {
        const newName = newNameInput.value.trim();
        if (!newName || newName === myPlayerName) return;
        socket.emit('change_name', { oldName: myPlayerName, newName: newName }, (res) => {
            if (res.error) showNotification(res.error, 'error');
            else { myPlayerName = newName; localStorage.setItem('monopoly_playerName', newName); updateMyProfileUI(); showNotification('Имя успешно изменено!', 'success'); }
        });
    });
}

if (btnUploadAvatar) btnUploadAvatar.addEventListener('click', () => avatarUploadInput.click());
if (avatarUploadInput) avatarUploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas'); const MAX_SIZE = 150; 
            let width = img.width; let height = img.height;
            if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
            canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
            const base64Str = canvas.toDataURL('image/jpeg', 0.8); 
            socket.emit('change_avatar', { name: myPlayerName, avatarBase64: base64Str }, (res) => {
                if (res.error) showNotification(res.error, 'error'); else { myPlayerAvatar = base64Str; updateMyProfileUI(); }
            });
        }; img.src = event.target.result;
    }; reader.readAsDataURL(file);
});

btnCreateRoom.addEventListener('click', () => {
    const rName = newRoomName.value.trim() || 'Комната ' + myPlayerName;
    const rPass = newRoomPass.value.trim();
    socket.emit('create_room', { roomName: rName, password: rPass }, (res) => {
        if (res.ok) joinGameRoom(res.roomId, rPass);
    });
});

socket.on('lobby_update', (data) => {
    roomsListEl.innerHTML = '';
    if (data.rooms.length === 0) { roomsListEl.innerHTML = '<p style="color:#bdc3c7; text-align:center;">Нет активных комнат. Создайте свою!</p>'; } 
    else {
        data.rooms.forEach(room => {
            const item = document.createElement('div'); item.className = 'room-item'; const passIcon = room.hasPassword ? '🔒' : '🔓';
            item.innerHTML = `<div class="room-info"><span class="room-name">${room.name} ${passIcon}</span><span class="room-meta">Игроков: ${room.playersCount}</span></div><button class="btn-primary" style="padding: 6px 12px;">Войти</button>`;
            item.querySelector('button').onclick = () => { let pass = ''; if (room.hasPassword) { pass = prompt(`Введите пароль для комнаты "${room.name}":`); if (pass === null) return; } joinGameRoom(room.id, pass); };
            roomsListEl.appendChild(item);
        });
    }

    leaderboardListEl.innerHTML = '';
    data.leaderboard.forEach((user, index) => {
        const item = document.createElement('div'); item.className = 'leaderboard-item'; let medal = '';
        if (index === 0) medal = '🥇 '; else if (index === 1) medal = '🥈 '; else if (index === 2) medal = '🥉 ';
        const ava = user.avatar || DEFAULT_AVATAR;
        item.innerHTML = `<div style="display:flex; align-items:center; gap:10px;"><span style="width:25px; text-align:center;">${medal}</span><img src="${ava}" style="width:30px; height:30px; border-radius:50%; object-fit:cover; border:1px solid rgba(255,255,255,0.2);"><span>${user.name}</span></div><span>${user.wins} 🏆</span>`;
        leaderboardListEl.appendChild(item);
    });
});

function joinGameRoom(roomId, password) {
    socket.emit('join_room', { room: roomId, password: password, name: myPlayerName }, (res) => {
        if (res.error) { showNotification(res.error, 'error'); return; }
        if (res.ok) {
            myPlayerId = res.playerId; currentRoom = roomId;
            localStorage.setItem('monopoly_currentRoom', currentRoom);
            localStorage.setItem('monopoly_playerId', myPlayerId);
            showGameScreen();
            if (currentGameState) renderGame(); 
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
    if (currentGameState.isFirstTurn) { showNotification('В самом начале игры брать карты из колоды нельзя (у вас их уже 7)!', 'error'); return; }
    if (hasDrawnThisTurn) { showNotification('Вы уже брали карты в этом ходу!', 'error'); return; }
    const myHandCount = currentGameState.players[myPlayerId].hand.length;
    hasDrawnThisTurn = true; 
    socket.emit('intent_draw', { room: currentRoom, playerId: myPlayerId, count: (myHandCount === 0 ? 5 : 2) });
});

btnEndTurn.addEventListener('click', () => {
    if (currentGameState.turnPlayerId !== myPlayerId) return;

    if (!hasDrawnThisTurn && !currentGameState.isFirstTurn) {
        showNotification('Вы не можете завершить ход, не взяв карты из колоды!', 'error');
        return;
    }

    const myHandCount = currentGameState.players[myPlayerId].hand.length;
    if (myHandCount > 7) {
        showNotification("У вас слишком много карт в руке. Сбросьте лишние в сброс или разыграйте их, чтобы осталось не более 7!", 'error');
        return;
    }

    socket.emit('intent_end_turn', { room: currentRoom, playerId: myPlayerId });
});

socket.on('game_state', (state) => {
    if (state.turnPlayerId !== currentTurnPlayerId) { 
        if (currentTurnPlayerId !== null) { playSound(sfxAlert); }
        currentTurnPlayerId = state.turnPlayerId; 
        if (currentTurnPlayerId === myPlayerId) { showNotification('Ваш ход! Не забудьте взять карты.', 'info'); }
    }
    
    hasDrawnThisTurn = state.hasDrawnThisTurn; 
    currentGameState = state;
    btnStart.disabled = state.deckCount < 106 && state.deckCount > 0;
    renderGame();
});

// --- ПЕРЕТАСКИВАНИЕ ---
document.addEventListener('pointermove', (e) => {
    if (!draggedCard) return;
    
    if (!isDragging) {
        if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) {
            isDragging = true; 
            draggedCard.classList.add('dragging'); 
            const x = e.clientX - shiftX;
            const y = e.clientY - shiftY;
            draggedCard.style.transform = `translate(${x}px, ${y}px) scale(1.1) rotate(-2deg)`;
        } else return; 
    } else {
        const x = e.clientX - shiftX;
        const y = e.clientY - shiftY;
        draggedCard.style.transform = `translate(${x}px, ${y}px) scale(1.1) rotate(-2deg)`;
    }

    draggedCard.style.visibility = 'hidden'; 
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY); 
    draggedCard.style.visibility = 'visible';
    
    const zone = elementBelow?.closest('.board-section, #action-zone, #discard-pile');
    document.querySelectorAll('.board-section, #action-zone, #discard-pile').forEach(el => el.classList.remove('drag-over'));
    if (zone && (zone.id === 'player-bank' || zone.id === 'player-properties' || zone.id === 'action-zone' || zone.id === 'discard-pile')) zone.classList.add('drag-over');
});

document.addEventListener('pointerup', (e) => {
    if (!draggedCard) return;
    const tempCard = draggedCard; 
    const wasDragging = isDragging;
    
    draggedCard.style.visibility = 'hidden'; 
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY); 
    draggedCard.style.visibility = 'visible';
    
    const zone = elementBelow?.closest('.board-section, #action-zone, #discard-pile');
    document.querySelectorAll('.board-section, #action-zone, #discard-pile').forEach(el => el.classList.remove('drag-over'));
    
    const cardId = tempCard.dataset.id; 
    const origin = tempCard.dataset.origin; 
    const currentColorFull = tempCard.dataset.currentColorFull; // Добавлено для работы с суффиксами
    const cardData = allCardsData.find(c => c.id === cardId); 
    
    const tempOriginalRect = originalCardRect; 

    draggedCard = null; 
    isDragging = false; 

    if (!wasDragging) { 
        tempCard.classList.remove('dragging'); 
        tempCard.style.cssText = ''; 
        renderGame(); 
        return; 
    }

    const returnCardToHand = () => {
        tempCard.classList.add('returning'); 
        tempCard.style.transform = `translate(${tempOriginalRect.left}px, ${tempOriginalRect.top}px) scale(1) rotate(0deg)`; 

        setTimeout(() => { 
            if (tempCard && tempCard.parentNode) { 
                tempCard.classList.remove('dragging', 'returning'); 
                tempCard.style.cssText = ''; 
            } 
            renderGame(); 
        }, 300);
    };

    // 🔥 ЗАЩИТА ОТ КРАША ИГРЫ: Если данных карты нет, просто возвращаем её в руку и прерываем код
    if (!cardData) {
        showNotification('Данные карты еще загружаются, подождите секунду!', 'info');
        return returnCardToHand();
    }

    if (zone) {
        playSound(sfxPlay);
        const callback = (res) => { if (res && res.error) { showNotification(res.error, 'error'); returnCardToHand(); } };
        if (origin === 'table') {
            if (zone.id === 'player-properties') {
                const targetStack = elementBelow?.closest('.card-stack'); let targetColorFull = null;
                if (targetStack && targetStack.id.startsWith('prop-my-')) targetColorFull = targetStack.id.replace('prop-my-', '');
                const targetColorBase = targetColorFull ? targetColorFull.split('_')[0] : null;

                let availableColors = cardData.colors.includes('any') ? Object.keys(bgColors) : cardData.colors;
                if (targetColorFull && targetColorFull !== currentColorFull && availableColors.includes(targetColorBase)) { 
                    socket.emit('flip_property', { room: currentRoom, playerId: myPlayerId, cardId: cardId, newColor: targetColorFull }, callback); 
                } else returnCardToHand();
            } else returnCardToHand(); 
            return;
        }

        if (origin === 'hand') {
            if (cardData.action_type === 'just_say_no' && zone.id !== 'discard-pile' && zone.id !== 'player-bank') { 
                showNotification('Карту "НЕТ" можно положить в Банк, использовать в окне защиты или скинуть в сброс!', 'error'); 
                return returnCardToHand(); 
            }
            if (zone.id === 'discard-pile') {
                const myHandCount = currentGameState.players[myPlayerId].hand.length;
                if (myHandCount <= 7) {
                    showNotification('В сброс можно выкидывать карты, только если на руках их строго больше 7!', 'error');
                    return returnCardToHand();
                }
                socket.emit('intent_discard', { room: currentRoom, playerId: myPlayerId, cardId: cardId }, callback);
            } else if (zone.id === 'player-bank') {
                if (cardData.type === 'property' || cardData.type === 'property_wild') { showNotification('Недвижимость нельзя класть в Банк!', 'error'); return returnCardToHand(); }
                socket.emit('intent_move_to_bank', { room: currentRoom, playerId: myPlayerId, cardId: cardId }, callback);
            } else if (zone.id === 'player-properties') {
                if (cardData.type !== 'property' && cardData.type !== 'property_wild') { showNotification('Сюда можно класть только недвижимость!', 'error'); return returnCardToHand(); }
                const targetStack = elementBelow?.closest('.card-stack'); let targetColorFull = null;
                if (targetStack && targetStack.id.startsWith('prop-my-')) targetColorFull = targetStack.id.replace('prop-my-', '');
                const targetColorBase = targetColorFull ? targetColorFull.split('_')[0] : null;

                if (cardData && cardData.type === 'property_wild') {
                    let availableColors = cardData.colors.includes('any') ? Object.keys(bgColors) : cardData.colors;
                    if (targetColorFull && availableColors.includes(targetColorBase)) socket.emit('play_property', { room: currentRoom, playerId: myPlayerId, cardId: cardId, chosenColor: targetColorFull }, callback);
                    else openWildColorModal(cardId, cardData, returnCardToHand, false);
                } else socket.emit('play_property', { room: currentRoom, playerId: myPlayerId, cardId: cardId }, callback);
            } else if (zone.id === 'action-zone') {
                if (cardData.type !== 'action' && cardData.type !== 'rent') {
                    showNotification('Как действие можно разыграть только карты Действий или Ренту!', 'error');
                    return returnCardToHand();
                }
                const type = cardData?.action_type || cardData?.type;
                if (['debt_collector', 'sly_deal', 'forced_deal', 'deal_breaker', 'rent', 'double_the_rent', 'house', 'hotel'].includes(type)) { 
                    openTargetModal(cardId, cardData, type, returnCardToHand); 
                } else {
                    socket.emit('play_action', { room: currentRoom, playerId: myPlayerId, cardId: cardId, opts: {} }, callback);
                }
            }
        }
    } else returnCardToHand();
});

// --- СЕТЕВАЯ ОЧЕРЕДЬ ОКОН ---
let networkModalQueue = []; let isNetworkModalActive = false;
socket.on('action_request', (req) => { networkModalQueue.push({ type: 'action', data: req }); processNetworkModalQueue(); });
socket.on('counter_request', (req) => { networkModalQueue.push({ type: 'counter', data: req }); processNetworkModalQueue(); });
function processNetworkModalQueue() { if (isNetworkModalActive || networkModalQueue.length === 0) return; isNetworkModalActive = true; const item = networkModalQueue.shift(); if (item.type === 'action') buildActionModal(item.data); else if (item.type === 'counter') buildCounterModal(item.data); }
function closeNetworkModal() { targetModal.classList.add('hidden'); isNetworkModalActive = false; processNetworkModalQueue(); }

function buildActionModal(req) {
    playSound(sfxAlert);
    targetModal.classList.remove('hidden'); modalBody.innerHTML = ''; btnCancelAction.style.display = 'none'; 
    let isPayment = false; let amountOwed = req.amount || 0; const fromPlayer = currentGameState.players[req.from]?.name || 'Соперник';
    let actionText = 'применил против вас действие!';
    
    if (req.type === 'sly_deal') actionText = 'хочет украсть вашу недвижимость!'; 
    if (req.type === 'deal_breaker') actionText = 'хочет украсть ваш комплект!'; 
    if (req.type === 'forced_deal') actionText = 'предлагает вынужденный обмен!'; 
    if (req.type === 'debt_collector') { actionText = 'требует 5M долга!'; isPayment = true; } 
    if (req.type === 'birthday') { actionText = 'требует подарок на ДР (2M)!'; isPayment = true; } 
    if (req.type === 'rent' || req.type === 'double_the_rent') { actionText = `требует уплатить ренту (${amountOwed}M)!`; isPayment = true; }
    
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

socket.on('action_resolved', (res) => { 
    if (res.executed === false) {
        showNotification('Действие не принесло результата! (Цель сыграла "Просто скажи Нет", или у нее пустой стол)', 'info'); 
    } 
});

function showPaymentSelection(amountOwed, pendingId) {
    modalBody.innerHTML = ''; const myPlayerInfo = currentGameState.players[myPlayerId];
    let validPaymentCards = []; let totalAssetsValue = 0;
    myPlayerInfo.bank.forEach(cardId => { const cData = allCardsData.find(c => c.id === cardId); const val = cData.bank_value !== undefined ? cData.bank_value : (cData.value || 0); totalAssetsValue += val; validPaymentCards.push({ id: cardId, value: val, color: null }); });
    for (const color in myPlayerInfo.properties) {
        const cards = myPlayerInfo.properties[color]; const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length;
        const baseColor = color.split('_')[0];
        const propCardInfo = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(baseColor));
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
        playSound(sfxCash);
        socket.emit('respond_action', { room: currentRoom, playerId: myPlayerId, pendingId: pendingId, action: 'accept', paymentCards: Array.from(selectedCards) }); 
        closeNetworkModal(); 
    }; modalBody.appendChild(btnConfirmPayment); updateTitle();
}

function openWildColorModal(cardId, cardData, cancelCallback, isFlipping = false, currentColorBase = null) {
    targetModal.classList.remove('hidden'); modalBody.innerHTML = ''; modalTitle.textContent = isFlipping ? 'В какой цвет перевернуть?' : 'Как какой цвет выложить?'; btnCancelAction.style.display = 'block';
    let availableColors = cardData.colors; if (availableColors.includes('any')) availableColors = Object.keys(bgColors); if (isFlipping && currentColorBase) availableColors = availableColors.filter(c => c !== currentColorBase);
    availableColors.forEach(color => { const btn = document.createElement('button'); btn.className = 'modal-btn'; btn.style.background = bgColors[color] || '#3498db'; btn.style.textShadow = '1px 1px 2px black'; btn.textContent = `${colorNames[color] || color}`;
        btn.onclick = () => { targetModal.classList.add('hidden'); if (isFlipping) socket.emit('flip_property', { room: currentRoom, playerId: myPlayerId, cardId: cardId, newColor: color }, (res)=>{if(res.error)cancelCallback();}); else socket.emit('play_property', { room: currentRoom, playerId: myPlayerId, cardId: cardId, chosenColor: color }, (res)=>{if(res.error)cancelCallback();}); }; modalBody.appendChild(btn);
    }); btnCancelAction.onclick = () => { targetModal.classList.add('hidden'); cancelCallback(); };
}

function openTargetModal(actionCardId, cardData, actionType, cancelCallback) {
    targetModal.classList.remove('hidden'); modalBody.innerHTML = ''; btnCancelAction.style.display = 'block'; const myProps = currentGameState.players[myPlayerId].properties;
    
    if (actionType === 'rent' || actionType === 'double_the_rent') {
        modalTitle.textContent = 'За какой набор возьмем ренту?';
        let hasOptions = false;

        for (const propKey in myProps) {
            const baseColor = propKey.split('_')[0]; 
            const cards = myProps[propKey];
            const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length;
            
            let colorMatches = (cardData.colors && cardData.colors.includes('any')) || 
                               actionType === 'double_the_rent' || 
                               (cardData.colors && cardData.colors.includes(baseColor));

            if (propCount > 0 && colorMatches) {
                hasOptions = true;
                const btn = document.createElement('button');
                btn.className = 'modal-btn';
                btn.style.background = bgColors[baseColor] || '#3498db';
                btn.style.textShadow = '1px 1px 2px black';
                
                const suffix = propKey.includes('_') ? ` (Набор #${parseInt(propKey.split('_')[1])+1})` : '';
                btn.textContent = `${colorNames[baseColor] || baseColor}${suffix} - ${propCount} шт.`;

                btn.onclick = () => {
                    const isUniversal = (cardData.colors && cardData.colors.includes('any')) || actionType === 'double_the_rent';
                    if (isUniversal) {
                        modalTitle.textContent = 'С кого возьмем ренту?';
                        modalBody.innerHTML = '';
                        for (const [pId, pInfo] of Object.entries(currentGameState.players)) {
                            if (pId === myPlayerId) continue;
                            const tBtn = document.createElement('button');
                            tBtn.className = 'modal-btn';
                            tBtn.textContent = `Ограбить: ${pInfo.name}`;
                            tBtn.onclick = () => {
                                targetModal.classList.add('hidden');
                                socket.emit('play_action', { room: currentRoom, playerId: myPlayerId, cardId: actionCardId, opts: { color: propKey, targets: [pId] } });
                            };
                            modalBody.appendChild(tBtn);
                        }
                    } else {
                        targetModal.classList.add('hidden');
                        socket.emit('play_action', { room: currentRoom, playerId: myPlayerId, cardId: actionCardId, opts: { color: propKey } });
                    }
                };
                modalBody.appendChild(btn);
            }
        }
        if (!hasOptions) modalBody.innerHTML = '<p style="color:#e74c3c">У вас нет подходящей недвижимости!</p>';

    } else if (actionType === 'house' || actionType === 'hotel') {
        modalTitle.textContent = `Куда поставим ${actionType === 'house' ? 'Дом' : 'Отель'}?`; let hasOptions = false;
        for (const propKey in myProps) { 
            const baseColor = propKey.split('_')[0];
            const cards = myProps[propKey]; const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length; const hasHouse = cards.some(id => id.startsWith('HOUSE')); const hasHotel = cards.some(id => id.startsWith('HOTEL')); const propCardInfo = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(baseColor)); const setSize = propCardInfo ? propCardInfo.set_size : 99;
            if (propCount >= setSize && baseColor !== 'railroad' && baseColor !== 'utility') { 
                if (actionType === 'house' && !hasHouse) { hasOptions = true; createHouseHotelButton(propKey, baseColor, actionCardId, cancelCallback); } 
                else if (actionType === 'hotel' && hasHouse && !hasHotel) { hasOptions = true; createHouseHotelButton(propKey, baseColor, actionCardId, cancelCallback); } 
            } 
        }
        if (!hasOptions) modalBody.innerHTML = `<p style="color:#e74c3c">Нет подходящих полных комплектов!</p>`;
    } else {
        modalTitle.textContent = 'Кого выберем целью?'; let opponentsCount = 0;
        for (const [pId, pInfo] of Object.entries(currentGameState.players)) {
            if (pId === myPlayerId) continue; opponentsCount++; const btn = document.createElement('button'); btn.className = 'modal-btn'; btn.textContent = `Игрок: ${pInfo.name}`;
            btn.onclick = () => {
                if (actionType === 'debt_collector' || actionType === 'birthday') { targetModal.classList.add('hidden'); socket.emit('play_action', { room: currentRoom, playerId: myPlayerId, cardId: actionCardId, opts: { target: pId } }); } 
                else if (actionType === 'deal_breaker') { 
                    modalTitle.textContent = `Какой комплект украдем у ${pInfo.name}?`; modalBody.innerHTML = ''; let hasColors = false; 
                    for (const propKey in pInfo.properties) { 
                        const baseColor = propKey.split('_')[0];
                        const cards = pInfo.properties[propKey]; const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length; const propCardInfo = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(baseColor)); const setSize = propCardInfo ? propCardInfo.set_size : 99; 
                        if (propCount >= setSize) { 
                            hasColors = true; const btnColor = document.createElement('button'); btnColor.className = 'modal-btn'; btnColor.style.background = bgColors[baseColor] || '#8e44ad'; btnColor.style.textShadow = '1px 1px 2px black'; 
                            const suffix = propKey.includes('_') ? ` (Набор #${parseInt(propKey.split('_')[1])+1})` : '';
                            btnColor.textContent = `Украсть набор: ${colorNames[baseColor] || baseColor}${suffix}`; 
                            btnColor.onclick = () => { targetModal.classList.add('hidden'); socket.emit('play_action', { room: currentRoom, playerId: myPlayerId, cardId: actionCardId, opts: { target: pId, color: propKey } }); }; modalBody.appendChild(btnColor); 
                        } 
                    } 
                    if (!hasColors) modalBody.innerHTML = '<p style="color:#e74c3c">У игрока нет полных наборов!</p>'; 
                } 
                else if (actionType === 'sly_deal') { 
                    modalTitle.textContent = `Что украдем у ${pInfo.name}?`; modalBody.innerHTML = ''; let hasProperties = false; 
                    for (const propKey in pInfo.properties) { 
                        const baseColor = propKey.split('_')[0];
                        const cards = pInfo.properties[propKey]; const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length; const propCardInfo = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(baseColor)); const setSize = propCardInfo ? propCardInfo.set_size : 99; 
                        if (propCount > 0 && propCount < setSize) { 
                            cards.forEach(targetCardId => { 
                                if(typeof targetCardId === 'string' && (targetCardId.startsWith('HOUSE_') || targetCardId.startsWith('HOTEL_'))) return; 
                                hasProperties = true; const targetData = allCardsData.find(c => c.id === targetCardId); const cardBtn = document.createElement('button'); cardBtn.className = 'modal-btn'; cardBtn.style.background = bgColors[baseColor] || '#27ae60'; cardBtn.style.textShadow = '1px 1px 2px black'; cardBtn.textContent = `Украсть: ${targetData ? targetData.name : targetCardId}`; 
                                cardBtn.onclick = () => { targetModal.classList.add('hidden'); socket.emit('play_action', { room: currentRoom, playerId: myPlayerId, cardId: actionCardId, opts: { target: pId, targetCardId: targetCardId } }); }; modalBody.appendChild(cardBtn); 
                            }); 
                        } 
                    } 
                    if (!hasProperties) modalBody.innerHTML = '<p style="color:#e74c3c">У игрока нет подходящей недвижимости!</p>'; 
                } 
                else if (actionType === 'forced_deal') { 
                    modalTitle.textContent = `Какую карту ЗАБЕРЕМ у ${pInfo.name}?`; modalBody.innerHTML = ''; let hasProperties = false; 
                    for (const propKey in pInfo.properties) { 
                        const baseColor = propKey.split('_')[0];
                        const cards = pInfo.properties[propKey]; const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length; const propCardInfo = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(baseColor)); const setSize = propCardInfo ? propCardInfo.set_size : 99; 
                        if (propCount > 0 && propCount < setSize) { 
                            cards.forEach(theirCardId => { 
                                if(typeof theirCardId === 'string' && (theirCardId.startsWith('HOUSE_') || theirCardId.startsWith('HOTEL_'))) return; 
                                hasProperties = true; const targetData = allCardsData.find(c => c.id === theirCardId); const cardBtn = document.createElement('button'); cardBtn.className = 'modal-btn'; cardBtn.style.background = bgColors[baseColor] || '#2980b9'; cardBtn.style.textShadow = '1px 1px 2px black'; cardBtn.textContent = `Забрать: ${targetData ? targetData.name : theirCardId}`; 
                                cardBtn.onclick = () => chooseMyCardForForcedDeal(actionCardId, pId, theirCardId, cancelCallback); modalBody.appendChild(cardBtn); 
                            }); 
                        } 
                    } 
                    if (!hasProperties) modalBody.innerHTML = '<p style="color:#e74c3c">У игрока нет недвижимости для обмена!</p>'; 
                }
            }; modalBody.appendChild(btn);
        }
        if (opponentsCount === 0) modalBody.innerHTML = '<p style="color:#e74c3c">Нет других игроков для выбора!</p>';
    } btnCancelAction.onclick = () => { targetModal.classList.add('hidden'); cancelCallback(); };
}

function createHouseHotelButton(propKey, baseColor, actionCardId, cancelCallback) { 
    const btn = document.createElement('button'); btn.className = 'modal-btn'; btn.style.background = bgColors[baseColor]; btn.style.textShadow = '1px 1px 2px black'; 
    const suffix = propKey.includes('_') ? ` (Набор #${parseInt(propKey.split('_')[1])+1})` : '';
    btn.textContent = `Добавить на: ${colorNames[baseColor] || baseColor}${suffix}`; 
    btn.onclick = () => { targetModal.classList.add('hidden'); socket.emit('play_action', { room: currentRoom, playerId: myPlayerId, cardId: actionCardId, opts: { color: propKey } }); }; modalBody.appendChild(btn); 
}

function chooseMyCardForForcedDeal(actionCardId, targetId, theirCardId, cancelCallback) { 
    modalTitle.textContent = `Какую свою карту ОТДАДИМ взамен?`; modalBody.innerHTML = ''; let hasMyProperties = false; const myPlayerInfo = currentGameState.players[myPlayerId]; 
    for (const propKey in myPlayerInfo.properties) { 
        const baseColor = propKey.split('_')[0];
        const cards = myPlayerInfo.properties[propKey]; const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length; const propCardInfo = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(baseColor)); const setSize = propCardInfo ? propCardInfo.set_size : 99; 
        if (propCount > 0 && propCount < setSize) { 
            cards.forEach(myCardId => { 
                if(typeof myCardId === 'string' && (myCardId.startsWith('HOUSE_') || myCardId.startsWith('HOTEL_'))) return; 
                hasMyProperties = true; const cardData = allCardsData.find(c => c.id === myCardId); const myCardBtn = document.createElement('button'); myCardBtn.className = 'modal-btn'; myCardBtn.style.background = bgColors[baseColor] || '#d35400'; myCardBtn.style.textShadow = '1px 1px 2px black'; myCardBtn.textContent = `Отдать: ${cardData ? cardData.name : myCardId}`; 
                myCardBtn.onclick = () => { targetModal.classList.add('hidden'); socket.emit('play_action', { room: currentRoom, playerId: myPlayerId, cardId: actionCardId, opts: { target: targetId, theirCardId: theirCardId, myCardId: myCardId } }); }; modalBody.appendChild(myCardBtn); 
            }); 
        } 
    } 
    if (!hasMyProperties) modalBody.innerHTML = '<p style="color:#e74c3c">У вас нет недвижимости, чтобы совершить обмен!</p>'; 
}

// --- ФУНКЦИИ ДЛЯ ПЕРЕМЕЩЕНИЯ ДОМОВ/ОТЕЛЕЙ ---
function openMoveBuildingModal(cardId, cardData, oldColorFull) {
    const myProps = currentGameState.players[myPlayerId].properties;
    
    // Защита: Нельзя перенести Дом, если сверху стоит Отель
    if (cardData.action_type === 'house' && myProps[oldColorFull].some(id => id.startsWith('HOTEL'))) {
        showNotification('Сначала снимите Отель, прежде чем переносить Дом!', 'error');
        return;
    }

    targetModal.classList.remove('hidden'); 
    modalBody.innerHTML = ''; 
    btnCancelAction.style.display = 'block';
    modalTitle.textContent = `Куда переместить ${cardData.action_type === 'house' ? 'Дом' : 'Отель'}?`;
    
    let hasOptions = false;

    for (const propKey in myProps) {
        if (propKey === oldColorFull) continue; // На свой же цвет не переносим
        
        const baseColor = propKey.split('_')[0];
        const cards = myProps[propKey];
        const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length;
        const hasHouse = cards.some(id => id.startsWith('HOUSE'));
        const hasHotel = cards.some(id => id.startsWith('HOTEL'));
        
        const propCardInfo = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(baseColor));
        const setSize = propCardInfo ? propCardInfo.set_size : 99;

        // Ищем другие полные комплекты
        if (propCount >= setSize && baseColor !== 'railroad' && baseColor !== 'utility') {
            if (cardData.action_type === 'house' && !hasHouse) {
                hasOptions = true; 
                createMoveBuildingButton(propKey, baseColor, cardId, oldColorFull);
            } else if (cardData.action_type === 'hotel' && hasHouse && !hasHotel) {
                hasOptions = true; 
                createMoveBuildingButton(propKey, baseColor, cardId, oldColorFull);
            }
        }
    }

    if (!hasOptions) {
        modalBody.innerHTML = `<p style="color:#e74c3c">У вас нет других подходящих полных комплектов для переноса!</p>`;
    }

    btnCancelAction.onclick = () => { targetModal.classList.add('hidden'); };
}

function createMoveBuildingButton(newColorFull, baseColor, cardId, oldColorFull) {
    const btn = document.createElement('button'); 
    btn.className = 'modal-btn'; 
    btn.style.background = bgColors[baseColor] || '#3498db'; 
    btn.style.textShadow = '1px 1px 2px black'; 
    const suffix = newColorFull.includes('_') ? ` (Набор #${parseInt(newColorFull.split('_')[1])+1})` : '';
    btn.textContent = `Переместить на: ${colorNames[baseColor] || baseColor}${suffix}`;
    
    btn.onclick = () => {
        targetModal.classList.add('hidden');
        socket.emit('move_building', { room: currentRoom, playerId: myPlayerId, cardId: cardId, oldColor: oldColorFull, newColor: newColorFull }, (res) => {
            if (res && res.error) showNotification(res.error, 'error');
        });
    };
    modalBody.appendChild(btn);
}

function createCardElement(cardId, assignedColor = null) {
    const cardData = allCardsData.find(c => c.id === cardId);
    
    // Если данных нет, создаем "заглушку", чтобы карта не была невидимой
    if (!cardData) {
        const errorCard = document.createElement('div');
        errorCard.className = 'card error-card';
        errorCard.innerHTML = `<div class="card-title">ОШИБКА</div><div style="font-size:8px">ID: ${cardId}</div>`;
        errorCard.style.background = 'black';
        errorCard.dataset.id = cardId;
        return errorCard;
    }

    const cardEl = document.createElement('div'); cardEl.className = `card ${cardData.type}`; cardEl.dataset.id = cardId; cardEl.ondragstart = () => false;
    let displayName = cardData.name;
    
    if (!displayName) { 
        if (cardData.type === 'money') displayName = `Деньги ${cardData.value}M`; 
        else if (cardData.type === 'action' || cardData.type === 'rent') { 
            const act = { 'pass_go': 'Пройди Старт', 'sly_deal': 'Хитрая сделка', 'forced_deal': 'Вынужденная сделка', 'deal_breaker': 'Аферист', 'just_say_no': 'Просто скажи Нет', 'debt_collector': 'Сборщик долгов', 'birthday': 'День Рождения', 'double_the_rent': 'Удвой ренту', 'house': 'Дом', 'hotel': 'Отель', 'rent': 'Рента' }; 
            displayName = act[cardData.action_type] || 'Действие'; 
        } else displayName = 'Карта'; 
    }
    
    let colorsText = cardData.colors ? cardData.colors.map(c => colorNames[c] || c).join('/') : ''; 
    let multiColorStripe = ''; 

    // 🔥 ОПРЕДЕЛЯЕМ БАЗОВЫЙ ЦВЕТ (убираем суффиксы _1, _2 и т.д. для стилей)
    const baseColor = assignedColor ? assignedColor.split('_')[0] : null;

    if (assignedColor && assignedColor !== 'unassigned') {
        // Если цвет уже назначен (карта на столе), берем его имя из словаря
        colorsText = `<b style="color: #2c3e50;">(Как: ${colorNames[baseColor] || baseColor})</b>`;
        
        if (bgColors[baseColor]) {
            cardEl.style.borderTopColor = bgColors[baseColor];
            cardEl.style.borderTopWidth = '8px';
        }
    } else if (cardData.colors && cardData.colors.length > 0) {
        // Логика для карт в руке или без назначенного цвета (простая недвижимость и джокеры)
        if (cardData.colors.length === 1 && cardData.colors[0] !== 'any') {
            if (bgColors[cardData.colors[0]]) {
                cardEl.style.borderTopColor = bgColors[cardData.colors[0]];
            }
        } else {
            // Отрисовка градиента для джокеров
            let gradient = '';
            if (cardData.colors[0] === 'any') {
                // Разноцветный (универсальный) джокер
                gradient = 'linear-gradient(to right, #e74c3c, #e67e22, #f1c40f, #2ecc71, #3498db, #8e44ad)';
            } else if (cardData.colors.length === 2) {
                // Двухцветный джокер
                const c1 = bgColors[cardData.colors[0]] || '#000';
                const c2 = bgColors[cardData.colors[1]] || '#000';
                gradient = `linear-gradient(to right, ${c1} 50%, ${c2} 50%)`;
            }
            
            if (gradient) {
                multiColorStripe = `<span style="display: block; position: absolute; top: -5px; left: -2px; right: -2px; height: 5px; background: ${gradient}; border-top-left-radius: 6px; border-top-right-radius: 6px; z-index: 1;"></span>`;
                cardEl.style.borderTopColor = 'transparent';
            }
        }
    }
    
    let valText = cardData.bank_value !== undefined ? cardData.bank_value : (cardData.value || 0);
    let descText = cardData.description ? `<div style="font-size: 8px; color: #555; text-align: center; margin-top: 5px; position: relative; z-index: 2;">${cardData.description}</div>` : '';
    if (cardData.filename) { const imageUrl = cardData.filename.replace('/public', ''); cardEl.style.backgroundImage = `url('${imageUrl}')`; cardEl.style.backgroundSize = 'cover'; cardEl.style.backgroundPosition = 'center'; cardEl.style.backgroundRepeat = 'no-repeat'; cardEl.classList.add('has-image'); }
    cardEl.title = (cardData.name || cardData.action_type || 'Карта');
    cardEl.innerHTML = `${multiColorStripe}<div class="card-title" style="position: relative; z-index: 2;">${displayName}</div><div class="card-colors" style="position: relative; z-index: 2;">${colorsText}</div>${descText}<div class="card-val" style="position: relative; z-index: 2;">${valText}</div>`;
    return cardEl;
}

function renderStack(cardsArr, stackId, containerEl, isMini = false, assignedColorFull = null, isMyTurn = false) {
    if (cardsArr.length === 0) return;
    const stackEl = document.createElement('div'); stackEl.className = `card-stack ${isMini ? 'mini-stack' : ''}`; stackEl.id = stackId; if (expandedStacks.has(stackId)) stackEl.classList.add('expanded');
    stackEl.addEventListener('click', () => { if (expandedStacks.has(stackId)) { expandedStacks.delete(stackId); stackEl.classList.remove('expanded'); } else { expandedStacks.add(stackId); stackEl.classList.add('expanded'); } });
    
    cardsArr.forEach(rawId => {
        let cardId = rawId; if (typeof rawId === 'string') { if (rawId.startsWith('HOUSE_')) cardId = rawId.replace('HOUSE_', ''); else if (rawId.startsWith('HOTEL_')) cardId = rawId.replace('HOTEL_', ''); }
        const cardEl = createCardElement(cardId, assignedColorFull);
        
        if (cardEl) {
            if (isMini) cardEl.classList.add('mini-card'); 
            cardEl.dataset.origin = 'table'; 
            cardEl.dataset.currentColorFull = assignedColorFull; 
            const cardData = allCardsData.find(c => c.id === cardId);
            
            if (isMyTurn && !isMini && cardData) { 
                const baseColor = assignedColorFull ? assignedColorFull.split('_')[0] : null;

                if (cardData.type === 'property_wild') {
                    cardEl.style.cursor = 'grab'; 
                    cardEl.addEventListener('contextmenu', (e) => { 
                        e.preventDefault(); e.stopPropagation(); 
                        openWildColorModal(cardId, cardData, () => {}, true, baseColor); 
                    }); 
                    
                    cardEl.addEventListener('pointerdown', (e) => { 
                        if (e.button === 2) return; 
                        e.stopPropagation(); 
                        if (!isMyTurn) return; 
                        
                        isDragging = false; 
                        startX = e.clientX; 
                        startY = e.clientY; 
                        draggedCard = cardEl; 
                        
                        const rect = cardEl.getBoundingClientRect();
                        shiftX = e.clientX - rect.left;
                        shiftY = e.clientY - rect.top;
                        originalCardRect = rect;
                    }); 
                } 
                // --- Отработка клика по Дому/Отелю ---
                else if (cardData.action_type === 'house' || cardData.action_type === 'hotel') {
                    cardEl.style.cursor = 'pointer'; 
                    cardEl.title = 'Правый клик — переместить здание';
                    cardEl.addEventListener('contextmenu', (e) => { 
                        e.preventDefault(); 
                        e.stopPropagation(); 
                        openMoveBuildingModal(cardId, cardData, assignedColorFull); 
                    });
                }
            }
            stackEl.appendChild(cardEl);
        }
    }); 
    containerEl.appendChild(stackEl);
}

function renderGame() {
    if (!currentGameState || !myPlayerId) return; if (draggedCard) return;
    const myPlayerInfo = currentGameState.players[myPlayerId]; const isMyTurn = currentGameState.turnPlayerId === myPlayerId;
    
    const currentHand = myPlayerInfo.hand;
    const newCardIds = currentHand.filter(id => !previousHand.includes(id));
    previousHand = [...currentHand];

    deckCountEl.textContent = currentGameState.deckCount; discardCountEl.textContent = currentGameState.discardCount; btnEndTurn.disabled = !isMyTurn;
    if (isMyTurn) turnIndicator.textContent = `⭐ ВАШ ХОД! (Сыграно: ${currentGameState.playsThisTurn}/3)`; else turnIndicator.textContent = `⏳ Ходит: ${currentGameState.players[currentGameState.turnPlayerId]?.name || '...'}`;
    
    handContainer.innerHTML = '';
    myPlayerInfo.hand.forEach(cardId => {
        const cardEl = createCardElement(cardId);
        if (cardEl) { 
            cardEl.dataset.origin = 'hand'; 
            if (newCardIds.includes(cardId)) { cardEl.style.opacity = '0'; cardEl.style.transition = 'opacity 0.2s ease, transform 0.2s ease'; }
            
            cardEl.addEventListener('pointerdown', (e) => { 
                if (e.button === 2) return; 
                if (!isMyTurn) { showNotification('Дождитесь своего хода!', 'error'); return; } 
                
                isDragging = false; 
                startX = e.clientX; 
                startY = e.clientY; 
                draggedCard = cardEl; 
                
                const rect = cardEl.getBoundingClientRect();
                shiftX = e.clientX - rect.left;
                shiftY = e.clientY - rect.top;
                originalCardRect = rect;
            }); 
            
            handContainer.appendChild(cardEl); 
        } else {
            console.error(`[Data Error] Карта с ID ${cardId} не найдена в allCardsData!`);
        }
    });

    const renderedCards = handContainer.querySelectorAll('.card').length;
    if (renderedCards !== myPlayerInfo.hand.length) {
        const errorMsg = `Ошибка синхронизации! В массиве ${myPlayerInfo.hand.length} карт, а отрисовано ${renderedCards}.`;
        console.warn(errorMsg);
        showNotification(errorMsg, 'error');
    }

    bankCardsEl.innerHTML = ''; renderStack(myPlayerInfo.bank, `bank-my-${myPlayerId}`, bankCardsEl, false, null, isMyTurn);
    propertyCardsEl.innerHTML = ''; for (const propKey in myPlayerInfo.properties) { renderStack(myPlayerInfo.properties[propKey], `prop-my-${propKey}`, propertyCardsEl, false, propKey, isMyTurn); }
    
    opponentsZone.innerHTML = '';
    for (const [pId, pInfo] of Object.entries(currentGameState.players)) {
        if (pId === myPlayerId) continue;
        const oppEl = document.createElement('div'); oppEl.className = 'opponent-board'; const statusColor = pInfo.connected ? '#f39c12' : '#7f8c8d'; 
        oppEl.innerHTML = `<div class="opponent-header" style="color: ${statusColor}"><span class="opp-name">${pInfo.name} ${!pInfo.connected ? '(Откл)' : ''}</span><span class="opp-hand">В руке: ${pInfo.handCount} шт.</span></div><div class="opp-table"><div class="opp-bank"><div class="opp-title">Банк</div><div class="opp-cards" id="opp-bank-${pId}"></div></div><div class="opp-props"><div class="opp-title">Недвижимость</div><div class="opp-cards" id="opp-props-${pId}"></div></div></div>`; opponentsZone.appendChild(oppEl);
        renderStack(pInfo.bank, `bank-opp-${pId}`, document.getElementById(`opp-bank-${pId}`), true);
        for (const propKey in pInfo.properties) { renderStack(pInfo.properties[propKey], `prop-opp-${propKey}-${pId}`, document.getElementById(`opp-props-${pId}`), true, propKey); }
    }
    checkWinCondition();

    if (newCardIds.length > 0) animateDrawnCards(newCardIds);
}

function checkWinCondition() {
    for (const [pId, pInfo] of Object.entries(currentGameState.players)) {
        let fullSetsCount = 0;
        for (const propKey in pInfo.properties) {
            const baseColor = propKey.split('_')[0];
            const cards = pInfo.properties[propKey]; const propCount = cards.filter(id => !(typeof id === 'string' && (id.startsWith('HOUSE') || id.startsWith('HOTEL')))).length;
            const propCard = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(baseColor)); const setSize = propCard ? propCard.set_size : 99;
            if (propCount >= setSize && propCount > 0) fullSetsCount++;
        }
        
        if (fullSetsCount >= 3) {
            if (pId === myPlayerId && !winDeclared) { socket.emit('player_won', { room: currentRoom, playerName: myPlayerName }); winDeclared = true; }
            targetModal.classList.remove('hidden'); btnCancelAction.style.display = 'none'; 
            
            if (pId === myPlayerId) { modalTitle.textContent = '🏆 ВЫ ПОБЕДИЛИ! 🏆'; modalTitle.style.color = '#f1c40f'; modalTitle.style.fontSize = '28px'; } 
            else { modalTitle.textContent = `😭 ПОБЕДИЛ: ${pInfo.name.toUpperCase()} 😭`; modalTitle.style.color = '#e74c3c'; }
            
            modalBody.innerHTML = `<p style="color: white; font-size: 16px; margin-bottom: 20px;">Игра окончена. Собрано 3 полных комплекта недвижимости!</p>`;
            
            const btnExitToLobby = document.createElement('button');
            btnExitToLobby.className = 'modal-btn';
            btnExitToLobby.style.background = '#e74c3c';
            btnExitToLobby.textContent = 'Вернуться в Лобби';
            btnExitToLobby.onclick = () => {
                targetModal.classList.add('hidden');
                socket.emit('leave_room', { room: currentRoom, playerId: myPlayerId });
                currentRoom = null; myPlayerId = null; winDeclared = false;
                localStorage.removeItem('monopoly_currentRoom'); localStorage.removeItem('monopoly_playerId');
                lobbyScreen.classList.remove('hidden'); gameScreen.classList.add('hidden');
                document.querySelector('.game-title').textContent = `Привет, ${myPlayerName}!`;
                socket.emit('req_lobby'); 
            };
            
            modalBody.appendChild(btnExitToLobby);
        }
    }
}

// =========================================
// ЧАТ И ФАЙЛЫ
// =========================================
const btnAttachFile = document.getElementById('btn-attach-file');
const chatFileInput = document.getElementById('chat-file-input');

function sendChatMessage() {
    const text = chatInput.value.trim();
    if (text && currentRoom && myPlayerId) { 
        socket.emit('send_chat_message', { room: currentRoom, playerId: myPlayerId, message: text }); 
        chatInput.value = ''; 
    }
}
btnSendChat.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });

btnAttachFile.addEventListener('click', () => chatFileInput.click());

chatFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
        showNotification('Файл слишком тяжелый! Максимум 8 МБ.', 'error');
        chatFileInput.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const base64Str = event.target.result;
        const text = chatInput.value.trim();
        socket.emit('send_chat_message', { room: currentRoom, playerId: myPlayerId, message: text, imageUrl: base64Str });
        chatInput.value = '';
        chatFileInput.value = ''; 
    };
    reader.readAsDataURL(file); 
});

socket.on('chat_message', ({ sender, text, imageUrl, isSystem }) => {
    const msgEl = document.createElement('div'); msgEl.className = 'chat-msg';
    
    if (isSystem) { 
        msgEl.style.color = '#bdc3c7'; msgEl.style.fontStyle = 'italic'; msgEl.innerHTML = text; 
    } else { 
        let content = `<b>${sender}:</b> `;
        if (text) content += text;
        if (imageUrl) {
            content += `<br><img src="${imageUrl}" class="chat-img-attachment" onclick="window.open('${imageUrl}', '_blank')" title="Нажмите, чтобы открыть">`;
        }
        msgEl.innerHTML = content; 
    }
    
    chatMessages.appendChild(msgEl); 
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (roomChatEl.classList.contains('collapsed')) {
        unreadChatMessages++;
        if (chatUnreadBadge) {
            chatUnreadBadge.textContent = unreadChatMessages > 99 ? '99+' : unreadChatMessages;
            chatUnreadBadge.classList.remove('hidden');
            chatUnreadBadge.classList.remove('badge-pop');
            void chatUnreadBadge.offsetWidth; 
            chatUnreadBadge.classList.add('badge-pop');
        }
    }
});

const chatToggleBubble = document.getElementById('chat-toggle-bubble');
const chatHeader = document.querySelector('.chat-header');
const roomChatEl = document.getElementById('room-chat'); 

function collapseChat() { 
    roomChatEl.classList.add('collapsed'); 
    chatToggleBubble.classList.add('visible'); 
}

function expandChat() { 
    roomChatEl.classList.remove('collapsed'); 
    chatToggleBubble.classList.remove('visible'); 
    unreadChatMessages = 0;
    if (chatUnreadBadge) chatUnreadBadge.classList.add('hidden');
}

chatToggleBubble.addEventListener('click', (e) => { e.stopPropagation(); expandChat(); });
chatHeader.addEventListener('click', (e) => { e.stopPropagation(); collapseChat(); });

const originalSendMessage = sendChatMessage;
sendChatMessage = function() { originalSendMessage(); if (roomChatEl.classList.contains('collapsed')) expandChat(); };

// =========================================
// АНИМАЦИЯ 
// =========================================
function animateDrawnCards(newCardIds) {
    const deckRect = drawPileEl.getBoundingClientRect();
    if (deckRect.width === 0) return; 

    newCardIds.forEach((cardId, index) => {
        setTimeout(() => {
            const realCard = handContainer.querySelector(`.card[data-id="${cardId}"]`);
            if (!realCard) return;
            const targetRect = realCard.getBoundingClientRect();
            
            const flyingCard = createCardElement(cardId);
            flyingCard.className = realCard.className;
            flyingCard.style.position = 'fixed';
            flyingCard.style.left = '0px'; 
            flyingCard.style.top = '0px'; 
            flyingCard.style.pointerEvents = 'none';
            flyingCard.style.transition = 'none'; 
            
            flyingCard.style.width = deckRect.width + 'px';
            flyingCard.style.height = deckRect.height + 'px';
            flyingCard.style.zIndex = '90'; 
            
            document.body.appendChild(flyingCard);
            playSound(sfxDraw);
            
            const xA = deckRect.left; const yA = deckRect.top;
            const xB = targetRect.left; const yB = targetRect.top;
            const distanceX = Math.abs(xB - xA); const midY = (yA + yB) / 2;
            const xP = xA - (distanceX * 0.8); const yP = midY - 50; 
            
            const startTime = performance.now(); const duration = 600; 
            
            function step(currentTime) {
                let progress = (currentTime - startTime) / duration;
                if (progress > 1) progress = 1;
                
                const invT = 1 - progress;
                const currentX = (invT * invT * xA) + (2 * invT * progress * xP) + (progress * progress * xB);
                const currentY = (invT * invT * yA) + (2 * invT * progress * yP) + (progress * progress * yB);
                
                const rotate = progress * 360;
                const scaleW = 1 + (targetRect.width / deckRect.width - 1) * progress;
                const scaleH = 1 + (targetRect.height / deckRect.height - 1) * progress;
                
                flyingCard.style.transform = `translate(${currentX}px, ${currentY}px) rotate(${rotate}deg) scale(${scaleW}, ${scaleH})`;
                
                if (progress < 1) { 
                    requestAnimationFrame(step); 
                } else { 
                    flyingCard.remove(); 
                    if (realCard) {
                        realCard.style.opacity = '1'; 
                        realCard.style.visibility = 'visible'; 
                        realCard.style.transform = 'scale(1.1)'; 
                        setTimeout(() => realCard.style.transform = 'scale(1)', 100); 
                    }
                }
            }
            requestAnimationFrame(step); 
        }, index * 200); 
    });
}