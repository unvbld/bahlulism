console.log('BCL: Content script loaded');

const DEFAULTS = {
  enabled: true,
  threshold: 0.5,
  keywords: 'bahlil lahadalia,bahlil,lahadalia'
};

const normalizeText = (s) => s ? s.toString().toLowerCase()
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim() : '';

const getSettings = async () => {
  try {
    return await chrome.storage.sync.get(DEFAULTS);
  } catch (err) {
    console.warn('BCL: Settings error:', err);
    return DEFAULTS;
  }
};

const getScaledCanvas = (img) => {
  try {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    
    if (img.src && !img.src.startsWith(window.location.origin) && !img.crossOrigin) {
      img.crossOrigin = 'anonymous';
      return null;
    }
    
    const maxSize = 320;
    const scale = Math.max(w, h) > maxSize ? maxSize / Math.max(w, h) : 1;
    const canvas = Object.assign(document.createElement('canvas'), {
      width: Math.max(1, Math.round(w * scale)),
      height: Math.max(1, Math.round(h * scale))
    });
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    try { ctx.getImageData(0, 0, 1, 1); } catch { return null; }
    return canvas;
  } catch { return null; }
};

const getImageSources = (img) => {
  try {
    return [
      (img.currentSrc || img.src || '').split('?')[0],
      (img.getAttribute('data-src') || '').split('?')[0],
      img.alt,
      img.title,
      img.parentElement?.innerText
    ].filter(Boolean).join(' ').toLowerCase();
  } catch { return ''; }
};

const loadFaceAPI = async () => {
  console.log('BCL: Waiting for face-api...');
  for (let i = 0; i < 30; i++) {
    if (typeof faceapi !== 'undefined') {
      console.log('BCL: face-api loaded');
      return true;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  console.error('BCL: face-api timeout');
  return false;
};

const loadModels = async () => {
  const modelUrl = chrome.runtime.getURL('models');
  await faceapi.tf.setBackend('cpu');
  await faceapi.tf.ready();
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl),
    faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl),
    faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl)
  ]);
  console.log('BCL: Models loaded');
};

const loadLabeledImages = async () => {
  try {
    const res = await fetch(chrome.runtime.getURL('known_faces/labels.json'));
    const labels = await res.json();
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 });
    
    const descriptors = (await Promise.all(
      labels.slice(0, 20).map(async (filename) => {
        try {
          const img = await faceapi.fetchImage(chrome.runtime.getURL('known_faces/' + filename));
          const detection = await faceapi.detectSingleFace(img, opts).withFaceLandmarks().withFaceDescriptor();
          if (detection?.descriptor) {
            console.log('BCL: ✓', filename);
            return detection.descriptor;
          }
        } catch (err) {
          if (err.message !== 'Extension context invalidated.') console.debug('BCL: Skip:', filename);
        }
        return null;
      })
    )).filter(Boolean);
    
    if (!descriptors.length) {
      console.warn('BCL: No faces loaded');
      return null;
    }
    
    console.log('BCL:', descriptors.length, 'faces loaded');
    return [new faceapi.LabeledFaceDescriptors('bahlil', descriptors)];
  } catch (err) {
    console.warn('BCL: Load error:', err);
    return null;
  }
};

const processImage = async (img, faceMatcher) => {
  if (!img || img.dataset.processed || !img.complete || !img.naturalHeight) return;
  if (!(img.currentSrc || img.src)) return;
  
  img.dataset.processed = 'true';
  const settings = window.__BCL_SETTINGS || DEFAULTS;
  if (!settings.enabled) return;
  
  let matched = false, method = '';
  
  if (faceMatcher) {
    try {
      const canvas = getScaledCanvas(img);
      if (canvas) {
        try {
          const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 });
          const detection = await faceapi.detectSingleFace(canvas, opts).withFaceLandmarks().withFaceDescriptor();
          
          if (detection?.descriptor) {
            const match = faceMatcher.findBestMatch(detection.descriptor);
            if (match.label === 'bahlil' && match.distance < settings.threshold) {
              matched = true;
              method = 'FACE';
              console.log('BCL: Face match!', match.distance.toFixed(3));
            }
          }
        } catch (err) {
          if (err.name !== 'SecurityError') throw err;
        }
      }
    } catch (err) {
      console.debug('BCL: Detection error:', err.message);
    }
  }
  
  if (!matched) {
    const normalized = normalizeText(getImageSources(img));
    const keywords = settings.keywords.split(',').map(s => s.trim()).filter(Boolean);
    
    for (const kw of keywords) {
      if (normalized.includes(normalizeText(kw))) {
        matched = true;
        method = `KEYWORD: ${kw}`;
        console.log('BCL: Keyword:', kw);
        break;
      }
    }
  }
  
  if (matched) {
    console.log('BCL: BLUR [' + method + ']');
    blurImage(img);
  }
};

