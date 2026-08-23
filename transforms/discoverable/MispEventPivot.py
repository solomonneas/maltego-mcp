"""Transform: IOC -> MISP events that contain it.

Inputs:  maltego.IPv4Address, maltego.Domain, maltego.Hash, maltego.EmailAddress
Output:  one Phrase entity per unique MISP event id ("[MISP] Event #N")
"""

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
from transforms.shared.logging_setup import configure
from transforms.shared.trx import misp_event_phrase

log = logging.getLogger("transforms.misp_event_pivot")


@registry.register_transform(
    display_name="MISP - events containing IOC",
    input_entity="maltego.IPv4Address",
    description="Find MISP events whose attributes contain the input value.",
    output_entities=["maltego.Phrase"],
    transform_set=MCP_TRANSFORM_SET,
)
class MispEventPivot(DiscoverableTransform):
    @classmethod
    def create_entities(cls, request, response) -> None:
        configure("misp_event_pivot")
        try:
            cfg = load_config()
            api_key = cfg.misp.api_key  # raises ConfigError if env unset
        except ConfigError as exc:
            cat, msg = classify_for_uimessage(ConfigMissingError(str(exc)))
            response.addUIMessage(msg, cat)
            return

        client = HttpClient(cfg)
        try:
            body = client.post_json(
                f"{cfg.misp.url}/attributes/restSearch",
                json_body={"value": request.Value, "limit": 50},
                headers={"Authorization": api_key, "Accept": "application/json"},
                verify=cfg.misp.ca_bundle or cfg.misp.verify_ssl,
            )
        except HttpError as exc:
            cat, msg = classify_for_uimessage(cls._classify(str(exc)))
            response.addUIMessage(msg, cat)
            return

        attributes = body.get("response", {}).get("Attribute", [])
        if not attributes:
            response.addUIMessage(f"no MISP events for {request.Value}", "Inform")
            return

        seen: set[int] = set()
        for attr in attributes:
            try:
                event_id = int(attr["Event"]["id"])
            except (KeyError, TypeError, ValueError):
                continue
            if event_id in seen:
                continue
            seen.add(event_id)
            response.addEntity(Phrase, misp_event_phrase(event_id))

    @staticmethod
    def _classify(message: str) -> Exception:
        if " 401 " in message or " 403 " in message:
            return AuthError(message)
        if " 429 " in message:
            return RateLimitError(message)
        return BackendError(message)
