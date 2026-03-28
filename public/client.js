const socket = io();
let myPlayerId = null;
let currentGameState = null;
let allCardsData = [];

let expandedStacks = new Set();

const statusEl = document.getElementById('status');
const turnIndicator = document.getElementById('turn-indicator');
const btnJoin = document.getElementById('btn-join');
const btnStart = document.getElementById('btn-start');
const btnEndTurn = document.getElementById('btn-end-turn');

const handContainer = document.getElementById('player-hand');
const drawPileEl = document.getElementById('draw-pile');
const deckCountEl = document.getElementById('deck-count');
const discardCountEl = document.getElementById('discard-count');
const bankCardsEl = document.getElementById('bank-cards');
const propertyCardsEl = document.getElementById('property-cards');
const opponentsZone = document.getElementById('opponents-zone');

const targetModal = document.getElementById('target-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const btnCancelAction = document.getElementById('btn-cancel-action');

let draggedCard = null;
let shiftX = 0, shiftY = 0;
let originalCardRect = null;
let startX = 0, startY = 0;
let isDragging = false; 
let currentTurnPlayerId = null;
let hasDrawnThisTurn = false;

const colorNames = {
    'brown': 'Коричневый', 'lightblue': 'Голубой', 'pink': 'Розовый',
    'orange': 'Оранжевый', 'red': 'Красный', 'yellow': 'Желтый',
    'green': 'Зеленый', 'darkblue': 'Темно-синий', 'railroad': 'Станции', 
    'utility': 'Предприятия', 'any': 'Разноцветный'
};

const bgColors = {
    'brown': '#8B4513', 'lightblue': '#87CEEB', 'pink': '#FF69B4',
    'orange': '#FF8C00', 'red': '#FF0000', 'yellow': '#FFD700',
    'green': '#008000', 'darkblue': '#00008B', 'railroad': '#000000', 'utility': '#7f8c8d'
};

fetch('/cards_data.json?v=' + new Date().getTime())
    .then(res => res.json())
    .then(data => { allCardsData = data; })
    .catch(err => console.error("Ошибка загрузки колоды:", err));

socket.on('connect', () => { 
    statusEl.textContent = '🟢 Подключено. Ждем входа...'; 
    
    const savedPlayerId = localStorage.getItem('monopoly_playerId');
    const savedPlayerName = localStorage.getItem('monopoly_playerName');
    
    if (savedPlayerId && savedPlayerName) {
        socket.emit('join_room', { room: 'test_room', name: savedPlayerName, playerId: savedPlayerId }, (res) => {
            if (res && res.error === 'session_not_found') {
                localStorage.removeItem('monopoly_playerId');
                statusEl.textContent = '🟢 Сервер перезапущен. Нажмите "Войти".';
            } else if (res && res.ok) {
                myPlayerId = res.playerId;
                localStorage.setItem('monopoly_playerId', myPlayerId);
                
                statusEl.textContent = `🟢 ${savedPlayerName}`;
                btnJoin.disabled = true;
                btnStart.disabled = false;
                
                if (currentGameState) renderGame();
            }
        });
    }
});

btnJoin.addEventListener('click', () => {
    const savedPlayerName = localStorage.getItem('monopoly_playerName') || "Игрок " + Math.floor(Math.random() * 100);
    const playerName = prompt("Введите ваше имя:", savedPlayerName);
    if(!playerName) return;
    
    const savedPlayerId = localStorage.getItem('monopoly_playerId');

    socket.emit('join_room', { room: 'test_room', name: playerName, playerId: savedPlayerId }, (res) => {
        if (res && res.error === 'session_not_found') {
            localStorage.removeItem('monopoly_playerId');
            alert('Сессия устарела (сервер был перезапущен). Нажмите "Войти" еще раз!');
            return;
        }
        if (res && res.ok) {
            myPlayerId = res.playerId;
            localStorage.setItem('monopoly_playerId', myPlayerId);
            localStorage.setItem('monopoly_playerName', playerName);
            
            statusEl.textContent = `🟢 ${playerName}`;
            btnJoin.disabled = true;
            btnStart.disabled = false;
            
            if (currentGameState) renderGame();
        }
    });
});

btnStart.addEventListener('click', () => { socket.emit('start_game', { room: 'test_room' }); });

drawPileEl.addEventListener('click', () => {
    if (!currentGameState || currentGameState.turnPlayerId !== myPlayerId) return;
    if (hasDrawnThisTurn) {
        alert('Вы уже брали карты в начале этого хода! (Если нужно взять еще, используйте карту "Пройди клетку Вперед")');
        return;
    }
    const myHandCount = currentGameState.players[myPlayerId].hand.length;
    const drawCount = myHandCount === 0 ? 5 : 2;
    hasDrawnThisTurn = true; 
    socket.emit('intent_draw', { room: 'test_room', playerId: myPlayerId, count: drawCount });
});

btnEndTurn.addEventListener('click', () => {
    if (currentGameState.turnPlayerId !== myPlayerId) return;
    socket.emit('intent_end_turn', { room: 'test_room', playerId: myPlayerId });
});

socket.on('game_state', (state) => {
    if (state.turnPlayerId !== currentTurnPlayerId) {
        currentTurnPlayerId = state.turnPlayerId;
        hasDrawnThisTurn = false; 
    }
    currentGameState = state;
    renderGame();
});

// --- ПЕРЕТАСКИВАНИЕ ---
document.addEventListener('pointermove', (e) => {
    if (!draggedCard) return;
    if (!isDragging) {
        if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) {
            isDragging = true;
            draggedCard.style.width = originalCardRect.width + 'px';
            draggedCard.style.height = originalCardRect.height + 'px';
            draggedCard.classList.add('dragging');
        } else return; 
    }
    draggedCard.style.left = e.clientX - shiftX + 'px';
    draggedCard.style.top = e.clientY - shiftY + 'px';
    
    draggedCard.style.visibility = 'hidden';
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
    draggedCard.style.visibility = 'visible';
    
    const zone = elementBelow?.closest('.board-section, #action-zone, #discard-pile');
    document.querySelectorAll('.board-section, #action-zone, #discard-pile').forEach(el => el.classList.remove('drag-over'));
    
    if (zone && (zone.id === 'player-bank' || zone.id === 'player-properties' || zone.id === 'action-zone' || zone.id === 'discard-pile')) {
        zone.classList.add('drag-over');
    }
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
    const currentColor = tempCard.dataset.currentColor;
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
        tempCard.style.left = tempOriginalRect.left + 'px';
        tempCard.style.top = tempOriginalRect.top + 'px';
        tempCard.style.transform = 'scale(1) rotate(0deg)';
        setTimeout(() => {
            if (tempCard && tempCard.parentNode) {
                tempCard.classList.remove('dragging', 'returning');
                tempCard.style.cssText = ''; 
            }
            renderGame();
        }, 300);
    };

    if (zone) {
        const callback = handleServerError(returnCardToHand);
        if (origin === 'table') {
            if (zone.id === 'player-properties') {
                const targetStack = elementBelow?.closest('.card-stack');
                let targetColor = null;
                if (targetStack && targetStack.id.startsWith('prop-my-')) targetColor = targetStack.id.replace('prop-my-', '');
                
                let availableColors = cardData.colors.includes('any') ? Object.keys(bgColors) : cardData.colors;
                if (targetColor && targetColor !== currentColor && availableColors.includes(targetColor)) {
                    socket.emit('flip_property', { room: 'test_room', playerId: myPlayerId, cardId: cardId, newColor: targetColor }, callback);
                } else {
                    returnCardToHand();
                }
            } else returnCardToHand(); 
            return;
        }

        if (origin === 'hand') {
            // ИСПРАВЛЕНИЕ: Блокируем разыгрывание "Нет" напрямую на стол
            if (cardData.action_type === 'just_say_no' && zone.id !== 'discard-pile') {
                alert('Карту "Просто скажи НЕТ" можно разыграть только в ответ на действие противника во всплывающем окне!');
                return returnCardToHand();
            }

            if (zone.id === 'discard-pile') {
                socket.emit('intent_discard', { room: 'test_room', playerId: myPlayerId, cardId: cardId }, callback);
            } else if (zone.id === 'player-bank') {
                if (cardData.type === 'property' || cardData.type === 'property_wild') {
                    alert('Недвижимость нельзя класть в Банк!');
                    return returnCardToHand();
                }
                socket.emit('intent_move_to_bank', { room: 'test_room', playerId: myPlayerId, cardId: cardId }, callback);
            } else if (zone.id === 'player-properties') {
                if (cardData.type !== 'property' && cardData.type !== 'property_wild') {
                    alert('В зону недвижимости можно класть только карточки недвижимости!');
                    return returnCardToHand();
                }

                const targetStack = elementBelow?.closest('.card-stack');
                let targetColor = null;
                if (targetStack && targetStack.id.startsWith('prop-my-')) targetColor = targetStack.id.replace('prop-my-', '');
                if (cardData && cardData.type === 'property_wild') {
                    let availableColors = cardData.colors.includes('any') ? Object.keys(bgColors) : cardData.colors;
                    if (targetColor && availableColors.includes(targetColor)) {
                        socket.emit('play_property', { room: 'test_room', playerId: myPlayerId, cardId: cardId, chosenColor: targetColor }, callback);
                    } else openWildColorModal(cardId, cardData, returnCardToHand, false);
                } else socket.emit('play_property', { room: 'test_room', playerId: myPlayerId, cardId: cardId }, callback);
            } else if (zone.id === 'action-zone') {
                const type = cardData?.action_type || cardData?.type;
                if (['debt_collector', 'sly_deal', 'forced_deal', 'deal_breaker', 'rent', 'double_the_rent', 'house', 'hotel', 'birthday'].includes(type)) {
                    openTargetModal(cardId, cardData, type, returnCardToHand);
                } else socket.emit('play_action', { room: 'test_room', playerId: myPlayerId, cardId: cardId, opts: {} }, callback);
            }
        }
    } else returnCardToHand();
});

