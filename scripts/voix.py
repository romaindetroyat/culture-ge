"""Voix de Culture Gé : fichiers audio (Piper, voix « Siwis ») pour toutes les questions et réponses.

Chaque texte lu par l'appli a une clé : cle(texte) = cyrb53(canon(texte)) en base 36, calculée à
l'identique dans app/app.js. L'appli cherche le fichier <URL_VOIX>/<2 premiers caractères>/<clé>.mp3
et se rabat sur la voix du téléphone s'il n'existe pas (texte modifié, pas de connexion…).

    python3 scripts/voix.py liste                          # nombre de textes à produire
    python3 scripts/voix.py essai "texte"                  # affiche le texte réellement prononcé
    python3 scripts/voix.py produire DOSSIER [MODELE] [i/n] # génère les .mp3 manquants dans DOSSIER

DOSSIER est une copie du dépôt culture-ge-voix (publié sur GitHub Pages). MODELE est le chemin de
fr_FR-siwis-medium.onnx (cherché dans le dépôt s'il est omis) ; i/n ne traite qu'une tranche des
textes, pour lancer plusieurs productions en parallèle.

Voix : fr_FR-siwis-medium (licence CC BY 4.0), modèle Piper.
"""
import json
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------- clés (identiques à app.js)


def texte_parle(t):
    t = re.sub(r'\s*\(([^)]*)\)', r', \1', str(t))
    t = re.sub(r'\s*[«»]\s*', ' ', t)
    return re.sub(r'\bN°\s*', 'numéro ', t)


def canon(t):
    return re.sub(r'\s+', ' ', texte_parle(t)).strip()


def cyrb53(texte, graine=0):
    m = 0xFFFFFFFF
    h1, h2 = 0xDEADBEEF ^ graine, 0x41C6CE57 ^ graine
    unites = texte.encode('utf-16-le')
    for i in range(0, len(unites), 2):
        ch = unites[i] | (unites[i + 1] << 8)
        h1 = ((h1 ^ ch) * 2654435761) & m
        h2 = ((h2 ^ ch) * 1597334677) & m
    h1 = ((h1 ^ (h1 >> 16)) * 2246822507) & m
    h1 ^= ((h2 ^ (h2 >> 13)) * 3266489909) & m
    h2 = ((h2 ^ (h2 >> 16)) * 2246822507) & m
    h2 ^= ((h1 ^ (h1 >> 13)) * 3266489909) & m
    return 4294967296 * (2097151 & h2) + h1


def base36(n):
    chiffres = '0123456789abcdefghijklmnopqrstuvwxyz'
    s = ''
    while True:
        n, r = divmod(n, 36)
        s = chiffres[r] + s
        if not n:
            return s


def cle(texte):
    return base36(cyrb53(canon(texte)))

# ---------------------------------------------------------------- nombres en toutes lettres


UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
          'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize']
DIZAINES = {2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante'}


def nombre(n):
    if n < 17:
        return UNITES[n]
    if n < 20:
        return 'dix-' + UNITES[n - 10]
    if n < 70:
        d, u = divmod(n, 10)
        return DIZAINES[d] + ('' if u == 0 else ' et un' if u == 1 else '-' + UNITES[u])
    if n < 80:
        return 'soixante' + (' et onze' if n == 71 else '-' + nombre(n - 60))
    if n < 100:
        return 'quatre-vingt' + ('s' if n == 80 else '-' + nombre(n - 80))
    if n < 1000:
        c, r = divmod(n, 100)
        tete = 'cent' if c == 1 else UNITES[c] + ' cent' + ('s' if r == 0 else '')
        return tete + ('' if r == 0 else ' ' + nombre(r))
    if n < 1000000:
        m, r = divmod(n, 1000)
        tete = 'mille' if m == 1 else nombre(m).removesuffix('s') + ' mille'
        return tete + ('' if r == 0 else ' ' + nombre(r))
    return str(n)


def ordinal(n, feminin=False):
    if n == 1:
        return 'première' if feminin else 'premier'
    mot = nombre(n)
    if mot.endswith('cinq'):
        return mot + 'uième'
    if mot.endswith('neuf'):
        return mot[:-1] + 'vième'
    if mot.endswith(('cents', 'vingts')):
        mot = mot[:-1]
    if mot.endswith('e'):
        mot = mot[:-1]
    return mot + 'ième'


ROMAINS = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100}


