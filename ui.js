// ui.js - Manejo de la interfaz de usuario
const turnNumberEl = document.getElementById('turnNumber');
const actionsLeftEl = document.getElementById('actionsLeft');
const endTurnBtn = document.getElementById('endTurnBtn');

const startMenu = document.getElementById('startMenu');
const startButton = document.getElementById('startButton');
const optionsButton = document.getElementById('optionsButton');
const worldCards = Array.from(document.querySelectorAll('.world-card'));

// default world type
window.worldType = window.worldType || 'normal';

function setSelectedWorld(card) {
    if (!card) return;
    worldCards.forEach(c => {
        c.setAttribute('aria-pressed', 'false');
    });
    card.setAttribute('aria-pressed', 'true');
    window.worldType = card.dataset.world;
}

// Debounced regenerate when selecting a preset so users get immediate feedback
let _regenTimer = null;
function scheduleRegenerate(delay = 250) {
    if (typeof window.regenerateMap !== 'function') return;
    if (_regenTimer) clearTimeout(_regenTimer);
    _regenTimer = setTimeout(() => {
        _regenTimer = null;
        // regenerate with current seed input if provided
        const s = seedInput?.value || undefined;
        window.regenerateMap(s);
    }, delay);
}

// Keyboard: navigate world cards with arrow keys when menu is visible
function focusNextCard(offset) {
    if (!worldCards.length) return;
    const idx = worldCards.findIndex(c => c.getAttribute('aria-pressed') === 'true');
    let next = 0;
    if (idx >= 0) next = (idx + offset + worldCards.length) % worldCards.length;
    worldCards[next].focus();
    setSelectedWorld(worldCards[next]);
}

// Lugar del jugador
window.unit = window.unit || { x: 0, y: 0, actionsMax: 2, actionsLeft: 2, selected: false };
const unit = window.unit;

// Como iniciar y parar el juego
function startGame() {
    if (window.gameRunning) return;
    window.gameRunning = true;
    hideMenu();
    updateHud();
    if (typeof render === 'function') render();
}

function stopGame() {
    window.gameRunning = false;
}

function showMenu() {
    if (startMenu) startMenu.classList.remove('hidden');
    if (startButton) startButton.focus();
    if (window.gameRunning) stopGame();
}

function hideMenu() {
    if (startMenu) startMenu.classList.add('hidden');
    const canvas = document.getElementById('gameCanvas');
    if (canvas) canvas.focus();
}

function updateHud() {
    if (turnNumberEl) turnNumberEl.textContent = window.gameState?.turn ?? 1;
    if (actionsLeftEl) actionsLeftEl.textContent = unit.actionsLeft;
}

// Fin del turno
if (endTurnBtn) endTurnBtn.addEventListener('click', () => {
    unit.actionsLeft = unit.actionsMax;
    window.gameState = window.gameState || { turn: 1 };
    window.gameState.turn += 1;
    updateHud();
    if (typeof render === 'function') render();
});

// Botones del menu
if (startButton) startButton.addEventListener('click', startGame);
if (optionsButton) optionsButton.addEventListener('click', () => alert('Opciones - (placeholder)'));

// world card click/focus handlers
if (worldCards.length) {
    worldCards.forEach(c => {
        c.addEventListener('click', () => { setSelectedWorld(c); scheduleRegenerate(); });
        c.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedWorld(c); }
        });
    });
    // set default selected card matching window.worldType
    const defaultCard = worldCards.find(c => c.dataset.world === window.worldType) || worldCards[0];
    setSelectedWorld(defaultCard);
}

window.addEventListener('load', () => { showMenu(); });

// Global key handling for menu navigation and quick start
window.addEventListener('keydown', (e) => {
    // If the menu is visible
    if (startMenu && !startMenu.classList.contains('hidden')) {
        if (e.key === 'Enter') {
            // Enter starts the game (if focused on a card, ensure it's selected)
            const active = document.activeElement;
            if (active && active.classList && active.classList.contains('world-card')) setSelectedWorld(active);
            // regenerate map for selected preset then start (small delay)
            if (typeof window.regenerateMap === 'function') {
                window.regenerateMap(seedInput?.value || undefined);
                setTimeout(() => startGame(), 150);
            } else {
                startGame();
            }
        }
        if (e.key === 'ArrowRight') { focusNextCard(1); }
        if (e.key === 'ArrowLeft') { focusNextCard(-1); }
        if (e.key === 'Escape') { /* already at menu */ }
    } else {
        // If in-game, Esc should open menu
        if (e.key === 'Escape') showMenu();
    }
});

