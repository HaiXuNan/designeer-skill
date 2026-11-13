---
name: designeer
description: Search Designeer (designeer.xyz), a hand-curated catalogue of design inspiration, UI resources, tools and portfolios, for real-world frontend references. Use when the user asks for landing page, hero, navbar, footer, pricing or portfolio references; wants design directions grounded in existing sites; needs a starting palette, typography or motion cue; or says a design feels generic and needs a concrete reference. Retrieves metadata and Markdown only, never media, and always attributes Designeer and the original creator.
---

# Designeer

Use Designeer as a **reference index**, not a material library. It tells you what exists and where it lives; the work itself belongs to its creator.

## Hard rules

- Always cite `Designeer — <title> (<canonical URL>)`, and add the creator plus original URL when the page provides them.
- Never download, copy, re-host or bundle posters, videos or Find media. The CLI never touches `cdn.designeer.xyz`.
- Never present Designeer's descriptions or curation as your own findings.
- Never quote more than 25 words from a page.
- Never mirror the catalogue or bulk-crawl. Keep detail fetches to five per request and let the CLI handle caching and rate limiting.
- If the user asks to reproduce a design exactly, deliver the underlying principles and point to the original, not a clone.

## Commands

Run from the skill directory:

```bash
node scripts/designeer.mjs search "fintech landing" --collection inspiration --limit 5
node scripts/designeer.mjs get resources/fontshare --json
node scripts/designeer.mjs palette resources/fontshare
node scripts/designeer.mjs latest --collection resources --limit 5
node scripts/designeer.mjs sync
node scripts/designeer.mjs health
```

`search` accepts `--collection inspiration|resources|tools|portfolios`, `--limit 1-20`, `--live` to bypass the local index, and `--json`.
`get` and `palette` accept a slug, a site path, or a full Designeer URL.

The CLI caches responses under `~/.cache/designeer/` for seven days, falls back to the system temp directory when that path is not writable, revalidates with ETags, spaces requests one second apart, and retries 429/5xx with backoff. Override the location with `DESIGNEER_CACHE_DIR`.

## Workflow

1. Turn the brief into two or three design axes: mood, information density, motion, type personality, colour temperature.
2. Search metadata first. Judge by name, tagline, category and collection; do not fetch details yet.
3. Fetch at most five candidates. Extract the palette, category, website and original creator from the Markdown.
4. Write one reference card per candidate, with attribution.
5. Synthesise two original directions. Each one states what principle was borrowed, not which pixels were copied.
6. Implement, then check the result against the direction instead of against the reference screenshot.

## Reference card

```text
Reference: <title>
Why it fits: <one line tied to the brief>
Palette: <hex list>
Source: Designeer — <title> (<canonical URL>)
Creator / original: <creator> (<original URL>)
```

## Design direction

```text
Direction <n>: <name>
Thesis: <one sentence>
Type: <family or pairing>, <scale notes>
Colour: <3-5 tokens with roles>
Layout: <grid, density, edge treatment>
Motion: <one or two moments, with duration and easing intent>
Borrowed principle: <what, from which reference>
Deliberately different: <what you are not copying>
```

## Failure modes

- A search returns nothing: try a broader noun, switch collection, or use `latest`.
- The site changes shape: run `health`. If it reports a schema mismatch, fall back to `get index` and `llms.txt`, and report the drift instead of guessing.
- A page is gone: Designeer is a live catalogue, so drop the reference rather than reconstructing it from memory.