def romain(s):
    total, prec = 0, 0
    for c in reversed(s):
        v = ROMAINS[c]
        total = total - v if v < prec else total + v
        prec = max(prec, v)
    return total


def romain_valide(s):
    n = romain(s)
    return 0 < n < 400 and ecrire_romain(n) == s


def ecrire_romain(n):
    s = ''
    for v, l in [(100, 'C'), (90, 'XC'), (50, 'L'), (40, 'XL'), (10, 'X'), (9, 'IX'), (5, 'V'), (4, 'IV'), (1, 'I')]:
        while n >= v:
            s += l
            n -= v
    return s

# ---------------------------------------------------------------- texte réellement prononcé


def prononcer(texte):
    t = canon(texte)
    # Ordinaux : 1er, 2e, XVIIIe, IIIe, 1re…
    def ord_(m):
        brut, suffixe = m.group(1), m.group(2)
        n = int(brut) if brut.isdigit() else romain(brut)
        if not brut.isdigit() and (not romain_valide(brut) or brut in ('L', 'C')):  # « Le », « Ce »
            return m.group(0)
        feminin = suffixe in ('re', 'ère', 'nde')
        if suffixe in ('nd', 'nde'):
            return 'seconde' if feminin else 'second'
        return ordinal(n, feminin)
    t = re.sub(r'\b(\d{1,4}|[IVXLC]{1,7})(er|re|ère|e|ème|nd|nde)\b', ord_, t)
    # Milliers séparés par une espace : 1 500, 20 000 000
    t = re.sub(r'\b\d{1,3}(?: \d{3})+\b', lambda m: m.group(0).replace(' ', ''), t)
    # Numéros de souverains : Louis XIV, Jean-Paul II (au moins deux lettres : pas « Malcolm X »)
    def regne(m):
        r = m.group(2)
        return m.group(1) + nombre(romain(r)) if romain_valide(r) else m.group(0)
    t = re.sub(r"(\b[A-ZÀ-Ý][\w'’-]+ )([IVXL]{2,6})\b", regne, t)
    # Unités et abréviations
    t = t.replace('−', 'moins ').replace('av. J.-C.', 'avant Jésus-Christ').replace('apr. J.-C.', 'après Jésus-Christ')
    t = t.replace('J.-C.', 'Jésus-Christ')
    remplacements = [
        (r'(\d) ?°C\b', r'\1 degrés Celsius'), (r'(\d) ?°F\b', r'\1 degrés Fahrenheit'), (r'(\d) ?°', r'\1 degrés'),
        (r'(\d) ?km/h\b', r'\1 kilomètres-heure'), (r'(\d) ?km/s\b', r'\1 kilomètres par seconde'),
        (r'(\d) ?km²', r'\1 kilomètres carrés'), (r'(\d) ?m²', r'\1 mètres carrés'), (r'(\d) ?m³', r'\1 mètres cubes'),
        (r'(\d) ?km\b', r'\1 kilomètres'), (r'(\d) ?cm\b', r'\1 centimètres'), (r'(\d) ?mm\b', r'\1 millimètres'),
        (r'(\d) ?kg\b', r'\1 kilos'), (r'(\d) ?m\b', r'\1 mètres'), (r'(\d) ?g\b', r'\1 grammes'),
        (r'\bM\. (?=[A-ZÀ-Ý])', 'Monsieur '), (r'\bMme (?=[A-ZÀ-Ý])', 'Madame '), (r'\bSt-', 'Saint-'), (r'\bSte-', 'Sainte-'),
        (r' & ', ' et '),
    ]
    for motif, rempl in remplacements:
        t = re.sub(motif, rempl, t)
    return t

# ---------------------------------------------------------------- mots étrangers

