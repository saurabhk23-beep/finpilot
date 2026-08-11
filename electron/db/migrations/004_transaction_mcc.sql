-- Merchant Category Code carried on card transactions, so the categorizer's
-- Layer 1 (MCC lookup) has an input. Null for bank/cash transactions.
ALTER TABLE transactions ADD COLUMN mcc TEXT;
