// 產生功能頁（/workflow/、/memory/、/quota/、/pro/ 與 /zh-TW/ 的對應頁面）
//   node scripts/build-features.mjs           寫入所有功能頁
//   node scripts/build-features.mjs --check   只檢查，有差異時以非零狀態結束
//
// 內容：src/features/<頁面>/<語言>.html，第一行是 <!--meta {...}--> 的 JSON（title、description、h1 以外的頁首資料），
// 其餘是 <main> 裡的 HTML。頁首、頁尾、導覽、hreflang 與結構化資料由這支程式加上。
// 頁面清單與導覽文字在 src/features/pages.json；首頁與 sitemap.xml 由 build-pages.mjs 讀同一份清單。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://pyloxa.com";
const check = process.argv.includes("--check");
const { languages: LANGS, pages: PAGES } = JSON.parse(readFileSync(path.join(site, "src/features/pages.json"), "utf8"));
const { version } = JSON.parse(readFileSync(path.join(site, "src/site.json"), "utf8"));

// 首頁的 Google Analytics 片段（同一份設定，只維護首頁模板那一處）
const home = readFileSync(path.join(site, "src/home.html"), "utf8");
const gaStart = home.indexOf("    <!-- Google Analytics");
const gaEnd = home.indexOf("</script>", gaStart) + "</script>".length;
if (gaStart < 0 || gaEnd < gaStart) throw new Error("在 src/home.html 找不到 Google Analytics 片段");
const analytics = home.slice(gaStart, gaEnd);

const CHROME = {
  en: {
    htmlLang: "en",
    ogLocale: "en_US",
    og: "og-en.png",
    skip: "Skip to content",
    homeLabel: "Pyloxa home",
    home: "Home",
    features: "Features",
    download: "Download",
    other: { lang: "zh-Hant", name: "繁體中文" },
    ctaTitle: "Try it on your own project",
    ctaText: "Pyloxa is a free Windows app. It runs the Claude Code and Codex CLIs you already use, on your own subscriptions or API keys.",
    ctaDownload: "Download Pyloxa for Windows",
    ctaPricing: "Compare Free and Pro",
    more: "More about Pyloxa",
    changelog: "Changelog",
    privacy: "Privacy policy",
    eula: "License (EULA)",
    support: "Support",
    help: "Help",
    helpText: "Step-by-step help for installing, connecting the CLIs, plans and troubleshooting.",
    guides: "Guides",
    guidesText: "Usage limits, Claude Code and Codex together, checking agent work, shared instructions and Windows setup.",
    footer: "Pyloxa is not affiliated with or endorsed by Anthropic, OpenAI or Google.",
    version: `Version ${version} · Windows 10 and 11`,
  },
  "zh-TW": {
    htmlLang: "zh-Hant-TW",
    ogLocale: "zh_TW",
    og: "og-zh.png",
    skip: "跳到主要內容",
    homeLabel: "Pyloxa 首頁",
    home: "首頁",
    features: "功能",
    download: "下載",
    other: { lang: "en", name: "English" },
    ctaTitle: "拿你自己的專案試試看",
    ctaText: "Pyloxa 是免費的 Windows App，執行你已經在用的 Claude Code 與 Codex CLI，用你自己的訂閱或 API Key。",
    ctaDownload: "下載 Pyloxa Windows 版",
    ctaPricing: "比較免費版與 Pro",
    more: "更多關於 Pyloxa",
    changelog: "改版紀錄",
    privacy: "隱私權政策",
    eula: "授權條款（EULA）",
    support: "聯絡我們",
    help: "說明文件",
    helpText: "安裝、連線 CLI、計畫與疑難排解的操作步驟。",
    guides: "攻略",
    guidesText: "額度用完怎麼辦、Claude Code 與 Codex 一起用、驗收 Agent 的成果、共用指示檔與 Windows 安裝。",
    footer: "Pyloxa 與 Anthropic、OpenAI、Google 沒有關聯，也未獲得它們背書。",
    version: `版本 ${version} · Windows 10 與 11`,
  },
};

// 下載按鈕到同語言的下載頁（自動開始下載，並說明 SmartScreen 與安裝步驟）
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const decode = (s) => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

const dirOf = (lang) => (lang === "en" ? "" : `${lang}/`);
const urlOf = (lang, slug) => `${ORIGIN}/${dirOf(lang)}${slug}/`;

function readBody(slug, lang) {
  const file = path.join(site, "src/features", slug, `${lang}.html`);
  const raw = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^<!--meta\s+([\s\S]*?)-->\n/);
  if (!m) throw new Error(`${file} 第一行要是 <!--meta {...}-->`);
  return { meta: JSON.parse(m[1]), body: raw.slice(m[0].length).trimEnd() };
}

