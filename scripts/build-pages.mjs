// 以 src/home.html（模板）與 src/i18n/<lang>.json（語言檔）產生各語言的首頁。
//
//   node scripts/build-pages.mjs           產生所有語言的首頁、sitemap.xml
//   node scripts/build-pages.mjs --check   只比對，不寫檔；有差異時以非 0 結束
//
// 模板裡的 {{key}} 換成語言檔裡同名的值（值是 HTML，照原樣放入），{{@name}} 是由 src/languages.json 算出的值。
// 產生後要再跑 node scripts/build-schema.mjs，更新每一頁的 FAQ 結構化資料。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { siteGraphTag } from "./build-schema.mjs";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://pyloxa.com";
const check = process.argv.includes("--check");
// 還沒有語言檔的語言先略過（翻譯完成、放進 src/i18n 後才會產生頁面）
const languages = JSON.parse(readFileSync(path.join(site, "src", "languages.json"), "utf8")).filter((l) => {
  const ok = existsSync(path.join(site, "src", "i18n", `${l.code}.json`));
  if (!ok) console.warn(`${l.code}: 還沒有 src/i18n/${l.code}.json，先略過`);
  return ok;
});
const template = readFileSync(path.join(site, "src", "home.html"), "utf8");
const english = JSON.parse(readFileSync(path.join(site, "src", "i18n", "en.json"), "utf8"));
const { version, installer } = JSON.parse(readFileSync(path.join(site, "src", "site.json"), "utf8"));
// 安裝檔：下載按鈕先到各語言的 /download/ 頁，那一頁再直接下載這個檔案（發布新版時更新 src/site.json 的 version 與 installer）
if (!installer?.sha256 || !installer?.bytes) throw new Error("src/site.json 要有 installer.sha256 與 installer.bytes");
const exeName = `Pyloxa-Setup-${version}.exe`;
const exe = `https://github.com/eric861129/Pyloxa-Releases/releases/download/v${version}/${exeName}`;
const size = `${(installer.bytes / 1e6).toFixed(1)} MB`;
// 發布次數：數改版紀錄裡有幾個版本
const releases = String((readFileSync(path.join(site, "changelog", "index.html"), "utf8").match(/<article class="release"/g) || []).length);
const downloadTemplate = readFileSync(path.join(site, "src", "download.html"), "utf8");
// 功能頁（/workflow/ 等，scripts/build-features.mjs 產生）：只有這些語言有，其他語言的首頁連到英文版
const features = JSON.parse(readFileSync(path.join(site, "src", "features", "pages.json"), "utf8"));

// 模板用哪種換行，產生的片段就用哪種
const NL = template.includes("\r\n") ? "\r\n" : "\n";
const LT = "\\u003c"; // JSON 放進 <script> 時把 < 寫成這個，避免內容裡出現 </script>

// 下載頁與首頁共用同一段 Google Analytics
const gaStart = template.indexOf("    <!-- Google Analytics");
const gaEnd = template.indexOf("</script>", gaStart) + "</script>".length;
if (gaStart < 0 || gaEnd < gaStart) throw new Error("在 src/home.html 找不到 Google Analytics 片段");
const analytics = template.slice(gaStart, gaEnd);

const pageUrl = (lang) => `${ORIGIN}/${lang.dir ? `${lang.dir}/` : ""}`;

// Open Graph 的語言：目前語言一行，其他語言各一行 alternate
function ogLocales(current) {
  const lines = [`    <meta property="og:locale" content="${current.ogLocale}" />`];
  for (const l of languages) if (l.code !== current.code) lines.push(`    <meta property="og:locale:alternate" content="${l.ogLocale}" />`);
  return lines.map((x) => `${x}${NL}`).join("");
}

