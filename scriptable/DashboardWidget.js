// 업무대시보드 · 아이폰 바탕화면 위젯 (Scriptable)
// 홈 화면을 길게 눌러 ＋ → Scriptable → 원하는 크기 추가 → 위젯을 길게 눌러 "위젯 편집" → Script에서 이 스크립트를 고르세요.
// 크기별로: 작게 = 다음 일정·D-day / 중간 = 오늘 남은 일정·D-day / 크게 = 오늘·다가오는 일정·D-day·메일 / 잠금 화면 = 다음 일정·D-day
// 연결: "대시보드AI" 스크립트로 이미 연결했다면 그대로 씁니다. 아니면 이 스크립트를 앱에서 한 번 실행해 연결 링크를 붙여넣으세요.

const DASH_URL = "https://sclee00.github.io/dept-dashboard/";
const DAYS_AHEAD = 14;
const C = {
  bg: new Color("#06080B"), card: new Color("#11161D"), ink: new Color("#E9EDF2"), muted: new Color("#8C97A6"),
  dim: new Color("#5C6673"), accent: new Color("#7AA2F7"), hot: new Color("#FF6B6B"), warn: new Color("#F0B44C"),
  ok: new Color("#56C08A"), line: new Color("#222A35"),
};
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseD = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); };
const dayDiff = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);
const toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : null; };
const hm = min => { const h = Math.floor(min / 60), m = min % 60; return `${h % 12 || 12}:${pad(m)}`; };
const ampm = min => (min < 720 ? "오전 " : "오후 ") + hm(min);
const h24 = min => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

// ---------- connection ----------
function readConnect(text) {
  const m = String(text || "").trim().match(/(?:connect=)?([\w-]{20,})\s*$/); if (!m) return null;
  try {
    const b = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const j = JSON.parse(Data.fromBase64String(b + "===".slice((b.length + 3) % 4)).toRawString());
    return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(j.u || "") && j.k ? j : null;
  } catch (e) { return null; }
}
let GAS = Keychain.contains("dash_gas") ? Keychain.get("dash_gas") : "";
let KEY = Keychain.contains("dash_key") ? Keychain.get("dash_key") : "";
if ((!GAS || !KEY) && !config.runsInWidget) {
  const a = new Alert(); a.title = "대시보드 연결";
  a.message = "대시보드 설정 → 휴대폰에서 쓰기 → '연결 링크 복사'로 얻은 링크를 붙여넣어 주세요.";
  a.addTextField("https://sclee00.github.io/dept-dashboard/#connect=…", Pasteboard.paste() || "");
  a.addAction("연결"); a.addCancelAction("취소");
  if (await a.present() === 0) {
    const j = readConnect(a.textFieldValue(0));
    if (j) { Keychain.set("dash_gas", j.u); Keychain.set("dash_key", j.k); GAS = j.u; KEY = j.k; }
    else { const e = new Alert(); e.title = "연결 링크가 아닙니다"; e.message = "링크 전체를 다시 복사해 붙여넣어 주세요."; e.addAction("확인"); await e.present(); }
  }
}

async function gasGet(params) {
  const q = Object.entries({ ...params, key: KEY, t: Date.now() }).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
  const r = new Request(GAS + "?" + q); r.timeoutInterval = 25;
  return await r.loadJSON();
}

