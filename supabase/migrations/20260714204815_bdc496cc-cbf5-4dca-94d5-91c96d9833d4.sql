ALTER TABLE public.data_anomaly_runs
  ADD COLUMN IF NOT EXISTS triggered_by_uid uuid;