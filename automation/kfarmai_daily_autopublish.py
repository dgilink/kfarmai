#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import argparse, base64, datetime as dt, html, json, os, re, urllib.error, urllib.parse, urllib.request
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

def render_svg(a,path):
    items=a["infographic_items"][:5]
    height=260+len(items)*105+90
    rows=[]
    for i,t in enumerate(items,1):
        y=220+(i-1)*105
        rows += [
            f'<rect x="60" y="{y}" width="1080" height="84" rx="16" fill="#fff" stroke="#d8e4d4"/>',
            f'<circle cx="108" cy="{y+42}" r="25" fill="#2e7d4f"/>',
            f'<text x="108" y="{y+51}" text-anchor="middle" font-size="25" font-family="Arial,sans-serif" fill="#fff">{i}</text>',
            f'<text x="155" y="{y+51}" font-size="28" font-weight="700" font-family="Arial,Noto Sans KR,sans-serif" fill="#22302a">{xesc(t)}</text>'
        ]
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="{height}" viewBox="0 0 1200 {height}">'
        f'<rect width="1200" height="{height}" fill="#f4f8f2"/>'
        f'<text x="60" y="85" font-size="42" font-weight="700" font-family="Arial,Noto Sans KR,sans-serif" fill="#173c2a">{xesc(a["infographic_title"])}</text>'
        f'<text x="60" y="128" font-size="21" font-family="Arial,Noto Sans KR,sans-serif" fill="#617066">KFarmAI 현장 체크</text>'
        + "".join(rows) +
        f'<text x="60" y="{height-35}" font-size="17" font-family="Arial,Noto Sans KR,sans-serif" fill="#6b746f">AI 정보는 참고용입니다. 최신 공식자료와 현장 상태를 함께 확인하세요.</text></svg>'
    )
    path.parent.mkdir(parents=True,exist_ok=True); path.write_text(svg,encoding="utf-8")

def render_html(a,date,hero,info,site):
    url=f"{site}/kb/{a['slug']}.html"; hero_url=f"{site}/{hero}"
    ld={"@context":"https://schema.org","@type":"Article","headline":a["title"],"description":a["meta_description"],"author":{"@type":"Organization","name":"kFarmAI"},"publisher":{"@type":"Organization","name":"kFarmAI"},"datePublished":date,"dateModified":date,"mainEntityOfPage":url,"image":hero_url,"citation":[s["url"] for s in a["sources"]]}
    sections="".join("<h2>"+html.escape(s["heading"])+"</h2><p>"+html.escape(s["body"])+"</p>" for s in a["sections"])
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
      '<figure><img style="width:100%;height:auto;border-radius:16px" src="/'+hero+'" alt="'+html.escape(a["title"],quote=True)+' 대표 이미지"><figcaption>AI로 생성한 참고 이미지입니다. 실제 재배환경과 다를 수 있습니다.</figcaption></figure>',
      '<p>'+html.escape(a["summary"])+'</p>'+sections,
      '<figure><img style="width:100%;height:auto" src="/'+info+'" alt="'+html.escape(a["infographic_title"],quote=True)+'"><figcaption>'+html.escape(a["infographic_title"])+'</figcaption></figure>',
      '<h2>kFarmAI 연결</h2><p>'+html.escape(a["kfarmai_connection"])+'</p><p>'+html.escape(a["safety_note"])+'</p>',
      '<h2>공식 참고자료</h2><ul>'+sources+'</ul><p>공식자료 확인일: '+date+'. 공공자료와 kFarmAI 정리 내용을 구분해 작성했습니다.</p>',
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
    from synthetic_e2e import run_e2e, FixtureProvider, URLS
    if args.mode == "dry_run":
        result = run_e2e(root, out)
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result["status"] == "PASS" else 2
    from autopublish_pipeline import generate
    result = generate(root, out, FixtureProvider(review=True), known_sources=URLS, force_review=True)
    return 0 if result["outcome"]["status"] == "REVIEW" else 2

if __name__=="__main__":
    raise SystemExit(main())
