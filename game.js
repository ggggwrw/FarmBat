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

// Unidad del jugador
window.unit = window.unit || { x: Math.floor(MAP_W/2), y: Math.floor(MAP_H/2), actionsMax: 2, actionsLeft: 2, selected: false };

// Paleta de colores
const BIOMES = {
	grassland: { color: '#7ec97c' },
	forest:    { color: '#37622a' },
	mountain:  { color: '#8b8b8b' },
	snow:      { color: '#ffffff' },
	river:     { color: '#8fd1ff' },
	lake:      { color: '#2a6fb0' }
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
window.tileSize = window.tileSize || tileSize;
window.clampCam = window.clampCam || clampCam;

window.showElevation = window.showElevation || false;

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

// --- Funciones de generación de biomas ---

function seededHash(x,y,seedVal){
	let n = x * 374761393 + y * 668265263 + (seedVal || seed) * 2654435761;
	n = (n ^ (n >> 13)) * 1274126177;
	n = n ^ (n >> 16);
	return (n >>> 0) / 4294967295;
}

function lerp(a,b,t){ return a + (b-a) * t; }

function smoothNoise(x,y,scale,seedVal){
	const fx = x / scale;
	const fy = y / scale;
	const x0 = Math.floor(fx), x1 = x0 + 1;
	const y0 = Math.floor(fy), y1 = y0 + 1;
	const sx = fx - x0, sy = fy - y0;
	const n00 = seededHash(x0,y0,seedVal);
	const n10 = seededHash(x1,y0,seedVal);
	const n01 = seededHash(x0,y1,seedVal);
	const n11 = seededHash(x1,y1,seedVal);
	const ix0 = lerp(n00, n10, sx);
	const ix1 = lerp(n01, n11, sx);
	return lerp(ix0, ix1, sy);
}

function fractalNoise(x,y,octaves,baseScale,seedVal){
	let v = 0;
	let amp = 1;
	let freq = 1;
	let max = 0;
	for (let i=0;i<octaves;i++){
		v += smoothNoise(x*freq, y*freq, baseScale, (seedVal||seed) + i*999) * amp;
		max += amp;
		amp *= 0.5;
		freq *= 2;
	}
	return v / max;
}

// Genera la elevacion y el bioma del mapa
function generateMaps(){
	tiles = Array.from({length: MAP_W}, () => Array.from({length: MAP_H}, () => null));
	for (let x=0;x<MAP_W;x++){
		for (let y=0;y<MAP_H;y++){
			const nx = x / MAP_W - 0.5;
			const ny = y / MAP_H - 0.5;
			const dist = Math.sqrt(nx*nx + ny*ny);

			let elevation = fractalNoise(x, y, 5, 12, seed + 10);

			elevation = elevation * 0.8 + (1 - dist) * 0.5 + (seededHash(x,y,seed + 42)-0.5) * 0.08;
			elevation = Math.max(0, Math.min(1, elevation));

			let moisture = fractalNoise(x+200, y+200, 4, 18, seed + 77);
			moisture = moisture * (1 - elevation * 0.45) + 0.06;
			moisture = Math.max(0, Math.min(1, moisture));

			tiles[x][y] = { elevation, moisture, biome: 'grassland', river: false };
		}
	}


	// Busca crear rios y lagos basados en elevacion y acumulacion de flujo
	const dirs = [ [1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1] ];
	const flowTo = Array.from({length: MAP_W}, () => Array.from({length: MAP_H}, () => null));
	const accumulation = Array.from({length: MAP_W}, () => Array.from({length: MAP_H}, () => 1));
	const cells = [];
	for (let x=0;x<MAP_W;x++) for (let y=0;y<MAP_H;y++) cells.push({x,y,e: tiles[x][y].elevation});

	// Trata de unirse a otros rios
	for (const c of cells) {
		let best = {e: tiles[c.x][c.y].elevation, nx: c.x, ny: c.y};
		for (const [dx,dy] of dirs) {
			const nx = c.x + dx, ny = c.y + dy;
			if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
			const te = tiles[nx][ny].elevation;
			if (te < best.e) { best = {e: te, nx, ny}; }
		}
		if (best.nx === c.x && best.ny === c.y) flowTo[c.x][c.y] = null; else flowTo[c.x][c.y] = {x: best.nx, y: best.ny};
	}
	cells.sort((a,b) => b.e - a.e);
	for (const c of cells) {
		const f = flowTo[c.x][c.y];
		if (f) accumulation[f.x][f.y] += accumulation[c.x][c.y];
	}

	// Crea rios basado en acumulacion de flujo y crea lagos en sumideros
	const flowFrom = Array.from({length: MAP_W}, () => Array.from({length: MAP_H}, () => []));
	for (let x=0;x<MAP_W;x++) for (let y=0;y<MAP_H;y++) {
		const f = flowTo[x][y];
		if (f) flowFrom[f.x][f.y].push({x,y});
	}

	// Crea agujeros pequeños de agua (lagos) en sumideros
	const mapArea = MAP_W * MAP_H;
	// Densidad mayor segun valores
	const riverMult = 1.0;
	const lakeMult = 0.6;
	const forestMult = 0.8; 
	const maxLakeArea = Math.max(1, Math.floor(mapArea * 0.0003 * lakeMult));
	const rimTolerance = 0.02;
	const visitedSink = new Set();

	function collectBasin(sx, sy) {
		const q = [{x:sx,y:sy}];
		const seen = new Set([sx+','+sy]);
		const basin = [];
		while (q.length) {
			const p = q.shift();
			basin.push(p);
			for (const from of flowFrom[p.x][p.y]){
				const key = from.x + ',' + from.y;
				if (seen.has(key)) continue;
				seen.add(key);
				q.push(from);
			}
			if (basin.length > maxLakeArea) return null;
		}
		return basin;
	}

	for (let x=0;x<MAP_W;x++) for (let y=0;y<MAP_H;y++) {
		if (flowTo[x][y] !== null) continue;
		const key = x+','+y; if (visitedSink.has(key)) continue; visitedSink.add(key);
		const basin = collectBasin(x,y);
		if (!basin) continue;

		let rimMin = Infinity;
		for (const cell of basin) {
			for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
				const nx = cell.x + dx, ny = cell.y + dy;
				if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
				if (basin.find(b => b.x===nx && b.y===ny)) continue;
				rimMin = Math.min(rimMin, tiles[nx][ny].elevation);
			}
		}
		const sinkElev = tiles[x][y].elevation;
		if (isFinite(rimMin) && rimMin - sinkElev > rimTolerance) {
			for (const cell of basin) tiles[cell.x][cell.y].lake = true;
		}
	}

	const accThreshold = Math.max(8, Math.floor((mapArea / 900) / Math.max(0.25, riverMult)));
	for (let x=0;x<MAP_W;x++) for (let y=0;y<MAP_H;y++) {
		if (tiles[x][y].lake) { tiles[x][y].river = false; continue; }
		if (accumulation[x][y] >= accThreshold) tiles[x][y].river = true;
		else tiles[x][y].river = false;
	}

	// Acumulacion de flujo por casillas
	for (let x=0;x<MAP_W;x++) for (let y=0;y<MAP_H;y++) {
		tiles[x][y].flowAccum = accumulation[x][y];
	}

	// Rangos de elevacion:
	// elevacion < 0.31 => lake
	// 0.31 <= elevacion < 0.35 => river
	// 0.35 <= elevacion < 0.45 => grassland
	// 0.45 <= elevacion < 0.60 => forest
	// 0.60 <= elevacion < 0.70 => mountain
	// elevacion >= 0.70 => snow
	for (let x=0;x<MAP_W;x++){
		for (let y=0;y<MAP_H;y++){
			const t = tiles[x][y];
			const e = t.elevation;
			// Lagos por elevacion
			if (e < 0.31) {
				t.lake = true;
				t.river = false;
				t.biome = 'lake';
				continue;
			}
			// Rios por elevacion o acumulacion
			if ((e >= 0.31 && e < 0.35) || (t.flowAccum && t.flowAccum >= accThreshold)) {
				t.river = true;
				t.lake = false;
				t.biome = 'river';
				continue;
			}
			// Biomas restantes
			if (e >= 0.35 && e < 0.45) { t.biome = 'grassland'; t.lake = false; t.river = false; continue; }
			if (e >= 0.45 && e < 0.60) { t.biome = 'forest'; t.lake = false; t.river = false; continue; }
			if (e >= 0.60 && e < 0.70) { t.biome = 'mountain'; t.lake = false; t.river = false; continue; }
			// e >= 0.70
			t.biome = 'snow'; t.lake = false; t.river = false;
		}
	}

	// Prioridad de creacion de bosque:
	for (let x=0;x<MAP_W;x++){
		for (let y=0;y<MAP_H;y++){
			const t = tiles[x][y];
			if (t.biome === 'grassland'){
				let nearRiver = false;
				for (let ox=-2; ox<=2; ox++){
					for (let oy=-2; oy<=2; oy++){
						const nx = x + ox, ny = y + oy;
						if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
						if (tiles[nx][ny].river) nearRiver = true;
					}
				}
						if (nearRiver && t.moisture > 0.36 && Math.random() < 0.28) t.biome = 'forest';
						else if (t.moisture > 0.72 && Math.random() < 0.22) t.biome = 'forest';
			}
		}
	}

	// Bosques que se expanden gradualmente
	for (let iter = 0; iter < 5; iter++){
		const changes = [];
		for (let x=0;x<MAP_W;x++){
			for (let y=0;y<MAP_H;y++){
				const t = tiles[x][y];
				if (t.biome !== 'grassland') continue;
				let forestNeighbors = 0;
				for (let ox=-1; ox<=1; ox++){
					for (let oy=-1; oy<=1; oy++){
						if (ox===0 && oy===0) continue;
						const nx = x + ox, ny = y + oy;
						if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
						if (tiles[nx][ny].biome === 'forest') forestNeighbors++;
					}
				}
				if (forestNeighbors >= 2 && t.moisture > 0.40 && Math.random() < 0.28) changes.push({x,y});
			}
		}
		for (const c of changes) tiles[c.x][c.y].biome = 'forest';
	}

	// Expansion de nieve desde picos altos
	for (let x=0;x<MAP_W;x++){
		for (let y=0;y<MAP_H;y++){
			const t = tiles[x][y];
			// Poner nieve en picos altos
			if (t.biome === 'mountain' && t.elevation > 0.86) t.biome = 'snow';
			if (t.biome !== 'snow'){
				let snowNeighbors = 0;
				for (let ox=-1; ox<=1; ox++){
					for (let oy=-1; oy<=1; oy++){
						if (ox===0 && oy===0) continue;
						const nx = x + ox, ny = y + oy;
						if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
						if (tiles[nx][ny].biome === 'snow') snowNeighbors++;
					}
				}
				if (snowNeighbors >= 2 && t.elevation > 0.72) t.biome = 'snow';
			}
		}
	}

	// Log
	(function logStats(){
		let minE=1, maxE=0, sumE=0, minM=1, maxM=0, sumM=0;
		const biomeCounts = { grassland:0, forest:0, mountain:0, lake:0, snow:0 };
		let riverCount = 0, lakeCount = 0;
		for (let x=0;x<MAP_W;x++){
			for (let y=0;y<MAP_H;y++){
				const t = tiles[x][y];
				minE = Math.min(minE, t.elevation);
				maxE = Math.max(maxE, t.elevation);
				sumE += t.elevation;
				minM = Math.min(minM, t.moisture);
				maxM = Math.max(maxM, t.moisture);
				sumM += t.moisture;
				biomeCounts[t.biome] = (biomeCounts[t.biome] || 0) + 1;
				if (t.river) riverCount++;
				if (t.lake) lakeCount++;
			}
		}
		const total = MAP_W * MAP_H;
		console.group('Map stats');
		console.log('elevation min/max/avg', minE.toFixed(3), maxE.toFixed(3), (sumE/total).toFixed(3));
		console.log('moisture min/max/avg', minM.toFixed(3), maxM.toFixed(3), (sumM/total).toFixed(3));
		console.log('biome counts', biomeCounts);
		console.log('river tiles', riverCount, 'lake tiles', lakeCount);
		console.groupEnd();
	})();
}
// Regenerar el mapa con una semilla opcional
function regenerateMap(newSeed) {
	if (typeof newSeed !== 'undefined') seed = Number(newSeed) || seed;
	console.log('Generating map with seed', seed);
	generateMaps();
	render();
}

// inicializar el mapa
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