// ==========================================
// НОВАЯ СИСТЕМА: ОЧЕРЕДЬ МОДАЛЬНЫХ ОКОН
// ==========================================
let networkModalQueue = [];
let isNetworkModalActive = false;

socket.on('action_request', (req) => {
    networkModalQueue.push({ type: 'action', data: req });
    processNetworkModalQueue();
});

socket.on('counter_request', (req) => {
    networkModalQueue.push({ type: 'counter', data: req });
    processNetworkModalQueue();
});

function processNetworkModalQueue() {
    if (isNetworkModalActive || networkModalQueue.length === 0) return;
    isNetworkModalActive = true;
    
    const item = networkModalQueue.shift();
    if (item.type === 'action') buildActionModal(item.data);
    else if (item.type === 'counter') buildCounterModal(item.data);
}

function closeNetworkModal() {
    targetModal.classList.add('hidden');
    isNetworkModalActive = false;
    processNetworkModalQueue(); // Открываем следующее окно, если есть
}

// Построение окна "На вас напали!"
function buildActionModal(req) {
    targetModal.classList.remove('hidden');
    modalBody.innerHTML = '';
    btnCancelAction.style.display = 'none'; 

    let isPayment = false;
    let amountOwed = req.amount || 0; 
    const fromPlayer = currentGameState.players[req.from]?.name || 'Соперник';

    let actionText = 'применил против вас действие!';
    if (req.type === 'sly_deal') actionText = 'пытается украсть вашу недвижимость!';
    if (req.type === 'deal_breaker') actionText = 'пытается украсть ваш полный комплект!';
    if (req.type === 'forced_deal') actionText = 'предлагает вынужденный обмен!';
    if (req.type === 'debt_collector') { actionText = 'требует у вас 5M долга!'; isPayment = true; }
    if (req.type === 'birthday') { actionText = 'требует подарок на День Рождения (2M)!'; isPayment = true; }
    if (req.type === 'rent') { actionText = `требует уплатить ренту (${amountOwed}M)!`; isPayment = true; }

    // Если это контр-удар!
    if (req.counterNo) {
        actionText = 'ОТВЕТИЛ СВОИМ "НЕТ" на ваше "НЕТ"! Действие снова в силе!';
    }

    modalTitle.textContent = `⚠️ ВНИМАНИЕ! ${fromPlayer} ${actionText}`;

    const myHand = currentGameState.players[myPlayerId].hand;
    const justSayNoCards = myHand.filter(cardId => {
        const c = allCardsData.find(data => data.id === cardId);
        return c && c.action_type === 'just_say_no';
    });

    if (justSayNoCards.length > 0) {
        const btnNo = document.createElement('button');
        btnNo.className = 'modal-btn';
        btnNo.style.background = '#e74c3c';
        btnNo.textContent = '🛑 Сыграть: Просто скажи "НЕТ"!';
        btnNo.onclick = () => {
            socket.emit('respond_action', { room: 'test_room', playerId: myPlayerId, pendingId: req.id, action: 'decline', playedJustSayNoCardId: justSayNoCards[0] });
            closeNetworkModal();
        };
        modalBody.appendChild(btnNo);
    }

    if (isPayment) {
        const btnPay = document.createElement('button');
        btnPay.className = 'modal-btn';
        btnPay.style.background = '#f39c12';
        btnPay.textContent = `Выбрать карты для оплаты (${amountOwed}M)`;
        btnPay.onclick = () => showPaymentSelection(amountOwed, req.id);
        modalBody.appendChild(btnPay);
    } else {
        const btnAccept = document.createElement('button');
        btnAccept.className = 'modal-btn';
        btnAccept.style.background = '#27ae60';
        btnAccept.textContent = 'Смириться (Принять)';
        btnAccept.onclick = () => {
            socket.emit('respond_action', { room: 'test_room', playerId: myPlayerId, pendingId: req.id, action: 'accept' });
            closeNetworkModal();
        };
        modalBody.appendChild(btnAccept);
    }
}

