# VaultOP MCP server

Exposes VaultOP's pipeline as MCP tools so MCP-capable agents (Claude Desktop, Claude
Code, etc.) can drive the **same encrypted vault** the desktop app uses. It shells out to
the installed VaultOP binary in `--cli` mode, so the mandatory blur-review gate is enforced
for agents exactly as in the GUI.

## Tools

`vaultop_status`, `vaultop_ingest`, `vaultop_assets`, `vaultop_segments`, `vaultop_search`,
`vaultop_similar`, `vaultop_teaser`, `vaultop_compile`, `vaultop_review`, `vaultop_mask`,
`vaultop_approve`, `vaultop_reject`, `vaultop_export`, `vaultop_variants`, `vaultop_jobs`.

## Setup

Requires Node 20+ and `@modelcontextprotocol/sdk` (a dev dependency of this repo — run
`npm install` in the repo). Point `VAULTOP_BIN` at the installed app binary:

- **macOS:** `/Applications/VaultOP.app/Contents/MacOS/VaultOP`
- **Windows:** `%LOCALAPPDATA%\Programs\VaultOP\VaultOP.exe`

## Register (Claude Desktop)

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vaultop": {
      "command": "node",
      "args": ["/absolute/path/to/VaultOP/mcp/server.mjs"],
      "env": { "VAULTOP_BIN": "/Applications/VaultOP.app/Contents/MacOS/VaultOP" }
    }
  }
}
```

## Register (Claude Code)

```bash
claude mcp add vaultop \
  --env VAULTOP_BIN=/Applications/VaultOP.app/Contents/MacOS/VaultOP \
  -- node /absolute/path/to/VaultOP/mcp/server.mjs
```

## Notes

- The server operates on the user's real vault (`userData/vault`) via the OS-keychain key,
  so agent actions and the GUI stay in sync.
- `export` of a platform-bound teaser fails until it has been `approve`d — agents cannot
  ship unreviewed cuts.
- Run the GUI and an agent at the same time freely: job claims are atomic, so work is never
  double-processed.
