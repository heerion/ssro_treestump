/* ============================================================
   SSRO TREESTUMP 연표 편집기 — 저장 중계 서버 (Cloudflare Worker)
   ------------------------------------------------------------
   브라우저에는 GitHub 토큰을 절대 두지 않습니다. 대신 이 Worker가
   GITHUB_TOKEN 비밀값을 갖고 있다가, 편집기가 보낸 비밀번호가 맞으면
   대신 js/data.js 를 저장소에 커밋합니다. 위원들은 GitHub가 뭔지
   몰라도, 공유받은 비밀번호만 알면 됩니다.

   배포 방법은 이 폴더의 README.md 를 보세요. 요약하면:
   1. Cloudflare 무료 계정으로 Workers 만들고 이 파일 내용을 붙여넣기
   2. Settings → Variables and Secrets 에서 아래 값을 등록
   3. 배포 후 나온 주소를 admin/timeline-admin.js 의 SAVE_ENDPOINT 에 넣기

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

    const { password, years, dryRun } = body || {};
    if (password !== env.SITE_PASSWORD){
      return json({ error: "비밀번호가 올바르지 않아요." }, 401, origin);
    }
    if (dryRun){
      return json({ ok: true, dryRun: true }, 200, origin);
    }

    const invalid = validateYears(years);
    if (invalid){
      return json({ error: invalid }, 400, origin);
    }

    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const branch = env.GITHUB_BRANCH || "main";
    const api = `https://api.github.com/repos/${owner}/${repo}/contents/js/data.js`;
    const ghHeaders = {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ssro-treestump-timeline-worker",
    };

    let fileRes;
    try{
      fileRes = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders });
    }catch{
      return json({ error: "GitHub에 연결하지 못했습니다." }, 502, origin);
    }
    if (!fileRes.ok){
      return json({ error: `GitHub에서 파일을 읽지 못했습니다 (${fileRes.status}).` }, 502, origin);
    }
    const file = await fileRes.json();

    let original, updated;
    try{
      original = base64ToUtf8(file.content);
      updated = replaceYearsBlock(original, years);
    }catch(err){
      return json({ error: err.message || "연표 코드를 만들지 못했습니다." }, 500, origin);
    }

    const putRes = await fetch(api, {
      method: "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `연표 업데이트 (연표 편집기) · ${new Date().toISOString()}`,
        content: utf8ToBase64(updated),
        sha: file.sha,
        branch,
      }),
    });
    if (!putRes.ok){
      return json({ error: `GitHub 저장에 실패했습니다 (${putRes.status}).` }, 502, origin);
    }

    return json({ ok: true }, 200, origin);
  },
};

/* ============================================================
   아래 함수들은 admin/timeline-admin.js 의 같은 이름 함수와 내용이
   같습니다. 연표 데이터 구조(연도 → {m,t,d} 배열)를 바꾸면 두 파일을
   같이 고쳐 주세요.
   ============================================================ */

function validateYears(years){
  if (!years || typeof years !== "object" || Array.isArray(years)){
    return "연표 데이터 형식이 올바르지 않습니다.";
  }
  for (const [y, items] of Object.entries(years)){
    if (!/^\d{1,4}$/.test(y)) return `연도가 이상해요: ${y}`;
    if (!Array.isArray(items)) return `${y}년 활동 목록 형식이 올바르지 않습니다.`;
    for (const it of items){
      if (!it || typeof it !== "object" || Array.isArray(it)){
        return `${y}년 활동 데이터 형식이 올바르지 않습니다.`;
      }
    }
  }
  return null;
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

function replaceYearsBlock(sourceText, years){
  const m = /years\s*:\s*\{/.exec(sourceText);
  if (!m) throw new Error("data.js에서 'years' 항목을 찾지 못했습니다.");
  const openIdx = m.index + m[0].length - 1;
  const closeIdx = findMatchingBrace(sourceText, openIdx);
  if (closeIdx === -1) throw new Error("data.js의 'years' 괄호 짝을 맞추지 못했습니다.");
  return sourceText.slice(0, openIdx) + generateYearsObject(years) + sourceText.slice(closeIdx + 1);
}
