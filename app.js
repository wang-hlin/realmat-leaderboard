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
const ERRORBAR_TOP_N = 10;
const VIZ_METRICS = [
  { id: 'mrae', label: 'MRAE', meanKey: 'test_mrae_mean', stdKey: 'test_mrae_std', higherIsBetter: false },
  { id: 'mae', label: 'MAE', meanKey: 'test_mae_mean', stdKey: 'test_mae_std', higherIsBetter: false },
  { id: 'r2', label: 'R²', meanKey: 'test_r2_mean', stdKey: 'test_r2_std', higherIsBetter: true },
];

const METHOD_ORDER = [
  'ALIGNN',
  'CHGNet',
  'CGCNN',
  'LEFTNet',
  'CartNet',
  'Random Forest Regression',
  'Support Vector Regression',
  'Linear Regression',
];

const METHOD_BASE_COLORS = {
  ALIGNN: '#0b4f6c',
  CHGNet: '#1f9d8a',
  CGCNN: '#2f6fdd',
  LEFTNet: '#9a6d38',
  CartNet: '#ce4257',
  'Random Forest Regression': '#7b2cbf',
  'Support Vector Regression': '#d77a61',
  'Linear Regression': '#4f772d',
};

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
  errorbarSection: document.getElementById('errorbarSection'),
  errorbarPlotWrap: document.getElementById('errorbarPlotWrap'),
  errorbarLegend: document.getElementById('errorbarLegend'),
  metricSelect: document.getElementById('metricSelect'),
  showAllVizBtn: document.getElementById('showAllVizBtn'),
  tbody: document.querySelector('#leaderboard tbody'),
};

let rawRows = [];
let activeScenario = SCENARIOS[0].id;
let activeTrainMode = 'all';
let activeSortKey = 'test_mrae_mean';
let activeSortDir = 'asc';
let activeVizMetric = 'mrae';
const hiddenVizMethods = new Set();

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
  if (n === null) return '--';
  if (Math.abs(n) > 100) return n.toExponential(d);
  return n.toFixed(d);
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

