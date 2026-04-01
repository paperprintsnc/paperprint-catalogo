/* PaperPrint CRM - Catalogo Admin
   - Carica un CSV da /output/...
   - Mostra miniatura foto da URL presente in CSV (non link cliccabile)
   - NON tocca nessuna logica Supabase/guard/logout: si limita alla tabella.
*/

(() => {
  const DEFAULT_CSV_URL = 'output/catalogo_output.csv';

  function $(sel) { return document.querySelector(sel); }

  function getCsvUrl() {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('csv');
    return q ? q : DEFAULT_CSV_URL;
  }

  function detectDelimiter(headerLine) {
    const semi = (headerLine.match(/;/g) || []).length;
    const comma = (headerLine.match(/,/g) || []).length;
    return semi > comma ? ';' : ',';
  }

  // CSV parser (supporto base per virgolette)
  function parseCsv(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim() !== '');
    if (!lines.length) return { headers: [], rows: [] };

    const delimiter = detectDelimiter(lines[0]);

    const parseLine = (line) => {
      const out = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === delimiter && !inQuotes) {
          out.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
      out.push(cur);
      return out.map(v => v.trim());
    };

    const headers = parseLine(lines[0]).map(h => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = parseLine(lines[i]);
      if (vals.every(v => v === '')) continue;
      const obj = {};
      for (let c = 0; c < headers.length; c++) {
        obj[headers[c]] = (vals[c] ?? '').trim();
      }
      rows.push(obj);
    }

    return { headers, rows };
  }

  function normKey(k) {
    return String(k || '').toLowerCase().trim();
  }

  function pick(obj, candidates) {
    const map = new Map();
    Object.keys(obj).forEach(k => map.set(normKey(k), k));
    for (const cand of candidates) {
      const key = map.get(normKey(cand));
      if (key) return obj[key];
    }
    // fallback: prova contains
    for (const cand of candidates) {
      const n = normKey(cand);
      for (const [nk, ok] of map.entries()) {
        if (nk.includes(n)) return obj[ok];
      }
    }
    return '';
  }

  function euro(v) {
    const s = String(v ?? '').trim();
    if (!s) return '';
    // lascia invariato se già contiene €
    if (s.includes('€')) return s;
    // sostituisci punto/virgola
    const n = Number(String(s).replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(n)) return s;
    return '€ ' + n.toFixed(2).replace('.', ',');
  }

  function makeImgCell(url) {
    const td = document.createElement('td');
    td.className = 'col-photo';

    const u = String(url || '').trim();
    if (!u) {
      td.innerHTML = '<span class="pp-photo-miss">—</span>';
      return td;
    }

    const img = document.createElement('img');
    img.className = 'pp-photo';
    img.loading = 'lazy';
    img.alt = 'Foto prodotto';
    img.src = u;
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      img.remove();
      td.innerHTML = '<span class="pp-photo-miss">—</span>';
    });

    td.appendChild(img);
    return td;
  }

  function renderRows(rows) {
    const tbody = document.getElementById('catalogoTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    for (const r of rows) {
      const tr = document.createElement('tr');

      const sku = pick(r, ['SKU', 'Codice', 'codice', 'sku']);
      const descr = pick(r, ['DESCRIZIONE', 'Descrizione', 'description']);
      const cat = pick(r, ['CATEGORIA', 'Categoria', 'category']);
      const costo = pick(r, ['COSTO', 'Costo', 'purchase_price', 'prezzo_acquisto', 'acquisto']);
      const prezzo = pick(r, ['PREZZO', 'Prezzo', 'sale_price', 'prezzo_vendita', 'vendita']);
      const foto = pick(r, ['FOTO', 'Foto', 'ASSET', 'ASSET_S', 'asset_s', 'photo_url', 'image_url', 'url_foto', 'foto_url']);
      const stock = pick(r, ['DISPONIBILITA', "DISPONIBILITA'", 'Disponibilita', 'Stock', 'QTA', 'qty']);

      const tdSku = document.createElement('td'); tdSku.className = 'col-sku'; tdSku.textContent = sku;
      const tdDescr = document.createElement('td'); tdDescr.className = 'col-desc'; tdDescr.textContent = descr;
      const tdCat = document.createElement('td'); tdCat.className = 'col-cat'; tdCat.textContent = cat;

      const tdCosto = document.createElement('td'); tdCosto.className = 'col-cost';
      tdCosto.innerHTML = '<span class="pp-cost">' + (euro(costo) || '') + '</span>';

      const tdPrezzo = document.createElement('td'); tdPrezzo.className = 'col-price';
      tdPrezzo.innerHTML = '<span class="pp-price">' + (euro(prezzo) || '') + '</span>';

      const tdFoto = makeImgCell(foto);

      const tdStock = document.createElement('td'); tdStock.className = 'col-stock';
      const stockNum = String(stock || '').trim();
      tdStock.innerHTML = '<span class="pp-stock">' + stockNum + '</span>';

      tr.append(tdSku, tdDescr, tdCat, tdCosto, tdPrezzo, tdFoto, tdStock);
      tbody.appendChild(tr);
    }
  }

  function filterBySku(allRows, skuQuery) {
    const q = String(skuQuery || '').trim();
    if (!q) return allRows;
    return allRows.filter(r => {
      const sku = pick(r, ['SKU', 'Codice', 'codice', 'sku']);
      return String(sku).includes(q);
    });
  }

  async function loadCsvAndRender() {
    const status = $('#syncInfo');
    const url = getCsvUrl();

    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' su ' + url);
      const text = await res.text();
      const parsed = parseCsv(text);
      window.__PP_CSV_ROWS__ = parsed.rows;
      renderRows(parsed.rows);
      if (status) {
        status.style.display = '';
      }
    } catch (e) {
      console.error(e);
      alert('Errore caricamento CSV catalogo: ' + e.message);
    }
  }

  function wireUi() {
    const btnSearch = $('#btnSearch');
    const inputSku = $('#searchSku');

    if (btnSearch && inputSku) {
      btnSearch.addEventListener('click', () => {
        const all = Array.isArray(window.__PP_CSV_ROWS__) ? window.__PP_CSV_ROWS__ : [];
        const filtered = filterBySku(all, inputSku.value);
        renderRows(filtered);
      });

      inputSku.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          btnSearch.click();
        }
      });
    }

    const btnRefresh = $('#btnRefreshCatalogo');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => loadCsvAndRender());
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    wireUi();
    loadCsvAndRender();
  });
})();
