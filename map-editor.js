// map-editor.js — lightweight editor using the same tile schema as game.js/map.js
(function(){
    'use strict';

    // Canvas and context
    const canvas = document.getElementById('editorCanvas');
    const ctx = canvas.getContext('2d');

    // World size (reuse game's defaults)
    const MAP_W = 140;
    const MAP_H = 120;
    const BASE_TILE = 48;
    let zoom = 1.0;
    function tileSize(){ return Math.max(6, Math.round(BASE_TILE * zoom)); }

    // Camera
    let camX = 0, camY = 0;
    function clampCam(){
        const t = tileSize();
        const wpx = MAP_W * t;
        const hpx = MAP_H * t;
        const maxX = Math.max(0, wpx - canvas.width);
        const maxY = Math.max(0, hpx - canvas.height);
        const minX = Math.min(0, -(canvas.width - wpx));
        const minY = Math.min(0, -(canvas.height - hpx));
        camX = Math.max(minX, Math.min(camX, maxX));
        camY = Math.max(minY, Math.min(camY, maxY));
    }
    function worldToScreen(wx, wy){ const t = tileSize(); return { x: Math.floor(wx*t - camX), y: Math.floor(wy*t - camY) }; }
    function screenToWorld(sx, sy){ const t = tileSize(); return { x: Math.floor((sx + camX) / t), y: Math.floor((sy + camY) / t) }; }
    function screenToWorldFloat(sx, sy){ const t = tileSize(); return { x: (sx + camX) / t, y: (sy + camY) / t }; }

    // Tiles and seed
    let tiles = [];
    let seed = Math.floor(Math.random()*1_000_000);

    // Presets
    const presetSelect = document.getElementById('presetSelect');
    function refreshPresetOptions(){
        if (!window.mapPresets) return;
        presetSelect.innerHTML = '';
        Object.values(window.mapPresets).forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.title || p.id;
            presetSelect.appendChild(opt);
        });
        // default selection
        const active = (window.getActiveMapPreset && window.getActiveMapPreset()) || window.mapPresets.normal;
        if (active) presetSelect.value = active.id;
    }

    // Rendering colors (copied from game.js to stay consistent)
    const BIOMES = {
        grassland: { color: '#7ec97c' },
        forest:    { color: '#37622a' },
        mountain:  { color: '#8b8b8b' },
        snow:      { color: '#ffffff' },
        river:     { color: '#8fd1ff' },
        lake:      { color: '#2a6fb0' },
        beach:     { color: '#f2e394' },
    };

    // UI elements
    const seedInput = document.getElementById('seedInputEditor');
    const regenBtn = document.getElementById('regenEditorBtn');
    const randomBtn = document.getElementById('randomEditorBtn');
    const toolSelect = document.getElementById('toolSelect');
    const biomeSelect = document.getElementById('biomeSelect');
    const brushSizeInput = document.getElementById('brushSize');
    const elevDeltaInput = document.getElementById('elevDelta');
    const toggleElevMapBtn = document.getElementById('toggleElevMapEditorBtn');
    const fitMapBtn = document.getElementById('fitMapEditorBtn');
    const recalcBiomesBtn = document.getElementById('recalcBiomesBtn');
    const recalcHydroBtn = document.getElementById('recalcHydroBtn');
    const importPresetBtn = document.getElementById('importPresetBtn');
    const importPresetFile = document.getElementById('importPresetFile');
    const importMapBtn = document.getElementById('importMapBtn');
    const importMapFile = document.getElementById('importMapFile');
    const exportMapBtn = document.getElementById('exportMapBtn');

    // Toggles
    let showElevationMap = false;

    let hoverTile = null;
    function draw(){
        if (!tiles || !tiles.length) return;
        const t = tileSize();
        ctx.clearRect(0,0,canvas.width, canvas.height);
        for (let x=0;x<MAP_W;x++){
            for (let y=0;y<MAP_H;y++){
                const tile = tiles[x][y];
                const p = worldToScreen(x,y);
                const sx = p.x, sy = p.y;
                if (sx + t < 0 || sy + t < 0 || sx > canvas.width || sy > canvas.height) continue;
                const biomeCol = (tile && BIOMES[tile.biome]) ? BIOMES[tile.biome].color : BIOMES.grassland.color;
                ctx.fillStyle = biomeCol;
                ctx.fillRect(sx, sy, t, t);
                if (tile && tile.lake) {
                    ctx.fillStyle = BIOMES.lake.color;
                    ctx.fillRect(sx, sy, t, t);
                } else if (tile && tile.river) {
                    ctx.fillStyle = BIOMES.river.color;
                    const w = Math.max(2, Math.floor(t * 0.18));
                    ctx.fillRect(sx + (t - w) / 2, sy + Math.floor(t*0.1), w, Math.floor(t*0.8));
                }
                if (showElevationMap && tile) {
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
                ctx.strokeStyle = 'rgba(0,0,0,0.06)';
                ctx.strokeRect(sx + 0.5, sy + 0.5, t-1, t-1);
            }
        }
        // Hover brush preview overlay
        if (hoverTile){
            const size = parseInt(brushSizeInput.value, 10) || 1;
            ctx.save();
            ctx.globalAlpha = 0.22;
            ctx.fillStyle = '#2ea3ff';
            paintCircle(hoverTile.x, hoverTile.y, size, (x,y)=>{
                const p = worldToScreen(x,y);
                ctx.fillRect(p.x, p.y, t, t);
            });
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    function generate(presetId){
        const preset = (window.mapPresets && window.mapPresets[presetId]) || (window.getActiveMapPreset && window.getActiveMapPreset()) || window.mapPresets?.normal || null;
        if (typeof window.generateTiles === 'function') {
            tiles = window.generateTiles(seed, MAP_W, MAP_H, preset);
        } else {
            tiles = Array.from({length: MAP_W}, ()=>Array.from({length: MAP_H}, ()=>({ elevation:0, moisture:0, biome:'grassland', river:false })));
        }
        draw();
    }

    function fitMap(){
        // fit entire map to current canvas size
        const pad = 16;
        const availableW = Math.max(100, canvas.width - pad * 2);
        const availableH = Math.max(100, canvas.height - pad * 2);
        const tileW = Math.floor(availableW / MAP_W);
        const tileH = Math.floor(availableH / MAP_H);
        const bestTile = Math.max(6, Math.min(tileW || 6, tileH || 6));
        zoom = Math.max(0.1, Math.min(4, bestTile / BASE_TILE));
        // center (allows negative cam when map smaller than canvas)
        const totalW = MAP_W * tileSize();
        const totalH = MAP_H * tileSize();
        camX = Math.round((totalW - canvas.width) / 2);
        camY = Math.round((totalH - canvas.height) / 2);
        clampCam();
        draw();
    }

    // Painting tools
    function paintCircle(cx, cy, radius, fn){
        const r2 = radius*radius;
        const minx = Math.max(0, cx - radius), maxx = Math.min(MAP_W-1, cx + radius);
        const miny = Math.max(0, cy - radius), maxy = Math.min(MAP_H-1, cy + radius);
        for (let x=minx; x<=maxx; x++){
            for (let y=miny; y<=maxy; y++){
                const dx = x - cx, dy = y - cy;
                if (dx*dx + dy*dy <= r2) fn(x,y, tiles[x][y]);
            }
        }
    }

    function doToolAt(wx, wy){
        const tool = toolSelect.value;
        const size = parseInt(brushSizeInput.value, 10) || 1; // radius in tiles
        if (wx < 0 || wy < 0 || wx >= MAP_W || wy >= MAP_H) return;
        if (tool === 'biome'){
            const b = biomeSelect.value || 'grassland';
            paintCircle(wx, wy, size, (x,y,t)=>{
                t.biome = b;
                t.river = (b === 'river');
                t.lake = (b === 'lake');
            });
        } else if (tool === 'elevate'){
            const delta = parseFloat(elevDeltaInput.value || '0.05');
            const add = !keys.altKey; // Add by default, hold Alt to subtract
            const amount = add ? delta : -delta;
            paintCircle(wx, wy, size, (x,y,t)=>{
                t.elevation = Math.max(0, Math.min(1, (t.elevation || 0) + amount));
            });
        } else if (tool === 'river'){
            paintCircle(wx, wy, size, (x,y,t)=>{ t.river = !t.river; if (t.river) { t.lake = false; t.biome = 'river'; } });
        } else if (tool === 'lake'){
            paintCircle(wx, wy, size, (x,y,t)=>{ t.lake = !t.lake; if (t.lake) { t.river = false; t.biome = 'lake'; } });
        }
    }
    function applyTool(wx, wy){ doToolAt(wx, wy); draw(); }

    function lineTiles(x0,y0,x1,y1, cb){
        let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
        let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        while (true) {
            cb(x0,y0);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
    }

    // Input handling
    let draggingLeft = false;
    let draggingRight = false;
    let dragStart = null;
    let lastPaintTile = null;
    const keys = { shift:false, altKey:false };

    canvas.addEventListener('contextmenu', (e)=>{ e.preventDefault(); });
    function getMouseCanvasPos(e){
        const rect = canvas.getBoundingClientRect();
        const cs = window.getComputedStyle(canvas);
        const bl = parseFloat(cs.borderLeftWidth) || 0;
        const bt = parseFloat(cs.borderTopWidth) || 0;
        const br = parseFloat(cs.borderRightWidth) || 0;
        const bb = parseFloat(cs.borderBottomWidth) || 0;
        const contentW = Math.max(1, rect.width - bl - br);
        const contentH = Math.max(1, rect.height - bt - bb);
        const scaleX = canvas.width / contentW;
        const scaleY = canvas.height / contentH;
        const x = (e.clientX - rect.left - bl) * scaleX;
        const y = (e.clientY - rect.top - bt) * scaleY;
        return { x, y };
    }
    canvas.addEventListener('mousedown', (e)=>{
        const { x, y } = getMouseCanvasPos(e);
        const w = screenToWorld(x,y);
        if (e.button === 0){
            draggingLeft = true;
            hoverTile = { x: w.x, y: w.y }; // keep preview under brush while painting
            applyTool(w.x, w.y);
            lastPaintTile = { x: w.x, y: w.y };
        }
        if (e.button === 2){ draggingRight = true; dragStart = { x:e.clientX, y:e.clientY, camX, camY }; }
    });
    window.addEventListener('mousemove', (e)=>{
        if (draggingRight && dragStart){
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            camX = dragStart.camX - dx; camY = dragStart.camY - dy; clampCam(); draw();
        }
        if (draggingLeft){
            const { x, y } = getMouseCanvasPos(e);
            const w = screenToWorld(x,y);
            hoverTile = { x: w.x, y: w.y }; // update preview while painting
            if (keys.shift && lastPaintTile){
                lineTiles(lastPaintTile.x, lastPaintTile.y, w.x, w.y, (lx,ly)=> doToolAt(lx,ly));
                draw();
            } else {
                applyTool(w.x, w.y);
            }
            lastPaintTile = { x: w.x, y: w.y };
        } else {
            // Update hover preview when not painting
            const { x, y } = getMouseCanvasPos(e);
            const w = screenToWorld(x,y);
            if (w.x >= 0 && w.y >= 0 && w.x < MAP_W && w.y < MAP_H) {
                hoverTile = { x: w.x, y: w.y };
            } else hoverTile = null;
            draw();
        }
    });
    canvas.addEventListener('mouseleave', ()=>{ hoverTile = null; draw(); });
    window.addEventListener('mouseup', ()=>{ draggingLeft = false; draggingRight = false; dragStart = null; lastPaintTile = null; });
    canvas.addEventListener('wheel', (e)=>{
        e.preventDefault();
        const { x: mx, y: my } = getMouseCanvasPos(e);
        const before = screenToWorldFloat(mx, my);
        const delta = Math.sign(e.deltaY) * -0.1;
        zoom = Math.max(0.25, Math.min(3, zoom + delta));
        const tNew = tileSize();
        camX = Math.round(before.x * tNew - mx);
        camY = Math.round(before.y * tNew - my);
        clampCam();
        draw();
    }, { passive: false });
    window.addEventListener('keydown', (e)=>{
        if (e.key === 'Shift') keys.shift = true;
        if (e.key === 'Alt') keys.altKey = true;
        const step = tileSize();
        if (e.key === 'ArrowLeft'){ camX -= step; clampCam(); draw(); }
        if (e.key === 'ArrowRight'){ camX += step; clampCam(); draw(); }
        if (e.key === 'ArrowUp'){ camY -= step; clampCam(); draw(); }
        if (e.key === 'ArrowDown'){ camY += step; clampCam(); draw(); }
        if (e.key.toLowerCase() === 'w'){ zoom = Math.min(3, zoom + 0.1); clampCam(); draw(); }
        if (e.key.toLowerCase() === 's'){ zoom = Math.max(0.25, zoom - 0.1); clampCam(); draw(); }
    });
    window.addEventListener('keyup', (e)=>{
        if (e.key === 'Shift') keys.shift = false;
        if (e.key === 'Alt') keys.altKey = false;
    });

    // Buttons
    regenBtn.addEventListener('click', ()=>{ if (seedInput.value) seed = Number(seedInput.value) || seed; generate(presetSelect.value); });
    randomBtn.addEventListener('click', ()=>{ seed = Math.floor(Math.random()*1_000_000); seedInput.value = seed; generate(presetSelect.value); });
    toggleElevMapBtn.addEventListener('click', ()=>{ showElevationMap = !showElevationMap; toggleElevMapBtn.textContent = showElevationMap ? 'Ocultar Mapa Elev' : 'Mapa de Elevación'; draw(); });
    fitMapBtn.addEventListener('click', ()=> fitMap());
    presetSelect.addEventListener('change', ()=> generate(presetSelect.value));
    recalcBiomesBtn.addEventListener('click', ()=>{
        // Recompute biome labels from elevation thresholds of the selected preset; keep manual river/lake flags as overrides
        const preset = (window.mapPresets && window.mapPresets[presetSelect.value]) || window.mapPresets?.normal;
        const thresholds = preset?.biomeThresholds || { lake: 0.31, beachRounded: 0.32, riverMin: 0.33, riverMax: 0.35, grassMin: 0.35, grassMax: 0.50, forestMin: 0.50, forestMax: 0.60, mountainMin: 0.60, mountainMax: 0.70, snowMin: 0.70 };
        for (let x=0;x<MAP_W;x++){
            for (let y=0;y<MAP_H;y++){
                const t = tiles[x][y];
                const e = t.elevation || 0;
                if (t.lake) { t.biome = 'lake'; continue; }
                if (t.river) { t.biome = 'river'; continue; }
                if (e < thresholds.lake) { t.biome = 'lake'; continue; }
                const eRounded = Math.round(e * 100) / 100;
                if (eRounded === thresholds.beachRounded) { t.biome = 'beach'; continue; }
                if (e >= thresholds.grassMin && e < thresholds.grassMax) { t.biome = 'grassland'; continue; }
                if (e >= thresholds.forestMin && e < thresholds.forestMax) { t.biome = 'forest'; continue; }
                if (e >= thresholds.mountainMin && e < thresholds.mountainMax) { t.biome = 'mountain'; continue; }
                if (e >= thresholds.snowMin) { t.biome = 'snow'; continue; }
            }
        }
        draw();
    });
    recalcHydroBtn.addEventListener('click', ()=>{
        // Build simple flow/accum grid based on current elevations to mark rivers and lakes, akin to map.js
        const dirs = [ [1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1] ];
        const flowTo = Array.from({length: MAP_W}, () => Array.from({length: MAP_H}, () => null));
        const accumulation = Array.from({length: MAP_W}, () => Array.from({length: MAP_H}, () => 1));
        const cells = [];
        for (let x=0;x<MAP_W;x++) for (let y=0;y<MAP_H;y++) cells.push({x,y,e: tiles[x][y].elevation||0});
        for (const c of cells){
            let best = { e: tiles[c.x][c.y].elevation||0, nx: c.x, ny: c.y };
            for (const [dx,dy] of dirs){
                const nx = c.x + dx, ny = c.y + dy;
                if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
                const te = tiles[nx][ny].elevation || 0;
                if (te < best.e) best = { e: te, nx, ny };
            }
            if (best.nx === c.x && best.ny === c.y) flowTo[c.x][c.y] = null; else flowTo[c.x][c.y] = { x: best.nx, y: best.ny };
        }
        cells.sort((a,b)=> (b.e - a.e));
        for (const c of cells){ const f = flowTo[c.x][c.y]; if (f) accumulation[f.x][f.y] += accumulation[c.x][c.y]; }
        // mark lakes if sinks are sufficiently below rim
        const flowFrom = Array.from({length: MAP_W}, () => Array.from({length: MAP_H}, () => []));
        for (let x=0;x<MAP_W;x++) for (let y=0;y<MAP_H;y++){ const f = flowTo[x][y]; if (f) flowFrom[f.x][f.y].push({x,y}); }
        const visited = new Set();
        const maxLakeArea = Math.max(1, Math.floor((MAP_W*MAP_H) * 0.0003));
        const rimTol = 0.02;
        function collectBasin(sx,sy){ const q=[{x:sx,y:sy}], seen=new Set([sx+','+sy]); const basin=[]; while(q.length){ const p=q.shift(); basin.push(p); for(const from of flowFrom[p.x][p.y]){ const key=from.x+','+from.y; if(seen.has(key)) continue; seen.add(key); q.push(from);} if (basin.length>maxLakeArea) return null; } return basin; }
        for (let x=0;x<MAP_W;x++) for (let y=0;y<MAP_H;y++){
            if (flowTo[x][y] !== null) continue; const key = x+','+y; if (visited.has(key)) continue; visited.add(key);
            const basin = collectBasin(x,y); if (!basin) continue;
            let rimMin = Infinity;
            for (const cell of basin){
                for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
                    const nx = cell.x + dx, ny = cell.y + dy;
                    if (nx<0||ny<0||nx>=MAP_W||ny>=MAP_H) continue;
                    if (basin.find(b=>b.x===nx && b.y===ny)) continue;
                    rimMin = Math.min(rimMin, tiles[nx][ny].elevation||0);
                }
            }
            const sinkElev = tiles[x][y].elevation||0;
            if (isFinite(rimMin) && rimMin - sinkElev > rimTol){ for (const cell of basin){ tiles[cell.x][cell.y].lake = true; tiles[cell.x][cell.y].river = false; tiles[cell.x][cell.y].biome = 'lake'; } }
        }
        const accThreshold = Math.max(8, Math.floor(((MAP_W*MAP_H)/900)));
        for (let x=0;x<MAP_W;x++) for (let y=0;y<MAP_H;y++){
            if (tiles[x][y].lake) { tiles[x][y].river = false; continue; }
            tiles[x][y].river = accumulation[x][y] >= accThreshold;
            if (tiles[x][y].river) tiles[x][y].biome = 'river';
        }
        draw();
    });

    // Import/Export
    importPresetBtn.addEventListener('click', ()=> importPresetFile.click());
    importPresetFile.addEventListener('change', async (e)=>{
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try {
            const text = await f.text();
            const data = JSON.parse(text);
            // Accept either a single preset object {id:..., biomeThresholds:...} or a map {id: preset}
            if (data && data.id) {
                window.mapPresets = window.mapPresets || {}; window.mapPresets[data.id] = data;
            } else {
                Object.keys(data || {}).forEach(k => { window.mapPresets[k] = data[k]; });
            }
            refreshPresetOptions();
        } catch (err) {
            alert('Invalid preset JSON');
        } finally {
            importPresetFile.value = '';
        }
    });

    importMapBtn.addEventListener('click', ()=> importMapFile.click());
    importMapFile.addEventListener('change', async (e)=>{
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try {
            const text = await f.text();
            const data = JSON.parse(text);
            if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('Expected 2D array');
            // Shallow-validate tile objects
            const w = data.length, h = data[0].length;
            if (w !== MAP_W || h !== MAP_H) {
                const ok = confirm(`Map size ${w}x${h} differs from editor ${MAP_W}x${MAP_H}. Resize by cropping/padding?`);
                if (!ok) return;
                tiles = Array.from({length: MAP_W}, (_,x)=> Array.from({length: MAP_H}, (_,y)=> data[x]?.[y] || { elevation:0, moisture:0, biome:'grassland', river:false }));
            } else {
                tiles = data;
            }
            draw();
        } catch (err) {
            alert('Invalid map JSON');
        } finally {
            importMapFile.value = '';
        }
    });

    exportMapBtn.addEventListener('click', ()=>{
        const blob = new Blob([JSON.stringify(tiles)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `map-${MAP_W}x${MAP_H}-seed${seed}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // Resize behavior
    function resizeCanvas(){
        // Fill available space to the right of the sidebar
        const sidebar = document.getElementById('editorSidebar');
        const leftUsed = (sidebar?.offsetWidth || 300) + 36; // sidebar + gap
        const margin = 18;
        const width = Math.max(600, window.innerWidth - leftUsed - margin);
        const height = Math.max(360, window.innerHeight - margin*2);
        canvas.width = width;
        canvas.height = height;
        clampCam();
        draw();
    }
    window.addEventListener('resize', resizeCanvas);

    // Init with a robust wait for map.js (generateTiles + presets)
    function initOnceReady(attempt = 0){
        const MAX_ATTEMPTS = 30; // ~3s total at 100ms
        if (!window.generateTiles || !window.mapPresets) {
            if (attempt < MAX_ATTEMPTS) {
                setTimeout(()=> initOnceReady(attempt+1), 100);
                return;
            }
        }
        refreshPresetOptions();
        resizeCanvas();
        generate(presetSelect.value || (window.mapPresets?.normal?.id || 'normal'));
        fitMap();
    }
    if (document.readyState === 'complete') initOnceReady();
    else window.addEventListener('load', initOnceReady);
})();
