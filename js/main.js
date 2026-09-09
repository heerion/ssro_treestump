/* ============================================================
   동작 파일 — 화면을 그리고 움직이는 코드입니다.
   글을 고칠 때는 js/data.js 를 여세요.
   ------------------------------------------------------------
   1. 구성원 카드 그리기
   2. 나이테 그리기 · 연도 목록 · 펼치기
   3. 활동 사진 (인스타그램)
   4. 문의 폼
   5. 스크롤 등장 효과
   6. 내비게이션 현재 위치 표시
   ============================================================ */

function start(){

  /* ============================================================
     구성원 — DATA.members 만 고치면 카드가 자동으로 만들어집니다
     ============================================================ */
  document.getElementById("memberGrid").innerHTML = (DATA.members || []).map((m, i) => `
    <article class="member rv" style="transition-delay:${Math.min(i,7)*60}ms">
      <div class="ring-avatar" aria-hidden="true"><span>${(m.name || "?").slice(0,1)}</span></div>
      <p class="member-role">${m.role}</p>
      <h3 class="member-name">${m.name}</h3>
      <p class="member-term">${m.term}</p>
      <p class="member-word">${m.word}</p>
      <div class="tags">${(m.tags || []).map(t=>`<i>${t}</i>`).join("")}</div>
    </article>`).join("");

  /* ============================================================
     나이테 + 연도 아코디언
     ============================================================ */
  /* 연도는 자동입니다. 올해가 지나거나 DATA.years 에 새 해를 넣으면
     나이테도 그만큼 저절로 늘어납니다. */
  const START = 2009;
  const NOW = Math.max(
    new Date().getFullYear(),
    ...Object.keys(DATA.years).map(Number)
  );
  const years = [];
  for (let y = START; y <= NOW; y++) years.push(y);
  document.getElementById("capYear").textContent = NOW;
  document.querySelectorAll("[data-nth-year]").forEach(el => {
    el.textContent = (NOW - START + 1) + "년째 운영 중";
  });

  const NS = "http://www.w3.org/2000/svg";
  const CX = 196, CY = 212;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 400 400");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `2009년부터 ${NOW}년까지의 활동을 나이테로 나타낸 그림`);

  const bark = document.createElementNS(NS, "circle");
  bark.setAttribute("cx",CX); bark.setAttribute("cy",CY); bark.setAttribute("r",170);
  bark.setAttribute("fill","#F6EEE2"); bark.setAttribute("stroke","#D8BE9A"); bark.setAttribute("stroke-width","7");
  svg.appendChild(bark);

  const pith = document.createElementNS(NS, "circle");
  pith.setAttribute("cx",CX); pith.setAttribute("cy",CY); pith.setAttribute("r",9);
  pith.setAttribute("fill","#E4CFB2"); pith.setAttribute("pointer-events","none");
  svg.appendChild(pith);

  const ringEls = {};
  const R0 = 20, R1 = 158;
  const STEP = years.length > 1 ? (R1 - R0) / (years.length - 1) : 0;
  years.forEach((y, i) => {
    const r = R0 + i * STEP + Math.sin(i * 1.7) * Math.min(1.6, STEP * .2);
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "ring-g" + (DATA.years[y] ? " has" : ""));
    const e = document.createElementNS(NS, "ellipse");
    e.setAttribute("cx", CX + Math.sin(i) * 2.5);
    e.setAttribute("cy", CY - Math.cos(i * .8) * 2);
    e.setAttribute("rx", r * 1.02); e.setAttribute("ry", r * .97);
    e.setAttribute("class", "ring-line");
    const hit = e.cloneNode();
    hit.setAttribute("class", "ring-hit");
    const title = document.createElementNS(NS, "title");
    title.textContent = y + "년";
    g.append(e, hit, title);
    g.addEventListener("click", () => { openYear_(y, true); });
    svg.appendChild(g);
    ringEls[y] = g;
  });

  const crack = document.createElementNS(NS, "path");
  crack.setAttribute("d", "M200 206 L150 116 L142 92");
  crack.setAttribute("stroke", "#DCC5A5"); crack.setAttribute("stroke-width", "2");
  crack.setAttribute("fill", "none"); crack.setAttribute("stroke-linecap", "round");
  crack.setAttribute("pointer-events", "none");
  svg.appendChild(crack);

  const sprout = document.createElementNS(NS, "g");
  sprout.setAttribute("pointer-events","none");
  const stem = document.createElementNS(NS, "path");
  stem.setAttribute("d","M312 96 C 330 78 340 64 344 50");
  stem.setAttribute("stroke","#E89B47"); stem.setAttribute("stroke-width","7");
  stem.setAttribute("fill","none"); stem.setAttribute("stroke-linecap","round");
  const leaves = document.createElementNS(NS, "path");
  leaves.setAttribute("d","M344 50 C 326 44 316 28 320 8 C 340 14 350 32 344 50 Z M344 50 C 350 30 366 18 386 18 C 384 40 368 52 344 50 Z");
  leaves.setAttribute("fill","#E89B47");
  sprout.append(stem, leaves);
  svg.appendChild(sprout);
  document.getElementById("stump").appendChild(svg);

  /* 연도 목록 — 기록이 있는 구간만 먼저 보이고, 나머지는 접어 둡니다 */
  const yearsBox = document.getElementById("years");
  const SHOW = 5;                                   /* 처음에 펼쳐 두는 최근 연도 수 */
  const mainYears = years.slice(-SHOW).reverse();   /* 최근 5개년 */
  const restYears = years.slice(0, -SHOW).reverse();/* 그 이전 — 접어 둠 */
  const cutoff = mainYears[mainYears.length - 1];   /* 펼쳐 둔 구간의 가장 오래된 해 */

  function yearRow(y, i, folded){
    /* 빈 배열([])은 기록이 없는 것으로 봅니다 */
    const items = (DATA.years[y] || []).length ? DATA.years[y] : null;
    const nth = y - START + 1;
    const body = items
      ? `<ul class="log">${items.map(a =>
          `<li><time>${y}.${a.m}</time><div><h4>${a.t}</h4><p>${a.d}</p></div></li>`).join("")}</ul>`
      : `<div class="log-empty"><b>이 해의 기록이 아직 없어요</b>사진이나 회의록을 찾아 정리하면 여기에 남습니다. 앞 기수의 활동도 함께 채워 주세요.</div>`;
    return `
    <div class="yr rv${items || !folded ? "" : " empty"}" data-y="${y}" style="transition-delay:${Math.min(i,8)*35}ms">
      <button class="yr-head" type="button" aria-expanded="false" aria-controls="yr-${y}">
        <span class="yr-num">${y}</span>
        <span class="yr-meta">${nth}번째 해${items ? ` · 기록 ${items.length}건` : " · 기록 없음"}</span>
        <span class="yr-mark" aria-hidden="true"></span>
      </button>
      <div class="yr-body" id="yr-${y}"><div class="yr-inner">${body}</div></div>
    </div>`;
  }

  yearsBox.innerHTML =
    mainYears.map((y, i) => yearRow(y, i, false)).join("") +
    (restYears.length
      ? `<div class="yr-rest" id="yrRest" hidden>${restYears.map((y, i) => yearRow(y, i, true)).join("")}</div>
         <button class="more" id="moreBtn" type="button" aria-expanded="false">
           ${restYears[restYears.length - 1]}–${restYears[0]}년도 펼치기
         </button>`
      : "");

  const moreBtn = document.getElementById("moreBtn");
  const restBox = document.getElementById("yrRest");
  function showRest(){
    if (!restBox || !restBox.hidden) return;
    restBox.hidden = false;
    restBox.querySelectorAll(".rv").forEach(el => el.classList.add("in"));
    moreBtn.textContent = "이전 연도 접기";
    moreBtn.setAttribute("aria-expanded", "true");
  }
  if (moreBtn){
    moreBtn.onclick = () => {
      if (restBox.hidden) showRest();
      else {
        restBox.hidden = true;
        moreBtn.textContent = `${restYears[restYears.length - 1]}–${restYears[0]}년도 펼치기`;
        moreBtn.setAttribute("aria-expanded", "false");
        if (openYear !== null && openYear < cutoff) openYear_(openYear, false);
      }
    };
  }

  let openYear = null;
  function openYear_(y, fromRing){
    const same = openYear === y;
    openYear = same ? null : y;
    if (openYear !== null && openYear < cutoff) showRest();

    yearsBox.querySelectorAll(".yr").forEach(el => {
      const on = +el.dataset.y === openYear;
      el.classList.toggle("on", on);
      el.querySelector(".yr-head").setAttribute("aria-expanded", on);
    });
    years.forEach(k => ringEls[k].classList.toggle("on", k === openYear));

    /* 나이테를 눌렀을 때만, 화면 밖에 있을 때만, 그루터기가 계속 보이는 만큼만 움직입니다.
       펼침·접힘이 끝난 뒤에 재야 위치가 어긋나지 않습니다. */
    if (openYear && fromRing) setTimeout(() => {
      const el = yearsBox.querySelector(`.yr[data-y="${openYear}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const safeTop = 96, safeBottom = innerHeight - 140;
      if (r.top >= safeTop && r.top <= safeBottom) return;

      const inner = document.querySelector(".stump-inner");
      const col = document.querySelector(".stump-col");
      const stacked = getComputedStyle(inner).position !== "sticky";
      let target = scrollY + r.top - (stacked ? innerHeight * 0.42 : safeTop);
      if (!stacked){
        const colTop = col.getBoundingClientRect().top + scrollY;
        const stickyTop = parseFloat(getComputedStyle(inner).top) || 0;
        const limit = colTop + col.offsetHeight - inner.offsetHeight - stickyTop - 40;
        target = Math.min(target, limit);
      }
      scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    }, 430);
  }
  yearsBox.addEventListener("click", e => {
    const h = e.target.closest(".yr-head");
    if (h) openYear_(+h.closest(".yr").dataset.y, false);
  });
  openYear_(NOW, false);

  /* ============================================================
     활동 사진 — 위젯 코드가 있으면 자동 피드, 없으면 안내 카드
     ============================================================ */
  (function igFeed(){
    const box = document.getElementById("igFeed");
    const ig = DATA.instagram || {};
    const handle = ig.handle || "ssronet";
    const profile = `https://www.instagram.com/${handle}/`;

    const card = () => {
      box.className = "";
      box.innerHTML = `
        <a class="ig-card" href="${profile}" target="_blank" rel="noopener">
          <span class="handle">@${handle}</span>
          <span class="msg">인스타그램에서 활동 사진 보기</span>
          <svg class="go" width="26" height="12" viewBox="0 0 26 12" fill="none" aria-hidden="true">
            <path d="M0 6h24M19 1l5 5-5 5" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </a>`;
    };

    /* 위젯 코드를 안전하게 붙이기 (script 태그도 실행되도록 다시 만들어 줌) */
    if (ig.widget && ig.widget.trim()){
      const tpl = document.createElement("template");
      tpl.innerHTML = ig.widget.trim();
      box.className = "ig-feed";
      [...tpl.content.childNodes].forEach(node => {
        if (node.tagName === "SCRIPT"){
          const s = document.createElement("script");
          [...node.attributes].forEach(a => s.setAttribute(a.name, a.value));
          s.textContent = node.textContent;
          box.appendChild(s);
        } else {
          box.appendChild(node.cloneNode(true));
        }
      });
      return;
    }

    const posts = (ig.posts || []).filter(u => /instagram\.com/.test(u));
    if (!posts.length){ card(); return; }

    box.className = "ig-feed";
    box.innerHTML = posts.map(u => `
      <blockquote class="instagram-media" data-instgrm-permalink="${u}"
        data-instgrm-version="14" style="margin:0;width:100%"></blockquote>`).join("");

    const s = document.createElement("script");
    s.async = true;
    s.src = "https://www.instagram.com/embed.js";
    s.onload = () => window.instgrm && window.instgrm.Embeds.process();
    document.body.appendChild(s);

    /* 인스타그램 스크립트가 막히면 안내 카드로 되돌립니다 */
    setTimeout(() => { if (!box.querySelector("iframe")) card(); }, 5000);
  })();

  /* ============================================================
     문의
     ============================================================ */
  const $ = id => document.getElementById(id);
  if (DATA.contact.staff) $("staffLine").childNodes[0].nodeValue = DATA.contact.staff;
  let composed = "";

  const FORM = DATA.form || { mode: "mailto" };

  /* 접수 방식별로 실제 전송을 담당합니다 */
  async function send(payload){
    const mode = FORM.mode || "mailto";

    if (mode === "google"){
      const g = FORM.google || {};
      if (!g.formId) throw new Error("구글 폼 주소가 설정되지 않았습니다.");
      const body = new FormData();
      Object.entries(g.entries || {}).forEach(([key, entry]) => {
        if (entry) body.append(entry, payload[key] || "");
      });
      /* 구글 폼은 응답을 돌려주지 않아 no-cors 로 보냅니다 */
      await fetch(`https://docs.google.com/forms/d/e/${g.formId}/formResponse`,
        { method: "POST", mode: "no-cors", body });
      return;
    }

    if (mode === "endpoint"){
      if (!FORM.endpoint) throw new Error("접수 주소가 설정되지 않았습니다.");
      const res = await fetch(FORM.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          ...(FORM.extra || {}),
          이름: payload.name,
          이메일: payload.email,
          문의유형: payload.type,
          내용: payload.message,
          subject: `[그루터기 문의] ${payload.type}`
        })
      });
      if (!res.ok) throw new Error(`서버가 ${res.status} 응답을 보냈습니다.`);
      return;
    }

    throw new Error("mailto");
  }

  $("sendBtn").onclick = async () => {
    const name = $("c-name").value.trim();
    const email = $("c-email").value.trim();
    const type = $("c-type").value;
    const msg = $("c-msg").value.trim();
    const agree = $("c-agree").checked;

    if ($("c-hp").value) return;   /* 자동 스팸은 조용히 무시합니다 */

    let ok = true;
    [["f-name", name.length > 0],
     ["f-email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)],
     ["f-type", type !== ""],
     ["f-msg", msg.length >= 10]].forEach(([id, pass]) => {
      $(id).classList.toggle("bad", !pass);
      if (!pass) ok = false;
    });
    $("agreeErr").style.display = agree ? "none" : "block";
    if (!agree) ok = false;
    if (!ok){
      document.querySelector(".field.bad")?.querySelector("input,select,textarea")?.focus();
      return;
    }

    const payload = { name, email, type, message: msg };
    composed = `[${type}]\n이름: ${name}\n이메일: ${email}\n\n${msg}`;

    const btn = $("sendBtn");
    const mode = FORM.mode || "mailto";

    if (mode !== "mailto"){
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = "보내는 중…";
      try {
        await send(payload);
        $("sentTitle").textContent = "문의를 보냈어요";
        $("sentMsg").textContent = "답장은 적어 주신 메일로 갑니다. 확인까지 며칠 걸릴 수 있어요.";
        showSent();
      } catch (err){
        console.error(err);
        $("sentTitle").textContent = "지금은 보내지 못했어요";
        $("sentMsg").textContent = "잠시 뒤 다시 시도하거나, 내용을 복사해 담당자에게 보내 주세요.";
        showSent();
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
      return;
    }

    /* mailto 방식 */
    const mail = (DATA.contact || {}).email;
    $("sentTitle").textContent = "내용이 준비됐어요";
    $("sentMsg").textContent = mail
      ? "메일 앱을 열어 바로 보내거나, 내용을 복사해 다른 방법으로 전달해도 됩니다."
      : "아직 접수 메일 주소가 연결되지 않았어요. 내용을 복사해 담당자에게 보내 주세요.";
    if (mail){
      const acts = document.querySelector(".sent-actions");
      if (!acts.querySelector(".mailbtn")){
        const a = document.createElement("button");
        a.className = "btn mailbtn"; a.type = "button"; a.textContent = "메일 앱 열기";
        a.onclick = () => location.href =
          `mailto:${mail}?subject=${encodeURIComponent("[그루터기 문의] " + type)}&body=${encodeURIComponent(composed)}`;
        acts.prepend(a);
      }
    }
    showSent();
  };

  function showSent(){
    $("formBox").style.display = "none";
    $("sentBox").classList.add("show");
  }

  $("copyBtn").onclick = async () => {
    try{
      await navigator.clipboard.writeText(composed);
      $("copyBtn").textContent = "복사했어요";
      setTimeout(() => $("copyBtn").textContent = "내용 복사하기", 1800);
    }catch{
      $("sentMsg").textContent = "복사가 막혀 있어요. 아래 내용을 직접 선택해 복사해 주세요: " + composed;
    }
  };

  $("againBtn").onclick = () => {
    ["c-name","c-email","c-msg","c-hp"].forEach(i => $(i).value = "");
    $("c-type").value = ""; $("c-agree").checked = false;
    document.querySelectorAll(".field.bad").forEach(f => f.classList.remove("bad"));
    $("agreeErr").style.display = "none";
    $("sentBox").classList.remove("show");
    $("formBox").style.display = "";
    $("c-name").focus();
  };

  document.querySelectorAll(".field input,.field select,.field textarea").forEach(el => {
    el.addEventListener("input", () => el.closest(".field").classList.remove("bad"));
  });

  /* ============================================================
     스크롤에 맞춰 하나씩 올라오게
     ============================================================ */
  const rvIO = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting){
        en.target.classList.add("in");
        rvIO.unobserve(en.target);
      }
    });
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.05 });
  document.querySelectorAll(".rv").forEach(el => rvIO.observe(el));

  /* ============================================================
     내비게이션 — 지금 보고 있는 섹션 표시
     ============================================================ */
  const nav = $("nav");
  const links = [...document.querySelectorAll("#navLinks a")];
  const secs = links.map(a => document.querySelector(a.getAttribute("href")));
  let ticking = false;

  function syncNav(){
    nav.classList.toggle("solid", scrollY > innerHeight - 80);

    const line = scrollY + innerHeight * 0.35;
    let current = null;
    secs.forEach(s => { if (s.offsetTop <= line) current = s; });
    if (scrollY + innerHeight >= document.body.scrollHeight - 4) current = secs[secs.length - 1];
    links.forEach((a, i) => a.classList.toggle("on", secs[i] === current));
    ticking = false;
  }
  addEventListener("scroll", () => {
    if (!ticking){ ticking = true; requestAnimationFrame(syncNav); }
  }, { passive:true });
  addEventListener("resize", syncNav);
  syncNav();

}


