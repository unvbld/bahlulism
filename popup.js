document.addEventListener('DOMContentLoaded', async () => {
  const enabledEl = document.getElementById('enabled');
  const thresholdEl = document.getElementById('threshold');
  const msg = document.getElementById('msg');

  const data = await chrome.storage.sync.get({enabled: true, threshold: 0.5});
  enabledEl.checked = data.enabled;
  thresholdEl.value = data.threshold;

  document.getElementById('save').addEventListener('click', async () => {
    const enabled = enabledEl.checked;
    let threshold = parseFloat(thresholdEl.value);
    if (isNaN(threshold)) threshold = 0.5;
    await chrome.storage.sync.set({enabled, threshold});
    msg.textContent = 'Saved';
    setTimeout(() => msg.textContent = '', 1500);
  });
});