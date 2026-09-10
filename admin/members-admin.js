/* ============================================================
   위원 편집기 — js/data.js 를 건드리지 않고 브라우저 안에서만
   위원 소개를 다듬어 본 뒤, 비밀번호로 바로 저장하거나 코드/파일로
   내보내는 도구입니다. 사진은 선택하는 즉시 브라우저에서 알맞은
   크기로 줄이고, '저장'을 누를 때 비로소 저장 중계 서버로 올라갑니다
   (worker/README.md 참고). 서버 주소가 없으면 아래 수동 내보내기로
   data.js 를 손으로 바꿔야 하고, 이때는 사진도 직접 올려야 합니다.
   ------------------------------------------------------------
   1. 상태 관리 (위원 목록, 임시 저장)
   2. 편집 화면 그리기
   3. 사진 선택 · 크기 줄이기
   4. 미리보기 그리기 (js/member-core.js 재사용)
   5. 코드 생성 (위원 블록)
   6. 저장 (중계 서버 + 비밀번호, save-panel.js 재사용)
   7. 수동 내보내기 (다운로드 · 코드 복사)
   ============================================================ */

(function(){

const DRAFT_KEY = "ssro-treestump:members-draft:v1";
const PW_KEY = "ssro-treestump:save-password:v1";
const MAX_PHOTO_DIM = 320;
const PHOTO_QUALITY = 0.85;

const $ = id => document.getElementById(id);
const clone = obj => (window.structuredClone ? structuredClone(obj) : JSON.parse(JSON.stringify(obj)));
const esc = TimelineCore.esc;

/* ============================================================
   1. 상태
   ============================================================ */
let members = [];               /* [{ role, name, term, word, tags:[], photo, _pendingPhoto? }] */
let saveTimer = null;
let previewTimer = null;

function baseMembersFromData(){
  return (typeof DATA !== "undefined" && DATA && DATA.members) ? clone(DATA.members) : [];
}

function loadDraft(){
  try{
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.members)) return null;
    return parsed;
  }catch{ return null; }
}

function scheduleSave(){
  $("saveState").textContent = "저장하는 중…";
  $("saveState").classList.remove("saved");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try{
      const plain = members.map(({ _pendingPhoto, ...rest }) => rest);
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ members: plain, savedAt: Date.now() }));
      const t = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
      $("saveState").textContent = `임시 저장됨 · ${t}`;
      $("saveState").classList.add("saved");
    }catch{
      $("saveState").textContent = "임시 저장 실패 (브라우저 저장 공간 확인 필요)";
    }
  }, 350);
}

function schedulePreview(){
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 150);
}

/* ============================================================
   2. 편집 화면
   ============================================================ */
function renderEditor(focusIdx){
  const box = $("memberList");

  if (!members.length){
    box.innerHTML = `<p class="admin-no-years">아직 위원이 없어요. 위의 '+ 위원 추가'로 시작해 보세요.</p>`;
    return;
  }

  box.innerHTML = members.map((m, i) => memberRowHTML(m, i)).join("");

  if (focusIdx != null){
    const el = box.querySelector(`.admin-member[data-idx="${focusIdx}"] [data-role="f-name"]`);
    if (el){ el.focus(); el.select(); }
  }
}

