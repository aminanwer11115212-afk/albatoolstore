-- جدول الأخطاء غير المنطقية
CREATE TABLE public.data_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('financial','pricing','stock','logical','data')),
  severity text NOT NULL CHECK (severity IN ('critical','warning','info')),
  rule_code text NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  record_label text,
  description text NOT NULL,
  observed_value jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','ignored','resolved')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  ignored_at timestamptz,
  ignored_by uuid,
  ignored_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_code, table_name, record_id)
);

CREATE INDEX idx_data_anomalies_status ON public.data_anomalies(status);
CREATE INDEX idx_data_anomalies_severity ON public.data_anomalies(severity);
CREATE INDEX idx_data_anomalies_category ON public.data_anomalies(category);
CREATE INDEX idx_data_anomalies_last_seen ON public.data_anomalies(last_seen_at DESC);

ALTER TABLE public.data_anomalies ENABLE ROW LEVEL SECURITY;

-- قراءة: أي مستخدم مسجل
CREATE POLICY "auth can read data_anomalies"
ON public.data_anomalies FOR SELECT
TO authenticated
USING (true);

-- إدراج: فقط المدير (يدوياً)؛ الـ edge function يستخدم service role
CREATE POLICY "admin can insert data_anomalies"
ON public.data_anomalies FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- تحديث: فقط المدير (لتجاهل/حل)
CREATE POLICY "admin can update data_anomalies"
ON public.data_anomalies FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- حذف: فقط المدير
CREATE POLICY "admin can delete data_anomalies"
ON public.data_anomalies FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- تريغر تحديث updated_at
CREATE TRIGGER update_data_anomalies_updated_at
BEFORE UPDATE ON public.data_anomalies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- جدول لتتبع تشغيلات الـ scanner
CREATE TABLE public.data_anomaly_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  triggered_by text NOT NULL DEFAULT 'manual' CHECK (triggered_by IN ('manual','cron')),
  triggered_by_uid uuid,
  rules_run integer DEFAULT 0,
  anomalies_found integer DEFAULT 0,
  anomalies_new integer DEFAULT 0,
  anomalies_resolved integer DEFAULT 0,
  duration_ms integer,
  status text DEFAULT 'running' CHECK (status IN ('running','success','failed')),
  error_message text
);

CREATE INDEX idx_anomaly_runs_started ON public.data_anomaly_runs(started_at DESC);

ALTER TABLE public.data_anomaly_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth can read anomaly_runs"
ON public.data_anomaly_runs FOR SELECT
TO authenticated
USING (true);