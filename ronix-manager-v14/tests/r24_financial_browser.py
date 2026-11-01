"""V24 end-to-end finance, foreign-currency claim, and iPhone layout checks."""
import json
import os
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "private-test-artifacts" / "r24-financial"
RESULT = ROOT / "tests" / "r24-financial-browser-results.json"
checks = []


def check(name, value):
    assert value, name
    checks.append(name)
    print("PASS:", name)


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


pixel = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="
)

# One customer has two contracts in two currencies.  Both claims are settled,
# so the period needs no closing rate and can be genuinely ready to close.
fixture = {
    "accountingSettings": {
        "baseCurrency": "EGP",
        "defaultCashAccountId": "1100",
        "openingComplete": True,
    },
    "projects": [
        {
            "code": "SAR1",
            "name": "واجهة الرياض",
            "client": "عميل الاختبار",
            "contractCurrency": "SAR",
            "contractRate": 13,
            "originalContract": 200,
            "contract": 2600,
            "contractItems": [
                {
                    "id": "I-SAR",
                    "description": "تصميم واجهة",
                    "unit": "م²",
                    "quantity": 2,
                    "unitPrice": 100,
                    "amount": 200,
                }
            ],
            "coverId": "PHOTO-SAR",
            "photos": [
                {"id": "PHOTO-SAR", "name": "واجهة.png", "src": pixel}
            ],
        },
        {
            "code": "EGP1",
            "name": "تنسيق الموقع",
            "client": "عميل الاختبار",
            "contractCurrency": "EGP",
            "contractRate": 1,
            "originalContract": 7500,
            "contract": 7500,
            "contractItems": [
                {
                    "id": "I-EGP",
                    "description": "مراجعة الموقع",
                    "unit": "عدد",
                    "quantity": 1,
                    "unitPrice": 7500,
                    "amount": 7500,
                }
            ],
            "photos": [],
        },
    ],
    "assignments": [],
    "payments": [],
    "claims": [
        {
            "id": "CL-R24",
            "client": "عميل الاختبار",
            "date": "2026-01-10",
            "due": "2026-01-31",
            "status": "معتمدة",
            "displayCurrency": "both",
            "total": 1800,
            "accountingTotal": 1800,
            "projectRows": [
                {
                    "code": "SAR1",
                    "currency": "SAR",
                    "originalAmount": 100,
                    "claimRate": 13,
                    "rateDate": "2026-01-10",
                    "rateSource": "contract",
                    "rateConfirmed": True,
                    "amount": 1300,
                    "accountingAmount": 1300,
                    "items": [
                        {
                            "description": "تصميم واجهة",
                            "unit": "م²",
                            "quantity": 2,
                            "originalUnitPrice": 50,
                            "originalAmount": 100,
                            "unitPrice": 650,
                            "amount": 1300,
                            "accountingUnitPrice": 650,
                            "accountingAmount": 1300,
                            "contractItemId": "I-SAR",
                        }
                    ],
                },
                {
                    "code": "EGP1",
                    "currency": "EGP",
                    "originalAmount": 500,
                    "claimRate": 1,
                    "rateDate": "2026-01-10",
                    "rateSource": "contract",
                    "rateConfirmed": True,
                    "amount": 500,
                    "accountingAmount": 500,
                    "items": [
                        {
                            "description": "مراجعة الموقع",
                            "unit": "عدد",
                            "quantity": 1,
                            "originalUnitPrice": 500,
                            "originalAmount": 500,
                            "unitPrice": 500,
                            "amount": 500,
                            "accountingUnitPrice": 500,
                            "accountingAmount": 500,
                            "contractItemId": "I-EGP",
                        }
                    ],
                },
            ],
            "items": [
                {"desc": "واجهة الرياض", "amount": 1300},
                {"desc": "تنسيق الموقع", "amount": 500},
            ],
        }
    ],
    "clientReceipts": [
        {
            "id": "R-SAR",
            "batchId": "RC-SAR",
            "client": "عميل الاختبار",
            "code": "SAR1",
            "date": "2026-02-01",
            "amount": 1300,
            "cashAmount": 1350,
            "projectAmount": 100,
            "projectCurrency": "SAR",
            "bookRate": 13,
            "projectSettlementRate": 13.5,
            "settlementRateAsOf": "2026-02-01",
            "settlementRateSource": "manual",
            "incomingCurrency": "SAR",
            "receiptOriginal": 100,
            "receiptRate": 13.5,
            "receiptTotal": 100,
            "method": "تحويل بنكي",
        },
        {
            "id": "R-EGP",
            "batchId": "RC-EGP",
            "client": "عميل الاختبار",
            "code": "EGP1",
            "date": "2026-02-02",
            "amount": 500,
            "cashAmount": 500,
            "projectAmount": 500,
            "projectCurrency": "EGP",
            "bookRate": 1,
            "projectSettlementRate": 1,
            "settlementRateAsOf": "2026-02-02",
            "settlementRateSource": "manual",
            "incomingCurrency": "EGP",
            "receiptOriginal": 500,
            "receiptRate": 1,
            "receiptTotal": 500,
            "method": "تحويل بنكي",
        },
    ],
    "advances": [],
    "claimSettlements": [
        {
            "claimId": "CL-R24",
            "receiptId": "R-SAR",
            "code": "SAR1",
            "amount": 1300,
        },
        {
            "claimId": "CL-R24",
            "receiptId": "R-EGP",
            "code": "EGP1",
            "amount": 500,
        },
    ],
    "projectExpenses": [],
    "manualJournals": [],
    "laborEntries": [],
    "generalExpenses": [],
}


server = ThreadingHTTPServer(
    ("127.0.0.1", 0), partial(Quiet, directory=str(ROOT / "dist"))
)
threading.Thread(target=server.serve_forever, daemon=True).start()

