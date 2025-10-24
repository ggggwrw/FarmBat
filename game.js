// Canvas y contexto de dibujo
const gameCanvas = window.canvas || document.getElementById('gameCanvas');
const ctx = gameCanvas && gameCanvas.getContext ? gameCanvas.getContext('2d') : null;

// Mundo y Camara
const BASE_TILE = 48; // base tile size in px
var zoom = 1.0; // zoom factor (1.0 = 100%) - kept for backward compat, but tileSize reads window.zoom
function tileSize() {
	const z = Number.isFinite(window.zoom) ? window.zoom : zoom;
	return Math.max(6, Math.round(BASE_TILE * z));
}
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
	const sidebar = document.getElementById('gameSidebar');
	if (window.mapExpanded) {
		// leave a small margin for HUD (top/bottom)
		const margin = 48;
		const leftUsed = (sidebar ? (sidebar.offsetWidth + 18) : 80);
		canvas.width = Math.max(400, window.innerWidth - leftUsed);
		canvas.height = Math.max(200, window.innerHeight - margin - 80);
	} else {
		// default inline size (keep initial aspect ratio roughly)
		const leftUsed = (sidebar ? (sidebar.offsetWidth + 18) : 0);
		canvas.width = Math.max(800, Math.min(1500, Math.floor((window.innerWidth - leftUsed) * 0.95)));
		canvas.height = Math.max(360, Math.min(900, Math.floor(window.innerHeight * 0.5)));
	}
	// update global references and clamp camera
	if (typeof clampCam === 'function') clampCam();
	// Auto-fit on resize if enabled
	if (window.autoFitOnResize) { if (typeof window.fitMap === 'function') window.fitMap(); }
	if (typeof render === 'function') render();
}

// Centralized zoom setter to keep window.zoom and internal zoom in sync, with optional anchor re-centering
function setZoom(nextZoom, anchorX = null, anchorY = null) {
	const canvas = document.getElementById('gameCanvas');
	if (!canvas) return;
	const clamped = Math.max(0.25, Math.min(3, Number(nextZoom) || 1));
	// compute world position under anchor before the change
	let before = null;
	if (anchorX !== null && anchorY !== null && typeof screenToWorldFloat === 'function') {
		before = screenToWorldFloat(anchorX, anchorY);
	}
	// apply zoom to both vars
	zoom = clamped;
	window.zoom = clamped;
	// keep the anchor fixed, if provided
	if (before) {
		const tNew = tileSize();
		window.camX = Math.round(before.x * tNew - anchorX);
		window.camY = Math.round(before.y * tNew - anchorY);
		if (typeof clampCam === 'function') clampCam();
	}
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
	setZoom(newZoom);
	// center camera
	const totalW = MAP_W * tileSize();
	const totalH = MAP_H * tileSize();
	// center the map in the canvas; allow negative offsets so smaller maps are centered
	window.camX = Math.round((totalW - canvas.width) / 2);
	window.camY = Math.round((totalH - canvas.height) / 2);
	if (typeof clampCam === 'function') clampCam();
	if (typeof render === 'function') render();
}
// Attach resize listener
window.addEventListener('resize', () => {
	resizeCanvasToWindow();
});

// expose fitMap only
window.fitMap = fitMap;
window.setZoom = setZoom;

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
	return { x: Math.floor(wx * t - camX), y: Math.floor(wy * t - camY) };
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
	const maxX = Math.max(0, wpx - gameCanvas.width);
	const maxY = Math.max(0, hpx - gameCanvas.height);
	const minX = Math.min(0, -(gameCanvas.width - wpx));
	const minY = Math.min(0, -(gameCanvas.height - hpx));
	camX = Math.max(minX, Math.min(camX, maxX));
	camY = Math.max(minY, Math.min(camY, maxY));
}

