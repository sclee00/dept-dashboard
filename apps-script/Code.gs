/**
 * 학과장실 대시보드 ↔ 구글 캘린더 연결 (Google Apps Script)
 *
 * 설치
 * 1. script.google.com → 새 프로젝트 → 이 내용을 Code.gs에 통째로 붙여넣기
 * 2. 아래 KEY를 아무도 모르는 긴 문자열로 바꾸기 (대시보드 설정에도 같은 값을 넣음)
 * 3. 위쪽 함수 선택에서 authorize 를 고르고 [실행] → 권한 허용
 * 4. [배포] → [새 배포] → 유형: 웹 앱
 *      실행 사용자: 나 / 액세스 권한이 있는 사용자: 모든 사용자
 *    → 배포 → 웹 앱 URL(…/exec) 복사
 * 5. 대시보드 설정 → 구글 캘린더 → "Apps Script 웹 앱 주소"와 "비밀 키" 입력 → 연결 확인
 *
 * 코드를 바꾼 뒤에는 [배포] → [배포 관리] → 수정(연필) → 버전: 새 버전 → 배포
 * 이 스크립트는 내 계정의 캘린더만 다루며, KEY가 맞는 요청에만 답합니다.
 * 할 수 있는 일: 캘린더 목록, 일정 읽기, 일정 만들기·고치기·지우기 (반복 일정은 이 날만 또는 전체),
 *               일정 설명(메모) 읽기·쓰기, 내 드라이브의 dashboard-data.json 읽기·쓰기 (아이폰 등 폴더 저장이 안 되는 기기용)
 * 버전 4부터 드라이브 권한이 추가되었습니다. 코드를 바꾼 뒤 authorize를 한 번 더 실행해 권한을 허용하세요.
 * 버전 15: 대시보드가 웹페이지(학사일정 등)를 읽어 올 수 있게 webGet — 브라우저는 다른 사이트를 직접 못 읽어서 스크립트가 대신 가져옴
 *          ai에 search: true면 Gemini가 구글 검색으로 찾아봄 (웹페이지 주소 찾기)
 * 버전 14: 아이폰에서 Scriptable이 Gemini에 대신 물어보는 작업함 (aiPut / aiGet / aiDone / aiResult)
 * 버전 13: Gemini API로 그림(캡처)도 함께 보냄 (ai: images)
 * 버전 12: 대시보드에서 "Thunderbird로 답장"을 누르면 Thunderbird 애드온이 원본을 인용한 답장 창을 엽니다 (replyPut / replyTake)
 * 버전 11: 대시보드가 가져간 전달 메일은 지메일에서 지우기(gdel=trash 휴지통 / perm 영구삭제, 영구삭제는 서비스에 Gmail API 추가 필요)
 * 버전 11: 아무 메일 앱에서나 '내아이디+dash@gmail.com'으로 전달하면 대시보드로 (지메일 확인, 5분마다 + 대시보드가 열려 있으면 바로)
 * 버전 10: Gemini 자동 분석 (aiKey로 Gemini API 키를 스크립트 속성에 보관, ai로 질문) — 키는 대시보드·데이터 파일에 남지 않습니다
 * 버전 9: 브라우저가 못 읽는 첨부(doc·ppt·rtf 등)를 구글 드라이브로 PDF 변환해 같이 넣기 (서비스에 Drive API 추가 필요)
 * 버전 8: Thunderbird '대시보드로 보내기' 메일 받기 (mailPut → inbox 폴더, inboxList/inboxGet/inboxDone)
 * 버전 7: 휴대폰이 PC와 같은 데이터 파일을 쓰도록 맞추기 (dataFiles, dataUse)
 * 버전 6: 반복 일정 전체의 시간을 바꾸려면 왼쪽 [서비스] + → Google Calendar API 추가 (apps-script/appsscript.json 참고)
 */
const KEY = 'CHANGE_ME';

