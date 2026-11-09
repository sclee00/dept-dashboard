/* runs in gemini.google.com only when it is shown inside the dashboard: takes the dashboard's question, answers back */
(() => {
  if (window.top === window) return;
  const OK = ['https://sclee00.github.io', 'http://localhost:8765'];
  const signedIn = () => !document.querySelector('a[href*="accounts.google.com/ServiceLogin"], a[href*="accounts.google.com/v3/signin"], a[href*="accounts.google.com/signin"]');
  const ready = to => { const msg = { type: 'gbf-ready', signedIn: signedIn(), version: chrome.runtime.getManifest().version }; (to ? [to] : OK).forEach(o => { try { window.parent.postMessage(msg, o); } catch (e) {} }); };
  // tell the dashboard once the input box is there (or after a while, so it can see a sign-in page)
  const t0 = Date.now();
  (function wait() { if (document.querySelector('rich-textarea .ql-editor, .ql-editor[contenteditable="true"], div[contenteditable="true"][role="textbox"], textarea') || Date.now() - t0 > 12000) ready(); else setTimeout(wait, 300); })();
  let busy = false;
  window.addEventListener('message', async e => {
    if (e.source !== window.parent || !OK.includes(e.origin) || !e.data) return;
    if (e.data.type === 'gbf-hello') return ready(e.origin);
    if (e.data.type !== 'gbf-ask') return;
    const { id, prompt, json, images } = e.data;
    if (busy) return window.parent.postMessage({ type: 'gbf-result', id, error: 'busy', message: 'Gemini가 아직 앞 질문에 답하는 중입니다.' }, e.origin);
    busy = true;
    let r;
    try { r = await runInGemini(String(prompt || ''), !!json, 240000, images || []); } catch (x) { r = { error: 'bridge', message: String((x && x.message) || x) }; }
    busy = false;
    window.parent.postMessage({ type: 'gbf-result', id, ...r }, e.origin);
  });
})();
