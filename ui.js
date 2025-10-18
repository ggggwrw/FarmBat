// ui.js - Manejo de la interfaz de usuario
const turnNumberEl = document.getElementById('turnNumber');
const actionsLeftEl = document.getElementById('actionsLeft');
const endTurnBtn = document.getElementById('endTurnBtn');

const startMenu = document.getElementById('startMenu');
const startButton = document.getElementById('startButton');
const optionsButton = document.getElementById('optionsButton');

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

window.addEventListener('load', () => { showMenu(); });

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
}

    // Regenerar y Randomizar botones
    const regenBtn = document.getElementById('regenBtn');
    const randomBtn = document.getElementById('randomBtn');
    const seedInput = document.getElementById('seedInput');
    if (regenBtn) regenBtn.addEventListener('click', () => { if (typeof window.regenerateMap === 'function') window.regenerateMap(seedInput?.value || undefined); });
    if (randomBtn) randomBtn.addEventListener('click', () => { const s = Math.floor(Math.random()*1000000); if (seedInput) seedInput.value = s; if (typeof window.regenerateMap === 'function') window.regenerateMap(s); });
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
