/* ============================================================
   SSRO TREESTUMP 저장 중계 서버 (Cloudflare Worker)
   ------------------------------------------------------------
   브라우저에는 GitHub 토큰을 절대 두지 않습니다. 대신 이 Worker가
   GITHUB_TOKEN 비밀값을 갖고 있다가, 편집기가 보낸 비밀번호가 맞으면
   대신 js/data.js 를 저장소에 커밋합니다. 위원들은 GitHub가 뭔지
   몰라도, 공유받은 비밀번호만 알면 됩니다.

   두 가지 편집기가 이 서버를 함께 씁니다.
     admin/timeline.html  → action: "years"    (활동 연혁)
     admin/members.html   → action: "members"  (위원 소개, 사진 포함)

   배포 방법은 이 폴더의 README.md 를 보세요. 요약하면:
   1. Cloudflare 무료 계정으로 Workers 만들고 이 파일 내용을 붙여넣기
   2. Settings → Variables and Secrets 에서 아래 값을 등록
   3. 배포 후 나온 주소를 admin/timeline-admin.js 와
      admin/members-admin.js 의 SAVE_ENDPOINT 에 넣기

   필요한 설정값
   ------------------------------------------------------------
   GITHUB_TOKEN   (Secret)   이 저장소 하나, Contents: Read and write
                             권한만 있는 fine-grained PAT
   SITE_PASSWORD  (Secret)   위원들과 공유할 비밀번호
   GITHUB_OWNER   (Variable) 예: heerion
   GITHUB_REPO    (Variable) 예: ssro_treestump
   GITHUB_BRANCH  (Variable) 예: main
   ALLOWED_ORIGIN (Variable) 예: https://heerion.github.io
   ============================================================ */

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const PHOTO_PATH_RE = /^img\/members\/[A-Za-z0-9_-]+\.jpg$/;

function corsHeaders(origin){
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status, origin){
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env){
    const origin = env.ALLOWED_ORIGIN || "*";

    if (request.method === "OPTIONS"){
      return new Response(null, { headers: corsHeaders(origin) });
    }
    if (request.method !== "POST"){
      return json({ error: "POST만 지원합니다." }, 405, origin);
    }
    if (!env.SITE_PASSWORD || !env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO){
      return json({ error: "서버 설정이 아직 끝나지 않았어요 (관리자에게 문의해 주세요)." }, 500, origin);
    }

    let body;
    try{
      body = await request.json();
    }catch{
      return json({ error: "요청 형식이 올바르지 않습니다." }, 400, origin);
    }

    const { password, dryRun } = body || {};
    if (password !== env.SITE_PASSWORD){
      return json({ error: "비밀번호가 올바르지 않아요." }, 401, origin);
    }
    if (dryRun){
      return json({ ok: true, dryRun: true }, 200, origin);
    }

    const action = body.action || "years";
    const gh = {
      owner: env.GITHUB_OWNER,
      repo: env.GITHUB_REPO,
      branch: env.GITHUB_BRANCH || "main",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ssro-treestump-save-worker",
      },
    };

    try{
      if (action === "years") return json(await saveYears(gh, body.years), 200, origin);
      if (action === "members") return json(await saveMembers(gh, body.members, body.photos), 200, origin);
      return json({ error: `알 수 없는 action 입니다: ${action}` }, 400, origin);
    }catch(err){
      console.error(err);
      return json({ error: err.message || "저장하지 못했습니다." }, err.status || 500, origin);
    }
  },
};

/* ============================================================
   연혁(years) 저장
   ============================================================ */
async function saveYears(gh, years){
  const invalid = validateYears(years);
  if (invalid) throw httpError(400, invalid);

  const file = await ghGetFile(gh, "js/data.js");
  const original = base64ToUtf8(file.content);
  const updated = replaceBlock(original, "years", "{", "}", generateYearsObject(years));
  await ghPutFile(gh, "js/data.js", updated, file.sha, "연표 업데이트 (연표 편집기)");
  return { ok: true };
}

function validateYears(years){
  if (!years || typeof years !== "object" || Array.isArray(years)) return "연표 데이터 형식이 올바르지 않습니다.";
  for (const [y, items] of Object.entries(years)){
    if (!/^\d{1,4}$/.test(y)) return `연도가 이상해요: ${y}`;
    if (!Array.isArray(items)) return `${y}년 활동 목록 형식이 올바르지 않습니다.`;
    for (const it of items){
      if (!it || typeof it !== "object" || Array.isArray(it)) return `${y}년 활동 데이터 형식이 올바르지 않습니다.`;
    }
  }
  return null;
}

