SELECT cron.schedule(
  'generate-recurring-invoices-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url:='https://vifrecsqxdbwqtcfkdyb.supabase.co/functions/v1/generate-recurring-invoices',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpZnJlY3NxeGRid3F0Y2ZrZHliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMDYwNjUsImV4cCI6MjA5MTU4MjA2NX0.uRcCTJCHLm9CZ2n32FjLW06CY6vUBWU2rkBBuyCZIFY"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);