// Построение окна для Атакующего: "Ваша жертва сопротивляется!"
function buildCounterModal(req) {
    targetModal.classList.remove('hidden');
    modalBody.innerHTML = '';
    btnCancelAction.style.display = 'none';

    modalTitle.textContent = `Игрок ${req.fromName} сыграл "Просто скажи НЕТ"!`;

    const myHand = currentGameState.players[myPlayerId].hand;
    const justSayNoCards = myHand.filter(cardId => {
        const c = allCardsData.find(data => data.id === cardId);
        return c && c.action_type === 'just_say_no';
    });

    // У Атакующего тоже есть карта "Нет"!
    if (justSayNoCards.length > 0) {
        const btnNo = document.createElement('button');
        btnNo.className = 'modal-btn';
        btnNo.style.background = '#e74c3c';
        btnNo.textContent = '🛑 Контр-удар! Сыграть своё "НЕТ"!';
        btnNo.onclick = () => {
            // Передаем targetId, чтобы сервер знал, кому мы пробиваем защиту
            socket.emit('respond_action', { room: 'test_room', playerId: myPlayerId, pendingId: req.id, action: 'decline', playedJustSayNoCardId: justSayNoCards[0], targetId: req.targetId });
            closeNetworkModal();
        };
        modalBody.appendChild(btnNo);
    }

    const btnAccept = document.createElement('button');
    btnAccept.className = 'modal-btn';
    btnAccept.style.background = '#27ae60';
    btnAccept.textContent = 'Смириться (Ваше действие отменено)';
    btnAccept.onclick = () => {
        socket.emit('respond_action', { room: 'test_room', playerId: myPlayerId, pendingId: req.id, action: 'accept', targetId: req.targetId });
        closeNetworkModal();
    };
    modalBody.appendChild(btnAccept);
}

socket.on('action_resolved', (res) => {
    // Показываем алерт только если действие было отменено картой "Нет"
    if (res.executed === false) {
        alert('Действие было полностью отменено картой "Просто скажи Нет"!');
    }
});
// ==========================================


