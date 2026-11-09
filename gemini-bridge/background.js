/* 업무 대시보드 · Gemini 연결: one small Gemini window, one question at a time, a new chat for each */
const GEMINI = 'https://gemini.google.com/app';
let queue = Promise.resolve();

async function geminiTab() {
  const { tabId, winId } = await chrome.storage.session.get(['tabId', 'winId']);
  if (tabId) { try { const t = await chrome.tabs.get(tabId); if (t && /^https:\/\/gemini\.google\.com\//.test(t.url || t.pendingUrl || '')) return t.id; } catch (e) {} }
  // a separate small window that stays visible, so the page keeps working while the dashboard is in front
  const w = await chrome.windows.create({ url: GEMINI, type: 'popup', focused: false, width: 520, height: 760, left: 0, top: 0 });
  const t = w.tabs[0];
  try { await chrome.tabs.update(t.id, { autoDiscardable: false }); } catch (e) {}
  await chrome.storage.session.set({ tabId: t.id, winId: w.id });
  return t.id;
}
function loaded(tabId, ms) {
  return new Promise(res => {
    const done = () => { chrome.tabs.onUpdated.removeListener(fn); clearTimeout(to); res(); };
    const fn = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    const to = setTimeout(done, ms || 30000);
    chrome.tabs.onUpdated.addListener(fn);
    chrome.tabs.get(tabId).then(t => { if (t.status === 'complete' && !t.pendingUrl) done(); }).catch(done);
  });
}

importScripts('run.js');

async function ask(prompt, json, status, images) {
  const tabId = await geminiTab();
  status('Gemini 새 대화를 여는 중');
  await chrome.tabs.update(tabId, { url: GEMINI });   // a fresh chat every time
  await loaded(tabId, 30000);
  status('Gemini가 답하는 중');
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: runInGemini, args: [prompt, json, 240000, images || []] });
  return (r && r.result) || { error: 'bridge', message: 'Gemini 창에서 결과를 받지 못했습니다.' };
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'gb') return;
  port.onMessage.addListener(m => {
    if (m.type !== 'ask') return;
    const status = text => { try { port.postMessage({ type: 'status', text }); } catch (e) {} };
    queue = queue.then(() => ask(m.prompt, m.json, status, m.images)
      .then(result => { try { port.postMessage({ type: 'result', result }); } catch (e) {} })
      .catch(e => { try { port.postMessage({ type: 'result', result: { error: 'bridge', message: String((e && e.message) || e) } }); } catch (x) {} }));
  });
});
chrome.action.onClicked.addListener(async () => { const id = await geminiTab(); const t = await chrome.tabs.get(id); chrome.windows.update(t.windowId, { focused: true }); });
