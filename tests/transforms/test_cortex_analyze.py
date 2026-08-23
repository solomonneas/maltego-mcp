"""cortex_analyze: IOC -> Phrase[Cortex] verdict per applicable analyzer."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import responses
from maltego_trx.maltego import MaltegoTransform

from transforms.discoverable.CortexAnalyze import CortexAnalyze

FIXTURES = Path(__file__).parent / "fixtures"


def _request(value: str, entity_type: str):
    return SimpleNamespace(Value=value, Type=entity_type, Properties={"maltego-mcp.cortex-run-capability": "test-capability"})


def test_emits_verdict_per_applicable_analyzer(
    fake_config, mocked_responses: responses.RequestsMock
) -> None:
    analyzers = json.loads((FIXTURES / "cortex_analyzers.json").read_text())
    job = json.loads((FIXTURES / "cortex_job_report.json").read_text())

    mocked_responses.get("https://cortex.test/api/analyzer", json=analyzers, status=200)
    mocked_responses.post(
        "https://cortex.test/api/analyzer/VirusTotal_GetReport_3_1/run",
        json={"id": "JOB-1"},
        status=200,
    )
    mocked_responses.post(
        "https://cortex.test/api/analyzer/AbuseIPDB_1_0/run",
        json={"id": "JOB-2"},
        status=200,
    )
    mocked_responses.get(
        "https://cortex.test/api/job/JOB-1/waitreport", json=job, status=200
    )
    mocked_responses.get(
        "https://cortex.test/api/job/JOB-2/waitreport", json=job, status=200
    )

    resp = MaltegoTransform()
    CortexAnalyze.create_entities(_request("1.2.3.4", "maltego.IPv4Address"), resp)

    values = [e.value for e in resp.entities]
    assert any("[Cortex] VirusTotal_GetReport_3_1" in v for v in values)
    assert any("[Cortex] AbuseIPDB_1_0" in v for v in values)


def test_filters_analyzers_by_data_type(
    fake_config, mocked_responses: responses.RequestsMock
) -> None:
    analyzers = json.loads((FIXTURES / "cortex_analyzers.json").read_text())
    job = json.loads((FIXTURES / "cortex_job_report.json").read_text())
    mocked_responses.get("https://cortex.test/api/analyzer", json=analyzers, status=200)
    mocked_responses.post(
        "https://cortex.test/api/analyzer/VirusTotal_GetReport_3_1/run",
        json={"id": "JOB-1"},
        status=200,
    )
    mocked_responses.get(
        "https://cortex.test/api/job/JOB-1/waitreport", json=job, status=200
    )

    resp = MaltegoTransform()
    CortexAnalyze.create_entities(_request("evil.example", "maltego.Domain"), resp)

    values = [e.value for e in resp.entities]
    assert not any("AbuseIPDB" in v for v in values)
    assert any("VirusTotal_GetReport_3_1" in v for v in values)
