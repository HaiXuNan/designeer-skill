# Designeer Skill

An agent skill that turns [Designeer](https://designeer.xyz) into a searchable reference index for frontend design work.

It reads catalogue metadata and Markdown pages only. It never downloads posters, videos or Find media, and every result carries attribution to Designeer and to the original creator.

## Commands

```bash
node scripts/designeer.mjs search "fintech landing" --collection inspiration --limit 5
node scripts/designeer.mjs get resources/fontshare
node scripts/designeer.mjs palette resources/fontshare
node scripts/designeer.mjs latest --collection tools --limit 5
node scripts/designeer.mjs sync --max-pages 10
node scripts/designeer.mjs health
```

- `search` takes `--collection inspiration|resources|tools|portfolios`, `--limit 1-20`, `--live` and `--json`.
- `get` and `palette` accept a slug, a site path, or a full Designeer URL.
- `sync` builds a local metadata index for faster, lower-traffic search.
- `health` checks the live endpoints and reports schema drift.

No dependencies. Node 18 or newer.

## Install

Copy the directory into your agent's skill folder:

```bash
git clone https://github.com/HaiXuNan/designeer-skill.git ~/.agents/skills/designeer
```

For Claude Code, the same directory works under `~/.claude/skills/designeer`.

## How it behaves

- Uses the public Markdown versions and the catalogue API documented in `llms.txt`, `ai.txt` and `robots.txt`.
- Caches responses under `~/.cache/designeer/` for seven days with ETag revalidation, falling back to the system temp directory when that path is not writable. Override with `DESIGNEER_CACHE_DIR`.
- Spaces requests one second apart and retries 429/5xx with backoff.
- Caps detail fetches at five per design request, as stated in `SKILL.md`.

## Attribution

Results are cited as:

```text
Source: Designeer — <title> (<canonical URL>)
Creator / original: <creator> (<original URL>)
```

Designeer's `ai.txt` requires naming the site, linking the canonical page, and crediting the creator. It also forbids presenting its descriptions or curation as one's own work. The skill enforces those rules.

## Disclaimer

This is an unofficial client. It is not affiliated with or endorsed by Designeer or Dhruv Jaradi. Work shown on Designeer belongs to the people who made it and is shared there for inspiration only. This repository contains no catalogue content or media from the site.

## License

No license has been declared. All rights reserved by the repository owner.
