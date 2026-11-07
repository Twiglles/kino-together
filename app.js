/*
  Логика страницы: сетка фильмов, кружки с никами, панель «Не нашли нужный фильм?».
  Отметки хранятся в одном из трёх мест:
  - на claude.ai (artifact.html) — в базе страницы claude.ai;
  - на своём хостинге (index.html) — в Firebase, ветка together/<pollId>;
  - в демо-режиме (нет базы или в адресе есть ?demo) — только в этом браузере.
*/
const CFG = window.TOGETHER_CONFIG || {};
const FILMS = window.TOGETHER_FILMS || [];
const POLL = CFG.pollId || "2026-11";

// У фильмов без номера Кинопоиска ссылка ведёт на поиск по оригинальному названию
const kpLink = f => /^\d+$/.test(f.id)
  ? `https://www.kinopoisk.ru/film/${f.id}/`
  : `https://www.kinopoisk.ru/index.php?kp_query=${encodeURIComponent(f.original || f.title)}`;

// Сколько кружков показывать, пока желающих меньше. На телефоне кружки крупнее, поэтому их меньше.
const SLOTS = matchMedia("(max-width: 600px)").matches ? (CFG.slotsPhone || 10) : (CFG.slots || 10);
const GOAL = Number(CFG.groupSize) || 5;  // сколько человек нужно для группы
const NICK_RE = /^[A-Za-z0-9_]{4,32}$/;
const NICK_KEY = "kino.together.tg";        // ник, запомненный в браузере
const DEMO_KEY = "kino.together.demo";      // хранилище демо-режима
const VOTER_KEY = "kino.voter";             // id участника на своём хостинге, общий с голосованием и премьерами

/* ---------- состояние ---------- */
let backend = null, myId = null, mode = "loading", canWrite = null;
let going = {};   // { uid: { tg, films: { filmId: время } } }
let added = {};   // { uid: { films: { filmId: { title, about, at } } } }
let editing = null;
const fresh = new Set();
const touch = matchMedia("(hover: none)").matches;

const $ = (s, r = document) => r.querySelector(s);
const grid = $("#grid");
const cards = new Map();

