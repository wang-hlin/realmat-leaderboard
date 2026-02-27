const DATA_URL = './data/metrics_agg_filtered.csv';

const PRETRAIN_DIRS = new Set(['finetune', 'feature_ood', 'category', 'split']);
const NO_PRETRAIN_DIRS = new Set(['train_from_scratch', 'feature_ood_no_pretrain', 'category_no_pretrain', 'split_no_pretrain']);

const SCENARIOS = [
  {
    id: 'random',
    label: 'Random Split',
    conditions: [
      { split_dir: 'finetune', split_name: '' },
      { split_dir: 'train_from_scratch', split_name: '' },
    ],
  },
  {
    id: 'feature_ood',
    label: 'Feature OOD',
    conditions: [
      { split_dir: 'feature_ood', split_name: '' },
      { split_dir: 'feature_ood_no_pretrain', split_name: '' },
    ],
  },
  {
    id: 'lomo',
    label: 'LOMO',
    conditions: [
      { split_dir: 'category' },
      { split_dir: 'category_no_pretrain' },
    ],
  },
  {
    id: 'chemsys',
    label: 'Chemical System',
    conditions: [
      { split_dir: 'split', split_name: 'chemsys' },
      { split_dir: 'split_no_pretrain', split_name: 'chemsys' },
    ],
  },
  {
    id: 'periodictablegroups',
    label: 'Periodic Group',
    conditions: [
      { split_dir: 'split', split_name: 'periodictablegroups' },
      { split_dir: 'split_no_pretrain', split_name: 'periodictablegroups' },
    ],
  },
  {
    id: 'crystalsys',
    label: 'Crystal Structure',
    conditions: [
      { split_dir: 'split', split_name: 'crystalsys' },
      { split_dir: 'split_no_pretrain', split_name: 'crystalsys' },
    ],
  },
];

const TRAIN_MODES = [
  { id: 'all', label: 'All' },
  { id: 'pretrain', label: 'With pretraining' },
  { id: 'no_pretrain', label: 'Without pretraining' },
];

const els = {
  scenarioTabs: document.getElementById('scenarioTabs'),
  trainModeTabs: document.getElementById('trainModeTabs'),
  methodSearch: document.getElementById('methodSearch'),
  resetBtn: document.getElementById('resetBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  sortHeaders: document.querySelectorAll('#leaderboard thead th[data-sort-key]'),
  lomoHeatmapSection: document.getElementById('lomoHeatmapSection'),
  lomoHeatmapWrap: document.getElementById('lomoHeatmapWrap'),
  lomoHeatmapLegend: document.getElementById('lomoHeatmapLegend'),
  tbody: document.querySelector('#leaderboard tbody'),
};

let rawRows = [];
let activeScenario = SCENARIOS[0].id;
let activeTrainMode = 'all';
let activeSortKey = 'test_mrae_mean';
let activeSortDir = 'asc';

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? '').trim();
    });
    return row;
  });
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(v, d = 3) {
  const n = toNum(v);
  return n === null ? '--' : n.toFixed(d);
}

function metricWithStd(meanV, stdV) {
  return `<span class="metricMean">${fmt(meanV)}</span> <span class="metricStd">(${fmt(stdV)})</span>`;
}

function medal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '';
}

function rowClass(rank) {
  if (rank === 1) return 'medal-1';
  if (rank === 2) return 'medal-2';
  if (rank === 3) return 'medal-3';
  return '';
}

function modeOfRow(row) {
  if (PRETRAIN_DIRS.has(row.split_dir)) return 'pretrain';
  if (NO_PRETRAIN_DIRS.has(row.split_dir)) return 'no_pretrain';
  return 'unknown';
}

function scenarioById(id) {
  return SCENARIOS.find((s) => s.id === id) || SCENARIOS[0];
}

function trainModeById(id) {
  return TRAIN_MODES.find((m) => m.id === id) || TRAIN_MODES[0];
}

function rowMatchesScenario(row, scenario) {
  return scenario.conditions.some((cond) => {
    const dirMatch = row.split_dir === cond.split_dir;
    const nameMatch = cond.split_name === undefined || row.split_name === cond.split_name;
    return dirMatch && nameMatch;
  });
}

function currentFilteredRows() {
  const scenario = scenarioById(activeScenario);
  const search = els.methodSearch.value.trim().toLowerCase();

  return rawRows.filter((r) => {
    if (!rowMatchesScenario(r, scenario)) return false;
    if (activeTrainMode !== 'all' && modeOfRow(r) !== activeTrainMode) return false;
    if (search && !r.method.toLowerCase().includes(search)) return false;
    return true;
  });
}

