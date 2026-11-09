const $ = id => document.getElementById(id);
function readCode(text) {
  const m = String(text || '').trim().match(/(?:connect=)?([\w-]{20,})\s*$/); if (!m) return null;
  try {
    const j = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))));
    return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(j.u || '') && j.k ? { gasUrl: j.u, gasKey: j.k } : null;
  } catch (e) { return null; }
}
function show(msg, ok) { const s = $('st'); s.textContent = msg; s.className = ok ? 'ok' : 'err'; }
(async () => { const s = await browser.storage.local.get(['gasUrl', 'gasKey']); if (s.gasUrl) { $('url').value = s.gasUrl; $('key').value = s.gasKey || ''; show('연결되어 있습니다.', true); } })();
$('save').addEventListener('click', async () => {
  const c = readCode($('link').value) || ($('url').value.trim() && $('key').value.trim() ? { gasUrl: $('url').value.trim(), gasKey: $('key').value.trim() } : null);
  if (!c) return show('연결 링크를 붙여넣거나 주소와 비밀 키를 넣어 주세요.', false);
  show('확인 중…', true);
  try {
    const r = await fetch(c.gasUrl + '?action=ping&key=' + encodeURIComponent(c.gasKey) + '&t=' + Date.now(), { redirect: 'follow', cache: 'no-store' });
    const j = await r.json();
    if (!j.ok) return show(j.error === 'key' ? '비밀 키가 스크립트와 다릅니다.' : (j.message || '연결하지 못했습니다.'), false);
    if ((j.version || 0) < 8) return show(`스크립트가 버전 ${j.version || '?'}입니다. 버전 8 이상으로 다시 배포해야 메일을 받을 수 있습니다.`, false);
    await browser.storage.local.set(c);
    $('url').value = c.gasUrl; $('key').value = c.gasKey; $('link').value = '';
    show(`연결했습니다 (${j.email}). 이제 메일에서 "대시보드로 보내기"를 누르세요.`, true);
  } catch (e) { show('스크립트에 연결하지 못했습니다: ' + (e.message || e), false); }
});

/* ---------- send log ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const two = n => String(n).padStart(2, '0');
const when = iso => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`; };
const kb = n => !n ? '' : n < 1048576 ? Math.round(n / 1024) + 'KB' : (n / 1048576).toFixed(1) + 'MB';
const RES = { ok: '보냄', dup: '이미 보낸 메일', fail: '실패', reply: '답장 창 열림' };
async function renderLog() {
  const { sendLog = [] } = await browser.storage.local.get('sendLog');
  const q = $('logQ').value.trim().toLowerCase(), f = $('logF').value;
  const rows = sendLog.filter(x => (!f || x.result === f) && (!q || (x.subject + ' ' + x.from).toLowerCase().includes(q)));
  const nOk = sendLog.filter(x => x.result === 'ok').length, nFail = sendLog.filter(x => x.result === 'fail').length;
  $('logN').textContent = sendLog.length ? `${sendLog.length}건 · 보냄 ${nOk} · 실패 ${nFail}` : '';
  $('log').innerHTML = !rows.length ? `<div class="empty">${sendLog.length ? '찾는 기록이 없습니다.' : '아직 보낸 메일이 없습니다.'}</div>`
    : `<table><thead><tr><th>보낸 시각</th><th>결과</th><th>메일</th><th>첨부</th></tr></thead><tbody>${rows.map(x => `<tr>
      <td class="t">${esc(when(x.at))}</td>
      <td class="res ${esc(x.result)}">${esc(RES[x.result] || x.result)}</td>
      <td class="s"><div>${esc(x.subject)}</div><div class="sub">${esc(x.from)}${x.date ? ' · 받은 ' + esc(when(x.date)) : ''}${x.folder ? ' · ' + esc(x.folder) : ''}</div>${x.error ? `<div class="sub" style="color:#c92a2a">${esc(x.error)}</div>` : ''}</td>
      <td class="t">${x.atts ? `${x.atts}개 ${esc(kb(x.size))}${x.attSkipped ? ` <span class="sub">(${x.attSkipped}개 이름만)</span>` : ''}` : ''}</td></tr>`).join('')}</tbody></table>`;
}
$('logQ').addEventListener('input', renderLog);
$('logF').addEventListener('change', renderLog);
$('logClear').addEventListener('click', async () => { if (!confirm('보낸 기록을 모두 지울까요? (대시보드에 들어간 메일은 그대로입니다)')) return; await browser.storage.local.set({ sendLog: [] }); renderLog(); });
$('logCsv').addEventListener('click', async () => {
  const { sendLog = [] } = await browser.storage.local.get('sendLog');
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const csv = '\ufeff' + [['보낸 시각', '결과', '제목', '보낸 사람', '받은 시각', '폴더', '첨부 수', '첨부 크기', '오류'].map(q).join(',')]
    .concat(sendLog.map(x => [when(x.at), RES[x.result] || x.result, x.subject, x.from, when(x.date), x.folder, x.atts || 0, kb(x.size), x.error || ''].map(q).join(','))).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'dashboard-send-log.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
browser.runtime.onMessage.addListener(m => { if (m && m.type === 'logChanged') renderLog(); });
browser.storage.onChanged.addListener(c => { if (c.sendLog) renderLog(); });
renderLog();
async function renderPoll() {
  const { replyPollAt, replyPollErr } = await browser.storage.local.get(['replyPollAt', 'replyPollErr']);
  const v = browser.runtime.getManifest().version;
  $('poll').innerHTML = `애드온 ${esc(v)} · 대시보드 답장 요청 확인: ${replyPollAt ? esc(when(new Date(replyPollAt).toISOString())) + (replyPollErr ? ` <b style="color:#c92a2a">${esc(replyPollErr)}</b>` : ' <b style="color:#2b8a3e">정상</b>') : '아직 확인 전'}`;
}
renderPoll(); setInterval(renderPoll, 5000);
