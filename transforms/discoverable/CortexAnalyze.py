"""Transform: IOC -> Cortex analyzer verdicts as Phrase entities."""

from __future__ import annotations

import logging
import os

from maltego_trx.entities import Phrase
from maltego_trx.transform import DiscoverableTransform

from transforms.extensions import MCP_TRANSFORM_SET, registry
from transforms.shared.config import ConfigError, load_config
from transforms.shared.errors import (
    AuthError,
    BackendError,
    ConfigMissingError,
    RateLimitError,
    classify_for_uimessage,
)
from transforms.shared.http import HttpClient, HttpError
from transforms.shared.trx import cortex_verdict_phrase

log = logging.getLogger("transforms.cortex_analyze")

ENTITY_TO_CORTEX_TYPE: dict[str, str] = {
    "maltego.IPv4Address": "ip",
    "maltego.IPv6Address": "ip",
    "maltego.Domain": "domain",
    "maltego.URL": "url",
    "maltego.Hash": "hash",
    "maltego.EmailAddress": "mail",
}


@registry.register_transform(
    display_name="Cortex - analyze IOC",
    input_entity="maltego.IPv4Address",
    description="Run all applicable Cortex analyzers on the input and return verdicts.",
    output_entities=["maltego.Phrase"],
    transform_set=MCP_TRANSFORM_SET,
)
class CortexAnalyze(DiscoverableTransform):
    @classmethod
    def create_entities(cls, request, response) -> None:
        cortex_type = ENTITY_TO_CORTEX_TYPE.get(request.Type)
        if cortex_type is None:
            response.addUIMessage(
                f"Cortex has no dataType mapping for {request.Type}", "Inform"
            )
            return

        try:
            cfg = load_config()
            api_key = cfg.cortex.api_key
        except ConfigError as exc:
            cat, msg = classify_for_uimessage(ConfigMissingError(str(exc)))
            response.addUIMessage(msg, cat)
            return

        capability = request.Properties.get("maltego-mcp.cortex-run-capability")
        if not capability or capability != os.environ.get("MALTEGO_MCP_CORTEX_RUN_CAPABILITY"):
            response.addUIMessage("Cortex analysis requires caller authorization", "Inform")
            return
        if not cfg.cortex_allowed_analyzers or cfg.cortex_max_analyzers_per_run <= 0:
            response.addUIMessage("Cortex analyzer policy denies all runs", "Inform")
            return

        client = HttpClient(cfg)
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

        try:
            analyzers = client.get_json(
                f"{cfg.cortex.url}/api/analyzer",
                headers=headers,
                verify=cfg.cortex.ca_bundle or cfg.cortex.verify_ssl,
            )
        except HttpError as exc:
            cat, msg = classify_for_uimessage(cls._classify(str(exc)))
            response.addUIMessage(msg, cat)
            return

        applicable = [a for a in analyzers if cortex_type in a.get("dataTypeList", []) and a.get("id") in cfg.cortex_allowed_analyzers][:cfg.cortex_max_analyzers_per_run]
        if not applicable:
            response.addUIMessage(
                f"no Cortex analyzers support dataType={cortex_type}", "Inform"
            )
            return

        for analyzer in applicable:
            try:
                job = client.post_json(
                    f"{cfg.cortex.url}/api/analyzer/{analyzer['id']}/run",
                    json_body={"data": request.Value, "dataType": cortex_type, "tlp": 2},
                    headers=headers,
                    verify=cfg.cortex.ca_bundle or cfg.cortex.verify_ssl,
                )
                report = client.get_json(
                    f"{cfg.cortex.url}/api/job/{job['id']}/waitreport",
                    headers=headers,
                    verify=cfg.cortex.ca_bundle or cfg.cortex.verify_ssl,
                )
            except HttpError as exc:
                response.addUIMessage(
                    f"analyzer {analyzer['id']} failed: {exc}", "PartialError"
                )
                continue

            verdict = cls._extract_verdict(report)
            response.addEntity(
                Phrase, cortex_verdict_phrase(analyzer["id"], verdict)
            )

    @staticmethod
    def _extract_verdict(report: dict) -> str:
        try:
            taxonomies = report["report"]["summary"]["taxonomies"]
            if taxonomies:
                tax = taxonomies[0]
                return f"{tax.get('level', '?')} ({tax.get('value', '')})"
        except (KeyError, TypeError):
            pass
        return report.get("status", "unknown")

    @staticmethod
    def _classify(message: str) -> Exception:
        if " 401 " in message or " 403 " in message:
            return AuthError(message)
        if " 429 " in message:
            return RateLimitError(message)
        return BackendError(message)
