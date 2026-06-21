#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
kFarmAI 10시간 연속 SEO 초안 생성기
파일명: kfarmai_10h_seo_worker.py

목적:
- 농업/식물 관련 실제 검색 질문을 기반으로 SEO 글 초안을 장시간 생성
- 완전 자동 발행이 아니라 draft JSON/HTML을 생성해 검수 후 발행하는 구조
- 중복 질문 방지, 로그 저장, 실패 재시도, 실행 시간 제한, 안전문구 자동 삽입

실행 예:
python kfarmai_10h_seo_worker.py --hours 10 --interval 90 --max-items 300

권장:
처음에는 30분 테스트:
python kfarmai_10h_seo_worker.py --hours 0.5 --interval 60 --max-items 20
"""

import argparse
import hashlib
import json
import random
import re
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional


KST = timezone(timedelta(hours=9))

OFFICIAL_SOURCES = [
    {
        "name": "농촌진흥청",
        "url": "https://www.rda.go.kr/",
        "type": "official",
    },
    {
        "name": "농사로",
        "url": "https://www.nongsaro.go.kr/",
        "type": "official",
    },
    {
        "name": "농약안전정보시스템",
        "url": "https://psis.rda.go.kr/",
        "type": "official",
    },
    {
        "name": "농림축산식품부",
        "url": "https://www.mafra.go.kr/",
        "type": "official",
    },
    {
        "name": "기업마당",
        "url": "https://www.bizinfo.go.kr/",
        "type": "official",
    },
    {
        "name": "K-Startup",
        "url": "https://www.k-startup.go.kr/",
        "type": "official",
    },
]

WARNING_KEYWORDS = [
    "농약", "약제", "살균제", "살충제", "제초제", "혼용", "희석",
    "병해충", "탄저병", "무름병", "바이러스", "방제", "처방",
]

CATEGORIES = {
    "벼": [
        "벼 모판이 검게 변하는 이유는 무엇인가요?",
        "벼 모판에 곰팡이가 생기는 원인은 무엇인가요?",
        "벼 모판 상토가 딱딱하게 굳는 이유는 무엇인가요?",
        "벼 모판에서 싹이 고르게 나오지 않는 이유는 무엇인가요?",
        "벼 육묘 중 뿌리가 갈색으로 변하는 이유는 무엇인가요?",
        "벼 모판에 물을 너무 많이 주면 어떤 문제가 생기나요?",
        "벼 모판 복토용 상토는 얼마나 덮어야 하나요?",
        "벼 모판에서 냄새가 나는 이유는 무엇인가요?",
        "벼 모판이 누렇게 변하는 이유는 무엇인가요?",
        "벼 육묘 중 키가 너무 웃자라는 이유는 무엇인가요?",
    ],
    "상토": [
        "상토 입상이 딱딱하게 굳는 이유는 무엇인가요?",
        "수도용 상토가 뭉치는 원인은 무엇인가요?",
        "상토에 검은 부분이 보이는 이유는 무엇인가요?",
        "원예용 상토와 수도용 상토의 차이는 무엇인가요?",
        "상토가 물을 잘 흡수하지 못하는 이유는 무엇인가요?",
        "분갈이 후 식물이 시드는 이유는 무엇인가요?",
        "상토에 곰팡이가 생겼을 때 어떻게 해야 하나요?",
        "상토를 오래 보관하면 품질이 떨어지나요?",
        "상토에서 냄새가 나는 이유는 무엇인가요?",
        "상토를 재사용해도 되나요?",
    ],
    "딸기": [
        "딸기 고설재배에서 EC는 어떻게 관리하나요?",
        "딸기 고설 양액 pH는 어느 정도가 적정한가요?",
        "딸기 잎 끝이 타는 이유는 무엇인가요?",
        "딸기 뿌리가 갈색으로 변하는 이유는 무엇인가요?",
        "딸기 고설 배지가 마르지 않을 때 원인은 무엇인가요?",
        "딸기 고설재배에서 배액률은 왜 중요한가요?",
        "딸기 꽃이 떨어지는 이유는 무엇인가요?",
        "딸기 과실이 작아지는 이유는 무엇인가요?",
    ],
    "고추": [
        "고추 잎이 오그라드는 이유는 무엇인가요?",
        "고추 잎이 노랗게 변하는 이유는 무엇인가요?",
        "고추 탄저병은 어떻게 구별하나요?",
        "고추 바이러스 의심 증상은 무엇인가요?",
        "고추 꽃이 떨어지는 이유는 무엇인가요?",
        "고추 열매가 작게 자라는 이유는 무엇인가요?",
        "고추 줄기가 시드는 이유는 무엇인가요?",
        "고추 잎에 반점이 생기는 이유는 무엇인가요?",
    ],
    "농약": [
        "농약 혼용 가능 여부는 어디서 확인하나요?",
        "농약 희석배수는 어떻게 확인하나요?",
        "같은 농약을 반복 사용하면 안 되는 이유는 무엇인가요?",
        "농약 안전사용기준은 왜 중요한가요?",
        "작물별 등록 농약은 어디서 확인하나요?",
        "병해충 사진만 보고 농약을 선택해도 되나요?",
        "농약 살포 후 수확 전까지 며칠을 기다려야 하나요?",
        "농약을 섞어 쓸 때 주의할 점은 무엇인가요?",
    ],
    "보조사업": [
        "상토 보조사업 신청 방법은 어떻게 되나요?",
        "농자재 보조사업 공고는 어디서 확인하나요?",
        "농기계 지원사업은 어디서 확인하나요?",
        "지자체 농업 보조사업은 언제 공고되나요?",
        "청년농 지원사업은 어디서 확인하나요?",
        "농업 보조사업 신청할 때 필요한 서류는 무엇인가요?",
    ],
    "홈가드닝": [
        "화분 흙에 곰팡이가 생기면 어떻게 해야 하나요?",
        "분갈이 후 식물이 축 처지는 이유는 무엇인가요?",
        "화분 물빠짐이 안 좋을 때 어떻게 해야 하나요?",
        "잎이 노랗게 변하는 반려식물 원인은 무엇인가요?",
        "화분 흙에서 벌레가 생기는 이유는 무엇인가요?",
        "실내 식물에 물을 얼마나 자주 줘야 하나요?",
    ],
}


@dataclass
class SeoDraft:
    id: str
    status: str
    category: str
    crop: str
    question: str
    seo_title: str
    slug: str
    meta_description: str
    summary: str
    sections: List[Dict[str, str]]
    faq: List[Dict[str, str]]
    sources: List[Dict[str, str]]
    warning_required: bool
    cta: List[Dict[str, str]]
    created_at: str
    updated_at: str


def now_kst_iso() -> str:
    return datetime.now(KST).isoformat(timespec="seconds")


def slugify_korean_question(question: str) -> str:
    """
    한글 질문을 간단한 영문 slug로 바꾸기 위한 규칙 기반 변환.
    완벽한 번역기는 아니지만 중복 방지와 URL 생성용으로 충분.
    """
    mapping = {
        "벼": "rice",
        "모판": "seedling-tray",
        "검게": "black",
        "곰팡이": "mold",
        "상토": "soil",
        "입상": "granule",
        "딱딱": "hard",
        "굳": "hardening",
        "뭉치": "clumping",
        "딸기": "strawberry",
        "고설": "high-bed",
        "양액": "nutrient-solution",
        "고추": "pepper",
        "잎": "leaf",
        "오그라": "curling",
        "농약": "pesticide",
        "혼용": "mixing",
        "희석": "dilution",
        "보조사업": "subsidy",
        "신청": "apply",
        "화분": "pot",
        "분갈이": "repotting",
        "노랗": "yellowing",
        "시드": "wilting",
        "탄저병": "anthracnose",
        "바이러스": "virus",
        "퇴비": "compost",
        "비료": "fertilizer",
    }

    parts = []
    for key, value in mapping.items():
        if key in question:
            parts.append(value)

    if not parts:
        h = hashlib.md5(question.encode("utf-8")).hexdigest()[:10]
        return f"agri-question-{h}"

    base = "-".join(parts[:5])
    h = hashlib.md5(question.encode("utf-8")).hexdigest()[:6]
    return f"{base}-{h}"


def make_id(question: str) -> str:
    return hashlib.md5(question.encode("utf-8")).hexdigest()[:12]


def detect_warning(question: str) -> bool:
    return any(keyword in question for keyword in WARNING_KEYWORDS)


def pick_sources(category: str, warning_required: bool) -> List[Dict[str, str]]:
    sources = []
    if category in ["벼", "상토", "딸기", "고추", "홈가드닝"]:
        sources.extend([OFFICIAL_SOURCES[0], OFFICIAL_SOURCES[1]])
    if category == "농약" or warning_required:
        sources.append(OFFICIAL_SOURCES[2])
    if category == "보조사업":
        sources.extend([OFFICIAL_SOURCES[3], OFFICIAL_SOURCES[4], OFFICIAL_SOURCES[5]])

    # 중복 제거
    seen = set()
    unique = []
    for s in sources:
        if s["url"] not in seen:
            unique.append(s)
            seen.add(s["url"])
    return unique[:4]


def generate_rule_based_draft(category: str, question: str) -> SeoDraft:
    """
    API 없이도 돌아가는 규칙 기반 초안 생성.
    나중에 OpenAI/Gemini/Claude API를 붙일 때 이 함수만 교체하면 됨.
    """
    slug = slugify_korean_question(question)
    warning_required = detect_warning(question)

    clean_question = question.rstrip("?")
    seo_title = f"{clean_question} 원인과 확인 방법"
    meta_description = f"{clean_question}에 대해 의심할 수 있는 원인, 현장 확인 방법, 주의사항과 공식자료 확인 기준을 정리했습니다."

    summary = (
        f"{clean_question} 문제는 한 가지 원인으로 단정하기 어렵습니다. "
        "재배환경, 수분관리, 온도, 배지 또는 상토 상태, 병해충 가능성, 사용 자재 이력을 함께 확인해야 합니다."
    )

    if category == "보조사업":
        sections = [
            {
                "heading": "1. 먼저 확인할 곳",
                "body": "보조사업은 지자체, 농업기술센터, 농협, 중앙부처 공고에 따라 조건과 기간이 달라질 수 있습니다. 먼저 거주 지역 또는 사업장 소재지 기준 공고를 확인해야 합니다.",
            },
            {
                "heading": "2. 신청 전 확인할 내용",
                "body": "신청 대상, 품목, 지원 비율, 자부담 비율, 신청 기간, 제출서류, 농업경영체 등록 여부를 확인해야 합니다.",
            },
            {
                "heading": "3. 준비할 서류",
                "body": "일반적으로 신청서, 농업경영체 등록 확인서, 견적서, 통장 사본, 신분 확인 서류 등이 요구될 수 있으나 세부 서류는 공고마다 다릅니다.",
            },
            {
                "heading": "4. 주의할 점",
                "body": "공고 기간이 짧은 경우가 많으므로 지자체 홈페이지와 농업기술센터 공지를 정기적으로 확인하는 것이 좋습니다.",
            },
        ]
    elif category == "농약":
        sections = [
            {
                "heading": "1. 먼저 확인할 기준",
                "body": "농약은 작물, 병해충, 사용시기, 희석배수, 안전사용기준이 맞아야 합니다. 같은 증상처럼 보여도 원인이 다를 수 있으므로 등록 정보를 먼저 확인해야 합니다.",
            },
            {
                "heading": "2. 혼용 또는 사용 전 확인할 점",
                "body": "농약 혼용은 약해, 효과 저하, 침전 등이 발생할 수 있어 제품 라벨과 농약안전정보시스템, 전문가 상담을 통해 확인하는 것이 안전합니다.",
            },
            {
                "heading": "3. 현장에서 주의할 점",
                "body": "고온, 강한 햇빛, 작물 생육상태 불량, 과다 희석 또는 과소 희석은 약해 위험을 높일 수 있습니다.",
            },
            {
                "heading": "4. 추천 조치",
                "body": "사진만으로 약제를 단정하지 말고, 적용 작물과 병해충을 확인한 뒤 지역 농업기술센터나 농약사와 상담하는 것이 좋습니다.",
            },
        ]
    else:
        sections = [
            {
                "heading": "1. 먼저 확인할 증상",
                "body": "문제가 전체적으로 나타나는지, 일부 구역에서만 나타나는지, 냄새·변색·뿌리 상태·수분 상태가 어떤지 먼저 확인해야 합니다.",
            },
            {
                "heading": "2. 가능한 원인",
                "body": "과습, 건조, 저온 또는 고온, 배수 불량, 상토·배지 상태, 비료 농도, 병해충 가능성 등 여러 원인이 함께 작용할 수 있습니다.",
            },
            {
                "heading": "3. 현장에서 바로 확인할 점",
                "body": "흙이나 배지의 수분 상태, 뿌리 색, 잎의 변색 방향, 최근 관수·시비·농약 사용 이력, 온도 변화를 함께 기록하는 것이 좋습니다.",
            },
            {
                "heading": "4. 조치 방향",
                "body": "먼저 물관리와 환기, 배수 상태를 점검하고 증상이 계속되면 사진과 재배 이력을 가지고 지역 농업기술센터나 전문가 상담을 받는 것이 안전합니다.",
            },
        ]

    faq = [
        {
            "q": f"{clean_question} 문제는 바로 해결할 수 있나요?",
            "a": "원인에 따라 다릅니다. 수분관리나 환경 문제라면 빠르게 개선될 수 있지만, 병해충이나 뿌리 손상이 있으면 정확한 진단이 필요합니다.",
        },
        {
            "q": "사진만 보고 원인을 확정할 수 있나요?",
            "a": "사진은 중요한 참고자료이지만, 온도·수분·토양 또는 배지 상태·최근 관리 이력을 함께 봐야 정확도가 높아집니다.",
        },
    ]

    if warning_required:
        faq.append({
            "q": "농약이나 약제를 바로 사용해도 되나요?",
            "a": "임의 사용은 권장되지 않습니다. 반드시 등록 농약 여부, 적용 작물, 적용 병해충, 희석배수, 안전사용기준을 확인해야 합니다.",
        })

    cta = [
        {"label": "증상 사진으로 AI 진단하기", "url": "/"},
        {"label": "주변 농약사 찾기", "url": "/agri_map.html"},
    ]

    created_at = now_kst_iso()

    return SeoDraft(
        id=make_id(question),
        status="draft",
        category=category,
        crop=category,
        question=question,
        seo_title=seo_title,
        slug=slug,
        meta_description=meta_description[:155],
        summary=summary,
        sections=sections,
        faq=faq,
        sources=pick_sources(category, warning_required),
        warning_required=warning_required,
        cta=cta,
        created_at=created_at,
        updated_at=created_at,
    )


def make_html(draft: SeoDraft, site_url: str) -> str:
    canonical = f"{site_url.rstrip('/')}/kb/{draft.slug}.html"
    robots_meta = '<meta name="robots" content="noindex, nofollow">' if draft.status != "published" else '<meta name="robots" content="index, follow">'
    source_items = "\n".join(
        f'<li><a href="{s["url"]}" target="_blank" rel="noopener noreferrer">{s["name"]}</a></li>'
        for s in draft.sources
    )
    section_html = "\n".join(
        f"<section><h2>{sec['heading']}</h2><p>{sec['body']}</p></section>"
        for sec in draft.sections
    )
    faq_html = "\n".join(
        f"<h3>{item['q']}</h3><p>{item['a']}</p>"
        for item in draft.faq
    )
    cta_html = "\n".join(
        f'<a class="cta-button" href="{item["url"]}">{item["label"]}</a>'
        for item in draft.cta
    )

    warning_html = ""
    if draft.warning_required:
        warning_html = """
