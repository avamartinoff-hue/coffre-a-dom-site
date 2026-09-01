-- =========================================================
-- Étiquettes La Poste (SwissPost Barcode API)
-- Colonnes de suivi sur les commandes.
-- À jouer une fois dans Supabase (SQL Editor) AVANT de publier.
-- Idempotent : réexécutable sans risque.
-- =========================================================
alter table if exists public.orders
  add column if not exists tracking_number    text,
  add column if not exists label_data         text,          -- PDF base64 de l'étiquette (réimpression sans re-générer)
  add column if not exists label_generated_at timestamptz;

comment on column public.orders.tracking_number    is 'N° de suivi SwissPost (identCode/sscc)';
comment on column public.orders.label_data         is 'Étiquette PDF en base64 pour réimpression';
comment on column public.orders.label_generated_at is 'Date de génération de l''étiquette';
