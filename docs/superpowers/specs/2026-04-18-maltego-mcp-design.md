# maltego-mcp Design

**Date:** 2026-04-18
**Status:** Draft pending implementation plan
**Owner:** Solomon Neas

## Summary

An MCP server that lets Claude build Maltego graphs and, in a second phase, install local transforms that run inside the Maltego Desktop app. Targets Maltego Graph Desktop (Basic tier and up, edition-agnostic where practical).

Matches `solomonneas/misp-mcp` conventions for: project layout (`src/`, `tests/`, `fixtures/`), build tooling (`tsup`), test framework (vitest), tool naming (`<service>_<verb>_<object>`), env var prefixing, and error shape. Does NOT inherit: SSL verification toggle (not relevant; no user-owned HTTPS backend), authentication (stdio transport is local-only).

The `.mtgx` file format is a zipped GraphML XML document with Maltego-specific elements. The Python `pymtgx` library (`github.com/pcbje/pymtgx`) is the reference for the minimal writer we will port to TypeScript; hand-exported graphs from Maltego Desktop are the authoritative oracle in golden tests.

## Goals

- Let Claude author `.mtgx` graph files from structured data (its own or piped from other MCPs) and drop them where the user can open them in Maltego.
- Provide primitive infrastructure lookups (whois, DNS, ASN, certificate transparency) as tools, so Claude can build enriched graphs without depending on paid third-party APIs.
- Install local Python TRX transforms into Maltego via a `.mtz` bundle, so users can right-click entities inside Maltego and invoke Claude-defined enrichments.
- Compose cleanly with existing security MCPs (misp-mcp, mitre-mcp, thehive-mcp, cortex-mcp, zeek-mcp, suricata-mcp, wazuh-mcp). Maltego MCP is the graph sink; other MCPs supply the data.

## Non-goals

- Real-time remote-control of a running Maltego Desktop instance. The Desktop app exposes no such API; we use the file-roundtrip model (MCP writes `.mtgx`, user opens it).
- Embedding third-party threat-intel clients (VirusTotal, Shodan, AbuseIPDB, MISP, etc.). Those belong in dedicated MCPs where API keys and rate limits live.
- Headless Maltego automation in tests. No such mode exists; we validate output via golden `.mtgx` fixtures exported by hand from Maltego.
- An internal TDS (iTDS) deployment. Basic tier does not ship iTDS; local TRX transforms bundled in `.mtz` are the edition-agnostic path.

## Architecture

Two independent, co-located phases in one repo. Phase A ships first and is useful standalone. Phase B layers on top without adding runtime coupling.

### Phase A: MCP graph-authoring server

- Node 20+ TypeScript MCP server, stdio transport.
- Exposes tools that let Claude build a graph in memory, save it as `.mtgx`, load an existing `.mtgx` back in, and run primitive infrastructure lookups.
- Output directory defaults to `~/MaltegoGraphs/`, configurable via env. User opens generated `.mtgx` files in Maltego Desktop.
- Registered in both Claude Code and Claude Desktop configs.

### Phase B: Local TRX transform bundle

- `/transforms/*.py` are standalone Python TRX scripts, packaged into a `.mtz` config file by a build script.
- User imports the `.mtz` into Maltego once. Transforms appear in the right-click menu inside Maltego.
- Transforms run in Python invoked directly by Maltego; they do not call the MCP server process at runtime. They may call the same upstream APIs those MCPs wrap, or hit shared backends (e.g., the MISP instance at 192.168.4.97) directly.

### Key boundary

The MCP server and the TRX transforms share only the repo; they are different runtimes, different deploy paths, different failure modes. Phase A works with or without Phase B installed.

## Components

