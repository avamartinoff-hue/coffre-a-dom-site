-- =========================================================
-- COFFRE À DOM — Projet 1 : Valorisation / Rachat de cartes
-- Outil back office : cotation Cardmarket (via pokemontcg.io) +
-- génération d'une « Offre de rachat » numérotée et traçable.
--
-- 2 tables, privées (RLS activée, AUCUNE policy publique) : seules
-- les fonctions serveur (clé service_role) y accèdent. Le site public
-- (clé publishable) n'y touche jamais.
--
-- À jouer UNE FOIS dans Supabase → SQL Editor.
-- =========================================================

-- ---------- Paramètres de calcul (singleton, 1 seule ligne id = 1) ----------
create table if not exists public.buyback_config (
  id          smallint primary key default 1,
  data        jsonb    not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  constraint buyback_config_singleton check (id = 1)
);

-- Valeurs par défaut (reprise par paliers, marge, TVA, taux EUR→CHF, +5% CM,
-- prochain numéro d'offre, coordonnées pour l'impression).
-- ⚠️ Paramètres à CALER sur le fichier de calcul du client (offre N°117).
insert into public.buyback_config (id, data)
values (1, jsonb_build_object(
  'marge',   1.55,                 -- coefficient de revente
  'tva',     0.081,                -- TVA 8.1 %
  'cm_plus', 0.05,                 -- +5 % frais Cardmarket sur la revente
  'eur_chf_buy',  0.91,            -- taux EUR→CHF appliqué au RACHAT (payé au vendeur)
  'eur_chf_sell', 0.93,            -- taux EUR→CHF appliqué à la REVENTE (Total TTC)
  'next_number', 118,              -- prochain n° d'offre (N°117 déjà émise)
  'paliers', jsonb_build_array(    -- % de reprise par tranche de valeur (€)
    jsonb_build_object('max', 20,   'reprise', 60),
    jsonb_build_object('max', 100,  'reprise', 65),
    jsonb_build_object('max', null, 'reprise', 80)
  ),
  'merchant', jsonb_build_object(
    'name',  'Coffre à Dom Sàrl',
    'ide',   'CHE-142.573.696',
    'addr',  '',
    'email', '',
    'phone', ''
  )
))
on conflict (id) do nothing;

-- ---------- Offres de rachat enregistrées ----------
create table if not exists public.buyback_offers (
  id            uuid primary key default gen_random_uuid(),
  offer_number  integer not null,                 -- n° séquentiel (ex. 118)
  created_at    timestamptz not null default now(),
  client_name   text,
  client_note   text,
  currency      text not null default 'CHF',
  eur_chf_rate  numeric(8,4),                      -- taux figé au moment de l'offre
  params        jsonb,                             -- marge/tva/cm_plus figés (traçabilité)
  lines         jsonb not null default '[]'::jsonb,-- lignes { name, set, number, etat, langue, qty, value_eur, reprise_pct, offre_eur, ttc_chf, img }
  total_offre_eur   numeric(12,2) not null default 0, -- somme des offres (ce qu'on paie, en €)
  valeur_rachat_chf numeric(12,2) not null default 0, -- total payé au vendeur en CHF
  status        text not null default 'draft'       -- draft | sent | accepted | paid | cancelled
);

create unique index if not exists buyback_offers_number_uidx on public.buyback_offers (offer_number);
create index if not exists buyback_offers_created_idx on public.buyback_offers (created_at desc);

-- Horodatage de mise en vente (produits créés depuis l'offre) → évite les doublons.
-- (idempotent : ré-exécuter buyback.sql n'écrase rien)
alter table public.buyback_offers add column if not exists listed_at timestamptz;
-- Méthode de paiement du rachat (especes | virement | twint).
alter table public.buyback_offers add column if not exists payment_mode text;

-- ---------- Produits issus d'un rachat (pour la marge réalisée) ----------
-- Chaque carte mise en vente depuis une offre est enregistrée ici avec son
-- COÛT de rachat (CHF). Croisé avec les commandes payées, cela donne les
-- ventes réelles issues des rachats et la marge réellement réalisée.
create table if not exists public.buyback_products (
  slug          text primary key,              -- slug du produit créé dans la boutique
  offer_id      uuid,
  offer_number  integer,
  cost_chf      numeric(12,2) not null default 0, -- coût de rachat unitaire (CHF)
  card_name     text,
  created_at    timestamptz not null default now()
);

-- RLS : tout verrouillé côté public ; service_role (fonctions) bypass.
alter table public.buyback_config enable row level security;
alter table public.buyback_offers enable row level security;
alter table public.buyback_products enable row level security;
-- (Aucune policy = aucun accès pour anon/authenticated. Volontaire.)
