-- Données de démonstration — à exécuter après schema.sql
begin;
truncate table public.ports cascade;
truncate table public.departures cascade;
truncate table public.containers cascade;
truncate table public.sliders cascade;
truncate table public.services cascade;

insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_douala', 'Port de Douala', 'Douala', 'Cameroun', 'CM', 'loading', 4.0443, 9.7005);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_lagos', 'Port de Lagos (Apapa)', 'Lagos', 'Nigeria', 'NG', 'loading', 6.4478, 3.3946);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_abidjan', 'Port d''Abidjan', 'Abidjan', 'Côte d''Ivoire', 'CI', 'loading', 5.3, -4.0333);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_cotonou', 'Port de Cotonou', 'Cotonou', 'Bénin', 'BJ', 'loading', 6.3556, 2.4264);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_lome', 'Port de Lomé', 'Lomé', 'Togo', 'TG', 'loading', 6.1319, 1.2333);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_dakar', 'Port de Dakar', 'Dakar', 'Sénégal', 'SN', 'loading', 14.6928, -17.4464);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_libreville', 'Port de Libreville', 'Libreville', 'Gabon', 'GA', 'loading', 0.3939, 9.4526);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_tema', 'Port de Tema', 'Tema', 'Ghana', 'GH', 'loading', 5.6294, 0.0094);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_conakry', 'Port de Conakry', 'Conakry', 'Guinée', 'GN', 'loading', 9.515, -13.7122);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_matadi', 'Port de Matadi', 'Matadi', 'RD Congo', 'CD', 'loading', -5.8203, 13.4496);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_antwerp', 'Port d''Anvers', 'Anvers', 'Belgique', 'BE', 'discharge', 51.2616, 4.4024);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_rotterdam', 'Port de Rotterdam', 'Rotterdam', 'Pays-Bas', 'NL', 'discharge', 51.9491, 4.1376);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_lehavre', 'Port du Havre', 'Le Havre', 'France', 'FR', 'discharge', 49.4862, 0.1077);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_marseille', 'Port de Marseille', 'Marseille', 'France', 'FR', 'discharge', 43.2964, 5.3698);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_hamburg', 'Port de Hambourg', 'Hambourg', 'Allemagne', 'DE', 'discharge', 53.5413, 9.9844);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_newark', 'Port de Newark', 'Newark', 'États-Unis', 'US', 'discharge', 40.6742, -74.0465);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_houston', 'Port de Houston', 'Houston', 'États-Unis', 'US', 'discharge', 29.7384, -95.0052);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_jebelali', 'Port de Jebel Ali', 'Dubaï', 'Émirats arabes unis', 'AE', 'discharge', 25.0107, 55.0627);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_shanghai', 'Port de Shanghai', 'Shanghai', 'Chine', 'CN', 'discharge', 31.2304, 121.4737);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_singapore', 'Port de Singapour', 'Singapour', 'Singapour', 'SG', 'discharge', 1.2903, 103.852);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_montreal', 'Port de Montréal', 'Montréal', 'Canada', 'CA', 'discharge', 45.5, -73.5667);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_istanbul', 'Port d''Ambarli', 'Istanbul', 'Turquie', 'TR', 'discharge', 40.9755, 28.7333);
insert into public.ports (id, name, city, country, country_code, role, lat, lng) values ('port_durban', 'Port de Durban', 'Durban', 'Afrique du Sud', 'ZA', 'discharge', -29.8745, 31.0318);