// mostrar funciones globales
window.showMenu = showMenu;
window.hideMenu = hideMenu;
window.startGame = startGame;
window.stopGame = stopGame;
window.updateHud = updateHud;

// Si no uso unidad me puedo mover
const canvas = document.getElementById('gameCanvas');
let dragging = false;
let dragStart = null;
if (canvas) {
    canvas.addEventListener('mousedown', (e) => {
        // If action panel is open, a left-click on the canvas should close it first
        try {
            if (e.button === 0 && actionMenuLayer && actionMenuLayer.classList && actionMenuLayer.classList.contains('open')) {
                closeActionMenu();
            }
        } catch (err) {
            // ignore if variables not yet ready
        }
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const w = (typeof screenToWorld === 'function') ? screenToWorld(x,y) : {x: Math.floor(x/48), y: Math.floor(y/48)};

        let handled = false;
        if (w.x === unit.x && w.y === unit.y) {
            unit.selected = !unit.selected;
            handled = true;
        } else if (unit.selected && unit.actionsLeft > 0) {
            unit.x = Math.max(0, Math.min((window.MAP_W||0)-1, w.x));
            unit.y = Math.max(0, Math.min((window.MAP_H||0)-1, w.y));
            unit.actionsLeft -= 1;
            unit.selected = false;
            handled = true;
        }
        if (!handled) {
            dragging = true;
            dragStart = { x: e.clientX, y: e.clientY, camX: window.camX || 0, camY: window.camY || 0 };
        }

        updateHud();
        if (typeof render === 'function') render();
    });

    // Open action menu when right-clicking or ctrl+click on a tile
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const w = (typeof screenToWorld === 'function') ? screenToWorld(x,y) : {x: Math.floor(x/48), y: Math.floor(y/48)};
        openActionMenuForTile(w.x, w.y);
    });
}

    // Regenerar y Randomizar botones
    const regenBtn = document.getElementById('regenBtn');
    const randomBtn = document.getElementById('randomBtn');
    const seedInput = document.getElementById('seedInput');
    const fitMapBtn = document.getElementById('fitMapBtn');
    if (regenBtn) regenBtn.addEventListener('click', () => { if (typeof window.regenerateMap === 'function') window.regenerateMap(seedInput?.value || undefined); });
    if (randomBtn) randomBtn.addEventListener('click', () => { const s = Math.floor(Math.random()*1000000); if (seedInput) seedInput.value = s; if (typeof window.regenerateMap === 'function') window.regenerateMap(s); });
    if (fitMapBtn) fitMapBtn.addEventListener('click', () => { if (typeof window.fitMap === 'function') window.fitMap(); });
    // Apagar
    const toggleElevBtn = document.getElementById('toggleElevBtn');
    window.showElevation = window.showElevation || false;
    if (toggleElevBtn) {
        toggleElevBtn.addEventListener('click', () => {
            window.showElevation = !window.showElevation;
            toggleElevBtn.textContent = window.showElevation ? 'Hide Elevation' : 'Show Elevation';
            if (typeof render === 'function') render();
        });
    }
    // Encender
    const toggleElevMapBtn = document.getElementById('toggleElevMapBtn');
    window.showElevationMap = window.showElevationMap || false;
    if (toggleElevMapBtn) {
        toggleElevMapBtn.addEventListener('click', () => {
            window.showElevationMap = !window.showElevationMap;
            toggleElevMapBtn.textContent = window.showElevationMap ? 'Hide Elev Map' : 'Elevation Map';
            if (typeof render === 'function') render();
        });
    }

// Action menu element references
const actionMenuLayer = document.getElementById('actionMenuLayer');
const actionMenuContent = document.getElementById('actionMenuContent');
const closeActionMenuBtn = document.getElementById('closeActionMenu');
const toastEl = document.getElementById('toast');

