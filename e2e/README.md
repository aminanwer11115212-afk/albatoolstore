# E2E Scripts (Playwright)

Run manually inside the sandbox — these are not wired to CI because they need
a Supabase session and seeded customer data.

## customer-net-balance.e2e.py

Verifies the net-balance consistency contract:
- opens `/customers`, `/customers/debt-report`, `/reports/customer-statement`
- captures screenshots to `/tmp/browser/net-balance/screenshots/`
- reads the "إجمالي الصافي المستحق" card and prints console errors

```bash
python3 e2e/customer-net-balance.e2e.py
```