// Expone la camara y zoom para que ui.js pueda acceder a ellos
window.camX = window.camX || camX;
window.camY = window.camY || camY;
window.zoom = window.zoom || zoom;
function drawGrid() {
	if (!tiles || !tiles.length) return;
	const t = tileSize();
	if (!gameCanvas || !ctx) return;
	ctx.clearRect(0,0,gameCanvas.width,gameCanvas.height);
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

			// Edificios simples como marcador
			if (tile && tile.building) {
				const size = Math.max(6, Math.floor(t * 0.5));
				const ox = sx + Math.floor((t - size) / 2);
				const oy = sy + Math.floor((t - size) / 2);
				let col = '#e6c36a';
				switch (tile.building) {
					case 'granja': col = '#e6c36a'; break;
					case 'casa': col = '#d7e0ff'; break;
					case 'mina': col = '#b0b2b8'; break;
					case 'aserradero': col = '#7c5a3a'; break;
					case 'torre': col = '#a9c2f0'; break;
					case 'carretera': col = '#c2a87a'; break;
				}
				ctx.fillStyle = col;
				ctx.fillRect(ox, oy, size, size);
				ctx.strokeStyle = 'rgba(0,0,0,0.6)';
				ctx.lineWidth = 2;
				ctx.strokeRect(ox+0.5, oy+0.5, size-1, size-1);
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

// Exportar imagen del mapa completo a PNG usando un canvas fuera de pantalla
function exportMapImage(options = {}) {
	const t = Math.max(4, Math.min(64, Math.floor(options.tileSize || 8)));
	const includeElevation = !!(options.includeElevation ?? window.showElevation);
	const includeElevMap = !!(options.includeElevationMap ?? window.showElevationMap);
	const includeUnits = !!options.includeUnits; // por defecto falso
	const off = document.createElement('canvas');
	off.width = MAP_W * t;
	off.height = MAP_H * t;
	const c = off.getContext('2d');
	if (!c) return;
	// Fondo
	c.fillStyle = '#0b1220';
	c.fillRect(0,0,off.width,off.height);
	// Pintar tiles completos sin camara
	for (let x = 0; x < MAP_W; x++) {
		for (let y = 0; y < MAP_H; y++) {
			const tile = tiles[x][y];
			const sx = x * t, sy = y * t;
			const biomeCol = (tile && BIOMES[tile.biome]) ? BIOMES[tile.biome].color : BIOMES.grassland.color;
			c.fillStyle = biomeCol;
			c.fillRect(sx, sy, t, t);

			if (tile && tile.lake) {
				c.fillStyle = BIOMES.lake.color;
				c.fillRect(sx, sy, t, t);
			} else if (tile && tile.river) {
				c.fillStyle = BIOMES.river.color;
				const w = Math.max(2, Math.floor(t * 0.18));
				c.fillRect(sx + (t - w) / 2, sy + Math.floor(t*0.1), w, Math.floor(t*0.8));
			}

			if (includeElevMap && tile) {
				const e = Math.max(0, Math.min(1, tile.elevation || 0));
				let color;
				if (e < 0.33) color = '#4f9cff';
				else if (e < 0.66) color = '#7ec97c';
				else color = '#c59a6f';
				c.fillStyle = color;
				c.globalAlpha = 0.55;
				c.fillRect(sx, sy, t, t);
				c.globalAlpha = 1.0;
			}

			// bordes
			c.strokeStyle = 'rgba(0,0,0,0.06)';
			c.strokeRect(sx + 0.5, sy + 0.5, t-1, t-1);

			if (includeElevation && tile && t >= 12) {
				c.fillStyle = 'rgba(0,0,0,0.9)';
				c.textAlign = 'center';
				c.textBaseline = 'middle';
				const fontSize = Math.max(8, Math.floor(t * 0.28));
				c.font = fontSize + 'px monospace';
				const elev = (tile.elevation || 0).toFixed(2);
				c.fillText(elev, sx + t/2, sy + t/2 + 1);
			}
		}
	}

	if (includeUnits && window.unit) {
		const u = window.unit;
		const sx = u.x * t, sy = u.y * t;
		const size = t * 0.8;
		const offset = (t - size) / 2;
		c.fillStyle = '#f5d06b';
		c.fillRect(sx + offset, sy + offset, size, size);
		if (u.selected) {
			c.strokeStyle = 'rgba(46,163,255,0.95)';
			c.lineWidth = 3;
			c.strokeRect(sx + offset - 2, sy + offset - 2, size + 4, size + 4);
		}
	}

	const a = document.createElement('a');
	const nameSeed = (typeof seed !== 'undefined') ? String(seed) : 'map';
	a.download = `map_${nameSeed}_${MAP_W}x${MAP_H}_t${t}.png`;
	a.href = off.toDataURL('image/png');
	// desencadenar descarga
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
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
// Auto-fit on first load for a better initial view
if (typeof window.fitMap === 'function') window.fitMap();

// Muestra ui.js que estas funciones existen
window.regenerateMap = regenerateMap;

// Funciones de ayuda para consola
window.computeMapStats = computeMapStats;
window.sampleSeeds = sampleSeeds;
// export function global
window.exportMapImage = exportMapImage;

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


