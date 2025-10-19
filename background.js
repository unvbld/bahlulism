console.log('BCL Background: Service worker started');

let faceApiCode = null;

fetch(chrome.runtime.getURL('lib/face-api.min.js'))
  .then(response => response.text())
  .then(code => {
    faceApiCode = code;
    console.log('BCL Background: face-api.js preloaded (' + (code.length / 1024).toFixed(0) + 'KB)');
  })
  .catch(err => console.error('BCL Background: Failed to preload face-api:', err));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getFaceApiCode') {
    if (faceApiCode) {
      sendResponse({ success: true, code: faceApiCode });
    } else {
      sendResponse({ success: false, error: 'face-api not loaded yet' });
    }
    return true;
  }
  
  if (request.action === 'ping') {
    sendResponse({ status: 'ok' });
  }
  
  return true;
});

console.log('BCL Background: Ready');
