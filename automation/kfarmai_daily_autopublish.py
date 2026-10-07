\
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import argparse, base64, datetime as dt, html, json, os, re, urllib.error, urllib.parse, urllib.request
from pathlib import Path
from xml.sax.saxutils import escape as xesc

KST = dt.timezone(dt.timedelta(hours=9))
API = "https://api.openai.com/v1"

def loadj(path, default=None):
    p=Path(path)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default

def savej(path,obj):
    p=Path(path); p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding="utf-8")

def api(key, endpoint, payload, timeout=180):
    req=urllib.request.Request(API+endpoint,data=json.dumps(payload,ensure_ascii=False).encode("utf-8"),
        headers={"Authorization":f"Bearer {key}","Content-Type":"application/json"},method="POST")
    try:
        with urllib.request.urlopen(req,timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"OpenAI HTTP {e.code}: {e.read().decode('utf-8',errors='replace')[:1200]}") from e

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
    ap=argparse.ArgumentParser(); ap.add_argument("--root",default="."); ap.add_argument("--mode",required=True,choices=["self_test","dry_run","review_only","publish"]); ap.add_argument("--output",default="automation/run-output")
    args=ap.parse_args(); root=Path(args.root).resolve(); out=root/args.output; out.mkdir(parents=True,exist_ok=True)
    cfg=loadj(root/"automation/config.json"); reg=loadj(root/"automation/daily_registry.json",{"items":[]}); seed=loadj(root/"automation/topic_seed.json",{"do_not_repeat":[]}); today=dt.datetime.now(KST).date().isoformat()
    if args.mode in ("self_test","dry_run"): selftest(root,out); return 0
    if any(x.get("date")==today for x in reg.get("items",[])):
        x=next(x for x in reg["items"] if x.get("date")==today); savej(out/"outcome.json",{"status":"ALREADY_PUBLISHED","date":today,"title":x.get("title"),"slug":x.get("slug"),"url":x.get("url"),"reason":"today already published","estimated_cost_usd":0}); return 0
    key=os.getenv("OPENAI_API_KEY","").strip()
    if not key: savej(out/"outcome.json",{"status":"FAIL","date":today,"reason":"OPENAI_API_KEY missing","safe_summary":"no publish"}); return 0

    recent=existing_titles(root,reg,seed)
    prompt=("오늘 날짜 "+today+" KST. kFarmAI 블로그 농업 콘텐츠 1편을 작성하라. 최신 공식자료 확인을 위해 web_search를 사용하라. "
            "계절성·검색성·문제해결가치를 우선하고 기존 주제와 중복하지 마라. 식물병, 농약/방제/진단, 시세, 재해, 지원사업/정책/공고는 risk=REVIEW. "
            "일반 재배기본기/농자재 일반관리/스마트팜/아쿠아팜 일반관리만 LOW 가능. 근거 부족 또는 상충이면 BLOCK. 특정 농약 처방/제품 판매 유도 금지. "
            "본문 800~1500자 수준. 최근 주제:\\n" + "\\n".join("- "+x for x in recent[-80:]))
    payload={"model":os.getenv("KFARMAI_TEXT_MODEL",cfg["text_model"]),"reasoning":{"effort":"none"},"tools":[{"type":"web_search","search_context_size":"low","filters":{"allowed_domains":cfg["official_domains"]}}],"tool_choice":"required","input":prompt,"text":{"format":{"type":"json_schema","name":"kfarmai_article","strict":True,"schema":SCHEMA}}}
    resp=api(key,"/responses",payload); a=json.loads(out_text(resp)); a["slug"]=slugify(a["slug"])
    errors=[]
    if len(a["sources"])<2: errors.append("insufficient_sources")
    if any(not official(s["url"],cfg["official_domains"]) for s in a["sources"]): errors.append("non_official_source")
    if a["title"] in recent: errors.append("duplicate_title")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{4,80}",a["slug"]): errors.append("invalid_slug")
    risk,reason=risk_gate(a,cfg)
    if errors:
        savej(out/"draft.json",a); savej(out/"outcome.json",{"status":"BLOCK","date":today,"title":a["title"],"reason":";".join(errors),"safe_summary":"prepublish QA failed","estimated_cost_usd":0.03}); return 0
    if args.mode=="review_only" or risk!="LOW":
        savej(out/"draft.json",a); savej(out/"outcome.json",{"status":"REVIEW","date":today,"title":a["title"],"slug":a["slug"],"reason":reason or "review_only","safe_summary":"user approval required; nothing published","estimated_cost_usd":0.03}); return 0

    slug=a["slug"]; hero=f"static/kb/{slug}-hero.webp"; info=f"static/kb/{slug}-infographic.svg"; page=f"kb/{slug}.html"
    ip={"model":os.getenv("KFARMAI_IMAGE_MODEL",cfg["image_model"]),"prompt":f"KFarmAI 한국 농업정보 블로그 대표 실사사진. 기사 제목: {a['title']}. {a['hero_image_brief']}. 한국 농업현장, 자연광, 스마트폰 현장사진 느낌, 글자/로고/제품광고/확정진단 장면 금지.","n":1,"size":"1536x1024","quality":"low","output_format":"webp","output_compression":82}
    ir=api(key,"/images/generations",ip); hp=root/hero; hp.parent.mkdir(parents=True,exist_ok=True); hp.write_bytes(base64.b64decode(ir["data"][0]["b64_json"]))
    render_svg(a,root/info); (root/page).parent.mkdir(parents=True,exist_ok=True); (root/page).write_text(render_html(a,today,hero,info,cfg["site_url"]),encoding="utf-8")
    url=f"{cfg['site_url']}/kb/{slug}.html"; update_sitemap(root,url,today)
    reg.setdefault("items",[]).append({"date":today,"title":a["title"],"slug":slug,"url":url,"category":a["category"]}); savej(root/"automation/daily_registry.json",reg)
    files=[page,hero,info,"sitemap.xml","automation/daily_registry.json"]; (out/"files_to_commit.txt").write_text("\\n".join(files)+"\\n",encoding="utf-8"); savej(out/"article.json",a)
    est=0.08
    if est>float(os.getenv("KFARMAI_DAILY_BUDGET_USD",cfg.get("daily_budget_usd",0.15))):
        savej(out/"outcome.json",{"status":"BLOCK","date":today,"title":a["title"],"reason":"daily budget guard","safe_summary":"nothing published","estimated_cost_usd":est}); return 0
    savej(out/"outcome.json",{"status":"PUBLISH_READY","date":today,"title":a["title"],"slug":slug,"url":url,"reason":"LOW risk + QA passed","estimated_cost_usd":est}); return 0

if __name__=="__main__":
    raise SystemExit(main())
