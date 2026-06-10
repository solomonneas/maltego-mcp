# Repository Guidance

Two-layer Maltego Desktop toolkit, layers share the repo and nothing else.
Phase A: TypeScript MCP server that authors `.mtgx` graphs and runs primitive
OSINT lookups (whois, DNS, ASN via Team Cymru, crt.sh). Phase B: Python TRX
transforms under `transforms/`, bundled into a `.mtz` that adds right-click
pivots into MISP, TheHive, Cortex, and a bundled MITRE ATT&CK dataset.

## Definition of Done
```bash
./scripts/verify
```
Runs the unconditional gates in order: `npm run typecheck`, `npm test`.

Before reporting any substantive code change complete, run and pass ALL of:
- `./scripts/verify`
- `npm run test:all` when the change touches anything integration tests cover
  (graph round-trip, expanders, demo, lookups). `npm test` runs `tests/unit`
  only; passing it does NOT validate integration changes.

After any follow-up edit, re-run the full set. Report actual results. Report
failures verbatim. Never claim a success you did not observe.

Phase B changes (`transforms/`) additionally require `npm run test:transforms`
(pytest over `tests/transforms/`). Run `npm run setup:transforms` once first
to create `transforms/.venv`.

## Architecture Rules
- Adding or changing an MCP tool: register it in `ALL_TOOL_FACTORIES` in
  `src/tools/index.ts` (the canonical list), one implementation file per tool
  under `src/tools/`. Update the README tool list and the
  `openclaw.plugin.json` description in the same change.
- New graph or lookup code: graph model and `.mtgx` read/write go in
  `src/graph/`, network lookups in `src/lookups/`. Do not scatter them.
- Touching `index.ts` (OpenClaw plugin entry), `mcp-server.ts` (stdio server
  and npm `bin`), or packaging: run `npm run build`. The plugin manifest and
  `package.json` `openclaw.extensions` point at `./dist/index.js`, so source
  edits do nothing until built.

## Prohibitions
- Live network: OSINT lookups (whois, DNS, Team Cymru, crt.sh) and SOC pivots
  (MISP, TheHive, Cortex) hit live external services. Never run them during
  review or testing unless the user explicitly asks in this session. Need
  lookup behavior in a test: mock it via `fixtures/responses/` or vitest
  mocks. Never add tests that hit the network.
- Secrets: never hardcode or commit API keys. `~/.maltego-mcp/config.toml`
  references keys by env var name (`api_key_env`); keep that pattern.
- Failing tests: never weaken assertions, skip, or delete a failing test to
  get green. Fix the cause or report the failure verbatim as a blocker.
- Pushing: `git config core.hooksPath` is `hooks`, so `hooks/pre-push` runs
  content-guard (expected at `~/repos/content-guard`) against
  `policies/public-repo.json` on every push. If it flags content, fix the
  content. Never push with `--no-verify`.
- Blockers: missing venv, absent service, failing hook, anything that stops
  the task. Report the exact blocker and stop. Do not work around it
  silently.
- Public exposure: this is a public npm package (`maltego-mcp`). Use
  documentation-safe indicators in examples (`203.0.113.x`,
  `example.invalid` style), never real infrastructure details.

## Gotchas
- `npm run build:mtz` bakes the absolute `transforms/.venv` path into the
  manifest, so the `.mtz` is machine-tied. If the repo moves, rebuild it.
- `setup:transforms`, `test:transforms`, and `build:mtz` all route through
  `scripts/python-tool.mjs`: Python 3 must be on PATH, and the venv must
  exist for the latter two.
- `npm run demo:basic` builds and writes a no-network demo graph to
  `dist/maltego-mcp-basic-soc-demo.mtgx`. Keep the demo graph under 24
  entities (Maltego Basic plan limit).
- `prepublishOnly` runs typecheck, unit tests, and build. Keep all three
  green before any release work.

## Memory Handoff
At the end of any substantial task, write a handoff note to
`.claude/memory-handoffs/` using that directory's `TEMPLATE.md`. Record
durable discoveries, gotchas, and decisions. Do not wait to be reminded.
