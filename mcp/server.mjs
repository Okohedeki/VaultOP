#!/usr/bin/env node
// VaultOP MCP server — exposes the headless CLI as MCP tools so any MCP-capable
// agent (Claude Desktop, Claude Code, etc.) can drive the vault. It shells out to
// the VaultOP binary in `--cli` mode, so it operates on the user's real, encrypted
// vault — and the mandatory blur-review gate is enforced exactly as in the CLI.
//
// Set VAULTOP_BIN to the app binary, e.g.:
//   macOS:   /Applications/VaultOP.app/Contents/MacOS/VaultOP
//   Windows: %LOCALAPPDATA%\Programs\VaultOP\VaultOP.exe
// or point it at a dev build via a wrapper. See mcp/README.md.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { spawnSync } from 'node:child_process'

const BIN = process.env.VAULTOP_BIN

function cli(args) {
  if (!BIN) return { ok: false, error: 'VAULTOP_BIN is not set to the VaultOP app binary path' }
  const r = spawnSync(BIN, ['--cli', ...args], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
  if (r.error) return { ok: false, error: String(r.error.message || r.error) }
  const lines = (r.stdout || '').trim().split('\n').filter(Boolean)
  try {
    return JSON.parse(lines[lines.length - 1])
  } catch {
    return { ok: false, error: (r.stderr || 'no JSON output from CLI').slice(-500) }
  }
}

const reply = (result) => ({
  content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  isError: result && result.ok === false,
})

const server = new McpServer({ name: 'vaultop', version: '0.2.1' })

const tool = (name, description, shape, toArgs) =>
  server.registerTool(name, { description, inputSchema: shape }, async (args) => reply(cli(toArgs(args || {}))))

tool('vaultop_status', 'Vault summary: asset/variant/job counts.', {}, () => ['status'])
tool('vaultop_ingest', 'Add footage to the vault (encrypts + scene-splits + tags). Waits until analyzed.',
  { paths: z.array(z.string()).min(1).describe('absolute file paths to ingest') },
  ({ paths }) => ['ingest', ...paths])
tool('vaultop_assets', 'List all assets in the vault.', {}, () => ['assets'])
tool('vaultop_segments', "List an asset's scene segments.",
  { assetId: z.string() }, ({ assetId }) => ['segments', assetId])
tool('vaultop_search', 'Text search across tags and transcripts.',
  { query: z.string() }, ({ query }) => ['search', query])
tool('vaultop_similar', 'Find visually similar segments to a given segment.',
  { segmentId: z.string() }, ({ segmentId }) => ['similar', segmentId])
tool('vaultop_sections', "List a clip's Sections (creator-defined tagged ranges; seeded from Scenes on first call).",
  { assetId: z.string() }, ({ assetId }) => ['sections', assetId])
tool('vaultop_section_new', 'Create a Section (a tagged time range) on a clip.',
  { assetId: z.string(), startMs: z.number().int(), endMs: z.number().int(), label: z.string().optional() },
  ({ assetId, startMs, endMs, label }) =>
    ['section-new', assetId, String(startMs), String(endMs), ...(label ? ['--label', label] : [])])
tool('vaultop_section_tag', 'Add a tag to a Section.',
  { sectionId: z.string(), value: z.string() }, ({ sectionId, value }) => ['section-tag', sectionId, value])
tool('vaultop_section_untag', 'Remove a tag from a Section.',
  { sectionId: z.string(), value: z.string() }, ({ sectionId, value }) => ['section-untag', sectionId, value])
tool('vaultop_sections_by_tag', 'Find Sections by tag — across the whole library, or scoped to one clip.',
  { value: z.string(), assetId: z.string().optional() },
  ({ value, assetId }) => ['by-tag', value, ...(assetId ? ['--asset', assetId] : [])])
tool('vaultop_cut', 'Render a Cut from an ordered list of Section ids (the Builder, headless). A Cut has no platform gate.',
  { sectionIds: z.array(z.string()).min(1), aspect: z.enum(['vertical', 'square', 'widescreen']).optional(), captions: z.boolean().optional() },
  ({ sectionIds, aspect, captions }) =>
    ['cut', sectionIds.join(','), ...(aspect ? ['--aspect', aspect] : []), ...(captions ? ['--captions'] : [])])
tool('vaultop_promos', 'Turn a Cut into platform-bound Promos (reframed + length-capped). Each enters the mandatory blur gate.',
  { cutVariantId: z.string(), platforms: z.array(z.enum(['tiktok', 'reels', 'feed', 'youtube', 'reddit'])).min(1) },
  ({ cutVariantId, platforms }) => ['promos', cutVariantId, platforms.join(',')])
tool('vaultop_teaser', 'Render a 30s vertical teaser from an asset. Enters the mandatory review gate.',
  { assetId: z.string() }, ({ assetId }) => ['teaser', assetId])
tool('vaultop_compile', 'Stitch a compilation from segment ids.',
  { segmentIds: z.array(z.string()).min(1), aspect: z.enum(['widescreen', 'vertical', 'square']).optional() },
  ({ segmentIds, aspect }) => ['compile', segmentIds.join(','), ...(aspect ? ['--aspect', aspect] : [])])
tool('vaultop_fanout', 'One master → the full deliverable set (vertical+square teasers, preview GIF, paid cut).',
  { assetId: z.string() }, ({ assetId }) => ['fanout', assetId])
tool('vaultop_watermark', 'Export an approved cut with a per-fan forensic watermark (leak tracking).',
  { variantId: z.string(), fanLabel: z.string(), dest: z.string() },
  ({ variantId, fanLabel, dest }) => ['watermark', variantId, fanLabel, dest])
tool('vaultop_review', 'Get a variant’s review state, masks, and whether a detector model is installed.',
  { variantId: z.string() }, ({ variantId }) => ['review', variantId])
tool('vaultop_mask', 'Set blur masks (normalized 0..1 boxes "x,y,w,h") on a variant before approval.',
  { variantId: z.string(), boxes: z.array(z.string()).min(1).describe('e.g. ["0.3,0.5,0.4,0.3"]') },
  ({ variantId, boxes }) => ['mask', variantId, ...boxes])
tool('vaultop_approve', 'Re-blur with masks and APPROVE the variant (unlocks export). The audited human gate.',
  { variantId: z.string() }, ({ variantId }) => ['approve', variantId])
tool('vaultop_reject', 'Reject a variant’s review.',
  { variantId: z.string() }, ({ variantId }) => ['reject', variantId])
tool('vaultop_export', 'Export a variant to a path. Blocked unless the variant is approved.',
  { variantId: z.string(), dest: z.string() }, ({ variantId, dest }) => ['export', variantId, dest])
tool('vaultop_variants', 'List deliverables (variants).', {}, () => ['variants'])
tool('vaultop_jobs', 'List recent processing jobs.', {}, () => ['jobs'])

await server.connect(new StdioServerTransport())
