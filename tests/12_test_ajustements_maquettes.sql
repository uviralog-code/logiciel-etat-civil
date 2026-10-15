-- =====================================================================
-- TESTS du fichier 12 : AJUSTEMENTS DÉCIDÉS PENDANT LES MAQUETTES
-- Transaction annulée à la fin.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Couleurs plus lisibles
-- ---------------------------------------------------------------------
select test.verifier(
  (select bool_and(couleur = '#BF360C') and count(*) = 5 from public.types_actes where famille = 'autorisation'),
  'Les 5 autorisations et permis passent à l''orange foncé #BF360C (texte blanc lisible)'
);
select test.verifier(
  (select bool_and(couleur = '#00727C') and count(*) = 2 from public.types_actes where famille = 'certificat'),
  'Les 2 certificats passent au turquoise foncé #00727C'
);
select test.verifier(
  not exists (select 1 from public.types_actes where couleur in ('#E65100', '#00838F')),
  'Plus aucune ancienne teinte trop claire'
);

-- ---------------------------------------------------------------------
-- 2. Motif de renvoi obligatoire
-- ---------------------------------------------------------------------
select id as mul from public.entites where code = 'MUL' \gset
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000012');
insert into public.utilisateurs (id, nom_utilisateur, nom_complet, role, entite_id) values
  ('00000000-0000-0000-0000-000000000011', 'mulongwe.officier', 'Bahati Mugisho', 'officier', :'mul'),
  ('00000000-0000-0000-0000-000000000012', 'mulongwe.caissier', 'Neema Furaha',   'caissier', :'mul');

select test.se_connecter('00000000-0000-0000-0000-000000000011');
insert into public.actes (entite_id, type_acte_id, titulaire_nom, statut)
  values (:'mul', (select id from public.types_actes where code = 'ATCEL'), 'Furaha Neema', 'en_attente_paiement');
select id as acte from public.actes where titulaire_nom = 'Furaha Neema' \gset
select test.se_deconnecter();

select test.se_connecter('00000000-0000-0000-0000-000000000012');  -- Caissier
select test.doit_echouer(
  format($q$ update public.actes set statut = 'enregistre' where id = %L $q$, :'acte'),
  'Caissier : un renvoi sans motif est refusé', 'motif du renvoi'
);
select test.doit_echouer(
  format($q$ select public.renvoyer_a_l_officier(%L, '   ') $q$, :'acte'),
  'Caissier : un renvoi avec un motif vide est refusé', 'motif du renvoi'
);
select test.doit_echouer(
  format($q$ update public.actes set statut = 'enregistre', motif_renvoi = 'Nom', titulaire_nom = 'Autre' where id = %L $q$, :'acte'),
  'Caissier : en renvoyant, il ne peut toujours rien modifier d''autre', 'Caissier ne peut que renvoyer'
);
select from public.renvoyer_a_l_officier(:'acte', 'Le demandeur dit s''appeler NEEMA Furaha, pas Furaha Neema');
select test.verifier(
  (select statut = 'enregistre'
          and motif_renvoi = 'Le demandeur dit s''appeler NEEMA Furaha, pas Furaha Neema'
          and renvoye_par = '00000000-0000-0000-0000-000000000012' and renvoye_le is not null
   from public.actes where id = :'acte'),
  'Caissier : renvoi accepté avec son motif, sa date et son auteur'
);
select test.se_deconnecter();

select test.se_connecter('00000000-0000-0000-0000-000000000011');  -- Officier
select test.verifier(
  (select motif_renvoi like 'Le demandeur dit%' from public.actes where id = :'acte'),
  'Officier : voit le motif du renvoi pour savoir quoi corriger'
);
update public.actes set motif_renvoi = 'Effacé par l''Officier' where id = :'acte';
select test.verifier(
  (select motif_renvoi like 'Le demandeur dit%' from public.actes where id = :'acte'),
  'Officier : ne peut pas réécrire le motif du renvoi'
);
update public.actes set titulaire_nom = 'NEEMA Furaha' where id = :'acte';
update public.actes set statut = 'en_attente_paiement' where id = :'acte';
select test.verifier(
  (select statut = 'en_attente_paiement' and titulaire_nom = 'NEEMA Furaha'
          and motif_renvoi is null and renvoye_le is null
   from public.actes where id = :'acte'),
  'Officier : corrige le nom et retransmet ; le motif est soldé'
);
select test.se_deconnecter();

select test.se_connecter('00000000-0000-0000-0000-000000000012');
select test.doit_echouer(
  format($q$ update public.actes set statut = 'enregistre' where id = %L $q$, :'acte'),
  'Caissier : un second renvoi exige à nouveau un motif', 'motif du renvoi'
);
select test.se_deconnecter();

select test.verifier(
  (select count(*) = 1 from public.journal_audit
   where table_nom = 'actes' and champs_modifies @> array['motif_renvoi']
     and nouvelles_valeurs ->> 'motif_renvoi' like 'Le demandeur dit%'),
  'Le motif du renvoi reste au journal d''audit, même après avoir été soldé'
);

rollback;