# Siwis n'a appris que les sons du français : un son anglais (ɹ, θ, ʊ…) sort déformé. Chaque son
# étranger est remplacé par le son français le plus proche, comme le ferait un présentateur.
SONS_FRANCAIS = set(' -abdefijklmnopstuvwyzøŋœɑɔəɛɡɪɲʁʃʒʲˈˌː\u0303,.;:!?…')
VERS_FRANCAIS = [
    ('ɪə', 'iʁ'), ('ɪɹ', 'iʁ'), ('eə', 'ɛʁ'), ('ɛə', 'ɛʁ'), ('ʊə', 'uʁ'), ('ɜː', 'œʁ'), ('ɜ', 'œʁ'), ('ɚ', 'œʁ'), ('ɝ', 'œʁ'),
    ('eɪ', 'ɛj'), ('aɪ', 'aj'), ('ɔɪ', 'ɔj'), ('aʊ', 'aw'), ('əʊ', 'o'), ('oʊ', 'o'),
    ('ɔː', 'ɔ'), ('ɑː', 'a'), ('uː', 'u'), ('iː', 'i'), ('ɪ', 'i'), ('ʊ', 'u'), ('æ', 'a'), ('ʌ', 'œ'), ('ɒ', 'ɔ'), ('ɐ', 'a'),
    ('ɹ', 'ʁ'), ('ɾ', 'ʁ'), ('r', 'ʁ'), ('ɻ', 'ʁ'), ('θ', 's'), ('ð', 'z'), ('x', 'ʁ'), ('χ', 'ʁ'), ('ç', 'ʃ'), ('g', 'ɡ'),
    ('h', ''), ('ɦ', ''), ('ʔ', ''), ('ħ', ''), ('ʕ', ''), ('ʰ', ''), ('\u0329', ''),
    ('ɬ', 'l'), ('ɫ', 'l'), ('ʎ', 'j'), ('ɣ', 'ɡ'), ('β', 'b'), ('ʏ', 'y'), ('ɵ', 'ø'), ('ɨ', 'i'), ('ᵻ', 'i'), ('ʉ', 'y'),
    ('ɘ', 'ə'), ('ɕ', 'ʃ'), ('ʑ', 'ʒ'), ('ʐ', 'ʒ'), ('ʂ', 'ʃ'), ('c', 'k'), ('ɟ', 'ɡ'), ('ʋ', 'v'), ('ɭ', 'l'), ('ɳ', 'n'),
    ('ʈ', 't'), ('ɖ', 'd'), ('q', 'k'), ('ɯ', 'u'), ('ɤ', 'ø'), ('ɱ', 'm'), ('ʝ', 'j'), ('ɸ', 'f'), ('ʍ', 'w'),
]


def franciser(sons, etranger=True, langue='en'):
    """Sons d'un mot étranger → sons français les plus proches (sinon : seulement les sons connus)."""
    import unicodedata
    sons = unicodedata.normalize('NFD', sons)
    if etranger and langue != 'en':  # espagnol, grec… : « d » et « b » doux
        sons = sons.replace('ð', 'd').replace('β', 'b')
    if etranger:
        for etr, fr in VERS_FRANCAIS:
            sons = sons.replace(etr, fr)
    return ''.join(c for c in sons if c in SONS_FRANCAIS)


_ESPEAK = None


def espeak(texte, langue):
    """Morceaux (sons, ponctuation, fin de phrase) d'espeak-ng dans une langue (fr, en, de, it, es…)."""
    global _ESPEAK
    from piper import espeakbridge
    if _ESPEAK is None:
        from piper.phonemize_espeak import ESPEAK_DATA_DIR
        espeakbridge.initialize(str(ESPEAK_DATA_DIR))
        _ESPEAK = True
    espeakbridge.set_voice(langue)
    return espeakbridge.get_phonemes(texte)


def sons_mot(mot, langue):
    """Sons francisés d'un mot étranger. L'anglais est lu à la britannique (voyelles proches de
    l'écrit : Potter, Hollywood), avec le « r » final que prononcent les Français (Potteur)."""
    sons = ' '.join(re.sub(r'\([^)]+\)', '', ph) for ph, _, _ in espeak(mot, langue))
    if langue == 'en':
        mots, sons_mots = mot.split(), sons.split()
        if len(mots) == len(sons_mots):
            sons_mots = [re.sub(r'(iə|ɪə|eə|ʊə|ə|ɔː|ɑː)$', lambda m: {'ə': 'œʁ', 'iə': 'iʁ', 'ɪə': 'iʁ', 'eə': 'ɛʁ', 'ʊə': 'uʁ', 'ɔː': 'ɔʁ', 'ɑː': 'aʁ'}[m.group(1)], sm)
                         if re.search(r'r+e?s?$', w.lower()) else sm for w, sm in zip(mots, sons_mots)]
            sons = ' '.join(sons_mots)
    return franciser(sons, langue=langue)