// МЕНЮ ВЫБОРА КАРТ ДЛЯ ОПЛАТЫ ДОЛГА
function showPaymentSelection(amountOwed, pendingId) {
    modalBody.innerHTML = '';
    const myPlayerInfo = currentGameState.players[myPlayerId];
    
    let validPaymentCards = [];
    let totalAssetsValue = 0;

    myPlayerInfo.bank.forEach(cardId => {
        const cData = allCardsData.find(c => c.id === cardId);
        const val = cData.bank_value !== undefined ? cData.bank_value : (cData.value || 0);
        totalAssetsValue += val;
        validPaymentCards.push({ id: cardId, value: val, color: null });
    });

    for (const color in myPlayerInfo.properties) {
        const cards = myPlayerInfo.properties[color];
        const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length;
        const propCardInfo = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(color));
        const setSize = propCardInfo ? propCardInfo.set_size : 99;

        if (propCount > 0 && propCount < setSize) {
            cards.forEach(cardId => {
                if(!cardId.startsWith('HOUSE') && !cardId.startsWith('HOTEL')) {
                    const cData = allCardsData.find(c => c.id === cardId);
                    const val = cData.bank_value || 0;
                    totalAssetsValue += val;
                    validPaymentCards.push({ id: cardId, value: val, color: color });
                }
            });
        }
    }

    let selectedCards = new Set();
    let currentSelectedValue = 0;

    const updateTitle = () => {
        modalTitle.textContent = `К оплате: ${amountOwed}M | Выбрано: ${currentSelectedValue}M`;
        const canPay = currentSelectedValue >= amountOwed || (currentSelectedValue === totalAssetsValue && totalAssetsValue > 0) || totalAssetsValue === 0;
        btnConfirmPayment.disabled = !canPay;
        btnConfirmPayment.style.opacity = canPay ? '1' : '0.5';
    };

    const paymentGrid = document.createElement('div');
    paymentGrid.style.display = 'flex';
    paymentGrid.style.flexWrap = 'wrap';
    paymentGrid.style.justifyContent = 'center';
    paymentGrid.style.gap = '5px';
    paymentGrid.style.maxHeight = '300px';
    paymentGrid.style.overflowY = 'auto';
    paymentGrid.style.marginBottom = '15px';

    if (validPaymentCards.length === 0) {
        paymentGrid.innerHTML = '<p style="color:#e74c3c; width:100%;">У вас нет средств. Вы объявляете банкротство и ничего не платите!</p>';
    } else {
        validPaymentCards.forEach(item => {
            const cardEl = createCardElement(item.id, item.color);
            cardEl.style.transform = 'scale(0.8)';
            cardEl.style.margin = '0';
            cardEl.style.cursor = 'pointer';
            cardEl.style.transition = 'all 0.2s';
            cardEl.style.border = '2px solid transparent';

            cardEl.onclick = () => {
                if (selectedCards.has(item.id)) {
                    selectedCards.delete(item.id);
                    currentSelectedValue -= item.value;
                    cardEl.style.border = '2px solid transparent';
                    cardEl.style.boxShadow = 'none';
                    cardEl.style.transform = 'scale(0.8)';
                } else {
                    selectedCards.add(item.id);
                    currentSelectedValue += item.value;
                    cardEl.style.border = '2px solid #2ecc71';
                    cardEl.style.boxShadow = '0 0 10px #2ecc71';
                    cardEl.style.transform = 'scale(0.85)';
                }
                updateTitle();
            };
            paymentGrid.appendChild(cardEl);
        });
    }

    modalBody.appendChild(paymentGrid);

    const btnConfirmPayment = document.createElement('button');
    btnConfirmPayment.className = 'modal-btn';
    btnConfirmPayment.style.background = '#27ae60';
    btnConfirmPayment.textContent = 'Подтвердить оплату';
    btnConfirmPayment.onclick = () => {
        socket.emit('respond_action', { 
            room: 'test_room', 
            playerId: myPlayerId, 
            pendingId: pendingId, 
            action: 'accept',
            paymentCards: Array.from(selectedCards) 
        });
        closeNetworkModal();
    };
    
    modalBody.appendChild(btnConfirmPayment);
    updateTitle();
}

// --- ОКНА ВЫБОРА ---
function openWildColorModal(cardId, cardData, cancelCallback, isFlipping = false, currentColor = null) {
    targetModal.classList.remove('hidden');
    modalBody.innerHTML = '';
    modalTitle.textContent = isFlipping ? 'В какой цвет перевернуть карту?' : 'Как какой цвет выложить?';
    btnCancelAction.style.display = 'block';

    let availableColors = cardData.colors;
    if (availableColors.includes('any')) availableColors = Object.keys(bgColors); 
    if (isFlipping && currentColor) availableColors = availableColors.filter(c => c !== currentColor);

    availableColors.forEach(color => {
        const btn = document.createElement('button');
        btn.className = 'modal-btn';
        btn.style.background = bgColors[color] || '#3498db';
        btn.style.textShadow = '1px 1px 2px black'; 
        btn.textContent = `${isFlipping ? 'Перевернуть в' : 'Положить как'}: ${colorNames[color] || color}`;
        
        btn.onclick = () => {
            targetModal.classList.add('hidden');
            if (isFlipping) socket.emit('flip_property', { room: 'test_room', playerId: myPlayerId, cardId: cardId, newColor: color }, handleServerError(cancelCallback));
            else socket.emit('play_property', { room: 'test_room', playerId: myPlayerId, cardId: cardId, chosenColor: color }, handleServerError(cancelCallback));
        };
        modalBody.appendChild(btn);
    });
    btnCancelAction.onclick = () => { targetModal.classList.add('hidden'); cancelCallback(); };
}