<section class="warning">
  <h2>농약·약제 사용 주의</h2>
  <p>농약 사용은 반드시 등록 농약 여부, 적용 작물, 적용 병해충, 희석배수, 안전사용기준을 확인해야 합니다. 현장 증상만으로 약제를 단정하기 어렵기 때문에 지역 농업기술센터, 농약사, 전문가 상담을 권장합니다.</p>
</section>
"""

    article_jsonld = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": draft.seo_title,
        "description": draft.meta_description,
        "author": {"@type": "Organization", "name": "kFarmAI"},
        "publisher": {"@type": "Organization", "name": "kFarmAI"},
        "datePublished": draft.created_at[:10],
        "dateModified": draft.updated_at[:10],
        "mainEntityOfPage": {"@type": "WebPage", "@id": canonical},
    }

    faq_jsonld = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": item["q"],
                "acceptedAnswer": {"@type": "Answer", "text": item["a"]},
            }
            for item in draft.faq
        ],
    }

    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{draft.seo_title} | kFarmAI</title>
  <meta name="description" content="{draft.meta_description}">
  {robots_meta}
  <link rel="canonical" href="{canonical}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="{draft.seo_title}">
  <meta property="og:description" content="{draft.meta_description}">
  <meta property="og:url" content="{canonical}">
  <script type="application/ld+json">{json.dumps(article_jsonld, ensure_ascii=False)}</script>
  <script type="application/ld+json">{json.dumps(faq_jsonld, ensure_ascii=False)}</script>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; color: #17202a; background: #f7f9f6; line-height: 1.7; }}
    header {{ background: #1f7a4d; color: white; padding: 18px 20px; font-weight: 700; }}
    main {{ max-width: 860px; margin: 0 auto; padding: 22px 16px 60px; }}
    article {{ background: white; border-radius: 18px; padding: 22px; box-shadow: 0 8px 24px rgba(0,0,0,.06); }}
    h1 {{ font-size: 28px; line-height: 1.3; margin: 12px 0 16px; }}
    h2 {{ font-size: 21px; margin-top: 30px; }}
    h3 {{ font-size: 17px; margin-top: 22px; }}
    .breadcrumb {{ font-size: 14px; color: #5f6f65; }}
    .summary, .quick-answer {{ background: #edf8f0; border-left: 5px solid #1f7a4d; padding: 14px; border-radius: 10px; }}
    .warning {{ background: #fff7e6; border-left: 5px solid #e08a00; padding: 14px; border-radius: 10px; }}
    .sources {{ background: #f3f5f4; padding: 14px; border-radius: 10px; }}
    .cta {{ display: flex; gap: 10px; flex-wrap: wrap; margin: 28px 0; }}
    .cta-button {{ display: inline-block; padding: 12px 14px; border-radius: 12px; background: #1f7a4d; color: white; text-decoration: none; font-weight: 700; }}
    a {{ color: #176c43; }}
  </style>
</head>
<body>
  <header>kFarmAI</header>
  <main>
    <article>
      <nav class="breadcrumb">홈 &gt; 농업 지식 &gt; {draft.category}</nav>
      <h1>{draft.seo_title}</h1>
      <p class="summary">{draft.summary}</p>

      <section class="quick-answer">
        <h2>빠른 답변</h2>
        <p>{draft.sections[0]['body']}</p>
      </section>

      {section_html}

      {warning_html}

      <section class="cta">
        {cta_html}
      </section>

      <section class="faq">
        <h2>자주 묻는 질문</h2>
        {faq_html}
      </section>

      <section class="sources">
        <h2>출처 및 참고자료</h2>
        <p>아래 기관 자료를 우선 확인 대상으로 삼았습니다. 세부 작물·지역·시기별 판단은 현장 확인이 필요합니다.</p>
        <ul>
          {source_items}
        </ul>
      </section>
    </article>
  </main>
</body>
</html>
"""


