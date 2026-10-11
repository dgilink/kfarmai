"""Integrated AutoPublish orchestration. This Candidate accepts fixture transports only."""
from __future__ import annotations

import copy
import datetime as dt
from decimal import Decimal
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import urlparse

from model_router import TaskProfile, RoutingLedger, route_task, validate_decision
from source_policy import load_domains
from kfarmai_post_publish_audit import build_registry_record, audit_published_content
from kfarmai_review_approval import Blocked, canonical, digest, require, REGISTRY, derive_sitemap, safe_target
from approval_package import prepare_package, archive_bytes, write_package, render_issue, daily_check

# Reservation ceilings for synthetic integration, not provider price quotations.
COST = {"NONE": Decimal("0"), "LIGHT": Decimal("0.03"),
        "STANDARD": Decimal("0.10"), "HIGH": Decimal("0.25")}
SEARCH_COST = Decimal("0.015")
# Offline ceilings: reserve both model tokens and a tool call for discovery.
DISCOVERY_CALL_COST = COST["LIGHT"] + SEARCH_COST
IMAGE_COST = Decimal("0.05")


class Budget:
    def __init__(self, limit, spent=0):
        self.limit, self.spent = Decimal(str(limit)), Decimal(str(spent))
        require(self.limit.is_finite() and self.spent.is_finite() and self.limit >= 0 and self.spent >= 0, "BLOCKED_BUDGET_CONFIG")

    def check(self, projected):
        require(self.spent + projected <= self.limit, "BLOCKED_DAILY_BUDGET")

    def reserve(self, cost):
        self.check(cost)
        self.spent += cost


def validate_schema(value, schema):
    kind = schema.get("type")
    if kind == "object":
        require(isinstance(value, dict) and set(schema.get("required", [])) <= value.keys(), "BLOCKED_ARTICLE_SCHEMA")
        properties = schema["properties"]
        require(schema.get("additionalProperties", True) or value.keys() <= properties.keys(), "BLOCKED_ARTICLE_SCHEMA")
        for key, item in value.items():
            if key in properties:
                validate_schema(item, properties[key])
    elif kind == "array":
        require(isinstance(value, list) and len(value) >= schema.get("minItems", 0)
                and len(value) <= schema.get("maxItems", 100), "BLOCKED_ARTICLE_SCHEMA")
        for item in value:
            validate_schema(item, schema["items"])
    elif kind == "string":
        require(isinstance(value, str) and bool(value.strip()), "BLOCKED_ARTICLE_SCHEMA")
    if "enum" in schema:
        require(value in schema["enum"], "BLOCKED_ARTICLE_SCHEMA")


def source_validation(sources, domains):
    require(isinstance(sources, list) and 2 <= len(sources) <= 6, "BLOCKED_SOURCES")
    urls = []
    for source in sources:
        url = source["url"]
        parsed = urlparse(url)
        require(parsed.scheme == "https" and not parsed.username and not parsed.password and parsed.port in (None, 443)
                and any(parsed.hostname == d or (parsed.hostname or "").endswith("." + d) for d in domains), "BLOCKED_OFFICIAL_SOURCE")
        require(source.get("text") and source.get("http_status") == 200, "BLOCKED_SOURCE_UNAVAILABLE")
        urls.append(url)
    require(len(set(urls)) == len(urls), "BLOCKED_DUPLICATE_SOURCE")
    return {"status": "PASS", "urls": urls, "mode": "fixture",
            "facts_require_human_review": True,
            "checks": ["official_domain", "http_status", "nonempty_extracted_text", "unique_urls"]}


