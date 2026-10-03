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


def extract_text(path: str, password: str = "") -> str:
    try:
        import pypdfium2 as pdfium
    except ImportError:
        fail("pypdfium2 is not installed in the sidecar environment")
    try:
        # password=None for unprotected PDFs; pdfium raises if a protected PDF
        # is opened without (or with a wrong) password.
        pdf = pdfium.PdfDocument(path, password=password or None)
    except Exception as exc:  # noqa: BLE001
        fail(f"Could not open PDF (wrong password?): {exc}")
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


# --- ICICI "OpTransactionHistory" statement ---------------------------------
# Each transaction is a `<S.No> <DD.MM.YYYY> <name>` line, then one or more
# narration lines, ending with a `<amount> <balance>` pair — either on its own
# line or appended to the last narration line. Direction comes from the running
# balance delta (the only reliable signal, since the withdrawal/deposit columns
# collapse to a single amount in the extracted text).
ICICI_START = re.compile(r"^(\d+)\s+(\d{2})\.(\d{2})\.(\d{4})\s+(.*)$")
ICICI_TRAIL = re.compile(r"^(.*?)\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$")
_CREDIT_HINTS = (
    "salary", "credit", "deposit", "refund", "interest", "received",
    "cms", "reversal", "cashback", "int.pd", "neft", "imps",
)


def _num(s: str) -> float:
    return float(s.replace(",", ""))


def parse_icici(text: str):
    lines = [l.strip() for l in text.splitlines()]
    transactions = []
    current = None
    prev_balance = None

    def finalize(cur, amount, balance):
        nonlocal prev_balance
        narration = " ".join(cur["narration"]).strip() or "(no description)"
        if prev_balance is None:
            lower = narration.lower()
            ttype = "credit" if any(k in lower for k in _CREDIT_HINTS) else "debit"
        else:
            ttype = "credit" if balance > prev_balance + 1e-6 else "debit"
        prev_balance = balance
        transactions.append(
            {"date": cur["date"], "narration": narration, "amount": amount, "type": ttype, "balance": balance}
        )

    for line in lines:
        start = ICICI_START.match(line)
        if start:
            # A new row begins; a prior row that never got an amount is abandoned.
            _, dd, mm, yyyy, rest = start.groups()
            current = {"date": f"{yyyy}-{mm}-{dd}", "narration": []}
            trail = ICICI_TRAIL.match(rest)
            if trail:  # amount sits on the same line (single-line transaction)
                if trail.group(1).strip():
                    current["narration"].append(trail.group(1).strip())
                finalize(current, _num(trail.group(2)), _num(trail.group(3)))
                current = None
            elif rest:
                current["narration"].append(rest)
            continue
        if current is not None:
            trail = ICICI_TRAIL.match(line)
            if trail:
                if trail.group(1).strip():
                    current["narration"].append(trail.group(1).strip())
                finalize(current, _num(trail.group(2)), _num(trail.group(3)))
                current = None
            else:
                current["narration"].append(line)
    return transactions


# --- ICICI credit-card statement --------------------------------------------
# One transaction per line: `<DD/MM/YYYY> <SerNo> <merchant...> <points> <amount>`
# with an optional trailing "CR" marking a payment/refund (credit to the card).
# Card-number header lines (e.g. 3747XXXXXXXX0004) don't match and are ignored.
ICICI_CARD_TXN = re.compile(r"^(\d{2})/(\d{2})/(\d{4})\s+\d+\s+(.*?)\s+([\d,]+\.\d{2})(\s*CR)?\s*$")


def parse_icici_card(text: str):
    transactions = []
    for raw in text.splitlines():
        m = ICICI_CARD_TXN.match(raw.strip())
        if not m:
            continue
        dd, mm, yyyy, desc, amount, cr = m.groups()
        # Trailing integer is the reward-points column, not part of the merchant.
        desc = re.sub(r"\s+\d+$", "", desc).strip() or "(no description)"
        transactions.append(
            {
                "date": f"{yyyy}-{mm}-{dd}",
                "narration": desc,
                "amount": _num(amount),
                "type": "credit" if cr else "debit",  # CR = payment/refund
                "balance": None,
            }
        )
    return transactions