def load_existing_drafts(path: Path) -> List[Dict]:
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def append_log(log_path: Path, message: str) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    line = f"[{now_kst_iso()}] {message}\n"
    with log_path.open("a", encoding="utf-8") as f:
        f.write(line)


def update_sitemap(root: Path, site_url: str, drafts: List[Dict]) -> None:
    sitemap_path = root / "sitemap.xml"
    urls = []
    if sitemap_path.exists():
        existing = sitemap_path.read_text(encoding="utf-8", errors="ignore")
        urls.extend(re.findall(r"<loc>(.*?)</loc>", existing))
    else:
        urls.append(f"{site_url.rstrip('/')}/")

    published = [d for d in drafts if d.get("status") == "published"]
    if published:
        urls.append(f"{site_url.rstrip('/')}/kb/index.html")
    for d in published:
        urls.append(f"{site_url.rstrip('/')}/kb/{d['slug']}.html")

    unique_urls = []
    seen = set()
    for u in urls:
        if u not in seen:
            unique_urls.append(u)
            seen.add(u)

    today = datetime.now(KST).date().isoformat()
    body = ['<?xml version="1.0" encoding="UTF-8"?>']
    body.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    for u in unique_urls:
        priority = "1.0" if u.rstrip("/") == site_url.rstrip("/") else ("0.9" if u.endswith("/kb/index.html") else "0.8")
        body.append("  <url>")
        body.append(f"    <loc>{u}</loc>")
        body.append(f"    <lastmod>{today}</lastmod>")
        body.append("    <changefreq>weekly</changefreq>")
        body.append(f"    <priority>{priority}</priority>")
        body.append("  </url>")
    body.append("</urlset>")
    sitemap_path.write_text("\n".join(body), encoding="utf-8")


