/* shared: types a question into the Gemini page and reads the answer (used by the small window and by the frame inside the dashboard) */
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

