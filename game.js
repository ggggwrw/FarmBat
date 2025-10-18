// Canvas y contexto de dibujo
const gameCanvas = window.canvas || document.getElementById('gameCanvas');
const ctx = gameCanvas && gameCanvas.getContext ? gameCanvas.getContext('2d') : null;

// Mundo y Camara
const BASE_TILE = 48; // base tile size in px
var zoom = 1.0; // zoom factor (1.0 = 100%) - var so UI code can access it via window.zoom
function tileSize() { return Math.max(6, Math.round(BASE_TILE * zoom)); }
const MAP_W = 140;
const MAP_H = 120;

// tamaño del mapa expuesto para ui.js
window.MAP_W = MAP_W;
window.MAP_H = MAP_H;

// contador de turnos
window.gameState = window.gameState || { turn: 1 };

// Mapa y generación de semilla
var seed = Math.floor(Math.random() * 1000000);
var tiles = [];
var camX = 0, camY = 0; 

// Expanded mode flag — when true canvas will try to fill most of the window
// always expanded canvas so the map fills the available area
window.mapExpanded = true;

function resizeCanvasToWindow() {
	const canvas = document.getElementById('gameCanvas');
	if (!canvas) return;
	if (window.mapExpanded) {
		// leave a small margin for HUD (top/bottom)
		const margin = 48;
		canvas.width = Math.max(400, window.innerWidth - 80);
		canvas.height = Math.max(200, window.innerHeight - margin - 80);
	} else {
		// default inline size (keep initial aspect ratio roughly)
		canvas.width = Math.max(800, Math.min(1500, Math.floor(window.innerWidth * 0.85)));
		canvas.height = Math.max(360, Math.min(900, Math.floor(window.innerHeight * 0.5)));
	}
	// update global references and clamp camera
	if (typeof clampCam === 'function') clampCam();
	if (typeof render === 'function') render();
}

// Fit the whole map into the current canvas by adjusting zoom and centering camera
function fitMap() {
	const canvas = document.getElementById('gameCanvas');
	if (!canvas) return;
	const pad = 16; // pixels padding
	const availableW = Math.max(100, canvas.width - pad * 2);
	const availableH = Math.max(100, canvas.height - pad * 2);
	const tileW = Math.floor(availableW / MAP_W);
	const tileH = Math.floor(availableH / MAP_H);
	const bestTile = Math.max(6, Math.min(tileW || 6, tileH || 6));
	// compute new zoom from tile size
	const newZoom = bestTile / BASE_TILE;
	window.zoom = Math.max(0.1, Math.min(4, newZoom));
	// center camera
	const totalW = MAP_W * tileSize();
	const totalH = MAP_H * tileSize();
	// center the map in the canvas; if map smaller than canvas, show centered (no empty gutter)
	window.camX = Math.round(Math.max(0, (totalW - canvas.width) / 2));
	window.camY = Math.round(Math.max(0, (totalH - canvas.height) / 2));
	if (typeof clampCam === 'function') clampCam();
	if (typeof render === 'function') render();
}
// Attach resize listener
window.addEventListener('resize', () => {
	resizeCanvasToWindow();
});

// expose fitMap only
window.fitMap = fitMap;

// Unidad del jugador
window.unit = window.unit || { x: Math.floor(MAP_W/2), y: Math.floor(MAP_H/2), actionsMax: 2, actionsLeft: 2, selected: false };

// Paleta de colores
const BIOMES = {
	grassland: { color: '#7ec97c' },
	forest:    { color: '#37622a' },
	mountain:  { color: '#8b8b8b' },
	snow:      { color: '#ffffff' },
	river:     { color: '#8fd1ff' },
	lake:      { color: '#2a6fb0' },
	beach:     { color: '#f2e394' },
};

function worldToScreen(wx, wy) {
	const t = tileSize();
	return { x: Math.round(wx * t - camX), y: Math.round(wy * t - camY) };
}

