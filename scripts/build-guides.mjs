// 產生攻略頁（/guides/、/guides/<slug>/ 與 /zh-TW/ 的對應頁面）
//   node scripts/build-guides.mjs           寫入所有攻略頁
//   node scripts/build-guides.mjs --check   只檢查，有差異時以非零狀態結束
//
// 內容：src/guides/<slug>/<語言>.html，第一行是 <!--meta {...}--> 的 JSON：
//   title、description（<head>）、h1、lede（頁首）、nav（清單裡的短名稱）、blurb（索引頁的一句話）、updated（YYYY-MM-DD）、published（選填）
// 其餘是 <article> 裡的 HTML（簡短回答、各段、Pyloxa 一段、常見問題、資料來源）。
// 頁首、更新日期、下載區、相關攻略、頁尾、hreflang 與結構化資料由這支程式加上。
// 攻略的順序在 src/guides/guides.json；sitemap.xml 由 build-pages.mjs 讀同一份清單。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://pyloxa.com";
const check = process.argv.includes("--check");
const { languages: LANGS, guides: SLUGS } = JSON.parse(readFileSync(path.join(site, "src/guides/guides.json"), "utf8"));
const { pages: FEATURES } = JSON.parse(readFileSync(path.join(site, "src/features/pages.json"), "utf8"));
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
    guides: "Guides",
    guide: "Guide",
    download: "Download",
    other: { lang: "zh-Hant", name: "繁體中文" },
    updated: (d) => `Updated ${new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}`,
    indexTitle: "Guides: Claude Code, Codex and Gemini CLI in practice | Pyloxa",
    indexDescription: "Practical guides for developers who use Claude Code, Codex and Gemini CLI: usage limits, running both on one project, Windows setup, checking agent work and shared instructions.",
    indexH1: "Guides for working with AI coding agents",
    indexLede: "Practical answers for developers who use Claude Code, Codex and Gemini CLI, checked against each vendor’s own documentation. Useful whether or not you use Pyloxa.",
    ctaTitle: "Want this handled for you?",
    ctaText: "Pyloxa is a free Windows app that runs the Claude Code and Codex CLIs you already use: it splits the work by your rules, runs your tests itself and offers a handoff when one runs out of quota.",
    ctaDownload: "Download Pyloxa for Windows",
    ctaMore: "How it works",
    more: "More guides",
    help: "Help",
    helpText: "Step-by-step help for installing Pyloxa, connecting the CLIs, plans and troubleshooting.",
    changelog: "Changelog",
    privacy: "Privacy policy",
    eula: "License (EULA)",
    support: "Support",
    footer: "Pyloxa is not affiliated with or endorsed by Anthropic, OpenAI or Google. Product names belong to their owners.",
    version: `Version ${version} · Windows 10 and 11`,
    read: "Read the guide",
  },
  "zh-TW": {
    htmlLang: "zh-Hant-TW",
    ogLocale: "zh_TW",
    og: "og-zh.png",
    skip: "跳到主要內容",
    homeLabel: "Pyloxa 首頁",
    guides: "攻略",
    guide: "攻略",
    download: "下載",
    other: { lang: "en", name: "English" },
    updated: (d) => {
      const [y, m, day] = d.split("-").map(Number);
      return `更新於 ${y} 年 ${m} 月 ${day} 日`;
    },
    indexTitle: "攻略：Claude Code、Codex 與 Gemini CLI 實戰 | Pyloxa",
    indexDescription: "給使用 Claude Code、Codex 與 Gemini CLI 的開發者：額度用完怎麼辦、兩個一起用、Windows 安裝、驗收 Agent 的成果與共用指示檔。",
    indexH1: "AI 程式開發 Agent 攻略",
    indexLede: "給使用 Claude Code、Codex 與 Gemini CLI 的開發者的實用解答，內容都對照過各家的官方文件。不管有沒有用 Pyloxa 都派得上用場。",
    ctaTitle: "想把這些交給工具處理？",
    ctaText: "Pyloxa 是免費的 Windows App，執行你已經在用的 Claude Code 與 Codex CLI：依你的規則分工、自己跑你的測試，某一個額度用完時提出換手。",
    ctaDownload: "下載 Pyloxa Windows 版",
    ctaMore: "看看怎麼運作",
    more: "其他攻略",
    help: "說明文件",
    helpText: "安裝 Pyloxa、連線 CLI、計畫與疑難排解的操作步驟。",
    changelog: "改版紀錄",
    privacy: "隱私權政策",
    eula: "授權條款（EULA）",
    support: "聯絡我們",
    footer: "Pyloxa 與 Anthropic、OpenAI、Google 沒有關聯，也未獲得它們背書。產品名稱屬於各自的所有者。",
    version: `版本 ${version} · Windows 10 與 11`,
    read: "閱讀攻略",
  },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const decode = (s) => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const dirOf = (lang) => (lang === "en" ? "" : `${lang}/`);