function authorize() {
  CalendarApp.getDefaultCalendar().getName();
  DriveApp.getRootFolder().getName();
  UrlFetchApp.fetch('https://generativelanguage.googleapis.com/', { muteHttpExceptions: true });
  GmailApp.getUserLabelByName(DONE_LABEL);
  // check the forwarding address every 5 minutes (one trigger only)
  if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'gmailPoll'; }))
    ScriptApp.newTrigger('gmailPoll').timeBased().everyMinutes(5).create();
  Logger.log('전달 주소: ' + dashAddress());
  Logger.log('권한 확인 완료: ' + Session.getEffectiveUser().getEmail());
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!KEY || KEY === 'CHANGE_ME') return out({ ok: false, error: 'nokey', message: '스크립트의 KEY를 바꿔 주세요.' });
  if (p.key !== KEY) return out({ ok: false, error: 'key' });
  try {
    switch (p.action) {
      case 'ping': return out({ ok: true, email: Session.getEffectiveUser().getEmail(), tz: Session.getScriptTimeZone(), version: 15, forward: dashAddress(), gemini: !!PropertiesService.getScriptProperties().getProperty('GEMINI_KEY'), advanced: typeof Calendar !== 'undefined' });
      case 'dataGet': return out(Object.assign({ ok: true }, dataGet(p)));
      case 'dataFiles': return out({ ok: true, current: PropertiesService.getScriptProperties().getProperty('DATA_FILE_ID') || '', files: dataFiles() });
      case 'dataUse': return out(Object.assign({ ok: true }, dataUse(p)));
      case 'inboxList': return out({ ok: true, items: inboxList() });
      case 'inboxGet': return out({ ok: true, mail: inboxGet(p.id) });
      case 'inboxDone': return out({ ok: true, done: inboxDone(p.id, p.gdel) });
      case 'replyTake': return out({ ok: true, items: replyTake() });
      case 'webGet': return out(Object.assign({ ok: true }, webGet(p.url)));
      case 'aiGet': return out(Object.assign({ ok: true }, aiJobGet(p.id)));
      case 'aiResult': return out(Object.assign({ ok: true }, aiJobResult(p.id)));
      case 'calendars': return out({ ok: true, calendars: listCalendars() });
      case 'events': return out({ ok: true, events: listEvents(p.cal, p.from, p.to) });
      case 'create': return out({ ok: true, event: createEvent(p) });
      case 'update': return out({ ok: true, event: updateEvent(p) });
      case 'delete': return out({ ok: true, deleted: deleteEvent(p) });
      default: return out({ ok: false, error: 'action', message: '스크립트가 오래된 버전입니다. 새 코드로 다시 배포해 주세요.' });
    }
  } catch (err) {
    return out({ ok: false, error: 'script', message: String((err && err.message) || err) });
  }
}

function doPost(e) {
  let b = {};
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return out({ ok: false, error: 'body' }); }
  if (!KEY || KEY === 'CHANGE_ME') return out({ ok: false, error: 'nokey' });
  if (b.key !== KEY) return out({ ok: false, error: 'key' });
  try {
    if (b.action === 'dataPut') return out(Object.assign({ ok: true }, dataPut(b)));
    if (b.action === 'mailPut') return out(Object.assign({ ok: true }, mailPut(b.mail)));
    if (b.action === 'aiKey') return out(Object.assign({ ok: true }, aiKey(b)));
    if (b.action === 'ai') return out(Object.assign({ ok: true }, aiAsk(b)));
    if (b.action === 'replyPut') return out(Object.assign({ ok: true }, replyPut(b)));
    if (b.action === 'aiPut') return out(Object.assign({ ok: true }, aiJobPut(b)));
    if (b.action === 'aiDone') return out(Object.assign({ ok: true }, aiJobDone(b)));
    return out({ ok: false, error: 'action' });
  } catch (err) {
    return out({ ok: false, error: 'script', message: String((err && err.message) || err) });
  }
}