insert into public.departures (id, ship, from_port_id, to_port_id, departure_date, deposit_deadline, status, note, created_at) values ('dep_sahara', 'MV Sahara Wind', 'port_dakar', 'port_newark', '2026-11-29', '2026-11-26', 'open', 'Véhicules particuliers et utilitaires', now());
insert into public.departures (id, ship, from_port_id, to_port_id, departure_date, deposit_deadline, status, note, created_at) values ('dep_atlantic', 'MV Atlantic Star', 'port_douala', 'port_antwerp', '2026-12-05', '2026-12-01', 'open', 'Voitures, 4x4 et engins', now());
insert into public.departures (id, ship, from_port_id, to_port_id, departure_date, deposit_deadline, status, note, created_at) values ('dep_gulf', 'MV Gulf Horizon', 'port_lagos', 'port_rotterdam', '2026-12-12', '2026-12-08', 'open', 'Tous véhicules', now());
insert into public.departures (id, ship, from_port_id, to_port_id, departure_date, deposit_deadline, status, note, created_at) values ('dep_seme', 'MV Seme Express', 'port_cotonou', 'port_marseille', '2026-12-19', '2026-12-15', 'open', 'Véhicules et machinerie', now());
insert into public.departures (id, ship, from_port_id, to_port_id, departure_date, deposit_deadline, status, note, created_at) values ('dep_abidjan', 'MV Abidjan Bridge', 'port_abidjan', 'port_hamburg', '2026-12-27', '2026-12-22', 'full', 'Complet — liste d’attente', now());
insert into public.departures (id, ship, from_port_id, to_port_id, departure_date, deposit_deadline, status, note, created_at) values ('dep_kribi', 'MV Kribi Star', 'port_douala', 'port_lehavre', '2027-01-09', '2027-01-05', 'open', 'Ro-Ro classique', now());
insert into public.departures (id, ship, from_port_id, to_port_id, departure_date, deposit_deadline, status, note, created_at) values ('dep_ocean', 'MV Ocean Pride', 'port_douala', 'port_jebelali', '2027-01-23', '2027-01-18', 'open', 'Véhicules et conteneurs', now());
insert into public.departures (id, ship, from_port_id, to_port_id, departure_date, deposit_deadline, status, note, created_at) values ('dep_tema', 'MV Tema Glory', 'port_tema', 'port_shanghai', '2027-02-06', '2027-02-01', 'open', 'Fret et véhicules', now());
insert into public.departures (id, ship, from_port_id, to_port_id, departure_date, deposit_deadline, status, note, created_at) values ('dep_lome', 'MV Lomé Mercury', 'port_lome', 'port_rotterdam', '2027-02-20', '2027-02-15', 'open', 'Véhicules et engins', now());
insert into public.departures (id, ship, from_port_id, to_port_id, departure_date, deposit_deadline, status, note, created_at) values ('dep_matadi', 'MV Matadi Explorer', 'port_matadi', 'port_marseille', '2026-11-15', '2026-11-11', 'departed', 'Départ effectué', now());

insert into public.containers (id, name, short_name, description, dimensions, volume, image, active) values ('c20', 'Conteneur 20 pieds', '20 ft', 'Idéal pour un déménagement, du stockage compact ou une petite expédition. Fermé, sécurisé et facile à transporter.', '6,06 × 2,44 × 2,59 m', '33,2 m³', '/img/containers/20ft.jpg', true);
insert into public.containers (id, name, short_name, description, dimensions, volume, image, active) values ('c40', 'Conteneur 40 pieds', '40 ft', 'Le format le plus demandé pour le fret et le stockage. Deux fois la capacité d’un 20 pieds, avec une surface au sol maximale.', '12,19 × 2,44 × 2,59 m', '67,7 m³', '/img/containers/40ft.jpg', true);
insert into public.containers (id, name, short_name, description, dimensions, volume, image, active) values ('c40hc', 'Conteneur 40 pieds High Cube', '40 ft HC', 'Plus haut de 30 cm qu’un conteneur standard, il offre un volume accru pour les marchandises volumineuses.', '12,19 × 2,44 × 2,90 m', '76,4 m³', '/img/containers/40ft-hc.jpg', true);

insert into public.sliders (id, src, caption, sub, "order", active) values ('slide1', '/img/slider/slide1.jpg', 'Votre véhicule, pris en charge jusqu’au port', 'Ro-Ro régulier vers l’Europe, l’Asie et les Amériques', 1, true);
insert into public.sliders (id, src, caption, sub, "order", active) values ('slide2', '/img/slider/slide2.jpg', 'Conteneurs neufs et d’occasion', 'Achat et livraison, sur simple demande de prix', 2, true);
insert into public.sliders (id, src, caption, sub, "order", active) values ('slide3', '/img/slider/slide3.jpg', 'Des départs réguliers', 'Consultez les prochaines traversées et réservez votre place', 3, true);
insert into public.sliders (id, src, caption, sub, "order", active) values ('slide4', '/img/slider/slide4.jpg', 'De votre ville au port', 'Distance et itinéraire calculés automatiquement', 4, true);
insert into public.sliders (id, src, caption, sub, "order", active) values ('slide5', '/img/slider/slide5.jpg', 'Un accompagnement de bout en bout', 'Dédouanement, transport routier et assurance cargo', 5, true);

insert into public.services (id, name, icon, description, "order", active) values ('svc_dedouanement', 'Dédouanement & transit', '🛃', 'Prise en charge des formalités douanières à l’import comme à l’export : documents, déclarations, suivi.', null, true);
insert into public.services (id, name, icon, description, "order", active) values ('svc_routier', 'Transport routier', '🚛', 'Enlèvement de votre véhicule ou conteneur et acheminement jusqu’au port, partout en Afrique de l’Ouest et du Centre.', null, true);
insert into public.services (id, name, icon, description, "order", active) values ('svc_assurance', 'Assurance cargo', '🛡️', 'Assurance ad valorem pour vos véhicules et marchandises, de la prise en charge jusqu’à la livraison.', null, true);
insert into public.services (id, name, icon, description, "order", active) values ('svc_groupage', 'Groupage & consolidation', '📦', 'Regroupement de plusieurs expéditions pour réduire les coûts et optimiser le remplissage.', null, true);

commit;