function screenToWorld(sx, sy) {
	const t = tileSize();
	return { x: Math.floor((sx + camX) / t), y: Math.floor((sy + camY) / t) };
}

function screenToWorldFloat(sx, sy) {
	const t = tileSize();
	return { x: (sx + camX) / t, y: (sy + camY) / t };
}

function clampCam() {
	const t = tileSize();
	const wpx = MAP_W * t;
	const hpx = MAP_H * t;
	if (!gameCanvas) return;
	camX = Math.max(0, Math.min(camX, Math.max(0, wpx - gameCanvas.width)));
	camY = Math.max(0, Math.min(camY, Math.max(0, hpx - gameCanvas.height)));
}

// Expone la camara y zoom para que ui.js pueda acceder a ellos
window.camX = window.camX || camX;
window.camY = window.camY || camY;
window.zoom = window.zoom || zoom;
function drawGrid() {
	if (!tiles || !tiles.length) return;
	const t = tileSize();
	ctx.clearRect(0,0,canvas.width,canvas.height);
	for (let x = 0; x < MAP_W; x++) {
		for (let y = 0; y < MAP_H; y++) {
			const tile = tiles[x][y];
			const p = worldToScreen(x, y);
			const sx = p.x, sy = p.y;
			// Culling fuera de pantalla
			    if (!gameCanvas) continue;
			    if (sx + t < 0 || sy + t < 0 || sx > gameCanvas.width || sy > gameCanvas.height) continue;

			const biomeCol = (tile && BIOMES[tile.biome]) ? BIOMES[tile.biome].color : BIOMES.grassland.color;
			ctx.fillStyle = biomeCol;
			ctx.fillRect(sx, sy, t, t);

			// Agua: lagos y rios
			if (tile && tile.lake) {
				ctx.fillStyle = BIOMES.lake.color;
				ctx.fillRect(sx, sy, t, t);
			} else if (tile && tile.river) {
				ctx.fillStyle = BIOMES.river.color;
				const w = Math.max(2, Math.floor(t * 0.18));
				ctx.fillRect(sx + (t - w) / 2, sy + Math.floor(t*0.1), w, Math.floor(t*0.8));
			}

			// Overlay de mapa de elevacion
			if (window.showElevationMap && tile) {
				const e = Math.max(0, Math.min(1, tile.elevation || 0));
				let color;
				if (e < 0.33) color = '#4f9cff';
				else if (e < 0.66) color = '#7ec97c';
				else color = '#c59a6f';
				ctx.fillStyle = color;
				ctx.globalAlpha = 0.55;
				ctx.fillRect(sx, sy, t, t);
				ctx.globalAlpha = 1.0;
			}

			// Pinta árboles simples en bosque
			if (tile && tile.biome === 'forest') {
				ctx.fillStyle = 'rgba(6,45,17,0.9)';
				const count = Math.max(1, Math.floor(t / 16));
				for (let i = 0; i < count; i++) {
					const px = sx + 2 + (i * 7) % Math.max(4, (t - 6));
					const py = sy + 2 + ((i * 9) % Math.max(6, (t - 6)));
					ctx.fillRect(px, py, Math.max(2, Math.floor(t * 0.06)), Math.max(4, Math.floor(t * 0.12)));
				}
			}

			ctx.strokeStyle = 'rgba(0,0,0,0.06)';
			ctx.strokeRect(sx + 0.5, sy + 0.5, t-1, t-1);

			// Pinta la elevacion como texto
			if (window.showElevation && tile && t >= 12) {
				ctx.fillStyle = 'rgba(0,0,0,0.9)';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				const fontSize = Math.max(8, Math.floor(t * 0.28));
				ctx.font = fontSize + 'px monospace';
				const elev = (tile.elevation || 0).toFixed(2);
				ctx.fillText(elev, sx + t/2, sy + t/2 + 1);
			}
		}
 	}
 	}
 
