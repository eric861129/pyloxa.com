// 產生攻略頁（/guides/、/guides/<slug>/）與比較頁（/compare/、/compare/<slug>/），以及 /zh-TW/ 的對應頁面
//   node scripts/build-guides.mjs           寫入所有攻略頁
//   node scripts/build-guides.mjs --check   只檢查，有差異時以非零狀態結束
//
// 內容：src/guides/<slug>/<語言>.html，第一行是 <!--meta {...}--> 的 JSON：
//   title、description（<head>）、h1、lede（頁首）、nav（清單裡的短名稱）、blurb（索引頁的一句話）、updated（YYYY-MM-DD）、published（選填）
// 其餘是 <article> 裡的 HTML（簡短回答、各段、Pyloxa 一段、常見問題、資料來源）。
// 頁首、更新日期、下載區、相關攻略、頁尾、hreflang 與結構化資料由這支程式加上。
// 順序在 src/guides/guides.json 與 src/compare/compare.json；sitemap.xml 由 build-pages.mjs 讀同樣的清單。
// 比較頁的內容是對方產品官方頁面在 updated 那天的樣子，對方改版時要重新查證。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://pyloxa.com";
const check = process.argv.includes("--check");
const GUIDES = JSON.parse(readFileSync(path.join(site, "src/guides/guides.json"), "utf8"));
const COMPARE = JSON.parse(readFileSync(path.join(site, "src/compare/compare.json"), "utf8"));
const LANGS = GUIDES.languages;
if (COMPARE.languages.join() !== LANGS.join()) throw new Error("攻略與比較頁的語言要一樣");
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
    download: "Download",
    other: { lang: "zh-Hant", name: "繁體中文" },
    updated: (d) => `Updated ${new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}`,
    ctaTitle: "Want this handled for you?",
    ctaText: "Pyloxa is a free Windows app that runs the Claude Code and Codex CLIs you already use: it splits the work by your rules, runs your tests itself and offers a handoff when one runs out of quota.",
    ctaDownload: "Download Pyloxa for Windows",
    ctaMore: "How it works",
    help: "Help",
    helpText: "Step-by-step help for installing Pyloxa, connecting the CLIs, plans and troubleshooting.",
    changelog: "Changelog",
    privacy: "Privacy policy",
    eula: "License (EULA)",
    support: "Support",
    footer: "Pyloxa is not affiliated with or endorsed by Anthropic, OpenAI or Google. Product names belong to their owners.",
    version: `Version ${version} · Windows 10 and 11`,
  },
  "zh-TW": {
    htmlLang: "zh-Hant-TW",
    ogLocale: "zh_TW",
    og: "og-zh.png",
    skip: "跳到主要內容",
    homeLabel: "Pyloxa 首頁",
    guides: "攻略",
    download: "下載",
    other: { lang: "en", name: "English" },
    updated: (d) => {
      const [y, m, day] = d.split("-").map(Number);
      return `更新於 ${y} 年 ${m} 月 ${day} 日`;
    },
    ctaTitle: "想把這些交給工具處理？",
    ctaText: "Pyloxa 是免費的 Windows App，執行你已經在用的 Claude Code 與 Codex CLI：依你的規則分工、自己跑你的測試，某一個額度用完時提出換手。",
    ctaDownload: "下載 Pyloxa Windows 版",
    ctaMore: "看看怎麼運作",
    help: "說明文件",
    helpText: "安裝 Pyloxa、連線 CLI、計畫與疑難排解的操作步驟。",
    changelog: "改版紀錄",
    privacy: "隱私權政策",
    eula: "授權條款（EULA）",
    support: "聯絡我們",
    footer: "Pyloxa 與 Anthropic、OpenAI、Google 沒有關聯，也未獲得它們背書。產品名稱屬於各自的所有者。",
    version: `版本 ${version} · Windows 10 與 11`,
  },
};

