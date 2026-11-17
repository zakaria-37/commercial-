#!/usr/bin/env python3
"""Génère css/sombre_auto.css : version sombre AUTOMATIQUE de toutes les couleurs claires de la plateforme.
Chaque règle CSS qui pose un fond clair (blanc, crème, vert pâle…) ou un texte sombre reçoit une variante
« body.theme-dark … » : fond foncé de la même teinte, texte clair. Thèmes sombres : Sombre, USMA.
À relancer après un changement de CSS :  python3 scripts/generer_theme_sombre.py"""
import re, colorsys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent / 'css'
SKIP = {'themes.css', 'theme_mca.css', 'sombre_auto.css', 'login.css'}
HEX = re.compile(r'#([0-9a-fA-F]{3,8})\b')

def rgb(h):
    h = h.lstrip('#')
    if len(h) in (3, 4): h = ''.join(c * 2 for c in h[:3])
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
def hexa(r, g, b): return '#%02x%02x%02x' % tuple(round(max(0, min(1, x)) * 255) for x in (r, g, b))
def lum(c): return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

def fond_sombre(c):
    h, l, s = colorsys.rgb_to_hls(*c)
    if s < 0.18 or lum(c) > 0.97: return 'var(--card)'            # blanc / gris clair → carte sombre du thème
    return hexa(*colorsys.hls_to_rgb(h, 0.15, min(s, 0.5)))       # teinte conservée, très foncée
def texte_clair(c):
    h, l, s = colorsys.rgb_to_hls(*c)
    if s < 0.18: return 'var(--tx)'
    return hexa(*colorsys.hls_to_rgb(h, 0.72, min(1, s)))          # même couleur, éclaircie (lisible sur fond foncé)

def couleur(val):
    v = val.strip().lower()
    if v in ('#fff', '#ffffff', 'white'): return (1, 1, 1)
    m = HEX.fullmatch(v.split('!')[0].strip())
    return rgb(m.group(0)) if m else None

def regles(css):
    """(prefixe_media, selecteur, declarations) pour chaque règle, @media inclus (un niveau)."""
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    i, out = 0, []
    def bloc(s, media):
        j = 0
        while j < len(s):
            a = s.find('{', j)
            if a < 0: break
            sel = s[j:a].strip()
            prof, k = 1, a + 1
            while k < len(s) and prof:
                prof += {'{': 1, '}': -1}.get(s[k], 0); k += 1
            corps = s[a + 1:k - 1]
            if sel.startswith('@media'): bloc(corps, sel)
            elif not sel.startswith('@'): out.append((media, sel, corps))
            j = k
    bloc(css, '')
    return out

def prefixer(sel):
    parts = []
    for p in sel.split(','):
        p = p.strip()
        if not p or p.startswith(('body', 'html', ':root')) or 'theme-' in p or '@' in p: continue
        parts.append('body.theme-dark ' + p)
    return ','.join(parts)

sortie, n = {}, 0
for f in sorted(ROOT.glob('*.css')):
    if f.name in SKIP: continue
    for media, sel, corps in regles(f.read_text(encoding='utf-8')):
        decl = []
        for d in corps.split(';'):
            if ':' not in d: continue
            p, v = d.split(':', 1); p = p.strip().lower(); v = v.strip()
            imp = ' !important'
            if p in ('background', 'background-color'):
                c = couleur(v)
                if c and lum(c) > 0.80: decl.append('background:' + fond_sombre(c) + imp)
            elif p == 'color':
                c = couleur(v)
                if c and lum(c) < 0.42: decl.append('color:' + texte_clair(c) + imp)
            elif p in ('border-color', 'border', 'border-top', 'border-bottom', 'border-left', 'border-right'):
                m = HEX.search(v)
                if m and lum(rgb(m.group(0))) > 0.80 and 'transparent' not in v:
                    decl.append(p + ':' + v.replace(m.group(0), 'var(--line)').replace('!important', '') + imp)
        s = prefixer(sel)
        if decl and s:
            sortie.setdefault(media, []).append(s + '{' + ';'.join(decl) + '}'); n += 1

txt = '/* FICHIER GÉNÉRÉ par scripts/generer_theme_sombre.py — ne pas modifier à la main.\n   Thèmes sombres (body.theme-dark : Sombre, USMA) : fonds clairs → foncés, textes sombres → clairs. */\n'
txt += '\n'.join(sortie.get('', [])) + '\n'
for media, lst in sortie.items():
    if media: txt += media + '{\n' + '\n'.join(lst) + '\n}\n'
(ROOT / 'sombre_auto.css').write_text(txt, encoding='utf-8')
print(n, 'règles générées')