# --- BOBCARD (Bank of Baroda) credit-card statement -------------------------
# One transaction per line: `<DD/MM/YYYY> <refNo> <merchant...> [points] INR
# <txnAmt> <billedAmt> <DR|CR>`. The billed INR amount is used; DR = spend,
# CR = payment/refund. Card-number/summary lines don't match and are ignored.
BOB_CARD_TXN = re.compile(
    r"^(\d{2})/(\d{2})/(\d{4})\s+\S+\s+(.*?)\s+INR\s+[\d,]+\.\d{2}\s+([\d,]+\.\d{2})\s+(DR|CR)\s*$"
)


def parse_bob_card(text: str):
    transactions = []
    for raw in text.splitlines():
        m = BOB_CARD_TXN.match(raw.strip())
        if not m:
            continue
        dd, mm, yyyy, merchant, amount, drcr = m.groups()
        # Trailing integer is the reward-points column, not part of the merchant.
        merchant = re.sub(r"\s+\d+$", "", merchant).strip() or "(no description)"
        transactions.append(
            {
                "date": f"{yyyy}-{mm}-{dd}",
                "narration": merchant,
                "amount": _num(amount),
                "type": "debit" if drcr == "DR" else "credit",
                "balance": None,
            }
        )
    return transactions


# --- SBI "Account Statement" ------------------------------------------------
# Each transaction is a `<DD/MM/YYYY> <DD/MM/YYYY>` (txn + value date) line, then
# the mode/description and narration lines, ending with a
# `<ref> <debit> <credit> <balance>` row where empty money columns are "-".
# Direction comes straight from the debit/credit columns (more reliable than a
# balance delta). Some rows (e.g. INTEREST CREDIT) put everything on one line.
SBI_START = re.compile(r"^(\d{2})/(\d{2})/(\d{4})\s+\d{2}/\d{2}/\d{4}\s*(.*)$")
SBI_AMOUNT = re.compile(r"(-|[\d,]+\.\d{2})\s+(-|[\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$")


def parse_sbi(text: str):
    lines = [l.strip() for l in text.splitlines()]
    transactions = []
    current = None

    def finalize(cur, debit, credit, balance):
        narration = re.sub(r"\s+-\s*$", "", " ".join(cur["narration"]).strip()) or "(no description)"
        if debit != "-":
            ttype, amount = "debit", _num(debit)
        elif credit != "-":
            ttype, amount = "credit", _num(credit)
        else:
            ttype, amount = "debit", 0.0
        transactions.append(
            {"date": cur["date"], "narration": narration, "amount": amount, "type": ttype, "balance": _num(balance)}
        )

    def try_amount(cur, line) -> bool:
        m = SBI_AMOUNT.search(line)
        if not m:
            return False
        pre = line[: m.start()].strip()
        if pre and pre != "-":
            cur["narration"].append(pre)
        finalize(cur, *m.groups())
        return True

    for line in lines:
        start = SBI_START.match(line)
        if start:
            dd, mm, yyyy, rest = start.groups()
            current = {"date": f"{yyyy}-{mm}-{dd}", "narration": []}
            if try_amount(current, rest):  # single-line transaction
                current = None
            elif rest.strip():
                current["narration"].append(rest)
            continue
        if current is not None:
            if try_amount(current, line):
                current = None
            else:
                current["narration"].append(line)
    return transactions


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse a bank statement PDF into JSON.")
    parser.add_argument("--file")
    parser.add_argument("--bank", default="")
    parser.add_argument("--password", default="")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        json.dump(SELF_TEST_PAYLOAD, sys.stdout)
        return

    if not args.file:
        fail("--file is required")

    text = extract_text(args.file, args.password)
    bank = (args.bank or "").lower()
    # Bank-specific multi-line parsers; others fall back to the generic one.
    # ICICI "bank" covers both the savings-account statement and the credit-card
    # statement — the two formats are mutually exclusive, so try account first
    # and fall back to the card parser (works whether the target is an account
    # or a card).
    if bank == "icici":
        transactions = parse_icici(text) or parse_icici_card(text)
    elif bank == "sbi":
        transactions = parse_sbi(text)
    elif bank == "bob":
        transactions = parse_bob_card(text) or parse_lines(text)
    else:
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