// Sombreado de un color hexadecimal
function shadeColor(hex, amount) {
	const col = hex.replace('#','');
	const num = parseInt(col,16);
	let r = (num >> 16) + amount;
	let g = ((num >> 8) & 0x00FF) + amount;
	let b = (num & 0x0000FF) + amount;
	r = Math.max(0, Math.min(255, r));
	g = Math.max(0, Math.min(255, g));
	b = Math.max(0, Math.min(255, b));
	return '#' + (r<<16 | g<<8 | b).toString(16).padStart(6,'0');
}

function drawUnit(u) {
	const p = worldToScreen(u.x, u.y);
	const t = tileSize();
	const size = t * 0.8;
	const offset = (t - size) / 2;
	ctx.fillStyle = '#f5d06b';
	ctx.fillRect(p.x + offset, p.y + offset, size, size);
	if (u.selected) {
		ctx.strokeStyle = 'rgba(46,163,255,0.95)';
		ctx.lineWidth = 3;
		ctx.strokeRect(p.x + offset - 2, p.y + offset - 2, size + 4, size + 4);
	}
}

function render() {
	if (!ctx) return;
	drawGrid();
	drawUnit(window.unit || { x:0, y:0, selected:false });
}

// --- Generation delegated to map.js ---
function generateMaps(){
    const preset = (typeof getActiveMapPreset === 'function') ? getActiveMapPreset() : null;
    if (typeof window.generateTiles === 'function'){
        tiles = window.generateTiles(seed, MAP_W, MAP_H, preset);
    } else {
        console.warn('generateTiles() not found in map.js — no map generated');
        tiles = Array.from({length: MAP_W}, () => Array.from({length: MAP_H}, () => ({ elevation:0, moisture:0, biome:'grassland', river:false })));
    }
    // Log basic stats using computeMapStats if available
    if (typeof computeMapStats === 'function') {
        const st = computeMapStats();
        console.log('Map stats', st);
    }
}
// Regenerar el mapa con una semilla opcional
function regenerateMap(newSeed) {
	if (typeof newSeed !== 'undefined') seed = Number(newSeed) || seed;
	console.log('Generating map with seed', seed);
	generateMaps();
	render();
}

// inicializar el mapa
// ensure canvas is sized before first render
resizeCanvasToWindow();
regenerateMap(seed);

// Muestra ui.js que estas funciones existen
window.regenerateMap = regenerateMap;

// Funciones de ayuda para consola
window.computeMapStats = computeMapStats;
window.sampleSeeds = sampleSeeds;

// Calculador de casillas
function computeMapStats() {
	if (!tiles || !tiles.length) return null;
	const stats = { total: MAP_W*MAP_H, rivers:0, lakes:0, accumMin: Infinity, accumMax:0, accumSum:0 };
	for (let x=0;x<MAP_W;x++) for (let y=0;y<MAP_H;y++){
		const t = tiles[x][y];
		if (t.river) stats.rivers++;
		if (t.lake) stats.lakes++;
		const a = t.flowAccum || 0;
		stats.accumMin = Math.min(stats.accumMin, a);
		stats.accumMax = Math.max(stats.accumMax, a);
		stats.accumSum += a;
	}
	stats.accumAvg = stats.accumSum / stats.total;
	return stats;
}

// Testeo de semillas
function sampleSeeds(n=5) {
	const start = seed;
	console.group(`Sampling ${n} seeds starting from ${start}`);
	for (let i=0;i<n;i++){
		const s = Math.floor(Math.random()*1000000);
		seed = s;
		generateMaps();
		const st = computeMapStats();
		console.log('seed', s, 'rivers', st.rivers, 'lakes', st.lakes, 'accumMin/max/avg', st.accumMin, st.accumMax, st.accumAvg.toFixed(2));
	}
	console.groupEnd();
	// Regerar el mapa con la semilla original
	seed = start;
	generateMaps(); render();
}

window.computeMapStats = computeMapStats;
window.sampleSeeds = sampleSeeds;


