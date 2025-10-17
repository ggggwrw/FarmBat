// Canvas and world/camera (use window.canvas if ui.js already declared it)
const gameCanvas = window.canvas || document.getElementById('gameCanvas');
const ctx = gameCanvas && gameCanvas.getContext ? gameCanvas.getContext('2d') : null;

// World / camera
const BASE_TILE = 48; // base tile size in px
var zoom = 1.0; // zoom factor (1.0 = 100%) - var so UI code can access it via window.zoom
function tileSize() { return Math.max(6, Math.round(BASE_TILE * zoom)); }
const MAP_W = 140;
const MAP_H = 120;

// expose map size constants for UI
window.MAP_W = MAP_W;
window.MAP_H = MAP_H;

// game state (turn counter etc.)
window.gameState = window.gameState || { turn: 1 };

// runtime globals (some were accidentally removed by a large edit)
var seed = Math.floor(Math.random() * 1000000);
var tiles = [];
var camX = 0, camY = 0; // var so UI code can read/write window.camX/camY

// Provide a default unit if ui.js hasn't defined one yet. ui.js will overwrite/expose its own unit.
window.unit = window.unit || { x: Math.floor(MAP_W/2), y: Math.floor(MAP_H/2), actionsMax: 2, actionsLeft: 2, selected: false };

// interactive tuning settings were removed. Use tuned fixed defaults below.

// simple biome color palette used by drawGrid
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

