# RONIX V20 cloud edition

Adds a shared, authenticated account to the existing V19 project-finance application. The accounting engine, customer directory, short display numbers, whole-pound presentation, FX entry, claims, project photographs, and receipt/payment evidence remain available. Laptop and iPhone use the same authenticated account; this release adds a responsive navigation drawer and an installable web app shell.

**Deployment status:** packaged and locally tested; the user's Supabase schema, Auth user, and web deployment have not been activated from this workspace. The environment's network proxy rejects access to the project endpoint, so production access and cross-device operation still require verification after setup. No real Safari/iPhone test has been performed; browser tests use Chromium with a 390 × 844 mobile viewport.

## Installation

1. Export the latest JSON backup from the existing offline app. Do not seed a live account from an older uploaded backup.
2. Open `RONIX_Setup.html` from `RONIX-Setup.zip`, or `dist/setup.html`. Enter the intended owner email locally, copy the generated SQL, and run it in the linked Supabase SQL editor. The email is appended locally and is not included in this repository.
3. In Authentication → Users → Add user → Create new user, create the app user using that email and a password; auto-confirm the user. A Supabase dashboard login is not an app Auth user. Google OAuth is not configured in this release.
4. Upload `RONIX-Cloud-V20.zip` with Cloudflare Pages Direct Upload. The ZIP has `index.html` at its root. Do not run the cloud app from `file://`.
5. Open the resulting HTTPS site on the laptop, log in, import the latest backup once, and wait for synchronization to finish. Open the same site and account on iPhone in Safari; Share → Add to Home Screen.

The setup page works as a local file and includes clipboard fallback. The application requires HTTPS or localhost. Only the project URL and **publishable** key are included in `config.js`. Never add a secret/service-role key, database password, owner email, or accounting backup to this public repository. Free plans are subject to the providers' limits and availability; this package does not activate billing or guarantee unlimited free hosting.

## Data and synchronization

- Each Auth user owns one JSONB ledger. An explicit email allowlist, row-level security, and private Storage policies restrict access. A second account does not share the first account's ledger.
- Writes use a revision compare-and-swap under a per-owner transaction lock. Durable mutation IDs make retries idempotent, including a lost HTTP response after a successful commit. Direct ledger writes are denied to client roles.
- One operation may be pending per browser at a time. An atomic local envelope is saved before upload; evidence is uploaded before the new ledger references are committed. Failed local storage writes leave the previous state intact. A pending offline operation resumes when connectivity returns.
- Another device's revision is checked every 15 seconds while visible, on returning to the tab, and through the refresh button. An open input form is preserved. A stale save retains the local edit and displays a conflict instead of overwriting the server.
- Conflict resolution archives the local version in IndexedDB before loading the server version. Recovery copies can be downloaded and reviewed; they are not merged automatically. They remain local to that browser, filtered by account. Download them before clearing browser data or changing devices.
- Photos and transfer evidence use content-hashed private PNG/JPEG/WebP/PDF objects, with a 5 MiB per-file limit and integrity checks on download. No public document URLs are generated. Existing objects cannot be overwritten or deleted through the app role; unused uploads may therefore need an administrator's later retention review.
- Local working copies still contain embedded evidence and are subject to browser storage quotas. A quota error rejects the new operation before upload. This is appropriate for a small single-owner ledger, not an unlimited document archive or a multi-user ERP.
- Backups hydrate all embedded cloud documents and keep data schema **19**, so V20 JSON can be imported by offline V19. App version and data schema version are intentionally different. Download a backup after each work session.
- Exchange-rate forms link to Banque Misr's official rates page. A manually entered rate is dated and recorded as `Banque Misr (manual)`. The automatic button remains a general public reference for comparison and is explicitly labelled as such; use the bank's actual buy/sell execution rate for accounting.
- The service worker caches only the app shell, never Auth/REST/Storage responses. An already logged-in account can reopen its cached local copy offline. Login requires connectivity.

## Build and validation

```sh
python ronix-cloud-v20/build.py
node --test ronix-cloud-v20/tests/media.test.js
python ronix-cloud-v20/tests/browser.py
python ronix-cloud-v20/tests/setup.py
```

The build wraps `ronix-manager-v14/dist/RONIX_Manager.html` without changing the offline edition. Supabase JS 2.118.0 is vendored with its MIT license; repeat builds require no package downloads. Existing fflate licensing is included in the deployment ZIP. The logo is the existing transparent asset.

`tests/database.py` uses a disposable PostgreSQL 17 Docker container named `ronix-v20-test-db`. Its bootstrap simulates Supabase Auth claims, client roles, and Storage metadata. Run it only on a fresh disposable test database; see the script for container credentials. It does not connect to the user's project. `tests/browser.py` uses the real bundled Supabase client against a deterministic local Auth/REST/Storage service and synthetic financial records. Private screenshots are ignored by Git.

Results are recorded in `tests/*-results.json` and `VERIFICATION.md`. They do not substitute for checking the deployed Supabase policies, login, document upload, and two-device synchronization after activation.
