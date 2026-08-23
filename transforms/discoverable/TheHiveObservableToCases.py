"""Transform: IOC -> TheHive cases that contain it as an observable."""

from __future__ import annotations

import logging

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
from transforms.shared.trx import thehive_case_phrase

log = logging.getLogger("transforms.thehive_observable_to_cases")


@registry.register_transform(
    display_name="TheHive - cases containing observable",
    input_entity="maltego.IPv4Address",
    description="Find TheHive cases whose observables contain the input value.",
    output_entities=["maltego.Phrase"],
    transform_set=MCP_TRANSFORM_SET,
)
class TheHiveObservableToCases(DiscoverableTransform):
    @classmethod
    def create_entities(cls, request, response) -> None:
        try:
            cfg = load_config()
            api_key = cfg.thehive.api_key
        except ConfigError as exc:
            cat, msg = classify_for_uimessage(ConfigMissingError(str(exc)))
            response.addUIMessage(msg, cat)
            return

        body = {
            "query": [
                {"_name": "listObservable"},
                {"_name": "filter", "_field": "data", "_value": request.Value},
                {"_name": "case"},
            ]
        }

        client = HttpClient(cfg)
        try:
            payload = client.post_json(
                f"{cfg.thehive.url}/api/v1/query",
                json_body=body,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Accept": "application/json",
                },
                verify=cfg.thehive.ca_bundle or cfg.thehive.verify_ssl,
            )
        except HttpError as exc:
            cat, msg = classify_for_uimessage(cls._classify(str(exc)))
            response.addUIMessage(msg, cat)
            return

        seen: set[str] = set()
        for case in payload:
            cid = case.get("_id") or case.get("caseId")
            if not cid or cid in seen:
                continue
            seen.add(cid)
            response.addEntity(Phrase, thehive_case_phrase(str(cid)))

        if not seen:
            response.addUIMessage(
                f"no TheHive cases reference {request.Value}", "Inform"
            )

    @staticmethod
    def _classify(message: str) -> Exception:
        if " 401 " in message or " 403 " in message:
            return AuthError(message)
        if " 429 " in message:
            return RateLimitError(message)
        return BackendError(message)