/* ------------------------------------------------------------
   내용 파일에 문제가 있어도 빈 화면이 되지 않도록,
   무엇이 잘못됐는지 화면 아래에 알려 줍니다.
   ------------------------------------------------------------ */
function showDataError(detail){
  const box = document.createElement("div");
  box.className = "data-error";
  box.innerHTML = `
    <b>js/data.js 를 읽지 못했어요</b>
    <p>내용 파일에 문법이 어긋난 곳이 있습니다. 보통 아래 셋 중 하나예요.</p>
    <ul>
      <li>앞 항목 끝에 쉼표( , )를 빠뜨렸을 때</li>
      <li>대괄호 [ ] 나 중괄호 { } 의 짝이 맞지 않을 때</li>
      <li>따옴표가 " " 가 아니라 “ ” 로 바뀌었을 때</li>
    </ul>
    <code>${detail}</code>`;
  document.body.appendChild(box);
}

try {
  if (typeof DATA === "undefined" || !DATA || !DATA.years){
    throw new Error("DATA 를 찾을 수 없습니다. 브라우저에서 F12 를 눌러 Console 탭을 보면 몇 번째 줄이 문제인지 나옵니다.");
  }
  start();
} catch (err){
  showDataError(err && err.message ? err.message : String(err));
  console.error(err);
}
