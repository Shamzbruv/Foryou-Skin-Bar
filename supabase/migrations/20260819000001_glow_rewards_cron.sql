-- Schedule the nightly Glow & Go rewards job (expiry sweep, birthday credits, VIP period
-- generation). Run as its own migration step: on some Supabase projects pg_cron must be
-- enabled from the Dashboard (Database -> Extensions) before this will succeed. The rewards
-- system is fully correct without this job (balances are always computed live), so a failure
-- here does not need to block anything else — see the deploy notes for the manual fallback.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'glow-rewards-daily';

SELECT cron.schedule(
  'glow-rewards-daily',
  '0 8 * * *',
  $$SELECT public.glow_run_daily_jobs();$$
);
