"""Génère app/rappels/HHh.ics : un rendez-vous quotidien « carte du jour » par heure (6 h à 22 h).

L'heure est flottante (heure locale du téléphone). Relancer après un changement d'adresse du site :
    python3 scripts/rappels_ics.py
"""
from pathlib import Path

URL = 'https://romaindetroyat.github.io/culture-ge/?jour'
DOSSIER = Path(__file__).resolve().parent.parent / 'app' / 'rappels'


def plier(ligne):
    """Coupe les lignes à 75 octets comme le demande la RFC 5545."""
    morceaux, courant = [], b''
    for car in ligne:
        octets = car.encode('utf-8')
        if len(courant) + len(octets) > (74 if morceaux else 75):
            morceaux.append(courant)
            courant = b''
        courant += octets
    morceaux.append(courant)
    return '\r\n '.join(m.decode('utf-8') for m in morceaux)


def main():
    DOSSIER.mkdir(exist_ok=True)
    for hh in range(6, 23):
        lignes = [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Culture Gé//Carte du jour//FR',
            'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            f'UID:carte-du-jour-{hh:02d}h@trivial1000',  # inchangé : réimporter remplace l'ancien rendez-vous
            'DTSTAMP:20260929T000000Z',
            f'DTSTART:20260929T{hh:02d}0000',
            'DURATION:PT10M',
            'RRULE:FREQ=DAILY',
            'SUMMARY:🎯 Culture Gé : carte du jour',
            f'DESCRIPTION:Six questions\\, une par couleur : la même carte pour tout le monde.\\n{URL}',
            f'URL:{URL}',
            'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Culture Gé : la carte du jour vous attend',
            'TRIGGER:PT0M', 'END:VALARM',
            'END:VEVENT', 'END:VCALENDAR',
        ]
        (DOSSIER / f'{hh:02d}h.ics').write_text('\r\n'.join(plier(l) for l in lignes) + '\r\n', encoding='utf-8', newline='')


if __name__ == '__main__':
    main()
