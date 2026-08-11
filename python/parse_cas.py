#!/usr/bin/env python3
"""FinPilot CAS (mutual fund) statement parser sidecar.

CLI contract (shared across FinPilot sidecars):
    stdout : a single JSON document on success (exit 0)
    stderr : a human-readable message on failure (exit non-zero)

Usage:
    parse_cas.py --file <path> --password <pan+email or CAS password>
    parse_cas.py --self-test          # emit a fixed sample payload (no deps needed)

Wraps `casparser` (https://github.com/codereverser/casparser). Output shape:
    {
      "ok": true,
      "investor": {...},
      "schemes": [
        {
          "amc": str, "scheme": str, "isin": str|null, "amfi": str|null,
          "folio": str, "close_units": float, "close_value": float|null,
          "transactions": [
            {"date": "YYYY-MM-DD", "type": str, "amount": float,
             "units": float, "nav": float, "balance": float, "description": str}
          ]
        }
      ]
    }
"""
import argparse
import json
import sys


SELF_TEST_PAYLOAD = {
    "ok": True,
    "investor": {"name": "SELF TEST"},
    "schemes": [
        {
            "amc": "Test AMC",
            "scheme": "Test Flexi Cap Fund - Direct Growth",
            "isin": "INF000000000",
            "amfi": "119551",
            "folio": "12345/67",
            "close_units": 45.2,
            "close_value": None,
            "transactions": [
                {
                    "date": "2026-01-05",
                    "type": "PURCHASE_SIP",
                    "amount": 5000.0,
                    "units": 45.2,
                    "nav": 110.6,
                    "balance": 45.2,
                    "description": "SIP Purchase",
                }
            ],
        }
    ],
}


def fail(message: str, code: int = 1) -> None:
    print(message, file=sys.stderr)
    sys.exit(code)


def _txn_date(txn: dict) -> str:
    d = txn.get("date")
    return str(d)[:10] if d else ""


def normalize(data: dict) -> dict:
    """Reduce casparser's dict output to the fields FinPilot stores."""
    schemes_out = []
    for folio in data.get("folios", []):
        folio_no = folio.get("folio", "")
        amc = folio.get("amc", "")
        for scheme in folio.get("schemes", []):
            valuation = scheme.get("valuation", {}) or {}
            transactions = []
            for txn in scheme.get("transactions", []):
                transactions.append(
                    {
                        "date": _txn_date(txn),
                        "type": txn.get("type") or "",
                        "amount": txn.get("amount"),
                        "units": txn.get("units"),
                        "nav": txn.get("nav"),
                        "balance": txn.get("balance"),
                        "description": txn.get("description") or "",
                    }
                )
            schemes_out.append(
                {
                    "amc": amc,
                    "scheme": scheme.get("scheme", ""),
                    "isin": scheme.get("isin"),
                    "amfi": scheme.get("amfi"),
                    "folio": folio_no,
                    "close_units": scheme.get("close") or valuation.get("value"),
                    "close_value": valuation.get("value"),
                    "transactions": transactions,
                }
            )
    return {"ok": True, "investor": data.get("investor_info", {}), "schemes": schemes_out}


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse a CAS PDF into JSON.")
    parser.add_argument("--file")
    parser.add_argument("--password", default="")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        json.dump(SELF_TEST_PAYLOAD, sys.stdout)
        return

    if not args.file:
        fail("--file is required")

    try:
        import casparser
    except ImportError:
        fail("casparser is not installed in the sidecar environment")

    try:
        data = casparser.read_cas_pdf(args.file, args.password, output="dict")
    except Exception as exc:  # noqa: BLE001 - surface any parse/password error to the caller
        fail(f"Failed to parse CAS PDF: {exc}")

    json.dump(normalize(data), sys.stdout)


if __name__ == "__main__":
    main()
