# VaultOP for agents

VaultOP exposes its whole pipeline headlessly so **AI agents and scripts** can drive it,
sharing the **same encrypted vault** the desktop GUI uses. Two interfaces:

1. **CLI** — `VaultOP --cli <command>` (JSON in/out). The foundation.
2. **MCP server** — `mcp/server.mjs` wraps the CLI as MCP tools for MCP-capable agents.

Both run against the user's real vault (`app.getPath('userData')/vault`) with the OS-keychain
master key, so anything an agent does shows up in the GUI and vice-versa.

## CLI

```
VaultOP --cli <command> [positionals] [--flags]
```
- macOS (installed): `/Applications/VaultOP.app/Contents/MacOS/VaultOP --cli ...`
- Windows (installed): `"%LOCALAPPDATA%\Programs\VaultOP\VaultOP.exe" --cli ...`
- From source: `npx electron . --cli ...` (after `npm run build && npm run rebuild:electron`)
- Or use the wrapper: `bin/vaultop <command>`

Every command prints **one JSON object** to stdout and exits `0` (ok) or `1` (error):
`{ "ok": true, ... }` or `{ "ok": false, "error": "..." }`. Logs go to stderr.

### Commands

| Command | Result |
|---|---|
| `status` | counts of assets / variants / jobs |
| `ingest <file...> [--no-wait]` | encrypt + analyze footage; waits until `ready` by default |
| `assets` | list assets |
| `segments <assetId>` | list an asset's scene segments |
| `search <query...>` | text search across tags + transcripts |
| `similar <segmentId>` | visual-similarity search |
| `teaser <assetId> [--no-wait]` | render a 30s vertical teaser (**enters the review gate**) |
| `compile <id,id,...> [--aspect widescreen\|vertical\|square] [--no-wait]` | stitch a compilation |
| `review <variantId>` | review state + current masks + whether a detector model is installed |
| `mask <variantId> <x,y,w,h> [more...]` | set blur masks (normalized 0..1) |
| `approve <variantId>` | re-blur with masks **and** approve → unlocks export |
| `reject <variantId>` | reject the review |
| `export <variantId> <dest.mp4>` | export — **blocked unless the variant is approved** |
| `variants` / `jobs` | list deliverables / recent jobs |

### The safety gate is enforced for agents

Teasers are platform-bound: `export` returns
`{"ok":false,"error":"blocked: this teaser must be reviewed and approved before export"}`
until a human/agent has explicitly `approve`d. An agent **cannot** auto-ship an unreviewed
cut — approval is the deliberate, audited step. (With no detector model installed,
`review` reports `detectorAvailable:false`, meaning nothing is auto-cleared.)

### Example agent workflow

```bash
V=bin/vaultop
$V ingest ./shoot.mov                       # → {"ok":true,"added":[{"assetId":"A",...,"status":"ready"}]}
$V segments A                               # → segment ids + tags
$V teaser A                                 # → {"ok":true,"variant":{"id":"V","reviewState":"pending",...}}
$V review V                                 # inspect the frame regions a human must verify
$V mask V 0.30,0.55,0.40,0.30               # mark a region to blur
$V approve V                                # re-blur + approve
$V export V ./out/teaser.mp4                # now allowed
```

## MCP server

`mcp/server.mjs` is a stdio MCP server that exposes the CLI commands as tools
(`vaultop_status`, `vaultop_ingest`, `vaultop_search`, `vaultop_teaser`,
`vaultop_review`, `vaultop_mask`, `vaultop_approve`, `vaultop_export`, …). It shells out
to the VaultOP binary, so set `VAULTOP_BIN` to its path. See `mcp/README.md` for client
registration (Claude Desktop / Claude Code).