// ---------- data (cached, so the widget still shows something without network) ----------
const fm = FileManager.local();
const cacheFile = fm.joinPath(fm.documentsDirectory(), "dashboard-widget-cache.json");
async function loadData() {
  const today = ymd(new Date()), until = addDays(today, DAYS_AHEAD);
  const j = await gasGet({ action: "dataGet" });
  if (!j.ok || !j.data) throw new Error(j.message || "데이터 없음");
  const D = JSON.parse(j.data), st = D.settings || {};
  const cals = Array.isArray(st.gCals) && st.gCals.length ? st.gCals : ["primary"];
  const tags = st.calTags || {};
  const items = [];
  // my own events (the ones made in the dashboard)
  const gIds = new Set();
  for (const e of D.events || []) {
    if (!e || !e.date || e.absent || e.status === "absent" || e.status === "cancel" || e.status === "cancelled") continue;
    if (e.googleId && e.googleId !== "pushed") gIds.add(e.googleId);
    const end = e.endDate && e.endDate > e.date ? e.endDate : e.date;
    if (end < today || e.date > until) continue;
    items.push({ title: e.title || "(제목 없음)", date: e.date, endDate: end, s: toMin(e.time), e: toMin(e.endTime), imp: e.imp === "high", kind: e.kind || "", tag: null });
  }
  // Google Calendar
  for (const cal of cals) {
    try {
      const g = await gasGet({ action: "events", cal, from: today, to: addDays(until, 1) });
      const tg = tags[cal] && tags[cal].t ? { t: tags[cal].t, c: tags[cal].c || "#e5484d" } : null;
      for (const x of g.events || []) {
        if (gIds.has(x.id)) continue;
        const sd = x.start && (x.start.date || (x.start.dateTime || "").slice(0, 10));
        if (!sd) continue;
        let o;
        if (x.start.date) {
          const last = x.end && x.end.date ? addDays(x.end.date, -1) : sd;
          o = { date: sd, endDate: last < sd ? sd : last, s: null, e: null };
        } else {
          const a = new Date(x.start.dateTime), b = new Date(x.end.dateTime);
          const bd = ymd(b), bm = b.getHours() * 60 + b.getMinutes();
          o = { date: ymd(a), endDate: bd > ymd(a) ? (bm === 0 ? addDays(bd, -1) : bd) : ymd(a), s: a.getHours() * 60 + a.getMinutes(), e: bd > ymd(a) ? null : bm };
          if (o.endDate > o.date) o.s = null; // shown as a span
        }
        items.push({ title: x.summary || "(제목 없음)", ...o, imp: false, kind: "", tag: tg });
      }
    } catch (e) {}
  }
  // the same event in both lists: keep one
  const seen = new Set(), list = [];
  for (const it of items.sort((a, b) => a.date.localeCompare(b.date) || (a.s ?? -1) - (b.s ?? -1))) {
    const k = it.date + "|" + (it.s ?? "") + "|" + it.title.replace(/\s+/g, "");
    if (seen.has(k)) continue; seen.add(k); list.push(it);
  }
  const lists = D.lists || {};
  const pins = (lists.ddayPins && Array.isArray(lists.ddayPins.v) ? lists.ddayPins.v : st.ddayPins || []).filter(d => d && d.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const mails = (D.emails || []).filter(m => m.status === "open").length;
  const out = { at: Date.now(), events: list, ddays: pins, mails };
  fm.writeString(cacheFile, JSON.stringify(out));
  return out;
}
async function getData() {
  if (!GAS || !KEY) return null;
  try { return await loadData(); }
  catch (e) { if (fm.fileExists(cacheFile)) { const c = JSON.parse(fm.readString(cacheFile)); c.stale = true; return c; } return { error: String(e.message || e) }; }
}

// ---------- what to show ----------
function views(data) {
  const now = new Date(), today = ymd(now), nowM = now.getHours() * 60 + now.getMinutes();
  const on = d => data.events.filter(e => e.date <= d && e.endDate >= d);
  const allDay = e => e.s == null;
  const ended = (e, d) => d === today && !allDay(e) && (e.e != null ? e.e : e.s + 60) <= nowM;
  const todayAll = on(today).sort((a, b) => (a.s ?? -1) - (b.s ?? -1));
  const todayLeft = todayAll.filter(e => !ended(e, today));
  // next timed event from now
  let next = null;
  for (let i = 0; i <= DAYS_AHEAD && !next; i++) {
    const d = addDays(today, i);
    next = on(d).filter(e => !allDay(e) && (i > 0 || e.s >= nowM - 0)).sort((a, b) => a.s - b.s)[0];
    if (next) next = { ...next, day: d };
  }
  const nowEv = todayAll.find(e => !allDay(e) && e.s <= nowM && (e.e != null ? e.e : e.s + 60) > nowM);
  const upcoming = [];
  for (let i = 1; i <= 7; i++) { const d = addDays(today, i); for (const e of on(d).sort((a, b) => (a.s ?? -1) - (b.s ?? -1))) if (e.date === d || i === 1) upcoming.push({ ...e, day: d }); }
  const dd = data.ddays.map(x => ({ ...x, n: dayDiff(today, x.date) }));
  return { now, today, nowM, todayAll, todayLeft, next, nowEv, upcoming, dd };
}
const ddLabel = n => n === 0 ? "D-day" : "D-" + n;
const ddColor = n => n <= 3 ? C.hot : n <= 7 ? C.warn : C.accent;
function untilText(v) {
  const n = v.next; if (!n) return "";
  const mins = dayDiff(v.today, n.day) * 1440 + n.s - v.nowM;
  if (mins < 60) return `${Math.max(mins, 0)}분 후`;
  if (mins < 1440 && n.day === v.today) return `${Math.floor(mins / 60)}시간 ${mins % 60 ? (mins % 60) + "분 " : ""}후`;
  const d = dayDiff(v.today, n.day); return d === 1 ? "내일" : `${d}일 후`;
}
const dayShort = (s, today) => { const n = dayDiff(today, s), d = parseD(s); return n === 0 ? "오늘" : n === 1 ? "내일" : `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };

// ---------- drawing helpers ----------
function txt(st, s, size, color, bold, lines) {
  const t = st.addText(s); t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size); t.textColor = color || C.ink;
  if (lines) t.lineLimit = lines; t.minimumScaleFactor = 0.75; return t;
}
function row(st) { const r = st.addStack(); r.layoutHorizontally(); r.centerAlignContent(); return r; }
function col(st) { const c = st.addStack(); c.layoutVertically(); return c; }
function header(w, v, size) {
  const h = row(w);
  txt(h, `${v.now.getMonth() + 1}월 ${v.now.getDate()}일`, size, C.ink, true);
  h.addSpacer(4); txt(h, WD[v.now.getDay()] + "요일", size - 2, C.muted);
  h.addSpacer();
  return h;
}
function evLine(st, e, today, opts = {}) {
  const r = row(st); r.spacing = 5;
  const dot = r.addStack(); dot.size = new Size(4, opts.size ? opts.size + 2 : 13); dot.cornerRadius = 2;
  dot.backgroundColor = e.imp ? C.hot : e.tag ? new Color(e.tag.c) : C.accent;
  const t = e.s == null ? (e.endDate > e.date ? "기간" : "종일") : h24(e.s);
  const tt = txt(r, (opts.day ? dayShort(opts.day, today) + " " : "") + t, (opts.size || 12) - 1, opts.past ? C.dim : C.muted);
  tt.font = Font.mediumMonospacedSystemFont((opts.size || 12) - 1);
  txt(r, (e.tag ? e.tag.t + " " : "") + e.title, opts.size || 12, opts.past ? C.dim : C.ink, !!e.imp, 1);
  return r;
}
function ddLine(st, d, size) {
  const r = row(st); r.spacing = 6;
  const l = txt(r, ddLabel(d.n), size, ddColor(d.n), true); l.font = Font.boldMonospacedSystemFont(size);
  txt(r, d.title, size, C.ink, false, 1);
  return r;
}
function section(st, title, size) { const t = txt(st, title, size || 10, C.muted, true); return t; }

// ---------- layouts ----------
function small(w, v) {
  w.setPadding(12, 12, 12, 12);
  header(w, v, 14); w.addSpacer(6);
  const n = v.nowEv || v.next;
  if (n) {
    txt(w, v.nowEv ? "지금" : untilText(v), 11, v.nowEv ? C.ok : C.accent, true);
    txt(w, (n.tag ? n.tag.t + " " : "") + n.title, 14, C.ink, true, 2);
    txt(w, (n.day && n.day !== v.today ? dayShort(n.day, v.today) + " " : "") + ampm(n.s), 11, C.muted);
  } else txt(w, "앞으로 2주 일정 없음", 12, C.muted);
  w.addSpacer();
  if (v.dd[0]) ddLine(w, v.dd[0], 12);
}
function medium(w, v, data) {
  w.setPadding(12, 14, 12, 14);
  const top = row(w); top.addSpacer(0);
  const left = col(top); left.size = new Size(118, 0);
  header(left, v, 15); left.addSpacer(6);
  const n = v.nowEv || v.next;
  if (n) {
    txt(left, v.nowEv ? "지금 진행 중" : "다음 · " + untilText(v), 10, v.nowEv ? C.ok : C.accent, true);
    txt(left, (n.tag ? n.tag.t + " " : "") + n.title, 13, C.ink, true, 2);
    txt(left, (n.day && n.day !== v.today ? dayShort(n.day, v.today) + " " : "") + ampm(n.s), 10, C.muted);
  } else txt(left, "다음 일정 없음", 11, C.muted);
  left.addSpacer();
  if (data.mails) txt(left, `처리 중 메일 ${data.mails}`, 10, C.warn, true);
  top.addSpacer(10);
  const right = col(top); right.spacing = 3;
  section(right, `오늘 남은 일정 ${v.todayLeft.length}`);
  const rows = v.todayLeft.slice(0, v.dd.length ? 3 : 5);
  if (rows.length) rows.forEach(e => evLine(right, e, v.today)); else txt(right, "오늘 남은 일정이 없습니다", 11, C.dim);
  if (v.todayLeft.length > rows.length) txt(right, `외 ${v.todayLeft.length - rows.length}개`, 9, C.dim);
  if (v.dd.length) { right.addSpacer(4); section(right, "D-day"); v.dd.slice(0, 2).forEach(d => ddLine(right, d, 11)); }
  right.addSpacer();
}
function large(w, v, data, extra) {
  w.setPadding(14, 16, 14, 16);
  const h = header(w, v, 17);
  if (data.mails) txt(h, `메일 ${data.mails}`, 11, C.warn, true);
  w.addSpacer(8);
  const n = v.nowEv || v.next;
  if (n) {
    const card = w.addStack(); card.layoutVertically(); card.backgroundColor = C.card; card.cornerRadius = 10; card.setPadding(8, 10, 8, 10); card.spacing = 2;
    const r = row(card); txt(r, v.nowEv ? "지금 진행 중" : "다음 일정", 10, v.nowEv ? C.ok : C.accent, true); r.addSpacer(); if (!v.nowEv) txt(r, untilText(v), 10, C.accent, true);
    txt(card, (n.tag ? n.tag.t + " " : "") + n.title, 15, C.ink, true, 1);
    txt(card, (n.day && n.day !== v.today ? dayShort(n.day, v.today) + " " : "") + ampm(n.s) + (n.e != null ? " – " + hm(n.e) : ""), 11, C.muted);
    w.addSpacer(8);
  }
  const k = extra ? 2 : 1;
  section(w, `오늘 일정 ${v.todayAll.length}`, 11); w.addSpacer(3);
  const tl = v.todayAll.slice(0, 5 * k);
  if (tl.length) tl.forEach(e => { evLine(w, e, v.today, { past: !v.todayLeft.includes(e), size: 13 }); w.addSpacer(2); });
  else txt(w, "오늘 일정이 없습니다", 12, C.dim);
  w.addSpacer(8);
  section(w, "다가오는 일정", 11); w.addSpacer(3);
  const up = v.upcoming.slice(0, 5 * k);
  if (up.length) up.forEach(e => { evLine(w, e, v.today, { day: e.day, size: 12 }); w.addSpacer(2); });
  else txt(w, "일주일 안에 일정이 없습니다", 12, C.dim);
  if (v.dd.length) { w.addSpacer(8); section(w, "D-day", 11); w.addSpacer(3); v.dd.slice(0, 4 * k).forEach(d => { ddLine(w, d, 12); w.addSpacer(2); }); }
  w.addSpacer();
}
// lock screen
function accRect(w, v) {
  const n = v.nowEv || v.next;
  if (n) {
    txt(w, (v.nowEv ? "지금 · " : untilText(v) + " · ") + ampm(n.s), 11, Color.white(), true);
    txt(w, n.title, 13, Color.white(), true, 1);
  } else txt(w, "다음 일정 없음", 12, Color.white(), true);
  if (v.dd[0]) txt(w, `${ddLabel(v.dd[0].n)} ${v.dd[0].title}`, 11, Color.white(), false, 1);
}
function accInline(w, v) {
  const n = v.nowEv || v.next;
  txt(w, n ? `${h24(n.s)} ${n.title}` : v.dd[0] ? `${ddLabel(v.dd[0].n)} ${v.dd[0].title}` : "일정 없음", 12, Color.white());
}
function accCircle(w, v) {
  const d = v.dd[0];
  w.addAccessoryWidgetBackground = true;
  const s = col(w); s.centerAlignContent();
  if (d) { const a = txt(s, d.n === 0 ? "D" : "D-", 10, Color.white(), true); a.centerAlignText(); const b = txt(s, d.n === 0 ? "day" : String(d.n), 18, Color.white(), true); b.centerAlignText(); }
  else txt(s, String(new Date().getDate()), 20, Color.white(), true);
}

// ---------- build ----------
async function build(family) {
  const w = new ListWidget(); w.url = DASH_URL;
  const lock = /^accessory/.test(family);
  if (!lock) { w.backgroundColor = C.bg; }
  const data = await getData();
  if (!data || data.error) {
    w.setPadding(12, 12, 12, 12);
    txt(w, "업무대시보드", 13, C.ink, true); w.addSpacer(4);
    txt(w, !data ? "Scriptable에서 이 스크립트를 한 번 실행해 연결해 주세요." : "불러오지 못했습니다: " + data.error, 11, C.muted, false, 4);
    return w;
  }
  const v = views(data);
  if (family === "small") small(w, v);
  else if (family === "medium") medium(w, v, data);
  else if (family === "large") large(w, v, data, false);
  else if (family === "extraLarge") large(w, v, data, true);
  else if (family === "accessoryRectangular") accRect(w, v);
  else if (family === "accessoryInline") accInline(w, v);
  else if (family === "accessoryCircular") accCircle(w, v);
  else medium(w, v, data);
  if (data.stale && !lock) { w.addSpacer(2); txt(w, "연결 안 됨 · 마지막으로 받은 내용", 8, C.dim); }
  // refresh: every 15 minutes, and right after the next event starts or ends
  let at = Date.now() + 15 * 60000;
  const n = v.nowEv || v.next;
  if (n && n.day === v.today) { const t = new Date(); t.setHours(0, 0, 0, 0); const edge = (v.nowEv ? (n.e ?? n.s + 60) : n.s) * 60000 + t.getTime() + 30000; if (edge > Date.now() && edge < at) at = edge; }
  w.refreshAfterDate = new Date(at);
  return w;
}

const family = config.widgetFamily || "large";
const widget = await build(family);
if (config.runsInWidget) Script.setWidget(widget);
else {
  // running in the app: show a preview of every size
  const a = new Alert(); a.title = "미리 보기"; a.message = "어느 크기로 볼까요?";
  ["작게", "중간", "크게", "잠금 화면"].forEach(x => a.addAction(x)); a.addCancelAction("닫기");
  const i = await a.present();
  if (i === 0) await (await build("small")).presentSmall();
  if (i === 1) await (await build("medium")).presentMedium();
  if (i === 2) await (await build("large")).presentLarge();
  if (i === 3) await (await build("accessoryRectangular")).presentAccessoryRectangular();
}
Script.complete();
