// runs on the dashboard page: tells the page the bridge is here, and carries questions to the extension
document.documentElement.dataset.geminiBridge = chrome.runtime.getManifest().version;
window.addEventListener('message', e => {
  if (e.source !== window || !e.data || e.data.type !== 'gb-ask') return;
  const { id, prompt, json, images } = e.data;
  const port = chrome.runtime.connect({ name: 'gb' });
  const hb = setInterval(() => { try { port.postMessage({ type: 'ping' }); } catch (x) {} }, 15000); // keeps the extension awake while Gemini writes
  let done = false;
  const reply = r => { if (done) return; done = true; clearInterval(hb); window.postMessage({ type: 'gb-result', id, ...r }, location.origin); try { port.disconnect(); } catch (x) {} };
  port.onMessage.addListener(m => { if (m.type === 'result') reply(m.result); else if (m.type === 'status') window.postMessage({ type: 'gb-status', id, text: m.text }, location.origin); });
  port.onDisconnect.addListener(() => reply({ error: 'bridge', message: '확장 프로그램과 연결이 끊겼습니다.' }));
  port.postMessage({ type: 'ask', prompt, json: !!json, images: images || [] });
});
window.addEventListener('message', e => { if (e.source === window && e.data && e.data.type === 'gb-hello') window.postMessage({ type: 'gb-here', version: chrome.runtime.getManifest().version }, location.origin); });
