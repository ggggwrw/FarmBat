// Biblioteca de mapas: cargar lista desde Mapas/index.json y permitir importar
(function(){
  // Colors consistent with game.js for a simple visual hint
  const BIOME_COLORS = {
    grassland: '#7ec97c',
    forest: '#37622a',
    mountain: '#8b8b8b',
    snow: '#ffffff',
    river: '#8fd1ff',
    lake: '#2a6fb0',
    beach: '#f2e394',
    lava: '#ff4500'
  };

  function navToGameWithImported(data){
    try {
      if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('Formato inválido: se esperaba una matriz 2D');
      // Persist to session for the next page
      sessionStorage.setItem('importedMap2D', JSON.stringify(data));
      const href = 'game.html';
      const url = new URL(href, window.location.href);
      url.searchParams.set('map', 'imported');
      // Optionally keep last world selection
      try { const w = localStorage.getItem('worldType'); if (w) url.searchParams.set('world', w); } catch(e){}
      window.location.href = url.toString();
    } catch(err){
      console.error(err);
      alert('JSON inválido o demasiado grande');
    }
  }

  async function generatePreviewFromFile(filePath, imgEl){
    try {
      const resp = await fetch(filePath, { cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('Formato inválido');
      const w = data.length; const h = data[0].length;
      // Target display size matches world-illustration style
      const outW = 72, outH = 48;
      const off = document.createElement('canvas');
      off.width = outW; off.height = outH;
      const c = off.getContext('2d');
      if (!c) return;
      c.fillStyle = '#0b1220';
      c.fillRect(0,0,outW,outH);
      // Sample tiles to fit into 72x48 aspect; use nearest-neighbor sampling
      for (let x = 0; x < outW; x++){
        for (let y = 0; y < outH; y++){
          const sx = Math.min(w-1, Math.floor(x * w / outW));
          const sy = Math.min(h-1, Math.floor(y * h / outH));
          const t = data[sx][sy] || {};
          let col = BIOME_COLORS[t && t.biome] || BIOME_COLORS.grassland;
          if (t.lake) col = BIOME_COLORS.lake;
          else if (t.river) col = BIOME_COLORS.river;
          c.fillStyle = col;
          c.fillRect(x, y, 1, 1);
        }
      }
      imgEl.src = off.toDataURL('image/png');
    } catch (e){
      // leave placeholder if preview fails
      console.warn('Preview failed for', filePath, e);
    }
  }

  function drawPreviewFromData(data, imgEl){
    try {
      if (!Array.isArray(data) || !Array.isArray(data[0])) return;
      const w = data.length; const h = data[0].length;
      const outW = 72, outH = 48;
      const off = document.createElement('canvas');
      off.width = outW; off.height = outH;
      const c = off.getContext('2d');
      if (!c) return;
      c.fillStyle = '#0b1220';
      c.fillRect(0,0,outW,outH);
      for (let x = 0; x < outW; x++){
        for (let y = 0; y < outH; y++){
          const sx = Math.min(w-1, Math.floor(x * w / outW));
          const sy = Math.min(h-1, Math.floor(y * h / outH));
          const t = data[sx][sy] || {};
          let col = BIOME_COLORS[t && t.biome] || BIOME_COLORS.grassland;
          if (t.lake) col = BIOME_COLORS.lake;
          else if (t.river) col = BIOME_COLORS.river;
          c.fillStyle = col;
          c.fillRect(x, y, 1, 1);
        }
      }
      imgEl.src = off.toDataURL('image/png');
    } catch(e){ /* ignore */ }
  }

  function setCardPreview(item, imgEl){
    const src = (item && item.image) ? String(item.image) : '';
    if (src) {
      imgEl.src = src;
      return;
    }
    // If it's a session item, we may have data available directly
    if (item && item.source === 'session' && item._data) {
      drawPreviewFromData(item._data, imgEl);
      return;
    }
    const file = String(item && item.file || '');
    if (file) generatePreviewFromFile(file, imgEl);
  }

  function renderList(list, grid){
    if (!grid) return;
    grid.innerHTML = '';
    list.forEach((item, idx) => {
      const file = String(item.file || '').trim();
      const name = String(item.name || file || 'Mapa ' + (idx+1));
      const desc = item.desc ? String(item.desc) : (item.size ? ('Tamaño ' + item.size) : 'Mapa personalizado');
      const card = document.createElement('button');
      card.className = 'world-card';
      card.setAttribute('role', 'listitem');
      card.setAttribute('aria-pressed', 'false');
      // Illustration image (either provided by manifest or auto-generated)
      const ill = document.createElement('img');
      ill.className = 'world-illustration';
      ill.alt = `Vista previa de ${name}`;
      // Set a subtle placeholder while loading
      ill.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))';
      card.appendChild(ill);
      const label = document.createElement('div');
      label.className = 'world-label';
      label.textContent = name;
      card.appendChild(label);
      const d = document.createElement('div');
      d.className = 'world-desc';
      d.textContent = desc;
      card.appendChild(d);

      card.addEventListener('click', async () => {
        if (!file) return;
        try {
          if (item && item.source === 'session' && item._data) {
            navToGameWithImported(item._data);
            return;
          }
          const resp = await fetch(file, { cache: 'no-store' });
          if (!resp.ok) throw new Error('No se pudo cargar el archivo (' + resp.status + ')');
          const data = await resp.json();
          navToGameWithImported(data);
        } catch (err) {
          console.error(err);
          alert('No se pudo cargar el mapa. Si estás abriendo el HTML directamente como archivo, puede que el navegador bloquee las lecturas. Usa “Importar archivo…”');
        }
      });
      grid.appendChild(card);

      // Defer preview generation to next frame to keep UI responsive
      requestAnimationFrame(() => setCardPreview(item, ill));
    });
  }

  let __baseList = [];
  let __sessionList = [];

  function mergedList(){
    // Convert session items to manifest-like entries
    const sessionEntries = __sessionList.map(s => ({
      name: s.name,
      desc: s.desc,
      size: s.size,
      image: s.image,
      file: 'session:' + s.id,
      source: 'session',
      _data: s.data
    }));
    return __baseList.concat(sessionEntries);
  }

  async function loadManifest(){
    const grid = document.getElementById('libraryGrid');
    const empty = document.getElementById('libraryEmpty');
    try {
      const res = await fetch('Mapas/index.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const list = await res.json();
      if (!Array.isArray(list)) throw new Error('Invalid');
      __baseList = list;
      const merged = mergedList();
      if (!merged.length) throw new Error('Empty');
      renderList(merged, grid);
    } catch (e) {
      console.warn('No se pudo cargar el índice de mapas:', e);
      if (empty) empty.style.display = '';
    }
  }

  function bindImport(){
    const importBtn = document.getElementById('importLocalBtn');
    const importFile = document.getElementById('importLocalFile');
    if (!importBtn || !importFile) return;
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        const data = JSON.parse(text);
        navToGameWithImported(data);
      } catch (err){
        console.error(err);
        alert('Archivo inválido');
      } finally {
        importFile.value = '';
      }
    });
  }

  function slugify(s){
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'map';
  }

  function bindAddToPool(){
    const btn = document.getElementById('addToPoolBtn');
    const file = document.getElementById('addToPoolFile');
    const grid = document.getElementById('libraryGrid');
    if (!btn || !file) return;
    btn.addEventListener('click', () => file.click());
    file.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const text = await f.text();
        const data = JSON.parse(text);
        if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('Se esperaba una matriz 2D');
        const w = data.length; const h = data[0].length;
        const defName = f.name.replace(/\.json$/i, '') || 'Mapa personalizado';
        const name = prompt('Nombre para el mapa:', defName) || defName;
        const id = 's' + Date.now();
        // Build session entry
        const entry = {
          id,
          name,
          desc: 'Añadido en esta sesión',
          size: w + 'x' + h,
          data
        };
        // Generate preview image data URL
        const tmpImg = document.createElement('img');
        drawPreviewFromData(data, tmpImg);
        entry.image = tmpImg.src;
        __sessionList.push(entry);
        // Re-render merged list
        renderList(mergedList(), grid);
      } catch (err){
        console.error(err);
        alert('Archivo inválido');
      } finally {
        file.value = '';
      }
    });
  }

  // Removed export index feature per user request

  window.addEventListener('DOMContentLoaded', function(){
    bindImport();
    bindAddToPool();
    loadManifest();
  });
})();