// Focus trap state
let _previousFocus = null;
let _focusTrapHandler = null;
function openActionMenuForTile(wx, wy) {
    if (!actionMenuLayer || !actionMenuContent) { console.warn('action menu elements missing'); return; }
    console.debug('openActionMenuForTile', wx, wy);
    const t = (typeof tiles !== 'undefined' && tiles && tiles[wx] && tiles[wx][wy]) ? tiles[wx][wy] : null;
    actionMenuContent.innerHTML = `<div><strong>Casilla:</strong> ${wx}, ${wy}</div><div><strong>Biome:</strong> ${t ? t.biome : 'N/A'}</div>`;
    const moveBtn = document.createElement('button');
    moveBtn.className = 'btn';
    moveBtn.textContent = 'Mover unidad aquí';
    moveBtn.addEventListener('click', () => {
        if (!window.unit) return;
        window.unit.x = Math.max(0, Math.min((window.MAP_W||0)-1, wx));
        window.unit.y = Math.max(0, Math.min((window.MAP_H||0)-1, wy));
        window.unit.selected = false;
        if (typeof render === 'function') render();
        // show success toast and auto-close
        showToast('Unidad movida');
        setTimeout(() => closeActionMenu(), 300);
    });
    actionMenuContent.appendChild(moveBtn);
    // Ensure any previous hidden display is cleared and trigger CSS transition reliably
    actionMenuLayer.style.display = 'flex';
    // force reflow
    /* eslint-disable no-unused-expressions */
    void actionMenuLayer.offsetWidth;
    /* eslint-enable no-unused-expressions */
    actionMenuLayer.classList.add('open');
    actionMenuLayer.setAttribute('aria-hidden', 'false');
    // focus trap: remember previous focus and move focus to first focusable inside panel
    _previousFocus = document.activeElement;
    const focusables = actionMenuLayer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusables && focusables.length) {
        focusables[0].focus();
    }
    // trap tab
    _focusTrapHandler = function(e) {
        if (e.key === 'Escape') { closeActionMenu(); return; }
        if (e.key !== 'Tab') return;
        const list = Array.from(actionMenuLayer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(el=>!el.disabled);
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length-1];
        if (e.shiftKey) {
            if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
            if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    };
    window.addEventListener('keydown', _focusTrapHandler);
}
function closeActionMenu() {
    if (!actionMenuLayer) return;
    actionMenuLayer.classList.remove('open');
    actionMenuLayer.setAttribute('aria-hidden', 'true');
    // After transition completes, hide the element to keep layout clean
    const onEnd = (ev) => {
        if (ev && ev.target !== actionMenuLayer) return;
        actionMenuLayer.style.display = '';
        actionMenuLayer.removeEventListener('transitionend', onEnd);
    };
    actionMenuLayer.addEventListener('transitionend', onEnd);
    // remove focus trap and restore focus
    if (_focusTrapHandler) { window.removeEventListener('keydown', _focusTrapHandler); _focusTrapHandler = null; }
    if (_previousFocus && typeof _previousFocus.focus === 'function') { _previousFocus.focus(); _previousFocus = null; }
}
if (closeActionMenuBtn) closeActionMenuBtn.addEventListener('click', closeActionMenu);

function showToast(text, ms = 1600) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('show');
    setTimeout(() => { toastEl.classList.remove('show'); }, ms);
}

// Camara
if (canvas) {
    window.addEventListener('mousemove', (e) => {
        if (!dragging || !dragStart) return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        window.camX = dragStart.camX - dx;
        window.camY = dragStart.camY - dy;
        if (typeof clampCam === 'function') clampCam();
        if (typeof render === 'function') render();
    });

    window.addEventListener('mouseup', () => { dragging = false; dragStart = null; });

    // Zoom ruedita
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const before = (typeof screenToWorldFloat === 'function') ? screenToWorldFloat(mx, my) : { x: (mx + (window.camX||0)) / (BASE_TILE * (window.zoom || 1)), y: (my + (window.camY||0)) / (BASE_TILE * (window.zoom || 1)) };
        const delta = Math.sign(e.deltaY) * -0.1;
        window.zoom = Math.max(0.25, Math.min(3, (window.zoom || zoom) + delta));
        const tNew = tileSize();
        window.camX = Math.round(before.x * tNew - mx);
        window.camY = Math.round(before.y * tNew - my);
        if (typeof clampCam === 'function') clampCam();
        if (typeof render === 'function') render();
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
        const step = tileSize();
        if (e.key === 'ArrowLeft') { window.camX = (window.camX || 0) - step; if (typeof clampCam==='function') clampCam(); if (typeof render==='function') render(); }
        if (e.key === 'ArrowRight') { window.camX = (window.camX || 0) + step; if (typeof clampCam==='function') clampCam(); if (typeof render==='function') render(); }
        if (e.key === 'ArrowUp') { window.camY = (window.camY || 0) - step; if (typeof clampCam==='function') clampCam(); if (typeof render==='function') render(); }
        if (e.key === 'ArrowDown') { window.camY = (window.camY || 0) + step; if (typeof clampCam==='function') clampCam(); if (typeof render==='function') render(); }
    });
}