// 常見問題：<details class="fx-q"><summary>題目</summary><div>答案（不要再包 div）</div></details>，產生 FAQPage 結構化資料
function faqSchema(body, url) {
  const items = [...body.matchAll(/<details class="fx-q"[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*<div>([\s\S]*?)<\/div>\s*<\/details>/g)];
  if (!items.length) return null;
  return {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    mainEntity: items.map(([, q, a]) => ({ "@type": "Question", name: decode(strip(q)), acceptedAnswer: { "@type": "Answer", text: decode(strip(a)) } })),
  };
}

function render(page, lang) {
  const c = CHROME[lang];
  const other = LANGS.find((l) => l !== lang);
  const { meta, body } = readBody(page.slug, lang);
  const url = urlOf(lang, page.slug);
  const root = lang === "en" ? "../" : "../../";
  const homeHref = root + dirOf(lang);
  const RELEASES = `${homeHref}download/#start`;
  const otherHref = `${root}${dirOf(other)}${page.slug}/`;
  const label = page.nav[lang];

  const graph = [
    {
      "@type": "WebPage",
      "@id": url,
      url,
      name: meta.title,
      description: meta.description,
      inLanguage: lang,
      isPartOf: { "@id": `${ORIGIN}/#website` },
      about: { "@id": `${ORIGIN}/#software` },
      publisher: { "@id": `${ORIGIN}/#organization` },
      breadcrumb: { "@id": `${url}#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Pyloxa", item: `${ORIGIN}/${dirOf(lang)}` },
        { "@type": "ListItem", position: 2, name: label, item: url },
      ],
    },
  ];
  const faq = faqSchema(body, url);
  if (faq) graph.push(faq);
  const schema = JSON.stringify({ "@context": "https://schema.org", "@graph": graph });

  const nav = PAGES.map((p) => `<li class="optional"><a href="${root}${dirOf(lang)}${p.slug}/"${p.slug === page.slug ? ' aria-current="page"' : ""}>${p.nav[lang]}</a></li>`).join("\n        ");
  const related = PAGES.filter((p) => p.slug !== page.slug)
    .map((p) => `<li><a href="${root}${dirOf(lang)}${p.slug}/"><span>${p.nav[lang]}</span><span class="fx-related-text">${p.blurb[lang]}</span></a></li>`)
    .concat(`<li><a href="${root}${dirOf(lang)}guides/"><span>${c.guides}</span><span class="fx-related-text">${c.guidesText}</span></a></li>`)
    .concat(`<li><a href="${root}${dirOf(lang)}help/"><span>${c.help}</span><span class="fx-related-text">${c.helpText}</span></a></li>`)
    .join("\n            ");

  return `<!doctype html>
<html lang="${c.htmlLang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(meta.title)}</title>
    <meta name="description" content="${esc(meta.description)}" />
    <meta name="theme-color" content="#4932d4" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Pyloxa" />
    <meta property="og:title" content="${esc(meta.title)}" />
    <meta property="og:description" content="${esc(meta.description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${ORIGIN}/assets/${c.og}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="${c.ogLocale}" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="/favicon.ico" sizes="32x32" />
    <link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="${root}assets/apple-touch-icon.png" />
    <link rel="manifest" href="${root}assets/site.webmanifest" />
    <link rel="canonical" href="${url}" />
${LANGS.map((l) => `    <link rel="alternate" hreflang="${l}" href="${urlOf(l, page.slug)}" />`).join("\n")}
    <link rel="alternate" hreflang="x-default" href="${urlOf("en", page.slug)}" />
    <script type="application/ld+json">${schema}</script>
    <link rel="stylesheet" href="${root}assets/site.css" />
    <link rel="stylesheet" href="${root}assets/features.css" />
${analytics}
  </head>
  <body class="fx">
    <a class="skip" href="#main">${c.skip}</a>
    <header class="wrap nav">
      <a class="mark" href="${homeHref}" aria-label="${c.homeLabel}">Pyloxa</a>
      <ul>
        ${nav}
        <li><a href="${otherHref}" lang="${c.other.lang}">${c.other.name}</a></li>
        <li><a class="nav-download" href="${RELEASES}">${c.download}</a></li>
      </ul>
    </header>

    <main id="main">
      <nav class="wrap fx-crumbs" aria-label="Breadcrumb"><a href="${homeHref}">Pyloxa</a><span aria-hidden="true">/</span><span aria-current="page">${label}</span></nav>
${body}

      <section class="wrap fx-cta" aria-labelledby="fx-cta-title">
        <div class="fx-cta-box">
          <h2 id="fx-cta-title">${c.ctaTitle}</h2>
          <p>${c.ctaText}</p>
          <div class="fx-actions">
            <a class="button" href="${RELEASES}">${c.ctaDownload}</a>
            <a class="button is-light" href="${homeHref}#pricing">${c.ctaPricing}</a>
          </div>
        </div>
      </section>

      <section class="wrap fx-related" aria-labelledby="fx-related-title">
        <h2 id="fx-related-title">${c.more}</h2>
        <ul>
            ${related}
        </ul>
      </section>
    </main>

    <footer class="wrap fx-foot">
      <p>${c.version} · <a href="${root}${dirOf(lang)}help/">${c.help}</a> · <a href="${root}${dirOf(lang)}guides/">${c.guides}</a> · <a href="${root}${dirOf(lang)}changelog/">${c.changelog}</a> · <a href="${root}${dirOf(lang)}privacy/">${c.privacy}</a> · <a href="${root}legal/EULA.txt">${c.eula}</a> · <a href="mailto:support@pyloxa.com">${c.support}</a></p>
      <p>${c.footer}</p>
    </footer>

    <script src="${root}assets/site.js" defer></script>
    <!-- Cloudflare Web Analytics：不使用 cookie，只統計瀏覽次數 --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "4fd2f289f39942fea6f9881f3b5cad55"}'></script>
  </body>
</html>
`;
}

let changed = 0;
for (const page of PAGES) {
  for (const lang of LANGS) {
    const rel = `${dirOf(lang)}${page.slug}/index.html`;
    const file = path.join(site, rel);
    const html = render(page, lang);
    const old = existsSync(file) ? readFileSync(file, "utf8") : null;
    if (old === html) continue;
    changed++;
    if (check) {
      console.log(`不一致：${rel}`);
      continue;
    }
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, html);
    console.log(`已寫入 ${rel}`);
  }
}
if (!changed) console.log("沒有變更");
if (check && changed) process.exit(1);
