#!/usr/bin/env python3
"""
Importe un fichier CSV de contacts (même format que celui exporté par
l'application) directement dans la table Supabase "contacts", en une
seule fois, sans passer par l'interface web.

Utilisation :
    SUPABASE_URL="https://xxxx.supabase.co" \
    SUPABASE_KEY="votre-cle-service-role-ou-anon" \
    python3 scripts/import_csv.py data/MARIA-BAG_contacts.csv

Remarques :
- Le fichier CSV doit avoir les colonnes dans cet ordre (séparateur ";") :
  Nom;Prénom;Poste;Société;Type;Statut;Téléphone;Email;Ville/Pays;Source;
  Produits d'intérêt;Dernière action;Prochaine relance;Notes;Historique
  (c'est exactement le format produit par le bouton "CSV" de l'application)
- Les lignes sans Nom ET sans Société sont ignorées.
- Les dates sont attendues au format AAAA-MM-JJ (ou JJ/MM/AAAA, converties
  automatiquement) ; les valeurs vides deviennent NULL.
- Ce script utilise uniquement la bibliothèque standard de Python
  (aucune dépendance à installer).
"""
import csv
import json
import os
import re
import sys
import urllib.request

KEYS = ["nom", "prenom", "poste", "societe", "type", "statut", "tel", "email",
        "ville", "source", "produits", "derniere", "relance", "notes"]


def to_iso_date(s):
    s = (s or "").strip()
    if not s:
        return None
    m = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$", s)
    if m:
        d, mo, y = m.groups()
        return f"{y}-{int(mo):02d}-{int(d):02d}"
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    return None


def normalize_type(v):
    v = (v or "").lower()
    return "Fournisseur" if re.search(r"four|suppl|vend", v) else "Client"


def normalize_statut(v):
    v = (v or "").lower()
    if "confirm" in v:
        return "Confirmé"
    if re.search(r"pas|non|refus", v):
        return "Pas intéressé"
    return "En attente"


def detect_delimiter(first_line):
    best, best_count = ";", 0
    for d in [";", ",", "\t"]:
        c = first_line.count(d)
        if c > best_count:
            best, best_count = d, c
    return best


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/import_csv.py <fichier.csv>")
        sys.exit(1)

    path = sys.argv[1]
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        print("Définissez les variables d'environnement SUPABASE_URL et SUPABASE_KEY.")
        sys.exit(1)

    with open(path, "r", encoding="utf-8-sig") as f:
        text = f.read()

    delim = detect_delimiter(text.splitlines()[0])
    reader = csv.reader(text.splitlines(), delimiter=delim)
    rows = [r for r in reader if any(str(x).strip() for x in r)]
    if len(rows) < 2:
        print("Fichier vide ou illisible.")
        sys.exit(1)

    header = [h.strip().lower() for h in rows[0]]
    expected = ["nom", "prénom", "poste", "société", "type", "statut", "téléphone",
                "email", "ville/pays", "source", "produits d'intérêt",
                "dernière action", "prochaine relance", "notes", "historique"]
    if header[:4] != expected[:4]:
        print("Attention : l'en-tête ne correspond pas exactement au format attendu,")
        print("l'import se poursuit quand même par position de colonne.")

    payload = []
    for r in rows[1:]:
        r = r + [""] * (15 - len(r))
        nom, prenom, poste, societe, typ, statut, tel, email, ville, source, \
            produits, derniere, relance, notes, historique = r[:15]
        if not nom.strip() and not societe.strip():
            continue
        payload.append({
            "nom": nom.strip(), "prenom": prenom.strip(), "poste": poste.strip(),
            "societe": societe.strip(), "type": normalize_type(typ),
            "statut": normalize_statut(statut), "tel": tel.strip(), "email": email.strip(),
            "ville": ville.strip(), "source": source.strip(), "produits": produits.strip(),
            "derniere": to_iso_date(derniere), "relance": to_iso_date(relance),
            "notes": notes.strip(), "hist": [],
        })

    if not payload:
        print("Aucune ligne valide à importer.")
        sys.exit(0)

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url.rstrip("/") + "/rest/v1/contacts",
        data=body,
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            print(f"{len(result)} contact(s) importé(s) avec succès.")
    except urllib.error.HTTPError as e:
        print("Erreur Supabase :", e.read().decode("utf-8"))
        sys.exit(1)


if __name__ == "__main__":
    main()
