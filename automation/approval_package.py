"""Write-once REVIEW package and human report rendering; no network clients."""
from __future__ import annotations

import io
from pathlib import Path
import zipfile

from kfarmai_review_approval import (
    REPOSITORY, REGISTRY, canonical, digest, require, safe_name, artifact_identity, verify_package,
)


def prepare_package(*, article, review_reason, source_check, html_bytes, hero_bytes,
                    svg_bytes, date, run_id, head_sha, revision=1,
                    generated_at=None, package_kind="REVIEW"):
    require(article.get("risk") == "REVIEW", "BLOCKED_REVIEW")
    require(source_check.get("status") == "PASS", "BLOCKED_SOURCE_CHECK")
    article_bytes = canonical(article)
    approval_id = f"review-{run_id}-r{revision}-{digest(article_bytes)[:12]}"
    slug = article["slug"]
    intent = {
        "approval_id": approval_id, "revision": revision, "source_run_id": run_id,
        "slug": slug, "title": article["title"], "category": article["category"], "date": date,
        "url": f"https://kfarmai.com/kb/{slug}.html",
        "source_urls": [s["url"] for s in article["sources"]],
        "content_sha256": digest(article_bytes),
        "html": f"kb/{slug}.html", "hero": f"static/kb/{slug}-hero.webp",
        "infographic": f"static/kb/{slug}-infographic.svg",
    }
    review = {
        "approval_id": approval_id, "title": article["title"], "risk": "REVIEW",
        "reason": review_reason, "summary": article["summary"],
        "fact_check": "공식 URL·출처 연결 확인. 사실·안전성 최종 검토는 사람에게 요청.",
        "risks": review_reason, "cautions": article["safety_note"],
        "image_status": "최종 검수본에 포함; 승인 후 재생성 없음",
    }
    files = {
        "review.json": canonical(review), "article.json": article_bytes,
        "source-check.json": canonical(source_check), "publish-intent.json": canonical(intent),
        "publish/" + intent["html"]: html_bytes,
        "publish/" + intent["hero"]: hero_bytes,
        "publish/" + intent["infographic"]: svg_bytes,
    }
    require(package_kind in {"REVIEW", "TEST_CANARY"}, "BLOCKED_PACKAGE_KIND")
    generated_at = generated_at or f"{date}T00:00:00Z"
    manifest = {
        "schema_version": 2, "repository": REPOSITORY, "approval_id": approval_id,
        "revision": revision, "source_run_id": run_id, "source_head_sha": head_sha,
        "package_kind": package_kind, "publish_intent": package_kind == "REVIEW",
        "generated_at": generated_at,
        "article_sha256": digest(article_bytes), "review_sha256": digest(files["review.json"]),
        "source_check_sha256": digest(files["source-check.json"]),
        "publish_intent_sha256": digest(files["publish-intent.json"]),
        "immutable_files": [
            {"path": name, "size": len(files[name]), "sha256": digest(files[name])}
            for name in sorted(files) if name.startswith("publish/")
        ],
        "expected_publish_files": sorted([intent[k] for k in ("html", "hero", "infographic")] + ["sitemap.xml", REGISTRY]),
    }
    files["manifest.json"] = canonical(manifest)
    manifest_hash = digest(files["manifest.json"])
    files["manifest.sha256"] = (manifest_hash + "\n").encode()
    return {"files": files, "manifest": manifest, "manifest_sha256": manifest_hash,
            "intent": intent, "review": review, "article": article}


