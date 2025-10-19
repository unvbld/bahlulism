document.addEventListener('DOMContentLoaded', async () => {
  const enabledEl = document.getElementById('enabled');
  const thresholdEl = document.getElementById('threshold');
  const keywordsEl = document.getElementById('keywords');
  const status = document.getElementById('status');

  const data = await chrome.storage.sync.get({enabled: true, threshold: 0.5, keywords: 'bahlil lahadalia,bahlil,lahadalia'});
  enabledEl.checked = data.enabled;
  thresholdEl.value = data.threshold;
  keywordsEl.value = data.keywords;

  document.getElementById('save').addEventListener('click', async () => {
    const enabled = enabledEl.checked;
    let threshold = parseFloat(thresholdEl.value);
    if (isNaN(threshold)) threshold = 0.5;
    const keywords = keywordsEl.value;
    await chrome.storage.sync.set({enabled, threshold, keywords});
    status.textContent = 'Options saved';
    setTimeout(() => status.textContent = '', 1500);
  });

  function renderLogs() {
    chrome.storage.local.get({ distances: [] }, (data) => {
      const arr = (data.distances || []).slice(-50).reverse();
      const logs = document.getElementById('logs');
      if (!logs) return;
      logs.innerHTML = arr.map(e => `<div style="padding:4px;border-bottom:1px solid #eee">${new Date(e.time).toLocaleString()} - ${e.src ? e.src.split('/').pop() : ''} - ${e.label} - ${e.distance.toFixed(3)}</div>`).join('');
    });
  }

  renderLogs();

  document.getElementById('clearLogs').addEventListener('click', () => {
    chrome.storage.local.set({ distances: [] }, () => renderLogs());
  });

  const canvas = document.getElementById('histogram');
  const suggestedEl = document.getElementById('suggestedVal');
  const medianEl = document.getElementById('medianVal');

  function renderHistogram() {
    chrome.storage.local.get({ distances: [] }, (data) => {
      const arr = (data.distances || []).map(d => d.distance).filter(n => typeof n === 'number' && isFinite(n));
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0,0,canvas.width,canvas.height);
      if (arr.length === 0) {
        ctx.fillStyle = '#999'; ctx.fillText('No distance data yet', 10, 20); suggestedEl.textContent = '-'; medianEl.textContent = '-'; return;
      }
      arr.sort((a,b)=>a-b);
      const bins = 20; const binsArr = new Array(bins).fill(0);
      const min = Math.min(...arr); const max = Math.max(...arr);
      const range = max - min || 1;
      for (const v of arr) {
        const idx = Math.min(bins-1, Math.floor((v - min) / range * bins)); binsArr[idx]++;
      }
      const maxCount = Math.max(...binsArr);
      const pad = 8; const w = canvas.width - pad*2; const h = canvas.height - pad*2;
      for (let i=0;i<bins;i++) {
        const bw = w / bins; const bh = (binsArr[i] / maxCount) * h;
        ctx.fillStyle = '#4a90e2';
        ctx.fillRect(pad + i*bw, pad + (h - bh), bw - 2, bh);
      }
      const median = arr[Math.floor(arr.length/2)];
      const q25 = arr[Math.floor(arr.length*0.25)];
      suggestedEl.textContent = q25.toFixed(3);
      medianEl.textContent = median.toFixed(3);
      ctx.strokeStyle = 'rgba(255,0,0,0.9)'; ctx.beginPath(); const mx = pad + ((median - min)/range)*w; ctx.moveTo(mx, pad); ctx.lineTo(mx, pad+h); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,200,0,0.9)'; ctx.beginPath(); const qx = pad + ((q25 - min)/range)*w; ctx.moveTo(qx, pad); ctx.lineTo(qx, pad+h); ctx.stroke();
    });
  }

  document.getElementById('refreshHist').addEventListener('click', () => { renderLogs(); renderHistogram(); });

  document.getElementById('applySuggested').addEventListener('click', () => {
    const suggested = parseFloat(document.getElementById('suggestedVal').textContent);
    if (!isNaN(suggested)) {
      chrome.storage.sync.set({ threshold: suggested }, () => {
        thresholdEl.value = suggested; status.textContent = 'Applied suggested threshold'; setTimeout(()=>status.textContent='',1500);
      });
    }
  });

  renderHistogram();
});