function generateYearsObject(years){
  const keys = Object.keys(years).map(Number).sort((a, b) => b - a);
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

/* ============================================================
   위원(members) 저장 — 새 사진이 있으면 먼저 올리고, 그다음 목록을 저장합니다
   ============================================================ */
async function saveMembers(gh, members, photos){
  const invalid = validateMembers(members);
  if (invalid) throw httpError(400, invalid);

  for (const photo of (photos || [])){
    if (!photo || !PHOTO_PATH_RE.test(photo.path) || typeof photo.dataBase64 !== "string" || !photo.dataBase64){
      throw httpError(400, "사진 데이터 형식이 올바르지 않습니다.");
    }
    /* 내용이 같은 사진은 해시 기반 파일명이라 항상 새 파일이라, sha 없이 새로 만듭니다 */
    await ghPutFile(gh, photo.path, photo.dataBase64, undefined, "위원 사진 추가 (위원 편집기)", { rawBase64: true });
  }

  const file = await ghGetFile(gh, "js/data.js");
  const original = base64ToUtf8(file.content);
  const updated = replaceBlock(original, "members", "[", "]", generateMembersArray(members));
  await ghPutFile(gh, "js/data.js", updated, file.sha, "위원 소개 업데이트 (위원 편집기)");
  return { ok: true };
}

function validateMembers(members){
  if (!Array.isArray(members)) return "위원 데이터 형식이 올바르지 않습니다.";
  for (const m of members){
    if (!m || typeof m !== "object" || Array.isArray(m)) return "위원 항목 형식이 올바르지 않습니다.";
    if (m.tags && !Array.isArray(m.tags)) return "태그 형식이 올바르지 않습니다.";
    if (m.photo && !PHOTO_PATH_RE.test(m.photo) && m.photo !== "") return `사진 경로가 이상해요: ${m.photo}`;
  }
  return null;
}

function generateMembersArray(members){
  if (!members.length) return "[\n  ]";
  const rows = members.map(m => {
    const tags = (m.tags || []).map(t => jsStr(t)).join(",");
    return `    { role:${jsStr(m.role)}, name:${jsStr(m.name)}, term:${jsStr(m.term)}, word:${jsStr(m.word)}, tags:[${tags}], photo:${jsStr(m.photo)} }`;
  }).join(",\n");
  return `[\n${rows}\n  ]`;
}

/* ============================================================
   GitHub 헬퍼
   ============================================================ */
function httpError(status, message){
  const err = new Error(message);
  err.status = status;
  return err;
}

async function ghGetFile(gh, path){
  const url = `https://api.github.com/repos/${gh.owner}/${gh.repo}/contents/${path}?ref=${encodeURIComponent(gh.branch)}`;
  let res;
  try{
    res = await fetch(url, { headers: gh.headers });
  }catch{
    throw httpError(502, "GitHub에 연결하지 못했습니다.");
  }
  if (!res.ok) throw httpError(502, `GitHub에서 ${path} 를 읽지 못했습니다 (${res.status}).`);
  return res.json();
}

/* content 는 UTF-8 텍스트 문자열이거나(rawBase64 없음), 이미 base64로
   인코딩된 사진 데이터(rawBase64: true)입니다. */
async function ghPutFile(gh, path, content, sha, message, { rawBase64 = false } = {}){
  const res = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/contents/${path}`, {
    method: "PUT",
    headers: { ...gh.headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `${message} · ${new Date().toISOString()}`,
      content: rawBase64 ? content : utf8ToBase64(content),
      sha,
      branch: gh.branch,
    }),
  });
  if (!res.ok) throw httpError(502, `GitHub에 ${path} 저장을 실패했습니다 (${res.status}).`);
  return res.json();
}

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

function jsStr(v){ return JSON.stringify(String(v ?? "")); }

/* data.js 안에서 `key: <openChar> ... <closeChar>` 블록을 찾아 통째로 바꿔치기합니다.
   문자열·주석 안의 괄호는 세지 않도록 건너뜁니다. */
function replaceBlock(sourceText, key, openChar, closeChar, replacement){
  const re = new RegExp(`${key}\\s*:\\s*\\${openChar}`);
  const m = re.exec(sourceText);
  if (!m) throw httpError(500, `data.js에서 '${key}' 항목을 찾지 못했습니다.`);
  const openIdx = m.index + m[0].length - 1;
  const closeIdx = findMatchingBracket(sourceText, openIdx, openChar, closeChar);
  if (closeIdx === -1) throw httpError(500, `data.js의 '${key}' 괄호 짝을 맞추지 못했습니다.`);
  return sourceText.slice(0, openIdx) + replacement + sourceText.slice(closeIdx + 1);
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
