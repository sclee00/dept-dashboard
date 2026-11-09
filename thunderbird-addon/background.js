/* 업무 대시보드로 보내기 — selected mail (text + attachments) → Apps Script → Google Drive inbox → dashboard */
const MAX_TOTAL = 20 * 1024 * 1024; // attachments over this are listed by name only

async function settings() {
  const s = await browser.storage.local.get(['gasUrl', 'gasKey']);
  return s.gasUrl && s.gasKey ? s : null;
}

function notify(title, message) {
  return browser.notifications.create({ type: 'basic', iconUrl: 'icons/send.svg', title, message: String(message || '').slice(0, 300) });
}

// text of the message: plain part first, else HTML turned into text
function bodyText(part) {
  let plain = '', html = '';
  (function walk(p) {
    if (!p) return;
    const ct = (p.contentType || '').toLowerCase();
    const isAtt = /attachment/i.test((p.headers && p.headers['content-disposition'] || [''])[0] || '');
    if (!isAtt && ct === 'text/plain' && p.body && !plain) plain = p.body;
    if (!isAtt && ct === 'text/html' && p.body && !html) html = p.body;
    (p.parts || []).forEach(walk);
  })(part);
  if (plain) return plain;
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style').forEach(n => n.remove());
  doc.querySelectorAll('br').forEach(n => n.replaceWith('\n'));
  doc.querySelectorAll('p,div,tr,li,h1,h2,h3,h4,blockquote').forEach(n => n.append('\n'));
  return (doc.body ? doc.body.textContent : '').replace(/\n{3,}/g, '\n\n').trim();
}

function toB64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

async function packMessage(msg) {
  const full = await browser.messages.getFull(msg.id);
  const atts = [];
  let total = 0;
  let list = [];
  try { list = await browser.messages.listAttachments(msg.id); } catch (e) { list = []; }
  for (const a of list) {
    const item = { name: a.name || 'file', type: a.contentType || '', size: a.size || 0 };
    if (total + (a.size || 0) <= MAX_TOTAL) {
      try { const f = await browser.messages.getAttachmentFile(msg.id, a.partName); item.b64 = await toB64(f); item.size = f.size; total += f.size; }
      catch (e) { item.skipped = '읽지 못함'; }
    } else item.skipped = '용량이 커서 이름만 보냄';
    atts.push(item);
  }
  const h = full.headers || {};
  return {
    source: 'thunderbird',
    msgId: msg.headerMessageId || (h['message-id'] || [''])[0] || '',
    subject: msg.subject || '',
    from: msg.author || '',
    to: (msg.recipients || []).join(', '),
    cc: (msg.ccList || []).join(', '),
    date: msg.date ? new Date(msg.date).toISOString() : '',
    folder: msg.folder ? msg.folder.name || '' : '',
    body: bodyText(full),
    attachments: atts,
    sentAt: new Date().toISOString()
  };
}

/* ---------- log of what was sent (shown in the add-on's settings page) ---------- */
const LOG_MAX = 300;
async function logAdd(items) {
  const { sendLog = [] } = await browser.storage.local.get('sendLog');
  const next = items.concat(sendLog).slice(0, LOG_MAX);
  await browser.storage.local.set({ sendLog: next });
  try { browser.runtime.sendMessage({ type: 'logChanged' }).catch(() => {}); } catch (e) {}
}

async function post(s, mail) {
  const r = await fetch(s.gasUrl, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key: s.gasKey, action: 'mailPut', mail }) });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!j || !j.ok) throw new Error(j && j.error === 'action' ? '스크립트를 버전 8 이상으로 다시 배포해야 합니다.' : j && j.error === 'key' ? '비밀 키가 다릅니다. 설정에서 연결 링크를 다시 넣어 주세요.' : (j && j.message) || '보내지 못했습니다 (응답 ' + r.status + ').');
  return j;
}

async function send(messages) {
  const s = await settings();
  if (!s) { notify('대시보드로 보내기', '먼저 연결 설정이 필요합니다. 설정 창이 열립니다.'); browser.runtime.openOptionsPage(); return; }
  if (!messages.length) { notify('대시보드로 보내기', '보낼 메일을 먼저 선택해 주세요.'); return; }
  let ok = 0, dup = 0; const fails = [], log = [];
  for (const m of messages.slice(0, 20)) {
    const base = { at: new Date().toISOString(), subject: m.subject || '(제목 없음)', from: m.author || '', date: m.date ? new Date(m.date).toISOString() : '', folder: m.folder ? m.folder.name || '' : '', msgId: m.headerMessageId || '' };
    try {
      const mail = await packMessage(m);
      const j = await post(s, mail);
      const att = mail.attachments || [];
      log.push({ ...base, result: j.dup ? 'dup' : 'ok', atts: att.length, attSkipped: att.filter(a => a.skipped).length, size: att.reduce((n, a) => n + (a.size || 0), 0), converted: (j.converted || []).length || 0 });
      if (j.dup) dup++; else ok++;
    } catch (e) {
      const msg = String((e && e.message) || e);
      fails.push((m.subject || '(제목 없음)') + ': ' + msg);
      log.push({ ...base, result: 'fail', error: msg.slice(0, 300) });
    }
  }
  if (messages.length > 20) log.push({ at: new Date().toISOString(), subject: `(한 번에 20통까지만 보냅니다 · ${messages.length - 20}통은 보내지 않음)`, result: 'fail', error: '20통 초과' });
  await logAdd(log.reverse());
  if (fails.length) notify('일부 메일을 보내지 못했습니다', fails.join('\n'));
  else notify('대시보드로 보냈습니다', (messages.length === 1 ? (messages[0].subject || '(제목 없음)') : `${ok}건`) + (dup ? ` · 이미 보낸 메일 ${dup}건` : '') + ' — 대시보드 이메일 처리 목록에 들어갑니다.');
}

