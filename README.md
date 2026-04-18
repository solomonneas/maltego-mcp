# maltego-mcp

MCP server that lets Claude author Maltego `.mtgx` graph files and run primitive OSINT lookups (whois / DNS / ASN / crt.sh). Graphs land on disk and you open them in Maltego Desktop.

## Requirements

- Node.js 20+
- Maltego Graph Desktop installed (Basic, Pro, or Enterprise)

## Install

```bash
git clone git@github.com:solomonneas/maltego-mcp.git
cd maltego-mcp
npm install
npm run build
```

## Register with Claude Code

```bash
claude mcp add maltego -- node /absolute/path/to/maltego-mcp/dist/index.js
```

## Register with Claude Desktop

Add to `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "maltego": {
      "command": "node",
      "args": ["C:\\Users\\srnea\\repos\\maltego-mcp\\dist\\index.js"]
    }
  }
}
```

Restart Claude Desktop. The `maltego_*` tools should appear.

## Environment variables

- `MALTEGO_MCP_OUTPUT_DIR` - default output directory for `.mtgx` files (default: `~/MaltegoGraphs`)
- `MALTEGO_MCP_LOOKUP_TIMEOUT_MS` - per-lookup timeout in ms (default: `30000`). Currently applied to `crt.sh` only; `whois`, `dns`, and `asn` use their underlying library defaults. Broader timeout plumbing is a known enhancement.

## Tools

**Graph authoring**
- `maltego_create_graph(name)` - returns graphId
- `maltego_add_entity(graphId, type, value, properties?, notes?)` - returns entityId
- `maltego_add_link(graphId, from, to, label?, properties?)` - returns linkId
- `maltego_save_graph(graphId, path, overwrite?)` - writes `.mtgx`
- `maltego_load_graph(path)` - parses existing `.mtgx` into a new handle

**Primitive lookups**
- `maltego_whois(domain)` - registrar, nameservers, dates
- `maltego_dns(domain)` - A/AAAA/MX/NS/TXT
- `maltego_asn(ip)` - Team Cymru ASN, prefix, country, org
- `maltego_crtsh(domain)` - certificate transparency entries

**Convenience**
- `maltego_expand_ip(ip, outputPath)` - IP + ASN + netblock, saved as `.mtgx`
- `maltego_expand_domain(domain, outputPath)` - domain + whois + DNS + ASN per A record
- `maltego_expand_hash(hash, outputPath, algorithm?)` - hash entity (extend in later versions)

## Entity types

Standard Maltego ontology: `IPv4Address`, `IPv6Address`, `Domain`, `URL`, `Hash`, `EmailAddress`, `Netblock`, `AS`, `Website`, `Company`, `Person`. For concepts without a standard type, use `Phrase` with a category prefix (`[T1566] Phishing`, `[TheHive] Case #42`).

## Composing with other MCPs

maltego-mcp does not embed third-party threat-intel clients. For MISP events, ATT&CK techniques, Cortex reports, etc., call the dedicated MCPs (`misp-mcp`, `mitre-mcp`, `cortex-mcp`, etc.) and pipe the results into `maltego_add_entity` / `maltego_add_link`.

## Development

```bash
npm test              # unit tests
npm run test:integration
npm run test:all
npm run typecheck
```

See `docs/superpowers/specs/` for design notes and `docs/superpowers/plans/` for implementation history.
