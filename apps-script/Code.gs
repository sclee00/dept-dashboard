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
 * 이 스크립트는 내 계정의 캘린더만 다루며, KEY가 맞는 요청에만 답합니다.
 */
const KEY = 'CHANGE_ME';

function authorize() {
  CalendarApp.getDefaultCalendar().getName();
  Logger.log('권한 확인 완료: ' + Session.getEffectiveUser().getEmail());
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!KEY || KEY === 'CHANGE_ME') return out({ ok: false, error: 'nokey', message: '스크립트의 KEY를 바꿔 주세요.' });
  if (p.key !== KEY) return out({ ok: false, error: 'key' });
  try {
    switch (p.action) {
      case 'ping': return out({ ok: true, email: Session.getEffectiveUser().getEmail(), tz: Session.getScriptTimeZone() });
      case 'calendars': return out({ ok: true, calendars: listCalendars() });
      case 'events': return out({ ok: true, events: listEvents(p.cal, p.from, p.to) });
      case 'create': return out({ ok: true, event: createEvent(p) });
      default: return out({ ok: false, error: 'action' });
    }
  } catch (err) {
    return out({ ok: false, error: 'script', message: String((err && err.message) || err) });
  }
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

function listEvents(cal, from, to) {
  const c = calById(cal);
  return c.getEvents(toDate(from), toDate(to)).slice(0, 600).map(function (ev) {
    const o = { id: ev.getId(), summary: ev.getTitle(), location: ev.getLocation() };
    if (ev.isAllDayEvent()) {
      o.start = { date: fmt(ev.getAllDayStartDate(), 'yyyy-MM-dd') };
      o.end = { date: fmt(ev.getAllDayEndDate(), 'yyyy-MM-dd') };
    } else {
      o.start = { dateTime: fmt(ev.getStartTime(), "yyyy-MM-dd'T'HH:mm:ssXXX") };
      o.end = { dateTime: fmt(ev.getEndTime(), "yyyy-MM-dd'T'HH:mm:ssXXX") };
    }
    try { if (ev.getTransparency() === CalendarApp.EventTransparency.TRANSPARENT) o.transparency = 'transparent'; } catch (e) {}
    return o;
  });
}

function createEvent(p) {
  if (!p.title || !p.date) throw new Error('제목과 날짜가 필요합니다.');
  const c = calById(p.cal);
  const opt = {};
  if (p.location) opt.location = p.location;
  if (p.description) opt.description = p.description;
  let ev;
  if (p.days) {
    const W = [CalendarApp.Weekday.SUNDAY, CalendarApp.Weekday.MONDAY, CalendarApp.Weekday.TUESDAY, CalendarApp.Weekday.WEDNESDAY, CalendarApp.Weekday.THURSDAY, CalendarApp.Weekday.FRIDAY, CalendarApp.Weekday.SATURDAY];
    const days = String(p.days).split(',').map(Number).filter(function (n) { return n >= 0 && n <= 6; }).map(function (n) { return W[n]; });
    let rule = CalendarApp.newRecurrence().addWeeklyRule().onlyOnWeekdays(days);
    if (p.until) { const u = toDate(p.until); u.setDate(u.getDate() + 1); rule = rule.until(u); }
    if (p.time) {
      const st = toDate(p.date, p.time);
      let en = p.endTime ? toDate(p.date, p.endTime) : null;
      if (!en || en <= st) en = new Date(st.getTime() + 3600000);
      const series = c.createEventSeries(p.title, st, en, rule, opt);
      return { id: series.getId(), series: true };
    }
    const series = c.createAllDayEventSeries(p.title, toDate(p.date), rule, opt);
    return { id: series.getId(), series: true };
  }
  if (p.time) {
    const st = toDate(p.date, p.time);
    let en = p.endTime ? toDate(p.date, p.endTime) : null;
    if (!en || en <= st) en = new Date(st.getTime() + 3600000);
    ev = c.createEvent(p.title, st, en, opt);
  } else if (p.endDate && p.endDate > p.date) {
    const end = toDate(p.endDate); end.setDate(end.getDate() + 1);
    ev = c.createAllDayEvent(p.title, toDate(p.date), end, opt);
  } else {
    ev = c.createAllDayEvent(p.title, toDate(p.date), opt);
  }
  return { id: ev.getId() };
}
