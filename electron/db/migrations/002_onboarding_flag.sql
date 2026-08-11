-- Tracks whether the user has finished the onboarding wizard, so the splash
-- screen knows whether to route to onboarding or straight to the dashboard.
ALTER TABLE user ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0;
