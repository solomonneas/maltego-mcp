"""Transform: [TheHive] Case #X Phrase -> typed entities per case observable."""

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

log = logging.getLogger("transforms.thehive_case_to_observables")

CASE_ID_RE = re.compile(r"\[TheHive\] Case #([A-Za-z0-9_-]+)")

TYPE_MAP: dict[str, type] = {
    "ip": IPAddress,
    "domain": Domain,
    "fqdn": Domain,
    "url": URL,
    "hash": Hash,
    "mail": Email,
}


@registry.register_transform(
    display_name="TheHive - observables in case",
    input_entity="maltego.Phrase",
    description="For a [TheHive] Case #X Phrase, return every observable as a typed entity.",
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
class TheHiveCaseToObservables(DiscoverableTransform):
    @classmethod
    def create_entities(cls, request, response) -> None:
        m = CASE_ID_RE.search(request.Value)
        if not m:
            response.addUIMessage(
                "input does not look like '[TheHive] Case #X'; cannot extract case id",
                "Inform",
            )
            return
        case_id = m.group(1)

        try:
            cfg = load_config()
            api_key = cfg.thehive.api_key
        except ConfigError as exc:
            cat, msg = classify_for_uimessage(ConfigMissingError(str(exc)))
            response.addUIMessage(msg, cat)
            return

        body = {
            "query": [
                {"_name": "getCase", "idOrName": case_id},
                {"_name": "observables"},
            ]
        }

        client = HttpClient(cfg)
        try:
            observables = client.post_json(
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

        if not observables:
            response.addUIMessage(f"no observables in case {case_id}", "Inform")
            return

        for obs in observables:
            data_type = obs.get("dataType")
            value = obs.get("data")
            if not value:
                continue
            entity_cls = TYPE_MAP.get(data_type)
            if entity_cls is None:
                response.addEntity(Phrase, f"[{data_type}] {value}")
            else:
                response.addEntity(entity_cls, value)

    @staticmethod
    def _classify(message: str) -> Exception:
        if " 401 " in message or " 403 " in message:
            return AuthError(message)
        if " 429 " in message:
            return RateLimitError(message)
        return BackendError(message)