async function selectedInTab(tab) {
  try {
    if (browser.mailTabs) { const l = await browser.mailTabs.getSelectedMessages(tab.id); if (l && l.messages && l.messages.length) return l.messages; }
  } catch (e) {}
  try {
    if (browser.messageDisplay.getDisplayedMessages) { const d = await browser.messageDisplay.getDisplayedMessages(tab.id); const arr = Array.isArray(d) ? d : (d && d.messages) || []; if (arr.length) return arr; }
    const one = await browser.messageDisplay.getDisplayedMessage(tab.id); if (one) return [one];
  } catch (e) {}
  return [];
}

browser.browserAction.onClicked.addListener(async tab => send(await selectedInTab(tab)));
browser.messageDisplayAction.onClicked.addListener(async tab => send(await selectedInTab(tab)));

browser.menus.create({ id: 'send-dash', title: '대시보드로 보내기', contexts: ['message_list'] });
for (const [id, ctx] of [['send-log', 'message_list'], ['send-log-ba', 'browser_action'], ['send-log-md', 'message_display_action']])
  try { browser.menus.create({ id, title: '대시보드로 보낸 기록 보기', contexts: [ctx] }); } catch (e) {}
browser.menus.onClicked.addListener(async (info, tab) => {
  if (String(info.menuItemId).startsWith('send-log')) { browser.runtime.openOptionsPage(); return; }
  if (info.menuItemId !== 'send-dash') return;
  const msgs = (info.selectedMessages && info.selectedMessages.messages) || [];
  send(msgs.length ? msgs : await selectedInTab(tab));
});

