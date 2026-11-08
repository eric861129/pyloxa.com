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

  // ---- 閱讀進度條 ----
  const bar = document.createElement("div");
  bar.className = "progress";
  bar.setAttribute("aria-hidden", "true");
  document.body.append(bar);
  let barQueued = false;
  const drawBar = () => {
    barQueued = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
  };
  addEventListener("scroll", () => barQueued || ((barQueued = true), requestAnimationFrame(drawBar)), { passive: true });
  addEventListener("resize", drawBar);
  drawBar();

  // ---- 名字的由來：第一次捲到時依序亮過六個字母，示範指到字母會顯示說明；使用者一動就停 ----
  const letters = document.querySelector(".name-letters");
  const canHover = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (letters && canHover && !still && "IntersectionObserver" in window) {
    const items = [...letters.children];
    let timer = 0;
    const stop = () => {
      clearTimeout(timer);
      letters.classList.remove("is-demo");
      items.forEach((li) => li.classList.remove("is-active"));
    };
    const play = (i) => {
      items.forEach((li, j) => li.classList.toggle("is-active", i === j));
      if (i >= items.length) return stop();
      timer = setTimeout(() => play(i + 1), 850);
    };
    const demo = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        demo.disconnect();
        letters.classList.add("is-demo");
        timer = setTimeout(() => play(0), 900);
      },
      { threshold: 0.6 },
    );
    demo.observe(letters);
    letters.addEventListener("pointerenter", stop);
    letters.addEventListener("focusin", stop);
  }

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

  // ---- 工作狀態：中間那列按「接受結果」後變成已接受；按「在 Session 回覆」在旁邊打開 Session ----
  document.querySelectorAll("[data-reply-demo]").forEach((demo) => {
    const S = copy.session || {};
    const card = demo.querySelector("[data-task]");
    const accept = card.querySelector("[data-accept]");
    const replyBtn = card.querySelector("[data-reply]");
    const status = card.querySelector("[data-status]");
    const checkText = card.querySelector("[data-check-text]");
    const session = demo.querySelector("[data-session]");
    const log = session.querySelector("[data-session-log]");
    const form = session.querySelector("[data-session-form]");
    const input = session.querySelector("[data-session-input]");
    const sendBtn = form.querySelector("button[type=submit]");
    let busy = false;

    const setOpen = (open) => {
      session.hidden = !open;
      demo.classList.toggle("is-open", open);
      replyBtn.setAttribute("aria-expanded", String(open));
    };
    const addMsg = (who, text, cls) => {
      const m = document.createElement("div");
      m.className = "msg" + (cls ? " " + cls : "");
      const w = document.createElement("span");
      w.className = "who";
      w.textContent = who;
      const p = document.createElement("p");
      p.textContent = text;
      m.append(w, p);
      log.append(m);
      requestAnimationFrame(() => (log.scrollTop = log.scrollHeight));
      return m;
    };

    accept.addEventListener("click", () => {
      setOpen(false);
      card.querySelector("[data-pending]").hidden = true;
      card.querySelector("[data-accepted]").hidden = false;
    });
    replyBtn.addEventListener("click", () => {
      const open = session.hidden;
      setOpen(open);
      if (open) input.focus({ preventScroll: true });
    });
    session.querySelector("[data-session-close]").addEventListener("click", () => {
      setOpen(false);
      replyBtn.focus();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || busy) return;
      busy = true;
      addMsg(S.you, text, "you");
      input.value = "";
      accept.disabled = sendBtn.disabled = true;
      status.className = "badge info";
      status.innerHTML = '<span class="spin" aria-hidden="true"></span>';
      status.append(S.running);
      const working = addMsg("Codex", "", "working");
      working.querySelector("p").innerHTML = '<span class="spin" aria-hidden="true"></span>';
      working.querySelector("p").append(S.working);
      setTimeout(() => {
        working.remove();
        addMsg("Codex", S.answer);
        status.className = "badge warn";
        status.textContent = S.waiting;
        checkText.textContent = S.check;
        accept.disabled = sendBtn.disabled = false;
        busy = false;
      }, 1800);
    });
  });

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

  // ---- Pro 早鳥名單：端點在 <meta name="pyloxa:waitlist">（Buttondown 的 embed-subscribe）。
  // 沒有設定時保留「即將開放」；Buttondown 不允許跨來源讀取回應，所以用 no-cors 送出，送出後請使用者到信箱確認（雙重確認） ----
  const endpoint = (document.querySelector('meta[name="pyloxa:waitlist"]')?.content || "").trim();
  const W = copy.waitlist || {};
  if (endpoint) {
    document.querySelectorAll("[data-waitlist]").forEach((form) => {
      const soon = form.parentElement.querySelector("[data-waitlist-soon]");
      const status = form.querySelector(".waitlist-status");
      const button = form.querySelector("button[type=submit]");
      form.action = endpoint;
      form.hidden = false;
      if (soon) soon.hidden = true;
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        button.disabled = true;
        status.textContent = W.sending;
        try {
          await fetch(endpoint, { method: "POST", body: new FormData(form), mode: "no-cors" });
          form.classList.add("is-done");
          status.textContent = W.done;
          if (typeof gtag === "function") gtag("event", "generate_lead", { form: "pro_early_bird" });
        } catch {
          status.textContent = W.failed;
          button.disabled = false;
        }
      });
    });
  }

  // ---- 客製化分頁：沒有 JavaScript 時四個面板依序全部顯示 ----
  document.querySelectorAll("[data-tabs]").forEach((box) => {
    const tabs = [...box.querySelectorAll("[role=tab]")];
    const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")));
    box.classList.remove("no-tabs");
    box.querySelector(".tabs").hidden = false;
    const select = (i, focus) => {
      tabs.forEach((t, j) => {
        t.setAttribute("aria-selected", String(i === j));
        t.tabIndex = i === j ? 0 : -1;
        panels[j].hidden = i !== j;
      });
      if (focus) tabs[i].focus();
      panels[i].querySelectorAll("video").forEach((v) => clipObserver?.observe(v));
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(i));
      t.addEventListener("keydown", (e) => {
        const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (d) select((i + d + tabs.length) % tabs.length, true);
      });
    });
    select(0);
  });

  // ---- 操作錄影：捲到看得到時播放、離開時暫停；按一下暫停或繼續。偏好減少動態時不自動播放 ----
  var clipObserver;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clips = document.querySelectorAll("video.clip");
  clips.forEach((v) => {
    if (reduce) v.controls = true;
    v.addEventListener("click", () => {
      if (reduce) return;
      v.dataset.paused = v.paused ? "" : "1";
      if (v.paused) v.play().catch(() => {});
      else v.pause();
    });
  });
  if (!reduce && "IntersectionObserver" in window) {
    clipObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target;
          if (e.isIntersecting && !v.dataset.paused && v.offsetParent) v.play().catch(() => {});
          else v.pause();
        }
      },
      { threshold: 0.35 },
    );
    clips.forEach((v) => clipObserver.observe(v));
  }

  // ---- 常見問題：左邊選題，右邊顯示答案；手機改為展開在題目下方 ----
  const list = document.querySelector(".faq-list");
  const pane = document.querySelector(".faq-pane");
  if (list && pane) {
    const items = [...list.querySelectorAll("li[data-q]")];
    const show = (li) => {
      items.forEach((x) => {
        const on = x === li;
        x.querySelector("button").setAttribute("aria-expanded", String(on));
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

  // ---- 語言選單：點選單外面或按 Esc 就收起 ----
  const menus = [...document.querySelectorAll(".lang-menu")];
  if (menus.length) {
    document.addEventListener("click", (e) => {
      menus.forEach((m) => {
        if (m.open && !m.contains(e.target)) m.open = false;
      });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      menus.forEach((m) => {
        if (m.open) {
          m.open = false;
          m.querySelector("summary").focus();
        }
      });
    });
  }
})();
