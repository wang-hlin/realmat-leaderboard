const DATA_REPO_URL = 'https://github.com/wang-hlin/realmat-leaderboard';
const EVAL_API_URL = '/api/leaderboard/evaluate-temp';

const els = {
  dataRepoLink: document.getElementById('dataRepoLink'),
  submitForm: document.getElementById('submitForm'),
  modelName: document.getElementById('modelName'),
  trainMode: document.getElementById('trainMode'),
  predictionFile: document.getElementById('predictionFile'),
  submitBtn: document.getElementById('submitBtn'),
  submitStatus: document.getElementById('submitStatus'),
  resultSection: document.getElementById('resultSection'),
  metricsBody: document.getElementById('metricsBody'),
  positionLine: document.getElementById('positionLine'),
};

function setStatus(text, isError = false) {
  els.submitStatus.textContent = text;
  els.submitStatus.style.color = isError ? '#9f1239' : '#1f2933';
}

function parseCSVHeader(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  return firstLine.split(',').map((x) => x.trim().toLowerCase());
}

async function validateFile(file) {
  const text = await file.text();
  const headers = parseCSVHeader(text);
  const required = ['id', 'prediction'];
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`);
  }
}

function renderMetrics(metrics) {
  const order = ['mrae_mean', 'mrae_std', 'mae_mean', 'mae_std', 'r2_mean', 'r2_std'];
  const rows = order
    .filter((k) => metrics[k] !== undefined && metrics[k] !== null)
    .map((k) => {
      const tr = document.createElement('tr');
      const tdKey = document.createElement('td');
      const tdVal = document.createElement('td');
      tdKey.textContent = k;
      tdVal.textContent = String(metrics[k]);
      tr.appendChild(tdKey);
      tr.appendChild(tdVal);
      return tr;
    });
  els.metricsBody.innerHTML = '';
  rows.forEach((r) => els.metricsBody.appendChild(r));
}

async function evaluatePrediction(payload) {
  const res = await fetch(EVAL_API_URL, {
    method: 'POST',
    body: payload,
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch (err) {
      detail = '';
    }
    throw new Error(detail || `Evaluation failed with HTTP ${res.status}`);
  }
  return res.json();
}

async function onSubmit(e) {
  e.preventDefault();
  const file = els.predictionFile.files?.[0];
  const modelName = els.modelName.value.trim();

  if (!modelName) {
    setStatus('Model name is required.', true);
    return;
  }
  if (!file) {
    setStatus('Please upload a prediction CSV file.', true);
    return;
  }

  els.submitBtn.disabled = true;
  setStatus('Validating file...');
  els.resultSection.classList.add('hidden');

  try {
    await validateFile(file);

    setStatus('Running temporary evaluation...');
    const formData = new FormData();
    formData.append('model_name', modelName);
    formData.append('train_mode', els.trainMode.value);
    formData.append('prediction_file', file);

    const result = await evaluatePrediction(formData);
    renderMetrics(result.metrics || {});
    if (result.rank !== undefined && result.rank !== null) {
      els.positionLine.textContent = `Estimated leaderboard rank (preview): ${result.rank}`;
    } else {
      els.positionLine.textContent = result.message || 'Submission completed.';
    }
    els.resultSection.classList.remove('hidden');
    setStatus('Temporary evaluation completed.');
  } catch (err) {
    setStatus(err.message || 'Evaluation failed.', true);
  } finally {
    els.submitBtn.disabled = false;
  }
}

function init() {
  els.dataRepoLink.href = DATA_REPO_URL;
  els.dataRepoLink.textContent = DATA_REPO_URL;
  els.submitForm.addEventListener('submit', (e) => {
    e.preventDefault();
  });
}

init();
