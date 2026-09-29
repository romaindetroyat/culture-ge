-- pg_net rangée dans le schéma « extensions » (ses fonctions restent dans « net »).
drop extension if exists pg_net;
create extension pg_net schema extensions;
