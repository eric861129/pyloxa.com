// 依首頁的常見問題產生結構化資料（Organization、WebSite、FAQPage），寫進各語言首頁的
// <script type="application/ld+json" id="site-graph">。SoftwareApplication 由 build-pages.mjs 產生。
// build-pages.mjs 產生頁面時會直接呼叫 siteGraphTag()；單獨執行本檔則就地更新 src/languages.json 列出的每一頁。
// 用法：node scripts/build-schema.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://pyloxa.com";
const languages = JSON.parse(readFileSync(path.join(site, "src", "languages.json"), "utf8")).filter((l) => existsSync(path.join(site, "src", "i18n", `${l.code}.json`)));

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

function faq(html) {
  const section = html.slice(html.indexOf('id="faq"'), html.indexOf('class="faq-pane"'));
  // 題目是 <h3 class="faq-q"><button>…</button></h3>（標題讓題目能單獨被引用）
  const items = [...section.matchAll(/<li data-q[^>]*>\s*(?:<h3[^>]*>\s*)?<button[^>]*>([\s\S]*?)<\/button>\s*(?:<\/h3>\s*)?<div class="inline-answer">([\s\S]*?)<\/div>\s*<\/li>/g)];
  if (items.length === 0) throw new Error("找不到常見問題");
  return items.map(([, q, a]) => ({
    "@type": "Question",
    name: decode(q),
    acceptedAnswer: { "@type": "Answer", text: decode(a) },
  }));
}

export function siteGraphTag(html, page) {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${ORIGIN}/#organization`,
        name: "Pyloxa",
        url: `${ORIGIN}/`,
        logo: `${ORIGIN}/assets/icon-512.png`,
        email: "support@pyloxa.com",
        founder: { "@type": "Person", name: "ChiYu-Huang", sameAs: ["https://github.com/eric861129"] },
        sameAs: ["https://github.com/eric861129/Pyloxa-Releases"],
      },
      {
        "@type": "WebSite",
        "@id": `${ORIGIN}/#website`,
        url: `${ORIGIN}/`,
        name: "Pyloxa",
        inLanguage: languages.map((l) => l.hreflang),
        publisher: { "@id": `${ORIGIN}/#organization` },
      },
      {
        "@type": "FAQPage",
        "@id": `${page.url}#faq`,
        url: page.url,
        inLanguage: page.lang,
        isPartOf: { "@id": `${ORIGIN}/#website` },
        mainEntity: faq(html),
      },
    ],
  };
  // JSON 放進 <script> 時跳脫 <，避免內容裡出現 </script>
  return `<script type="application/ld+json" id="site-graph">${JSON.stringify(graph).replace(/</g, "\\u003c")}</script>`;
}

const existing = /<script type="application\/ld\+json" id="site-graph">[\s\S]*?<\/script>/;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const l of languages) {
    const rel = path.join(l.dir || "", "index.html");
    const file = path.join(site, rel);
    let html = readFileSync(file, "utf8");
    const url = `${ORIGIN}/${l.dir ? `${l.dir}/` : ""}`;
    const tag = siteGraphTag(html, { url, lang: l.hreflang });
    if (!existing.test(html)) throw new Error(`${rel} 沒有 site-graph 區塊`);
    html = html.replace(existing, () => tag);
    writeFileSync(file, html);
    console.log(rel, faq(html).length, "questions");
  }
}