def archive_bytes(package):
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, body in sorted(package["files"].items()):
            info = zipfile.ZipInfo(safe_name(name), (2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, body)
    return out.getvalue()


def write_package(directory, package):
    directory = Path(directory)
    require(not directory.exists(), "BLOCKED_IMMUTABLE_PACKAGE_EXISTS")
    directory.mkdir(parents=True, exist_ok=False)
    for name, data in package["files"].items():
        path = directory / safe_name(name)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as target:
            target.write(data)
        require(path.read_bytes() == data, "BLOCKED_HASH_MISMATCH")


def issue_metadata(package, artifact, uploaded_raw=None):
    manifest = package["manifest"]
    meta = {
        "repository": REPOSITORY, "approval_id": manifest["approval_id"],
        "manifest_sha256": package["manifest_sha256"], "run_id": manifest["source_run_id"],
        "artifact_id": artifact["id"], "artifact_name": artifact["name"],
        "artifact_digest": artifact["digest"], "state": "REVIEW",
    }
    artifact_identity(meta, artifact)
    # GitHub hashes its ZIP, whose timestamps/compression need not match ours.
    raw = archive_bytes(package) if uploaded_raw is None else uploaded_raw
    if uploaded_raw is not None:
        from kfarmai_review_approval import read_archive
        require(read_archive(raw) == package["files"], "BLOCKED_UPLOADED_PACKAGE_CHANGED")
    verify_package(raw, meta, artifact)
    return meta


def render_issue(package, artifact, uploaded_raw=None):
    meta = issue_metadata(package, artifact, uploaded_raw)
    article, review, intent = package["article"], package["review"], package["intent"]
    generation_mode = article.get("generation_mode", "AI_ASSISTED")
    information_label = ("KFarmAI 로컬 작성 참고정보" if generation_mode == "LOCAL_EDITORIAL_NO_AI"
                         else "AI 생성 참고정보")
    body = "\n".join([
        "[검수 필요]", f"제목: {article['title']}", f"게시 예정 URL: {intent['url']}",
        f"핵심 내용: {review['summary']}", f"REVIEW 사유: {review['reason']}",
        f"사실검증: {review['fact_check']}",
        "공식 출처: " + ", ".join(intent["source_urls"]),
        f"정보 구분: 본문·요약은 {information_label}이며, 위 공공자료 출처와 구분하여 검수합니다.",
        f"위험요소: {review['risks']}", f"주의사항: {review['cautions']}",
        f"위험도: {review['risk']}",
        f"생성 시각: {package['manifest'].get('generated_at', '기록 없음')}",
        f"Package 구분: {package['manifest'].get('package_kind', 'LEGACY_UNVERIFIED')}",
        f"이미지 상태: {review['image_status']}",
        "게시 예정 파일: " + ", ".join(package["manifest"]["expected_publish_files"]),
        f"Approval ID: {meta['approval_id']}", f"Manifest SHA: {meta['manifest_sha256']}",
        "Artifact identity: " + canonical({k: meta[k] for k in ("run_id", "artifact_id", "artifact_name", "artifact_digest")}).decode(),
        f"만료 예정: {artifact['expires_at']}", "",
        "판단해주세요:", "승인 / 수정 / 보류", "",
        "<!-- kfarmai-review", canonical(meta).decode(), "-->",
    ])
    return {"title": "[KFarmAI Daily][REVIEW] " + article["title"], "body": body, "metadata": meta}


def daily_check(outcome=None):
    """Read only an existing outcome/Issue payload; never generate an approval."""
    if not outcome:
        return "자동게시 실행 확인 필요."
    status = outcome.get("status")
    if status == "REVIEW":
        review = outcome["review"]
        return "\n".join([
            "[검수 필요]", f"제목: {outcome['title']}", f"핵심 내용: {review['summary']}",
            f"REVIEW 사유: {review['reason']}", f"사실검증: {review['fact_check']}",
            "위험도: REVIEW — 사람 검토 필요", f"게시 예정 URL: {outcome['url']}",
            "", "판단해주세요:", "승인 / 수정 / 보류",
        ])
    # A status label alone is not audit evidence. Conflicting receipts fail closed.
    audit = outcome.get("audit")
    evidence = [outcome[key] for key in ("audit_status",) if key in outcome]
    if "audit" in outcome:
        evidence.append(audit.get("status") if isinstance(audit, dict) else None)
    completed = (status in {"AUDIT_PASS", "SUCCESS"}
                 and outcome.get("production_verified") is True
                 and bool(evidence) and all(value == "PASS" for value in evidence))
    if completed and not outcome.get("synthetic"):
        return f"[게시 완료]\n제목: {outcome['title']}\nURL: {outcome['url']}\nProduction 검증: PASS"
    if completed and outcome.get("synthetic"):
        return "[모의 게시 검증 완료]\n실제 게시하지 않았습니다."
    if status in {"LOW_READY", "PUBLISHED_PENDING_VERIFY", "PUBLISHED"}:
        return "게시 완료 검증을 기다리고 있습니다."
    if status == "REVIEW_REQUIRED":
        return "게시 후 재검수가 필요합니다. 자동 수정·취소하지 않았습니다.\n원인: " + str(outcome.get("reason", "감사 결과 확인 필요"))
    return "게시하지 않았습니다.\n원인: " + str(outcome.get("reason", status or "실행 상태 확인 필요"))
