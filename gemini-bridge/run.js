/* shared: types a question into the Gemini page and reads the answer (used by the small window and by the frame inside the dashboard) */
async function runInGemini(prompt, wantJson, maxMs, images) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const say = t => { try { if (typeof window.__gbStatus === 'function') window.__gbStatus(t); } catch (e) {} };
  const q = s => document.querySelector(s);
  const editor = () => q('rich-textarea .ql-editor[contenteditable="true"]') || q('.ql-editor[contenteditable="true"]') || q('div[contenteditable="true"][role="textbox"]') || q('textarea');
  let ed = null;
  for (let i = 0; i < 60 && !(ed = editor()); i++) await sleep(500);
  say(ed ? '입력 칸 찾음' : '입력 칸 없음');
  if (!ed) return { error: 'login', message: 'Gemini 입력 칸을 찾지 못했습니다. 크롬에서 gemini.google.com에 로그인되어 있는지 확인해 주세요.' };
  const responses = () => document.querySelectorAll('model-response');
  const before = responses().length;
  ed.focus();
  // pictures first: paste them into the input like Ctrl+V, then wait until Gemini shows them
  if (images && images.length) {
    const files = images.map((im, i) => { const bin = atob(im.b64); const u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k); return new File([u], im.name || `image${i + 1}.jpg`, { type: im.mime || 'image/jpeg' }); });
    const shown = () => document.querySelectorAll('uploader-file-preview, img.gem-attachment-style-img, .file-preview-container img, [data-test-id*="file-preview"] img').length;
    const n0 = shown();
    const fresh = () => { const dt = new DataTransfer(); files.forEach(f => dt.items.add(f)); return dt; };
    const waitShown = async ms => { for (let t = 0; t < ms; t += 400) { await sleep(400); if (shown() > n0) return true; } return false; };
    let ok = false;
    say(`그림 ${files.length}장 넣는 중`);
    // 1) Gemini's own hidden file input (the one "Upload & tools → Files" uses)
    const fileInput = () => document.querySelector('input[type=file][accept*="image"]') || document.querySelector('input.hidden-file-input[type=file]') || document.querySelector('input[type=file]');
    let inp = fileInput();
    if (!inp) {
      const up = [...document.querySelectorAll('button')].find(b => /upload|업로드|파일 추가|add file/i.test(b.getAttribute('aria-label') || ''));
      if (up) { up.click(); await sleep(900); inp = fileInput(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
    }
    say(inp ? '파일 칸으로 넣는 중' : '파일 칸 없음 · 붙여넣기로 시도');
    if (inp) { try { inp.files = fresh().files; inp.dispatchEvent(new Event('change', { bubbles: true })); ok = await waitShown(8000); } catch (e) {} }
    // 2) paste, like Ctrl+V
    if (!ok) { try { ed.focus(); ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: fresh(), bubbles: true, cancelable: true })); } catch (e) {} ok = await waitShown(8000); }
    // 3) drop
    if (!ok) { const dt2 = fresh(); for (const type of ['dragenter', 'dragover', 'drop']) { try { ed.dispatchEvent(new DragEvent(type, { dataTransfer: dt2, bubbles: true, cancelable: true })); } catch (e) {} } ok = await waitShown(8000); }
    say(ok ? '그림 들어감' : '그림 넣기 실패');
    if (!ok) return { error: 'image', message: 'Gemini 창에 그림을 넣지 못했습니다. 그림을 직접 Gemini 창에 붙여넣어 주세요.' };
    // wait for the upload to finish (spinner gone, send button usable)
    const uploading = () => [...document.querySelectorAll('uploader-file-preview mat-progress-spinner, uploader-file-preview mat-spinner, uploader-file-preview [role="progressbar"]')].some(e => e.offsetParent !== null);
    for (let i = 0; i < 60; i++) { await sleep(500); if (!uploading()) break; }
    await sleep(800);
    ed.focus();
  }
  if (ed.tagName === 'TEXTAREA') { ed.value = prompt; ed.dispatchEvent(new Event('input', { bubbles: true })); }
  else {
    const sel = getSelection(); const rg = document.createRange(); rg.selectNodeContents(ed); if (images && images.length) rg.collapse(false); sel.removeAllRanges(); sel.addRange(rg);
    let ok = false; try { ok = document.execCommand('insertText', false, prompt); } catch (e) {}
    if (!ok || !ed.innerText.trim()) { ed.innerText = prompt; ed.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' })); }
  }
  say('질문 입력함 · 보내는 중');
  await sleep(500);
  const sendBtn = () => [...document.querySelectorAll('button.send-button, button[aria-label*="Send" i], button[aria-label*="보내기"], button[aria-label*="전송"], button[data-test-id="send-button"]')].find(b => !b.disabled && b.getAttribute('aria-disabled') !== 'true');
  let b = null;
  for (let i = 0; i < 30 && !(b = sendBtn()); i++) await sleep(250);
  say(b ? '보냄 · 답 기다리는 중' : '보내기 버튼 없음 · Enter로 보냄');
  if (b) b.click();
  else ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  const busy = () => !!document.querySelector('button[aria-label*="Stop" i], button[aria-label*="중지"], button.stop, mat-icon[fonticon="stop"], [data-mat-icon-name="stop"]');
  const textOf = r => {
    if (wantJson) { const codes = [...r.querySelectorAll('pre code, code-block code, code-block pre, [data-test-id="code-content"]')]; const good = codes.map(c => c.textContent).filter(t => /^\s*[\[{]/.test(t)); if (good.length) return good[good.length - 1]; if (codes.length) return codes.map(c => c.textContent).join('\n'); }
    const box = r.querySelector('message-content .markdown, .markdown, message-content, .model-response-text') || r;
    return box.innerText;
  };
  const t0 = Date.now(); let last = '', since = 0;
  while (Date.now() - t0 < maxMs) {
    await sleep(700);
    const rs = responses();
    if (rs.length <= before) { if (Date.now() - t0 > 45000 && !busy()) return { error: 'nosend', message: 'Gemini에 질문이 보내지지 않은 것 같습니다. Gemini 창을 확인해 주세요.' }; continue; }
    const text = (textOf(rs[rs.length - 1]) || '').trim();
    // JSON wanted: a picture makes Gemini "think" first, so wait until a JSON answer is there (or the text stops changing for a long time)
    const jsonOK = t => { try { const m = String(t).match(/[\[{][\s\S]*[\]}]/); if (!m) return false; JSON.parse(m[0]); return true; } catch (e) { return false; } };
    if (text && text === last && !busy()) { if (!since) since = Date.now(); if (Date.now() - since > (wantJson && !jsonOK(text) ? 25000 : 2500)) return { text }; }
    else { since = 0; last = text; }
  }
  return last ? { text: last, partial: true } : { error: 'timeout', message: 'Gemini 답을 기다리다 시간이 지났습니다.' };
}