const blurImage = (img) => {
  if (img.classList.contains('blurred') || !img.parentElement) return;
  
  img.classList.add('blurred');
  const wrapper = Object.assign(document.createElement('div'), { className: 'blur-wrapper' });
  const btn = Object.assign(document.createElement('button'), {
    className: 'unblur-btn',
    innerText: 'Lihat',
    onclick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      img.classList.remove('blurred');
      btn.remove();
    }
  });
  
  img.parentElement.insertBefore(wrapper, img);
  wrapper.append(img, btn);
  ensureTriggerWarning();
};

const scanAndBlur = async (faceMatcher) => {
  if (!window.__BCL_IMAGE_OBSERVER) {
    window.__BCL_IMAGE_OBSERVER = new IntersectionObserver(async (entries) => {
      for (const { isIntersecting, target } of entries) {
        if (isIntersecting) {
          try { await processImage(target, faceMatcher); } catch (e) {}
          window.__BCL_IMAGE_OBSERVER.unobserve(target);
        }
      }
    }, { rootMargin: '200px', threshold: 0.01 });
  }
  
  document.querySelectorAll('img:not([data-checked])').forEach(img => {
    img.dataset.checked = 'queued';
    window.__BCL_IMAGE_OBSERVER.observe(img);
  });
};

const observeDOM = (faceMatcher) => {
  if (window.__BCL_DOM_OBSERVER) return;
  
  let timeout;
  window.__BCL_DOM_OBSERVER = new MutationObserver(() => {
    clearTimeout(timeout);
    timeout = setTimeout(() => scanAndBlur(faceMatcher), 500);
  });
  
  window.__BCL_DOM_OBSERVER.observe(document.body, { childList: true, subtree: true });
  console.log('BCL: Observer started');
};

let _blurCount = 0, _triggerShown = false;
const ensureTriggerWarning = () => {
  _blurCount++;
  
  const existing = document.querySelector('.bahlul-trigger-banner');
  if (existing) {
    const span = existing.querySelector('.bahlul-trigger-count');
    if (span) span.textContent = `${_blurCount} gambar diburamkan`;
    return;
  }
  
  if (_triggerShown) return;
  _triggerShown = true;

  const banner = Object.assign(document.createElement('div'), {
    className: 'bahlul-trigger-banner',
    innerHTML: `<div class='bahlul-trigger-inner'>
      <strong>Trigger Warning</strong>
      <span class='bahlul-trigger-count'>${_blurCount} gambar diburamkan</span>
      <button class='bahlul-trigger-dismiss'>Tutup</button>
    </div>`
  });

  document.documentElement.appendChild(banner);
  banner.querySelector('.bahlul-trigger-dismiss').onclick = () => banner.remove();
  setTimeout(() => banner.remove(), 10000);
};

(async () => {
  try {
    const settings = await getSettings();
    window.__BCL_SETTINGS = settings;
    if (!settings.enabled) return console.log('BCL: Disabled');
    
    let faceMatcher = null;
    if (await loadFaceAPI()) {
      try {
        await loadModels();
        const descriptors = await loadLabeledImages();
        if (descriptors) {
          faceMatcher = new faceapi.FaceMatcher(descriptors, settings.threshold);
          console.log('BCL: Face recognition enabled');
        }
      } catch (err) {
        console.warn('BCL: Face-api failed, keyword mode:', err.message);
      }
    }
    
    console.log('BCL: Starting...');
    scanAndBlur(faceMatcher);
    observeDOM(faceMatcher);
  } catch (err) {
    console.error('BCL: Init error:', err);
  }
})();