// SoftwareApplication：與 Organization、WebSite 以 @id 串在一起；描述取自語言檔
function appSchema(lang, strings, url) {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${url}#software`,
    name: "Pyloxa",
    url,
    image: `${ORIGIN}/assets/${lang.og}`,
    description: strings["head.ogDescription"] ?? english["head.ogDescription"],
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Windows 10, Windows 11",
    softwareVersion: version,
    downloadUrl: exe,
    fileSize: size,
    releaseNotes: "https://github.com/eric861129/Pyloxa-Releases/releases",
    inLanguage: lang.hreflang,
    isPartOf: { "@id": `${ORIGIN}/#website` },
    publisher: { "@id": `${ORIGIN}/#organization` },
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock", url: `${url}download/` },
    author: { "@type": "Person", name: "ChiYu-Huang", url: "https://github.com/eric861129" },
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, LT)}</script>`;
}

// 每一頁 <head> 的語言對應，所有語言一起列出，最後是 x-default（英文）
function alternates() {
  const lines = languages.map((l) => `    <link rel="alternate" hreflang="${l.hreflang}" href="${pageUrl(l)}" />`);
  lines.push(`    <link rel="alternate" hreflang="x-default" href="${pageUrl(languages[0])}" />`);
  return lines.map((x) => `${x}${NL}`).join("");
}

// 語言選單：目前語言標成 aria-current，其他語言連到各自的首頁
function languageMenu(current, nav, strings) {
  const items = languages
    .map((l) => {
      const href = (current.dir ? "../" : "") + (l.dir ? `${l.dir}/` : "") || "./";
      const here = l.code === current.code ? ' aria-current="true"' : "";
      return `<li><a href="${href}" lang="${l.htmlLang}" hreflang="${l.hreflang}"${here}>${l.name}</a></li>`;
    })
    .join("");
  return `<details class="lang-menu${nav ? " in-nav" : ""}"><summary><span class="lang-current">${current.name}</span><span class="visually-hidden"> — ${strings["lang.menu"] ?? english["lang.menu"]}</span></summary><ul>${items}</ul></details>`;
}

// 模板的 {{key}} 換成語言檔的值，{{@name}} 換成 vars 的值
function fillTemplate(text, lang, strings, vars) {
  const fill = (s) =>
    s.replace(/\{\{@([\w-]+)\}\}/g, (_, key) => {
      if (!(key in vars)) throw new Error(`用到未知的變數 {{@${key}}}`);
      return vars[key];
    });
  const missing = [];
  const html = text.replace(/\{\{(@?)([\w.@-]+)\}\}/g, (_, at, key) => {
    if (at) {
      if (!(key in vars)) throw new Error(`模板用到未知的變數 {{@${key}}}`);
      return vars[key];
    }
    if (key in strings) return fill(strings[key]);
    if (key in english) {
      missing.push(key);
      return fill(english[key]);
    }
    throw new Error(`${lang.code}: 模板用到語言檔裡沒有的 {{${key}}}`);
  });
  if (missing.length) console.warn(`${lang.code}: ${missing.length} 個項目沒有翻譯，先用英文：${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}`);
  return html;
}

const readStrings = (lang) => JSON.parse(readFileSync(path.join(site, "src", "i18n", `${lang.code}.json`), "utf8"));

function render(lang) {
  const strings = readStrings(lang);
  const url = pageUrl(lang);
  const vars = {
    root: lang.dir ? "../" : "",
    url,
    htmlLang: lang.htmlLang,
    hreflang: lang.hreflang,
    version,
    assetLang: lang.assets,
    ogImage: `${ORIGIN}/assets/${lang.og}`,
    ogLocales: ogLocales(lang),
    wlTag: lang.code.toLowerCase(),
    // 改版紀錄、隱私權政策與說明文件只有英文與繁中；其他語言連到英文版
    changelog: lang.pages?.includes("changelog") ? "changelog/" : `${lang.dir ? "../" : ""}changelog/`,
    privacy: lang.pages?.includes("privacy") ? "privacy/" : `${lang.dir ? "../" : ""}privacy/`,
    help: lang.pages?.includes("help") ? "help/" : `${lang.dir ? "../" : ""}help/`,
    // App 介面只有英文、繁中、簡中：其他語言的頁面在下載按鈕旁說明
    appLangNote: lang.appUi ? "" : `<span class="meta app-lang">${strings["hero.appLang"] ?? english["hero.appLang"]}</span>`,
    alternates: alternates(),
    langMenuNav: languageMenu(lang, true, strings),
    langMenuFooter: languageMenu(lang, false, strings),
    appSchema: appSchema(lang, strings, url),
    siteGraph: '<script type="application/ld+json" id="site-graph">{}</script>',
    feat: features.languages.includes(lang.code) ? "" : "../",
    exe,
    exeName,
    size,
    sha256: installer.sha256,
    releases,
  };
  const html = fillTemplate(template, lang, strings, vars);
  // FAQ 的結構化資料要從產生好的頁面讀常見問題
  const graph = siteGraphTag(html, { url, lang: lang.hreflang });
  return html.replace(vars.siteGraph, () => graph);
}

// 下載頁：從下載按鈕來（網址帶 #start）時自動下載；說明 SmartScreen、安裝步驟與校驗碼
const downloadUrl = (l) => `${pageUrl(l)}download/`;
function renderDownload(lang) {
  const strings = readStrings(lang);
  const url = downloadUrl(lang);
  const up = lang.dir ? "../../" : "../";
  const sub = (p) => (lang.pages?.includes(p) ? `../${p}/` : `${up}${p}/`);
  const items = languages
    .map((l) => {
      const here = l.code === lang.code ? ' aria-current="true"' : "";
      return `<li><a href="${up}${l.dir ? `${l.dir}/` : ""}download/" lang="${l.htmlLang}" hreflang="${l.hreflang}"${here}>${l.name}</a></li>`;
    })
    .join("");
  const langMenu = `<details class="lang-menu in-nav"><summary><span class="lang-current">${lang.name}</span><span class="visually-hidden"> — ${strings["lang.menu"] ?? english["lang.menu"]}</span></summary><ul>${items}</ul></details>`;
  const alts = [...languages.map((l) => `    <link rel="alternate" hreflang="${l.hreflang}" href="${downloadUrl(l)}" />`), `    <link rel="alternate" hreflang="x-default" href="${downloadUrl(languages[0])}" />`];
  const title = strings["dl.title"] ?? english["dl.title"];
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": url, url, name: title, inLanguage: lang.hreflang, isPartOf: { "@id": `${ORIGIN}/#website` }, about: { "@id": `${ORIGIN}/#software` }, publisher: { "@id": `${ORIGIN}/#organization` }, breadcrumb: { "@id": `${url}#breadcrumb` } },
      { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [{ "@type": "ListItem", position: 1, name: "Pyloxa", item: pageUrl(lang) }, { "@type": "ListItem", position: 2, name: strings["body.12"] ?? english["body.12"], item: url }] },
    ],
  };
  const vars = {
    htmlLang: lang.htmlLang,
    url,
    up,
    home: "../",
    help: sub("help"),
    changelog: sub("changelog"),
    privacy: sub("privacy"),
    ogImage: `${ORIGIN}/assets/${lang.og}`,
    alternates: alts.map((x) => `${x}${NL}`).join(""),
    schema: `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, LT)}</script>`,
    langMenu,
    analytics,
    version,
    exe,
    exeName,
    size,
    sha256: installer.sha256,
    releases,
  };
  return fillTemplate(downloadTemplate, lang, strings, vars);
}

function sitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const alt = (href) => (l) => `    <xhtml:link rel="alternate" hreflang="${l.hreflang}" href="${href(l)}" />`;
  const dlAlts = [...languages.map(alt(downloadUrl)), `    <xhtml:link rel="alternate" hreflang="x-default" href="${downloadUrl(languages[0])}" />`].join("\n");
  const homeAlts = [...languages.map(alt(pageUrl)), `    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(languages[0])}" />`].join("\n");
  // 改版紀錄、隱私權政策與說明文件目前只有英文與繁中
  const pair = (sub) => {
    const en = `${ORIGIN}/${sub}/`;
    const zh = `${ORIGIN}/zh-TW/${sub}/`;
    const alts = [`    <xhtml:link rel="alternate" hreflang="en" href="${en}" />`, `    <xhtml:link rel="alternate" hreflang="zh-TW" href="${zh}" />`, `    <xhtml:link rel="alternate" hreflang="x-default" href="${en}" />`].join("\n");
    return [en, zh].map((u) => `  <url>\n    <loc>${u}</loc>\n    <lastmod>${today}</lastmod>\n${alts}\n  </url>`);
  };
  const urls = [
    ...languages.map((l) => `  <url>\n    <loc>${pageUrl(l)}</loc>\n    <lastmod>${today}</lastmod>\n${homeAlts}\n  </url>`),
    ...languages.map((l) => `  <url>\n    <loc>${downloadUrl(l)}</loc>\n    <lastmod>${today}</lastmod>\n${dlAlts}\n  </url>`),
    ...features.pages.flatMap((p) => pair(p.slug)),
    ...pair("changelog"),
    ...pair("privacy"),
    ...pair("help"),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
}

let changed = 0;
function emit(rel, content) {
  const file = path.join(site, rel);
  const old = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (old === content) return;
  changed++;
  if (check) {
    console.log(`不一致：${rel}`);
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  console.log(`已寫入 ${rel}`);
}

// languages.json 的 pages 是手寫的子頁面（改版紀錄、隱私權政策、說明文件）；首頁與 sitemap 會連過去，所以檔案一定要在
const missingPages = languages.flatMap((l) => (l.pages ?? []).map((p) => path.join(l.dir || "", p, "index.html")).filter((rel) => !existsSync(path.join(site, rel))));
if (missingPages.length) {
  console.error(`languages.json 列了這些子頁面，但檔案不存在：${missingPages.join("、")}`);
  process.exit(1);
}

for (const lang of languages) {
  emit(path.join(lang.dir || "", "index.html"), render(lang));
  emit(path.join(lang.dir || "", "download", "index.html"), renderDownload(lang));
}
if (!process.argv.includes("--pages-only")) emit("sitemap.xml", sitemap());
if (check && changed) process.exit(1);
if (!changed) console.log("沒有變更");