const indexUrl = (lang) => `${ORIGIN}/${dirOf(lang)}guides/`;
const guideUrl = (lang, slug) => `${ORIGIN}/${dirOf(lang)}guides/${slug}/`;
const AUTHOR = { "@type": "Person", name: "ChiYu-Huang", url: "https://github.com/eric861129" };

function readGuide(slug, lang) {
  const file = path.join(site, "src/guides", slug, `${lang}.html`);
  const raw = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^<!--meta\s+([\s\S]*?)-->\n/);
  if (!m) throw new Error(`${file} 第一行要是 <!--meta {...}-->`);
  const meta = JSON.parse(m[1]);
  for (const k of ["title", "description", "h1", "lede", "nav", "blurb", "updated"]) if (!meta[k]) throw new Error(`${file} 的 meta 少了 ${k}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.updated)) throw new Error(`${file}：updated 要是 YYYY-MM-DD`);
  return { meta, body: raw.slice(m[0].length).trimEnd() };
}

// 常見問題：<details class="fx-q"><summary>題目</summary><div>答案（不要再包 div）</div></details>
function faqSchema(body, url) {
  const items = [...body.matchAll(/<details class="fx-q"[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*<div>([\s\S]*?)<\/div>\s*<\/details>/g)];
  if (!items.length) return null;
  return {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    mainEntity: items.map(([, q, a]) => ({ "@type": "Question", name: decode(strip(q)), acceptedAnswer: { "@type": "Answer", text: decode(strip(a)) } })),
  };
}

// 頁首、頁尾與下載區，攻略頁與索引頁共用。root：從這一頁到網站根目錄
function shell({ lang, root, title, description, url, otherHref, alternates, schema, current, main }) {
  const c = CHROME[lang];
  const homeHref = root + dirOf(lang);
  const nav = FEATURES.map((p) => `<li class="optional"><a href="${homeHref}${p.slug}/">${p.nav[lang]}</a></li>`).join("\n        ");
  return `<!doctype html>
<html lang="${c.htmlLang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="theme-color" content="#4932d4" />
    <meta property="og:type" content="${current === "index" ? "website" : "article"}" />
    <meta property="og:site_name" content="Pyloxa" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
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
${alternates}
    <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>
    <link rel="stylesheet" href="${root}assets/site.css" />
    <link rel="stylesheet" href="${root}assets/features.css" />
${analytics}
  </head>
  <body class="fx gd-page">
    <a class="skip" href="#main">${c.skip}</a>
    <header class="wrap nav">
      <a class="mark" href="${homeHref}" aria-label="${c.homeLabel}">Pyloxa</a>
      <ul>
        ${nav}
        <li class="optional"><a href="${homeHref}guides/"${current === "index" ? ' aria-current="page"' : ""}>${c.guides}</a></li>
        <li><a href="${otherHref}" lang="${c.other.lang}">${c.other.name}</a></li>
        <li><a class="nav-download" href="${homeHref}download/#start">${c.download}</a></li>
      </ul>
    </header>

    <main id="main">
${main}

      <section class="wrap fx-cta" aria-labelledby="fx-cta-title">
        <div class="fx-cta-box">
          <h2 id="fx-cta-title">${c.ctaTitle}</h2>
          <p>${c.ctaText}</p>
          <div class="fx-actions">
            <a class="button" href="${homeHref}download/#start">${c.ctaDownload}</a>
            <a class="button is-light" href="${homeHref}workflow/">${c.ctaMore}</a>
          </div>
        </div>
      </section>
    </main>

    <footer class="wrap fx-foot">
      <p>${c.version} · <a href="${homeHref}help/">${c.help}</a> · <a href="${homeHref}guides/">${c.guides}</a> · <a href="${homeHref}changelog/">${c.changelog}</a> · <a href="${homeHref}privacy/">${c.privacy}</a> · <a href="${root}legal/EULA.txt">${c.eula}</a> · <a href="mailto:support@pyloxa.com">${c.support}</a></p>
      <p>${c.footer}</p>
    </footer>

    <script src="${root}assets/site.js" defer></script>
    <!-- Cloudflare Web Analytics：不使用 cookie，只統計瀏覽次數 --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "4fd2f289f39942fea6f9881f3b5cad55"}'></script>
  </body>
