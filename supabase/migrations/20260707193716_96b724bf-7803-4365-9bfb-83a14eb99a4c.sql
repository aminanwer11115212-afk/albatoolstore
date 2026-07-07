ALTER TABLE public.destination_transporters
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

-- تهيئة الترتيب للسجلات القديمة حسب created_at لكل ناقل
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY transporter_id ORDER BY created_at) - 1 AS rn
  FROM public.destination_transporters
)
UPDATE public.destination_transporters dt
SET position = r.rn
FROM ranked r
WHERE dt.id = r.id;

CREATE INDEX IF NOT EXISTS destination_transporters_transporter_position_idx
  ON public.destination_transporters (transporter_id, position);
