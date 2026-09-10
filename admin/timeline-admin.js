/* ============================================================
   연표 편집기 — js/data.js 를 건드리지 않고 브라우저 안에서만
   활동 연혁을 다듬어 본 뒤, GitHub에 바로 저장하거나 코드/파일로
   내보내는 도구입니다. 서버는 없습니다. 'GitHub에 저장'은 이
   브라우저에서 GitHub REST API를 직접 호출해 커밋하는 방식이고,
   그러지 않으면 내보낸 data.js 로 파일을 손으로 바꿔야 합니다.
   ------------------------------------------------------------
   1. 상태 관리 (연도별 활동 데이터, 임시 저장)
   2. 편집 화면 그리기
   3. 미리보기 그리기 (js/timeline-core.js 재사용)
   4. 코드 생성 (연표 블록)
   5. GitHub에 직접 저장
   6. 수동 내보내기 (다운로드 · 코드 복사)
   ============================================================ */

(function(){

const DRAFT_KEY = "ssro-treestump:timeline-draft:v1";
const GH_KEY = "ssro-treestump:github-settings:v1";
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
let pvOpenYear = null;
let pvRingEls = {};

function renderPreview(){
  const { list } = TimelineCore.yearRange(years, START);
  const pvStump = $("pvStump");
  pvStump.innerHTML = "";
  const { svg, ringEls } = TimelineCore.buildRingsSvg(list, years, y => togglePreviewYear(y));
  pvStump.appendChild(svg);
  pvRingEls = ringEls;

  const { mainHTML, restHTML, restYears } = TimelineCore.buildYearListHTML(list, years, { start: START, showCount: 5 });
  const pvYears = $("pvYears");
  pvYears.innerHTML = mainHTML + (restYears.length ? restHTML : "");
  pvYears.querySelectorAll(".rv").forEach(el => el.classList.add("in"));

  applyPreviewOpenState();
  updateCodePreview();
}

function togglePreviewYear(y){
  pvOpenYear = pvOpenYear === y ? null : y;
  applyPreviewOpenState();
}

function applyPreviewOpenState(){
  document.querySelectorAll("#pvYears .yr").forEach(el => {
    el.classList.toggle("on", Number(el.dataset.y) === pvOpenYear);
  });
  Object.entries(pvRingEls).forEach(([k, g]) => {
    g.classList.toggle("on", Number(k) === pvOpenYear);
  });
}

$("pvYears").addEventListener("click", e => {
  const h = e.target.closest(".yr-head");
  if (h) togglePreviewYear(Number(h.closest(".yr").dataset.y));
});

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
   5. GitHub에 직접 저장
   ------------------------------------------------------------
   브라우저에서 GitHub REST API를 호출해 js/data.js를 그 자리에서
   커밋합니다. 토큰은 이 브라우저의 localStorage에만 남고, GitHub API
   말고 다른 곳으로는 전송되지 않습니다. 커밋이 올라가면 GitHub
   Pages/Netlify/Vercel이 알아서 다시 배포합니다.
   ============================================================ */
let gh = { owner: "", repo: "", branch: "main", token: "" };

function loadGhSettings(){
  try{
    const raw = localStorage.getItem(GH_KEY);
    if (!raw) return;
    gh = { ...gh, ...JSON.parse(raw) };
  }catch{}
}

function saveGhSettings(){
  const remember = $("ghRemember").checked;
  const toSave = remember ? gh : { owner: gh.owner, repo: gh.repo, branch: gh.branch, token: "" };
  try{ localStorage.setItem(GH_KEY, JSON.stringify(toSave)); }catch{}
}

function readGhFieldsIntoState(){
  gh.owner = $("ghOwner").value.trim();
  gh.repo = $("ghRepo").value.trim();
  gh.branch = $("ghBranch").value.trim() || "main";
  gh.token = $("ghToken").value.trim();
}

function fillGhFields(){
  $("ghOwner").value = gh.owner;
  $("ghRepo").value = gh.repo;
  $("ghBranch").value = gh.branch || "main";
  $("ghToken").value = gh.token;
}

function setGhStatus(text, state){
  const el = $("ghStatus");
  el.textContent = text;
  el.classList.remove("on", "error");
  if (state) el.classList.add(state);
}

function flashGh(msg, isError){
  const el = $("ghNote");
  el.textContent = msg;
  el.classList.toggle("error", !!isError);
  el.classList.toggle("ok", !isError);
}

function ghHeaders(){
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${gh.token}`,
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

async function ghErrorFrom(res){
  let detail = "";
  try{ const j = await res.json(); detail = j.message || ""; }catch{}
  const known = {
    401: "토큰이 올바르지 않아요. 새로 발급해 다시 넣어 주세요.",
    403: "권한이 부족해요. 토큰에 이 저장소의 Contents 읽기/쓰기 권한이 있는지 확인해 주세요.",
    404: "저장소나 파일을 찾을 수 없어요. 소유자·저장소·브랜치 이름을 확인해 주세요."
  };
  return new Error(known[res.status] || `GitHub 응답 오류 (${res.status})${detail ? " · " + detail : ""}`);
}

/* GitHub Contents API는 base64로 주고받습니다. 한글이 섞여 있으므로
   UTF-8 바이트 단위로 안전하게 변환합니다. */
function utf8ToBase64(str){
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

function base64ToUtf8(b64){
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function ghGetDataFile(){
  const url = `https://api.github.com/repos/${encodeURIComponent(gh.owner)}/${encodeURIComponent(gh.repo)}/contents/js/data.js?ref=${encodeURIComponent(gh.branch)}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) throw await ghErrorFrom(res);
  return res.json();
}

async function checkGhConnection(quiet){
  if (!gh.owner || !gh.repo || !gh.token){
    setGhStatus(quiet ? "연결 안 됨" : "정보 부족", quiet ? null : "error");
    if (!quiet) flashGh("소유자·저장소 이름·토큰을 모두 넣어 주세요.", true);
    return false;
  }
  if (!quiet) setGhStatus("확인 중…");
  try{
    await ghGetDataFile();
    setGhStatus("연결됨", "on");
    if (!quiet) flashGh(`${gh.owner}/${gh.repo} (${gh.branch}) 에 연결됐어요.`);
    return true;
  }catch(err){
    setGhStatus("연결 안 됨", "error");
    if (!quiet) flashGh(err.message, true);
    return false;
  }
}

$("ghCheckBtn").onclick = async () => {
  readGhFieldsIntoState();
  const ok = await checkGhConnection(false);
  if (ok) saveGhSettings();
};

$("ghClearBtn").onclick = () => {
  gh.token = "";
  $("ghToken").value = "";
  try{ localStorage.setItem(GH_KEY, JSON.stringify({ owner: gh.owner, repo: gh.repo, branch: gh.branch, token: "" })); }catch{}
  setGhStatus("연결 안 됨");
  flashGh("저장된 토큰을 지웠어요. 저장소 정보는 남겨 뒀어요.");
};

$("ghSaveBtn").onclick = async () => {
  readGhFieldsIntoState();
  if (!gh.owner || !gh.repo || !gh.token){
    $("ghSettings").open = true;
    flashGh("먼저 위 'GitHub 연결 설정'에서 저장소 정보와 토큰을 넣어 주세요.", true);
    return;
  }
  const btn = $("ghSaveBtn");
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "저장하는 중…";
  try{
    const file = await ghGetDataFile();
    const original = base64ToUtf8(file.content);
    const updated = replaceYearsBlock(original);
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(gh.owner)}/${encodeURIComponent(gh.repo)}/contents/js/data.js`,
      {
        method: "PUT",
        headers: { ...ghHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `연표 업데이트 (연표 편집기) · ${new Date().toLocaleString("ko-KR")}`,
          content: utf8ToBase64(updated),
          sha: file.sha,
          branch: gh.branch
        })
      }
    );
    if (!res.ok) throw await ghErrorFrom(res);
    setGhStatus("연결됨", "on");
    saveGhSettings();
    const t = new Date().toLocaleTimeString("ko-KR", { hour:"2-digit", minute:"2-digit" });
    $("ghSaveState").textContent = `GitHub에 저장됨 · ${t}`;
    flashGh("GitHub에 저장했어요. 사이트에는 보통 1분 안팎이면 반영돼요.");
  }catch(err){
    console.error(err);
    flashGh(err.message || "저장하지 못했어요.", true);
  }finally{
    btn.disabled = false;
    btn.textContent = label;
  }
};

["ghOwner", "ghRepo", "ghBranch", "ghToken"].forEach(id => {
  $(id).addEventListener("change", () => { readGhFieldsIntoState(); saveGhSettings(); });
});
$("ghRemember").addEventListener("change", saveGhSettings);

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

/* GitHub Pages 프로젝트 페이지(<owner>.github.io/<repo>/...)에서 열었다면
   소유자·저장소 이름을 짐작해 미리 채워 둡니다. 이미 저장된 값이 있으면
   건드리지 않습니다. 다른 곳(Netlify, Vercel, 커스텀 도메인 등)에서는
   그냥 비워 두고 직접 입력하면 됩니다. */
function guessGhDefaults(){
  const m = /^([^.]+)\.github\.io$/.exec(location.hostname);
  if (!m) return;
  const seg = location.pathname.split("/").filter(Boolean)[0];
  if (!gh.owner) gh.owner = m[1];
  if (!gh.repo && seg) gh.repo = seg;
}

function init(){
  if (typeof DATA === "undefined" || !DATA){
    $("yearList").innerHTML = `<p class="admin-no-years">js/data.js를 불러오지 못했어요. 파일이 있는지, 문법이 맞는지 확인해 주세요.</p>`;
    return;
  }

  loadGhSettings();
  guessGhDefaults();
  fillGhFields();
  if (gh.owner && gh.repo && gh.token) checkGhConnection(true);

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