function aggregateRowsForLomo(rows) {
  const grouped = new Map();

  rows.forEach((r) => {
    const mode = modeOfRow(r);
    const key = `${r.method}__${mode}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        ...r,
        _aggCount: 0,
        _mraeMeanSum: 0,
        _mraeMeanN: 0,
        _maeMeanSum: 0,
        _maeMeanN: 0,
        _r2MeanSum: 0,
        _r2MeanN: 0,
        _mraeVals: [],
        _maeVals: [],
        _r2Vals: [],
      });
    }

    const g = grouped.get(key);
    g._aggCount += 1;

    const mraeMean = toNum(r.test_mrae_mean);
    if (mraeMean !== null) {
      g._mraeMeanSum += mraeMean;
      g._mraeMeanN += 1;
      g._mraeVals.push(mraeMean);
    }

    const maeMean = toNum(r.test_mae_mean);
    if (maeMean !== null) {
      g._maeMeanSum += maeMean;
      g._maeMeanN += 1;
      g._maeVals.push(maeMean);
    }

    const r2Mean = toNum(r.test_r2_mean);
    if (r2Mean !== null) {
      g._r2MeanSum += r2Mean;
      g._r2MeanN += 1;
      g._r2Vals.push(r2Mean);
    }
  });

  return [...grouped.values()].map((g) => {
    const avg = (sum, n) => (n > 0 ? String(sum / n) : '');
    const std = (arr) => {
      if (!arr.length) return '';
      const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
      const varPop = arr.reduce((s, x) => s + ((x - mean) ** 2), 0) / arr.length;
      return String(Math.sqrt(varPop));
    };
    return {
      ...g,
      split_name: '',
      test_mrae_mean: avg(g._mraeMeanSum, g._mraeMeanN),
      test_mrae_std: std(g._mraeVals),
      test_mae_mean: avg(g._maeMeanSum, g._maeMeanN),
      test_mae_std: std(g._maeVals),
      test_r2_mean: avg(g._r2MeanSum, g._r2MeanN),
      test_r2_std: std(g._r2Vals),
    };
  });
}

function sortedRowsByMrae(rows) {
  return rows.slice().sort((a, b) => {
    const va = toNum(a.test_mrae_mean);
    const vb = toNum(b.test_mrae_mean);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return va - vb;
  });
}

function rowId(row) {
  return [
    row.method,
    row.split_dir,
    row.split_name,
    modeOfRow(row),
    row.test_mrae_mean,
    row.test_mae_mean,
    row.test_r2_mean,
  ].join('||');
}

function sortValue(row, key, scenarioLabel) {
  if (key === 'method') return row.method.toLowerCase();
  if (key === 'scenario') return scenarioLabel.toLowerCase();
  if (key === 'mode') return modeOfRow(row);
  return toNum(row[key]);
}

function sortedRowsByActiveSort(rows) {
  const scenario = scenarioById(activeScenario);
  const scenarioLabel = scenario.label;
  const dirFactor = activeSortDir === 'asc' ? 1 : -1;

  return rows.slice().sort((a, b) => {
    const va = sortValue(a, activeSortKey, scenarioLabel);
    const vb = sortValue(b, activeSortKey, scenarioLabel);

    if (typeof va === 'number' || typeof vb === 'number') {
      const na = typeof va === 'number' ? va : null;
      const nb = typeof vb === 'number' ? vb : null;
      if (na === null && nb === null) return 0;
      if (na === null) return 1;
      if (nb === null) return -1;
      if (na !== nb) return dirFactor * (na - nb);
    } else {
      const cmp = String(va).localeCompare(String(vb));
      if (cmp !== 0) return dirFactor * cmp;
    }

    const mraeA = toNum(a.test_mrae_mean);
    const mraeB = toNum(b.test_mrae_mean);
    if (mraeA !== null && mraeB !== null && mraeA !== mraeB) return mraeA - mraeB;
    if (mraeA === null && mraeB !== null) return 1;
    if (mraeA !== null && mraeB === null) return -1;
    return a.method.localeCompare(b.method);
  });
}

function mraeRankMap(rows) {
  const ranks = new Map();
  sortedRowsByMrae(rows).forEach((row, idx) => {
    ranks.set(rowId(row), idx + 1);
  });
  return ranks;
}

function updateSortHeaders() {
  els.sortHeaders.forEach((th) => {
    const isActive = th.dataset.sortKey === activeSortKey;
    th.classList.toggle('sortedAsc', isActive && activeSortDir === 'asc');
    th.classList.toggle('sortedDesc', isActive && activeSortDir === 'desc');
    if (!isActive) th.setAttribute('aria-sort', 'none');
    if (isActive && activeSortDir === 'asc') th.setAttribute('aria-sort', 'ascending');
    if (isActive && activeSortDir === 'desc') th.setAttribute('aria-sort', 'descending');
  });
}

function interpColorHex(c1, c2, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * clamped);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * clamped);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}

function textColorForValue(bgT) {
  return bgT > 0.62 ? '#f8fafc' : '#1f2933';
}

function renderLomoHeatmap(filteredRows) {
  if (activeScenario !== 'lomo') {
    els.lomoHeatmapSection.classList.add('hidden');
    return;
  }

  els.lomoHeatmapSection.classList.remove('hidden');
  const rows = filteredRows.filter((r) => r.split_name && r.split_name.trim() !== '');
  if (!rows.length) {
    els.lomoHeatmapWrap.innerHTML = '<div>No LOMO category data.</div>';
    els.lomoHeatmapLegend.textContent = '';
    return;
  }

  const categories = [...new Set(rows.map((r) => r.split_name))].sort((a, b) => a.localeCompare(b));
  const grouped = new Map();
  rows.forEach((r) => {
    const mode = modeOfRow(r);
    const rowKey = activeTrainMode === 'all'
      ? `${r.method} (${mode === 'pretrain' ? 'With pretraining' : 'Without pretraining'})`
      : r.method;
    const cellKey = `${rowKey}||${r.split_name}`;
    if (!grouped.has(cellKey)) grouped.set(cellKey, []);
    const v = toNum(r.test_mrae_mean);
    if (v !== null) grouped.get(cellKey).push(v);
  });

  const rowNames = [...new Set(rows.map((r) => {
    const mode = modeOfRow(r);
    return activeTrainMode === 'all'
      ? `${r.method} (${mode === 'pretrain' ? 'With pretraining' : 'Without pretraining'})`
      : r.method;
  }))];

  const matrix = rowNames.map((name) => {
    const vals = categories.map((cat) => {
      const arr = grouped.get(`${name}||${cat}`) || [];
      if (!arr.length) return null;
      return arr.reduce((s, x) => s + x, 0) / arr.length;
    });
    const finite = vals.filter((v) => v !== null);
    const avg = finite.length ? finite.reduce((s, x) => s + x, 0) / finite.length : null;
    return { name, vals, avg };
  });

  matrix.sort((a, b) => {
    if (a.avg === null && b.avg === null) return a.name.localeCompare(b.name);
    if (a.avg === null) return 1;
    if (b.avg === null) return -1;
    return a.avg - b.avg;
  });

  const allVals = matrix.flatMap((r) => r.vals).filter((v) => v !== null);
  if (!allVals.length) {
    els.lomoHeatmapWrap.innerHTML = '<div>No finite MRAE values for heatmap.</div>';
    els.lomoHeatmapLegend.textContent = '';
    return;
  }
  const vmin = Math.min(...allVals);
  const vmax = Math.max(...allVals);
  const denom = vmax - vmin || 1;
  els.lomoHeatmapLegend.textContent = `Color scale: low ${fmt(vmin)} -> high ${fmt(vmax)}`;

  let html = '<table class="heatmapTable"><thead><tr><th>Method</th>';
  categories.forEach((cat) => {
    html += `<th>${cat}</th>`;
  });
  html += '<th>Avg</th></tr></thead><tbody>';

  matrix.forEach((row) => {
    html += `<tr><td>${row.name}</td>`;
    row.vals.forEach((v) => {
      if (v === null) {
        html += '<td>--</td>';
        return;
      }
      const t = (v - vmin) / denom;
      const bg = interpColorHex([230, 244, 241], [0, 95, 115], t);
      const fg = textColorForValue(t);
      html += `<td style="background:${bg};color:${fg};">${fmt(v, 2)}</td>`;
    });
    html += `<td>${row.avg === null ? '--' : fmt(row.avg, 2)}</td></tr>`;
  });

  html += '</tbody></table>';
  els.lomoHeatmapWrap.innerHTML = html;
}

function renderTable(rows, rankMap) {
  const scenario = scenarioById(activeScenario);
  els.tbody.innerHTML = '';

  rows.forEach((r) => {
    const rank = rankMap.get(rowId(r)) ?? '--';
    const tr = document.createElement('tr');
    const cls = rowClass(rank);
    if (cls) tr.classList.add(cls);

    const modeLabel = modeOfRow(r) === 'pretrain' ? 'With pretraining' : 'Without pretraining';
    tr.innerHTML = `
      <td class="rank">${medal(rank)} ${rank}</td>
      <td>${r.method}</td>
      <td>${scenario.label}</td>
      <td>${modeLabel}</td>
      <td>${metricWithStd(r.test_mrae_mean, r.test_mrae_std)}</td>
      <td>${metricWithStd(r.test_mae_mean, r.test_mae_std)}</td>
      <td>${metricWithStd(r.test_r2_mean, r.test_r2_std)}</td>
    `;
    els.tbody.appendChild(tr);
  });
}

function setActiveTab(container, activeId) {
  container.querySelectorAll('button[data-tab-id]').forEach((btn) => {
    const isActive = btn.dataset.tabId === activeId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
}

function render() {
  const filteredRows = currentFilteredRows();
  const rowsForView = activeScenario === 'lomo' ? aggregateRowsForLomo(filteredRows) : filteredRows;
  const rankMap = mraeRankMap(rowsForView);
  const rows = sortedRowsByActiveSort(rowsForView);
  renderLomoHeatmap(filteredRows);
  renderTable(rows, rankMap);
  updateSortHeaders();
  setActiveTab(els.scenarioTabs, activeScenario);
  setActiveTab(els.trainModeTabs, activeTrainMode);
}

function renderTabs() {
  els.scenarioTabs.innerHTML = '';
  SCENARIOS.forEach((scenario) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tabButton';
    btn.dataset.tabId = scenario.id;
    btn.textContent = scenario.label;
    btn.addEventListener('click', () => {
      activeScenario = scenario.id;
      render();
    });
    els.scenarioTabs.appendChild(btn);
  });

  els.trainModeTabs.innerHTML = '';
  TRAIN_MODES.forEach((mode) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tabButton';
    btn.dataset.tabId = mode.id;
    btn.textContent = mode.label;
    btn.addEventListener('click', () => {
      activeTrainMode = mode.id;
      render();
    });
    els.trainModeTabs.appendChild(btn);
  });
}

function downloadCurrentCSV() {
  const filteredRows = currentFilteredRows();
  const rowsForView = activeScenario === 'lomo' ? aggregateRowsForLomo(filteredRows) : filteredRows;
  const rankMap = mraeRankMap(rowsForView);
  const rows = sortedRowsByActiveSort(rowsForView);
  if (!rows.length) return;

  const headers = [
    'rank',
    'method',
    'scenario',
    'mode',
    'mrae_mean',
    'mrae_std',
    'mae_mean',
    'mae_std',
    'r2_mean',
    'r2_std',
  ];
  const scenario = scenarioById(activeScenario);
  const lines = [headers.join(',')];

  rows.forEach((r) => {
    const rank = rankMap.get(rowId(r)) ?? '';
    const modeLabel = modeOfRow(r) === 'pretrain' ? 'With pretraining' : 'Without pretraining';
    const vals = [
      rank,
      r.method ?? '',
      scenario.label,
      modeLabel,
      fmt(r.test_mrae_mean),
      fmt(r.test_mrae_std),
      fmt(r.test_mae_mean),
      fmt(r.test_mae_std),
      fmt(r.test_r2_mean),
      fmt(r.test_r2_std),
    ];
    lines.push(vals.join(','));
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'leaderboard_filtered.csv';
  a.click();
  URL.revokeObjectURL(url);
}

async function init() {
  const text = await fetch(DATA_URL).then((r) => r.text());
  rawRows = parseCSV(text);

  renderTabs();

  ['methodSearch'].forEach((k) => {
    els[k].addEventListener('input', render);
    els[k].addEventListener('change', render);
  });

  els.sortHeaders.forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sortKey;
      if (!key) return;
      if (activeSortKey === key) {
        activeSortDir = activeSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        activeSortKey = key;
        activeSortDir = key === 'test_r2_mean' ? 'desc' : 'asc';
      }
      render();
    });
  });

  els.resetBtn.addEventListener('click', () => {
    activeScenario = SCENARIOS[0].id;
    activeTrainMode = 'all';
    activeSortKey = 'test_mrae_mean';
    activeSortDir = 'asc';
    els.methodSearch.value = '';
    render();
  });

  els.downloadBtn.addEventListener('click', downloadCurrentCSV);

  render();
}

init().catch((e) => {
  console.error(`Failed to load data: ${e.message}`);
});