// expose camera and helper hooks to UI
window.camX = window.camX || camX;
window.camY = window.camY || camY;
window.zoom = window.zoom || zoom;
window.tileSize = window.tileSize || tileSize;
window.clampCam = window.clampCam || clampCam;
// elevation overlay toggle
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
			// skip tiles outside view
			    if (!gameCanvas) continue;
			    if (sx + t < 0 || sy + t < 0 || sx > gameCanvas.width || sy > gameCanvas.height) continue;

			const biomeCol = (tile && BIOMES[tile.biome]) ? BIOMES[tile.biome].color : BIOMES.grassland.color;
			ctx.fillStyle = biomeCol;
			ctx.fillRect(sx, sy, t, t);

			// draw rivers and lakes specially
			if (tile && tile.lake) {
				ctx.fillStyle = BIOMES.lake.color;
				ctx.fillRect(sx, sy, t, t);
			} else if (tile && tile.river) {
				ctx.fillStyle = BIOMES.river.color;
				const w = Math.max(2, Math.floor(t * 0.18));
				ctx.fillRect(sx + (t - w) / 2, sy + Math.floor(t*0.1), w, Math.floor(t*0.8));
			}

			// elevation heatmap overlay
			if (window.showElevationMap && tile) {
				// simple colormap: low = blue, mid = green, high = brown
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

			// forest decoration
			if (tile && tile.biome === 'forest') {
				ctx.fillStyle = 'rgba(6,45,17,0.9)';
				const count = Math.max(1, Math.floor(t / 16));
				for (let i = 0; i < count; i++) {
					const px = sx + 2 + (i * 7) % Math.max(4, (t - 6));
					const py = sy + 2 + ((i * 9) % Math.max(6, (t - 6)));
					ctx.fillRect(px, py, Math.max(2, Math.floor(t * 0.06)), Math.max(4, Math.floor(t * 0.12)));
				}
			}

			// subtle grid lines
			ctx.strokeStyle = 'rgba(0,0,0,0.06)';
			ctx.strokeRect(sx + 0.5, sy + 0.5, t-1, t-1);

			// draw elevation value when requested (only if tile is large enough)
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
 
// Utility: shade hex color lighter/darker by amount (-255..255)
function shadeColor(hex, amount) {
	// parse
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
	// draw selection
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

// --- Biome generation functions ---

function seededHash(x,y,seedVal){
	let n = x * 374761393 + y * 668265263 + (seedVal || seed) * 2654435761;
	n = (n ^ (n >> 13)) * 1274126177;
	n = n ^ (n >> 16);
	return (n >>> 0) / 4294967295;
}

function lerp(a,b,t){ return a + (b-a) * t; }

function smoothNoise(x,y,scale,seedVal){
	// value noise with bilinear interpolation
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

function generateMaps(){
	tiles = Array.from({length: MAP_W}, () => Array.from({length: MAP_H}, () => null));
	// generate elevation and moisture with stronger diversity
	for (let x=0;x<MAP_W;x++){
		for (let y=0;y<MAP_H;y++){
			const nx = x / MAP_W - 0.5;
			const ny = y / MAP_H - 0.5;
			const dist = Math.sqrt(nx*nx + ny*ny);
			// elevation: fractal noise with smaller base scale to create bigger features
			let elevation = fractalNoise(x, y, 5, 12, seed + 10);
			// stronger center bias and slight randomness so peaks are more pronounced
			elevation = elevation * 0.8 + (1 - dist) * 0.5 + (seededHash(x,y,seed + 42)-0.5) * 0.08;
			elevation = Math.max(0, Math.min(1, elevation));

			// moisture: more variation and slightly higher baseline
			let moisture = fractalNoise(x+200, y+200, 4, 18, seed + 77);
			moisture = moisture * (1 - elevation * 0.45) + 0.06;
			moisture = Math.max(0, Math.min(1, moisture));

			tiles[x][y] = { elevation, moisture, biome: 'grassland', river: false };
		}
	}


	// D8 flow-direction + accumulation approach
	// compute flow-to for each cell (8 neighbors) then accumulation
	const dirs = [ [1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1] ];
	const flowTo = Array.from({length: MAP_W}, () => Array.from({length: MAP_H}, () => null));
	const accumulation = Array.from({length: MAP_W}, () => Array.from({length: MAP_H}, () => 1));
	const cells = [];
	for (let x=0;x<MAP_W;x++) for (let y=0;y<MAP_H;y++) cells.push({x,y,e: tiles[x][y].elevation});

	// flow to lowest neighbor (or null if local minima)
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

	// accumulate flow: process from high to low elevation
	cells.sort((a,b) => b.e - a.e);
	for (const c of cells) {
		const f = flowTo[c.x][c.y];
		if (f) accumulation[f.x][f.y] += accumulation[c.x][c.y];
	}

	// build upstream lists for sinks and basin collection
	const flowFrom = Array.from({length: MAP_W}, () => Array.from({length: MAP_H}, () => []));
	for (let x=0;x<MAP_W;x++) for (let y=0;y<MAP_H;y++) {
		const f = flowTo[x][y];
		if (f) flowFrom[f.x][f.y].push({x,y});
	}

	// detect sinks and create small lakes from upstream basin (bounded size)
	const mapArea = MAP_W * MAP_H;
	// fixed tuned multipliers (sliders removed)
	// riverMult: higher -> more rivers; lakeMult: higher -> larger/more lakes; forestMult: higher -> easier forest
	const riverMult = 1.0;   // baseline river density
	const lakeMult = 0.6;    // reduce lake sizes compared to earlier default
	const forestMult = 0.7;  // make forests somewhat rarer
	// base lake area, scaled by lakeMult (higher = more lakes)
	const maxLakeArea = Math.max(1, Math.floor(mapArea * 0.0003 * lakeMult));
	// require rim to be noticeably higher than sink to actually hold water
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
		if (flowTo[x][y] !== null) continue; // not a sink
		const key = x+','+y; if (visitedSink.has(key)) continue; visitedSink.add(key);
		const basin = collectBasin(x,y);
		if (!basin) continue; // too large
		// compute rim min elevation
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
		// require the rim to be higher than the sink by rimTolerance
		if (isFinite(rimMin) && rimMin - sinkElev > rimTolerance) {
			for (const cell of basin) tiles[cell.x][cell.y].lake = true;
		}
	}

	// mark river by accumulation threshold, but don't mark lake tiles as river
	// scale by tuning slider (riverDensity higher => more rivers => lower threshold)
	// accThreshold inversely proportional to riverMult: higher riverMult -> lower threshold -> more rivers
	const accThreshold = Math.max(8, Math.floor((mapArea / 900) / Math.max(0.25, riverMult)));
	for (let x=0;x<MAP_W;x++) for (let y=0;y<MAP_H;y++) {
		if (tiles[x][y].lake) { tiles[x][y].river = false; continue; }
		if (accumulation[x][y] >= accThreshold) tiles[x][y].river = true;
		else tiles[x][y].river = false;
	}

	// persist accumulation into tiles for debugging/tuning
	for (let x=0;x<MAP_W;x++) for (let y=0;y<MAP_H;y++) {
		tiles[x][y].flowAccum = accumulation[x][y];
	}

	// assign biomes with adjusted thresholds for more variety
	// assign biomes based on explicit elevation bands (user-specified)
	// user ranges:
	// elevation < 0.31 => lake
	// 0.31 <= elevation < 0.35 => river
	// 0.35 <= elevation < 0.45 => grassland
	// 0.45 <= elevation < 0.60 => forest
	// 0.60 <= elevation < 0.70 => mountain
	// elevation >= 0.70 => snow
	for (let x=0;x<MAP_W;x++){
		for (let y=0;y<MAP_H;y++){
			const t = tiles[x][y];
			const e = t.elevation;
			// elevation-based lakes override other flags
			if (e < 0.31) {
				t.lake = true;
				t.river = false;
				t.biome = 'lake';
				continue;
			}
			// Rivers: either elevation band OR strong accumulation
			if ((e >= 0.31 && e < 0.35) || (t.flowAccum && t.flowAccum >= accThreshold)) {
				t.river = true;
				t.lake = false;
				t.biome = 'river';
				continue;
			}
			// remaining bands
			if (e >= 0.35 && e < 0.45) { t.biome = 'grassland'; t.lake = false; t.river = false; continue; }
			if (e >= 0.45 && e < 0.60) { t.biome = 'forest'; t.lake = false; t.river = false; continue; }
			if (e >= 0.60 && e < 0.70) { t.biome = 'mountain'; t.lake = false; t.river = false; continue; }
			// e >= 0.70
			t.biome = 'snow'; t.lake = false; t.river = false;
		}
	}

	// seed additional forests near rivers and high-moisture areas
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

	// spread forests several passes
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

	// snow expansion around peaks
	for (let x=0;x<MAP_W;x++){
		for (let y=0;y<MAP_H;y++){
			const t = tiles[x][y];
			// only convert the highest mountains to permanent snow (match initial snow cutoff)
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
				// require higher elevation to spread snow to neighbors so mountains remain visible
				if (snowNeighbors >= 2 && t.elevation > 0.72) t.biome = 'snow';
			}
		}
	}

	// log stats
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

// generate maps initially
// Expose regenerateMap and helpers for UI script to call
function regenerateMap(newSeed) {
	if (typeof newSeed !== 'undefined') seed = Number(newSeed) || seed;
	console.log('Generating map with seed', seed);
	generateMaps();
	render();
}

// initial generation
regenerateMap(seed);

// Expose for ui.js and console usage
window.regenerateMap = regenerateMap;

// expose helpful functions for UI
window.computeMapStats = computeMapStats;
window.sampleSeeds = sampleSeeds;

// Helpers for tuning
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

// Run N samples (different random seeds) and print concise stats to console
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
	// restore seed and regenerate original map
	seed = start;
	generateMaps(); render();
}

window.computeMapStats = computeMapStats;
window.sampleSeeds = sampleSeeds;


