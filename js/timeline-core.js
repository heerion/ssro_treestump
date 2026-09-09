/* ============================================================
   연혁 렌더링 — 나이테 SVG와 연도 목록을 그리는 순수 함수 모음.
   메인 페이지(js/main.js)와 연표 편집기(admin/timeline.js)가
   같은 그림을 그리도록 여기서 한 번만 관리합니다.

   여기 있는 함수는 화면에 새로 그리기만 하고, 클릭했을 때 무엇을 할지
   (열고 닫기, 스크롤 이동 등)는 호출하는 쪽에서 정합니다.
   ============================================================ */
const TimelineCore = (() => {
  const NS = "http://www.w3.org/2000/svg";

  /* 데이터 파일에 적힌 글자를 HTML에 그대로 꽂아 넣으면, <, >, & 같은
     글자가 섞였을 때 화면이 깨질 수 있습니다. 그걸 막습니다. */
  function esc(s){
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
    }[c]));
  }

  /* start 부터, 기록이 있는 가장 늦은 해(또는 올해) 까지의 연도 배열 */
  function yearRange(years, start = 2009){
    const now = Math.max(
      new Date().getFullYear(),
      start,
      ...Object.keys(years || {}).map(Number)
    );
    const list = [];
    for (let y = start; y <= now; y++) list.push(y);
    return { start, now, list };
  }

  /* 나이테 SVG — years 에 기록이 있는 해는 진하게 그립니다.
     onRingClick(year) 를 넘기면 테를 눌렀을 때 호출됩니다. */
  function buildRingsSvg(list, years, onRingClick){
    const CX = 196, CY = 212;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 400 400");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label",
      list.length ? `${list[0]}년부터 ${list[list.length - 1]}년까지의 활동을 나이테로 나타낸 그림` : "활동 나이테");

    const bark = document.createElementNS(NS, "circle");
    bark.setAttribute("cx", CX); bark.setAttribute("cy", CY); bark.setAttribute("r", 170);
    bark.setAttribute("fill", "#F6EEE2"); bark.setAttribute("stroke", "#D8BE9A"); bark.setAttribute("stroke-width", "7");
    svg.appendChild(bark);

    const pith = document.createElementNS(NS, "circle");
    pith.setAttribute("cx", CX); pith.setAttribute("cy", CY); pith.setAttribute("r", 9);
    pith.setAttribute("fill", "#E4CFB2"); pith.setAttribute("pointer-events", "none");
    svg.appendChild(pith);

    const ringEls = {};
    const R0 = 20, R1 = 158;
    const STEP = list.length > 1 ? (R1 - R0) / (list.length - 1) : 0;
    list.forEach((y, i) => {
      const r = R0 + i * STEP + Math.sin(i * 1.7) * Math.min(1.6, STEP * .2);
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "ring-g" + ((years[y] || []).length ? " has" : ""));
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
      if (onRingClick) g.addEventListener("click", () => onRingClick(y));
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
    sprout.setAttribute("pointer-events", "none");
    const stem = document.createElementNS(NS, "path");
    stem.setAttribute("d", "M312 96 C 330 78 340 64 344 50");
    stem.setAttribute("stroke", "#E89B47"); stem.setAttribute("stroke-width", "7");
    stem.setAttribute("fill", "none"); stem.setAttribute("stroke-linecap", "round");
    const leaves = document.createElementNS(NS, "path");
    leaves.setAttribute("d", "M344 50 C 326 44 316 28 320 8 C 340 14 350 32 344 50 Z M344 50 C 350 30 366 18 386 18 C 384 40 368 52 344 50 Z");
    leaves.setAttribute("fill", "#E89B47");
    sprout.append(stem, leaves);
    svg.appendChild(sprout);

    return { svg, ringEls };
  }

  /* 연도 한 줄(펼치기 전/후) HTML */
  function yearRowHTML(y, items, { start = 2009, nth, folded = false, delayMs = 0 } = {}){
    const has = items && items.length ? items : null;
    const body = has
      ? `<ul class="log">${has.map(a =>
          `<li><time>${y}.${esc(a.m)}</time><div><h4>${esc(a.t)}</h4><p>${esc(a.d)}</p></div></li>`).join("")}</ul>`
      : `<div class="log-empty"><b>이 해의 기록이 아직 없어요</b>사진이나 회의록을 찾아 정리하면 여기에 남습니다. 앞 기수의 활동도 함께 채워 주세요.</div>`;
    const n = nth ?? (y - start + 1);
    return `
    <div class="yr rv${has || !folded ? "" : " empty"}" data-y="${y}" style="transition-delay:${delayMs}ms">
      <button class="yr-head" type="button" aria-expanded="false" aria-controls="yr-${y}">
        <span class="yr-num">${y}</span>
        <span class="yr-meta">${n}번째 해${has ? ` · 기록 ${has.length}건` : " · 기록 없음"}</span>
        <span class="yr-mark" aria-hidden="true"></span>
      </button>
      <div class="yr-body" id="yr-${y}"><div class="yr-inner">${body}</div></div>
    </div>`;
  }

  /* 연도 목록 전체 — 최근 showCount 개년은 펼쳐 두고, 그 이전은 접어 둡니다 */
  function buildYearListHTML(list, years, { start = 2009, showCount = 5, delayStep = 35 } = {}){
    const mainYears = list.slice(-showCount).reverse();
    const restYears = list.slice(0, -showCount).reverse();
    const cutoff = mainYears[mainYears.length - 1];

    const mainHTML = mainYears.map((y, i) => yearRowHTML(y, years[y], {
      start, nth: y - start + 1, folded: false, delayMs: Math.min(i, 8) * delayStep
    })).join("");
    const restHTML = restYears.map((y, i) => yearRowHTML(y, years[y], {
      start, nth: y - start + 1, folded: true, delayMs: Math.min(i, 8) * delayStep
    })).join("");

    return { mainYears, restYears, cutoff, mainHTML, restHTML };
  }

  return { esc, yearRange, buildRingsSvg, yearRowHTML, buildYearListHTML };
})();
