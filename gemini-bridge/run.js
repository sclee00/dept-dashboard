/* shared: types a question into the Gemini page and reads the answer (used by the small window and by the frame inside the dashboard) */
async function runInGemini(prompt, wantJson, maxMs, images) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const say = t => { try { if (typeof window.__gbStatus === 'function') window.__gbStatus(t); } catch (e) {} };
  const q = s => document.querySelector(s);
  const editor = () => q('rich-textarea .ql-editor[contenteditable="true"]') || q('.ql-editor[contenteditable="true"]') || q('div[contenteditable="true"][role="textbox"]') || q('textarea');
  const t0 = Date.now();
  let ed = null;
  for (let i = 0; i < 60 && !(ed = editor()); i++) await sleep(500);
  say(ed ? '입력 칸 찾음' : '입력 칸 없음');
  if (!ed) return { error: 'login', message: 'Gemini 입력 칸을 찾지 못했습니다. 크롬에서 gemini.google.com에 로그인되어 있는지 확인해 주세요.' };
  const responses = () => document.querySelectorAll('model-response');
  const queries = () => document.querySelectorAll('user-query');
  const busy = () => !!document.querySelector('button[aria-label*="Stop" i], button[aria-label*="중지"], button.stop, mat-icon[fonticon="stop"], [data-mat-icon-name="stop"]');
  const jsonOK = t => { try { const m = String(t).match(/[\[{][\s\S]*[\]}]/); if (!m) return false; JSON.parse(m[0]); return true; } catch (e) { return false; } };
  const textOf = r => {
    if (wantJson) { const codes = [...r.querySelectorAll('pre code, code-block code, code-block pre, [data-test-id="code-content"]')]; const good = codes.map(c => c.textContent).filter(t => /^\s*[\[{]/.test(t)); if (good.length) return good[good.length - 1]; if (codes.length) return codes.map(c => c.textContent).join('\n'); }
    // the answer box: not the (often hidden, empty) "thinking" panel — take the candidate that really has text
    const texts = [...r.querySelectorAll('message-content .markdown, .markdown, message-content, .model-response-text')]
      .filter(b => !b.closest('model-thoughts, .thoughts-container, [data-test-id*="thought"]')).map(b => (b.innerText || '').trim()).filter(Boolean);
    if (wantJson) { const j = texts.filter(jsonOK); if (j.length) return j[j.length - 1]; }
    if (texts.length) return texts.sort((a, b) => b.length - a.length)[0];
    return (r.innerText || '').trim();
  };

  // pictures first: through Gemini's own file input (as "Upload & tools → Files" does), else paste, else drop
  if (images && images.length) {
    const files = images.map((im, i) => { const bin = atob(im.b64); const u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k); return new File([u], im.name || `image${i + 1}.jpg`, { type: im.mime || 'image/jpeg' }); });
    const shown = () => document.querySelectorAll('uploader-file-preview, img.gem-attachment-style-img, .file-preview-container img, [data-test-id*="file-preview"] img').length;
    const n0 = shown();
    const fresh = () => { const dt = new DataTransfer(); files.forEach(f => dt.items.add(f)); return dt; };
    const waitShown = async ms => { for (let t = 0; t < ms; t += 400) { await sleep(400); if (shown() > n0) return true; } return false; };
    let ok = false;
    say(`그림 ${files.length}장 넣는 중`);
    const fileInput = () => document.querySelector('input[type=file][accept*="image"]') || document.querySelector('input.hidden-file-input[type=file]') || document.querySelector('input[type=file]');
    let inp = fileInput();
    if (!inp) {
      const up = [...document.querySelectorAll('button')].find(b => /upload|업로드|파일 추가|add file/i.test(b.getAttribute('aria-label') || ''));
      if (up) { up.click(); await sleep(900); inp = fileInput(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
    }
    say(inp ? '파일 칸으로 넣는 중' : '파일 칸 없음 · 붙여넣기로 시도');
    if (inp) { try { inp.files = fresh().files; inp.dispatchEvent(new Event('change', { bubbles: true })); ok = await waitShown(8000); } catch (e) {} }
    if (!ok) { try { (editor() || ed).focus(); (editor() || ed).dispatchEvent(new ClipboardEvent('paste', { clipboardData: fresh(), bubbles: true, cancelable: true })); } catch (e) {} ok = await waitShown(8000); }
    if (!ok) { const dt2 = fresh(); for (const type of ['dragenter', 'dragover', 'drop']) { try { (editor() || ed).dispatchEvent(new DragEvent(type, { dataTransfer: dt2, bubbles: true, cancelable: true })); } catch (e) {} } ok = await waitShown(8000); }
    say(ok ? '그림 들어감' : '그림 넣기 실패');
    if (!ok) return { error: 'image', message: 'Gemini 창에 그림을 넣지 못했습니다. 그림을 직접 Gemini 창에 붙여넣어 주세요.' };
    const uploading = () => [...document.querySelectorAll('uploader-file-preview mat-progress-spinner, uploader-file-preview mat-spinner, uploader-file-preview [role="progressbar"]')].some(e => e.offsetParent !== null);
    for (let i = 0; i < 60; i++) { await sleep(500); if (!uploading()) break; }
    await sleep(800);
  }

  // put text into the input (after any pictures) and make sure it is really there
  const typeIn = async text => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const e = editor(); if (!e) { await sleep(500); continue; }
      e.focus();
      if (e.tagName === 'TEXTAREA') { e.value = text; e.dispatchEvent(new Event('input', { bubbles: true })); }
      else {
        const sel = getSelection(); const rg = document.createRange(); rg.selectNodeContents(e); rg.collapse(false); sel.removeAllRanges(); sel.addRange(rg);
        let ok = false; try { ok = document.execCommand('insertText', false, text); } catch (x) {}
        if (!ok || (e.innerText || '').trim().length < Math.min(40, text.length / 2)) {
          // no keyboard focus (e.g. the dashboard is in front): paste the text instead, then plain DOM as a last resort
          try { const dt = new DataTransfer(); dt.setData('text/plain', text); e.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); } catch (x) {}
          await sleep(300);
          if ((e.innerText || '').trim().length < Math.min(40, text.length / 2)) { e.innerText = text; e.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })); }
        }
      }
      await sleep(400);
      const got = ((editor() || {}).innerText || (editor() || {}).value || '').trim().length;
      if (got >= Math.min(40, text.length / 2)) return true;
    }
    return false;
  };
  const sendBtn = () => [...document.querySelectorAll('button.send-button, button[aria-label*="Send" i], button[aria-label*="보내기"], button[aria-label*="전송"], button[data-test-id="send-button"]')].find(b => !b.disabled && b.getAttribute('aria-disabled') !== 'true');
  // send one message and wait for its answer
  const turn = async (text, label) => {
    const seen = new Set(responses());   // by element, not by count: the page may start a new conversation under us
    const fresh = () => [...responses()].filter(r => !seen.has(r));
    const typed = await typeIn(text);
    say(typed ? `${label} 입력함 · 보내는 중` : `${label} 입력이 잘 안 됨 · 그래도 보냄`);
    await sleep(400);
    let b = null;
    for (let i = 0; i < 30 && !(b = sendBtn()); i++) await sleep(250);
    if (b) b.click();
    else (editor() || ed).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    say('보냄 · 답 기다리는 중');
    const ts = Date.now(); let last = '', since = 0;
    while (Date.now() - t0 < maxMs) {
      await sleep(700);
      const rs = fresh();
      if (!rs.length) { if (Date.now() - ts > 45000 && !busy()) return { error: 'nosend', message: 'Gemini에 질문이 보내지지 않은 것 같습니다. Gemini 창을 확인해 주세요.' }; continue; }
      const t = (textOf(rs[rs.length - 1]) || '').trim();
      // with JSON wanted (and with pictures Gemini "thinks" first) wait for JSON, or for the text to stay still a long time
      if (t && t === last && !busy()) { if (!since) since = Date.now(); if (Date.now() - since > (wantJson && !jsonOK(t) ? (/[{\[]/.test(t) ? 20000 : 7000) : 2500)) return { text: t }; }
      else { since = 0; last = t; }
    }
    // out of time: whatever the newest answer shows is better than nothing
    const end = fresh(), tail = end.length ? ((end[end.length - 1].innerText || '').trim()) : '';
    return last ? { text: last, partial: true } : tail ? { text: tail, partial: true } : { error: 'timeout', message: 'Gemini 답을 기다리다 시간이 지났습니다.' };
  };

  let r = await turn(prompt, '질문');
  if (r.error || !wantJson || jsonOK(r.text)) return r;
  // the answer is not in the asked format: did the question text go out at all?
  const qs = queries(), sent = qs.length ? (qs[qs.length - 1].innerText || '').trim().length : 0;
  const lost = sent < Math.min(200, prompt.length / 3);
  say(lost ? '질문 글이 빠지고 그림만 간 것 같아 질문을 다시 보냄' : 'JSON이 아니어서 형식대로 다시 요청');
  const r2 = await turn(lost ? prompt : '방금 답을 내가 처음에 말한 JSON 형식 하나로만 다시 써 줘. 설명이나 다른 말 없이 JSON만.', '다시 요청');
  return r2.error ? r : r2;
}
