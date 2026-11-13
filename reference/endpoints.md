# Designeer endpoints

Base: `https://designeer.xyz`

## Catalogue

`GET /api/catalog?collection=<slug>&limit=<1-20>&cursor=<nextCursor>`

`GET /api/catalog?q=<query>&collection=<slug>&limit=<1-20>`

- Collections: `inspiration`, `resources`, `tools`, `portfolios`.
- `q` alone searches every collection and returns `{ results: [...] }`.
- Collection browsing returns `{ items: [...], nextCursor }`.
- Unknown query parameters return 400; an unknown collection returns 404.
- Item shape: `id`, `kind`, `slug`, `name`, `url`, `host`, `tagline`, `category {slug, name}`, `poster`, `videoUrl`, `tileVideoUrl`, `embeddable`, `pricing`.

## Markdown

Every public page has a Markdown twin:

- `/index.md`, `/inspiration.md`, `/resources.md`, `/tools.md`, `/portfolios.md`
- `/<collection>/<slug>.md`
- `/finds/<id>.md`

HTML pages also return Markdown when sent `Accept: text/markdown`.

Detail pages carry a field table with `Collection`, `Category`, `Website`, `Pricing`, `Colours`, `Added`, and for Finds also `Creator`, `Handle`, `Original post`, `Types`, `Media`, `Posted`.

## Machine-readable

- `/llms.txt` — index of pages and purpose.
- `/llms-full.txt` — all indexed pages in one file, about 128 KB.
- `/api/md/_catalog` — every Markdown page that exists, about 89 KB.
- `/sitemap.xml` — every HTML page, about 874 URLs.
- `/ai.txt` — permissions, restrictions, attribution rules.

## Policy

- `ai.txt` allows summarising, short attributed quotes, citation, indexing and training.
- It forbids fabricated quotes, invented endorsements, and presenting Designeer's descriptions or curation as the model's own work.
- `licence.md` keeps rights with the creators and describes the catalogue as inspiration only.
- `terms.md` forbids scraping at a scale that harms the site.

## Rate and cache

- No published rate limit; the CLI self-limits to one request per second.
- Cache under `~/.cache/designeer/`, falling back to the system temp directory when that path is not writable, keyed by URL hash, with ETag revalidation and a seven-day TTL.
