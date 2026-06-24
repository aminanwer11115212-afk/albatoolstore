---
name: customer-link-skill
description: Verify and maintain the customer share link flow — every share button (invoice, quote, side-quote, return, statement-customer, statement-supplier, packaging-invoice/quote, unavailable-invoice/quote) must produce a WhatsApp link that opens a rendered preview page (not raw HTML) with Print + Download PDF buttons. Use when the user touches share links, mentions "رابط العميل", reports raw-code / sandbox / text-plain issues, or adds a new shareable document type.
---

# مهارة رابط العميل (Customer Share Link)

The customer must never see raw HTML or a code page. Every share link must open a styled preview page with Print and Download PDF buttons — the same view as the in-app preview.

## Required pipeline (do not bypass)

1. **Create token** — call `supabase/functions/create-document-share-token`
   with `{ doc_type, doc_id, ttl_hours?, hidden_sections? }`.
   - `ttl_hours` default = 24, max 24×30 (720).
   - `doc_type` must be in `ALLOWED_TYPES`:
     `invoice`, `quote`, `return`, `statement-customer`, `statement-supplier`,
     `packaging-invoice`, `packaging-quote`,
     `unavailable-invoice`, `unavailable-quote`.
   - The server returns the public share URL — **use it verbatim**, never rebuild it client-side.

2. **WhatsApp link** — final URL the customer receives MUST point to:
   `https://<supabase>/functions/v1/document-share-meta?token=<tok>&origin=<appOrigin>`
   - `document-share-meta` returns OG meta tags to bots and **302-redirects real browsers** to `<appOrigin>/share/document/<tok>` (the React `PublicDocumentSharePage`).
   - Never point WhatsApp at `/functions/v1/document-share` directly: the Supabase gateway forces sandbox CSP + `text/plain` on browser hits, which is what makes the customer see raw code.

3. **React preview page** — `src/pages/PublicDocumentSharePage.tsx` (route `/share/document/:token`):
   - Fetches HTML from `document-share` with `apikey` + `Authorization: Bearer <anon>` headers.
   - Renders the HTML in an `<iframe srcDoc>` (so the gateway content-type does not matter).
   - Toolbar has **طباعة (Print)** via `iframe.contentWindow.print()` and **تحميل PDF** via `html2pdf.js`.

4. **document-share edge function** builds the actual document HTML matching the in-app preview (header, items table, totals, account summary, notes) — keep parity with `src/utils/printTemplate.ts` and statement preview templates.

## Add a new shareable doc type — checklist

- [ ] Add the type string to `ALLOWED_TYPES` in `create-document-share-token/index.ts`.
- [ ] Handle the type in `document-share/index.ts` (build the HTML).
- [ ] Handle the type in `document-share-meta/index.ts` `docTypeLabel` + bot lookup (party name, doc number).
- [ ] Add the type to `DocType` union in `src/utils/shareDocumentWhatsApp.ts` and give it a default `docLabel`.
- [ ] Wire the share button on the relevant page/dialog to call `shareDocumentViaWhatsApp({ docType, docId, ... })`.
- [ ] Run `bunx vitest run src/test/shareDocumentWhatsApp.test.ts e2e/whatsapp-share-links.spec.ts` (or update tests).

## Verification recipe

For every share button, confirm:
1. Click → toast "loading" → WhatsApp opens.
2. Final URL host = `<supabase>/functions/v1/document-share-meta`.
3. Opening that URL in a normal browser 302-redirects to `<appOrigin>/share/document/<tok>` (check with `curl -I`).
4. The React page loads, shows Print + Download PDF, and the iframe renders the styled document (header, table, totals) — NOT raw `<html>` text.
5. Tokens older than 24h return an error page (TTL enforced in `create-document-share-token`).

Quick curl check:
```bash
curl -sI "https://<supabase>/functions/v1/document-share-meta?token=<tok>&origin=https://albatoolstore.lovable.app" \
  -H "user-agent: Mozilla/5.0" | grep -i "location\|x-share-redirect"
# expect: x-share-redirect: browser-302-app  +  location: https://albatoolstore.lovable.app/share/document/<tok>
```

## Common pitfalls

- ❌ Pointing WhatsApp at `/functions/v1/document-share` (sandbox CSP → raw code).
- ❌ Building the share URL client-side instead of using the server response.
- ❌ Forgetting to add a new doc_type to ALL FOUR files (token creator, share renderer, meta wrapper, client util).
- ❌ Allowing `origin` to be an arbitrary host — `pickAppOriginLoose` only accepts `*.lovable.app` or the env `PUBLIC_APP_URL`.
- ❌ Setting TTL > 720h — server clamps but client should pass ≤ 24 for "expires after a day".