function vizMetricById(id) {
  return VIZ_METRICS.find((m) => m.id === id) || VIZ_METRICS[0];
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

function currentRowsForErrorbar() {
  const scenario = scenarioById(activeScenario);
  const search = els.methodSearch.value.trim().toLowerCase();
  return rawRows.filter((r) => {
    if (!rowMatchesScenario(r, scenario)) return false;
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

function lightenColor(hex, amount = 0.45) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const toLight = (v) => {
    const n = parseInt(v, 16);
    const mixed = Math.round(n + (255 - n) * amount);
    return Math.max(0, Math.min(255, mixed));
  };
  const r = toLight(m[1]).toString(16).padStart(2, '0');
  const g = toLight(m[2]).toString(16).padStart(2, '0');
  const b = toLight(m[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function summarizeMetricByMode(rows, targetMode, meanKey, stdKey) {
  const map = new Map();
  const appearance = [];
  const seen = new Set();

  rows.forEach((r) => {
    if (modeOfRow(r) !== targetMode) return;
    const model = String(r.method || '').trim();
    if (!model) return;

    if (!seen.has(model)) {
      seen.add(model);
      appearance.push(model);
    }

    const mean = toNum(r[meanKey]);
    if (mean === null) return;
    const std = toNum(r[stdKey]) ?? 0;
    if (!map.has(model)) {
      map.set(model, { meanSum: 0, stdSum: 0, n: 0 });
    }
    const g = map.get(model);
    g.meanSum += mean;
    g.stdSum += std;
    g.n += 1;
  });

  const summary = new Map();
  map.forEach((v, model) => {
    summary.set(model, {
      mean: v.meanSum / v.n,
      std: v.stdSum / v.n,
    });
  });
  return { summary, appearance };
}

function buildModelOrder(preAgg, scratchAgg) {
  const present = new Set([
    ...preAgg.summary.keys(),
    ...scratchAgg.summary.keys(),
  ]);
  const ordered = METHOD_ORDER.filter((m) => present.has(m));
  const extras = [];

  [...preAgg.appearance, ...scratchAgg.appearance].forEach((m) => {
    if (!present.has(m)) return;
    if (ordered.includes(m)) return;
    if (extras.includes(m)) return;
    extras.push(m);
  });
  return [...ordered, ...extras];
}

function topModelsByLeaderboardOrder(sortedRows) {
  const ranked = [];
  const seen = new Set();
  sortedRows.forEach((r) => {
    const model = String(r.method || '').trim();
    if (!model || seen.has(model)) return;
    seen.add(model);
    ranked.push(model);
  });
  return {
    total: ranked.length,
    models: ranked.slice(0, ERRORBAR_TOP_N),
  };
}

function drawSvgEl(tag, attrs, text = null) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => {
    el.setAttribute(k, String(v));
  });
  if (text !== null) el.textContent = text;
  return el;
}

function niceStep(rawStep) {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(rawStep));
  const f = rawStep / exp;
  let nf = 1;
  if (f > 1) nf = 2;
  if (f > 2) nf = 5;
  if (f > 5) nf = 10;
  return nf * exp;
}

function computeNiceDomain(minV, maxV, tickCount = 5) {
  if (!Number.isFinite(minV) || !Number.isFinite(maxV)) {
    return { ymin: 0, ymax: 1, step: 0.2 };
  }
  if (minV === maxV) {
    const d = Math.abs(minV) * 0.2 || 0.5;
    minV -= d;
    maxV += d;
  }
  const span = maxV - minV;
  const step = niceStep(span / tickCount);
  const ymin = Math.floor(minV / step) * step;
  const ymax = Math.ceil(maxV / step) * step;
  return { ymin, ymax, step };
}

function renderMraeErrorbarPanel(rows, selectedMode, metricId, fixedModelOrder, totalModelCount, showErrorBar = true) {
  const metric = vizMetricById(metricId);
  const preAgg = summarizeMetricByMode(rows, 'pretrain', metric.meanKey, metric.stdKey);
  const scratchAgg = summarizeMetricByMode(rows, 'no_pretrain', metric.meanKey, metric.stdKey);
  const canShowPre = selectedMode === 'all' || selectedMode === 'pretrain';
  const canShowScratch = selectedMode === 'all' || selectedMode === 'no_pretrain';
  const hasPre = preAgg.summary.size > 0 && canShowPre;
  const hasScratch = scratchAgg.summary.size > 0 && canShowScratch;

  if (!hasPre && !hasScratch) {
    els.errorbarPlotWrap.innerHTML = '<div>No data for errorbar panel.</div>';
    els.errorbarLegend.textContent = '';
    return;
  }

  const models = fixedModelOrder.filter((m) => (
    !hiddenVizMethods.has(m) && (preAgg.summary.has(m) || scratchAgg.summary.has(m))
  ));

  if (!models.length) {
    els.errorbarPlotWrap.innerHTML = '<div>No finite metric values for visualisation.</div>';
    els.errorbarLegend.textContent = '';
    return;
  }

  const bounds = [];
  models.forEach((m) => {
    const pre = preAgg.summary.get(m);
    const scratch = scratchAgg.summary.get(m);
    if (hasPre && pre) {
      if (showErrorBar) bounds.push(pre.mean - pre.std, pre.mean + pre.std);
      else bounds.push(pre.mean);
    }
    if (hasScratch && scratch) {
      if (showErrorBar) bounds.push(scratch.mean - scratch.std, scratch.mean + scratch.std);
      else bounds.push(scratch.mean);
    }
  });
  if (!bounds.length) {
    els.errorbarPlotWrap.innerHTML = '<div>No finite metric values for visualisation.</div>';
    els.errorbarLegend.textContent = '';
    return;
  }

  const rawMin = Math.min(...bounds);
  const rawMax = Math.max(...bounds);
  const pad = (rawMax - rawMin || 1) * 0.1;
  const domain = computeNiceDomain(rawMin - pad, rawMax + pad, 5);
  const ymin = domain.ymin;
  const ymax = domain.ymax;

  const width = Math.max(920, models.length * 120);
  const height = 390;
  const margin = {
    top: 28,
    right: 22,
    bottom: 122,
    left: 64,
  };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const dx = Math.min(16, Math.max(8, innerW / Math.max(models.length, 1) * 0.12));
  const xPadBase = Math.min(36, Math.max(18, innerW * 0.05));
  const xPadLeft = Math.min(52, xPadBase + 12);
  const xPadRight = xPadBase;

  const xAt = (idx) => {
    if (models.length === 1) return margin.left + innerW / 2;
    const usableW = Math.max(1, innerW - xPadLeft - xPadRight);
    return margin.left + xPadLeft + (usableW * idx) / (models.length - 1);
  };
  const yAt = (v) => margin.top + ((ymax - v) / (ymax - ymin)) * innerH;

  const svg = drawSvgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'errorbarSvg',
    role: 'img',
    'aria-label': `${scenarioById(activeScenario).label} ${metric.label} visualisation`,
  });

  const tickCount = 5;
  for (let i = 0; i <= tickCount; i += 1) {
    const yv = ymin + domain.step * i;
    const y = yAt(yv);
    svg.appendChild(drawSvgEl('line', {
      x1: margin.left,
      y1: y,
      x2: width - margin.right,
      y2: y,
      stroke: '#d9cbb7',
      'stroke-dasharray': '4 4',
      'stroke-width': 1,
    }));
    svg.appendChild(drawSvgEl('text', {
      x: margin.left - 8,
      y: y + 4,
      'text-anchor': 'end',
      class: 'axisTick',
    }, fmt(yv, 2)));
  }

  svg.appendChild(drawSvgEl('line', {
    x1: margin.left,
    y1: margin.top,
    x2: margin.left,
    y2: height - margin.bottom,
    stroke: '#8f7d67',
    'stroke-width': 1.4,
  }));
  svg.appendChild(drawSvgEl('line', {
    x1: margin.left,
    y1: height - margin.bottom,
    x2: width - margin.right,
    y2: height - margin.bottom,
    stroke: '#8f7d67',
    'stroke-width': 1.4,
  }));

  models.forEach((m, idx) => {
    const x = xAt(idx);
    const pre = preAgg.summary.get(m);
    const scratch = scratchAgg.summary.get(m);
    const base = METHOD_BASE_COLORS[m] || '#0b4f6c';
    const scratchColor = lightenColor(base, 0.45);

    const drawPoint = (xpos, mean, std, color, marker = 'circle') => {
      const yMean = yAt(mean);
      if (showErrorBar) {
        const yLow = yAt(mean - std);
        const yHigh = yAt(mean + std);
        svg.appendChild(drawSvgEl('line', {
          x1: xpos,
          y1: yLow,
          x2: xpos,
          y2: yHigh,
          stroke: color,
          'stroke-width': 2,
        }));
        svg.appendChild(drawSvgEl('line', {
          x1: xpos - 5,
          y1: yLow,
          x2: xpos + 5,
          y2: yLow,
          stroke: color,
          'stroke-width': 2,
        }));
        svg.appendChild(drawSvgEl('line', {
          x1: xpos - 5,
          y1: yHigh,
          x2: xpos + 5,
          y2: yHigh,
          stroke: color,
          'stroke-width': 2,
        }));
      }
      if (marker === 'square') {
        const r = 4.8;
        svg.appendChild(drawSvgEl('rect', {
          x: xpos - r,
          y: yMean - r,
          width: r * 2,
          height: r * 2,
          fill: color,
          stroke: '#ffffff',
          'stroke-width': 1.2,
        }));
      } else {
        svg.appendChild(drawSvgEl('circle', {
          cx: xpos,
          cy: yMean,
          r: 4.5,
          fill: color,
          stroke: '#ffffff',
          'stroke-width': 1.2,
        }));
      }
    };

    if (hasPre && pre) drawPoint(x - dx, pre.mean, pre.std, base, 'circle');
    if (hasScratch && scratch) drawPoint(x + dx, scratch.mean, scratch.std, scratchColor, 'square');

    const labelY = height - margin.bottom + 14;
    svg.appendChild(drawSvgEl('text', {
      x,
      y: labelY,
      transform: `rotate(-30 ${x} ${labelY})`,
      'text-anchor': 'end',
      class: 'axisLabel',
    }, m));
  });

  const yLabelX = 18;
  const yLabelY = margin.top + innerH / 2;
  svg.appendChild(drawSvgEl('text', {
    x: yLabelX,
    y: yLabelY,
    transform: `rotate(-90 ${yLabelX} ${yLabelY})`,
    class: 'axisTitle',
    'text-anchor': 'middle',
  }, metric.label));

  els.errorbarLegend.innerHTML = [
    hasPre ? '<span class="legendItem"><i class="legendDot preDot"></i>With pretraining</span>' : '',
    hasScratch ? '<span class="legendItem"><i class="legendDot scratchDot"></i>Without pretraining</span>' : '',
    totalModelCount > ERRORBAR_TOP_N ? '<span class="legendItem">Only top 10 models are shown in the plot</span>' : '',
  ].filter(Boolean).join(' ');

  els.errorbarPlotWrap.innerHTML = '';
  els.errorbarPlotWrap.appendChild(svg);
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
    const hiddenForViz = hiddenVizMethods.has(r.method);
    tr.innerHTML = `
      <td class="rank">${medal(rank)} ${rank}</td>
      <td>
        <button
          type="button"
          class="vizEyeBtn ${hiddenForViz ? 'off' : ''}"
          data-method="${r.method}"
          title="${hiddenForViz ? 'Show in visulisation' : 'Hide from visulisation'}"
          aria-label="${hiddenForViz ? 'Show in visulisation' : 'Hide from visulisation'}"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M1.5 12s3.8-6 10.5-6 10.5 6 10.5 6-3.8 6-10.5 6S1.5 12 1.5 12z"></path>
            <circle cx="12" cy="12" r="3.2"></circle>
          </svg>
        </button>
        ${r.method}
      </td>
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
  const errorbarRows = currentRowsForErrorbar();
  const rowsForAllModeView = activeScenario === 'lomo' ? aggregateRowsForLomo(errorbarRows) : errorbarRows;
  const rowsForAllModeSorted = sortedRowsByActiveSort(rowsForAllModeView);
  const rowsForView = activeScenario === 'lomo' ? aggregateRowsForLomo(filteredRows) : filteredRows;
  const rankMap = mraeRankMap(rowsForView);
  const rows = sortedRowsByActiveSort(rowsForView);
  const vizTop = topModelsByLeaderboardOrder(rowsForAllModeSorted);
  const vizRows = activeScenario === 'lomo' ? rowsForAllModeView : errorbarRows;
  renderLomoHeatmap(filteredRows);
  renderTable(rows, rankMap);
  renderMraeErrorbarPanel(vizRows, activeTrainMode, activeVizMetric, vizTop.models, vizTop.total, true);
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
  els.metricSelect.addEventListener('change', () => {
    activeVizMetric = els.metricSelect.value;
    render();
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

  els.tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.vizEyeBtn');
    if (!btn) return;
    const method = btn.dataset.method;
    if (!method) return;
    if (hiddenVizMethods.has(method)) hiddenVizMethods.delete(method);
    else hiddenVizMethods.add(method);
    render();
  });

  els.showAllVizBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hiddenVizMethods.clear();
    render();
  });

  els.resetBtn.addEventListener('click', () => {
    activeScenario = SCENARIOS[0].id;
    activeTrainMode = 'all';
    activeSortKey = 'test_mrae_mean';
    activeSortDir = 'asc';
    activeVizMetric = 'mrae';
    hiddenVizMethods.clear();
    els.methodSearch.value = '';
    els.metricSelect.value = activeVizMetric;
    render();
  });

  els.downloadBtn.addEventListener('click', downloadCurrentCSV);

  render();
}

init().catch((e) => {
  console.error(`Failed to load data: ${e.message}`);
});