/* ---------- replies the dashboard asks for: open Thunderbird's own reply window (with the quoted original) and put the draft on top ---------- */
const escHtml = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const draftHtml = t => String(t).replace(/\r\n/g, '\n').split(/\n{2,}/).map(p => `<p>${escHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
// messages.query may answer page by page (newer Thunderbird): walk the pages until something turns up
async function queryAll(q, want) {
  let page; try { page = await browser.messages.query(q); } catch (e) { return []; }
  const out = [];
  for (let n = 0; page && n < 50; n++) {
    for (const m of page.messages || []) if (!want || want(m)) { out.push(m); if (want) return out; }
    if (!page.id || !browser.messages.continueList) break;
    try { page = await browser.messages.continueList(page.id); } catch (e) { break; }
  }
  return out;
}
const bare = id => String(id || '').trim().replace(/^<|>$/g, '');
async function findMessage(it) {
  const id = bare(it.msgId);
  if (id) {
    for (const v of [id, '<' + id + '>']) { const l = await queryAll({ headerMessageId: v }); if (l.length) return l[0]; }
    // older Thunderbird without headerMessageId search: look through the sender's recent mail
    const addr = (String(it.from || '').match(/[\w.+-]+@[\w.-]+/) || [''])[0];
    if (addr) { const l = await queryAll({ author: addr, fromDate: new Date(Date.now() - 120 * 864e5) }, m => bare(m.headerMessageId) === id); if (l.length) return l[0]; }
  }
  return null;
}
async function openReply(it) {
  const msg = await findMessage(it);
  if (!msg) throw new Error('Thunderbird에서 원본 메일을 찾지 못했습니다 (지워졌거나 다른 폴더·계정).');
  const tab = await browser.compose.beginReply(msg.id, 'replyToSender');
  if (it.text) await fillReply(tab, it.text);
  return msg;
}
async function fillReply(tab, text) {
  const it = { text };
  let d = null;
  for (let k = 0; k < 20 && !d; k++) { await new Promise(r => setTimeout(r, k ? 250 : 400)); try { d = await browser.compose.getComposeDetails(tab.id); } catch (e) { d = null; } }
  if (!d) throw new Error('답장 창은 열었지만 내용을 넣지 못했습니다. 대시보드에서 복사해 붙여넣어 주세요.');
  if (d.isPlainText) await browser.compose.setComposeDetails(tab.id, { plainTextBody: it.text + '\n\n' + (d.plainTextBody || '') });
  else {
    const body = d.body || '', mm = body.match(/<body[^>]*>/i), ins = draftHtml(it.text) + '<br>';
    await browser.compose.setComposeDetails(tab.id, { body: mm ? body.replace(mm[0], mm[0] + ins) : ins + body });
  }
}
let replyBusy = false;
async function replyPoll() {
  if (replyBusy) return; replyBusy = true;
  try {
    const s = await settings(); if (!s) return;
    let j = null, err = '';
    try { const r = await fetch(s.gasUrl + '?action=replyTake&key=' + encodeURIComponent(s.gasKey) + '&t=' + Date.now(), { redirect: 'follow', cache: 'no-store' }); j = await r.json(); }
    catch (e) { err = String((e && e.message) || e); }
    if (j && !j.ok) err = j.error === 'action' ? '스크립트가 버전 12보다 오래됐습니다' : j.error === 'key' ? '비밀 키가 다릅니다' : (j.message || '응답 오류');
    await browser.storage.local.set({ replyPollAt: Date.now(), replyPollErr: err });
    if (!j || !j.ok || !(j.items || []).length) return;
    const log = [];
    for (const it of j.items) {
      const base = { at: new Date().toISOString(), kind: 'reply', subject: 'Re: ' + (it.subject || '(제목 없음)'), from: it.from || '' };
      try { await openReply(it); log.push({ ...base, result: 'reply' }); }
      catch (e) { const m = String((e && e.message) || e); log.push({ ...base, result: 'fail', error: m }); notify('답장 창을 열지 못했습니다', (it.subject || '') + '\n' + m); }
    }
    await logAdd(log.reverse());
  } catch (e) {} finally { replyBusy = false; }
}
setInterval(replyPoll, 6000);
setTimeout(replyPoll, 1500);

// in Thunderbird itself: "대시보드 답장으로 답장" on the selected or open mail
async function replyFromDashboard(messages) {
  const msg = messages[0];
  if (!msg) { notify('대시보드 답장으로 답장', '메일을 먼저 선택해 주세요.'); return; }
  const s = await settings();
  if (!s) { notify('대시보드 답장으로 답장', '먼저 연결 설정이 필요합니다.'); browser.runtime.openOptionsPage(); return; }
  let data = null;
  try { const r = await fetch(s.gasUrl + '?action=dataGet&key=' + encodeURIComponent(s.gasKey) + '&t=' + Date.now(), { redirect: 'follow', cache: 'no-store' }); const j = await r.json(); data = j && j.ok ? (typeof j.data === 'string' ? JSON.parse(j.data) : j.data) : null; } catch (e) {}
  if (!data) { notify('대시보드 답장으로 답장', '대시보드 데이터를 읽지 못했습니다.'); return; }
  const id = bare(msg.headerMessageId);
  const m = (data.emails || []).find(x => bare(x.msgId) === id || (x.msgIds || []).map(bare).includes(id));
  const sig = String((data.settings && data.settings.signature) || '').trim();
  let text = m && ((m.reply && m.reply.draft) || ((m.replyOptions || [])[m.replyChoice || 0] || {}).draft) || '';
  if (text && sig) { const k = text.indexOf(sig); if (k >= 0) text = text.slice(0, k + sig.length); }
  const base = { at: new Date().toISOString(), kind: 'reply', subject: 'Re: ' + (msg.subject || ''), from: msg.author || '' };
  try {
    const tab = await browser.compose.beginReply(msg.id, 'replyToSender');
    if (text) await fillReply(tab, text);
    else notify('대시보드 답장으로 답장', m ? '이 메일의 답장 초안이 아직 없어 빈 답장 창을 열었습니다.' : '대시보드에 없는 메일이라 빈 답장 창을 열었습니다.');
    await logAdd([{ ...base, result: 'reply' }]);
  } catch (e) { const er = String((e && e.message) || e); notify('답장 창을 열지 못했습니다', er); await logAdd([{ ...base, result: 'fail', error: er }]); }
}
for (const [id, ctx] of [['dash-reply', 'message_list'], ['dash-reply-md', 'message_display_action'], ['dash-reply-ba', 'browser_action']])
  try { browser.menus.create({ id, title: '대시보드 답장 초안으로 답장', contexts: [ctx] }); } catch (e) {}
browser.menus.onClicked.addListener(async (info, tab) => {
  if (!String(info.menuItemId).startsWith('dash-reply')) return;
  const msgs = (info.selectedMessages && info.selectedMessages.messages) || [];
  replyFromDashboard(msgs.length ? msgs : await selectedInTab(tab));
});

browser.runtime.onInstalled.addListener(async () => { if (!(await settings())) browser.runtime.openOptionsPage(); });
