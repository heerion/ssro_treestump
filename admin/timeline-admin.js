/* ============================================================
   연표 편집기 — js/data.js 를 건드리지 않고 브라우저 안에서만
   활동 연혁을 다듬어 본 뒤, 비밀번호로 바로 저장하거나 코드/파일로
   내보내는 도구입니다. 편집기 자체는 서버가 없지만, '저장'은 별도로
   배포한 저장 중계 서버(Cloudflare Worker, worker/ 폴더 참고)에
   비밀번호와 연표 데이터만 보냅니다 — GitHub 토큰은 그 서버에만
   있고 브라우저에는 없습니다. 서버 주소가 없으면 아래 6번의 수동
   내보내기(다운로드·코드 복사)로 data.js 를 손으로 바꿔야 합니다.
   ------------------------------------------------------------
   1. 상태 관리 (연도별 활동 데이터, 임시 저장)
   2. 편집 화면 그리기
   3. 미리보기 그리기 (js/timeline-core.js 재사용)
   4. 코드 생성 (연표 블록)
   5. 저장 (중계 서버 + 비밀번호)
   6. 수동 내보내기 (다운로드 · 코드 복사)
   ============================================================ */

(function(){

const DRAFT_KEY = "ssro-treestump:timeline-draft:v1";
const PW_KEY = "ssro-treestump:save-password:v1";
const START = 2009;
const MONTHS = Array.from({length:12}, (_, i) => String(i + 1).padStart(2, "0"));

const $ = id => document.getElementById(id);
const clone = obj => (window.structuredClone ? structuredClone(obj) : JSON.parse(JSON.stringify(obj)));

function esc(s){ return TimelineCore.esc(s); }

/* ============================================================
   1. 상태
   ============================================================ */
let years = {};                 /* 편집 중인 데이터: { 2026: [{m,t,d}, ...], ... } */
let saveTimer = null;
let previewTimer = null;

function baseYearsFromData(){
  return (typeof DATA !== "undefined" && DATA && DATA.years) ? clone(DATA.years) : {};
}

function loadDraft(){
  try{
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.years !== "object") return null;
    return parsed;
  }catch{ return null; }
}

function scheduleSave(){
  $("saveState").textContent = "저장하는 중…";
  $("saveState").classList.remove("saved");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try{
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ years, savedAt: Date.now() }));
      const t = new Date().toLocaleTimeString("ko-KR", { hour:"2-digit", minute:"2-digit" });
      $("saveState").textContent = `임시 저장됨 · ${t}`;
      $("saveState").classList.add("saved");
    }catch(err){
      $("saveState").textContent = "임시 저장 실패 (브라우저 저장 공간 확인 필요)";
    }
  }, 350);
}

function schedulePreview(){
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 200);
}

/* ============================================================
   2. 편집 화면
   ============================================================ */
function sortedYears(){
  return Object.keys(years).map(Number).sort((a, b) => b - a);
}

function renderEditor(focusYear){
  const box = $("yearList");
  const list = sortedYears();

  if (!list.length){
    box.innerHTML = `<p class="admin-no-years">아직 연도가 없어요. 위의 '+ 연도 추가'로 시작해 보세요.</p>`;
    return;
  }

  box.innerHTML = list.map(y => {
    const items = years[y] || [];
    const entriesHTML = items.length
      ? items.map((it, idx) => entryRowHTML(y, it, idx, items.length)).join("")
      : `<p class="admin-empty-note">이 해엔 아직 활동이 없어요. 아래에서 추가해 보세요.</p>`;
    return `
    <div class="admin-year" data-year="${y}">
      <div class="admin-year-head">
        <input class="yr-input" type="number" inputmode="numeric" value="${y}" data-role="year-input" aria-label="${y}년 연도 수정">
        <span class="yr-count">${items.length ? `기록 ${items.length}건` : "기록 없음"}</span>
        <button class="admin-icon-btn danger" type="button" data-role="remove-year">연도 삭제</button>
      </div>
      <div class="admin-entries">${entriesHTML}</div>
      <div class="admin-year-foot">
        <button class="admin-add-entry" type="button" data-role="add-entry">+ 이 해에 활동 추가</button>
      </div>
    </div>`;
  }).join("");

  if (focusYear != null){
    const el = box.querySelector(`.admin-year[data-year="${focusYear}"] [data-role="year-input"]`);
    if (el){ el.focus(); el.select(); }
  }
}