def update_robots(root: Path, site_url: str) -> None:
    robots_path = root / "robots.txt"
    sitemap_line = f"Sitemap: {site_url.rstrip('/')}/sitemap.xml"
    if robots_path.exists():
        text = robots_path.read_text(encoding="utf-8")
        if "Sitemap:" not in text:
            text = text.rstrip() + "\n\n" + sitemap_line + "\n"
    else:
        text = "User-agent: *\nAllow: /\n\n" + sitemap_line + "\n"
    robots_path.write_text(text, encoding="utf-8")


def make_kb_index(root: Path, site_url: str, drafts: List[Dict]) -> None:
    kb_dir = root / "kb"
    kb_dir.mkdir(parents=True, exist_ok=True)

    grouped = {}
    for d in drafts:
        if d.get("status") != "published":
            continue
        grouped.setdefault(d["category"], []).append(d)

    blocks = []
    for category, items in sorted(grouped.items()):
        lis = "\n".join(
            f'<li><a href="/kb/{item["slug"]}.html">{item["seo_title"]}</a><p>{item["meta_description"]}</p></li>'
            for item in items
        )
        blocks.append(f"<section><h2>{category}</h2><ul>{lis}</ul></section>")

    html = f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>kFarmAI 농업·식물 문제 해결 Q&A</title>
  <meta name="description" content="농업 현장과 홈가드닝에서 자주 검색하는 질문을 공식자료 기반으로 정리한 kFarmAI 지식글 모음입니다.">
  <link rel="canonical" href="{site_url.rstrip('/')}/kb/index.html">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #f7f9f6; color: #17202a; line-height: 1.7; }}
    header {{ background: #1f7a4d; color: white; padding: 18px 20px; font-weight: 700; }}
    main {{ max-width: 900px; margin: 0 auto; padding: 24px 16px 60px; }}
    section {{ background: white; margin: 16px 0; padding: 18px; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,.06); }}
    a {{ color: #176c43; font-weight: 700; }}
    li {{ margin-bottom: 14px; }}
  </style>
</head>
<body>
  <header>kFarmAI</header>
  <main>
    <h1>kFarmAI 농업·식물 문제 해결 Q&A</h1>
    <p>농업 현장과 홈가드닝에서 자주 검색하는 질문을 공식자료 기반으로 정리했습니다.</p>
    {''.join(blocks)}
  </main>
</body>
</html>
"""
    (kb_dir / "index.html").write_text(html, encoding="utf-8")


def choose_question(existing_ids: set) -> Optional[tuple]:
    candidates = []
    for category, questions in CATEGORIES.items():
        for q in questions:
            if make_id(q) not in existing_ids:
                candidates.append((category, q))
    if not candidates:
        return None
    return random.choice(candidates)


def run_worker(root: Path, site_url: str, hours: float, interval: int, max_items: int) -> None:
    root.mkdir(parents=True, exist_ok=True)
    data_dir = root / "data"
    kb_dir = root / "kb"
    logs_dir = root / "logs"
    drafts_path = data_dir / "seo_drafts.json"
    log_path = logs_dir / "seo_worker.log"

    data_dir.mkdir(parents=True, exist_ok=True)
    kb_dir.mkdir(parents=True, exist_ok=True)
    logs_dir.mkdir(parents=True, exist_ok=True)

    start = datetime.now(KST)
    end = start + timedelta(hours=hours)

    drafts = load_existing_drafts(drafts_path)
    existing_ids = {d["id"] for d in drafts}

    append_log(log_path, f"START hours={hours}, interval={interval}, max_items={max_items}, root={root}")

    generated = 0

    while datetime.now(KST) < end and generated < max_items:
        chosen = choose_question(existing_ids)

        if chosen is None:
            append_log(log_path, "더 이상 생성할 질문 후보가 없습니다. 종료합니다.")
            break

        category, question = chosen

        try:
            draft = generate_rule_based_draft(category, question)
            draft_dict = asdict(draft)

            # JSON draft 저장
            drafts.append(draft_dict)
            existing_ids.add(draft.id)
            save_json(drafts_path, drafts)

            # HTML 생성
            html = make_html(draft, site_url=site_url)
            html_path = kb_dir / f"{draft.slug}.html"
            html_path.write_text(html, encoding="utf-8")

            # 목록/sitemap/robots 갱신
            make_kb_index(root, site_url, drafts)
            update_sitemap(root, site_url, drafts)
            update_robots(root, site_url)

            generated += 1
            append_log(log_path, f"CREATED {generated}/{max_items} category={category} slug={draft.slug} question={question}")

        except Exception as e:
            append_log(log_path, f"ERROR question={question} error={repr(e)}")

        # 너무 빠른 대량 생성 방지
        if datetime.now(KST) < end and generated < max_items:
            time.sleep(max(10, interval))

    append_log(log_path, f"END generated={generated}, total_drafts={len(drafts)}")
    print(f"완료: 신규 {generated}개 생성")
    print(f"초안 JSON: {drafts_path}")
    print(f"HTML 폴더: {kb_dir}")
    print(f"로그: {log_path}")
    print("주의: 생성된 글은 draft 상태입니다. 검수 후 published로 바꾸고 배포하세요.")


def main():
    parser = argparse.ArgumentParser(description="kFarmAI 10시간 연속 SEO 초안 생성기")
    parser.add_argument("--root", default=".", help="프론트엔드 프로젝트 루트 폴더")
    parser.add_argument("--site-url", default="https://kfarmai.com", help="사이트 기본 URL")
    parser.add_argument("--hours", type=float, default=10.0, help="실행 시간. 예: 10 또는 0.5")
    parser.add_argument("--interval", type=int, default=90, help="글 생성 간격 초 단위. 너무 짧게 하지 말 것")
    parser.add_argument("--max-items", type=int, default=300, help="최대 생성 글 수")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    run_worker(
        root=root,
        site_url=args.site_url,
        hours=args.hours,
        interval=args.interval,
        max_items=args.max_items,
    )


if __name__ == "__main__":
    main()
