/* ============================================================
   공용 '비밀번호로 저장' 패널 — 연표 편집기와 위원 편집기가 함께
   씁니다. 두 편집기 모두 아래 id를 가진 요소가 있어야 합니다:
   pwInput, pwRemember, pwCheckBtn, pwSaveBtn, pwSaveState, pwNote,
   adminSettings.

   호출하는 쪽(timeline-admin.js, members-admin.js)은
   initSavePanel({ pwKey, saveEndpoint, buildPayload, onSaved }) 을
   부릅니다. buildPayload() 는 { action, ...데이터 } 를 반환합니다
   (비동기여도 됩니다 — 예: 위원 편집기는 사진을 먼저 압축한 뒤 보냅니다).
   ============================================================ */
function initSavePanel({ pwKey, saveEndpoint, buildPayload, onSaved }){
  const $ = id => document.getElementById(id);
  let pw = "";

  function loadPw(){
    try{
      const raw = localStorage.getItem(pwKey);
      if (!raw) return;
      pw = (JSON.parse(raw) || {}).password || "";
    }catch{}
  }

  function savePw(){
    const remember = $("pwRemember").checked;
    try{
      if (remember) localStorage.setItem(pwKey, JSON.stringify({ password: pw }));
      else localStorage.removeItem(pwKey);
    }catch{}
  }

  function flash(msg, isError){
    const el = $("pwNote");
    el.textContent = msg;
    el.classList.toggle("error", !!isError);
    el.classList.toggle("ok", !isError);
  }

  async function callSaveEndpoint(payload){
    if (!saveEndpoint){
      throw new Error("아직 저장 서버 주소가 설정되지 않았어요. '관리자 설정'을 펼쳐서 안내를 확인해 주세요.");
    }
    let res;
    try{
      res = await fetch(saveEndpoint, {
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

  loadPw();
  $("pwInput").value = pw;
  if (!saveEndpoint) $("adminSettings").open = true;

  $("pwCheckBtn").onclick = async () => {
    pw = $("pwInput").value;
    const btn = $("pwCheckBtn");
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "확인 중…";
    try{
      await callSaveEndpoint({ password: pw, dryRun: true });
      flash("비밀번호가 맞아요. 이제 '저장'을 누르면 바로 반영돼요.");
      savePw();
    }catch(err){
      flash(err.message, true);
    }finally{
      btn.disabled = false;
      btn.textContent = label;
    }
  };

  $("pwSaveBtn").onclick = async () => {
    pw = $("pwInput").value;
    if (!pw){
      flash("비밀번호를 넣어 주세요.", true);
      $("pwInput").focus();
      return;
    }
    const btn = $("pwSaveBtn");
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "저장하는 중…";
    try{
      const payload = await buildPayload();
      await callSaveEndpoint({ password: pw, ...payload });
      savePw();
      const t = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
      $("pwSaveState").textContent = `저장됨 · ${t}`;
      flash("저장했어요. 사이트에는 보통 1분 안팎이면 반영돼요.");
      if (onSaved) onSaved();
    }catch(err){
      console.error(err);
      flash(err.message || "저장하지 못했어요.", true);
    }finally{
      btn.disabled = false;
      btn.textContent = label;
    }
  };

  $("pwInput").addEventListener("change", () => { pw = $("pwInput").value; savePw(); });
  $("pwRemember").addEventListener("change", savePw);
}