def sons_lexique(mot, valeur):
    if valeur.startswith('[['):
        return franciser(valeur[2:-2])
    if valeur.startswith('='):
        return franciser(' '.join(re.sub(r'\([^)]+\)', '', ph) for ph, _, _ in espeak(valeur[1:], 'fr')))
    return sons_mot(mot, valeur)


def lexique():
    """data/prononciation.json : mot (ou expression) → langue de prononciation (« en », « de », « it »,
    « es »…), sons imposés en API française (« [[bak]] »), ou graphie lue à la française (« =Bak »)."""
    chemin = RACINE / 'data' / 'prononciation.json'
    d = json.loads(chemin.read_text()) if chemin.exists() else {}
    return {m: v for m, v in d.items() if not m.startswith('_')}


_LEXIQUE = None


def mots_etrangers(t):
    """Remplace les mots du lexique par leurs sons, dans un bloc [[ ]] lu tel quel."""
    global _LEXIQUE
    if _LEXIQUE is None:
        lex = lexique()
        motif = re.compile(r"(?<![\w'’-])(" + '|'.join(re.escape(m) for m in sorted(lex, key=len, reverse=True))
                           + r")(?![\w-])") if lex else None
        _LEXIQUE = (motif, lex)
    motif, lex = _LEXIQUE
    if not motif:
        return t

    def sons(m):
        return '[[' + sons_lexique(m.group(1), lex[m.group(1)]) + ']]'
    return motif.sub(sons, t)


def phonemes(texte):
    """Sons de chaque phrase, prêts pour la voix. Comme Piper, avec en plus : les mots du lexique,
    et les mots qu'espeak lit en anglais (marqués « (en)…(fr) ») francisés."""
    import unicodedata
    phrases, phrase = [], ''
    for i, partie in enumerate(re.split(r'(\[\[.*?\]\])', mots_etrangers(prononcer(texte)))):
        if partie.startswith('[['):
            phrase += partie[2:-2]
            continue
        if not partie.strip():
            phrase += partie and ' '
            continue
        # Ponctuation juste après un bloc [[ ]] : espeak ignorerait une virgule en début de texte.
        tete = re.match(r'\s*([,;:.!?…])', partie)
        if tete and i:
            phrase += tete.group(1)
            if tete.group(1) in '.!?…':
                phrases.append(phrase)
                phrase = ''
            else:
                phrase += ' '
            partie = partie[tete.end():]
            if not partie.strip():
                continue
        elif partie[0].isspace() and phrase and not phrase.endswith(' '):
            phrase += ' '
        for sons, ponctuation, fin in espeak(partie, 'fr'):
            sons = re.sub(r'\((\w+)\)(.*?)(?:\(fr\)|$)', lambda m: franciser(m.group(2)), sons)
            phrase += franciser(sons, etranger=False) + ponctuation + (' ' if ponctuation and ponctuation in ',:;' else '')
            if fin and ponctuation and ponctuation in '.!?…':
                phrases.append(phrase)
                phrase = ''
        if partie[-1].isspace() and phrase and not phrase.endswith(' '):
            phrase += ' '
    if phrase.strip():
        phrases.append(phrase)
    return [list(unicodedata.normalize('NFD', p.lstrip())) for p in phrases if p.strip()]

# ---------------------------------------------------------------- textes à produire


def pluriel(n, mot):
    return f"{n} {mot}{'s' if n > 1 else ''}"


def phrases_fixes():
    """Mêmes morceaux que ceux que app.js et soiree.js passent à dire()."""
    p = ['Bonne réponse !', 'Non. La réponse était :', 'La réponse :', 'Raté. La réponse était :', 'La réponse était :',
         'Série terminée :', 'Carte du jour terminée :', 'Partie terminée.', 'Nouveau record !',
         'Défi remporté !', 'Défi perdu…', 'Égalité !',
         "Histoire. Quelle reine exerce la régence pendant l'enfance de Louis quatorze ? La réponse : Anne d'Autriche."]
    p += [f'Question {n}.' for n in range(1, 31)]
    for n in range(0, 201):
        p += [pluriel(n, 'point') + ',', pluriel(n, 'point') + '.', f"Score adverse : {pluriel(n, 'point')}."]
    for total in [6, 10, 20, 30] + list(range(3, 203)):  # séries, carte du jour (…sur 6,), survie (3 erreurs)
        for n in range(0, min(total, 200) + 1):
            if total > 30 and n != total - 3:
                continue
            base = f"{pluriel(n, 'bonne')} réponse{'s' if n > 1 else ''} sur {total}"
            p += [base + '.', base + ',']
    return p


