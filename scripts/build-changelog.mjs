// 從 Pyloxa-Releases 的版本說明產生官網的改版紀錄頁（changelog/index.html 與 zh-TW/changelog/index.html）。
// 官網沒有建置步驟：每次發布後執行一次，把產生的頁面一起提交。
// 用法：node scripts/build-changelog.mjs <Pyloxa-Releases 目錄>
//
// 版本說明的格式：英文在前、繁中在後，以單獨一行的 --- 分隔；各段以「# Pyloxa x.y.z」開頭，
// 下一段是一句摘要，之後是 ## 小節（清單、段落與表格）。只轉換用得到的 Markdown 子集。
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releases = process.argv[2];
if (!releases) throw new Error("請指定 Pyloxa-Releases 目錄");
const notesDir = path.join(releases, "release-notes");

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 行內格式：`code`、**粗體**、[文字](網址)；先跳脫 HTML，程式碼內不再處理其他格式 */
function inline(text) {
  const parts = text.split(/(`[^`]+`)/);
  return parts
    .map((p) => {
      if (p.startsWith("`") && p.endsWith("`") && p.length > 1) return `<code>${escapeHtml(p.slice(1, -1))}</code>`;
      return escapeHtml(p)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
    })
    .join("");
}

/** 一個語言段落（不含標題行）轉成 HTML */
function blocks(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      out.push(`<h3>${inline(line.slice(3).trim())}</h3>`);
      i++;
      continue;
    }
    if (line.startsWith("- ")) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith("- ") || (lines[i].startsWith("  ") && items.length > 0))) {
        if (lines[i].startsWith("- ")) items.push(lines[i].slice(2).trim());
        else items[items.length - 1] += ` ${lines[i].trim()}`;
        i++;
      }
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ul>`);
      continue;
    }
    if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push(
        `<div class="table"><table><thead><tr>${cells(head).map((c) => `<th scope="col">${inline(c)}</th>`).join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(## |- |\|)/.test(lines[i])) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return out.join("\n");
}

/** 版本說明拆成英文與繁中兩段 */
function parseNote(file) {
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const [en, zh] = text.split(/\n---\n/);
  const section = (s) => {
    const lines = s.trim().split("\n");
    const title = lines.shift();
    if (!title?.startsWith("# Pyloxa ")) throw new Error(`${file}：段落要以「# Pyloxa x.y.z」開頭`);
    return lines;
  };
  return { en: section(en), zh: section(zh ?? en) };
}

/** 發布日期：版本說明第一次提交的日期 */
function releaseDate(file) {
  const log = execFileSync("git", ["log", "--format=%as", "--", path.relative(releases, file).replace(/\\/g, "/")], { cwd: releases, encoding: "utf8" }).trim().split("\n");
  return log.at(-1) || "";
}

const versions = readdirSync(notesDir)
  .map((f) => /^v(\d+)\.(\d+)\.(\d+)\.md$/.exec(f))
  .filter(Boolean)
  .sort((a, b) => b[1] - a[1] || b[2] - a[2] || b[3] - a[3])
  .map((m) => {
    const file = path.join(notesDir, m[0]);
    return { version: `${m[1]}.${m[2]}.${m[3]}`, date: releaseDate(file), ...parseNote(file) };
  });

const STRINGS = {
  en: {
    lang: "en",
    title: "Changelog — Pyloxa",
    description: "What changed in each Pyloxa release: new features, fixes, privacy notes, known limitations and installer checksums.",
    canonical: "https://pyloxa.com/changelog/",
    root: "../",
    heading: "Changelog",
    lead: "What changed in each release. Pyloxa tells you when a new version is out; download it from the releases page.",
    download: "Download the latest version",
    navDownload: "Download",
    home: "Pyloxa home",
    other: { href: "../zh-TW/changelog/", label: "繁體中文", lang: "zh-Hant" },
    released: (d) => `Released ${d}`,
    issues: "Report a problem",
  },
  zh: {
    lang: "zh-Hant-TW",
    title: "改版紀錄 — Pyloxa",
    description: "Pyloxa 每個版本改了什麼：新功能、修正、隱私說明、已知限制與安裝檔校驗碼。",
    canonical: "https://pyloxa.com/zh-TW/changelog/",
    root: "../../",
    heading: "改版紀錄",
    lead: "每個版本改了什麼。有新版本時 Pyloxa 會提示你，請到版本頁下載。",
    download: "下載最新版",
    navDownload: "下載",
    home: "Pyloxa 首頁",
    other: { href: "../../changelog/", label: "English", lang: "en" },
    released: (d) => `發布於 ${d}`,
    issues: "回報問題",
  },
};

