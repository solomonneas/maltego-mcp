"""Transform: [MISP] Event #N Phrase -> typed entities per MISP attribute."""

from __future__ import annotations

import logging
import re

from maltego_trx.entities import URL, Domain, Email, Hash, IPAddress, Phrase
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

log = logging.getLogger("transforms.misp_event_to_iocs")

EVENT_ID_RE = re.compile(r"\[MISP\] Event #(\d+)")

TYPE_MAP: dict[str, type] = {
    "ip-dst": IPAddress,
    "ip-src": IPAddress,
    "domain": Domain,
    "hostname": Domain,
    "url": URL,
    "md5": Hash,
    "sha1": Hash,
    "sha256": Hash,
    "sha512": Hash,
    "email-src": Email,
    "email-dst": Email,
}


@registry.register_transform(
    display_name="MISP - attributes in event",
    input_entity="maltego.Phrase",
    description="For a [MISP] Event #N Phrase, return every attribute as a typed entity.",
    output_entities=[
        "maltego.IPv4Address",
        "maltego.Domain",
        "maltego.URL",
        "maltego.Hash",
        "maltego.Email",
        "maltego.Phrase",
    ],
    transform_set=MCP_TRANSFORM_SET,
)
class MispEventToIocs(DiscoverableTransform):
    @classmethod
    def create_entities(cls, request, response) -> None:
        m = EVENT_ID_RE.search(request.Value)
        if not m:
            response.addUIMessage(
                "input does not look like '[MISP] Event #N'; cannot extract event id",
                "Inform",
            )
            return
        event_id = int(m.group(1))

        try:
            cfg = load_config()
            api_key = cfg.misp.api_key
        except ConfigError as exc:
            cat, msg = classify_for_uimessage(ConfigMissingError(str(exc)))
            response.addUIMessage(msg, cat)
            return

        client = HttpClient(cfg)
        try:
            body = client.get_json(
                f"{cfg.misp.url}/events/{event_id}",
                headers={"Authorization": api_key, "Accept": "application/json"},
                verify=cfg.misp.ca_bundle or cfg.misp.verify_ssl,
            )
        except HttpError as exc:
            cat, msg = classify_for_uimessage(cls._classify(str(exc)))
            response.addUIMessage(msg, cat)
            return

        attributes = body.get("Event", {}).get("Attribute", [])
        if not attributes:
            response.addUIMessage(f"no attributes in event {event_id}", "Inform")
            return

        for attr in attributes:
            misp_type = attr.get("type")
            value = attr.get("value")
            if not value:
                continue
            entity_cls = TYPE_MAP.get(misp_type)
            if entity_cls is None:
                response.addEntity(Phrase, f"[{misp_type}] {value}")
            else:
                response.addEntity(entity_cls, value)

    @staticmethod
    def _classify(message: str) -> Exception:
        if " 401 " in message or " 403 " in message:
            return AuthError(message)
        if " 429 " in message:
            return RateLimitError(message)
        return BackendError(message)
