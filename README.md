# wiki-renderer (local)

Read your Obsidian-flavoured Markdown wikis in the browser, from the folders they already live in.
It handles wikilinks, embeds, callouts, Mermaid, highlighted code, frontmatter, full-text search, save as PDF and the source view.

```bash
npm install
WIKI_DIRS="notes=~/notes/wiki" npm run dev
# open http://127.0.0.1:3000
```

Configuration is in `.env.local.example`, and the developer guide is `AGENTS.md`.

## License

MIT, see `LICENSE`. The Figtree and Lilex fonts in `src/fonts/` are under the SIL Open Font License (their `*-OFL.txt`).
