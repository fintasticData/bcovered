-- Broker Licence Plate # — brokerage display identity (distinct from FSP and per-insurer intermediary codes).
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS blp_number text;

COMMENT ON COLUMN public.organisations.blp_number IS
  'Broker Licence Plate # — brokerage display identity; distinct from FSP and per-insurer intermediary codes.';

UPDATE public.organisations
SET blp_number = 'BLP-BCV-0001'
WHERE id = 'a0000000-0000-4000-8000-000000000001'
  AND blp_number IS NULL;
