"""Shared official source allowlist; no network or environment overrides."""
import json
from pathlib import Path
import re


DEFAULT_OFFICIAL_DOMAINS = (
    "rda.go.kr", "nongsaro.go.kr", "ncpms.rda.go.kr", "psis.rda.go.kr",
    "weather.rda.go.kr", "kamis.or.kr", "mafra.go.kr", "data.go.kr",
)


def validate_domains(domains):
    if not isinstance(domains, (list, tuple)) or not domains:
        raise ValueError("INVALID_SOURCE_ALLOWLIST")
    normalized = []
    for domain in domains:
        if not isinstance(domain, str):
            raise ValueError("INVALID_SOURCE_ALLOWLIST")
        value = domain.strip().lower()
        if not re.fullmatch(r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", value):
            raise ValueError("INVALID_SOURCE_ALLOWLIST")
        normalized.append(value)
    return tuple(dict.fromkeys(normalized))


def load_domains(root):
    config = json.loads((Path(root) / "automation/config.json").read_bytes())
    return validate_domains(config["official_domains"])
