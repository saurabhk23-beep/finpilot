#!/usr/bin/env python3
"""Unit tests for the bank-statement parsers. Run: python python/test_parse_bank.py

Kept as a standalone script (no pytest dependency) so it runs with the same
interpreter the sidecar uses.
"""
from parse_bank import parse_bob_card, parse_icici, parse_icici_card, parse_sbi


# Representative ICICI "OpTransactionHistory" text, as pypdfium2 extracts it:
# multi-line rows, a single-line credit (amount at end of narration), DD.MM.YYYY
# dates, and interleaved page footer/header noise that must be ignored.
SAMPLE = "\n".join(
    [
        "S No. Transaction",
        "Date Cheque Number Transaction Remarks Withdrawal",
        "1 28.05.2026 SAURABH KU",
        "UPI/SAURABH KU/9125449069@pz/Payment to/HDFC",
        "BANK/596028046897/PAZ8e3eaad4c095426c9590",
        "10.00 20.00",  # debit 10 -> balance 20 (first row: narration has no credit hint)
        "2 29.05.2026 Credit trxn",
        "CMS/ SALARY MAY 2026/ICICI LOMBARD GIC LTD",
        "PERSON",
        "71286.00 71306.00",  # credit 71286 -> balance up
        "3 30.05.2026 ANIL KUMAR",
        "UPI/ANIL KUMAR/anilpanday4197@ybl/Payment to/BANK",
        "26.00 71280.00",  # debit 26 -> balance down
        # single-line credit: amount+balance appended to the narration line
        "4 15.06.2026 Credit trxn",
        "CMS/ CMS5721535624/ICICI LOMBARD GIC LTD 11352.00 82632.00",
        # page footer / header noise between pages — must be skipped
        "Never share your OTP, CVV or passwords with anyone.",
        "www.icici.bank.in Dial your Bank 1800-1080",
        "2",
        "S No. Transaction",
    ]
)


def test_extracts_all_rows_with_direction():
    txns = parse_icici(SAMPLE)
    assert len(txns) == 4, f"expected 4, got {len(txns)}"

    assert txns[0]["date"] == "2026-05-28"
    assert txns[0]["amount"] == 10.0
    assert txns[0]["type"] == "debit"  # first row, no credit hint -> debit
    assert "9125449069@pz" in txns[0]["narration"]  # VPA retained for categorization

    assert txns[1]["type"] == "credit" and txns[1]["amount"] == 71286.0  # balance rose
    assert txns[2]["type"] == "debit" and txns[2]["amount"] == 26.0  # balance fell

    # single-line credit row parsed; amount split from the narration tail
    assert txns[3]["amount"] == 11352.0
    assert txns[3]["type"] == "credit"
    assert txns[3]["narration"].endswith("GIC LTD")


def test_ignores_noise_only_text():
    assert parse_icici("random header\nfooter line\nnot a transaction") == []


# Representative SBI "Account Statement" text: two-date start lines, a mode line,
# narration lines, then `<ref> <debit> <credit> <balance>` (empty columns = "-"),
# plus a single-line INTEREST CREDIT row and interleaved page noise.
SBI_SAMPLE = "\n".join(
    [
        "Balance",
        "02/04/2026 02/04/2026",
        "DEP TFR",
        "UPI/CR/609216702170/MD",
        "DANIS/SBIN/mdanishiit/UPI",
        "- - 150.00 3,10,416.32",  # credit 150
        "23/04/2026 23/04/2026",
        "WDL TFR",
        "UPI/DR/247425656672/BOB",
        "- 31,273.00 - 2,79,143.32",  # debit 31273
        # single-line credit: everything on the start line
        "25/06/2026 25/06/2026 INTEREST CREDIT - - 1,298.00 5,528.47",
        "Page no. 1",
        "Balance",
    ]
)


def test_sbi_uses_debit_credit_columns():
    txns = parse_sbi(SBI_SAMPLE)
    assert len(txns) == 3, f"expected 3, got {len(txns)}"

    assert txns[0]["date"] == "2026-04-02"
    assert txns[0]["type"] == "credit" and txns[0]["amount"] == 150.0
    assert "mdanishiit" in txns[0]["narration"]

    assert txns[1]["type"] == "debit" and txns[1]["amount"] == 31273.0

    # single-line interest credit; trailing ref dash trimmed from narration
    assert txns[2]["type"] == "credit" and txns[2]["amount"] == 1298.0
    assert txns[2]["narration"] == "INTEREST CREDIT"


def test_sbi_ignores_noise_only_text():
    assert parse_sbi("Balance\nPage no. 1\nnot a transaction") == []


# ICICI credit-card statement: single-line rows `date serno merchant points amount`,
# card-number header lines to ignore, and a CR-suffixed payment (credit).
CARD_SAMPLE = "\n".join(
    [
        "Date SerNo. Transaction Details Reward",
        "3747XXXXXXXX0004",
        "17/03/2026 13067117957 BOOK MY SHOW PAYU PG MUMBAI IN 19 980.54",
        "16/03/2026 13060801132 ZEPTO MARKETPLACE PRIV Bangalore IN 6 314.00",
        "20/03/2026 13069999999 PAYMENT RECEIVED THANK YOU 5,000.00 CR",
        "Credit Limit (Including cash) Available Credit",
    ]
)


def test_card_parses_rows_strips_points_and_marks_cr_credit():
    txns = parse_icici_card(CARD_SAMPLE)
    assert len(txns) == 3, f"expected 3, got {len(txns)}"

    assert txns[0]["date"] == "2026-03-17"
    assert txns[0]["type"] == "debit" and txns[0]["amount"] == 980.54
    assert txns[0]["narration"] == "BOOK MY SHOW PAYU PG MUMBAI IN"  # reward points stripped

    assert txns[1]["narration"] == "ZEPTO MARKETPLACE PRIV Bangalore IN"

    # CR suffix -> payment/refund = credit to the card
    assert txns[2]["type"] == "credit" and txns[2]["amount"] == 5000.0
    assert "PAYMENT RECEIVED" in txns[2]["narration"]


# BOBCARD credit-card statement: `date ref merchant [points] INR <amt> <amt> DR|CR`.
BOB_SAMPLE = "\n".join(
    [
        "SAURABH KUMAR(PRIMARY CARD-4144)",
        "18/08/2026 100179 PONCHO HOSPITALITY PVT Mumbai IN 20 INR 131.00 131.00 DR",
        "20/08/2026 852088 PHP*Zepto Bengaluru IN INR 503.00 503.00 DR",  # no points column
        "05/09/2026 999999 PAYMENT RECEIVED THANK YOU IN INR 5,000.00 5,000.00 CR",
        "Page 1 of 6",
    ]
)


def test_bob_card_parses_dr_cr_and_strips_points():
    txns = parse_bob_card(BOB_SAMPLE)
    assert len(txns) == 3, f"expected 3, got {len(txns)}"

    assert txns[0]["date"] == "2026-08-18"
    assert txns[0]["type"] == "debit" and txns[0]["amount"] == 131.0
    assert txns[0]["narration"] == "PONCHO HOSPITALITY PVT Mumbai IN"  # points stripped

    assert txns[1]["type"] == "debit" and txns[1]["amount"] == 503.0

    assert txns[2]["type"] == "credit" and txns[2]["amount"] == 5000.0  # CR = payment


if __name__ == "__main__":
    passed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
            passed += 1
    print(f"\n{passed} test(s) passed")