/* ---------- Gemini: the API key lives only in this script's properties ---------- */
const GEM = 'https://generativelanguage.googleapis.com/v1beta/';
function gemFetch(path, payload) {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_KEY');
  if (!key) throw new Error('Gemini API 키가 아직 없습니다. 대시보드 설정에서 넣어 주세요.');
  const r = UrlFetchApp.fetch(GEM + path, payload ? { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true, headers: { 'x-goog-api-key': key } } : { muteHttpExceptions: true, headers: { 'x-goog-api-key': key } });
  const code = r.getResponseCode(); let j = {};
  try { j = JSON.parse(r.getContentText()); } catch (e) {}
  if (code >= 300) {
    const msg = (j.error && j.error.message) || ('응답 ' + code);
    throw new Error(code === 429 ? 'Gemini 사용 한도를 넘었습니다. 잠시 뒤 다시 하거나, 결제(유료 등급)를 연결해 주세요. (' + msg + ')' : code === 400 || code === 403 ? 'Gemini가 요청을 거절했습니다: ' + msg : msg);
  }
  return j;
}
// set or clear the key (from the dashboard settings), then list the models it can use
function aiKey(b) {
  const props = PropertiesService.getScriptProperties();
  if (b.clear) { props.deleteProperty('GEMINI_KEY'); return { set: false, models: [] }; }
  if (b.gemKey) props.setProperty('GEMINI_KEY', String(b.gemKey).trim());
  const j = gemFetch('models?pageSize=200');
  const models = (j.models || []).filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0 && /gemini/i.test(m.name) && !/embedding|image|tts|audio|live|vision/i.test(m.name); })
    .map(function (m) { return { id: m.name.replace(/^models\//, ''), name: m.displayName || m.name }; });
  return { set: true, models: models };
}
function aiAsk(b) {
  const model = String(b.model || 'gemini-2.5-flash').replace(/[^\w.\-]/g, '');
  const parts = [];
  (Array.isArray(b.images) ? b.images : []).slice(0, 6).forEach(function (im) { if (im && im.b64) parts.push({ inline_data: { mime_type: String(im.mime || 'image/jpeg'), data: String(im.b64) } }); });
  parts.push({ text: String(b.prompt || '') });
  const body = { contents: [{ role: 'user', parts: parts }], generationConfig: { temperature: 0.3 } };
  // search: let Gemini look things up on Google (JSON mode cannot be used together with search)
  if (b.search) body.tools = [{ google_search: {} }];
  else if (b.json) body.generationConfig.responseMimeType = 'application/json';
  const j = gemFetch('models/' + model + ':generateContent', body);
  const c = (j.candidates || [])[0];
  const text = c && c.content && (c.content.parts || []).map(function (p) { return p.text || ''; }).join('');
  if (!text) throw new Error('Gemini가 답을 주지 않았습니다' + (c && c.finishReason ? ' (' + c.finishReason + ')' : (j.promptFeedback && j.promptFeedback.blockReason ? ' (' + j.promptFeedback.blockReason + ')' : '')) + '.');
  return { text: text, model: model, usage: j.usageMetadata || null };
}

/* ---------- dashboard data file in My Drive (same file the PC folder uses) ---------- */
const DATA_NAME = 'dashboard-data.json';
const DATA_FOLDER = '학과장실 대시보드';
function dataFile(create) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('DATA_FILE_ID');
  if (id) { try { const f = DriveApp.getFileById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  let best = null;
  const it = DriveApp.getFilesByName(DATA_NAME);
  while (it.hasNext()) { const f = it.next(); if (!f.isTrashed() && (!best || f.getLastUpdated() > best.getLastUpdated())) best = f; }
  if (!best && create) {
    const fit = DriveApp.getFoldersByName(DATA_FOLDER);
    const folder = fit.hasNext() ? fit.next() : DriveApp.createFolder(DATA_FOLDER);
    best = folder.createFile(DATA_NAME, '{}', 'application/json');
  }
  if (best) props.setProperty('DATA_FILE_ID', best.getId());
  return best;
}
function whereOf(f) {
  try { const p = f.getParents(); return (p.hasNext() ? p.next().getName() + '/' : '') + f.getName(); } catch (e) { return f.getName(); }
}
// every dashboard-data.json in My Drive (name, folder, time, size — not the contents)
function dataFiles() {
  const list = [], it = DriveApp.getFilesByName(DATA_NAME);
  while (it.hasNext() && list.length < 20) { const f = it.next(); if (!f.isTrashed()) list.push({ id: f.getId(), where: whereOf(f), modified: f.getLastUpdated().getTime(), size: f.getSize() }); }
  return list;
}
// use the same file as the PC: by id, or the newest one inside a folder with this name
function dataUse(p) {
  let f = null;
  if (p.id) { f = DriveApp.getFileById(p.id); if (f.getName() !== DATA_NAME || f.isTrashed()) throw new Error('대시보드 데이터 파일이 아닙니다.'); }
  else if (p.folder) {
    const it = DriveApp.getFilesByName(DATA_NAME);
    while (it.hasNext()) { const g = it.next(); if (g.isTrashed()) continue; const ps = g.getParents(); const inIt = ps.hasNext() && ps.next().getName() === p.folder; if (inIt && (!f || g.getLastUpdated() > f.getLastUpdated())) f = g; }
    if (!f) throw new Error('드라이브에서 "' + p.folder + '" 폴더의 ' + DATA_NAME + '을 찾지 못했습니다.');
  } else throw new Error('파일을 지정해 주세요.');
  PropertiesService.getScriptProperties().setProperty('DATA_FILE_ID', f.getId());
  return { where: whereOf(f), modified: f.getLastUpdated().getTime() };
}
/* ---------- mail sent from Thunderbird: one JSON file per mail in <data folder>/inbox, moved to inbox/done once the dashboard took it ---------- */
function inboxFolder(sub) {
  const f = dataFile(true);
  const ps = f.getParents();
  const base = ps.hasNext() ? ps.next() : DriveApp.getRootFolder();
  const get = function (parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); };
  const inbox = get(base, 'inbox');
  return sub ? get(inbox, sub) : inbox;
}
// attachments the dashboard cannot read in a browser: let Google Drive convert them, then export as PDF
// (.hwp is not converted by Google Drive; the dashboard reads its text itself)
const PDF_CONVERT = { doc: 'doc', rtf: 'doc', odt: 'doc', wpd: 'doc', ppt: 'slide', pps: 'slide', odp: 'slide' };
function toPdf(a) {
  const ext = (String(a.name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1];
  const kind = PDF_CONVERT[ext];
  if (!kind || !a.b64) return null;
  if (typeof Drive === 'undefined') throw new Error('스크립트 서비스에 Drive API가 없습니다.');
  const blob = Utilities.newBlob(Utilities.base64Decode(a.b64), a.type || 'application/octet-stream', a.name);
  const target = kind === 'slide' ? MimeType.GOOGLE_SLIDES : MimeType.GOOGLE_DOCS;
  const f = Drive.Files.create ? Drive.Files.create({ name: '(변환 중) ' + a.name, mimeType: target }, blob)
    : Drive.Files.insert({ title: '(변환 중) ' + a.name, mimeType: target }, blob, { convert: true });
  try {
    const pdf = DriveApp.getFileById(f.id).getAs(MimeType.PDF);
    const bytes = pdf.getBytes();
    return { name: String(a.name).replace(/\.[^.]+$/, '') + '.pdf', type: 'application/pdf', size: bytes.length, b64: Utilities.base64Encode(bytes), convertedFrom: a.name };
  } finally { try { DriveApp.getFileById(f.id).setTrashed(true); } catch (e) {} }
}
function mailPut(m) {
  if (!m || typeof m !== 'object') throw new Error('메일 내용이 없습니다.');
  const folder = inboxFolder();
  const conv = [], convErr = [];
  const atts = m.attachments || [];
  for (let i = 0; i < atts.length; i++) {
    try { const p = toPdf(atts[i]); if (p) { atts.splice(i + 1, 0, p); i++; conv.push(atts[i - 1].name); } }
    catch (e) { atts[i].convertError = String((e && e.message) || e); convErr.push(atts[i].name); }
  }
  if (m.msgId) {
    const it = folder.getFiles();
    while (it.hasNext()) { const g = it.next(); try { if (JSON.parse(g.getDescription() || '{}').msgId === m.msgId) return { id: g.getId(), dup: true }; } catch (e) {} }
  }
  const name = 'mail-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '-' + Math.random().toString(36).slice(2, 6) + '.json';
  const f = folder.createFile(name, JSON.stringify(m), 'application/json');
  f.setDescription(JSON.stringify({ msgId: m.msgId || '', subject: String(m.subject || '').slice(0, 200), from: String(m.from || '').slice(0, 200), atts: (m.attachments || []).length }));
  return { id: f.getId(), converted: conv, convertFailed: convErr };
}
function inboxList() {
  // the dashboard asks every 45 s: look at Gmail too, at most once a minute
  try { const c = CacheService.getScriptCache(); if (!c.get('gmailPolled')) { c.put('gmailPolled', '1', 60); gmailPoll(); } } catch (e) {}
  const it = inboxFolder().getFiles(), list = [];
  while (it.hasNext() && list.length < 50) {
    const f = it.next(); if (f.isTrashed() || !/\.json$/.test(f.getName())) continue;
    let d = {}; try { d = JSON.parse(f.getDescription() || '{}'); } catch (e) {}
    list.push({ id: f.getId(), at: f.getDateCreated().getTime(), size: f.getSize(), msgId: d.msgId || '', subject: d.subject || '', from: d.from || '', atts: d.atts || 0 });
  }
  return list.sort(function (a, b) { return a.at - b.at; });
}
/* ---------- AI jobs: the iPhone dashboard leaves a question here, Scriptable on the iPhone asks Gemini and leaves the answer ---------- */
function aiJobFolder() { return inboxFolder('ai'); }
function aiJobClean(folder) {
  const it = folder.getFiles(), old = Date.now() - 24 * 3600 * 1000;
  while (it.hasNext()) { const f = it.next(); if (f.getDateCreated().getTime() < old) f.setTrashed(true); }
}
function aiJobFile(folder, name) { const it = folder.getFilesByName(name); return it.hasNext() ? it.next() : null; }
function aiJobPut(b) {
  const folder = aiJobFolder(); aiJobClean(folder);
  const id = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  const job = { id: id, at: Date.now(), title: String(b.title || '').slice(0, 200), prompt: String(b.prompt || ''), json: !!b.json, images: Array.isArray(b.images) ? b.images.slice(0, 6) : [] };
  folder.createFile('job_' + id + '.json', JSON.stringify(job), 'application/json');
  return { id: id };
}
function aiJobGet(id) {
  const f = aiJobFile(aiJobFolder(), 'job_' + String(id || '').replace(/[^\w]/g, '') + '.json');
  if (!f) throw new Error('작업을 찾지 못했습니다 (이미 처리했거나 하루가 지났습니다).');
  return { job: JSON.parse(f.getBlob().getDataAsString('UTF-8')) };
}
function aiJobDone(b) {
  const id = String(b.id || '').replace(/[^\w]/g, ''), folder = aiJobFolder();
  const res = { id: id, at: Date.now(), text: b.text == null ? null : String(b.text), error: b.error ? String(b.error) : null, message: b.message ? String(b.message) : null };
  const old = aiJobFile(folder, 'res_' + id + '.json'); if (old) old.setTrashed(true);
  folder.createFile('res_' + id + '.json', JSON.stringify(res), 'application/json');
  const job = aiJobFile(folder, 'job_' + id + '.json'); if (job) job.setTrashed(true);
  return { saved: true };
}
function aiJobResult(id) {
  id = String(id || '').replace(/[^\w]/g, '');
  const f = aiJobFile(aiJobFolder(), 'res_' + id + '.json');
  if (!f) return { done: false };
  const r = JSON.parse(f.getBlob().getDataAsString('UTF-8')); f.setTrashed(true);
  return { done: true, text: r.text, error: r.error, message: r.message };
}

/* ---------- a web page as plain text (tables kept as rows) for the dashboard ---------- */
function webGet(url) {
  url = String(url || '').trim();
  if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new Error('주소가 올바르지 않습니다.');
  if (/^https?:\/\/(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(url)) throw new Error('이 주소는 읽을 수 없습니다.');
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0 (dashboard)' } });
  const code = r.getResponseCode();
  if (code >= 400) throw new Error('페이지를 열지 못했습니다 (응답 ' + code + ').');
  const type = String(r.getHeaders()['Content-Type'] || r.getHeaders()['content-type'] || '');
  if (/pdf/i.test(type)) return { url: url, type: 'pdf', b64: Utilities.base64Encode(r.getContent()).slice(0, 14000000) };
  let html = r.getContentText('UTF-8');
  if (/charset=(euc-kr|ks_c_5601|cp949)/i.test(type + html.slice(0, 2000))) html = r.getContentText('EUC-KR');
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  let t = html.replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(td|th)>/gi, ' | ').replace(/<(br|\/tr|\/p|\/li|\/h\d|\/div|\/dt|\/dd)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const links = [];
  html.replace(/<a[^>]+href="([^"#][^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, function (m, h, txt) { txt = txt.replace(/<[^>]+>/g, '').trim(); if (txt && /학사|일정|calendar|schedule|\.pdf/i.test(txt + h) && links.length < 40) links.push({ text: txt.slice(0, 80), href: h }); return m; });
  return { url: url, type: 'html', title: title.replace(/\s+/g, ' ').trim(), text: t.slice(0, 80000), links: links };
}

/* ---------- replies the dashboard asks Thunderbird to open (kept 15 minutes in the script cache) ---------- */
function replyQueue(fn) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const c = CacheService.getScriptCache();
    let q = []; try { q = JSON.parse(c.get('REPLYQ') || '[]'); } catch (e) {}
    q = q.filter(function (x) { return Date.now() - x.at < 15 * 60 * 1000; });
    const r = fn(q);
    if (r.q.length) c.put('REPLYQ', JSON.stringify(r.q), 900); else c.remove('REPLYQ');
    return r.out;
  } finally { lock.releaseLock(); }
}
function replyPut(b) {
  return replyQueue(function (q) {
    q.push({ id: Utilities.getUuid(), at: Date.now(), msgId: String(b.msgId || '').slice(0, 300), text: String(b.text || '').slice(0, 20000), subject: String(b.subject || '').slice(0, 300), from: String(b.from || '').slice(0, 300), date: String(b.date || '').slice(0, 40) });
    return { q: q.slice(-10), out: { queued: true } };
  });
}
function replyTake() { return replyQueue(function (q) { return { q: [], out: q }; }); }

/* ---------- mail forwarded from any app to <me>+dash@gmail.com ---------- */
const DONE_LABEL = '대시보드/처리됨';
function dashAddress() { const e = Session.getEffectiveUser().getEmail() || ''; return e.replace(/@/, '+dash@'); }
// the original sender and date inside a forwarded message (Apple Mail, Gmail, Outlook, Naver … in Korean or English)
function forwardedHeader(body) {
  const b = String(body || '');
  const mark = b.search(/(Begin forwarded message|Forwarded message|전달된 메시지|전달된 메일|원본 메일|원본 메시지|Original Message)/i);
  const part = mark >= 0 ? b.slice(mark) : b;
  const pick = re => { const m = part.match(re); return m ? m[1].trim() : ''; };
  return {
    from: pick(/^\s*(?:From|보낸\s*사람|보낸사람|발신자?)\s*[:：]\s*(.+)$/im),
    date: pick(/^\s*(?:Date|Sent|날짜|보낸\s*날짜|발송일|보낸 시간)\s*[:：]\s*(.+)$/im),
    subject: pick(/^\s*(?:Subject|제목)\s*[:：]\s*(.+)$/im)
  };
}
function gmailPoll() {
  const addr = dashAddress(); if (!addr) return 0;
  const label = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
  const threads = GmailApp.search('to:' + addr + ' -label:' + DONE_LABEL.replace('/', '-') + ' newer_than:30d', 0, 20);
  let n = 0;
  threads.forEach(function (th) {
    th.getMessages().forEach(function (msg) {
      if ((msg.getTo() + ' ' + msg.getCc()).toLowerCase().indexOf(addr.toLowerCase()) < 0) return;
      const body = msg.getPlainBody() || '';
      const fw = forwardedHeader(body);
      const atts = []; let total = 0;
      msg.getAttachments({ includeInlineImages: false }).forEach(function (a) {
        const size = a.getSize(), item = { name: a.getName(), type: a.getContentType(), size: size };
        if (total + size <= 20 * 1024 * 1024) { item.b64 = Utilities.base64Encode(a.getBytes()); total += size; } else item.skipped = '용량이 커서 이름만 보냄';
        atts.push(item);
      });
      mailPut({
        source: 'gmail',
        gmailId: msg.getId(),
        msgId: (msg.getHeader('Message-ID') || '') || ('gmail:' + msg.getId()),
        subject: (fw.subject || msg.getSubject() || '').replace(/^\s*((fwd?|fw|전달|re)\s*:\s*)+/i, ''),
        from: fw.from || msg.getFrom(),
        forwardedBy: msg.getFrom(),
        date: fw.date || msg.getDate().toISOString(),
        to: msg.getTo(),
        body: body,
        attachments: atts,
        sentAt: new Date().toISOString()
      });
      n++;
    });
    th.addLabel(label);
  });
  return n;
}
function inboxGet(id) {
  const f = DriveApp.getFileById(id);
  return JSON.parse(f.getBlob().getDataAsString('UTF-8'));
}
function inboxDone(id, gdel) {
  const f = DriveApp.getFileById(id);
  f.moveTo(inboxFolder('done'));
  // the full mail is kept in inbox/done, so the forwarded copy in Gmail can go
  if (gdel === 'trash' || gdel === 'perm') {
    let gid = ''; try { gid = JSON.parse(f.getBlob().getDataAsString('UTF-8')).gmailId || ''; } catch (e) {}
    if (gid) {
      try {
        if (gdel === 'perm' && typeof Gmail !== 'undefined') Gmail.Users.Messages.remove('me', gid);
        else GmailApp.getMessageById(gid).moveToTrash();
        return gdel === 'perm' && typeof Gmail !== 'undefined' ? 'deleted' : 'trashed';
      } catch (e) { return 'kept: ' + ((e && e.message) || e); }
    }
  }
  return true;
}

function dataGet(p) {
  const f = dataFile(false);
  if (!f) return { exists: false, modified: 0 };
  const m = f.getLastUpdated().getTime();
  if (p.since && Number(p.since) === m) return { exists: true, same: true, modified: m, where: whereOf(f) };
  return { exists: true, modified: m, where: whereOf(f), data: f.getBlob().getDataAsString('UTF-8') };
}
function dataPut(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const f = dataFile(true);
    f.setContent(String(b.data || '{}'));
    const g = DriveApp.getFileById(f.getId());
    return { modified: g.getLastUpdated().getTime(), where: whereOf(g) };
  } finally { lock.releaseLock(); }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function calById(id) {
  const c = (!id || id === 'primary') ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
  if (!c) throw new Error('캘린더를 찾을 수 없습니다: ' + id);
  return c;
}

function listCalendars() {
  const def = CalendarApp.getDefaultCalendar().getId();
  return CalendarApp.getAllCalendars().filter(function (c) { return !c.isHidden(); }).map(function (c) {
    return { id: c.getId(), name: c.getName(), color: c.getColor(), primary: c.getId() === def, write: c.isOwnedByMe() };
  });
}

function toDate(ymd, hm) {
  const d = String(ymd).split('-').map(Number);
  let h = 0, mi = 0;
  if (hm) { const t = String(hm).split(':').map(Number); h = t[0]; mi = t[1]; }
  return new Date(d[0], d[1] - 1, d[2], h, mi);
}

function fmt(d, f) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), f);
}

function timeRange(p) {
  const st = toDate(p.date, p.time);
  let en = p.endTime ? toDate(p.date, p.endTime) : null;
  if (!en || en <= st) en = new Date(st.getTime() + 3600000);
  return [st, en];
}

function weeklyRule(daysText, until) {
  const W = [CalendarApp.Weekday.SUNDAY, CalendarApp.Weekday.MONDAY, CalendarApp.Weekday.TUESDAY, CalendarApp.Weekday.WEDNESDAY, CalendarApp.Weekday.THURSDAY, CalendarApp.Weekday.FRIDAY, CalendarApp.Weekday.SATURDAY];
  const days = String(daysText).split(',').map(Number).filter(function (n) { return n >= 0 && n <= 6; }).map(function (n) { return W[n]; });
  let rule = CalendarApp.newRecurrence().addWeeklyRule().onlyOnWeekdays(days);
  if (until) { const u = toDate(until); u.setDate(u.getDate() + 1); rule = rule.until(u); }
  return rule;
}

function listEvents(cal, from, to) {
  const c = calById(cal);
  return c.getEvents(toDate(from), toDate(to)).slice(0, 600).map(function (ev) {
    const o = { id: ev.getId(), summary: ev.getTitle(), location: ev.getLocation(), description: ev.getDescription() || '', updated: ev.getLastUpdated().getTime() };
    if (ev.isAllDayEvent()) {
      o.start = { date: fmt(ev.getAllDayStartDate(), 'yyyy-MM-dd') };
      o.end = { date: fmt(ev.getAllDayEndDate(), 'yyyy-MM-dd') };
    } else {
      o.start = { dateTime: fmt(ev.getStartTime(), "yyyy-MM-dd'T'HH:mm:ssXXX") };
      o.end = { dateTime: fmt(ev.getEndTime(), "yyyy-MM-dd'T'HH:mm:ssXXX") };
    }
    try { if (ev.getTransparency() === CalendarApp.EventTransparency.TRANSPARENT) o.transparency = 'transparent'; } catch (e) {}
    try { if (ev.isRecurringEvent()) o.recurring = true; } catch (e) {}
    return o;
  });
}

function createEvent(p) {
  if (!p.title || !p.date) throw new Error('제목과 날짜가 필요합니다.');
  const c = calById(p.cal);
  const opt = {};
  if (p.location) opt.location = p.location;
  if (p.description) opt.description = p.description;
  if (p.days) {
    const rule = weeklyRule(p.days, p.until);
    if (p.time) {
      const r = timeRange(p);
      return { id: c.createEventSeries(p.title, r[0], r[1], rule, opt).getId(), series: true };
    }
    return { id: c.createAllDayEventSeries(p.title, toDate(p.date), rule, opt).getId(), series: true };
  }
  let ev;
  if (p.time) {
    const r = timeRange(p);
    ev = c.createEvent(p.title, r[0], r[1], opt);
  } else if (p.endDate && p.endDate > p.date) {
    const end = toDate(p.endDate); end.setDate(end.getDate() + 1);
    ev = c.createAllDayEvent(p.title, toDate(p.date), end, opt);
  } else {
    ev = c.createAllDayEvent(p.title, toDate(p.date), opt);
  }
  return { id: ev.getId() };
}

// one occurrence of a repeating event: same id on every day, so find it by its original day and start time
function findInstance(c, p) {
  if (!p.od) return null;
  const a = toDate(p.od), b = new Date(a.getTime() + 86400000);
  const list = c.getEvents(a, b).filter(function (ev) { return ev.getId() === p.id; });
  if (!list.length) return null;
  if (p.ost) { const m = list.filter(function (ev) { return !ev.isAllDayEvent() && fmt(ev.getStartTime(), 'HH:mm') === p.ost; }); if (m.length) return m[0]; }
  return list[0];
}

function setOne(ev, p) {
  if (p.description !== undefined) ev.setDescription(String(p.description));
  if (p.descOnly) return;
  if (p.title) ev.setTitle(p.title);
  if (p.location !== undefined) ev.setLocation(p.location || '');
  if (p.titleOnly) return;
  if (p.time) { const r = timeRange(p); ev.setTime(r[0], r[1]); }
  else if (p.endDate && p.endDate > p.date) {
    const end = toDate(p.endDate); end.setDate(end.getDate() + 1);
    ev.setAllDayDates(toDate(p.date), end);
  } else if (p.date) ev.setAllDayDate(toDate(p.date));
}

// every occurrence: title/place/memo through the series; a new time through the Calendar advanced service
function setAll(c, ev, p) {
  const s = ev.getEventSeries();
  if (p.description !== undefined) s.setDescription(String(p.description));
  if (p.descOnly) return;
  if (p.title) s.setTitle(p.title);
  if (p.location !== undefined) s.setLocation(p.location || '');
  if (p.titleOnly) return;
  if (p.date && p.od && p.date !== p.od) throw new Error('반복 일정 전체의 날짜(요일)는 구글 캘린더에서 바꿔 주세요. "이 날만" 옮기는 것은 됩니다.');
  const wasAll = ev.isAllDayEvent();
  if (wasAll !== !p.time) throw new Error('반복 일정 전체를 종일 ↔ 시간 일정으로 바꾸는 것은 구글 캘린더에서 해 주세요.');
  if (wasAll) return;
  if (fmt(ev.getStartTime(), 'HH:mm') === p.time && fmt(ev.getEndTime(), 'HH:mm') === (p.endTime || '')) return;
  if (typeof Calendar === 'undefined') throw new Error('반복 일정 전체의 시간을 바꾸려면 스크립트에 Calendar 고급 서비스가 켜져 있어야 합니다.');
  const calId = c.getId();
  const found = Calendar.Events.list(calId, { iCalUID: ev.getId(), maxResults: 5 }).items || [];
  const m = found.filter(function (x) { return !x.recurringEventId; })[0] || found[0];
  if (!m || !m.start || !m.start.dateTime) throw new Error('반복 일정의 원본을 찾지 못했습니다.');
  const tz = m.start.timeZone || Session.getScriptTimeZone();
  const day = Utilities.formatDate(new Date(m.start.dateTime), tz, 'yyyy-MM-dd');
  let en = p.endTime; if (!en || en <= p.time) { const t = p.time.split(':').map(Number); const e = Math.min(t[0] * 60 + t[1] + 60, 1439); en = ('0' + Math.floor(e / 60)).slice(-2) + ':' + ('0' + e % 60).slice(-2); }
  Calendar.Events.patch({ start: { dateTime: day + 'T' + p.time + ':00', timeZone: tz }, end: { dateTime: day + 'T' + en + ':00', timeZone: tz } }, calId, m.id);
}

function deleteEvent(p) {
  const c = calById(p.cal);
  if (p.scope === 'one' || p.scope === 'all') {
    const ev = findInstance(c, p);
    if (!ev) throw new Error('구글 캘린더에서 일정을 찾을 수 없습니다. 이미 지워졌을 수 있습니다.');
    if (p.scope === 'all') { ev.getEventSeries().deleteEventSeries(); return 'all'; }
    ev.deleteEvent(); return 'one';
  }
  if (p.series) { const s = c.getEventSeriesById(p.id); if (!s) throw new Error('반복 일정을 찾을 수 없습니다.'); s.deleteEventSeries(); return 'all'; }
  const ev = c.getEventById(p.id);
  if (!ev) throw new Error('구글 캘린더에서 일정을 찾을 수 없습니다. 이미 지워졌을 수 있습니다.');
  ev.deleteEvent(); return 'one';
}

function updateEvent(p) {
  const c = calById(p.cal);
  if (p.scope === 'one' || p.scope === 'all') {
    const ev = findInstance(c, p);
    if (!ev) throw new Error('구글 캘린더에서 일정을 찾을 수 없습니다.');
    if (p.scope === 'all') setAll(c, ev, p); else setOne(ev, p);
    return { id: ev.getId() };
  }
  if (p.days || p.series) {
    const s = c.getEventSeriesById(p.id);
    if (!s) throw new Error('반복 일정을 찾을 수 없습니다.');
    if (p.description !== undefined) s.setDescription(String(p.description));
    if (p.descOnly) return { id: s.getId() };
    if (p.title) s.setTitle(p.title);
    s.setLocation(p.location || '');
    const rule = weeklyRule(p.days, p.until);
    if (p.time) { const r = timeRange(p); s.setRecurrence(rule, r[0], r[1]); }
    else s.setRecurrence(rule, toDate(p.date));
    return { id: s.getId() };
  }
  const ev = c.getEventById(p.id);
  if (!ev) throw new Error('구글 캘린더에서 일정을 찾을 수 없습니다.');
  if (p.description !== undefined) ev.setDescription(String(p.description));
  if (p.descOnly) return { id: ev.getId() };
  if (p.title) ev.setTitle(p.title);
  ev.setLocation(p.location || '');
  if (p.titleOnly) return { id: ev.getId() };
  if (p.time) { const r = timeRange(p); ev.setTime(r[0], r[1]); }
  else if (p.endDate && p.endDate > p.date) {
    const end = toDate(p.endDate); end.setDate(end.getDate() + 1);
    ev.setAllDayDates(toDate(p.date), end);
  } else ev.setAllDayDate(toDate(p.date));
  return { id: ev.getId() };
}
