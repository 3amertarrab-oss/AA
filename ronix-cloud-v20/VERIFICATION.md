# Verification — 2026-10-25 UTC / 2026-10-26 Cairo

This package is ready for owner setup and deployment. The actual Supabase project and live website are not yet activated or verified.

| Suite | Passed | Evidence |
| --- | ---: | --- |
| PostgreSQL 17 authorization, RLS, atomic commits, concurrency, replay, private Storage policies | 18 | `tests/database-results.json` |
| Media encoding, hashing, ownership, failed upload, integrity, exact roundtrip | 6 | `node --test tests/media.test.js` |
| Real Supabase browser SDK with local mock service, laptop and iPhone contexts from 320–430 px | 33 | `tests/browser-results.json` |
| Setup generation, escaped email, project links, clipboard fallback, no email persistence | 4 | `tests/setup-results.json` |
| **Automated cloud checks** | **61** | No failed checks in these final runs |

An additional private-data check packed and restored the supplied V16 JSON: 33 projects and 12 unique embedded files. Deep equality passed for the complete original JSON, including all financial fields. The original compact snapshot was 721,222 bytes; its packed metadata was 21,006 bytes. This was an in-memory local verification only. No private records, file bytes, account email, or private screenshots are included in the public package, and this older backup is not used to seed the app.

The browser suite tests pending offline edits, reconnection, failed document uploads, quota rollback, same-tab storage changes, conflict preservation and recovery, ambiguous network failures after commit, exact decimal financial values, portable backups, account separation, sign-out, mobile navigation, every screen at compact and large iPhone widths, key input forms, and service worker caching boundaries. It uses synthetic records and two separate Chromium contexts. It does not use the real Supabase backend.

The inherited V19 presentation workflow was also rerun after selecting Banque Misr: 31 browser checks passed, including the official bank link, clear separation between the general automatic reference and the bank rate, dated manual provenance, exact converted cash, backup/restore, and late-response protection.

The setup page was tested over localhost with clipboard access deliberately unavailable to exercise manual-copy fallback. The environment blocks `file://` navigation in Chromium, so opening the setup file directly in a desktop browser has not been browser-tested here.

The existing V19 accounting suite previously passed 382 checks; those are historical offline results and are **not** counted as new cloud checks. The V19 financial core is used unchanged.

## Checks still required after owner setup

1. Run the generated SQL in the intended Supabase project and create the confirmed Auth user.
2. Publish the ZIP to HTTPS hosting and verify login using the app account.
3. Import the latest current backup once and confirm totals, project photographs, and transfer evidence.
4. On a real iPhone, log in to the same site, add to Home Screen, and verify one test edit in each direction. Remove the test records after verification.
5. Download a portable JSON backup and retain the pre-migration backup separately.

Direct network access to the user's Supabase endpoint returned a proxy tunnel restriction in this workspace. No live project status, policy behavior, account creation, or production synchronization is claimed. Provider free-plan quotas and availability continue to apply.