```
~/repos/maltego-mcp/
├── src/
│   ├── index.ts             # MCP server entry, stdio transport, tool registration
│   ├── config.ts            # env parsing (OUTPUT_DIR, timeouts, namespaces)
│   ├── types.ts             # Entity, Link, Graph, Position, MaltegoEntityType
│   ├── graph/
│   │   ├── entities.ts      # registry of Maltego entity types
│   │   ├── graph.ts         # in-memory Graph: add_entity, add_link, auto-layout
│   │   ├── writer.ts        # Graph -> GraphML XML -> zip -> .mtgx
│   │   └── reader.ts        # .mtgx -> Graph (round-trip for load_graph)
│   ├── lookups/
│   │   ├── whois.ts
│   │   ├── dns.ts
│   │   ├── asn.ts           # Team Cymru DNS or RDAP
│   │   └── crtsh.ts         # crt.sh certificate transparency
│   ├── tools/
│   │   ├── graph.ts         # maltego_create_graph, _add_entity, _add_link, _save_graph, _load_graph
│   │   ├── lookups.ts       # maltego_whois, _dns, _asn, _crtsh
│   │   └── expand.ts        # maltego_expand_ip, _expand_domain, _expand_hash
│   └── server/
│       ├── registry.ts      # in-memory graphId -> Graph map
│       └── errors.ts        # structured tool errors, matches misp-mcp pattern
├── transforms/              # Phase B, Python TRX scripts (separate runtime)
│   └── README.md
├── scripts/
│   └── build-mtz.ts         # Phase B, packages /transforms/ into .mtz
├── tests/
│   ├── unit/
│   └── integration/
├── fixtures/
│   ├── golden/              # .mtgx files exported by hand from Maltego (writer oracle)
│   └── responses/           # captured whois/DNS/crt.sh responses for mocking
├── package.json
├── tsconfig.json
└── README.md
```

### Isolation principles

- `graph/` is a pure library with no MCP knowledge. Usable from any Node script.
- `lookups/` are pure async functions returning structured data. No graph knowledge.
- `tools/` is the only layer that knows about the MCP protocol. It composes `graph/` and `lookups/`.
- Unit tests for `graph/` and `lookups/` do not need an MCP harness; only `tests/integration/` spins up the server.

### Naming conventions (match misp-mcp)

- Tool names: `maltego_<verb>_<object>`.
- Resource URIs: `maltego://graph/<graphId>`.
- Env vars: `MALTEGO_MCP_<KEY>`.

### Entity type coverage

Standard Maltego types for unambiguous observables: `IPv4Address`, `IPv6Address`, `Domain`, `URL`, `Hash`, `EmailAddress`, `Netblock`, `AS`, `Website`, `Company`, `Person`. Hash algorithm (MD5/SHA1/SHA256/SHA512) is carried as a property on the `Hash` entity per Maltego ontology, not as separate entity types.

For concepts without a standard Maltego type (MITRE techniques, TheHive case IDs, MISP event IDs, Suricata signature IDs, etc.), use `maltego.Phrase` with a category prefix: `[T1566] Phishing`, `[TheHive] Case #42`, `[MISP] Event 1337`. This keeps graphs readable in any Maltego install without requiring custom entity-type packs.

## Data flow

Two canonical flows. Both end with a `.mtgx` on disk that the user opens in Maltego Desktop.

### Flow 1: Primitive composition (Claude drives the shape)

```
Claude -> maltego_create_graph({name})                 -> {graphId}
Claude -> maltego_add_entity({graphId, type, value})   -> {entityId}
Claude -> maltego_whois({domain})                      -> {registrar, nameservers, ...}
Claude -> maltego_add_entity(...) / maltego_add_link(...)
...
Claude -> maltego_save_graph({graphId, path})          -> {path, entityCount, linkCount}
User   -> double-clicks the .mtgx in Maltego Desktop
```

### Flow 2: Convenience (one call, one graph)

```
Claude -> maltego_expand_ip({ip, outputPath})
            # internally: create_graph -> parallel(whois, dns, asn) ->
            #             add_entity per result -> add_link per relationship ->
            #             save_graph
                                                        -> {path, entityCount, linkCount}
User   -> opens the .mtgx
```

### Composing with other MCPs

Claude calls e.g. `misp-mcp`'s `misp_search_events` for IOCs, then loops `maltego_add_entity` + `maltego_add_link` on this MCP to visualize them. The two MCPs never talk to each other; Claude is the glue.

### Graph handle lifetime

Graph IDs are in-memory only, server-lifetime. To resume editing an existing `.mtgx`, Claude calls `maltego_load_graph({path})` to parse and receive a fresh graphId. The only durable state is files on disk.

### Auto-layout

`writer.ts` assigns coordinates on save using a simple grid-by-type layout so Maltego opens with a readable graph instead of all nodes at the origin. Users can re-layout in Maltego afterward. A full force-directed layout library is out of scope for v1.

## Error handling

Matches the misp-mcp request-level pattern. Five categories with distinct treatments.