</html>
`;
}

function renderGuide(slug, lang, all) {
  const c = CHROME[lang];
  const other = LANGS.find((l) => l !== lang);
  const { meta, body } = all[lang][slug];
  const url = guideUrl(lang, slug);
  const root = lang === "en" ? "../../" : "../../../";
  const homeHref = root + dirOf(lang);
  const graph = [
    {
      "@type": "TechArticle",
      "@id": `${url}#article`,
      headline: meta.h1,
      description: meta.description,
      inLanguage: lang,
      datePublished: meta.published ?? meta.updated,
      dateModified: meta.updated,
      author: AUTHOR,
      publisher: { "@id": `${ORIGIN}/#organization` },
      mainEntityOfPage: { "@id": url },
      about: { "@id": `${ORIGIN}/#software` },
      image: `${ORIGIN}/assets/${c.og}`,
    },
    { "@type": "WebPage", "@id": url, url, name: meta.title, inLanguage: lang, isPartOf: { "@id": `${ORIGIN}/#website` }, breadcrumb: { "@id": `${url}#breadcrumb` } },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Pyloxa", item: `${ORIGIN}/${dirOf(lang)}` },
        { "@type": "ListItem", position: 2, name: c.guides, item: indexUrl(lang) },
        { "@type": "ListItem", position: 3, name: meta.nav, item: url },
      ],
    },
  ];
  const faq = faqSchema(body, url);
  if (faq) graph.push(faq);
  const related = SLUGS.filter((s) => s !== slug)
    .map((s) => `<li><a href="../${s}/"><span>${all[lang][s].meta.nav}</span><span class="fx-related-text">${all[lang][s].meta.blurb}</span></a></li>`)
    .concat(`<li><a href="${homeHref}help/"><span>${c.help}</span><span class="fx-related-text">${c.helpText}</span></a></li>`)
    .join("\n            ");
  const main = `      <nav class="wrap fx-crumbs" aria-label="Breadcrumb"><a href="${homeHref}">Pyloxa</a><span aria-hidden="true">/</span><a href="../">${c.guides}</a><span aria-hidden="true">/</span><span aria-current="page">${meta.nav}</span></nav>
      <article class="wrap gd">
        <header class="gd-head">
          <p class="fx-eyebrow">${c.guide}</p>
          <h1>${meta.h1}</h1>
          <p class="fx-lede">${meta.lede}</p>
          <p class="gd-updated"><time datetime="${meta.updated}">${c.updated(meta.updated)}</time></p>
        </header>
${body}
      </article>

      <section class="wrap fx-related" aria-labelledby="fx-related-title">
        <h2 id="fx-related-title">${c.more}</h2>
        <ul>
            ${related}
        </ul>
      </section>`;
  return shell({
    lang,
    root,
    title: meta.title,
    description: meta.description,
    url,
    otherHref: `${root}${dirOf(other)}guides/${slug}/`,
    alternates: [...LANGS.map((l) => `    <link rel="alternate" hreflang="${l}" href="${guideUrl(l, slug)}" />`), `    <link rel="alternate" hreflang="x-default" href="${guideUrl("en", slug)}" />`].join("\n"),
    schema: { "@context": "https://schema.org", "@graph": graph },
    current: "guide",
    main,
  });
}