function store(key, val) {
  try { val === undefined ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}
function load(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}
const savedNick = () => going[myId]?.tg || load(NICK_KEY) || "";

function cleanNick(v) {
  return String(v || "").trim().replace(/^https?:\/\//, "").replace(/^(t\.me|telegram\.me)\//i, "").replace(/^@/, "").trim();
}

const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const WD = ["вс","пн","вт","ср","чт","пт","сб"];
function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return { day: `${d} ${MONTHS[m - 1]}` + (y !== 2026 ? ` ${y}` : ""), wd: WD[dt.getDay()] };
}
function peopleWord(n) {
  const m10 = n % 10, m100 = n % 100;
  return m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "человека" : "человек";
}

/* ---------- фильмы: свои + добавленные участниками ---------- */
function allFilms() {
  const extra = [];
  for (const [uid, rec] of Object.entries(added)) {
    for (const [fid, f] of Object.entries(rec?.films || {})) {
      if (f && typeof f.title === "string" && f.title.trim()) extra.push({ ...f, id: fid, by: uid, user: true });
    }
  }
  extra.sort((a, b) => (a.at || 0) - (b.at || 0));
  return FILMS.concat(extra);
}

function goingFor(fid) {
  const list = [];
  for (const [uid, rec] of Object.entries(going)) {
    const at = rec?.films?.[fid];
    if (at && typeof rec.tg === "string" && NICK_RE.test(rec.tg)) list.push({ uid, tg: rec.tg, at });
  }
  return list.sort((a, b) => a.at - b.at);
}

/* ---------- отрисовка ---------- */
function buildCard(f) {
  const el = document.createElement("article");
  el.className = "card";
  el.dataset.id = f.id;

  const still = document.createElement(f.user ? "div" : "a");
  still.className = "still" + (f.user ? " blank" : "");
  if (f.user) {
    const t = document.createElement("span");
    t.textContent = f.title;
    still.append(t);
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = "Добавили участники";
    still.append(tag);
    if (f.by === myId) {
      const x = document.createElement("button");
      x.className = "drop"; x.type = "button"; x.textContent = "×";
      x.setAttribute("aria-label", `Убрать фильм «${f.title}»`);
      x.title = "Убрать фильм";
      x.addEventListener("click", () => removeFilm(f.id));
      still.append(x);
    }
  } else {
    still.href = kpLink(f);
    still.target = "_blank"; still.rel = "noopener";
    const img = new Image();
    img.src = f.still; img.alt = `Кадр из фильма «${f.title}»`; img.loading = "lazy";
    still.append(img);
  }

  const body = document.createElement("div");
  body.className = "body";

  const h = document.createElement("h2");
  h.className = "title";
  if (f.user) h.textContent = f.title;
  else {
    const a = document.createElement("a");
    a.href = kpLink(f); a.target = "_blank"; a.rel = "noopener";
    a.textContent = f.title;
    h.append(a);
  }
  body.append(h);

  const meta = [f.original, f.genre, f.runtime ? `${f.runtime} мин` : ""].filter(Boolean).join(" · ");
  if (meta) { const p = document.createElement("p"); p.className = "orig"; p.textContent = meta; body.append(p); }
  if (f.about) { const p = document.createElement("p"); p.className = "syn"; p.textContent = f.about; body.append(p); }

  const go = document.createElement("div");
  go.className = "going";
  const dots = document.createElement("div");
  dots.className = "dots";
  dots.setAttribute("aria-label", `Кто идёт на «${f.title}»`);
  const cnt = document.createElement("span");
  cnt.className = "cnt";
  go.append(dots, cnt);
  body.append(go);

  // Что будет дальше — видно только тому, кто отметился
  const mineNote = document.createElement("p");
  mineNote.className = "mine-note"; mineNote.hidden = true;
  body.append(mineNote);

  const hint = document.createElement("p");
  hint.className = "hint"; hint.hidden = true;
  body.append(hint);

  el.append(still, body);
  return { el, go, dots, cnt, mineNote, hint, film: f };
}

function renderDots(c) {
  const f = c.film;
  const people = goingFor(f.id);
  const mine = people.some(p => p.uid === myId);
  const total = Math.max(SLOTS, people.length + (mine ? 0 : 1));
  const locked = mine || canWrite === false || mode === "readonly";
  c.dots.textContent = "";

  for (const p of people) {
    const url = `https://t.me/${p.tg}`;
    if (p.uid === myId) {
      const d = document.createElement("span");
      d.className = "dot on me";
      d.tabIndex = 0;
      const a = document.createElement("a");
      a.className = "nick"; a.href = url; a.target = "_blank"; a.rel = "noopener";
      a.textContent = "@" + p.tg;
      const x = document.createElement("button");
      x.className = "x"; x.type = "button"; x.textContent = "×";
      x.setAttribute("aria-label", "Убрать мою отметку");
      x.addEventListener("click", e => { e.stopPropagation(); unmark(f.id); });
      d.append(a, x);
      if (fresh.has("me:" + f.id)) { d.classList.add("pop"); fresh.delete("me:" + f.id); }
      c.dots.append(d);
    } else {
      const a = document.createElement("a");
      a.className = "dot on";
      a.href = url; a.target = "_blank"; a.rel = "noopener";
      a.setAttribute("aria-label", `@${p.tg} — написать в Telegram`);
      const s = document.createElement("span");
      s.className = "nick"; s.textContent = "@" + p.tg;
      a.append(s);
      c.dots.append(a);
    }
  }

  for (let i = people.length; i < total; i++) {
    if (editing === f.id && i === people.length) { c.dots.append(nickForm(c)); continue; }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dot off" + (locked ? " locked" : "");
    if (mine) b.title = "Вы уже идёте на этот фильм";
    else if (locked) b.title = "Отметиться можно только с доступом участника";
    else b.setAttribute("aria-label", `Отметиться: иду на «${f.title}»`);
    b.addEventListener("click", () => {
      if (mine) { const me = c.dots.querySelector(".dot.me"); me?.classList.remove("pop"); void me?.offsetWidth; me?.classList.add("pop"); return; }
      if (locked) { showHint(c, "Отметиться не получится: у вас доступ только для просмотра."); return; }
      startEdit(f.id);
    });
    c.dots.append(b);
  }

  // Цель вместо голого счётчика: первый отметившийся видит, что начал сбор группы
  const n = people.length, full = n >= GOAL;
  c.go.style.setProperty("--p", Math.min(n / GOAL, 1));
  c.go.classList.toggle("full", full);
  // Порог — минимум: после него счётчик продолжает расти
  c.cnt.textContent = full ? `${n} — группа собрана` : `${n} из ${GOAL}`;
  c.cnt.title = `Нужно минимум ${GOAL} ${peopleWord(GOAL)}, чтобы кураторы собрали группу`;
  c.mineNote.hidden = !mine;
  c.mineNote.textContent = full
    ? "Группа собрана! Куратор скоро напишет вам в Telegram."
    : "Вы в списке. Когда наберётся группа, куратор напишет вам в Telegram.";
}

function nickForm(c) {
  const form = document.createElement("form");
  form.className = "dot-form";
  form.noValidate = true;
  const at = document.createElement("span"); at.className = "at"; at.textContent = "@";
  const input = document.createElement("input");
  input.id = "nick-" + c.film.id;
  input.maxLength = 40;
  input.placeholder = "ник в Telegram";
  input.autocomplete = "off"; input.spellcheck = false;
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("aria-label", "Ваш ник в Telegram");
  input.value = savedNick();
  const ok = document.createElement("button");
  ok.type = "submit"; ok.textContent = "✓"; ok.setAttribute("aria-label", "Готово");
  form.append(at, input, ok);

  form.addEventListener("submit", e => {
    e.preventDefault();
    const nick = cleanNick(input.value);
    if (!NICK_RE.test(nick)) {
      form.classList.remove("bad"); void form.offsetWidth; form.classList.add("bad");
      showHint(c, "Ник в Telegram: от 4 до 32 латинских букв, цифр или знаков _");
      input.focus();
      return;
    }
    mark(c.film.id, nick);
  });
  input.addEventListener("keydown", e => { if (e.key === "Escape") stopEdit(); });
  form.addEventListener("focusout", () => {
    setTimeout(() => {
      if (editing === c.film.id && !form.contains(document.activeElement) && !cleanNick(input.value)) stopEdit();
    }, 120);
  });
  requestAnimationFrame(() => { input.focus(); input.select(); });
  return form;
}

function showHint(c, text) {
  c.hint.textContent = text;
  c.hint.hidden = false;
  clearTimeout(c.hintT);
  c.hintT = setTimeout(() => { c.hint.hidden = true; }, 4000);
}

function startEdit(fid) {
  const prev = editing;
  editing = fid;
  if (prev && cards.has(prev)) renderDots(cards.get(prev));
  renderDots(cards.get(fid));
}
function stopEdit() {
  const prev = editing;
  editing = null;
  if (prev && cards.has(prev)) { cards.get(prev).hint.hidden = true; renderDots(cards.get(prev)); }
}

/* Группы для перегородок: премьеры в России по половинам месяца, без даты, онлайн, от участников */
function groupKey(f) {
  if (f.user) return "user";
  if (f.online) return "online";
  if (!f.cinema) return "tba";
  return `c:${f.cinema.slice(0, 7)}:${Number(f.cinema.slice(8, 10)) <= 15 ? 1 : 2}`;
}
function groupLabel(key, films) {
  if (key === "user") return "Предложили участники";
  if (key === "tba") return "Премьера в России пока не назначена";
  if (key === "online") return "Онлайн · " + [...new Set(films.map(f => f.online))].join(", ");
  const days = films.map(f => f.cinema).sort();
  const a = fmtDate(days[0]).day, b = fmtDate(days[days.length - 1]).day;
  if (a === b) return `Премьера ${a}`;
  const [da, ma] = a.split(" "), [db_, mb] = b.split(" ");
  return ma === mb ? `Премьеры ${da}–${db_} ${ma}` : `Премьеры ${a} – ${b}`;
}
const seps = new Map();

function render() {
  const films = allFilms();
  const ids = new Set(films.map(f => f.id));
  for (const [id, c] of cards) if (!ids.has(id)) { c.el.remove(); cards.delete(id); }

  const byDate = [...new Set(films.map(groupKey).filter(k => k.startsWith("c:")))].sort();
  const order = [...byDate, "tba", "online", "user"];
  const groups = order.map(k => ({ k, films: films.filter(f => groupKey(f) === k) })).filter(g => g.films.length);
  const seq = [];
  for (const g of groups) {
    let s = seps.get(g.k);
    if (!s) { s = document.createElement("h2"); s.className = "sep"; seps.set(g.k, s); }
    s.textContent = groupLabel(g.k, g.films);
    seq.push(s);
    for (const f of g.films) {
      let c = cards.get(f.id);
      const ownerChanged = c && f.user && (c.film.by === myId) !== (f.by === myId);
      if (!c || ownerChanged) {
        const old = c;
        c = buildCard(f);
        cards.set(f.id, c);
        if (old) old.el.replaceWith(c.el);
        if (fresh.has(f.id)) { c.el.classList.add("fresh"); fresh.delete(f.id); }
      }
      c.film = f;
      seq.push(c.el);
      if (editing !== f.id) renderDots(c);
    }
  }
  for (const [k, s] of seps) if (!groups.some(g => g.k === k)) { s.remove(); seps.delete(k); }
  seq.forEach((el, i) => { if (grid.children[i] !== el) grid.insertBefore(el, grid.children[i] || null); });
}

function note(text) {
  const n = $("#note");
  n.textContent = text || "";
  n.hidden = !text;
}

/* ---------- запись ---------- */
let chain = Promise.resolve();
function write(kind, body) {
  if (mode === "demo") {
    const st = load(DEMO_KEY) || { going: {}, added: {} };
    if (body) st[kind][myId] = body; else delete st[kind][myId];
    store(DEMO_KEY, st);
    (kind === "going" ? going : added)[myId] = body || undefined;
    if (!body) delete (kind === "going" ? going : added)[myId];
    render();
    return Promise.resolve();
  }
  const run = () => backend.write(kind, body);
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p.catch(failWrite);
}
const denied = e => /permission.denied/i.test(`${e && e.code} ${e && e.message}`);
function failWrite(e) {
  if (denied(e)) {
    note("База не приняла отметку. Если вы владелец страницы, проверьте правила Firebase из README.md.");
  } else if (e && (e.code === "invalid_argument" || e.code === "not_granted")) {
    canWrite = false;
    note("Отметиться не получится: у вас доступ только для просмотра. Попросите владельца страницы дать вам доступ участника.");
  } else if (e && e.code === "quota_exceeded") {
    note("База заполнена, новые записи не сохраняются. Напишите владельцу страницы.");
  } else {
    note("Не получилось сохранить. Проверьте соединение и попробуйте ещё раз.");
  }
  render();
}

function mark(fid, nick) {
  const mine = going[myId] || { tg: nick, films: {} };
  const body = { tg: nick, films: { ...(mine.films || {}), [fid]: Date.now() }, at: Date.now() };
  store(NICK_KEY, nick);
  editing = null;
  fresh.add("me:" + fid);
  if (mode !== "demo") { going[myId] = body; render(); }
  write("going", body);
}
function unmark(fid) {
  const mine = going[myId];
  if (!mine) return;
  const films = { ...(mine.films || {}) };
  delete films[fid];
  const body = Object.keys(films).length ? { tg: mine.tg, films, at: Date.now() } : null;
  if (mode !== "demo") { if (body) going[myId] = body; else delete going[myId]; render(); }
  write("going", body);
}

function addFilm(f) {
  const mine = added[myId]?.films || {};
  const fid = "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const body = { films: { ...mine, [fid]: { ...f, at: Date.now() } } };
  fresh.add(fid);
  if (mode !== "demo") { added[myId] = body; render(); }
  write("added", body);
  return fid;
}
function removeFilm(fid) {
  const mine = { ...(added[myId]?.films || {}) };
  delete mine[fid];
  const body = Object.keys(mine).length ? { films: mine } : null;
  if (mode !== "demo") { if (body) added[myId] = body; else delete added[myId]; render(); }
  write("added", body);
  if (going[myId]?.films?.[fid]) unmark(fid);
}

/* ---------- панель «Не нашли фильм?» ---------- */
const find = $("#find"), toggle = $("#find-toggle"), form = $("#find-form"), err = $("#find-err"), okMsg = $("#find-ok");
function setFind(open) {
  find.classList.toggle("open", open);
  toggle.setAttribute("aria-expanded", String(open));
  form.hidden = !open;
  err.hidden = true;
  if (open) { okMsg.hidden = true; setTimeout(() => $("#f-title").focus(), 30); }
}
toggle.addEventListener("click", () => {
  if (mode === "readonly" || canWrite === false) {
    okMsg.textContent = "Добавлять фильмы можно только с доступом участника.";
    okMsg.hidden = false;
    return;
  }
  setFind(!find.classList.contains("open"));
});
$("#find-cancel").addEventListener("click", () => setFind(false));
form.addEventListener("submit", e => {
  e.preventDefault();
  const title = $("#f-title").value.trim().replace(/\s+/g, " ");
  if (!title) { err.textContent = "Впишите название фильма."; err.hidden = false; $("#f-title").focus(); return; }
  const dup = allFilms().find(f => f.title.toLowerCase() === title.toLowerCase());
  if (dup) {
    err.textContent = "Такой фильм уже есть в сетке.";
    err.hidden = false;
    cards.get(dup.id)?.el.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const fid = addFilm({
    title,
    about: $("#f-about").value.trim().slice(0, 180)
  });
  form.reset();
  setFind(false);
  okMsg.textContent = `«${title}» добавлен в сетку. Отметьтесь под ним, если идёте.`;
  okMsg.hidden = false;
  setTimeout(() => cards.get(fid)?.el.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
});

/* ---------- касания: первое нажатие показывает ник, второе открывает Telegram ---------- */
grid.addEventListener("click", e => {
  if (!touch) return;
  const d = e.target.closest(".dot.on");
  if (!d || e.target.closest(".x")) return;
  if (!d.classList.contains("open")) {
    e.preventDefault();
    grid.querySelectorAll(".dot.open").forEach(x => x.classList.remove("open"));
    d.classList.add("open");
  }
});
document.addEventListener("click", e => {
  if (!e.target.closest(".dot.on")) grid.querySelectorAll(".dot.open").forEach(x => x.classList.remove("open"));
});

/* ---------- хранилища ---------- */
function claudeBackend(d) {
  return {
    subscribe(kind, cb, onErr) {
      d.collection(kind).onSnapshot(snap => {
        const all = {};
        snap.docs.forEach(doc => { all[doc.id] = doc.data(); });
        cb(all, snap.metadata.fromCache);
      }, onErr);
    },
    write(kind, body) {
      const ref = d.doc(`${kind}/${myId}`);
      return body ? ref.set(body) : ref.delete();
    }
  };
}

async function firebaseBackend(fb) {
  const V = "10.12.2";
  const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const { getDatabase, ref, onValue, set } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-database.js`);
  const fdb = getDatabase(initializeApp(fb, "together"));
  const root = `together/${POLL}`;
  return {
    subscribe(kind, cb, onErr) {
      onValue(ref(fdb, `${root}/${kind}`), snap => cb(snap.val() || {}, false), onErr);
    },
    write(kind, body) {
      return set(ref(fdb, `${root}/${kind}/${myId}`), body || null);
    }
  };
}

// Премьеры хранят этот id строкой без JSON, поэтому здесь он читается напрямую, а не через load()
function voterId() {
  let id = null;
  try { id = localStorage.getItem(VOTER_KEY); } catch (e) {}
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, "");
    try { localStorage.setItem(VOTER_KEY, id); } catch (e) {}
  }
  return id;
}

/* ---------- запуск ---------- */
function startDemo(text) {
  mode = "demo";
  myId = "me";
  const st = load(DEMO_KEY) || { going: {}, added: {} };
  going = st.going || {};
  added = st.added || {};
  note(text);
  render();
}

async function start() {
  document.querySelectorAll(".goal-txt").forEach(el => { el.textContent = `${GOAL} ${peopleWord(GOAL)}`; });
  render();
  const c = window.claude;
  const fb = CFG.firebase || {};
  const forceDemo = new URLSearchParams(location.search).has("demo");

  if (c && typeof c.use === "function") {
    // claude.ai: база страницы и вход через claude.ai
    const [d, u] = await Promise.all([c.use("db").catch(() => null), c.use("user").catch(() => null)]);
    if (!d) {
      startDemo("Общие отметки сейчас недоступны, поэтому страница работает в демо-режиме: всё видно только в этом браузере.");
      return;
    }
    backend = claudeBackend(d);
    myId = u ? await u.id() : null;
    canWrite = u ? await u.can("data.write") : null;
    mode = myId ? "live" : "readonly";
    if (mode === "readonly") note("Войдите в claude.ai, чтобы отметиться. Пока вы видите, кто уже идёт.");
    else if (canWrite === false) note("У вас доступ только для просмотра: вы видите, кто идёт, но отметиться не получится.");
  } else if (forceDemo) {
    startDemo("Демо-режим (в адресе есть ?demo): отметки и добавленные фильмы видны только в этом браузере.");
    return;
  } else if (fb.apiKey && fb.databaseURL) {
    // свой хостинг: Firebase, участник опознаётся по браузеру
    try {
      backend = await firebaseBackend(fb);
    } catch (e) {
      console.error(e);
      startDemo("Не удалось подключиться к базе, поэтому страница работает в демо-режиме: всё видно только в этом браузере.");
      return;
    }
    myId = voterId();
    mode = "live";
  } else {
    startDemo("Демо-режим: отметки и добавленные фильмы видны только в этом браузере. Чтобы собираться вместе, подключите Firebase (см. README.md).");
    return;
  }

  let pending = 2;
  const timer = setTimeout(() => {
    if (pending > 0) note("Отметки пока не загрузились. Страница подхватит их сама, как только появится связь.");
  }, 10000);
  const done = fromCache => {
    if (fromCache || pending <= 0) return;
    if (--pending === 0) { clearTimeout(timer); if ($("#note").textContent.startsWith("Отметки пока")) note(""); }
  };
  const onErr = e => {
    clearTimeout(timer);
    pending = 0;
    if (mode === "demo") return;
    console.error(e);
    if (denied(e)) startDemo("Демо-режим. База Firebase пока не пускает в раздел совместных просмотров: нужно добавить правила из README.md. До тех пор отметки видны только в этом браузере.");
    else if (e.code !== "revoked") note("Отметки не загрузились. Обновите страницу чуть позже.");
  };

  backend.subscribe("going", (all, fromCache) => { if (mode === "demo") return; going = all; done(fromCache); render(); }, onErr);
  backend.subscribe("added", (all, fromCache) => { if (mode === "demo") return; added = all; done(fromCache); render(); }, onErr);
}

start();
