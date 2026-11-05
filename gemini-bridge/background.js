/* 학과장실 대시보드 · Gemini 연결: one small Gemini window, one question at a time, a new chat for each */
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

// runs inside the Gemini page
async function runInGemini(prompt, wantJson, maxMs) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s);
  const editor = () => q('rich-textarea .ql-editor[contenteditable="true"]') || q('.ql-editor[contenteditable="true"]') || q('div[contenteditable="true"][role="textbox"]') || q('textarea');
  let ed = null;
  for (let i = 0; i < 60 && !(ed = editor()); i++) await sleep(500);
  if (!ed) return { error: 'login', message: 'Gemini 입력 칸을 찾지 못했습니다. 크롬에서 gemini.google.com에 로그인되어 있는지 확인해 주세요.' };
  const responses = () => document.querySelectorAll('model-response');
  const before = responses().length;
  ed.focus();
  if (ed.tagName === 'TEXTAREA') { ed.value = prompt; ed.dispatchEvent(new Event('input', { bubbles: true })); }
  else {
    const sel = getSelection(); const rg = document.createRange(); rg.selectNodeContents(ed); sel.removeAllRanges(); sel.addRange(rg);
    let ok = false; try { ok = document.execCommand('insertText', false, prompt); } catch (e) {}
    if (!ok || !ed.innerText.trim()) { ed.innerText = prompt; ed.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' })); }
  }
  await sleep(500);
  const sendBtn = () => [...document.querySelectorAll('button.send-button, button[aria-label*="Send" i], button[aria-label*="보내기"], button[aria-label*="전송"], button[data-test-id="send-button"]')].find(b => !b.disabled && b.getAttribute('aria-disabled') !== 'true');
  let b = null;
  for (let i = 0; i < 30 && !(b = sendBtn()); i++) await sleep(250);
  if (b) b.click();
  else ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  const busy = () => !!document.querySelector('button[aria-label*="Stop" i], button[aria-label*="중지"], button.stop, mat-icon[fonticon="stop"], [data-mat-icon-name="stop"]');
  const textOf = r => {
    if (wantJson) { const codes = r.querySelectorAll('pre code, code-block code'); if (codes.length) return [...codes].map(c => c.textContent).join('\n'); }
    const box = r.querySelector('message-content .markdown, .markdown, message-content, .model-response-text') || r;
    return box.innerText;
  };
  const t0 = Date.now(); let last = '', since = 0;
  while (Date.now() - t0 < maxMs) {
    await sleep(700);
    const rs = responses();
    if (rs.length <= before) { if (Date.now() - t0 > 45000 && !busy()) return { error: 'nosend', message: 'Gemini에 질문이 보내지지 않은 것 같습니다. Gemini 창을 확인해 주세요.' }; continue; }
    const text = (textOf(rs[rs.length - 1]) || '').trim();
    if (text && text === last && !busy()) { if (!since) since = Date.now(); if (Date.now() - since > 2500) return { text }; }
    else { since = 0; last = text; }
  }
  return last ? { text: last, partial: true } : { error: 'timeout', message: 'Gemini 답을 기다리다 시간이 지났습니다.' };
}

async function ask(prompt, json, status) {
  const tabId = await geminiTab();
  status('Gemini 새 대화를 여는 중');
  await chrome.tabs.update(tabId, { url: GEMINI });   // a fresh chat every time
  await loaded(tabId, 30000);
  status('Gemini가 답하는 중');
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: runInGemini, args: [prompt, json, 240000] });
  return (r && r.result) || { error: 'bridge', message: 'Gemini 창에서 결과를 받지 못했습니다.' };
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'gb') return;
  port.onMessage.addListener(m => {
    if (m.type !== 'ask') return;
    const status = text => { try { port.postMessage({ type: 'status', text }); } catch (e) {} };
    queue = queue.then(() => ask(m.prompt, m.json, status)
      .then(result => { try { port.postMessage({ type: 'result', result }); } catch (e) {} })
      .catch(e => { try { port.postMessage({ type: 'result', result: { error: 'bridge', message: String((e && e.message) || e) } }); } catch (x) {} }));
  });
});
chrome.action.onClicked.addListener(async () => { const id = await geminiTab(); const t = await chrome.tabs.get(id); chrome.windows.update(t.windowId, { focused: true }); });