function openTargetModal(actionCardId, cardData, actionType, cancelCallback) {
    targetModal.classList.remove('hidden');
    modalBody.innerHTML = '';
    btnCancelAction.style.display = 'block';

    const myProps = currentGameState.players[myPlayerId].properties;

    if (actionType === 'rent' || actionType === 'double_the_rent') {
        modalTitle.textContent = actionType === 'double_the_rent' ? 'УДВОЕННАЯ РЕНТА: За какой цвет берем?' : 'За какой цвет возьмем ренту?';
        
        let availableColors = (cardData.colors && cardData.colors.includes('any')) || actionType === 'double_the_rent' ? Object.keys(bgColors) : (cardData.colors || Object.keys(bgColors));
        let validColors = availableColors.filter(c => myProps[c] && myProps[c].filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length > 0);

        if (validColors.length === 0) {
            modalBody.innerHTML = '<p style="color:#e74c3c">У вас нет недвижимости этих цветов!</p>';
        } else {
            validColors.forEach(color => {
                const btn = document.createElement('button');
                btn.className = 'modal-btn';
                btn.style.background = bgColors[color] || '#3498db';
                btn.style.textShadow = '1px 1px 2px black';

                const isUniversal = (cardData.colors && cardData.colors.includes('any')) || actionType === 'double_the_rent';

                if (isUniversal) {
                    btn.textContent = `Взять ренту за ${colorNames[color] || color} (с одного игрока)`;
                    btn.onclick = () => {
                        modalTitle.textContent = 'С кого возьмем ренту?';
                        modalBody.innerHTML = '';
                        for (const [pId, pInfo] of Object.entries(currentGameState.players)) {
                            if (pId === myPlayerId) continue;
                            const tBtn = document.createElement('button');
                            tBtn.className = 'modal-btn';
                            tBtn.textContent = `Ограбить: ${pInfo.name}`;
                            tBtn.onclick = () => {
                                targetModal.classList.add('hidden');
                                socket.emit('play_action', { room: 'test_room', playerId: myPlayerId, cardId: actionCardId, opts: { color: color, targets: [pId] } }, handleServerError(cancelCallback));
                            };
                            modalBody.appendChild(tBtn);
                        }
                    };
                } else {
                    btn.textContent = `Взять ренту СО ВСЕХ за ${colorNames[color] || color}`;
                    btn.onclick = () => {
                        targetModal.classList.add('hidden');
                        socket.emit('play_action', { room: 'test_room', playerId: myPlayerId, cardId: actionCardId, opts: { color: color } }, handleServerError(cancelCallback));
                    };
                }
                modalBody.appendChild(btn);
            });
        }
    } 
    else if (actionType === 'house' || actionType === 'hotel') {
        modalTitle.textContent = `Куда поставим ${actionType === 'house' ? 'Дом' : 'Отель'}?`;
        let hasOptions = false;

        for (const color in myProps) {
            const cards = myProps[color];
            const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length;
            const hasHouse = cards.some(id => id.startsWith('HOUSE'));
            const hasHotel = cards.some(id => id.startsWith('HOTEL'));

            const propCardInfo = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(color));
            const setSize = propCardInfo ? propCardInfo.set_size : 99;

            if (propCount >= setSize && color !== 'railroad' && color !== 'utility') {
                if (actionType === 'house' && !hasHouse) {
                    hasOptions = true;
                    createHouseHotelButton(color, actionCardId, cancelCallback);
                } else if (actionType === 'hotel' && hasHouse && !hasHotel) {
                    hasOptions = true;
                    createHouseHotelButton(color, actionCardId, cancelCallback);
                }
            }
        }
        if (!hasOptions) modalBody.innerHTML = `<p style="color:#e74c3c">Нет подходящих полных комплектов!</p>`;
    }
    else {
        modalTitle.textContent = 'Кого выберем целью?';
        let opponentsCount = 0;
        for (const [pId, pInfo] of Object.entries(currentGameState.players)) {
            if (pId === myPlayerId) continue;
            opponentsCount++;
            const btn = document.createElement('button');
            btn.className = 'modal-btn';
            btn.textContent = `Игрок: ${pInfo.name}`;
            
            btn.onclick = () => {
                if (actionType === 'debt_collector' || actionType === 'birthday') {
                    targetModal.classList.add('hidden');
                    socket.emit('play_action', { room: 'test_room', playerId: myPlayerId, cardId: actionCardId, opts: { target: pId } }, handleServerError(cancelCallback));
                } else if (actionType === 'deal_breaker') {
                    modalTitle.textContent = `Какой комплект украдем у ${pInfo.name}?`;
                    modalBody.innerHTML = '';
                    let hasColors = false;
                    for (const color in pInfo.properties) {
                        const cards = pInfo.properties[color];
                        const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length;
                        const propCardInfo = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(color));
                        const setSize = propCardInfo ? propCardInfo.set_size : 99;

                        if (propCount >= setSize) {
                            hasColors = true;
                            const btnColor = document.createElement('button');
                            btnColor.className = 'modal-btn';
                            btnColor.style.background = bgColors[color] || '#8e44ad';
                            btnColor.style.textShadow = '1px 1px 2px black';
                            btnColor.textContent = `Украсть набор: ${colorNames[color] || color}`;
                            btnColor.onclick = () => {
                                targetModal.classList.add('hidden');
                                socket.emit('play_action', { room: 'test_room', playerId: myPlayerId, cardId: actionCardId, opts: { target: pId, color: color } }, handleServerError(cancelCallback));
                            };
                            modalBody.appendChild(btnColor);
                        }
                    }
                    if (!hasColors) modalBody.innerHTML = '<p style="color:#e74c3c">У игрока нет полных наборов!</p>';
                } else if (actionType === 'sly_deal') {
                    modalTitle.textContent = `Что украдем у ${pInfo.name}?`;
                    modalBody.innerHTML = '';
                    let hasProperties = false;
                    for (const color in pInfo.properties) {
                        const cards = pInfo.properties[color];
                        const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length;
                        const propCardInfo = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(color));
                        const setSize = propCardInfo ? propCardInfo.set_size : 99;

                        if (propCount > 0 && propCount < setSize) {
                            cards.forEach(targetCardId => {
                                if(typeof targetCardId === 'string' && (targetCardId.startsWith('HOUSE_') || targetCardId.startsWith('HOTEL_'))) return;
                                hasProperties = true;
                                const targetData = allCardsData.find(c => c.id === targetCardId);
                                const cardBtn = document.createElement('button');
                                cardBtn.className = 'modal-btn';
                                cardBtn.style.background = bgColors[color] || '#27ae60';
                                cardBtn.style.textShadow = '1px 1px 2px black';
                                cardBtn.textContent = `Украсть: ${targetData ? targetData.name : targetCardId}`;
                                cardBtn.onclick = () => {
                                    targetModal.classList.add('hidden');
                                    socket.emit('play_action', { room: 'test_room', playerId: myPlayerId, cardId: actionCardId, opts: { target: pId, targetCardId: targetCardId } }, handleServerError(cancelCallback));
                                };
                                modalBody.appendChild(cardBtn);
                            });
                        }
                    }
                    if (!hasProperties) modalBody.innerHTML = '<p style="color:#e74c3c">У игрока нет подходящей недвижимости!</p>';
                } else if (actionType === 'forced_deal') {
                    modalTitle.textContent = `Какую карту ЗАБЕРЕМ у ${pInfo.name}?`;
                    modalBody.innerHTML = '';
                    let hasProperties = false;
                    for (const color in pInfo.properties) {
                        const cards = pInfo.properties[color];
                        const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length;
                        const propCardInfo = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(color));
                        const setSize = propCardInfo ? propCardInfo.set_size : 99;

                        if (propCount > 0 && propCount < setSize) {
                            cards.forEach(theirCardId => {
                                if(typeof theirCardId === 'string' && (theirCardId.startsWith('HOUSE_') || theirCardId.startsWith('HOTEL_'))) return;
                                hasProperties = true;
                                const targetData = allCardsData.find(c => c.id === theirCardId);
                                const cardBtn = document.createElement('button');
                                cardBtn.className = 'modal-btn';
                                cardBtn.style.background = bgColors[color] || '#2980b9';
                                cardBtn.style.textShadow = '1px 1px 2px black';
                                cardBtn.textContent = `Забрать: ${targetData ? targetData.name : theirCardId}`;
                                cardBtn.onclick = () => chooseMyCardForForcedDeal(actionCardId, pId, theirCardId, cancelCallback);
                                modalBody.appendChild(cardBtn);
                            });
                        }
                    }
                    if (!hasProperties) modalBody.innerHTML = '<p style="color:#e74c3c">У игрока нет недвижимости для обмена!</p>';
                }
            };
            modalBody.appendChild(btn);
        }
        if (opponentsCount === 0) modalBody.innerHTML = '<p style="color:#e74c3c">Нет других игроков для выбора!</p>';
    }

    btnCancelAction.onclick = () => { targetModal.classList.add('hidden'); cancelCallback(); };
}