function entryRowHTML(y, it, idx, total){
  const monthOpts = MONTHS.map(m =>
    `<option value="${m}"${m === it.m ? " selected" : ""}>${Number(m)}월</option>`).join("");
  return `
  <div class="admin-entry" data-idx="${idx}">
    <select data-role="entry-m" aria-label="월">${monthOpts}</select>
    <div class="entry-fields">
      <input type="text" data-role="entry-t" placeholder="활동 이름" value="${esc(it.t)}" aria-label="활동 이름">
      <textarea data-role="entry-d" placeholder="한두 문장 설명 (생략 가능)" rows="1" aria-label="설명">${esc(it.d || "")}</textarea>
    </div>
    <div class="admin-entry-actions">
      <button class="admin-icon-btn" type="button" data-role="move-up" ${idx === 0 ? "disabled" : ""} aria-label="위로 이동">▲</button>
      <button class="admin-icon-btn" type="button" data-role="move-down" ${idx === total - 1 ? "disabled" : ""} aria-label="아래로 이동">▼</button>
      <button class="admin-icon-btn danger" type="button" data-role="remove-entry" aria-label="이 활동 삭제">✕</button>
    </div>
  </div>`;
}

/* 연도 추가·삭제·이동, 활동 추가·삭제·이동은 구조가 바뀌므로 화면을 통째로 다시 그립니다.
   글자를 입력하는 칸은 상태만 바꾸고 다시 그리지 않아, 입력 중 커서가 튀지 않습니다. */
function addYear(){
  const existing = sortedYears();
  let y = (existing[0] || START - 1) + 1;
  while (years[y] !== undefined) y++;
  years[y] = [{ m:"01", t:"", d:"" }];
  renderEditor(y);
  schedulePreview();
  scheduleSave();
}

function removeYear(y){
  if (!confirm(`${y}년 기록을 전부 지울까요? 되돌릴 수 없어요.`)) return;
  delete years[y];
  renderEditor();
  schedulePreview();
  scheduleSave();
}

function renameYear(oldY, newYRaw){
  const newY = parseInt(newYRaw, 10);
  const card = document.querySelector(`.admin-year[data-year="${oldY}"] [data-role="year-input"]`);
  if (!Number.isInteger(newY) || newY < 1900 || newY > 2999){
    if (card) card.value = oldY;
    flashNote("연도는 1900~2999 사이의 숫자로 적어 주세요.", true);
    return;
  }
  if (newY === oldY) return;
  if (years[newY] !== undefined){
    if (card) card.value = oldY;
    flashNote(`${newY}년은 이미 있어요. 두 연도를 하나로 합치려면 활동을 옮겨 적어 주세요.`, true);
    return;
  }
  years[newY] = years[oldY];
  delete years[oldY];
  renderEditor(newY);
  schedulePreview();
  scheduleSave();
}

function addEntry(y){
  years[y].push({ m:"01", t:"", d:"" });
  renderEditor(y);
  const box = document.querySelector(`.admin-year[data-year="${y}"] .admin-entries`);
  const last = box && box.querySelector(".admin-entry:last-child [data-role='entry-t']");
  if (last) last.focus();
  schedulePreview();
  scheduleSave();
}

function removeEntry(y, idx){
  years[y].splice(idx, 1);
  renderEditor();
  schedulePreview();
  scheduleSave();
}

function moveEntry(y, idx, dir){
  const arr = years[y];
  const j = idx + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[idx], arr[j]] = [arr[j], arr[idx]];
  renderEditor();
  schedulePreview();
  scheduleSave();
}