1. **Validation errors (client bug)** - invalid entity type, missing graphId, malformed position. Throw synchronously with remediation hint: `"Unknown entity type 'IPv4'; did you mean 'IPv4Address'?"`. Not retriable.
2. **Lookup failures (network)** - whois timeout, DNS SERVFAIL, crt.sh 429. Do NOT throw. Return `{ok: false, error, retriable, retryAfterMs?}`. Claude decides whether to retry, skip, or add a placeholder entity noting the failure.
3. **Filesystem errors** - cannot write output, disk full, path traversal attempt. Throw with attempted path and underlying errno. `save_graph` refuses to overwrite existing files unless `overwrite: true`.
4. **Parse errors (on `load_graph`)** - malformed `.mtgx`, unsupported version, missing GraphML body. Throw with file path and, where available, the offending XML location.
5. **Rate limits** - `crt.sh` in particular. Respect `Retry-After`, surface as retriable. A per-host token bucket prevents tripping limits across multi-tool compositions.

**Composition rule for Claude:** mutations (`add_entity`, `add_link`) throw on bad input because those are Claude's bugs; lookups return errors as data because those are the world's bugs. This lets Claude keep building a graph even when a single lookup fails.

**Timeouts:** per-lookup default 30s, overridable via `MALTEGO_MCP_LOOKUP_TIMEOUT_MS`.

**Crash safety:** graph handles are in-memory only. If the server dies mid-build, handles are lost and Claude rebuilds. Per-mutation checkpointing is deferred to v2 unless it becomes painful in practice.

## Testing

Split matches misp-mcp (vitest, unit + integration). Targets roughly 40 to 55 unit tests and 20 to 27 integration tests; final counts depend on implementation surface, not set as a hard goal.

### Unit tests

- `graph/entities.test.ts` - type registry: valid types accepted, unknown types rejected with suggestions, `Phrase` prefix handling.
- `graph/graph.test.ts` - in-memory Graph mutations, duplicate detection, orphan link rejection, entity count, auto-layout assignment.
- `graph/writer.test.ts` - the critical test. Given a Graph, produce `.mtgx` bytes. Validated two ways:
  1. Structural: unzip output, parse GraphML, assert counts and attributes.
  2. Golden file: compare against `fixtures/golden/*.mtgx` exported by hand. Ignore UUIDs, timestamps, and coordinate rounding; assert the rest matches.
- `graph/reader.test.ts` - round-trip writer -> reader produces the same logical graph. Negative tests for malformed zips, missing GraphML, unsupported version.
- `lookups/*.test.ts` - mock network (undici MockAgent or nock), assert parsing of real captured responses from `fixtures/responses/`.
- `server/errors.test.ts` - error shape matches misp-mcp contract.

### Integration tests

- MCP server over stdio in-process, driven as a real MCP client.
- **Canonical round-trip:** `create_graph` -> 5 `add_entity` -> 4 `add_link` -> `save_graph` -> read file from disk -> parse -> assert identical graph shape. The one test that proves the Phase A pipeline end-to-end.
- Convenience tools: `expand_ip` with mocked lookups produces expected graph shape.
- Error propagation: lookup failures reach Claude as structured data; mutation failures reach as thrown errors.
- File handling: overwrite refused without flag, output dir auto-created, path traversal rejected.
- Concurrent graph handles: parallel graphIds do not leak into each other.

### Golden fixtures (one-time manual setup)

User creates 2-3 reference graphs by hand in Maltego (simple: 3 entities + 2 links; mixed entity types; Phrase entities with category prefixes). Export as `.mtgx`, check into `fixtures/golden/`. These are the ground truth that `writer.ts` output is measured against. If Maltego changes the `.mtgx` format, golden tests break first and loudly.

### Explicitly out of scope for v1 tests

- Launching Maltego Desktop in tests (no headless mode).
- Phase B transform packaging (covered when Phase B lands).

### Test commands

```
npm test                   # unit only
npm run test:integration
npm run test:all
```

## Deployment

- Installed for both Claude Code and Claude Desktop.
- Build: `tsup` to a single `dist/index.js`.
- Registered in `claude_desktop_config.json` under `mcpServers.maltego` and via `claude mcp add maltego` for Claude Code.
- Env vars: `MALTEGO_MCP_OUTPUT_DIR` (default `~/MaltegoGraphs/`), `MALTEGO_MCP_LOOKUP_TIMEOUT_MS` (default 30000).

## Out of scope for v1

- Phase B transform bundle (tracked as v2 in this same repo).
- Third-party threat-intel clients (belong in dedicated MCPs).
- Live Maltego Desktop control.
- iTDS setup (requires Pro/Enterprise edition).
- Force-directed graph layout.
- Per-mutation crash-safe checkpointing.
- Authentication on the MCP server (stdio transport, local-only).
