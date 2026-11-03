// Pyloxa 官網的互動：派工面板（首屏）、工作狀態、功能開關、常見問題與進場動態。
// 沒有 JavaScript 時內容照常顯示（派工面板顯示預設的結果，常見問題顯示第一題）。
(function () {
  const root = document.documentElement;
  root.classList.add("js");
  const copy = JSON.parse(document.getElementById("copy")?.textContent || "{}");

  // ---- 進場：每個區塊的子元素依序出現一次 ----
  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    reveals.forEach((el) => io.observe(el));
  } else reveals.forEach((el) => el.classList.add("is-in"));

  // ---- 派工面板：與 Pyloxa 的規則相同（前端 → Claude Code、後端 → Codex，互為備援；其他走預設路由） ----
  const router = document.querySelector("[data-router]");
  if (router) {
    const R = copy.router;
    const typeButtons = router.querySelectorAll("[data-type]");
    const who = router.querySelector("[data-who]");
    const why = router.querySelector("[data-why]");
    const fallback = router.querySelector("[data-fallback]");
    const quotaToggle = router.querySelector("[data-quota]");
    const quotaBox = router.querySelector("[data-quota-box]");
    const quotaTitle = router.querySelector("[data-quota-title]");
    const takeover = router.querySelector("[data-takeover]");
    const taken = router.querySelector("[data-taken]");
    let type = "backend";
    let tookOver = false;

    function decide() {
      const rule = R.rules[type];
      const codexOut = quotaToggle.getAttribute("aria-checked") === "true";
      const primaryOut = codexOut && rule.agent === "Codex";
      const agent = primaryOut && tookOver ? rule.fallback : rule.agent;
      who.textContent = R.goesTo.replace("{agent}", agent);
      why.textContent = primaryOut && tookOver ? R.tookOverReason.replace("{from}", rule.agent).replace("{agent}", agent) : rule.reason;
      fallback.textContent = rule.fallback ? R.fallback.replace("{agent}", rule.fallback).replace("{state}", codexOut && rule.fallback === "Codex" ? R.unavailable : R.available) : R.noFallback;
      quotaBox.hidden = !(primaryOut && !tookOver);
      taken.hidden = !(primaryOut && tookOver);
      quotaTitle.textContent = R.quotaTitle.replace("{agent}", rule.agent);
      takeover.textContent = R.takeover.replace("{agent}", rule.fallback);
    }

    typeButtons.forEach((b) =>
      b.addEventListener("click", () => {
        type = b.dataset.type;
        tookOver = false;
        typeButtons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        decide();
      }),
    );
    quotaToggle.addEventListener("click", () => {
      const on = quotaToggle.getAttribute("aria-checked") !== "true";
      quotaToggle.setAttribute("aria-checked", String(on));
      tookOver = false;
      decide();
    });
    takeover.addEventListener("click", () => {
      tookOver = true;
      decide();
    });
    decide();
  }

  // ---- 工作狀態：中間那列按「接受結果」後變成已接受 ----
  document.querySelectorAll("[data-accept]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const row = btn.closest("[data-task]");
      row.querySelector("[data-pending]").hidden = true;
      row.querySelector("[data-accepted]").hidden = false;
    }),
  );

  // ---- 功能開關 ----
  document.querySelectorAll(".band [role=switch]").forEach((sw) => {
    const band = sw.closest(".band");
    const set = (on) => {
      sw.setAttribute("aria-checked", String(on));
      band.classList.toggle("is-on", on);
    };
    set(sw.getAttribute("aria-checked") === "true");
    sw.addEventListener("click", () => set(sw.getAttribute("aria-checked") !== "true"));
  });

  // ---- 常見問題：左邊選題，右邊顯示答案；手機改為展開在題目下方 ----
  const list = document.querySelector(".faq-list");
  const pane = document.querySelector(".faq-pane");
  if (list && pane) {
    const items = [...list.querySelectorAll("li[data-q]")];
    const show = (li) => {
      items.forEach((x) => {
        const on = x === li;
        x.querySelector("button").setAttribute("aria-selected", String(on));
        x.classList.toggle("is-open", on);
      });
      const html = li.querySelector(".inline-answer").innerHTML;
      if (pane.innerHTML === html) return;
      pane.classList.add("is-fading");
      setTimeout(() => {
        pane.innerHTML = html;
        pane.classList.remove("is-fading");
      }, 150);
    };
    items.forEach((li) => {
      const b = li.querySelector("button");
      b.addEventListener("click", () => show(li));
      b.addEventListener("focus", () => show(li));
      b.addEventListener("mouseenter", () => {
        if (window.matchMedia("(min-width: 901px)").matches) show(li);
      });
    });
  }
})();
