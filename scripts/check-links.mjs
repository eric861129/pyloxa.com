// 檢查站內連結：每個 HTML 頁面裡的 href 與 src，只要是站內的（相對路徑或以 / 開頭），
// 指到的檔案都要存在；帶 #錨點 的連結，目標頁面也要有那個 id。外部網址與 mailto: 不檢查。
//
//   node scripts/check-links.mjs            檢查所有頁面
//   node scripts/check-links.mjs help       只檢查路徑含 help 的頁面（連結目標仍以全站為準）
//
// 有問題時列出來並以非 0 結束。
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set([".git", "node_modules", "scripts", "src", ".github"]);
const filter = process.argv.slice(2);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (name.endsWith(".html")) out.push(full);
  }
  return out;
}

const pages = walk(site);
const idCache = new Map();
const idsOf = (file) => {
  if (!idCache.has(file)) {
    const html = readFileSync(file, "utf8");
    idCache.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return idCache.get(file);
};

// 站內網址對應到的檔案：資料夾就是裡面的 index.html
function target(fromFile, url) {
  const base = url.startsWith("/") ? site : path.dirname(fromFile);
  let p = path.join(base, decodeURIComponent(url.replace(/^\//, "")));
  if (url === "" ) return fromFile;
  if (url.endsWith("/") || (existsSync(p) && statSync(p).isDirectory())) p = path.join(p, "index.html");
  return p;
}

let problems = 0;
let checked = 0;
for (const file of pages) {
  const rel = path.relative(site, file).replaceAll("\\", "/");
  if (filter.length && !filter.some((f) => rel.includes(f))) continue;
  const html = readFileSync(file, "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
  for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const raw = m[1].replaceAll("&amp;", "&");
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) continue; // https:、mailto:、data: 等
    checked++;
    const [urlPart, hash] = raw.split("#");
    const url = urlPart.split("?")[0];
    const dest = target(file, url);
    if (!existsSync(dest)) {
      problems++;
      console.log(`${rel}: 連結「${raw}」指到不存在的 ${path.relative(site, dest).replaceAll("\\", "/")}`);
      continue;
    }
    if (hash && dest.endsWith(".html") && !idsOf(dest).has(hash)) {
      problems++;
      console.log(`${rel}: 連結「${raw}」的錨點 #${hash} 在 ${path.relative(site, dest).replaceAll("\\", "/")} 找不到`);
    }
  }
}

console.log(`檢查了 ${checked} 個站內連結，${problems ? `${problems} 個有問題` : "都有效"}`);
if (problems) process.exit(1);
