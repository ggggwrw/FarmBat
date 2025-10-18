// map.js - map presets and preferences
(function(){
    window.mapPresets = window.mapPresets || {};

    window.mapPresets.normal = {
        id: 'normal',
        title: 'Normal',
        difficulty: 'Easy',
        riverMult: 0.28,
        lakeMult: 0.6,
        forestMult: 0.8,
        forceElevationBiomes: true,
        islandMode: false,
        biomeThresholds: {
            lake: 0.31,
            beachRounded: 0.32,
            riverMin: 0.33,
            riverMax: 0.35,
            grassMin: 0.35,
            grassMax: 0.50,
            forestMin: 0.50,
            forestMax: 0.60,
            mountainMin: 0.60,
            mountainMax: 0.70,
            snowMin: 0.70
        },
        description: 'Normal gameplay like Civ6 — Easy'
    };

    window.mapPresets.islands = {
        id: 'islands',
        title: 'Islands',
        difficulty: 'Medium',
        // islands should have fewer rivers, smaller lakes and slightly fewer forests
        riverMult: 0.12,
        lakeMult: 0.45,
        forestMult: 0.6,
        forceElevationBiomes: false,
        islandMode: true,
        biomeThresholds: {
            lake: 0.30,
            beachRounded: 0.32,
            riverMin: 0.33,
            riverMax: 0.35,
            grassMin: 0.34,
            grassMax: 0.50,
            forestMin: 0.50,
            forestMax: 0.60,
            mountainMin: 0.60,
            mountainMax: 0.70,
            snowMin: 0.70
        },
        description: 'Naval combat focused — Medium'
    };

    window.getActiveMapPreset = function(){
        const t = (window.worldType || 'normal');
        return window.mapPresets[t] || window.mapPresets.normal;
    };
    
    // --- Generation helpers moved here so map.js can fully control generation ---
    function seededHash(x,y,seedVal){
        let n = x * 374761393 + y * 668265263 + (seedVal || 0) * 2654435761;
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
            v += smoothNoise(x*freq, y*freq, baseScale, (seedVal||0) + i*999) * amp;
            max += amp;
            amp *= 0.5;
            freq *= 2;
        }
        return v / max;
    }

    // generateTiles: returns a 2D array [x][y] of tile objects for a given preset
    window.generateTiles = function(seedVal, width, height, preset){
        const MAP_W = width;
        const MAP_H = height;
        const seedLocal = Number(seedVal) || Math.floor(Math.random()*1000000);
        const tiles = Array.from({length: MAP_W}, () => Array.from({length: MAP_H}, () => null));

        // presets and thresholds
        const activePreset = preset || window.getActiveMapPreset();
        const defaultThresholds = { lake: 0.31, beachRounded: 0.32, riverMin: 0.33, riverMax: 0.35, grassMin: 0.35, grassMax: 0.50, forestMin: 0.50, forestMax: 0.60, mountainMin: 0.60, mountainMax: 0.70, snowMin: 0.70 };
        const thresholds = (activePreset && activePreset.biomeThresholds) ? activePreset.biomeThresholds : defaultThresholds;
        const riverMult = (activePreset && typeof activePreset.riverMult === 'number') ? activePreset.riverMult : 0.28;
        const lakeMult = (activePreset && typeof activePreset.lakeMult === 'number') ? activePreset.lakeMult : 0.6;
        const forestMult = (activePreset && typeof activePreset.forestMult === 'number') ? activePreset.forestMult : 0.8;

        const presetId = (activePreset && activePreset.id) ? activePreset.id : 'normal';
        // defaults
        let octavesElev = 5, scaleElev = 12, elevWeightCenter = 0.5, elevNoiseJitter = 0.08;
        let octavesMoist = 4, scaleMoist = 18;

        if (presetId === 'islands') {
            // islands: slightly larger-scale elevation noise, more octaves, stronger central bias
            octavesElev = 6; scaleElev = 16; elevWeightCenter = 0.75; elevNoiseJitter = 0.06;
            octavesMoist = 3; scaleMoist = 20;
        } else if (presetId === 'normal') {
            octavesElev = 5; scaleElev = 12; elevWeightCenter = 0.5; elevNoiseJitter = 0.08;
            octavesMoist = 4; scaleMoist = 18;
        }

        for (let x=0;x<MAP_W;x++){
            for (let y=0;y<MAP_H;y++){
                const nx = x / MAP_W - 0.5;
                const ny = y / MAP_H - 0.5;
                const dist = Math.sqrt(nx*nx + ny*ny);

                let elevation = fractalNoise(x, y, octavesElev, scaleElev, seedLocal + 10);
                elevation = elevation * 0.8 + (1 - dist) * elevWeightCenter + (seededHash(x,y,seedLocal + 42)-0.5) * elevNoiseJitter;
                elevation = Math.max(0, Math.min(1, elevation));

                let moisture = fractalNoise(x+200, y+200, octavesMoist, scaleMoist, seedLocal + 77);
                moisture = moisture * (1 - elevation * 0.45) + 0.06;
                moisture = Math.max(0, Math.min(1, moisture));

                tiles[x][y] = { elevation, moisture, biome: 'grassland', river: false };
            }
        }

    // (preset/thresholds/multipliers defined earlier)

        // flow calculation
        const dirs = [ [1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1] ];
        const flowTo = Array.from({length: MAP_W}, () => Array.from({length: MAP_H}, () => null));
        const accumulation = Array.from({length: MAP_W}, () => Array.from({length: MAP_H}, () => 1));
        const cells = [];
        for (let x=0;x<MAP_W;x++) for (let y=0;y<MAP_H;y++) cells.push({x,y,e: tiles[x][y].elevation});

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

        const flowFrom = Array.from({length: MAP_W}, () => Array.from({length: MAP_H}, () => []));
        for (let x=0;x<MAP_W;x++) for (let y=0;y<MAP_H;y++) {
            const f = flowTo[x][y];
            if (f) flowFrom[f.x][f.y].push({x,y});
        }

        const mapArea = MAP_W * MAP_H;
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

        for (let x=0;x<MAP_W;x++) for (let y=0;y<MAP_H;y++) {
            tiles[x][y].flowAccum = accumulation[x][y];
        }

        // island bias if requested
        if (activePreset && activePreset.islandMode) {
            for (let x=0;x<MAP_W;x++){
                for (let y=0;y<MAP_H;y++){
                    const nx = x / MAP_W - 0.5;
                    const ny = y / MAP_H - 0.5;
                    const dist = Math.sqrt(nx*nx + ny*ny);
                    tiles[x][y].elevation *= (1 - Math.pow(dist, 1.5));
                    tiles[x][y].elevation = Math.max(0, Math.min(1, tiles[x][y].elevation));
                }
            }
        }

    // thresholds already resolved above

        for (let x=0;x<MAP_W;x++){
            for (let y=0;y<MAP_H;y++){
                const t = tiles[x][y];
                const e = t.elevation;
                if (e < thresholds.lake) {
                    t.lake = true;
                    t.river = false;
                    t.biome = 'lake';
                    continue;
                }
                const eRounded = Math.round(e * 100) / 100;
                if (eRounded === thresholds.beachRounded) {
                    t.biome = 'beach';
                    t.lake = false;
                    t.river = false;
                    continue;
                }
                if ((e >= thresholds.riverMin && e < thresholds.riverMax) || (t.flowAccum && t.flowAccum >= accThreshold)) {
                    t.river = true;
                    t.lake = false;
                    t.biome = 'river';
                    continue;
                }
                if (e >= thresholds.grassMin && e < thresholds.grassMax) { t.biome = 'grassland'; t.lake = false; t.river = false; continue; }
                if (e >= thresholds.forestMin && e < thresholds.forestMax) { t.biome = 'forest'; t.lake = false; t.river = false; continue; }
                if (e >= thresholds.mountainMin && e < thresholds.mountainMax) { t.biome = 'mountain'; t.lake = false; t.river = false; continue; }
                if (e >= thresholds.snowMin) { t.biome = 'snow'; t.lake = false; t.river = false; continue; }
            }
        }

        // forest expansions if not forced
        if (!activePreset || !activePreset.forceElevationBiomes) {
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
        }

        // snow expansion
        for (let x=0;x<MAP_W;x++){
            for (let y=0;y<MAP_H;y++){
                const t = tiles[x][y];
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
                    if (snowNeighbors >= 2 && t.elevation >= thresholds.snowMin) t.biome = 'snow';
                }
            }
        }

        return tiles;
    };
})();