function createHouseHotelButton(color, actionCardId, cancelCallback) {
    const btn = document.createElement('button');
    btn.className = 'modal-btn';
    btn.style.background = bgColors[color];
    btn.style.textShadow = '1px 1px 2px black';
    btn.textContent = `Добавить к комплекту: ${colorNames[color] || color}`;
    btn.onclick = () => {
        targetModal.classList.add('hidden');
        socket.emit('play_action', { room: 'test_room', playerId: myPlayerId, cardId: actionCardId, opts: { color: color } }, handleServerError(cancelCallback));
    };
    modalBody.appendChild(btn);
}

function chooseMyCardForForcedDeal(actionCardId, targetId, theirCardId, cancelCallback) {
    modalTitle.textContent = `Какую свою карту ОТДАДИМ взамен?`;
    modalBody.innerHTML = '';
    let hasMyProperties = false;
    const myPlayerInfo = currentGameState.players[myPlayerId];

    for (const color in myPlayerInfo.properties) {
        const cards = myPlayerInfo.properties[color];
        const propCount = cards.filter(id => !id.startsWith('HOUSE') && !id.startsWith('HOTEL')).length;
        const propCardInfo = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(color));
        const setSize = propCardInfo ? propCardInfo.set_size : 99;

        if (propCount > 0 && propCount < setSize) {
            cards.forEach(myCardId => {
                if(typeof myCardId === 'string' && (myCardId.startsWith('HOUSE_') || myCardId.startsWith('HOTEL_'))) return;
                hasMyProperties = true;
                const cardData = allCardsData.find(c => c.id === myCardId);
                const myCardBtn = document.createElement('button');
                myCardBtn.className = 'modal-btn';
                myCardBtn.style.background = bgColors[color] || '#d35400';
                myCardBtn.style.textShadow = '1px 1px 2px black';
                myCardBtn.textContent = `Отдать: ${cardData ? cardData.name : myCardId}`;
                myCardBtn.onclick = () => {
                    targetModal.classList.add('hidden');
                    socket.emit('play_action', { room: 'test_room', playerId: myPlayerId, cardId: actionCardId, opts: { target: targetId, theirCardId: theirCardId, myCardId: myCardId } }, handleServerError(cancelCallback));
                };
                modalBody.appendChild(myCardBtn);
            });
        }
    }
    if (!hasMyProperties) modalBody.innerHTML = '<p style="color:#e74c3c">У вас нет недвижимости, чтобы совершить обмен!</p>';
}