function renderIndex(lang, all) {
  const c = CHROME[lang];
  const other = LANGS.find((l) => l !== lang);
  const url = indexUrl(lang);
  const root = lang === "en" ? "../" : "../../";
  const homeHref = root + dirOf(lang);
  const cards = SLUGS.map((s) => {
    const { meta } = all[lang][s];
    return `<li><a href="${s}/"><span class="gd-card-title">${meta.h1}</span><span class="gd-card-text">${meta.blurb}</span><span class="gd-card-more">${c.read} →</span></a></li>`;
  }).join("\n          ");
  const graph = [
    {
      "@type": "CollectionPage",
      "@id": url,
      url,
      name: c.indexTitle,
      description: c.indexDescription,
      inLanguage: lang,
      isPartOf: { "@id": `${ORIGIN}/#website` },
      breadcrumb: { "@id": `${url}#breadcrumb` },
      mainEntity: { "@type": "ItemList", itemListElement: SLUGS.map((s, i) => ({ "@type": "ListItem", position: i + 1, url: guideUrl(lang, s), name: all[lang][s].meta.h1 })) },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Pyloxa", item: `${ORIGIN}/${dirOf(lang)}` },
        { "@type": "ListItem", position: 2, name: c.guides, item: url },
      ],
    },
  ];
  const main = `      <nav class="wrap fx-crumbs" aria-label="Breadcrumb"><a href="${homeHref}">Pyloxa</a><span aria-hidden="true">/</span><span aria-current="page">${c.guides}</span></nav>
      <section class="wrap fx-hero gd-index-hero">
        <p class="fx-eyebrow">${c.guides}</p>
        <h1>${c.indexH1}</h1>
        <p class="fx-lede">${c.indexLede}</p>
      </section>
      <section class="wrap gd-index" aria-label="${c.guides}">
        <ul class="gd-cards">
          ${cards}
        </ul>
      </section>`;
  return shell({
    lang,
    root,
    title: c.indexTitle,
    description: c.indexDescription,
    url,
    otherHref: `${root}${dirOf(other)}guides/`,
    alternates: [...LANGS.map((l) => `    <link rel="alternate" hreflang="${l}" href="${indexUrl(l)}" />`), `    <link rel="alternate" hreflang="x-default" href="${indexUrl("en")}" />`].join("\n"),
    schema: { "@context": "https://schema.org", "@graph": graph },
    current: "index",
    main,
  });
}

const all = Object.fromEntries(LANGS.map((lang) => [lang, Object.fromEntries(SLUGS.map((s) => [s, readGuide(s, lang)]))]));

let changed = 0;
function emit(rel, html) {
  const file = path.join(site, rel);
  const old = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (old === html) return;
  changed++;
  if (check) {
    console.log(`不一致：${rel}`);
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, html);
  console.log(`已寫入 ${rel}`);
}
for (const lang of LANGS) {
  emit(`${dirOf(lang)}guides/index.html`, renderIndex(lang, all));
  for (const slug of SLUGS) emit(`${dirOf(lang)}guides/${slug}/index.html`, renderGuide(slug, lang, all));
}
if (!changed) console.log("沒有變更");
if (check && changed) process.exit(1);
