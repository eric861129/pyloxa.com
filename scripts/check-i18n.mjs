// 檢查語言檔與英文（src/i18n/en.json）一致：項目齊全、HTML 標籤與 {{@變數}} 沒被改壞、頁面 JSON 仍可解析。
//
//   node scripts/check-i18n.mjs            檢查所有語言
//   node scripts/check-i18n.mjs ja ko      只檢查指定語言
//
// 有問題時列出項目並以非 0 結束。
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (code) => JSON.parse(readFileSync(path.join(site, "src", "i18n", `${code}.json`), "utf8"));
const languages = JSON.parse(readFileSync(path.join(site, "src", "languages.json"), "utf8"));
const en = load("en");
const wanted = process.argv.slice(2);
const codes = (wanted.length ? wanted : languages.map((l) => l.code)).filter((c) => c !== "en");

// 這些項目的標記可以和英文不同：名字區塊的在地說明（英文是空的）、語言說明句
const FREE_MARKUP = (key) => /^name\.[A-Z]\.local$/.test(key) || key === "b4.2";
const tags = (s) => [...s.replace(/<script[\s\S]*?<\/script>/g, "<script>").matchAll(/<\/?([a-zA-Z0-9]+)[^>]*>/g)].map((m) => m[0].startsWith("</") ? `/${m[1]}` : m[1]);
const attrsOf = (s) => [...s.matchAll(/<[a-zA-Z0-9]+([^>]*)>/g)].map((m) => [...m[1].matchAll(/\s([\w:-]+)=/g)].map((a) => a[1]).join(","));
const vars = (s) => [...s.matchAll(/\{\{@[\w-]+\}\}/g)].map((m) => m[0]).sort().join(" ");
const jsonIn = (s) => {
  const m = s.match(/<script type="application\/json" id="copy">([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
};
const shape = (o) => (o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o);

let problems = 0;
const report = (code, key, msg) => {
  problems++;
  console.log(`${code}  ${key}: ${msg}`);
};

for (const code of codes) {
  const file = path.join(site, "src", "i18n", `${code}.json`);
  if (!existsSync(file)) {
    report(code, "-", "還沒有語言檔");
    continue;
  }
  let d;
  try {
    d = load(code);
  } catch (e) {
    report(code, "-", `不是有效的 JSON：${e.message}`);
    continue;
  }
  const enKeys = Object.keys(en);
  const keys = Object.keys(d);
  for (const k of enKeys) if (!(k in d)) report(code, k, "缺少");
  for (const k of keys) if (!(k in en)) report(code, k, "英文沒有這個項目");
  if (enKeys.join("|") !== keys.filter((k) => k in en).join("|")) report(code, "-", "項目順序和英文不同");
  for (const k of enKeys) {
    if (!(k in d)) continue;
    // 只屬於英文頁的項目（Bing 網站驗證），其他語言一律留空
    if (k === "head.extra") {
      if (d[k] !== "") report(code, k, "只用在英文頁，請留空字串");
      continue;
    }
    const a = en[k];
    const b = d[k];
    if (typeof b !== "string") {
      report(code, k, "值不是字串");
      continue;
    }
    if (vars(a) !== vars(b)) report(code, k, `{{@變數}} 不同：英文「${vars(a)}」，這裡「${vars(b)}」`);
    if (!FREE_MARKUP(k)) {
      if (tags(a).join(" ") !== tags(b).join(" ")) report(code, k, `HTML 標籤不同：英文「${tags(a).join(" ")}」，這裡「${tags(b).join(" ")}」`);
      else if (attrsOf(a).join("|") !== attrsOf(b).join("|")) report(code, k, "HTML 屬性不同");
    }
    if (/<(?!\/?[a-zA-Z])|&(?![a-zA-Z]+;|#\d+;|#x[0-9a-fA-F]+;)/.test(b.replace(/<script[\s\S]*?<\/script>/g, ""))) report(code, k, "有未跳脫的 < 或 &");
    if (a.includes('id="copy"')) {
      try {
        if (JSON.stringify(shape(jsonIn(a))) !== JSON.stringify(shape(jsonIn(b)))) report(code, k, "頁面 JSON 的結構和英文不同");
      } catch (e) {
        report(code, k, `頁面 JSON 無法解析：${e.message}`);
      }
    }
    if (b.trim() === "" && a.trim() !== "" ) report(code, k, "是空的");
  }
}

if (problems) {
  console.log(`共 ${problems} 個問題`);
  process.exit(1);
}
console.log(`檢查通過：${codes.join("、")}`);
