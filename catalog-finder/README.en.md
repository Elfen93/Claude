# Catalog Finder (English guide)

Local app to search your items in a Google Sheets/CSV, see their photos and download the "customer" Excel. Full documentation (Spanish): [README.md](README.md). Version française : [README.fr.md](README.fr.md).

## Run
`python server.py` (Windows) or `python3 server.py`. Python 3 only, nothing to install. Opens at http://127.0.0.1:8765. Pick the language (Español / English / Français) with the 🌐 selector at the top; it is remembered. Terminal messages follow `CATALOG_LANG=en|fr|es` (or your system language).

When updating: the new version closes any older copy still running by itself. If the app warns that "the program that is running is an old version", close all Catalog Finder black windows and open it again.

## The 3 steps
1. **Load your sheet**: paste the published CSV link of Google Sheets, or upload the `.csv`. The header row is detected even if the sheet has title rows above it; English, Spanish and French column names are recognised (`MARQUE`, `PRIX`, `C-tag`…).
2. **What are you looking for?** Type it like you would tell a person (English, French or Spanish): *"black wallets under 300 euros, pick 5 varied"*. Or filter by hand: price range, grade, brands, entity, text, order, only with photos.
3. **Choose**: tick cards, *Select all results*, or *the first N*. Then **Download Excel (.xlsx)**.

## 🗂 One app: Home · Search · Clients · Invoices · What's new · Entities
Everything is stored in **`catalog.db`**, a single file in the folder (not in git); copy it to back up. Settings from your browser are copied in automatically the first time.
- **🏠 Home** (opens on start). Refreshes the sheet in the background and shows:
  - New items with photos.
  - “⭐ For your clients”: new items matching each client's wishlist, with a **📦 Monthly catalog** button.
  - Invoices awaiting payment and overdue.
  - Sales per month and entity.
- **📦 Monthly catalog:** opens the search page with the client's margin, runs their wishlist, hides sold, reserved and already-sent items, and selects everything ready for their Excel.
- **👥 Clients:** one record per client, with invoice details, margin and currency (the same as the search page selector), wishlist, what they bought (with photos), catalogs sent and reservations.
- **Item status:**
  - **Sent:** every Excel downloaded with a client selected is recorded as a sent catalog; “don't repeat what was sent” skips those items.
  - **Reserved:** 🔖 on each card, for a client, with a note.
  - **Sold:** when you save an invoice.
  - “Hide sold and reserved” removes them from the search.
- **History:** each load is compared with the previous one (new, price drops, gone). If the sheet has not changed, the last news stay. With “load on open”, the saved sheet link is downloaded automatically.
- **Added date and Buyer** (optional sheet columns):
  - Buyer filter and age filter: < 1 month, > 3 months, > 6 months, > 1 year, > 2 years.
  - Sort by added date (old → new or new → old) and by Buyer.
  - Each card shows the added date and how long ago it was.
  - The assistant understands “bags older than 6 months”.
  - Date format is detected automatically; if needed, set it in *Advanced settings → Dates*.
- **Full snapshot (xlsx with several tabs):** upload the xlsx or paste its xlsx export link; several CSV links separated by spaces also work.
  - Each tab becomes a **Channel**.
  - New **Type** (Item Type) and **Owner** filters.
  - Current price = *PAT - Current* with the “Cur” column right before it; initial price = *PAT - Initial*.
  - Each card shows the markdown since listing, and you can sort by biggest markdown.
  - Rows whose currency changed but whose amount did not are flagged “⚠ doubtful currency”.
- **🧾 Invoices** (UK, JP, HK): from the search selection, a pasted CTag + price list or an Excel.
  - HK: hammer in HKD → yen, 5% commission, “Passed” when there is no price.
  - Numbering: per client for UK, sequential for JP, date and time for HK.
  - **Paid** checkbox.
  - PDF via the browser's print dialog.
- **🏢 Entities:** company, bank, legal texts and logo; `entidades.json` in the folder is imported on start.

## Assistant
- **With AI**: *Activate AI…* and paste an Anthropic API key (stored only in the `.api_key` file on your computer; or use the `ANTHROPIC_API_KEY` variable). It understands free sentences and long multi-line requests (ready-made templates in `prompts/`), and answers in your language.
- **Basic mode (no key)**: understands price ranges, brands, grades (`only BC`, `AB to B-`, `A or better`), quantity (`pick 30`), `varied`, `cheap`, and common words in the three languages.

## ✨ Create prompt with AI
Type a short idea ("fashion jewelry Dior, B+ or better, no bags") and click *✨ Create prompt with AI*. The app sends a summary of YOUR catalog (brands, grades, prices, frequent words, ~150 sample names); the AI drafts a line-by-line plan, the app tests it against your data (matches, leaks, brands that don't exist) and the AI revises it. The detailed prompt lands in the box for you to edit; *Search* runs it without another AI call while the text is unchanged. It costs 2 calls to `claude-sonnet-5-5` (change with `CATALOG_PLAN_MODEL`). Needs a key.

## Grade filter
One button per grade in your sheet, with counts. Pick one or several for exact grades (only BC, or AB + B+ + B). The *shortcut "or better"* selector ticks everything from SA down to the grade you choose.

## Currencies and margins per client
Every row can be in its own currency (CNY, JPY, EUR, GBP…) and is converted with today's rate. The **Currency** selector sets the display/export currency. Each **Client** has its own margin %, fixed fee (any currency), currency and rounding: final price = purchase price × (1 + margin %) + fixed fee.

## Download exactly what you want
- Your selection is kept while you filter. The bottom bar shows how many selected items are in the current view.
- On download, if some selected items are outside your view, it asks: *all N selected* or *only the M I can see*.
- **Split by** entity, brand, grade or price range: one tab per group in a single file, or one file per group.
- The customer Excel is always in English: `BRAND, SKU, ITEM NAME, DETAILED GRADING, GRADING (RANK), Purchase?, Buy Now Price, Picture #1…#13, 1…13`.

## Notes
- Photos are checked in parallel by the local server and cached in `.photo_cache.json`.
- Descriptions in the Excel are always written in English (the AI translates other languages).
- The server only listens on 127.0.0.1; the AI/key endpoints reject other websites.