/* 입력 칸에 타이핑할 때: 상태만 바꾸고 화면은 다시 그리지 않습니다 */
$("yearList").addEventListener("input", e => {
  const entryEl = e.target.closest(".admin-entry");
  if (!entryEl) return;
  const yearEl = e.target.closest(".admin-year");
  const y = Number(yearEl.dataset.year);
  const idx = Number(entryEl.dataset.idx);
  const role = e.target.dataset.role;
  if (role === "entry-t") years[y][idx].t = e.target.value;
  else if (role === "entry-d") years[y][idx].d = e.target.value;
  else return;
  schedulePreview();
  scheduleSave();
});

$("yearList").addEventListener("change", e => {
  const role = e.target.dataset.role;
  if (role === "year-input"){
    const yearEl = e.target.closest(".admin-year");
    renameYear(Number(yearEl.dataset.year), e.target.value);
    return;
  }
  if (role === "entry-m"){
    const yearEl = e.target.closest(".admin-year");
    const entryEl = e.target.closest(".admin-entry");
    years[Number(yearEl.dataset.year)][Number(entryEl.dataset.idx)].m = e.target.value;
    schedulePreview();
    scheduleSave();
  }
});

$("yearList").addEventListener("click", e => {
  const btn = e.target.closest("button[data-role]");
  if (!btn) return;
  const yearEl = e.target.closest(".admin-year");
  const y = yearEl ? Number(yearEl.dataset.year) : null;
  const entryEl = e.target.closest(".admin-entry");
  const idx = entryEl ? Number(entryEl.dataset.idx) : null;

  if (btn.dataset.role === "remove-year") removeYear(y);
  else if (btn.dataset.role === "add-entry") addEntry(y);
  else if (btn.dataset.role === "remove-entry") removeEntry(y, idx);
  else if (btn.dataset.role === "move-up") moveEntry(y, idx, -1);
  else if (btn.dataset.role === "move-down") moveEntry(y, idx, 1);
});

$("addYearBtn").onclick = addYear;

/* ============================================================
   3. 미리보기 — 실제 사이트와 같은 함수로 그립니다
   ============================================================ */
/* 미리보기는 '지금 이렇게 저장돼요' 를 바로 확인하는 용도라, 실제
   사이트처럼 눌러서 펼치는 아코디언이 아니라 모든 연도의 활동을
   처음부터 전부 펼쳐서 보여줍니다 (css/timeline-admin.css 의
   .admin-preview .yr-body 규칙). 나이테를 누르면 그 연도로 스크롤만
   이동합니다. */
function renderPreview(){
  const { list } = TimelineCore.yearRange(years, START);
  const pvStump = $("pvStump");
  pvStump.innerHTML = "";
  const { svg } = TimelineCore.buildRingsSvg(list, years, y => scrollPreviewToYear(y));
  pvStump.appendChild(svg);

  const { mainHTML, restHTML, restYears } = TimelineCore.buildYearListHTML(list, years, { start: START, showCount: 5 });
  const pvYears = $("pvYears");
  pvYears.innerHTML = mainHTML + (restYears.length ? restHTML : "");
  pvYears.querySelectorAll(".rv").forEach(el => el.classList.add("in"));

  updateCodePreview();
}

