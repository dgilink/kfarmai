#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import argparse, base64, datetime as dt, hashlib, html, json, os, re, urllib.error, urllib.parse, urllib.request
from pathlib import Path
from xml.sax.saxutils import escape as xesc

from kfarmai_post_publish_audit import build_registry_record

KST = dt.timezone(dt.timedelta(hours=9))
API = "https://api.openai.com/v1"

def loadj(path, default=None):
    p=Path(path)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default

def savej(path,obj):
    p=Path(path); p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding="utf-8")

def api(key, endpoint, payload, timeout=180):
    raise RuntimeError("CANDIDATE_PAID_API_DISABLED")

def out_text(resp):
    chunks=[]
    for item in resp.get("output",[]):
        if item.get("type")=="message":
            for part in item.get("content",[]):
                if part.get("type")=="output_text":
                    chunks.append(part.get("text",""))
    return "\n".join(chunks).strip()

def official(url, domains):
    host=(urllib.parse.urlparse(url).hostname or "").lower()
    return any(host==d or host.endswith("."+d) for d in domains)

def slugify(s):
    s=re.sub(r"[^a-z0-9-]+","-",s.lower())
    return re.sub(r"-+","-",s).strip("-")[:80]

SCHEMA={
 "type":"object","additionalProperties":False,
 "required":["title","category","slug","meta_description","summary","sections","keywords","tags","kfarmai_connection","sources","hero_image_brief","infographic_title","infographic_items","risk","risk_reason","safety_note"],
 "properties":{
  "title":{"type":"string"},
  "category":{"type":"string","enum":["식물병","재배노하우","농자재","스마트팜","아쿠아팜"]},
  "slug":{"type":"string"},
  "meta_description":{"type":"string"},
  "summary":{"type":"string"},
  "sections":{"type":"array","minItems":4,"maxItems":7,"items":{"type":"object","additionalProperties":False,"required":["heading","body"],"properties":{"heading":{"type":"string"},"body":{"type":"string"}}}},
  "keywords":{"type":"array","minItems":5,"maxItems":12,"items":{"type":"string"}},
  "tags":{"type":"array","minItems":4,"maxItems":10,"items":{"type":"string"}},
  "kfarmai_connection":{"type":"string"},
  "sources":{"type":"array","minItems":2,"maxItems":6,"items":{"type":"object","additionalProperties":False,"required":["title","url","claim"],"properties":{"title":{"type":"string"},"url":{"type":"string"},"claim":{"type":"string"}}}},
  "hero_image_brief":{"type":"string"},
  "infographic_title":{"type":"string"},
  "infographic_items":{"type":"array","minItems":3,"maxItems":5,"items":{"type":"string"}},
  "risk":{"type":"string","enum":["LOW","REVIEW","BLOCK"]},
  "risk_reason":{"type":"string"},
  "safety_note":{"type":"string"}
 }}

def existing_titles(root,reg,seed):
    out=list(seed.get("do_not_repeat",[]))+[x.get("title","") for x in reg.get("items",[])]
    for p in (root/"kb").glob("*.html"):
        try:
            m=re.search(r"<title>(.*?)</title>",p.read_text(encoding="utf-8",errors="ignore"),re.I|re.S)
            if m: out.append(re.sub(r"\s*\|\s*kFarmAI\s*$","",html.unescape(m.group(1)).strip(),flags=re.I))
        except Exception: pass
    return list(dict.fromkeys(x for x in out if x))[-120:]

def risk_gate(a,cfg):
    text=" ".join([a.get("title",""),a.get("summary","")]+[x.get("heading","")+" "+x.get("body","") for x in a.get("sections",[])])
    risk=a.get("risk","REVIEW"); reasons=[]
    if a.get("category") in cfg["review_categories"]:
        risk="REVIEW"; reasons.append("review_category")
    hits=[t for t in cfg["review_terms"] if t in text]
    if hits and risk!="BLOCK":
        risk="REVIEW"; reasons.append("review_terms:"+",".join(hits[:8]))
    if a.get("category") not in cfg["auto_publish_categories"] and risk=="LOW":
        risk="REVIEW"; reasons.append("not_auto_category")
    return risk, "; ".join(reasons) or a.get("risk_reason","")

