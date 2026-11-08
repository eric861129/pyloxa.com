"""一次性的轉換：從現有的 index.html（英文）與 zh-TW/index.html 抽出共用模板與兩個語言檔。
之後改用 src/home.html + src/i18n/<lang>.json，以 scripts/build-pages.mjs 產生各語言頁面。"""
import re, io, json, difflib, sys
from collections import OrderedDict

def read(p): return io.open(p, encoding="utf-8", newline="").read()
EN, ZH = read("index.html"), read("zh-TW/index.html")
BING = '    <meta name="msvalidate.01" content="361F326D4742D91214C58DFAB048875F" />\n'
assert EN.count(BING.replace("\n", "\r\n")) + EN.count(BING) == 1, "Bing meta"
nl = "\r\n" if "\r\n" in EN else "\n"
EN = EN.replace(BING.replace("\n", nl), "<!--@head.extra-->")
ZH = ZH.replace("    <title>", "<!--@head.extra-->    <title>", 1) if False else ZH
# 兩頁在 viewport 之後插入同一個位置的標記
EN = EN.replace("<!--@head.extra-->", "")
tok = re.compile(r'<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?</script>|<style\b[^>]*>[\s\S]*?</style>|<[^>]+>|[^<]+')
def kind(t):
    if t.startswith('<!--'): return 'comment'
    if t.startswith('<!'): return 'doctype'
    if t.startswith('<script') or t.startswith('<style'): return 'block:' + re.match(r'<\w+[^>]*?(id="[^"]*"|type="[^"]*"|src="[^"]*")?', t).group(0)[:40]
    if t.startswith('<'): return re.match(r'</?[a-zA-Z0-9]+', t).group(0)
    return 'text' if t.strip() else 'ws'
A, B = tok.findall(EN), tok.findall(ZH)
assert "".join(A) == EN and "".join(B) == ZH
ka, kb = [kind(t) for t in A], [kind(t) for t in B]
sm = difflib.SequenceMatcher(None, ka, kb, autojunk=False)
attr_re = re.compile(r'(\s+)([\w:.-]+)(?:=("[^"]*"|\'[^\']*\'))?')
out, en, zh = [], OrderedDict(), OrderedDict()
ctx, counters = "head", {}
def newkey():
    counters[ctx] = counters.get(ctx, 0) + 1
    return f"{ctx}.{counters[ctx]}"
def put(e, z):
    k = newkey(); en[k] = e; zh[k] = z; out.append("{{" + k + "}}")
def ctx_from(t):
    global ctx
    m = re.search(r'\sid="([^"]+)"', t)
    if m and not t.startswith("<script"): ctx = m.group(1)
    elif t.startswith("<body"): ctx = "body"
    elif t.startswith("<footer"): ctx = "footer"
for op, i1, i2, j1, j2 in sm.get_opcodes():
    if op != "equal":
        for t in A[i1:i2]: ctx_from(t)
        put("".join(A[i1:i2]), "".join(B[j1:j2])); continue
    for a, b in zip(A[i1:i2], B[j1:j2]):
        ctx_from(a)
        if a == b: out.append(a); continue
        k = kind(a)
        if k in ("text", "ws", "comment", "doctype") or k.startswith("block"):
            put(a, b); continue
        ta, tb = attr_re.findall(a), attr_re.findall(b)
        head_a = re.match(r'<[\w-]+', a).group(0)
        if [x[1] for x in ta] != [x[1] for x in tb] or re.sub(r'(=("[^"]*"|\'[^\']*\'))', '', a) != re.sub(r'(=("[^"]*"|\'[^\']*\'))', '', b):
            put(a, b); continue
        # 逐一替換值不同的屬性
        res, last = [], 0
        try:
            for (ma, xb) in zip(attr_re.finditer(a), tb):
                va, vb = ma.group(3), xb[2] or None
                if va == vb: continue
                if va is None or vb is None:
                    raise ValueError("boolean attr differs")
                ia, ib = va[1:-1], vb[1:-1]
                if ib == "../" + ia or (ia == "" and ib == "../") or (ia.startswith("assets/") and ib == "../" + ia):
                    rep = va[0] + "{{@root}}" + ia + va[0]
                else:
                    kk = newkey(); en[kk] = ia; zh[kk] = ib
                    rep = va[0] + "{{" + kk + "}}" + va[0]
                res.append(a[last:ma.start(3)]); res.append(rep); last = ma.end(3)
        except ValueError:
            put(a, b); continue
        res.append(a[last:])
        out.append("".join(res))
tmpl = "".join(out)
anchor = '<meta name="pyloxa:waitlist"'
i = tmpl.index(chr(10), tmpl.index(anchor)) + 1
tmpl = tmpl[:i] + "{{head.extra}}" + tmpl[i:]
en["head.extra"] = BING.replace(chr(10), nl); zh["head.extra"] = ""
io.open("src/home.html", "w", encoding="utf-8", newline="").write(tmpl)
json.dump(en, io.open("src/i18n/en.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
json.dump(zh, io.open("src/i18n/zh-TW.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("keys", len(en), "template bytes", len(tmpl))