try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"),
            args=["--no-sandbox"],
        )
        context = browser.new_context(viewport={"width": 390, "height": 844})
        context.add_init_script("window.print=()=>{}")
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(
            f"http://127.0.0.1:{server.server_port}/RONIX_Manager.html",
            wait_until="domcontentloaded",
        )
        page.evaluate(
            """value => {
                data=R14.normalize(value);
                if(typeof R18Clients!=='undefined') data=R18Clients.sync(data);
                r24FinancialFrom='2026-01-01';
                r24FinancialTo='2026-12-31';
                go('financialStatements');
                window.scrollTo(0,0);
            }""",
            fixture,
        )
        page.wait_for_timeout(500)

        check(
            "financial workspace opens on the dedicated route",
            page.evaluate("page==='financialStatements'")
            and page.locator(".r24-fin-head h2").inner_text()
            == "ملخص الشركة المالي",
        )
        check(
            "owner view shows plain financial cards and keeps accountant details closed",
            page.locator(".r24-owner-summary").count() == 1
            and all(
                title in page.locator(".r24-owner-summary").inner_text()
                for title in [
                    "النقد المتاح في نهاية الفترة",
                    "دخل المشاريع",
                    "التكاليف والمصروفات",
                    "الربح",
                    "ما تملكه الشركة",
                    "ما على الشركة",
                ]
            )
            and not page.locator(".r24-fin-advanced").evaluate("el=>el.open"),
        )
        report = page.evaluate(
            """() => {
                const r=r24FinancialReport();
                return {
                    ready:r.ready,
                    issues:r.issues,
                    trial:r.trialBalance.balanced,
                    position:r.balanceSheet.balanced,
                    cash:r.cashFlow.reconciled,
                    revenue:r.incomeStatement.projectRevenue,
                    fxGain:r.incomeStatement.fxGain,
                    closingCash:r.cashFlow.closingCash
                }
            }"""
        )
        check(
            "confirmed multi-currency records are ready without review blockers",
            report["ready"] and report["issues"] == [],
        )
        check(
            "trial balance, position, and cash flow reconcile",
            report["trial"] and report["position"] and report["cash"],
        )
        check(
            "foreign settlement records the actual EGP cash and realized FX gain",
            report["revenue"] == 1800
            and report["fxGain"] == 50
            and report["closingCash"] == 1850,
        )
        page.locator(".r24-fin-advanced").evaluate("el=>el.open=true")
        headings = page.locator(".r24-fin-section h2").all_inner_texts()
        check(
            "all four closing statements render",
            all(
                title in headings
                for title in [
                    "ميزان المراجعة",
                    "قائمة الدخل",
                    "قائمة المركز المالي",
                    "قائمة التدفقات النقدية",
                ]
            ),
        )
        check(
            "financial statements fit an iPhone viewport without body overflow",
            page.evaluate(
                "document.documentElement.scrollWidth<=document.documentElement.clientWidth"
            ),
        )
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(ARTIFACTS / "statements-iphone.png"), full_page=True)

        page.evaluate("openClaim(null,r14Encode('CL-R24'))")
        page.locator(".overlay.open .modal").wait_for()
        page.wait_for_timeout(250)
        check(
            "claim editor keeps both projects in one customer claim",
            page.locator("[data-claim-row]").count() == 2,
        )
        check(
            "claim line items expose unit, quantity, price, and calculated total",
            page.locator('[aria-label="وحدة بند المطالبة"]').count() == 2
            and page.locator('[aria-label="كمية المطالبة"]').count() == 2
            and page.locator('[aria-label="سعر وحدة المطالبة"]').count() == 2
            and page.locator('[aria-label="قيمة المطالبة للمشروع"]').count() == 2,
        )
        check(
            "contract and EGP display option remains selected",
            page.locator("#claimDisplayCurrency").input_value() == "both",
        )
        check(
            "project image is visible beside its claim project",
            page.locator('.r14-claim-photo img[alt="صورة SAR1"]').count() == 1,
        )
        modal_geometry = page.locator(".overlay.open .modal").evaluate(
            """el => {
                const r=el.getBoundingClientRect();
                return {left:r.left,right:r.right,width:r.width,viewport:innerWidth,
                        body:document.documentElement.scrollWidth,
                        client:document.documentElement.clientWidth}
            }"""
        )
        check(
            "claim editor modal stays inside the 390px iPhone viewport",
            modal_geometry["left"] >= -1
            and modal_geometry["right"] <= modal_geometry["viewport"] + 1
            and modal_geometry["body"] <= modal_geometry["client"],
        )
        page.screenshot(path=str(ARTIFACTS / "claim-editor-iphone.png"), full_page=True)

        page.evaluate("closeModal()")
        with page.expect_popup() as popup_info:
            page.evaluate("printClaim(r14Encode('CL-R24'))")
        printed = popup_info.value
        printed.wait_for_load_state("domcontentloaded")
        printed_text = printed.locator("body").inner_text()
        check(
            "printed claim identifies both currencies and the frozen issue rate",
            all(value in printed_text for value in ["SAR1", "واجهة الرياض", "EGP1", "تنسيق الموقع"])
            and "1 SAR = 13" in printed_text
            and "ج.م" in printed_text,
        )
        check(
            "printed claim includes unit quantity price and project image",
            all(title in printed_text for title in ["الوحدة", "الكمية", "سعر الوحدة"])
            and printed.locator("td.photo img").count() == 1,
        )
        printed.close()

        check("finance and claim flows have no script exceptions", not errors)
        result = {"passed": len(checks), "checks": checks, "errors": errors}
        RESULT.write_text(json.dumps(result, ensure_ascii=False, indent=2))
        browser.close()
finally:
    server.shutdown()