INFOGRAPHIC_PALETTES = (
    {"canvas": "#fff8f2", "accent": "#d94835", "accent_soft": "#f3b562",
     "ink": "#241b18", "muted": "#6f554b", "hairline": "#dfc7bc"},
    {"canvas": "#f3fbfa", "accent": "#007f7b", "accent_soft": "#e3a008",
     "ink": "#122524", "muted": "#466765", "hairline": "#b9d8d5"},
    {"canvas": "#faf6ff", "accent": "#6d3bb5", "accent_soft": "#21a0a0",
     "ink": "#251b32", "muted": "#665575", "hairline": "#d8cae7"},
    {"canvas": "#f7f9ff", "accent": "#2251a3", "accent_soft": "#e36b3d",
     "ink": "#15213a", "muted": "#52627d", "hairline": "#cbd5e7"},
)
# Backwards-compatible union used by revision tooling that validates SVG colors.
INFOGRAPHIC_PALETTE = {
    f"{name}_{index}": value
    for index, palette in enumerate(INFOGRAPHIC_PALETTES)
    for name, value in palette.items()
}


def infographic_palette(article):
    """Choose a deterministic topic palette instead of a fixed brand template."""
    identity = "|".join(str(article.get(key, "")) for key in
                        ("category", "infographic_title", "title"))
    index = hashlib.sha256(identity.encode("utf-8")).digest()[0] % len(INFOGRAPHIC_PALETTES)
    return INFOGRAPHIC_PALETTES[index]


def render_svg(a,path):
    """Render a mobile-readable 16:9 editorial infographic without card chrome."""
    items=a["infographic_items"][:5]
    if len(items) < 3:
        raise ValueError("INFOGRAPHIC_ITEM_COUNT")

    def lines(value, width, maximum=2):
        value=" ".join(value.split())
        if not value:
            raise ValueError("INFOGRAPHIC_TEXT_OVERFLOW")
        words=value.split(" ")
        output=[]
        current=""
        for word in words:
            if len(word)>width:
                if current:
                    output.append(current)
                    current=""
                output.extend(word[offset:offset+width] for offset in range(0,len(word),width))
                continue
            candidate=(current+" "+word).strip()
            if current and len(candidate)>width:
                output.append(current)
                current=word
            else:
                current=candidate
        if current:
            output.append(current)
        if len(output)>maximum or any(len(line)>width for line in output):
            raise ValueError("INFOGRAPHIC_TEXT_OVERFLOW")
        return output

    palette=infographic_palette(a)
    title_lines=lines(a["infographic_title"],23)
    title_top=116
    title_step=66
    grid_top=280 if len(title_lines)==2 else 220
    columns=2
    rows_count=(len(items)+columns-1)//columns
    row_height=(625-grid_top)//rows_count
    blocks=[]
    for index,value in enumerate(items,1):
        column=(index-1)%columns
        row=(index-1)//columns
        x=54+column*558
        y=grid_top+row*row_height
        body=lines(value,25)
        number_color=palette["accent"] if index%2 else palette["accent_soft"]
        blocks.extend([
            f'<text x="{x}" y="{y+48}" font-size="46" font-weight="800" '
            f'font-family="Noto Sans KR,sans-serif" fill="{number_color}">{index:02d}</text>',
            *[f'<text x="{x+78}" y="{y+34+line_index*42}" font-size="34" font-weight="700" '
              f'font-family="Noto Sans KR,sans-serif" fill="{palette["ink"]}">{xesc(line)}</text>'
              for line_index,line in enumerate(body)],
            f'<line x1="{x}" y1="{y+row_height-16}" x2="{x+510}" y2="{y+row_height-16}" '
            f'stroke="{palette["hairline"]}" stroke-width="2"/>'
        ])
    svg=(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">'
        f'<rect width="1200" height="675" fill="{palette["canvas"]}"/>'
        f'<text x="54" y="47" font-size="26" font-weight="700" '
        f'font-family="Noto Sans KR,sans-serif" fill="{palette["accent"]}">KFarmAI · 현장 확인 포인트</text>'
        +"".join(f'<text x="54" y="{title_top+line_index*title_step}" font-size="60" font-weight="800" '
                  f'font-family="Noto Sans KR,sans-serif" fill="{palette["ink"]}">{xesc(line)}</text>'
                  for line_index,line in enumerate(title_lines))
        +f'<line x1="54" y1="{grid_top-28}" x2="1146" y2="{grid_top-28}" stroke="{palette["accent"]}" stroke-width="5"/>'
        +"".join(blocks)+'</svg>'
    )
    path.parent.mkdir(parents=True,exist_ok=True); path.write_text(svg,encoding="utf-8")