function memberRowHTML(m, idx){
  const photoSrc = m._pendingPhoto ? m._pendingPhoto.previewUrl : m.photo;
  const avatar = photoSrc
    ? `<img src="${esc(photoSrc)}" alt="">`
    : `<div class="admin-photo-placeholder">${esc((m.name || "?").slice(0, 1))}</div>`;
  const tagsText = (m.tags || []).join(", ");

  return `
  <div class="admin-member" data-idx="${idx}">
    <div class="admin-member-photo">
      ${avatar}
      <button class="admin-photo-btn" type="button" data-role="pick-photo">사진 선택</button>
      <input type="file" accept="image/*" data-role="photo-file" aria-label="사진 파일 선택">
      ${photoSrc ? `<button class="admin-photo-remove" type="button" data-role="remove-photo">사진 빼기</button>` : ""}
      <p class="admin-photo-note">저장을 눌러야 반영돼요</p>
    </div>
    <div class="admin-member-fields">
      <label>역할<input type="text" data-role="f-role" value="${esc(m.role)}" placeholder="위원장, 총무, 위원…"></label>
      <label>이름<input type="text" data-role="f-name" value="${esc(m.name)}" placeholder="이름"></label>
      <label>기수·연차<input type="text" data-role="f-term" value="${esc(m.term)}" placeholder="2026 · 1년차"></label>
      <label>태그 (쉼표로 구분)<input type="text" data-role="f-tags" value="${esc(tagsText)}" placeholder="#기획, #진행"></label>
      <label class="admin-field-wide">한 줄 소개<textarea data-role="f-word" rows="2" placeholder="한 줄 소개">${esc(m.word || "")}</textarea></label>
    </div>
    <div class="admin-member-actions">
      <button class="admin-icon-btn" type="button" data-role="move-up" ${idx === 0 ? "disabled" : ""} aria-label="위로 이동">▲</button>
      <button class="admin-icon-btn" type="button" data-role="move-down" ${idx === members.length - 1 ? "disabled" : ""} aria-label="아래로 이동">▼</button>
      <button class="admin-icon-btn danger" type="button" data-role="remove-member" aria-label="위원 삭제">✕</button>
    </div>
  </div>`;
}

function addMember(){
  members.push({ role: "위원", name: "", term: "", word: "", tags: [], photo: "" });
  const idx = members.length - 1;
  renderEditor(idx);
  schedulePreview();
  scheduleSave();
}

function removeMember(idx){
  if (!confirm("이 위원 정보를 지울까요? 되돌릴 수 없어요.")) return;
  revokePendingPhoto(members[idx]);
  members.splice(idx, 1);
  renderEditor();
  schedulePreview();
  scheduleSave();
}

function moveMember(idx, dir){
  const j = idx + dir;
  if (j < 0 || j >= members.length) return;
  [members[idx], members[j]] = [members[j], members[idx]];
  renderEditor();
  schedulePreview();
  scheduleSave();
}

$("addMemberBtn").onclick = addMember;

/* 입력 칸에 타이핑할 때: 상태만 바꾸고 화면은 다시 그리지 않습니다 */
$("memberList").addEventListener("input", e => {
  const rowEl = e.target.closest(".admin-member");
  if (!rowEl) return;
  const idx = Number(rowEl.dataset.idx);
  const role = e.target.dataset.role;
  if (role === "f-role") members[idx].role = e.target.value;
  else if (role === "f-name") members[idx].name = e.target.value;
  else if (role === "f-term") members[idx].term = e.target.value;
  else if (role === "f-word") members[idx].word = e.target.value;
  else if (role === "f-tags") members[idx].tags = e.target.value.split(",").map(t => t.trim()).filter(Boolean);
  else return;
  schedulePreview();
  scheduleSave();
});

$("memberList").addEventListener("click", e => {
  const btn = e.target.closest("button[data-role]");
  if (!btn) return;
  const rowEl = e.target.closest(".admin-member");
  const idx = Number(rowEl.dataset.idx);

  if (btn.dataset.role === "remove-member") removeMember(idx);
  else if (btn.dataset.role === "move-up") moveMember(idx, -1);
  else if (btn.dataset.role === "move-down") moveMember(idx, 1);
  else if (btn.dataset.role === "pick-photo") rowEl.querySelector('[data-role="photo-file"]').click();
  else if (btn.dataset.role === "remove-photo"){
    revokePendingPhoto(members[idx]);
    members[idx].photo = "";
    delete members[idx]._pendingPhoto;
    renderEditor();
    schedulePreview();
    scheduleSave();
  }
});

