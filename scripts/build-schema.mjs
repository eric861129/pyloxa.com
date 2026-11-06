// 依首頁的常見問題產生結構化資料（Organization、WebSite、FAQPage），寫進 index.html 與 zh-TW/index.html 的
// <script type="application/ld+json" id="site-graph">。SoftwareApplication 那段另外手寫，不在這裡產生。
// 官網沒有建置步驟：改了常見問題或品牌資訊後執行一次，把頁面一起提交。
// 用法：node scripts/build-schema.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://pyloxa.com";

const pages = [
  { file: "index.html", url: `${ORIGIN}/`, lang: "en" },
  { file: "zh-TW/index.html", url: `${ORIGIN}/zh-TW/`, lang: "zh-TW" },
];

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
  const items = [...section.matchAll(/<li data-q[^>]*>\s*<button[^>]*>([\s\S]*?)<\/button>\s*<div class="inline-answer">([\s\S]*?)<\/div>\s*<\/li>/g)];
  if (items.length === 0) throw new Error("找不到常見問題");
  return items.map(([, q, a]) => ({
    "@type": "Question",
    name: decode(q),
    acceptedAnswer: { "@type": "Answer", text: decode(a) },
  }));
}

for (const page of pages) {
  const file = path.join(site, page.file);
  let html = readFileSync(file, "utf8");
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
        inLanguage: ["en", "zh-TW"],
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
  const tag = `<script type="application/ld+json" id="site-graph">${JSON.stringify(graph).replace(/</g, "\\u003c")}</script>`;
  const existing = /<script type="application\/ld\+json" id="site-graph">[\s\S]*?<\/script>/;
  if (existing.test(html)) html = html.replace(existing, tag);
  else {
    // 第一次：放在 SoftwareApplication 那段後面
    const at = html.indexOf("</script>", html.indexOf('<script type="application/ld+json">')) + "</script>".length;
    html = `${html.slice(0, at)}\n    ${tag}${html.slice(at)}`;
  }
  writeFileSync(file, html);
  console.log(page.file, graph["@graph"][2].mainEntity.length, "questions");
}