def render_html(a,date,hero,info,site,*,hero_caption=None):
    url=f"{site}/kb/{a['slug']}.html"; hero_url=f"{site}/{hero}"
    ld={"@context":"https://schema.org","@type":"Article","headline":a["title"],"description":a["meta_description"],"author":{"@type":"Organization","name":"kFarmAI"},"publisher":{"@type":"Organization","name":"kFarmAI"},"datePublished":date,"dateModified":date,"mainEntityOfPage":url,"image":hero_url,"citation":[s["url"] for s in a["sources"]]}
    sections="".join("<h2>"+html.escape(s["heading"])+"</h2><p>"+html.escape(s["body"])+"</p>" for s in a["sections"])
    public_facts="".join("<li>"+html.escape(value)+"</li>" for value in a.get("public_facts", []))
    sources="".join('<li><a href="'+html.escape(s["url"],quote=True)+'" target="_blank" rel="noopener noreferrer">'+html.escape(s["title"])+'</a><br>'+html.escape(s["claim"])+'</li>' for s in a["sources"])
    parts=[
      '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
      '<link rel="icon" href="/static/kfarmai-logo-horizontal.png">',
      '<title>'+html.escape(a["title"])+' | kFarmAI</title>',
      '<meta name="description" content="'+html.escape(a["meta_description"],quote=True)+'">',
      '<meta name="robots" content="index, follow">',
      '<link rel="canonical" href="'+url+'">',
      '<meta property="og:type" content="article"><meta property="og:title" content="'+html.escape(a["title"],quote=True)+' | kFarmAI">',
      '<meta property="og:description" content="'+html.escape(a["meta_description"],quote=True)+'"><meta property="og:url" content="'+url+'">',
      '<meta property="og:image" content="'+hero_url+'"><link rel="stylesheet" href="/static/css/knowledge-v3.css">',
      '<script type="application/ld+json">'+json.dumps(ld,ensure_ascii=False,separators=(",",":"))+'</script></head><body>',
      '<header class="site-header"><a href="/index.html">kFarmAI</a></header><main>',
      '<article class="knowledge-article"><h1>'+html.escape(a["title"])+'</h1><p>게시일: <time datetime="'+date+'">'+date+'</time></p>',
      '<figure><img style="width:100%;height:auto;border-radius:16px" src="/'+hero+'" alt="'+html.escape(a["title"],quote=True)+' 대표 이미지"><figcaption>'+html.escape(hero_caption or 'AI로 생성한 참고 이미지입니다. 실제 재배환경과 다를 수 있습니다.')+'</figcaption></figure>',
      '<p>'+html.escape(a["summary"])+'</p>',
      ('<section aria-labelledby="official-facts"><h2 id="official-facts">공식자료에서 확인한 내용</h2><ul>'+public_facts+'</ul></section>' if public_facts else ''),
      '<section aria-labelledby="reference-summary"><h2 id="reference-summary">참고 정리</h2>'+sections+'</section>',
      '<figure><img style="width:100%;height:auto" src="/'+info+'" alt="'+html.escape(a["infographic_title"],quote=True)+'"><figcaption>'+html.escape(a["infographic_title"])+'</figcaption></figure>',
      '<h2>참고 안내</h2><p>'+html.escape(a["kfarmai_connection"])+'</p><p>'+html.escape(a["safety_note"])+'</p>',
      '<h2>공식 참고자료</h2><ul>'+sources+'</ul><p>최근 확인: '+date+'. 공공자료와 kFarmAI 정리 내용을 구분해 작성했습니다.</p>',
      '<nav aria-label="다음 확인 경로"><h2>다음 확인 경로</h2><ul><li><a href="/kb/index.html">농업정보 더 보기</a></li><li><a href="/index.html?view=questions">관련 질문 보기</a></li><li><a href="/diagnosis.html">AI 참고 진단으로 확인하기</a></li></ul></nav>',
      '</article></main><footer class="site-footer"><a href="/oauth/privacy/">개인정보처리방침</a></footer></body></html>'
    ]
    return "".join(parts)

