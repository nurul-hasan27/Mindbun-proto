-- Runs once, on first boot of an empty data volume.
--
-- Creates the test database alongside the development one, so `npm run test:db`
-- never touches development data. The `IF NOT EXISTS` guard keeps this safe if
-- the volume is reused.
SELECT 'CREATE DATABASE why_this_match_test OWNER wtm'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'why_this_match_test')\gexec