function page(lang) {
  const t = STRINGS[lang];
  const home = lang === "en" ? t.root : "../";
  const entries = versions
    .map(
      (v) => `      <article class="release" id="v${v.version}" aria-labelledby="h-v${v.version}">
        <header>
          <h2 id="h-v${v.version}"><a href="#v${v.version}">${v.version}</a></h2>
          ${v.date ? `<p class="date"><time datetime="${v.date}">${escapeHtml(t.released(v.date))}</time></p>` : ""}
        </header>
        <div class="body">
${blocks(v[lang])}
        </div>
      </article>`,
    )
    .join("\n");
  return `<!doctype html>
<!-- 由 scripts/build-changelog.mjs 從 Pyloxa-Releases 的版本說明產生，請勿直接修改 -->
<html lang="${t.lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${t.title}</title>
    <meta name="description" content="${escapeHtml(t.description)}" />
    <link rel="canonical" href="${t.canonical}" />
    <link rel="alternate" hreflang="en" href="https://pyloxa.com/changelog/" />
    <link rel="alternate" hreflang="zh-TW" href="https://pyloxa.com/zh-TW/changelog/" />
    <link rel="alternate" hreflang="x-default" href="https://pyloxa.com/changelog/" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${t.title}" />
    <meta property="og:description" content="${escapeHtml(t.description)}" />
    <meta property="og:url" content="${t.canonical}" />
    <link rel="icon" href="/favicon.ico" sizes="32x32" />
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600&${lang === "zh" ? "family=Noto+Sans+TC:wght@400;600&" : ""}display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/assets/site.css" />
    <style>
      .changelog { max-width: 820px; padding-block: clamp(40px, 6vw, 96px); display: grid; gap: clamp(48px, 6vw, 80px); }
      .changelog > .intro h1 { font-size: var(--step-display); line-height: 1; }
      .changelog > .intro p { margin-top: 16px; color: var(--soft); font-size: var(--step-lead); }
      .changelog > .intro .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
      .release { display: grid; gap: 16px; padding-top: 32px; border-top: 1px solid var(--tone); scroll-margin-top: 24px; }
      .release header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px 20px; }
      .release h2 { font-size: var(--step-head); }
      .release h2 a { color: inherit; text-decoration: none; }
      .release h2 a:hover { color: var(--accent); }
      .release .date { color: var(--soft); font-size: var(--step-small); }
      .release .body { display: grid; gap: 12px; }
      .release .body > p:first-child { font-size: var(--step-lead); }
      .release h3 { margin-top: 12px; font-size: var(--step-body); font-weight: 600; }
      .release ul { display: grid; gap: 8px; padding-left: 1.2em; }
      .release li::marker { color: var(--soft); }
      .release code { font-size: 0.9em; padding: 0.1em 0.3em; border-radius: 4px; background: var(--tone); overflow-wrap: anywhere; }
      .release .table { overflow-x: auto; }
      .release table { border-collapse: collapse; font-size: var(--step-small); }
      .release th, .release td { padding: 6px 12px 6px 0; text-align: left; border-bottom: 1px solid var(--tone); vertical-align: top; }
      .release td code { overflow-wrap: anywhere; word-break: break-all; }
      .button.is-light { background: var(--tone); color: var(--ink); }
    </style>
  </head>
  <body>
    <a class="skip" href="#main">${lang === "en" ? "Skip to content" : "跳到主要內容"}</a>
    <header class="wrap nav">
      <a class="mark" href="${home}" aria-label="${escapeHtml(t.home)}">Pyloxa</a>
      <ul>
        <li><a href="${t.other.href}" lang="${t.other.lang}">${t.other.label}</a></li>
        <li><a class="nav-download" href="https://github.com/eric861129/Pyloxa-Releases/releases/latest">${escapeHtml(t.navDownload)}</a></li>
      </ul>
    </header>
    <main id="main" class="wrap changelog">
      <div class="intro">
        <h1>${escapeHtml(t.heading)}</h1>
        <p>${escapeHtml(t.lead)}</p>
        <div class="actions">
          <a class="button" href="https://github.com/eric861129/Pyloxa-Releases/releases/latest">${escapeHtml(t.download)}</a>
          <a class="button is-light" href="https://github.com/eric861129/Pyloxa-Releases/issues/new/choose">${escapeHtml(t.issues)}</a>
        </div>
      </div>
${entries}
    </main>
    <!-- Cloudflare Web Analytics：不使用 cookie，只統計瀏覽次數 --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "4fd2f289f39942fea6f9881f3b5cad55"}'></script>
  </body>
</html>
`;
}

mkdirSync(path.join(site, "changelog"), { recursive: true });
mkdirSync(path.join(site, "zh-TW", "changelog"), { recursive: true });
writeFileSync(path.join(site, "changelog", "index.html"), page("en"));
writeFileSync(path.join(site, "zh-TW", "changelog", "index.html"), page("zh"));
console.log(`changelog: ${versions.map((v) => `${v.version} (${v.date || "?"})`).join(", ")}`);
