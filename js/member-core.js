/* ============================================================
   위원 카드 렌더링 — 메인 페이지(js/main.js)와 위원 편집기
   (admin/members.html)가 같은 모습으로 그리도록 여기서 한 번만
   관리합니다. js/timeline-core.js 가 먼저 로드되어 있어야 합니다.
   ============================================================ */
const MemberCore = (() => {
  const esc = TimelineCore.esc;

  /* 사진이 있으면 사진을, 없으면 이름 첫 글자가 들어간 나이테 동그라미를 보여줍니다 */
  function avatarHTML(m){
    if (m.photo){
      return `<img class="member-photo" src="${esc(m.photo)}" alt="" loading="lazy">`;
    }
    return `<div class="ring-avatar" aria-hidden="true"><span>${esc((m.name || "?").slice(0, 1))}</span></div>`;
  }

  function cardHTML(m, { delayMs = 0 } = {}){
    return `
    <article class="member rv" style="transition-delay:${delayMs}ms">
      ${avatarHTML(m)}
      <p class="member-role">${esc(m.role)}</p>
      <h3 class="member-name">${esc(m.name)}</h3>
      <p class="member-term">${esc(m.term)}</p>
      <p class="member-word">${esc(m.word)}</p>
      <div class="tags">${(m.tags || []).map(t => `<i>${esc(t)}</i>`).join("")}</div>
    </article>`;
  }

  return { avatarHTML, cardHTML };
})();