def low_plan(root, article, immutable, *, date, run_id):
    slug = article["slug"]
    url = f"https://kfarmai.com/kb/{slug}.html"
    names = sorted([*immutable, "sitemap.xml", REGISTRY])
    record = build_registry_record(article=article, date=date, title=article["title"], slug=slug, url=url,
                                   category=article["category"], html_bytes=immutable[f"kb/{slug}.html"],
                                   artifact_files=names, publication_mode="LOW", source_run_id=run_id)
    reg_data = safe_target(root, REGISTRY).read_bytes()
    reg = json.loads(reg_data)
    require(not any(x.get("slug") == slug or x.get("date") == date for x in reg["items"]), "BLOCKED_TARGET_CONFLICT")
    for name in immutable:
        require(not safe_target(root, name).exists(), "BLOCKED_TARGET_CONFLICT")
    files = {**immutable, "sitemap.xml": derive_sitemap(safe_target(root, "sitemap.xml").read_bytes(), {"url": url, "date": date}),
             REGISTRY: canonical({**reg, "items": [*reg["items"], record]}) + b"\n"}
    with tempfile.TemporaryDirectory(prefix="kfarmai-low-qa-") as temp:
        for name, body in files.items():
            p = Path(temp) / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(body)
        require(audit_published_content(temp, record, allowed_source_domains=load_domains(root))["status"] == "LOCAL_PASS_NETWORK_NOT_RUN", "BLOCKED_LOCAL_AUDIT")
    return {"status": "APPROVED", "approval_required": False, "record": record, "files": files,
            "before": {n: digest(safe_target(root, n).read_bytes()) if safe_target(root, n).exists() else None for n in files}}