/* ============================================================
   3. 사진 선택 · 크기 줄이기
   ------------------------------------------------------------
   고른 사진은 바로 320px 이하로 줄여 미리보기에 쓰고, 실제 GitHub
   업로드는 '저장'을 누를 때 한 번에 이뤄집니다(6번 참고).
   ============================================================ */
$("memberList").addEventListener("change", async e => {
  if (e.target.dataset.role !== "photo-file") return;
  const rowEl = e.target.closest(".admin-member");
  const idx = Number(rowEl.dataset.idx);
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")){
    flashNote("이미지 파일만 선택할 수 있어요.", true);
    return;
  }
  try{
    const blob = await resizeImageToJpeg(file, MAX_PHOTO_DIM, PHOTO_QUALITY);
    revokePendingPhoto(members[idx]);
    members[idx]._pendingPhoto = { blob, previewUrl: URL.createObjectURL(blob) };
    renderEditor();
    schedulePreview();
    scheduleSave();
  }catch(err){
    console.error(err);
    flashNote("사진을 처리하지 못했어요. 다른 사진으로 시도해 주세요.", true);
  }
});

async function resizeImageToJpeg(file, maxDim, quality){
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return await new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error("이미지 변환 실패")), "image/jpeg", quality);
  });
}

function revokePendingPhoto(m){
  if (m && m._pendingPhoto && m._pendingPhoto.previewUrl){
    URL.revokeObjectURL(m._pendingPhoto.previewUrl);
  }
}

/* ============================================================
   4. 미리보기 — 실제 사이트와 같은 함수로 그립니다
   ============================================================ */
function renderPreview(){
  const pv = $("pvMembers");
  pv.innerHTML = members.map(m => {
    const photo = m._pendingPhoto ? m._pendingPhoto.previewUrl : m.photo;
    return MemberCore.cardHTML({ ...m, photo });
  }).join("");
  pv.querySelectorAll(".rv").forEach(el => el.classList.add("in"));
  updateCodePreview();
}

/* ============================================================
   5. 코드 생성
   ============================================================ */
function jsStr(v){ return JSON.stringify(String(v ?? "")); }

function generateMembersArray(){
  if (!members.length) return "[\n  ]";
  const rows = members.map(m => {
    const tags = (m.tags || []).map(t => jsStr(t)).join(",");
    return `    { role:${jsStr(m.role)}, name:${jsStr(m.name)}, term:${jsStr(m.term)}, word:${jsStr(m.word)}, tags:[${tags}], photo:${jsStr(m.photo)} }`;
  }).join(",\n");
  return `[\n${rows}\n  ]`;
}

function generateMembersCode(){
  return `  members: ${generateMembersArray()}`;
}

function updateCodePreview(){
  $("codePreview").textContent = generateMembersCode();
}

