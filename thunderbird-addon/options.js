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