def generate(root, output, provider, *, known_sources=None, source_type="url", env=None,
             date="2026-10-09", run_id=900001, head_sha="b768656c95eb5f511deb637f74281a2dae4fa10f",
             revision=1, cross_source_synthesis=False, source_conflict=False, force_review=False,
             human_escalation_id="", approved_policy_reason="", review_transport=None,
             durable_budget=None):
    from kfarmai_daily_autopublish import SCHEMA, render_html, render_svg, risk_gate, existing_titles
    root, output = Path(root), Path(output)
    env = os.environ if env is None else env
    output.mkdir(parents=True, exist_ok=True)
    require(getattr(provider, "is_fixture", False) is True, "CANDIDATE_PAID_API_DISABLED")
    require(not (output / "approval-package").exists(), "BLOCKED_IMMUTABLE_PACKAGE_EXISTS")
    cfg = json.loads((root / "automation/config.json").read_bytes())
    cfg["official_domains"] = load_domains(root)
    budget_file = output / "budget.json"
    prior = json.loads(budget_file.read_bytes()) if budget_file.exists() else {}
    budget = Budget(env.get("KFARMAI_DAILY_BUDGET_USD", cfg["daily_budget_usd"]), prior.get("reserved", 0) if prior.get("date") == date else 0)
    ledger = RoutingLedger()
    if (output / "model-routing.json").exists():
        ledger.entries = json.loads((output / "model-routing.json").read_bytes())
    # This output belongs to one generation task. Failed calls may have consumed
    # a search, so reserve an attempt before transport and retain it on reentry.
    search_calls = sum(item.get("web_search_calls", 0) for item in ledger.entries)
    search_attempts_used = sum(item.get("search_call_reservations", item.get("web_search_calls", 0))
                               for item in ledger.entries if item.get("task") == "source_discovery")
    def persist():
        ledger.write(output / "model-routing.json")
        budget_file.write_bytes(canonical({"date": date, "reserved": str(budget.spent), "limit": str(budget.limit)}) + b"\n")
    def deterministic(task):
        profile = TaskProfile(task_type=task)
        ledger.record(profile, route_task(profile, env))
    def invoke(profile, task, payload, cost):
        decision = route_task(profile, env)
        validate_decision(decision)
        require(not decision.blocked and decision.model, decision.reason)
        budget.reserve(cost)
        entry = ledger.record(profile, decision, estimated_budget=float(cost),
                              escalated_from="LIGHT" if decision.tier in {"STANDARD", "HIGH"} else "")
        entry["search_call_reservations"] = decision.max_search_calls if decision.web_search_enabled else 0
        persist()  # Reserve before the transport; failed requests do not refund automatically.
        payload = {**payload, "model": decision.model, "reasoning": {"effort": decision.reasoning_effort},
                   "max_output_tokens": 3000}
        if decision.web_search_enabled:
            payload.update(tools=[{"type": "web_search", "search_context_size": "low",
                                   "filters": {"allowed_domains": cfg["official_domains"]}}],
                           tool_choice="required", max_tool_calls=1)
        else:
            payload.update(tools=[], tool_choice="none", max_tool_calls=0)
        response = provider.respond(task, payload)
        calls = response.get("web_search_calls", 0)
        require(type(calls) is int and 0 <= calls <= decision.max_search_calls, "BLOCKED_SEARCH_CALL_LIMIT")
        entry["web_search_calls"] = calls
        persist()
        return response
    try:
        initial = known_sources or []
        profile = TaskProfile(task_type="content_generation", needs_synthesis=True,
                              source_count=len(initial) if initial else (2 if cross_source_synthesis else 0),
                              cross_source_synthesis=cross_source_synthesis, source_conflict=source_conflict,
                              human_escalation_id=human_escalation_id, approved_policy_reason=approved_policy_reason)
        route = route_task(profile, env)
        require(not route.blocked, route.reason)
        # Reserve headroom for one discovery, synthesis and media before the first call.
        projected = COST[route.tier] + IMAGE_COST + (Decimal(0) if initial else DISCOVERY_CALL_COST)
        budget.check(projected)
        discovery = TaskProfile(task_type="source_discovery", needs_search=not bool(initial),
                                known_official_api=bool(initial) and source_type == "api",
                                known_official_url=bool(initial) and source_type != "api")
        if initial:
            ledger.record(discovery, route_task(discovery, env))
            sources = []
            for url in initial:
                deterministic("rest_api_fetch" if source_type == "api" else "known_url_fetch")
                sources.append(provider.fetch_source(url))
        else:
            sources = []
            require(search_attempts_used < 2, "SEARCH_EXHAUSTED_SEND_TO_REVIEW")
            for attempt in range(search_attempts_used, 2):
                discovery = TaskProfile(task_type="source_discovery", needs_search=True, search_attempts=attempt)
                budget.check(COST[route.tier] + IMAGE_COST + DISCOVERY_CALL_COST)
                found = invoke(discovery, "source_discovery", {"input": "농업 공식자료 발견" if attempt == 0 else "query rewrite: 공식 농업 관리자료"}, DISCOVERY_CALL_COST)
                search_calls += found["web_search_calls"]
                require(search_calls <= 2, "BLOCKED_SEARCH_CALL_LIMIT")
                if found.get("sufficient") and len(found.get("sources", [])) >= 2:
                    for url in found["sources"]:
                        deterministic("known_url_fetch")
                        sources.append(provider.fetch_source(url))
                    break
            require(bool(sources), "REVIEW_SOURCE_DISCOVERY_INSUFFICIENT")
        deterministic("source_normalization")
        deterministic("official_domain_validation")
        source_check = source_validation(sources, cfg["official_domains"])
        # Re-route with actual source evidence, never source count alone.
        profile = TaskProfile(**{**profile.__dict__, "source_count": len(sources)})
        decision = route_task(profile, env)
        budget.check(COST[decision.tier] + IMAGE_COST)
        response = invoke(profile, "content_generation",
                          {"input": canonical({"sources": sources, "date": date}).decode(),
                           "text": {"format": {"type": "json_schema", "name": "kfarmai_article", "strict": True, "schema": SCHEMA}}},
                          COST[decision.tier])
        article = copy.deepcopy(response["article"])
        deterministic("json_parse")
        validate_schema(article, SCHEMA)
        require(re.fullmatch(r"[a-z0-9][a-z0-9-]{4,80}", article["slug"]), "BLOCKED_SLUG")
        require([s["url"] for s in article["sources"]] == source_check["urls"], "BLOCKED_SOURCE_MAPPING")
        reg = json.loads((root / REGISTRY).read_bytes())
        seed = json.loads((root / "automation/topic_seed.json").read_bytes())
        deterministic("dedupe")
        require(article["title"] not in existing_titles(root, reg, seed), "BLOCKED_DUPLICATE_TITLE")
        require(article["risk"] != "BLOCK", "BLOCKED_RISK_POLICY")
        deterministic("risk_gate")
        risk, reason = risk_gate(article, cfg)
        if force_review:
            risk, reason = "REVIEW", reason or "review_only"
        article["risk"] = risk
        require(risk in {"LOW", "REVIEW"}, "BLOCKED_RISK_POLICY")
        budget.reserve(IMAGE_COST)
        persist()
        # Image generation is a separate media operation, never a text-tier escalation.
        hero = provider.image({"model": cfg["image_model"], "prompt": article["hero_image_brief"], "quality": "low", "n": 1})
        slug = article["slug"]
        html_path, hero_path, svg_path = f"kb/{slug}.html", f"static/kb/{slug}-hero.webp", f"static/kb/{slug}-infographic.svg"
        page = render_html(article, date, hero_path, svg_path, cfg["site_url"]).encode("utf-8")
        with tempfile.TemporaryDirectory(prefix="kfarmai-svg-render-") as temp:
            svg_file = Path(temp) / "infographic.svg"
            render_svg(article, svg_file)
            svg = svg_file.read_bytes()
        immutable = {html_path: page, hero_path: hero, svg_path: svg}
        deterministic("hash")
        if risk == "REVIEW":
            package = prepare_package(article=article, review_reason=reason, source_check=source_check,
                                      html_bytes=page, hero_bytes=hero, svg_bytes=svg, date=date,
                                      run_id=run_id, head_sha=head_sha, revision=revision)
            raw = archive_bytes(package)
            artifact = provider.artifact_identity(raw, package["manifest"])
            issue = render_issue(package, artifact)
            # Validate local publication QA on a read-only plan before sealing the package.
            from kfarmai_review_approval import plan_publication
            plan_publication(root, raw, issue["metadata"], artifact)
            write_package(output / "approval-package", package)
            if review_transport is not None:
                require(durable_budget is not None, "BLOCKED_DURABLE_OUTBOX_REQUIRED")
                from artifact_issue_contract import review_report
                from kfarmai_review_approval import metadata
                bound = review_report(package, review_transport, durable_budget)
                raw, artifact = bound["archive"], bound["artifact"]
                issue = {**bound["issue"], "metadata": metadata(bound["issue"])}
            (output / "approval-package.zip").write_bytes(raw)
            (output / "issue-payload.json").write_bytes(canonical({"title": issue["title"], "body": issue["body"], "synthetic": True}) + b"\n")
            (output / "issue-body.md").write_text(issue["body"], encoding="utf-8")
            (output / "artifact-identity.json").write_bytes(canonical(artifact) + b"\n")
            outcome = {"status": "REVIEW", "title": article["title"], "url": package["intent"]["url"],
                       "review": package["review"], "approval_id": package["manifest"]["approval_id"],
                       "manifest_sha256": package["manifest_sha256"], "synthetic": True,
                       "reason": reason, "published": False}
            result = {"package": package, "archive": raw, "artifact": artifact, "issue": issue}
        else:
            plan = low_plan(root, article, immutable, date=date, run_id=run_id)
            release = output / "low-release"
            require(not release.exists(), "BLOCKED_IMMUTABLE_PACKAGE_EXISTS")
            for name, data in plan["files"].items():
                p = release / name
                p.parent.mkdir(parents=True, exist_ok=True)
                with p.open("xb") as target:
                    target.write(data)
            (output / "files_to_commit.txt").write_text("\n".join(sorted(plan["files"])) + "\n", encoding="utf-8")
            outcome = {"status": "LOW_READY", "title": article["title"], "url": plan["record"]["url"],
                       "approval_required": False, "synthetic": True, "published": False}
            result = {"plan": plan}
        outcome["estimated_cost_usd"] = float(budget.spent)
        (output / "outcome.json").write_bytes(canonical(outcome) + b"\n")
        (output / "daily-check.txt").write_text(daily_check(outcome), encoding="utf-8")
        return {**result, "outcome": outcome, "ledger": ledger.entries, "search_calls": search_calls}
    except (Blocked, ValueError, KeyError, TypeError, OSError) as error:
        reason = error.code if isinstance(error, Blocked) else "BLOCKED_MALFORMED_OR_TECHNICAL_INPUT"
        outcome = {"status": "BLOCK", "reason": reason, "published": False, "synthetic": True}
        (output / "outcome.json").write_bytes(canonical(outcome) + b"\n")
        (output / "daily-check.txt").write_text(daily_check(outcome), encoding="utf-8")
        return {"outcome": outcome, "ledger": ledger.entries, "search_calls": search_calls}
    finally:
        persist()