function handleServerError(cancelCallback) {
    return (res) => { if (res && res.error) { alert('Ошибка: ' + res.error); cancelCallback(); } };
}

// --- ОТРИСОВКА ---
function createCardElement(cardId, assignedColor = null) {
    const cardData = allCardsData.find(c => c.id === cardId);
    if (!cardData) return null;

    const cardEl = document.createElement('div');
    cardEl.className = `card ${cardData.type}`;
    cardEl.dataset.id = cardId; 
    cardEl.ondragstart = () => false;

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

    if (assignedColor && assignedColor !== 'unassigned') {
        colorsText = `<b style="color: #2c3e50;">(Как: ${colorNames[assignedColor] || assignedColor})</b>`;
        if (bgColors[assignedColor]) {
            cardEl.style.borderTopColor = bgColors[assignedColor];
            cardEl.style.borderTopWidth = '8px'; 
        }
    } else if (cardData.colors && cardData.colors.length > 0) {
        if (cardData.colors.length === 1 && cardData.colors[0] !== 'any') {
            if (bgColors[cardData.colors[0]]) {
                cardEl.style.borderTopColor = bgColors[cardData.colors[0]];
            }
        } else {
            let gradient = '';
            if (cardData.colors[0] === 'any') {
                gradient = 'linear-gradient(to right, #e74c3c, #e67e22, #f1c40f, #2ecc71, #3498db, #8e44ad)';
            } else if (cardData.colors.length === 2) {
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

    if (cardData.filename) {
        const imageUrl = cardData.filename.replace('/public', '');
        cardEl.style.backgroundImage = `url('${imageUrl}')`;
        cardEl.style.backgroundSize = 'cover';
        cardEl.style.backgroundPosition = 'center';
        cardEl.style.backgroundRepeat = 'no-repeat';
        cardEl.classList.add('has-image');
    }
    
    let descTextHover = cardData.description ? '\n' + cardData.description : '';
    cardEl.title = (cardData.name || cardData.action_type || 'Карта') + descTextHover;

    cardEl.innerHTML = `
        ${multiColorStripe}
        <div class="card-title" style="position: relative; z-index: 2;">${displayName}</div>
        <div class="card-colors" style="position: relative; z-index: 2;">${colorsText}</div>
        ${descText}
        <div class="card-val" style="position: relative; z-index: 2;">${valText}</div>
    `;
    return cardEl;
}

function renderStack(cardsArr, stackId, containerEl, isMini = false, assignedColor = null, isMyTurn = false) {
    if (cardsArr.length === 0) return;

    const stackEl = document.createElement('div');
    stackEl.className = `card-stack ${isMini ? 'mini-stack' : ''}`;
    stackEl.id = stackId; 
    if (expandedStacks.has(stackId)) stackEl.classList.add('expanded');

    stackEl.addEventListener('click', () => {
        if (expandedStacks.has(stackId)) {
            expandedStacks.delete(stackId);
            stackEl.classList.remove('expanded');
        } else {
            expandedStacks.add(stackId);
            stackEl.classList.add('expanded');
        }
    });

    cardsArr.forEach(rawId => {
        let cardId = rawId;
        if (typeof rawId === 'string') {
            if (rawId.startsWith('HOUSE_')) cardId = rawId.replace('HOUSE_', '');
            else if (rawId.startsWith('HOTEL_')) cardId = rawId.replace('HOTEL_', '');
        }

        const cardEl = createCardElement(cardId, assignedColor);
        if (cardEl) {
            if (isMini) cardEl.classList.add('mini-card');

            cardEl.dataset.origin = 'table';
            cardEl.dataset.currentColor = assignedColor;

            const cardData = allCardsData.find(c => c.id === cardId);
            
            if (isMyTurn && !isMini && cardData && cardData.type === 'property_wild') {
                cardEl.style.cursor = 'grab';
                
                cardEl.addEventListener('contextmenu', (e) => {
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    openWildColorModal(cardId, cardData, () => {}, true, assignedColor);
                });

                cardEl.addEventListener('pointerdown', (e) => {
                    if (e.button === 2) return; 
                    e.stopPropagation(); 
                    if (!isMyTurn) return;

                    isDragging = false; 
                    startX = e.clientX;
                    startY = e.clientY;
                    
                    draggedCard = cardEl;
                    originalCardRect = cardEl.getBoundingClientRect();
                    shiftX = e.clientX - originalCardRect.left;
                    shiftY = e.clientY - originalCardRect.top;
                });
            }
            stackEl.appendChild(cardEl);
        }
    });
    containerEl.appendChild(stackEl);
}

function renderGame() {
    if (!currentGameState || !myPlayerId) return;
    if (draggedCard) return;

    const myPlayerInfo = currentGameState.players[myPlayerId];
    const isMyTurn = currentGameState.turnPlayerId === myPlayerId;
    
    deckCountEl.textContent = currentGameState.deckCount;
    discardCountEl.textContent = currentGameState.discardCount;
    btnEndTurn.disabled = !isMyTurn;

    if (isMyTurn) turnIndicator.textContent = `⭐ ВАШ ХОД! (Сыграно: ${currentGameState.playsThisTurn}/3)`;
    else turnIndicator.textContent = `⏳ Ходит: ${currentGameState.players[currentGameState.turnPlayerId]?.name || '...'}`;

    handContainer.innerHTML = '';
    myPlayerInfo.hand.forEach(cardId => {
        const cardEl = createCardElement(cardId);
        if (cardEl) {
            cardEl.dataset.origin = 'hand'; 
            cardEl.addEventListener('pointerdown', (e) => {
                if (e.button === 2) return;
                if (!isMyTurn) { alert('Дождитесь своего хода!'); return; }
                
                if (currentGameState.playsThisTurn >= 3) {
                    // Разрешаем захват, чтобы игрок мог выкинуть карту в мусорку
                }

                isDragging = false;
                startX = e.clientX;
                startY = e.clientY;

                draggedCard = cardEl;
                originalCardRect = cardEl.getBoundingClientRect();
                shiftX = e.clientX - originalCardRect.left;
                shiftY = e.clientY - originalCardRect.top;
            });
            handContainer.appendChild(cardEl);
        } else {
            console.error(`🚨 ОШИБКА: Сервер выдал карту с ID [${cardId}], но её нет в cards_data.json!`);
        }
    });

    bankCardsEl.innerHTML = '';
    renderStack(myPlayerInfo.bank, `bank-my-${myPlayerId}`, bankCardsEl, false, null, isMyTurn);

    propertyCardsEl.innerHTML = '';
    for (const color in myPlayerInfo.properties) {
        renderStack(myPlayerInfo.properties[color], `prop-my-${color}`, propertyCardsEl, false, color, isMyTurn);
    }

    opponentsZone.innerHTML = '';
    for (const [pId, pInfo] of Object.entries(currentGameState.players)) {
        if (pId === myPlayerId) continue;
        const oppEl = document.createElement('div');
        oppEl.className = 'opponent-board';
        const statusColor = pInfo.connected ? '#f39c12' : '#7f8c8d'; 
        oppEl.innerHTML = `
            <div class="opponent-header" style="color: ${statusColor}">
                <span class="opp-name">${pInfo.name} ${!pInfo.connected ? '(Отключен)' : ''}</span>
                <span class="opp-hand">В руке: ${pInfo.handCount} шт.</span>
            </div>
            <div class="opp-table">
                <div class="opp-bank"><div class="opp-title">Банк</div><div class="opp-cards" id="opp-bank-${pId}"></div></div>
                <div class="opp-props"><div class="opp-title">Недвижимость</div><div class="opp-cards" id="opp-props-${pId}"></div></div>
            </div>
        `;
        opponentsZone.appendChild(oppEl);

        renderStack(pInfo.bank, `bank-opp-${pId}`, document.getElementById(`opp-bank-${pId}`), true);

        for (const color in pInfo.properties) {
            renderStack(pInfo.properties[color], `prop-opp-${color}-${pId}`, document.getElementById(`opp-props-${pId}`), true, color);
        }
    }
    checkWinCondition();
}

function checkWinCondition() {
    for (const [pId, pInfo] of Object.entries(currentGameState.players)) {
        let fullSetsCount = 0;
        for (const color in pInfo.properties) {
            const cards = pInfo.properties[color];
            const propCount = cards.filter(id => !(typeof id === 'string' && (id.startsWith('HOUSE') || id.startsWith('HOTEL')))).length;
            const propCard = allCardsData.find(c => c.type === 'property' && c.colors && c.colors.includes(color));
            const setSize = propCard ? propCard.set_size : 99;
            if (propCount >= setSize && propCount > 0) fullSetsCount++;
        }
        if (fullSetsCount >= 3) {
            targetModal.classList.remove('hidden');
            btnCancelAction.style.display = 'none'; 
            if (pId === myPlayerId) {
                modalTitle.textContent = '🏆 ВЫ ПОБЕДИЛИ! 🏆';
                modalTitle.style.color = '#f1c40f'; 
                modalTitle.style.fontSize = '28px';
            } else {
                modalTitle.textContent = `😭 ПОБЕДИЛ ИГРОК: ${pInfo.name.toUpperCase()} 😭`;
                modalTitle.style.color = '#e74c3c'; 
            }
            modalBody.innerHTML = `<p style="color: white; font-size: 16px;">Игра окончена. Собрано 3 полных комплекта недвижимости!</p>`;
        }
    }
}