// 每個集合自己的文字（其餘共用 CHROME）
const COLLECTIONS = [
  { dir: "guides", src: "src/guides", slugs: GUIDES.guides, schemaType: "TechArticle" },
  { dir: "compare", src: "src/compare", slugs: COMPARE.pages, schemaType: "Article" },
];
const TEXT = {
  guides: {
    en: {
      label: "Guides",
      eyebrow: "Guide",
      indexTitle: "Guides: Claude Code, Codex and Gemini CLI in practice | Pyloxa",
      indexDescription: "Practical guides for developers who use Claude Code, Codex and Gemini CLI: usage limits, running both on one project, Windows setup, checking agent work and shared instructions.",
      indexH1: "Guides for working with AI coding agents",
      indexLede: "Practical answers for developers who use Claude Code, Codex and Gemini CLI, checked against each vendor’s own documentation. Useful whether or not you use Pyloxa.",
      more: "More guides",
      read: "Read the guide",
      note: "",
    },
    "zh-TW": {
      label: "攻略",
      eyebrow: "攻略",
      indexTitle: "攻略：Claude Code、Codex 與 Gemini CLI 實戰 | Pyloxa",
      indexDescription: "給使用 Claude Code、Codex 與 Gemini CLI 的開發者：額度用完怎麼辦、兩個一起用、Windows 安裝、驗收 Agent 的成果與共用指示檔。",
      indexH1: "AI 程式開發 Agent 攻略",
      indexLede: "給使用 Claude Code、Codex 與 Gemini CLI 的開發者的實用解答，內容都對照過各家的官方文件。不管有沒有用 Pyloxa 都派得上用場。",
      more: "其他攻略",
      read: "閱讀攻略",
      note: "",
    },
  },
  compare: {
    en: {
      label: "Comparisons",
      eyebrow: "Comparison",
      indexTitle: "Pyloxa compared: Codex app, Claude Code desktop, Conductor and more",
      indexDescription: "How Pyloxa compares with the Codex app, Claude Code in the Claude desktop app, Conductor, Herdr and cmux, with when each one is the better choice.",
      indexH1: "How Pyloxa compares",
      indexLede: "Side-by-side comparisons with other ways to run Claude Code and Codex, checked against each product’s official pages. Each one says when the other product is the better fit.",
      more: "More comparisons",
      read: "Read the comparison",
      note: "Comparisons describe each product’s official pages on the date shown. Product names and trademarks belong to their owners, who don’t endorse these pages. Spotted something out of date? Write to <a href=\"mailto:support@pyloxa.com\">support@pyloxa.com</a>.",
    },
    "zh-TW": {
      label: "比較",
      eyebrow: "比較",
      indexTitle: "Pyloxa 比較：Codex App、Claude Code 桌面版、Conductor 等",
      indexDescription: "Pyloxa 和 Codex App、Claude 桌面版的 Claude Code、Conductor、Herdr、cmux 有什麼不同，以及各自適合誰。",
      indexH1: "Pyloxa 和其他工具的比較",
      indexLede: "和其他執行 Claude Code、Codex 的方式並排比較，內容都對照過各產品的官方頁面。每一篇都會說明什麼情況下對方比較適合。",
      more: "其他比較",
      read: "閱讀比較",
      note: "比較內容依各產品官方頁面在標示日期的樣子。產品名稱與商標屬於各自的所有者，他們並未背書這些頁面。發現內容過時了？請寫信到 <a href=\"mailto:support@pyloxa.com\">support@pyloxa.com</a>。",
    },
  },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const decode = (s) => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const dirOf = (lang) => (lang === "en" ? "" : `${lang}/`);
const indexUrl = (col, lang) => `${ORIGIN}/${dirOf(lang)}${col.dir}/`;
const guideUrl = (col, lang, slug) => `${ORIGIN}/${dirOf(lang)}${col.dir}/${slug}/`;
const AUTHOR = { "@type": "Person", name: "ChiYu-Huang", url: "https://github.com/eric861129" };

function readGuide(col, slug, lang) {
  const file = path.join(site, col.src, slug, `${lang}.html`);
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
function shell({ col, lang, root, title, description, url, otherHref, alternates, schema, current, main }) {
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
        <li class="optional"><a href="${homeHref}guides/"${current === "index" && col.dir === "guides" ? ' aria-current="page"' : ""}>${c.guides}</a></li>
        <li class="optional"><a href="${homeHref}compare/"${current === "index" && col.dir === "compare" ? ' aria-current="page"' : ""}>${TEXT.compare[lang].label}</a></li>
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
      <p>${c.version} · <a href="${homeHref}help/">${c.help}</a> · <a href="${homeHref}guides/">${c.guides}</a> · <a href="${homeHref}compare/">${TEXT.compare[lang].label}</a> · <a href="${homeHref}changelog/">${c.changelog}</a> · <a href="${homeHref}privacy/">${c.privacy}</a> · <a href="${root}legal/EULA.txt">${c.eula}</a> · <a href="mailto:support@pyloxa.com">${c.support}</a></p>
      <p>${c.footer}</p>${TEXT[col.dir][lang].note ? `\n      <p>${TEXT[col.dir][lang].note}</p>` : ""}
    </footer>

    <script src="${root}assets/site.js" defer></script>
    <!-- Cloudflare Web Analytics：不使用 cookie，只統計瀏覽次數 --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "4fd2f289f39942fea6f9881f3b5cad55"}'></script>
  </body>
</html>
`;
}

function renderGuide(col, slug, lang, all) {
  const c = CHROME[lang];
  const x = TEXT[col.dir][lang];
  const other = LANGS.find((l) => l !== lang);
  const { meta, body } = all[col.dir][lang][slug];
  const url = guideUrl(col, lang, slug);
  const root = lang === "en" ? "../../" : "../../../";
  const homeHref = root + dirOf(lang);
  const graph = [
    {
      "@type": col.schemaType,
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
        { "@type": "ListItem", position: 2, name: x.label, item: indexUrl(col, lang) },
        { "@type": "ListItem", position: 3, name: meta.nav, item: url },
      ],
    },
  ];
  const faq = faqSchema(body, url);
  if (faq) graph.push(faq);
  const related = col.slugs.filter((s) => s !== slug)
    .map((s) => `<li><a href="../${s}/"><span>${all[col.dir][lang][s].meta.nav}</span><span class="fx-related-text">${all[col.dir][lang][s].meta.blurb}</span></a></li>`)
    .concat(`<li><a href="${homeHref}help/"><span>${c.help}</span><span class="fx-related-text">${c.helpText}</span></a></li>`)
    .join("\n            ");
  const main = `      <nav class="wrap fx-crumbs" aria-label="Breadcrumb"><a href="${homeHref}">Pyloxa</a><span aria-hidden="true">/</span><a href="../">${x.label}</a><span aria-hidden="true">/</span><span aria-current="page">${meta.nav}</span></nav>
      <article class="wrap gd">
        <header class="gd-head">
          <p class="fx-eyebrow">${x.eyebrow}</p>
          <h1>${meta.h1}</h1>
          <p class="fx-lede">${meta.lede}</p>
          <p class="gd-updated"><time datetime="${meta.updated}">${c.updated(meta.updated)}</time></p>
        </header>
${body}
      </article>

      <section class="wrap fx-related" aria-labelledby="fx-related-title">
        <h2 id="fx-related-title">${x.more}</h2>
        <ul>
            ${related}
        </ul>
      </section>`;
  return shell({
    col,
    lang,
    root,
    title: meta.title,
    description: meta.description,
    url,
    otherHref: `${root}${dirOf(other)}${col.dir}/${slug}/`,
    alternates: [...LANGS.map((l) => `    <link rel="alternate" hreflang="${l}" href="${guideUrl(col, l, slug)}" />`), `    <link rel="alternate" hreflang="x-default" href="${guideUrl(col, "en", slug)}" />`].join("\n"),
    schema: { "@context": "https://schema.org", "@graph": graph },
    current: "guide",
    main,
  });
}

function renderIndex(col, lang, all) {
  const c = CHROME[lang];
  const x = TEXT[col.dir][lang];
  const other = LANGS.find((l) => l !== lang);
  const url = indexUrl(col, lang);
  const root = lang === "en" ? "../" : "../../";
  const homeHref = root + dirOf(lang);
  const cards = col.slugs.map((s) => {
    const { meta } = all[col.dir][lang][s];
    return `<li><a href="${s}/"><span class="gd-card-title">${meta.h1}</span><span class="gd-card-text">${meta.blurb}</span><span class="gd-card-more">${x.read} →</span></a></li>`;
  }).join("\n          ");
  const graph = [
    {
      "@type": "CollectionPage",
      "@id": url,
      url,
      name: x.indexTitle,
      description: x.indexDescription,
      inLanguage: lang,
      isPartOf: { "@id": `${ORIGIN}/#website` },
      breadcrumb: { "@id": `${url}#breadcrumb` },
      mainEntity: { "@type": "ItemList", itemListElement: col.slugs.map((s, i) => ({ "@type": "ListItem", position: i + 1, url: guideUrl(col, lang, s), name: all[col.dir][lang][s].meta.h1 })) },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Pyloxa", item: `${ORIGIN}/${dirOf(lang)}` },
        { "@type": "ListItem", position: 2, name: x.label, item: url },
      ],
    },
  ];
  const main = `      <nav class="wrap fx-crumbs" aria-label="Breadcrumb"><a href="${homeHref}">Pyloxa</a><span aria-hidden="true">/</span><span aria-current="page">${x.label}</span></nav>
      <section class="wrap fx-hero gd-index-hero">
        <p class="fx-eyebrow">${x.label}</p>
        <h1>${x.indexH1}</h1>
        <p class="fx-lede">${x.indexLede}</p>
      </section>
      <section class="wrap gd-index" aria-label="${x.label}">
        <ul class="gd-cards">
          ${cards}
        </ul>
      </section>`;
  return shell({
    col,
    lang,
    root,
    title: x.indexTitle,
    description: x.indexDescription,
    url,
    otherHref: `${root}${dirOf(other)}${col.dir}/`,
    alternates: [...LANGS.map((l) => `    <link rel="alternate" hreflang="${l}" href="${indexUrl(col, l)}" />`), `    <link rel="alternate" hreflang="x-default" href="${indexUrl(col, "en")}" />`].join("\n"),
    schema: { "@context": "https://schema.org", "@graph": graph },
    current: "index",
    main,
  });
}

const all = Object.fromEntries(COLLECTIONS.map((col) => [col.dir, Object.fromEntries(LANGS.map((lang) => [lang, Object.fromEntries(col.slugs.map((s) => [s, readGuide(col, s, lang)]))]))]));

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
for (const col of COLLECTIONS) {
  for (const lang of LANGS) {
    emit(`${dirOf(lang)}${col.dir}/index.html`, renderIndex(col, lang, all));
    for (const slug of col.slugs) emit(`${dirOf(lang)}${col.dir}/${slug}/index.html`, renderGuide(col, slug, lang, all));
  }
}
if (!changed) console.log("沒有變更");
if (check && changed) process.exit(1);
