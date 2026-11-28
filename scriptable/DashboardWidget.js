// 업무대시보드 · 아이폰 바탕화면 위젯 (Scriptable)
// 홈 화면을 길게 눌러 ＋ → Scriptable → 원하는 크기 추가 → 위젯을 길게 눌러 "위젯 편집" → Script에서 이 스크립트를 고르세요.
// 크기별로: 작게 = 다음 일정·D-day / 중간 = 오늘 남은 일정·D-day / 크게 = 오늘·다가오는 일정·D-day·메일 / 잠금 화면 = 다음 일정·D-day
// 연결: "대시보드AI" 스크립트로 이미 연결했다면 그대로 씁니다. 아니면 이 스크립트를 앱에서 한 번 실행해 연결 링크를 붙여넣으세요.

const DASH_URL = "https://sclee00.github.io/dept-dashboard/";
const DAYS_AHEAD = 14;
// the dashboard's own colours
const C = {
  bg: new Color("#06080B"), card: new Color("#0E1218"), card2: new Color("#151B24"), ink: new Color("#E9EDF3"), muted: new Color("#8D99AB"),
  dim: new Color("#5A6474"), accent: new Color("#7FA2FF"), hot: new Color("#FF8B8B"), warn: new Color("#F3BF5E"),
  ok: new Color("#6FD4A2"), line: new Color("#242C38"),
};
// the dashboard's icons: same words → same picture and colour group (as SF Symbols)
const KC = { meet: "#B99EF6", acad: "#7FA2FF", event: "#58D1CA", due: "#FF8B8B", g: "#7DB6D4", p: "#6FD4A2", adm: "#F3BF5E" };
const ICONS = {
  개인: ["person.fill", "p"], interview: ["person.crop.rectangle", "meet"], hire: ["person.badge.plus", "meet"], users: ["person.3.fill", "meet"], chat: ["bubble.left.and.bubble.right.fill", "meet"],
  회의: ["person.2.fill", "meet"], video: ["video.fill", "meet"], phone: ["phone.fill", "meet"],
  lecture: ["person.and.background.dotted", "acad"], mic: ["mic.fill", "acad"], paper: ["doc.richtext", "acad"], exam: ["checklist", "acad"], grade: ["chart.bar.fill", "acad"],
  학사: ["graduationcap.fill", "acad"], door: ["door.left.hand.open", "acad"], book: ["book.fill", "acad"], flask: ["flask.fill", "acad"], medal: ["medal.fill", "acad"],
  plane: ["airplane", "event"], train: ["tram.fill", "event"], car: ["car.fill", "event"], 행사: ["sparkles", "event"],
  hospital: ["cross.case.fill", "p"], cake: ["birthday.cake.fill", "p"], food: ["fork.knife", "p"], sun: ["sun.max.fill", "p"], home: ["house.fill", "p"],
  sword: ["figure.fencing", "p"], dumbbell: ["dumbbell.fill", "p"], fish: ["fish.fill", "p"],
  won: ["wonsign.circle.fill", "adm"], pen: ["signature", "adm"], shield: ["shield.fill", "adm"], doc: ["doc.text.fill", "adm"], gavel: ["building.columns.fill", "adm"],
  vote: ["checkmark.seal.fill", "adm"], server: ["server.rack", "adm"], 마감: ["alarm.fill", "due"], gcal: ["calendar", "g"], 할일: ["checklist", "acad"],
};
const ICON_RULES = [
  [/면접|인터뷰|interview/i, "interview"], [/채용|임용|공채|공개\s*발표|초빙/, "hire"], [/위원회|심의|협의회|운영위|총회|이사회|평의원/, "gavel"],
  [/줌|zoom|온라인|화상|웨비나|webinar|teams/i, "video"], [/특강|강의|수업|강연|lecture|class/i, "lecture"],
  [/학회|세미나|컨퍼런스|conference|심포지엄|워크숍|workshop|포럼|colloquium|발표/i, "mic"], [/논문|원고|저널|journal|심사|리뷰|review|게재/i, "paper"],
  [/시험|중간고사|기말고사|퀴즈|평가/, "exam"], [/성적/, "grade"], [/졸업|학위|디펜스|defense/i, "학사"], [/입학|입시|수시|정시|모집|admission/i, "door"],
  [/장학|포상|수상|시상/, "medal"], [/보험|세금|납부|만기|은행|연말정산/, "shield"], [/예산|정산|구매|비용|결제|회계|견적|발주|지출/, "won"], [/결재|서명|날인|승인/, "pen"],
  [/출장|항공|비행|공항|해외|flight/i, "plane"], [/ktx|srt|기차|열차|예매/i, "train"], [/운전|차량|자동차|주차/, "car"], [/병원|진료|검진|치과|의원/, "hospital"],
  [/생일|축하|기념일|결혼|웨딩/, "cake"], [/식사|점심|저녁|만찬|회식|오찬|조찬|커피|티타임/, "food"], [/휴가|휴무|연가|방학|휴일|공휴일|연휴/, "sun"],
  [/검도|본국검|검법|무술/, "sword"], [/운동|헬스|체육|골프|등산|마라톤/, "dumbbell"], [/낚시/, "fish"], [/상담|면담|멘토링/, "chat"],
  [/학생|동문|신입생|재학생|대학원생/, "users"], [/제출|보고서|보고|서류|공문|신청|등록|양식/, "doc"], [/전화|통화/, "phone"], [/연구|실험|과제|프로젝트|r&d|국책/i, "flask"],
  [/교육|연수|훈련|오리엔테이션|설명회/, "book"], [/서버|시스템|점검|전산|홈페이지|네트워크/, "server"], [/투표|선거/, "vote"], [/어머니|아버지|부모|가족|이사|집안/, "home"],
  [/회의|미팅|meeting|협의|논의/i, "회의"], [/행사|축제|전시|개막|기념식/, "행사"], [/마감|deadline|기한/i, "마감"],
];
let USER_RULES = [];
function iconFor(text, fallback) {
  const t = String(text || "");
  for (const r of USER_RULES) if (r && r.w && t.includes(r.w) && ICONS[r.icon]) return r.icon;
  for (const [re, k] of ICON_RULES) if (re.test(t)) return k;
  return fallback;
}
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
async function loadData(fromDay, toDay, noCache) {
  const today = fromDay || ymd(new Date()), until = toDay || addDays(today, DAYS_AHEAD);
  const j = await gasGet({ action: "dataGet" });
  if (!j.ok || !j.data) throw new Error(j.message || "데이터 없음");
  const D = JSON.parse(j.data), st = D.settings || {};
  const cals = Array.isArray(st.gCals) && st.gCals.length ? st.gCals : ["primary"];
  const tags = st.calTags || {};
  USER_RULES = Array.isArray(st.iconRules) ? st.iconRules : [];
  const items = [];
  // my marks on Google events (중요, my own icon) — keyed by calendar and event id
  const marks = {};
  for (const m of D.marks || []) { if (m && /^g:/.test(m.id || "")) marks[String(m.id).slice(2)] = m; } // "g:<event id>:<date>"
  // my own events (the ones made in the dashboard)
  const gIds = new Set();
  for (const e of D.events || []) {
    if (!e || !e.date || e.absent || e.status === "absent" || e.status === "cancel" || e.status === "cancelled") continue;
    if (e.googleId && e.googleId !== "pushed") gIds.add(e.googleId);
    const end = e.endDate && e.endDate > e.date ? e.endDate : e.date;
    if (end < today || e.date > until) continue;
    const icon = e.icon && ICONS[e.icon] ? e.icon : e.kind === "마감" ? "마감" : iconFor(e.title, e.kind && ICONS[e.kind] ? e.kind : "학사");
    items.push({ title: e.title || "(제목 없음)", date: e.date, endDate: end, s: toMin(e.time), e: toMin(e.endTime), imp: e.imp === "high", kind: e.kind || "", icon, tag: null });
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
        const mk = marks[x.id + ":" + o.date];
        items.push({ title: x.summary || "(제목 없음)", ...o, imp: !!(mk && mk.imp === "high"), kind: "", icon: mk && mk.icon && ICONS[mk.icon] ? mk.icon : iconFor(x.summary, "gcal"), tag: tg });
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
  if (!noCache) fm.writeString(cacheFile, JSON.stringify(out));
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
  for (let i = 1; i <= DAYS_AHEAD; i++) { const d = addDays(today, i); for (const e of on(d).sort((a, b) => (a.s ?? -1) - (b.s ?? -1))) if (e.date === d || i === 1) upcoming.push({ ...e, day: d }); }
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
  const h = row(w); h.bottomAlignContent();
  const d = txt(h, `${v.now.getMonth() + 1}월 ${v.now.getDate()}일`, size, C.ink, true); d.font = Font.heavySystemFont(size);
  h.addSpacer(5); txt(h, WD[v.now.getDay()] + "요일", Math.round(size * 0.62), C.muted, true);
  h.addSpacer();
  return h;
}
// the little icon chip of the dashboard: tinted square, red frame for 중요
function chip(st, e, size) {
  const [sym, grp] = ICONS[e.icon] || ICONS.gcal;
  const col = new Color(KC[grp] || KC.acad);
  const box = st.addStack(); box.size = new Size(size + 6, size + 6); box.cornerRadius = 5; box.centerAlignContent();
  box.backgroundColor = new Color(KC[grp] || KC.acad, 0.16);
  if (e.imp) { box.borderColor = C.hot; box.borderWidth = 1.5; }
  const sf = SFSymbol.named(sym) || SFSymbol.named("calendar");
  sf.applyFont(Font.systemFont(size));
  const im = box.addImage(sf.image); im.imageSize = new Size(size, size); im.tintColor = col;
  return box;
}
function evLine(st, e, today, opts = {}) {
  const r = row(st); r.spacing = 5;
  chip(r, e, (opts.size || 12) - 1);
  const t = e.s == null ? (e.endDate > e.date ? "기간" : "종일") : h24(e.s);
  const tt = txt(r, (opts.day ? dayShort(opts.day, today) + " " : "") + t, (opts.size || 12) - 1, opts.past ? C.dim : C.muted);
  tt.font = Font.mediumMonospacedSystemFont((opts.size || 12) - 1);
  if (e.tag) txt(r, e.tag.t, (opts.size || 12) - 1, opts.past ? C.dim : new Color(e.tag.c), true);
  txt(r, e.title, opts.size || 12, opts.past ? C.dim : e.imp ? C.hot : C.ink, !!e.imp, 1);
  return r;
}
function ddLine(st, d, size) {
  const r = row(st); r.spacing = 6;
  const l = txt(r, ddLabel(d.n), size, ddColor(d.n), true); l.font = Font.boldMonospacedSystemFont(size);
  txt(r, d.title, size, C.ink, false, 1);
  return r;
}
function section(st, title, size) { const t = txt(st, title, size || 10, C.muted, true); return t; }

// ---------- layouts: today's remaining events + tomorrow, then later days and D-days fill the rest ----------
function groupsOf(v) {
  const tm = addDays(v.today, 1);
  const tomorrow = v.upcoming.filter(e => e.day === tm);
  const later = v.upcoming.filter(e => e.day !== tm);
  return {
    today: v.todayLeft.map(e => ({ k: "ev", e })),
    tomorrow: tomorrow.map(e => ({ k: "ev", e })),
    later: later.map(e => ({ k: "ev", e, day: e.day })),
    dd: v.dd.map(d => ({ k: "dd", d })),
  };
}
// fill `budget` lines from the groups in order; a group that does not fit ends with "외 N개"
function fill(groups, budget, labels) {
  const out = []; let left = budget;
  for (const g of groups) {
    if (left <= (labels ? 1 : 0)) break;
    const items = g.items.length ? g.items : g.empty ? [{ k: "none", t: g.empty }] : [];
    if (!items.length) continue;
    if (labels) { out.push({ k: "label", t: g.label }); left--; }
    let take = items.slice(0, Math.min(left - (g.reserve || 0) > 0 ? left - (g.reserve || 0) : 1, items.length));
    if (take.length < items.length && take.length > 1) { take = take.slice(0, -1); take.push({ k: "more", n: items.length - take.length }); }
    out.push(...take); left -= take.length;
  }
  return out;
}
function drawLines(st, lines, v, size) {
  for (const l of lines) {
    if (l.k === "label") { st.addSpacer(2); section(st, l.t, size - 2); }
    else if (l.k === "ev") evLine(st, l.e, v.today, { day: l.day, size });
    else if (l.k === "dd") ddLine(st, l.d, size);
    else if (l.k === "more") txt(st, `외 ${l.n}개`, size - 2, C.dim);
    else if (l.k === "none") txt(st, l.t, size - 1, C.dim);
  }
}
function small(w, v) {
  w.setPadding(10, 11, 8, 11); w.spacing = 2;
  header(w, v, 20); w.addSpacer(2);
  const g = groupsOf(v);
  drawLines(w, fill([
    { label: "오늘", items: g.today, empty: "오늘 남은 일정 없음", reserve: g.tomorrow.length ? 2 : 0 },
    { label: "내일", items: g.tomorrow },
    { label: "D-day", items: g.dd },
  ], 7, true), v, 11);
  w.addSpacer();
}
function medium(w, v, data) {
  w.setPadding(10, 12, 8, 12); w.spacing = 2;
  const h = header(w, v, 20);
  if (data.mails) txt(h, `메일 ${data.mails}`, 10, C.warn, true);
  w.addSpacer(2);
  const g = groupsOf(v), cols = row(w); cols.topAlignContent();
  const a = col(cols); a.spacing = 2; cols.addSpacer(10); const b = col(cols); b.spacing = 2;
  drawLines(a, fill([{ label: "오늘", items: g.today, empty: "남은 일정 없음" }, { label: "D-day", items: g.today.length > 4 ? [] : g.dd }], 7, true), v, 11);
  drawLines(b, fill([{ label: "내일", items: g.tomorrow, empty: "일정 없음" }, { label: "그다음", items: g.later }], 7, true), v, 11);
  a.addSpacer(); b.addSpacer();
}
function large(w, v, data, extra) {
  w.setPadding(12, 14, 10, 14); w.spacing = 2;
  const h = header(w, v, 26);
  if (data.mails) txt(h, `메일 ${data.mails}`, 11, C.warn, true);
  w.addSpacer(4);
  const g = groupsOf(v);
  const ddN = Math.min(g.dd.length, extra ? 6 : 3);
  drawLines(w, fill([
    { label: "오늘 남은 일정", items: g.today, empty: "남은 일정 없음", reserve: ddN ? ddN + 1 : 0 },
    { label: "내일", items: g.tomorrow, empty: "일정 없음", reserve: ddN ? ddN + 1 : 0 },
    { label: "그다음", items: g.later, reserve: ddN ? ddN + 1 : 0 },
    { label: "D-day", items: g.dd },
  ], extra ? 32 : 18, true), v, 12);
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
  const w = new ListWidget();
  // a tap runs this script again inside Scriptable and shows the big view (no Safari)
  w.url = URLScheme.forRunningScript() + "?big=1";
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
  // when the shown data was fetched (iOS decides how often a widget may refresh)
  if (!lock) { const at = new Date(data.at || Date.now()); w.addSpacer(2); const f = txt(w, (data.stale ? "연결 안 됨 · " : "") + `${pad(at.getHours())}:${pad(at.getMinutes())} 기준`, 8, C.dim); f.rightAlignText(); }
  // refresh: every 15 minutes, and right after the next event starts or ends
  let at = Date.now() + 10 * 60000; // ask for a refresh every 10 minutes (iOS may wait longer)
  const n = v.nowEv || v.next;
  if (n && n.day === v.today) { const t = new Date(); t.setHours(0, 0, 0, 0); const edge = (v.nowEv ? (n.e ?? n.s + 60) : n.s) * 60000 + t.getTime() + 30000; if (edge > Date.now() && edge < at) at = edge; }
  w.refreshAfterDate = new Date(at);
  return w;
}

// ---------- the big view (when the widget is tapped): the dashboard's calendar ----------
// the dashboard's own line icons (same drawings as on the PC)
const IP = {"flame":"<path d=\"M12 3c1 3 4.5 4.6 4.5 9a4.5 4.5 0 0 1-9 0c0-1.7.7-3 1.7-4 .3 1.4 1 2 1.8 2C11 7.5 11 5.5 12 3z\"/>","flag":"<path d=\"M5 21V4h11l-2 4 2 4H5\"/>","dash":"<path d=\"M6 12h12\"/>","alert":"<path d=\"M12 3 2 20h20L12 3z\"/><path d=\"M12 10v4M12 17.3v.01\"/>","clock":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>","clash":"<rect x=\"3\" y=\"3\" width=\"12\" height=\"12\" rx=\"2\"/><rect x=\"9\" y=\"9\" width=\"12\" height=\"12\" rx=\"2\"/><path d=\"M9 9h6v6H9z\" fill=\"currentColor\" stroke=\"none\" opacity=\".55\"/>","gout":"<path d=\"M7 17 17 7\"/><path d=\"M9 7h8v8\"/>","gin":"<path d=\"M17 7 7 17\"/><path d=\"M15 17H7V9\"/>","mail":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"m3 7 9 6 9-6\"/>","reply":"<path d=\"M9 14 4 9l5-5\"/><path d=\"M4 9h10a6 6 0 0 1 6 6v4\"/>","check":"<path d=\"m5 12 5 5 9-10\"/>","cal":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M3 10h18M8 3v4M16 3v4\"/>","hand":"<circle cx=\"9\" cy=\"8\" r=\"4\"/><path d=\"M2 21a7 7 0 0 1 14 0\"/><path d=\"M16 11h6m-2.5-2.5L22 11l-2.5 2.5\"/>","list":"<path d=\"M10 6h10M10 12h10M10 18h10\"/><path d=\"m3 6 1.3 1.3L7 4.7M3 12l1.3 1.3L7 10.7M3 18l1.3 1.3L7 16.7\"/>","개인":"<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21a8 8 0 0 1 16 0\"/>","학사":"<path d=\"m2 9 10-5 10 5-10 5z\"/><path d=\"M6 11v5c3 2 9 2 12 0v-5M22 9v5\"/>","회의":"<circle cx=\"9\" cy=\"8\" r=\"3.5\"/><path d=\"M2.5 20a6.5 6.5 0 0 1 13 0\"/><path d=\"M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6\"/>","행사":"<path d=\"m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z\"/>","마감":"<circle cx=\"12\" cy=\"13\" r=\"8\"/><path d=\"M12 9v4l2.5 2M5 3 2 6M19 3l3 3\"/>","할일":"<rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"3\"/><path d=\"m8 12 3 3 5-6\"/>","archive":"<rect x=\"3\" y=\"4\" width=\"18\" height=\"5\" rx=\"1\"/><path d=\"M5 9v10h14V9M10 13h4\"/>","user":"<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 20c0-4 3.6-6 8-6s8 2 8 6\"/>","info":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v5M12 7.6v.4\"/>","spark":"<path d=\"M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5\"/>","copy":"<rect x=\"8\" y=\"8\" width=\"13\" height=\"13\" rx=\"2\"/><path d=\"M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3\"/>","thread":"<path d=\"M4 5h16v10H9l-5 4z\"/><path d=\"M8 9h8M8 12h5\"/>","inbox":"<path d=\"M3 13h5l1.5 3h5l1.5-3h5\"/><path d=\"M5.5 5h13L21 13v6H3v-6z\"/>","gear":"<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1\"/>","link":"<path d=\"M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1\"/><path d=\"M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1\"/>","lock":"<rect x=\"5\" y=\"11\" width=\"14\" height=\"10\" rx=\"2\"/><path d=\"M8 11V8a4 4 0 0 1 8 0v3\"/>","gcal":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M3 10h18M8 3v4M16 3v4\"/><circle cx=\"12\" cy=\"15.5\" r=\"2.3\"/>","plus":"<path d=\"M12 5v14M5 12h14\"/>","search":"<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m20 20-3.5-3.5\"/>","ext":"<path d=\"M14 4h6v6M20 4l-9 9\"/><path d=\"M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5\"/>","refresh":"<path d=\"M20 11a8 8 0 1 0-2.3 5.7\"/><path d=\"M20 5v6h-6\"/>","free":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 8v8M8 12h8\"/>","drive":"<path d=\"M8 3h8l6 11-4 7H6l-4-7z\"/><path d=\"M8 3l6 11M16 3 10 14M2 14h20\"/>","ban":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m5.6 5.6 12.8 12.8\"/>","pin":"<path d=\"M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z\"/><circle cx=\"12\" cy=\"10\" r=\"2\"/>","interview":"<circle cx=\"8\" cy=\"9\" r=\"3.5\"/><path d=\"M2 21a6 6 0 0 1 12 0\"/><path d=\"M14 3h8v6h-4l-2 2V9h-2z\"/>","hire":"<circle cx=\"9\" cy=\"8\" r=\"4\"/><path d=\"M2 21a7 7 0 0 1 14 0\"/><path d=\"M19 8v6M16 11h6\"/>","gavel":"<path d=\"m14 4 6 6M11 7l6 6M12.5 5.5l-4 4M17.5 10.5l-4 4\"/><path d=\"m10.5 11.5-7 7\"/><path d=\"M13 21h8\"/>","video":"<rect x=\"2\" y=\"6\" width=\"14\" height=\"12\" rx=\"2\"/><path d=\"m16 10 6-3v10l-6-3\"/>","lecture":"<rect x=\"3\" y=\"4\" width=\"18\" height=\"12\" rx=\"1\"/><path d=\"M8 20l4-4 4 4M7 8h6M7 11h4\"/>","mic":"<rect x=\"9\" y=\"2\" width=\"6\" height=\"12\" rx=\"3\"/><path d=\"M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8\"/>","paper":"<path d=\"M6 2h9l5 5v15H6z\"/><path d=\"M14 2v6h6M9 13h8M9 17h6\"/>","exam":"<rect x=\"4\" y=\"3\" width=\"12\" height=\"18\" rx=\"1\"/><path d=\"M7 8h6M7 12h6M7 16h3\"/><path d=\"m20 6-4 9-1.5 1 .2-1.8 4-9z\"/>","grade":"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"3\"/><path d=\"M6.5 16l3-8 3 8M7.5 13.5h4M17 9v5M14.5 11.5h5\"/>","door":"<path d=\"M3 21h18M6 21V3h10v18\"/><circle cx=\"13\" cy=\"12\" r=\"1\"/><path d=\"M16 7h3v14\"/>","medal":"<circle cx=\"12\" cy=\"15\" r=\"5\"/><path d=\"M8.5 10.5 6 3h4l2 5 2-5h4l-2.5 7.5\"/>","won":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M7 8l2 8 3-6 3 6 2-8M6 11.5h12\"/>","undo":"<path d=\"M9 14 4 9l5-5\"/><path d=\"M4 9h10.5a5.5 5.5 0 0 1 0 11H11\"/>","redo":"<path d=\"m15 14 5-5-5-5\"/><path d=\"M20 9H9.5a5.5 5.5 0 0 0 0 11H13\"/>","pen":"<path d=\"M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z\"/>","plane":"<path d=\"M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z\"/>","train":"<rect x=\"5\" y=\"3\" width=\"14\" height=\"14\" rx=\"3\"/><path d=\"M5 11h14M9 21l1.5-4M15 21l-1.5-4M9 14h.01M15 14h.01\"/>","car":"<path d=\"M3 13l2-6h14l2 6v4H3z\"/><path d=\"M5 17v2M19 17v2M7.5 14h.01M16.5 14h.01\"/>","hospital":"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"3\"/><path d=\"M12 8v8M8 12h8\"/>","cake":"<path d=\"M4 21v-9h16v9M2 21h20M4 15c2 1.5 4 1.5 5.3 0 1.4 1.5 4 1.5 5.4 0 1.3 1.5 3.3 1.5 5.3 0M12 12V8\"/><path d=\"M12 4.5c.7.8.7 1.8 0 2.5-.7-.7-.7-1.7 0-2.5z\"/>","food":"<path d=\"M5 2v7a3 3 0 0 0 6 0V2M8 2v20M18 22V2c-2 1.5-3 4-3 7v4h3\"/>","sun":"<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4\"/>","shield":"<path d=\"M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z\"/><path d=\"m9 12 2 2 4-4\"/>","sword":"<path d=\"M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2\"/>","dumbbell":"<path d=\"M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12\"/>","fish":"<path d=\"M6.5 12c3-5 9.5-5 12.5 0-3 5-9.5 5-12.5 0z\"/><path d=\"M6.5 12 2 8.5v7z\"/><path d=\"M15.5 11h.01\"/>","chat":"<path d=\"M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5A8 8 0 1 1 21 12z\"/><path d=\"M8 12h.01M12 12h.01M16 12h.01\"/>","users":"<circle cx=\"12\" cy=\"7\" r=\"3\"/><circle cx=\"5\" cy=\"10\" r=\"2\"/><circle cx=\"19\" cy=\"10\" r=\"2\"/><path d=\"M6 21a6 6 0 0 1 12 0M1 19a4 4 0 0 1 6-3.5M23 19a4 4 0 0 0-6-3.5\"/>","doc":"<path d=\"M6 2h9l5 5v15H6z\"/><path d=\"M14 2v6h6\"/><path d=\"m9 15 2 2 4-4\"/>","phone":"<path d=\"M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z\"/>","flask":"<path d=\"M9 2h6M10 2v7L4 20a1 1 0 0 0 .9 1.5h14.2A1 1 0 0 0 20 20L14 9V2M7 15h10\"/>","book":"<path d=\"M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z\"/><path d=\"M4 19.5A2.5 2.5 0 0 1 6.5 17H20\"/>","server":"<rect x=\"3\" y=\"3\" width=\"18\" height=\"7\" rx=\"2\"/><rect x=\"3\" y=\"14\" width=\"18\" height=\"7\" rx=\"2\"/><path d=\"M7 6.5h.01M7 17.5h.01\"/>","vote":"<path d=\"M4 21h16M6 21V11h12v10M9 7l2 2 4-4\"/>","home":"<path d=\"m3 11 9-8 9 8M5 9v12h14V9\"/><path d=\"M10 21v-6h4v6\"/>"};
const KEY_GROUP = k => (ICONS[k] || ICONS.gcal)[1];
async function bigView() {
  const today = ymd(new Date()), t0 = parseD(today);
  const start = addDays(today, -t0.getDay()), end = addDays(start, 34); // five weeks from this Sunday, like the 5주 view
  let data;
  try { data = await loadData(start, end, true); } catch (e) { data = await getData(); }
  if (!data || data.error) { const a = new Alert(); a.title = "업무대시보드"; a.message = !data ? "연결이 필요합니다." : "불러오지 못했습니다: " + data.error; a.addAction("확인"); await a.present(); return; }
  const v = views(data);
  const evs = data.events.map(e => ({ t: e.title, d: e.date, ed: e.endDate, s: e.s, e: e.e, imp: e.imp, ic: IP[e.icon] ? e.icon : "gcal", c: KC[KEY_GROUP(e.icon)] || KC.g, tag: e.tag }));
  const dd = v.dd.map(x => ({ n: x.n, t: x.title, d: x.date }));
  const n = v.nowEv || v.next;
  const nx = n ? { now: !!v.nowEv, until: v.nowEv ? "지금 진행 중" : untilText(v), t: n.title, tag: n.tag, imp: n.imp, ic: IP[n.icon] ? n.icon : "gcal", c: KC[KEY_GROUP(n.icon)] || KC.g, day: n.day && n.day !== v.today ? dayShort(n.day, v.today) : "", s: n.s, e: n.e } : null;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
:root{--bg:#06080B;--surface:#0E1218;--surface-2:#151B24;--line:#242C38;--ink:#E9EDF3;--muted:#8D99AB;--dim:#5A6474;--accent:#7FA2FF;--red:#FF8B8B;--amber:#F3BF5E;--green:#6FD4A2;color-scheme:dark}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 -apple-system,"Apple SD Gothic Neo",system-ui,sans-serif;-webkit-text-size-adjust:100%}
.wrap{padding:14px 12px 40px}
.top{display:flex;align-items:baseline;gap:8px;margin:4px 2px 10px}.top b{font-size:28px;font-weight:800;letter-spacing:-.5px}.top span{color:var(--muted);font-weight:600}.top em{margin-left:auto;font-style:normal;color:var(--amber);font-weight:700;font-size:13px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin-bottom:10px}
.lab{font-size:12px;color:var(--muted);font-weight:700;display:flex;gap:6px;align-items:center}.lab .u{margin-left:auto;color:var(--accent)}.lab.now{color:var(--green)}
.nt{display:flex;align-items:center;gap:8px;font-size:18px;font-weight:700;margin-top:4px}.nw{color:var(--muted);font-size:13px;margin-top:2px}
.ci{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:5px;background:color-mix(in srgb,var(--c) 16%,transparent);color:var(--c);flex:none}
.ci svg{width:14px;height:14px}
.ci.imp{box-shadow:0 0 0 1.5px var(--red);animation:blink 1.6s infinite}@keyframes blink{50%{opacity:.35}}
.nt .ci{width:26px;height:26px}.nt .ci svg{width:17px;height:17px}
.wd{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:6px 0 4px;font-size:12px;font-weight:700;text-align:center;color:var(--muted)}.wd :first-child{color:var(--red)}.wd :last-child{color:var(--accent)}
.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.cell{background:var(--surface);border:1px solid transparent;border-radius:9px;min-height:62px;padding:3px 3px 4px;display:flex;flex-direction:column;gap:2px}
.cell.we{background:transparent;border:1px dashed var(--line)}
.cell.past{opacity:.45}.cell.today{border:2px solid var(--accent);background:#14203a}.cell.sel{outline:2px solid var(--muted);outline-offset:-1px}
.dn{font-size:12px;font-weight:700;padding-left:2px}.dn.sun{color:var(--red)}.dn.sat{color:var(--accent)}.dn .m{color:var(--accent);margin-right:2px}
.ics{display:flex;flex-wrap:wrap;gap:2px}.ics .ci{width:16px;height:16px;border-radius:4px}.ics .ci svg{width:11px;height:11px}.more{font-size:10px;color:var(--muted)}
.sec{font-size:13px;color:var(--muted);font-weight:700;margin:16px 2px 6px}
.row{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surface);border-radius:10px;margin-bottom:5px}
.row .tm{font:600 13px ui-monospace,Menlo,monospace;color:var(--muted);min-width:44px}.row .tt{flex:1;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row.past{opacity:.45}.row .tt.imp{color:var(--red);font-weight:700}
.tag{font-weight:700;margin-right:3px}
.empty{color:var(--dim);padding:8px 4px}
.dd{display:flex;gap:10px;padding:7px 10px;background:var(--surface);border-radius:10px;margin-bottom:5px}.dd b{font:800 14px ui-monospace,Menlo,monospace;min-width:52px}.dd span{flex:1}.dd i{font-style:normal;color:var(--muted);font-size:13px}
</style></head><body><div class="wrap" id="app"></div>
<script>
const IP = ${JSON.stringify(IP)}, EV = ${JSON.stringify(evs)}, DD = ${JSON.stringify(dd)}, NX = ${JSON.stringify(nx)};
const TODAY = ${JSON.stringify(today)}, START = ${JSON.stringify(start)}, MAILS = ${data.mails || 0}, STALE = ${data.stale ? "true" : "false"};
const WD = ["일","월","화","수","목","금","토"], pad = n => String(n).padStart(2,"0");
const P = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y,m-1,d); }, Y = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const add = (s,n) => { const d = P(s); d.setDate(d.getDate()+n); return Y(d); };
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const ic = (e, cls) => '<span class="ci '+(e.imp?'imp ':'')+(cls||'')+'" style="--c:'+e.c+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+(IP[e.ic]||IP.gcal)+'</svg></span>';
const hm = m => pad(Math.floor(m/60))+":"+pad(m%60), ap = m => (m<720?"오전 ":"오후 ")+((Math.floor(m/60)%12)||12)+":"+pad(m%60);
const on = d => EV.filter(e => e.d <= d && e.ed >= d).sort((a,b) => (a.s==null?-1:a.s)-(b.s==null?-1:b.s));
const now = new Date(), nowM = now.getHours()*60+now.getMinutes();
const short = s => { const d = P(s), n = Math.round((d-P(TODAY))/864e5); return n===0?"오늘":n===1?"내일":(d.getMonth()+1)+"/"+d.getDate()+"("+WD[d.getDay()]+")"; };
let SEL = TODAY;
function render() {
  const t = P(TODAY); let h = '<div class="top"><b>'+(t.getMonth()+1)+'월 '+t.getDate()+'일</b><span>'+WD[t.getDay()]+'요일</span>'+(MAILS?'<em>처리 중 메일 '+MAILS+'</em>':'')+'</div>';
  if (STALE) h += '<div class="empty">연결 안 됨 · 마지막으로 받은 내용</div>';
  if (NX) h += '<div class="card"><div class="lab '+(NX.now?'now':'')+'">'+(NX.now?'지금 진행 중':'다음 일정<span class="u">'+esc(NX.until)+'</span>')+'</div><div class="nt">'+ic(NX)+(NX.tag?'<span class="tag" style="color:'+NX.tag.c+'">'+esc(NX.tag.t)+'</span>':'')+esc(NX.t)+'</div><div class="nw">'+(NX.day?NX.day+' ':'')+ap(NX.s)+(NX.e!=null?' – '+hm(NX.e):'')+'</div></div>';
  h += '<div class="wd">'+WD.map(x=>'<span>'+x+'</span>').join('')+'</div><div class="grid">';
  for (let i = 0; i < 35; i++) {
    const d = add(START,i), dt = P(d), list = on(d), w = dt.getDay();
    h += '<div class="cell '+(w===0||w===6?'we ':'')+(d<TODAY?'past ':'')+(d===TODAY?'today ':'')+(d===SEL&&d!==TODAY?'sel':'')+'" data-d="'+d+'"><div class="dn '+(w===0?'sun':w===6?'sat':'')+'">'+(dt.getDate()===1||i===0?'<span class="m">'+(dt.getMonth()+1)+'월</span>':'')+dt.getDate()+'</div><div class="ics">'+list.slice(0,6).map(e=>ic(e)).join('')+(list.length>6?'<span class="more">+'+(list.length-6)+'</span>':'')+'</div></div>';
  }
  h += '</div><div class="sec">'+short(SEL)+' 일정</div>';
  const l = on(SEL);
  h += l.length ? l.map(e => { const past = SEL<TODAY || (SEL===TODAY && e.s!=null && (e.e!=null?e.e:e.s+60)<=nowM); return '<div class="row '+(past?'past':'')+'">'+ic(e)+'<span class="tm">'+(e.s==null?(e.ed>e.d?'기간':'종일'):hm(e.s))+'</span><span class="tt '+(e.imp?'imp':'')+'">'+(e.tag?'<span class="tag" style="color:'+e.tag.c+'">'+esc(e.tag.t)+'</span>':'')+esc(e.t)+'</span></div>'; }).join('') : '<div class="empty">일정이 없습니다</div>';
  if (DD.length) h += '<div class="sec">D-day</div>'+DD.map(x => '<div class="dd"><b style="color:'+(x.n<=3?'var(--red)':x.n<=7?'var(--amber)':'var(--accent)')+'">'+(x.n===0?'D-day':'D-'+x.n)+'</b><span>'+esc(x.t)+'</span><i>'+short(x.d)+'</i></div>').join('');
  document.getElementById('app').innerHTML = h;
}
document.addEventListener('click', e => { const c = e.target.closest('.cell'); if (!c) return; SEL = c.dataset.d; render(); document.querySelector('.sec').scrollIntoView({behavior:'smooth',block:'start'}); });
render();
</script></body></html>`;
  const wv = new WebView();
  await wv.loadHTML(html);
  await wv.present(true);
}

const family = config.widgetFamily || "large";
if (config.runsInWidget) Script.setWidget(await build(family));
else if ((args.queryParameters || {}).big) await bigView();
else {
  // running in the app: show a preview of every size
  const a = new Alert(); a.title = "미리 보기"; a.message = "어느 크기로 볼까요?";
  ["작게", "중간", "크게", "잠금 화면", "눌렀을 때 화면"].forEach(x => a.addAction(x)); a.addCancelAction("닫기");
  const i = await a.present();
  if (i === 4) await bigView();
  if (i === 0) await (await build("small")).presentSmall();
  if (i === 1) await (await build("medium")).presentMedium();
  if (i === 2) await (await build("large")).presentLarge();
  if (i === 3) await (await build("accessoryRectangular")).presentAccessoryRectangular();
}
Script.complete();