def update_sitemap(root,url,date):
    p=root/"sitemap.xml"; t=p.read_text(encoding="utf-8")
    if url in t: return
    if "</urlset>" not in t: raise RuntimeError("sitemap end tag missing")
    entry=f'  <url>\\n    <loc>{url}</loc>\\n    <lastmod>{date}</lastmod>\\n    <changefreq>monthly</changefreq>\\n    <priority>0.7</priority>\\n  </url>\\n'
    p.write_text(t.replace("</urlset>",entry+"</urlset>"),encoding="utf-8")

def selftest(root,out):
    a={"title":"스마트팜 관수 전 유량계 점검","category":"스마트팜","slug":"smartfarm-flowmeter-check","meta_description":"스마트팜 관수 전 유량계와 배관 상태를 점검하는 기본 항목을 정리했습니다.","summary":"관수 기록을 믿기 전에 장비 상태를 함께 확인합니다.","sections":[{"heading":"외관","body":"누수 여부를 확인합니다."},{"heading":"연결","body":"연결부를 확인합니다."},{"heading":"기록","body":"기존 기록과 비교합니다."},{"heading":"재확인","body":"이상값은 다시 확인합니다."}],"keywords":["스마트팜","관수","유량계","배관","센서"],"tags":["스마트팜","관수","센서","KFarmAI"],"kfarmai_connection":"관련 정보는 kfarmai.com에서 확인합니다.","sources":[{"title":"농촌진흥청","url":"https://www.rda.go.kr/","claim":"공식자료"},{"title":"농사로","url":"https://www.nongsaro.go.kr/","claim":"공식자료"}],"hero_image_brief":"한국 온실 관수 배관과 유량계","infographic_title":"관수 전 점검 4가지","infographic_items":["누수 확인","연결부 확인","기록 비교","재확인"],"risk":"LOW","risk_reason":"일반 설비 점검","safety_note":"AI 정보는 참고용입니다."}
    render_svg(a,out/"selftest.svg")
    h=render_html(a,dt.datetime.now(KST).date().isoformat(),"static/kb/x.webp","static/kb/x.svg","https://kfarmai.com")
    assert 'name="robots" content="index, follow"' in h and "application/ld+json" in h
    savej(out/"outcome.json",{"status":"DRY_RUN_PASS","reason":"offline self-test passed","estimated_cost_usd":0})

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--mode", required=True, choices=["self_test", "dry_run", "review_only", "publish"])
    ap.add_argument("--output", default="automation/run-output")
    args = ap.parse_args()
    root = Path(args.root).resolve()
    out = root / args.output
    out.mkdir(parents=True, exist_ok=True)
    if args.mode == "publish":
        savej(out / "outcome.json", {"status": "BLOCK", "reason": "CANDIDATE_PUBLICATION_DISABLED", "published": False})
        return 2
    if args.mode == "self_test":
        selftest(root, out)
        return 0
    if args.mode == "dry_run":
        selftest(root, out)
        return 0
    # There is no live provider or source-evidence adapter for the legacy
    # workflow. Never substitute synthetic content for a real REVIEW Issue.
    savej(out / "outcome.json", {"status": "BLOCK", "reason": "LIVE_REVIEW_GENERATION_NOT_IMPLEMENTED",
                                  "synthetic": False, "published": False})
    return 2

if __name__=="__main__":
    raise SystemExit(main())
