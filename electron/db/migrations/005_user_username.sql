-- Username for the account holder. Nullable: existing vaults have none until
-- the user sets one (onboarding captures it going forward). A plaintext copy is
-- mirrored to settings.json so the unlock screen can greet the user *before*
-- the encrypted DB is opened — the copy here remains the source of truth.
ALTER TABLE user ADD COLUMN username TEXT;
