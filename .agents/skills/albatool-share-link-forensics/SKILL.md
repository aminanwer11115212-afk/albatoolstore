---
name: albatool-share-link-forensics
description: Inspect Albatool customer share-link activity by reading share_link_events and document_share_tokens — who opened which document, when, from where, and which events fired (created/viewed/printed/downloaded). Use when the user asks "هل العميل فتح الرابط؟" / "من فتح فاتورة X؟" / "اعطني تتبع الروابط".
---

# Share-Link Forensics

## Source tables

- `document_share_tokens(token, doc_type, doc_id, ttl_hours, created_at, hidden_sections)` — issued by `create-document-share-token`.
- `share_link_events(id, token, doc_type, doc_id, event, user_agent, ip, referer, meta, created_at)` — written by `log-share-event` and (for `created`) by token creation.

Events are limited to: `created`, `viewed`, `printed`, `downloaded`.

## Standard query — single document

```sql
SELECT e.event, e.created_at, e.ip, e.referer,
       substring(e.user_agent for 80) AS ua
FROM share_link_events e
WHERE e.doc_id = $1
ORDER BY e.created_at;
```

## Standard query — per customer

```sql
SELECT i.invoice_number, e.event, e.created_at, e.ip
FROM share_link_events e
JOIN invoices i ON i.id = e.doc_id
WHERE i.customer_id = $1
ORDER BY e.created_at DESC
LIMIT 200;
```

## Standard query — token funnel

```sql
SELECT t.token, t.doc_type, t.doc_id, t.created_at AS issued_at,
       MIN(CASE WHEN e.event='viewed'     THEN e.created_at END) AS first_viewed_at,
       MIN(CASE WHEN e.event='printed'    THEN e.created_at END) AS first_printed_at,
       MIN(CASE WHEN e.event='downloaded' THEN e.created_at END) AS first_downloaded_at,
       COUNT(*) FILTER (WHERE e.event='viewed') AS views
FROM document_share_tokens t
LEFT JOIN share_link_events e ON e.token = t.token
WHERE t.created_at >= now() - interval '7 days'
GROUP BY t.token, t.doc_type, t.doc_id, t.created_at
ORDER BY t.created_at DESC
LIMIT 100;
```

## Reporting format

Return an Arabic markdown table:
`الفاتورة | الحدث | التاريخ والوقت | الـ IP | المتصفح/الجهاز`.
Add a summary line: `إجمالي مرات الفتح: N | إجمالي مرات الطباعة: M | آخر فتح: …`.

## Privacy & caveats

- IPs may be empty when behind certain proxies — do not assert location.
- `user_agent` is truncated to 500 chars at insert; treat as untrusted text.
- TTL on tokens is ≤ 720h (24×30); expired tokens stop logging because `document-share-meta` won't redirect.
- A `created` event without subsequent `viewed` means the share was generated but not opened (or only the bot crawler hit `document-share-meta`).

## Hard rules

- READ-ONLY skill. Never delete or mutate `share_link_events`.
- Never expose raw `ip` columns to non-admin users; gate any UI by `has_role(auth.uid(),'admin')`.
- When building a UI, always paginate; events grow unbounded.
