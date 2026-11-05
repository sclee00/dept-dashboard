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
 * 버전 7: 휴대폰이 PC와 같은 데이터 파일을 쓰도록 맞추기 (dataFiles, dataUse)
 * 버전 6: 반복 일정 전체의 시간을 바꾸려면 왼쪽 [서비스] + → Google Calendar API 추가 (apps-script/appsscript.json 참고)
 */
const KEY = 'CHANGE_ME';

function authorize() {
  CalendarApp.getDefaultCalendar().getName();
  DriveApp.getRootFolder().getName();
  Logger.log('권한 확인 완료: ' + Session.getEffectiveUser().getEmail());
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!KEY || KEY === 'CHANGE_ME') return out({ ok: false, error: 'nokey', message: '스크립트의 KEY를 바꿔 주세요.' });
  if (p.key !== KEY) return out({ ok: false, error: 'key' });
  try {
    switch (p.action) {
      case 'ping': return out({ ok: true, email: Session.getEffectiveUser().getEmail(), tz: Session.getScriptTimeZone(), version: 7, advanced: typeof Calendar !== 'undefined' });
      case 'dataGet': return out(Object.assign({ ok: true }, dataGet(p)));
      case 'dataFiles': return out({ ok: true, current: PropertiesService.getScriptProperties().getProperty('DATA_FILE_ID') || '', files: dataFiles() });
      case 'dataUse': return out(Object.assign({ ok: true }, dataUse(p)));
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
    return out({ ok: false, error: 'action' });
  } catch (err) {
    return out({ ok: false, error: 'script', message: String((err && err.message) || err) });
  }
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