function scrollPreviewToYear(y){
  const el = document.querySelector(`#pvYears .yr[data-y="${y}"]`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ============================================================
   4. 코드 생성 · 내보내기
   ============================================================ */
function jsStr(v){ return JSON.stringify(String(v ?? "")); }

function generateYearsObject(){
  const keys = sortedYears();
  if (!keys.length) return "{\n  }";
  const body = keys.map(y => {
    const items = years[y] || [];
    if (!items.length) return `    ${y}: []`;
    const rows = items.map(it =>
      `      { m:${jsStr(it.m)}, t:${jsStr(it.t)}, d:${jsStr(it.d)} }`
    ).join(",\n");
    return `    ${y}: [\n${rows}\n    ]`;
  }).join(",\n");
  return `{\n${body}\n  }`;
}

function generateYearsCode(){
  return `  years: ${generateYearsObject()}`;
}

function updateCodePreview(){
  $("codePreview").textContent = generateYearsCode();
}

function findMatchingBrace(text, openIdx){
  let i = openIdx, depth = 0;
  while (i < text.length){
    const c = text[i];
    if (c === '"' || c === "'" || c === "`"){
      const quote = c; i++;
      while (i < text.length && text[i] !== quote){
        if (text[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "/"){
      const nl = text.indexOf("\n", i);
      i = nl === -1 ? text.length : nl + 1;
      continue;
    }
    if (c === "/" && text[i + 1] === "*"){
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}"){
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

function replaceYearsBlock(sourceText){
  const m = /years\s*:\s*\{/.exec(sourceText);
  if (!m) throw new Error("data.js에서 'years' 항목을 찾지 못했습니다. 파일이 바뀌었는지 확인해 주세요.");
  const openIdx = m.index + m[0].length - 1;
  const closeIdx = findMatchingBrace(sourceText, openIdx);
  if (closeIdx === -1) throw new Error("data.js의 'years' 괄호 짝을 맞추지 못했습니다.");
  return sourceText.slice(0, openIdx) + generateYearsObject() + sourceText.slice(closeIdx + 1);
}

/* ============================================================
   5. 저장 — 중계 서버(Cloudflare Worker)에 비밀번호만 보내 저장
   ------------------------------------------------------------
   GitHub 토큰은 브라우저에 두지 않습니다. 비밀번호와 연표 데이터를
   저장 중계 서버로 보내면, 서버가 대신 GitHub에 커밋합니다. 서버를
   만드는 방법은 worker/README.md 를 보세요.
   ============================================================ */

/* 관리자가 worker/README.md 대로 Cloudflare Worker를 배포한 뒤,
   여기에 그 주소를 한 번만 넣어 주세요. 위원들은 이 값을 몰라도 되고
   비밀번호만 알면 됩니다. */
const SAVE_ENDPOINT = "";

let pw = "";

function loadPw(){
  try{
    const raw = localStorage.getItem(PW_KEY);
    if (!raw) return;
    pw = (JSON.parse(raw) || {}).password || "";
  }catch{}
}

function savePw(){
  const remember = $("pwRemember").checked;
  try{
    if (remember) localStorage.setItem(PW_KEY, JSON.stringify({ password: pw }));
    else localStorage.removeItem(PW_KEY);
  }catch{}
}

function flashPw(msg, isError){
  const el = $("pwNote");
  el.textContent = msg;
  el.classList.toggle("error", !!isError);
  el.classList.toggle("ok", !isError);
}

async function callSaveEndpoint(payload){
  if (!SAVE_ENDPOINT){
    throw new Error("아직 저장 서버 주소가 설정되지 않았어요. '관리자 설정'을 펼쳐서 안내를 확인해 주세요.");
  }
  let res;
  try{
    res = await fetch(SAVE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }catch{
    throw new Error("저장 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
  }
  let data = null;
  try{ data = await res.json(); }catch{}
  if (!res.ok){
    throw new Error((data && data.error) || `저장 서버 오류 (${res.status})`);
  }
  return data;
}

$("pwCheckBtn").onclick = async () => {
  pw = $("pwInput").value;
  const btn = $("pwCheckBtn");
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "확인 중…";
  try{
    await callSaveEndpoint({ password: pw, dryRun: true });
    flashPw("비밀번호가 맞아요. 이제 '저장'을 누르면 바로 반영돼요.");
    savePw();
  }catch(err){
    flashPw(err.message, true);
  }finally{
    btn.disabled = false;
    btn.textContent = label;
  }
};

$("pwSaveBtn").onclick = async () => {
  pw = $("pwInput").value;
  if (!pw){
    flashPw("비밀번호를 넣어 주세요.", true);
    $("pwInput").focus();
    return;
  }
  const btn = $("pwSaveBtn");
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "저장하는 중…";
  try{
    await callSaveEndpoint({ password: pw, years });
    savePw();
    const t = new Date().toLocaleTimeString("ko-KR", { hour:"2-digit", minute:"2-digit" });
    $("pwSaveState").textContent = `저장됨 · ${t}`;
    flashPw("저장했어요. 사이트에는 보통 1분 안팎이면 반영돼요.");
  }catch(err){
    console.error(err);
    flashPw(err.message || "저장하지 못했어요.", true);
  }finally{
    btn.disabled = false;
    btn.textContent = label;
  }
};

$("pwInput").addEventListener("change", () => { pw = $("pwInput").value; savePw(); });
$("pwRemember").addEventListener("change", savePw);

/* ============================================================
   6. 수동 내보내기 (다운로드 · 코드 복사)
   ============================================================ */
function flashNote(msg, isError){
  const el = $("exportNote");
  el.textContent = msg;
  el.classList.toggle("error", !!isError);
  el.classList.toggle("ok", !isError);
}

function downloadText(filename, text){
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

$("copyCodeBtn").onclick = async () => {
  const code = generateYearsCode();
  try{
    await navigator.clipboard.writeText(code);
    flashNote("연표 코드를 복사했어요. js/data.js 의 years: {...} 부분과 통째로 바꿔 넣으세요.");
  }catch{
    flashNote("복사가 막혀 있어요. 아래 '내보낼 코드 미리 보기'에서 직접 선택해 복사해 주세요.", true);
  }
};

$("downloadBtn").onclick = async () => {
  try{
    const res = await fetch("../js/data.js", { cache: "no-store" });
    if (!res.ok) throw new Error("status " + res.status);
    const original = await res.text();
    const updated = replaceYearsBlock(original);
    downloadText("data.js", updated);
    flashNote("data.js를 내려받았어요. 이 파일로 기존 js/data.js를 바꾼 뒤 다시 올리면 반영됩니다.");
  }catch(err){
    console.error(err);
    flashNote("data.js를 직접 읽어오지 못했어요 (로컬 파일에서 열었을 때 흔한 문제예요). 대신 '연표 코드만 복사'를 눌러 js/data.js의 years 부분을 손으로 바꿔 주세요.", true);
  }
};

$("resetBtn").onclick = () => {
  if (!confirm("지금까지 편집기에서 바꾼 내용을 지우고 js/data.js 내용으로 되돌릴까요?")) return;
  years = baseYearsFromData();
  localStorage.removeItem(DRAFT_KEY);
  renderEditor();
  renderPreview();
  $("saveState").textContent = "저장할 변경 없음";
  $("saveState").classList.remove("saved");
  flashNote("js/data.js 내용으로 되돌렸어요.");
};

/* ============================================================
   시작 — 임시 저장본이 있으면 이어할지 물어봅니다
   ============================================================ */
function boot(years0){
  years = years0;
  renderEditor();
  renderPreview();
}

function init(){
  if (typeof DATA === "undefined" || !DATA){
    $("yearList").innerHTML = `<p class="admin-no-years">js/data.js를 불러오지 못했어요. 파일이 있는지, 문법이 맞는지 확인해 주세요.</p>`;
    return;
  }

  loadPw();
  $("pwInput").value = pw;
  if (!SAVE_ENDPOINT) $("adminSettings").open = true;

  const draft = loadDraft();
  if (draft && Object.keys(draft.years).length){
    $("draftBanner").hidden = false;
    $("resumeDraft").onclick = () => {
      $("draftBanner").hidden = true;
      boot(draft.years);
    };
    $("discardDraft").onclick = () => {
      localStorage.removeItem(DRAFT_KEY);
      $("draftBanner").hidden = true;
      boot(baseYearsFromData());
    };
    /* 미리 볼 수 있게 우선 draft로 그려 둡니다 (선택 전) */
    boot(draft.years);
  } else {
    boot(baseYearsFromData());
  }
}

init();

})();