def textes():
    d = json.loads((RACINE / 'app' / 'cartes.json').read_text())
    cats = [c['nom'] for c in d['categories']]
    tout = []
    for carte in d['cartes']:
        for i, q in enumerate(carte):
            lu = q[5] if len(q) > 5 and q[5] else q[0]
            tout.append(f'{cats[i]}. {lu}')
            tout.append(q[1])
    tout += phrases_fixes()
    vus, uniques = set(), []
    for t in tout:
        k = cle(t)
        if k not in vus:
            vus.add(k)
            uniques.append((k, t))
    return uniques


def empreinte(sons):
    import hashlib
    return hashlib.sha1('|'.join(''.join(p) for p in sons).encode()).hexdigest()[:12]


def produire(dossier, lot=None):
    """Génère les fichiers manquants, et ceux dont les sons ont changé (lexique, règles) : le fichier
    sons.tsv du dossier garde l'empreinte des sons de chaque fichier."""
    import numpy as np
    import lameenc
    from piper import PiperVoice
    from piper.config import SynthesisConfig
    modele = Path(sys.argv[3]) if len(sys.argv) > 3 else next(RACINE.glob('**/fr_FR-siwis-medium.onnx'))
    voix = PiperVoice.load(str(modele))
    sr = voix.config.sample_rate
    cfg = SynthesisConfig(length_scale=1.05)
    silence = np.zeros(int(sr * 0.25), dtype=np.int16)
    dossier = Path(dossier)
    index_chemin = dossier / (f'sons-{lot.replace("/", "-")}.tsv' if lot else 'sons.tsv')
    index = {}
    for f in [dossier / 'sons.tsv', index_chemin]:
        if f.exists():
            index.update(dict(l.split('\t') for l in f.read_text().split('\n') if l))
    liste = textes()
    if lot:
        i, n = map(int, lot.split('/'))
        liste = liste[i::n]
    faits = 0
    for k, t in liste:
        chemin = dossier / k[:2] / f'{k}.mp3'
        sons_phrases = phonemes(t)
        e = empreinte(sons_phrases)
        if chemin.exists() and index.get(k) == e:
            continue
        morceaux = []
        for sons in sons_phrases:
            audio = voix.phoneme_ids_to_audio(voix.phonemes_to_ids(sons), cfg)
            audio = audio / max(float(np.max(np.abs(audio))), 1e-8)
            morceaux += [(np.clip(audio, -1, 1) * 32767).astype(np.int16), silence]
        pcm = np.concatenate(morceaux[:-1] or [silence]).tobytes()
        enc = lameenc.Encoder()
        enc.set_bit_rate(32)
        enc.set_in_sample_rate(sr)
        enc.set_channels(1)
        enc.set_quality(2)
        chemin.parent.mkdir(parents=True, exist_ok=True)
        chemin.write_bytes(enc.encode(pcm) + enc.flush())
        index[k] = e
        faits += 1
        if faits % 500 == 0:
            print(lot or '', faits, 'fichiers', flush=True)
            index_chemin.write_text(''.join(f'{c}\t{v}\n' for c, v in sorted(index.items())))
    index_chemin.write_text(''.join(f'{c}\t{v}\n' for c, v in sorted(index.items())))
    print(lot or '', 'terminé :', faits, 'fichiers produits', flush=True)


if __name__ == '__main__':
    commande = sys.argv[1] if len(sys.argv) > 1 else 'liste'
    if commande == 'liste':
        print(len(textes()), 'textes')
    elif commande == 'mot':  # voix.py mot "Potter" en   → sons qui seront prononcés
        print(sons_lexique(sys.argv[2], sys.argv[3]))
    elif commande == 'essai':
        print(mots_etrangers(prononcer(sys.argv[2])), '→', cle(sys.argv[2]))
        print(' | '.join(''.join(p) for p in phonemes(sys.argv[2])))
    elif commande == 'produire':
        produire(sys.argv[2], sys.argv[4] if len(sys.argv) > 4 else None)
