// 업무 대시보드 · 아이폰에서 Gemini에 대신 묻기 (Scriptable)
// 대시보드에서 "AI로 처리"를 누르면 이 스크립트가 열립니다. 스크립트 이름은 꼭 "대시보드AI"로 저장하세요.
// 처음 한 번: 대시보드 설정 → 기본 → AI의 "Scriptable 연결"을 누르면 연결 주소가 저장됩니다.

const RUN_JS = "https://sclee00.github.io/dept-dashboard/gemini-bridge/run.js";
const P = args.queryParameters || {};
const sleep = ms => new Promise(r => Timer.schedule(ms, false, r));

async function tell(title, msg) { const a = new Alert(); a.title = title; a.message = msg; a.addAction("확인"); await a.present(); }
async function notify(title, body) { try { const n = new Notification(); n.title = title; n.body = body; await n.schedule(); } catch (e) {} }

// 1) connect: remember the Apps Script address and key on this iPhone
if (P.setup) {
  Keychain.set("dash_gas", P.gas || "");
  Keychain.set("dash_key", P.key || "");
  await tell("연결했습니다", "이제 대시보드에서 'AI로 처리'를 누르면 이 아이폰의 Gemini가 처리합니다.\n왼쪽 위 ◀︎로 대시보드에 돌아가세요.");
  Script.complete(); return;
}
const GAS = Keychain.contains("dash_gas") ? Keychain.get("dash_gas") : "";
const KEY = Keychain.contains("dash_key") ? Keychain.get("dash_key") : "";
if (!GAS || !KEY) { await tell("연결 전", "대시보드 설정 → 기본 → AI에서 'Scriptable 연결'을 먼저 눌러 주세요."); Script.complete(); return; }

async function gasGet(params) {
  const q = Object.entries({ ...params, key: KEY, t: Date.now() }).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
  const r = new Request(GAS + "?" + q); r.timeoutInterval = 60;
  return await r.loadJSON();
}
async function gasPost(body) {
  const r = new Request(GAS); r.method = "POST"; r.timeoutInterval = 60;
  r.headers = { "Content-Type": "text/plain;charset=utf-8" };
  r.body = JSON.stringify({ ...body, key: KEY });
  return await r.loadJSON();
}

// 2) Gemini login check / login (only when needed)
async function geminiView() {
  const wv = new WebView();
  await wv.loadURL("https://gemini.google.com/app");
  await sleep(2500);
  const st = async () => JSON.parse(await wv.evaluateJavaScript(`JSON.stringify({
    editor: !!document.querySelector('rich-textarea .ql-editor, div[contenteditable="true"]'),
    signedOut: !!document.querySelector('a[href*="ServiceLogin"], a[href*="signin"]') })`));
  let s = await st();
  if (!s.editor || s.signedOut) {
    await wv.loadURL("https://accounts.google.com/ServiceLogin?continue=" + encodeURIComponent("https://gemini.google.com/app"));
    await wv.present(false);
    await wv.loadURL("https://gemini.google.com/app");
    await sleep(3000);
    s = await st();
    if (!s.editor || s.signedOut) throw { code: "login", message: "Gemini에 로그인되지 않았습니다." };
  }
  return wv;
}

// 3) test from the dashboard settings
if (P.test) {
  try {
    const wv = await geminiView();
    const runjs = await new Request(RUN_JS + "?t=" + Date.now()).loadString();
    const r = JSON.parse(await wv.evaluateJavaScript(`${runjs}
      (async () => { const r = await runInGemini('연결 시험이야. 딴말 말고 "연결됨" 한 단어로만 답해 줘', false, 90000, []); completion(JSON.stringify(r)); })(); 0;`, true));
    await tell("Gemini 연결 시험", r.error ? "실패: " + r.message : "Gemini 답: " + r.text + "\n\n왼쪽 위 ◀︎로 대시보드에 돌아가세요.");
  } catch (e) { await tell("Gemini 연결 시험", "실패: " + ((e && e.message) || e)); }
  Script.complete(); return;
}

// 4) the real job: take the question, ask Gemini, leave the answer for the dashboard
const id = P.id;
if (!id) { await tell("대시보드AI", "대시보드에서 'AI로 처리'를 누르면 실행됩니다."); Script.complete(); return; }
let result;
try {
  const j = await gasGet({ action: "aiGet", id });
  if (!j.ok) throw { code: j.error || "job", message: j.message || "작업을 가져오지 못했습니다." };
  const job = j.job;
  const wv = await geminiView();
  const runjs = await new Request(RUN_JS + "?t=" + Date.now()).loadString();
  await wv.evaluateJavaScript(`window.__job = ${JSON.stringify({ prompt: job.prompt, json: job.json, images: job.images || [] })}; 0;`);
  result = JSON.parse(await wv.evaluateJavaScript(`${runjs}
    (async () => { let r; try { const j = window.__job; r = await runInGemini(j.prompt, j.json, 240000, j.images); } catch (e) { r = { error: 'bridge', message: String((e && e.message) || e) }; } completion(JSON.stringify(r)); })(); 0;`, true));
} catch (e) {
  result = { error: (e && e.code) || "scriptable", message: (e && e.message) || String(e) };
}
try { await gasPost({ action: "aiDone", id, text: result.text == null ? null : result.text, error: result.error || null, message: result.message || null }); }
catch (e) { await tell("답을 보내지 못했습니다", String((e && e.message) || e)); Script.complete(); return; }
await notify(result.error ? "Gemini 처리 실패" : "Gemini 답을 보냈습니다", result.error ? result.message : "왼쪽 위 ◀︎로 대시보드에 돌아가면 바로 적용됩니다.");
Script.complete();
