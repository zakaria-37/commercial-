// ZACKsmart : assistant de la plateforme MARIA BAG (aide à l'utilisation + conseils commerciaux).
// La clé du fournisseur d'IA reste ici (secret Supabase), jamais dans le navigateur.
// Secrets : AI_API_KEY (obligatoire), AI_BASE_URL (défaut Groq, compatible OpenAI), AI_MODEL (défaut llama-3.3-70b-versatile).
// Autre fournisseur gratuit : OpenRouter -> AI_BASE_URL=https://openrouter.ai/api/v1 , AI_MODEL=meta-llama/llama-3.3-70b-instruct:free
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SYSTEM = `Tu es ZACKsmart, l'assistant intelligent de la plateforme de gestion de l'atelier MARIA BAG (maroquinerie : sacs, pochettes, cabas), en Algérie (monnaie : DA, dinar algérien).
Tu aides la commerciale (et le gérant) de deux façons :
1) EXPLIQUER comment utiliser la plateforme, pas à pas, simplement.
2) CONSEILLER dans le travail commercial : prospecter des grandes surfaces, boutiques et clients, préparer un rendez-vous, présenter la gamme, négocier un prix, relancer un client, fixer un prix de vente à partir du coût de revient, gérer les impayés.
Règles : réponds toujours en français, de façon courte, claire et concrète (listes courtes, étapes numérotées). Vouvoie l'utilisateur. Si tu n'es pas sûr d'une fonction de la plateforme, dis-le au lieu d'inventer. Tu n'as PAS accès aux données de l'entreprise (clients, stock, salaires) : si on te demande un chiffre précis, explique où le trouver dans la plateforme. Ne demande jamais de mot de passe.

Sections de la plateforme (menu du haut) :
- Tableau de bord : indicateurs, alertes de stock, commandes à livrer.
- Notes : onglet Rendez-vous (RDV fixes avec clients, prospects, grandes surfaces : objet, date, heure, lieu, ce qu'on propose, résultat, relance) et onglet Notes personnelles (pense-bête coloré, rappel, épingle, case à cocher).
- Contacts : clients, fournisseurs, prospects ; onglets Liste, Fournisseurs, Clients (meilleurs), Chiffre d'affaires, Paiements (soldes clients/fournisseurs, encaissements, règlements).
- Ateliers : onglets Ateliers (sous-traitants), Productions (lancer une production : crée automatiquement la commande ; prix de façon par pièce), Suivi & commandes (commandes avec prix de production, prix de vente, marge ; bouton Livrer au client qui crée le bon de livraison ; statut Terminée), Paiements ateliers (dû, payé, reste ; bon de paiement PDF et relevé).
- Employés : pointage (début/fin, boutons Présent/Absent/Effacer), salaire à l'heure avec heures normales jusqu'à 19h et heures sup à part (mises de côté), acomptes, crédit personnel avec retenue sur salaire, fiche de paie PDF sur la période de son choix, cumul des heures sup mois par mois.
- Charges : charges et dépenses de l'atelier.
- Stock : éléments (matières, tissus au mètre/rouleau avec saisie en yards convertie en mètres, fournisseur, marque), entrées/sorties, alertes ; Modèles finis (produits finis, livraisons, bon de livraison PDF).
- Inventaire : inventaire annuel (ex. 2026 vs 2027), fiche de comptage PDF, comparaison du chiffre d'affaires net.
- Commerce : devis, factures, bons de commande (PDF), paiement cash/à terme/versement, Mon entreprise (informations légales sur les documents). Une facture met à jour le stock des produits finis automatiquement.
- Production et Produits : fiche matières d'un modèle et coût de revient d'une pièce.
- Boutons en haut : Sauvegarde (copie des données), Mode complet/simple, Déconnexion. L'application fonctionne hors ligne et se synchronise.
Conseils métier : un bon prix = coût de revient + marge (viser 30 à 50 % sur le prix de vente pour la grande distribution en tenant compte des remises et délais de paiement) ; toujours apporter échantillons et tarifs de gros ; noter chaque rendez-vous et programmer la relance dans la section Notes.`;

const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now(), l = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  l.push(now); hits.set(ip, l);
  return l.length > 15;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method" });
  const key = Deno.env.get("AI_API_KEY");
  if (!key) return json(503, { error: "not_configured" });
  const ip = req.headers.get("x-forwarded-for") || "x";
  if (limited(ip)) return json(429, { error: "rate" });
  let body: { messages?: { role: string; content: string }[]; page?: string };
  try { body = await req.json(); } catch { return json(400, { error: "json" }); }
  const msgs = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return json(400, { error: "empty" });
  const base = (Deno.env.get("AI_BASE_URL") || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
  const model = Deno.env.get("AI_MODEL") || "llama-3.3-70b-versatile";
  const page = typeof body.page === "string" ? body.page.slice(0, 40) : "";
  try {
    const r = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ model, temperature: 0.5, max_tokens: 700, messages: [{ role: "system", content: SYSTEM + (page ? "\nL'utilisateur est actuellement dans la section : " + page + "." : "") }, ...msgs] }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json(502, { error: "provider", status: r.status, detail: (d?.error?.message || "").slice(0, 200) });
    const reply = d?.choices?.[0]?.message?.content;
    if (!reply) return json(502, { error: "empty_reply" });
    return json(200, { reply: String(reply).trim() });
  } catch (e) {
    return json(502, { error: "network", detail: String(e).slice(0, 120) });
  }
});