function findMatchingBracket(text, openIdx, openChar, closeChar){
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
    if (c === openChar) depth++;
    else if (c === closeChar){
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

function replaceMembersBlock(sourceText){
  const m = /members\s*:\s*\[/.exec(sourceText);
  if (!m) throw new Error("data.js에서 'members' 항목을 찾지 못했습니다. 파일이 바뀌었는지 확인해 주세요.");
  const openIdx = m.index + m[0].length - 1;
  const closeIdx = findMatchingBracket(sourceText, openIdx, "[", "]");
  if (closeIdx === -1) throw new Error("data.js의 'members' 괄호 짝을 맞추지 못했습니다.");
  return sourceText.slice(0, openIdx) + generateMembersArray() + sourceText.slice(closeIdx + 1);
}

/* ============================================================
   6. 저장 — 중계 서버(Cloudflare Worker)에 비밀번호 + 사진을 보내 저장
   ============================================================ */

/* 관리자가 worker/README.md 대로 Cloudflare Worker를 배포한 뒤,
   여기에 그 주소를 한 번만 넣어 주세요 (연표 편집기와 같은 주소면 됩니다).
   위원들은 이 값을 몰라도 되고 비밀번호만 알면 됩니다. */
const SAVE_ENDPOINT = "";

async function blobToHashAndBase64(blob){
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
  const bytes = new Uint8Array(buf);
  let bin = "";
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return { hash, dataBase64: btoa(bin) };
}

async function buildSavePayload(){
  const photos = [];
  const cleaned = [];
  for (const m of members){
    const copy = { role: m.role, name: m.name, term: m.term, word: m.word, tags: m.tags || [], photo: m.photo || "" };
    if (m._pendingPhoto){
      const { hash, dataBase64 } = await blobToHashAndBase64(m._pendingPhoto.blob);
      const path = `img/members/${hash}.jpg`;
      photos.push({ path, dataBase64 });
      copy.photo = path;
      m._pendingPhoto.finalPath = path;
    }
    cleaned.push(copy);
  }
  return { action: "members", members: cleaned, photos };
}

function markPhotosSaved(){
  members.forEach(m => {
    if (m._pendingPhoto){
      if (m._pendingPhoto.finalPath) m.photo = m._pendingPhoto.finalPath;
      revokePendingPhoto(m);
      delete m._pendingPhoto;
    }
  });
  renderEditor();
  renderPreview();
  scheduleSave();
}

initSavePanel({
  pwKey: PW_KEY,
  saveEndpoint: SAVE_ENDPOINT,
  buildPayload: buildSavePayload,
  onSaved: markPhotosSaved,
});

/* ============================================================
   7. 수동 내보내기 (다운로드 · 코드 복사)
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
  const code = generateMembersCode();
  try{
    await navigator.clipboard.writeText(code);
    flashNote("위원 코드를 복사했어요. js/data.js 의 members: [...] 부분과 통째로 바꿔 넣으세요. (사진은 자동으로 안 올라가요)");
  }catch{
    flashNote("복사가 막혀 있어요. 아래 '내보낼 코드 미리 보기'에서 직접 선택해 복사해 주세요.", true);
  }
};

$("downloadBtn").onclick = async () => {
  try{
    const res = await fetch("../js/data.js", { cache: "no-store" });
    if (!res.ok) throw new Error("status " + res.status);
    const original = await res.text();
    const updated = replaceMembersBlock(original);
    downloadText("data.js", updated);
    flashNote("data.js를 내려받았어요. 사진 파일은 img/members/ 폴더에 직접 올려야 해요.");
  }catch(err){
    console.error(err);
    flashNote("data.js를 직접 읽어오지 못했어요 (로컬 파일에서 열었을 때 흔한 문제예요). 대신 '위원 코드만 복사'를 눌러 js/data.js의 members 부분을 손으로 바꿔 주세요.", true);
  }
};

$("resetBtn").onclick = () => {
  if (!confirm("지금까지 편집기에서 바꾼 내용을 지우고 js/data.js 내용으로 되돌릴까요?")) return;
  members.forEach(revokePendingPhoto);
  members = baseMembersFromData();
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
function boot(members0){
  members = members0;
  renderEditor();
  renderPreview();
}

function init(){
  if (typeof DATA === "undefined" || !DATA){
    $("memberList").innerHTML = `<p class="admin-no-years">js/data.js를 불러오지 못했어요. 파일이 있는지, 문법이 맞는지 확인해 주세요.</p>`;
    return;
  }
  const draft = loadDraft();
  if (draft && draft.members.length){
    $("draftBanner").hidden = false;
    $("resumeDraft").onclick = () => {
      $("draftBanner").hidden = true;
      boot(draft.members);
    };
    $("discardDraft").onclick = () => {
      localStorage.removeItem(DRAFT_KEY);
      $("draftBanner").hidden = true;
      boot(baseMembersFromData());
    };
    boot(draft.members);
  } else {
    boot(baseMembersFromData());
  }
}

init();

})();
