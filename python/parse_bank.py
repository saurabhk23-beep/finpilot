#!/usr/bin/env python3
"""FinPilot bank statement PDF parser sidecar.

CLI contract (shared across FinPilot sidecars):
    stdout : a single JSON document on success (exit 0)
    stderr : a human-readable message on failure (exit non-zero)

Usage:
    parse_bank.py --file <path> --bank <icici|hdfc|sbi>
    parse_bank.py --self-test

Bank PDF layouts vary and change often, so this is best-effort: it extracts the
PDF text (via pypdfium2, which ships with casparser) and applies a generic
line parser for `<date> <narration> <amount> [<balance>]` rows. When it can't
extract usable rows it fails cleanly so the app can fall back to CSV import
(matching the HLD "template-based with CSV fallback" risk mitigation).

Output shape:
    {
      "ok": true,
      "bank": "icici",
      "account_number": str|null,
      "transactions": [
        {"date": "YYYY-MM-DD", "narration": str, "amount": float,
         "type": "debit"|"credit", "balance": float|null}
      ]
    }
"""
import argparse
import json
import re
import sys


SELF_TEST_PAYLOAD = {
    "ok": True,
    "bank": "selftest",
    "account_number": "4321",
    "transactions": [
        {"date": "2026-07-01", "narration": "UPI-SWIGGY", "amount": 450.0, "type": "debit", "balance": 49550.0},
        {"date": "2026-07-02", "narration": "SALARY ACME CORP", "amount": 150000.0, "type": "credit", "balance": 199550.0},
    ],
}

DATE_RE = re.compile(r"\b(\d{1,2}[-/](?:\d{1,2}|[A-Za-z]{3})[-/]\d{2,4})\b")
AMOUNT_RE = re.compile(r"[-]?[\d,]+\.\d{2}")
ACCOUNT_RE = re.compile(r"a(?:ccount|/c)\s*(?:no|number|#)?\.?\s*[:\-]?\s*([xX*\d]{6,20})", re.IGNORECASE)

MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}


def fail(message: str, code: int = 1) -> None:
    print(message, file=sys.stderr)
    sys.exit(code)


def to_iso(raw: str):
    parts = re.split(r"[-/]", raw)
    if len(parts) != 3:
        return None
    day, mon, year = parts
    if mon.isalpha():
        month = MONTHS.get(mon[:3].lower())
    else:
        month = int(mon)
    if not month:
        return None
    y = int(year)
    if y < 100:
        y += 2000 if y <= 69 else 1900
    try:
        return f"{y:04d}-{month:02d}-{int(day):02d}"
    except ValueError:
        return None


def extract_text(path: str) -> str:
    try:
        import pypdfium2 as pdfium
    except ImportError:
        fail("pypdfium2 is not installed in the sidecar environment")
    try:
        pdf = pdfium.PdfDocument(path)
    except Exception as exc:  # noqa: BLE001
        fail(f"Could not open PDF: {exc}")
    chunks = []
    for page in pdf:
        textpage = page.get_textpage()
        chunks.append(textpage.get_text_range())
    return "\n".join(chunks)


def parse_lines(text: str):
    """Generic per-line parser: a line with a date and at least one amount is a transaction."""
    transactions = []
    prev_balance = None
    for line in text.splitlines():
        line = line.strip()
        date_match = DATE_RE.search(line)
        if not date_match:
            continue
        iso = to_iso(date_match.group(1))
        if not iso:
            continue
        amounts = AMOUNT_RE.findall(line)
        if not amounts:
            continue

        nums = [float(a.replace(",", "")) for a in amounts]
        # Heuristic: if two+ amounts, last is the running balance, second-last the txn amount.
        if len(nums) >= 2:
            amount = nums[-2]
            balance = nums[-1]
        else:
            amount = nums[-1]
            balance = None

        # Direction from balance delta when available, else assume debit.
        if balance is not None and prev_balance is not None:
            txn_type = "credit" if balance > prev_balance else "debit"
        else:
            txn_type = "debit"
        prev_balance = balance if balance is not None else prev_balance

        narration = line[: date_match.start()] + line[date_match.end():]
        narration = AMOUNT_RE.sub("", narration).strip(" -|\t")

        transactions.append(
            {
                "date": iso,
                "narration": narration or "(no description)",
                "amount": abs(amount),
                "type": txn_type,
                "balance": balance,
            }
        )
    return transactions


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse a bank statement PDF into JSON.")
    parser.add_argument("--file")
    parser.add_argument("--bank", default="")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        json.dump(SELF_TEST_PAYLOAD, sys.stdout)
        return

    if not args.file:
        fail("--file is required")

    text = extract_text(args.file)
    transactions = parse_lines(text)
    if not transactions:
        fail("No transactions could be extracted from this PDF; try CSV import instead")

    acct = ACCOUNT_RE.search(text)
    account_number = None
    if acct:
        digits = re.sub(r"\D", "", acct.group(1))
        account_number = digits[-4:] if len(digits) >= 4 else None

    json.dump(
        {"ok": True, "bank": args.bank, "account_number": account_number, "transactions": transactions},
        sys.stdout,
    )


if __name__ == "__main__":
    main()
