/* ============================================================
   CONFIGURATION — à remplir avant le déploiement
   ============================================================
   1) Créez un projet sur https://supabase.com
   2) Allez dans Project Settings → API et copiez :
        - "Project URL"        -> SUPABASE_URL
        - "anon public" key    -> SUPABASE_ANON_KEY
   3) Choisissez un mot de passe pour l'équipe -> APP_PASSWORD
      (c'est un simple verrou d'écran, pas une vraie authentification
      multi-utilisateur — voir le README pour les limites de sécurité)
   ============================================================ */

const SUPABASE_URL = "https://xvpqaewnpcspndyhwfit.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_uEyHuADSVkq-rpBGRw4Ztg_QpoEgbcs";
const APP_PASSWORD = "mariabag2026";

/* Comptes utilisateurs (Supabase Auth). false = l'ancien mot de passe reste possible en secours ;
   true  = connexion par compte OBLIGATOIRE (à activer après avoir lancé supabase/securiser.sql). */
const AUTH_REQUIRED = false;
