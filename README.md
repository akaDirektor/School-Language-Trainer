# Wort für Wort · School Language Trainer

A small, dependency-free school vocabulary trainer for iPhone, tablet and computer. Independent English and Spanish dictionaries share the same training features. Translations and interface are German.

## Learning

- **Matching cards:** match up to five target-language cards with five shuffled German cards. After a correct pair, a modal asks for der/die/das for each German noun translation. Only correct articles advance the successful matching streak; article errors have separate counters. The complete entries are revealed after acknowledgement. Pending article questions survive reloads. Three consecutive correct matches are a progress milestone, never an access gate. A word is fully learned only when that same word also has at least one successful recall (either direction) and one successful context answer. Exercises may be completed in any order. The three top cards show the full database size, matching totals/stages and fully learned words; hidden entries remain part of these full-database statistics.
- **Active recall:** choose English → German or German → English, translate mentally, reveal and self-assess. Both directions keep their own cycles and counters, in addition to the historical combined totals.
- **Context (available immediately):** type the exact missing form in a textbook or clearly labelled supplemental AI sentence. Articles and accents in the answer are required. Textbook sentences take priority. No live AI or translation service is called.
- Named lessons/topics, multiple lessons per word, combined lesson filters, word-type/date/mastery filters, search, editing, hiding and restoring words.
- Separate per-language counters, matching streaks, ready words, recall success, context success, accuracy, mistakes, seven-day activity, and a combined parent summary.

All three exercises are independent and available immediately. The English corpus currently contains 35 reviewed blue headword records in Station 2 (29) and Station 3 (6); Spanish contains 30 reviewed black headword records in B1 · Block A from IMG_8589.heic, with 8 verbatim textbook example sentences and 22 authored examples. Add only reviewed textbook vocabulary. The optional demo uses separate in-memory data and never writes into real dictionaries.

## Start locally

Node 22 or later; no package installation needed:

```sh
npm test
npm start
```

Open `http://127.0.0.1:4173`. GitHub Actions verifies tests before publishing the public files to GitHub Pages. In repository Settings → Pages choose **GitHub Actions** if publishing is not enabled yet. The public site contains no progress backups, passwords, or child profiles.

## Persistence and cloud

Without cloud configuration, all changes are saved **on this device only** in a new `school-language-trainer:*` namespace. Export a backup from Settings. Original Deutsch-Trainer storage, authentication and Supabase projects are never read or changed. Cloud synchronization is not active until the new backend is configured.

For the new, separate Supabase project only:

1. Use `supabase-setup.sql` in its SQL Editor. It creates two RLS-protected tables and a revision-checked save function. The parent can read only the assigned student's progress; only the student can save.
2. In Authentication → Users create confirmed email/password accounts for the student and parent. Disable public self-signups for this private family app. Do not publish credentials.
3. Insert the two account mappings using the commented UUID template at the bottom of that SQL file. This is administrative setup; clients cannot change their assignment or role.
4. Set the new project's URL and **publishable** key in `cloud-config.js`. Never put a secret/service_role key in a browser or repository.
5. Sign in through the gear menu on every device. Use the student account to learn and the parent account to view. Changes sync after answers and poll every 15 seconds. Conflicting versions stop writes and retain the local pending version for backup; no automatic silent merging.
6. Test with two separate browsers before relying on cross-device progress. The initial cloud profile starts empty; local data is never silently uploaded. To transfer local vocabulary/progress, export a backup before connecting, then restore it intentionally as the student.

Free Supabase projects can pause for low activity. Offline operation requires an existing cached cloud profile and an already loaded app. Clearing browser data deletes local caches; retain exports. No email-report service is configured or required. Local demos and mocked cloud tests do not prove a live backend configuration.

On iPhone open the published URL in Safari → Share → Add to Home Screen. Offline app-shell caching is scoped to this repository path; no other GitHub Pages application's caches are removed.

## Importing textbook words

Settings → Import vocabulary accepts this format (example structure only; these words are not shipped in the real database):

```json
{
  "format": "school-vocabulary-v1",
  "language": "en",
  "lessons": [{"id":"unit-1","name":"Unit 1 · At school"}],
  "words": [{
    "id":"en-unit1-book",
    "term":"book",
    "de":"das Buch",
    "type":"noun",
    "lessonIds":["unit-1"],
    "addedAt":"2026-10-26",
    "reference":"Textbook · page 12",
    "examples":[{
      "sentence":"This {{word}} is interesting.",
      "answer":"book",
      "translation":"Dieses Buch ist interessant.",
      "source":"textbook",
      "reference":"Textbook · page 12"
    }]
  }]
}
```

Use source `textbook` only for an actual supplied textbook sentence; newly authored sentences use `generated`. Each sentence has exactly one `{{word}}` gap. Answers retain the actual inflected form and any required article. Supported word types: `noun`, `verb`, `adjective`, `adverb`, `phrase`, `other`. German nouns require `der/die/das`; Spanish nouns require `el/la/los/las`. Multiple translations may be separated by punctuation in `de` with the leading noun article present.

Imports are previewed before confirmation. Same-term entries merge lesson memberships and examples while retaining stable IDs/counters; conflicting translations or reused IDs are rejected atomically for manual review. Exporting vocabulary omits all progress. Backup restoration validates the whole file and downloads the previous state before replacement. Do not commit private progress exports or textbook photos to this public repository.

## Release loading and recovery

Publication runs `node prepare-public.mjs`. All application modules and CSS use content-fingerprinted filenames; imports reference the matching dependency fingerprints. The service worker caches each complete release and avoids mixing cached scripts with newer dependencies. A separate small bootstrap keeps Settings and an update action available if the main module fails. Starting training before sign-in opens the account panel with an explanation. Recovery reloads with a fresh URL and does not clear local storage, sessions, vocabulary or progress.


### Schreibblatt auf dem iPad
Unter Aktiv erinnern → Antwort → Schreibblatt stehen 10, 15 (Standard) oder 20 Zeilen bereit. Die gewählten Lektionen und die Übersetzungsrichtung gelten auch hier. Die Seite wird gemeinsam geprüft; richtige und falsche Antworten zählen als Erinnern in der gewählten Richtung. Jedes ausgewählte Wort benötigt drei kumulative richtige Schreibantworten. Nach Fehlern werden nur die fehlerhaften Wörter erneut vorgelegt; dieser Wiederholungsbedarf bleibt beim Neuladen erhalten. Sonst werden zuerst die Wörter mit den wenigsten richtigen Schreibantworten geübt. Wörter mit mindestens drei Erfolgen werden ausgeschlossen. Fehler löschen vorherige Erfolge nicht. Vollständig gelernt erfordert zusätzlich zu Zuordnen, Erinnern und Kontext mindestens drei richtige Schreibantworten. Die eigene Metrik Schreiben · 3/3 und die Zeilenzähler zeigen den Fortschritt. Deutsche Artikel sind standardmäßig optional; über Artikel üben zuschaltbar. Lösungen zeigen die vollständigen gespeicherten Artikel.

Die Felder unterstützen natives Apple Pencil Scribble (Einstellungen → Apple Pencil → Kritzeln), alternativ die Tastatur. iPadOS wandelt Handschrift lokal in Text um; geprüft wird dieser Text anhand des Wörterbuchs, keine Bewertung der Schriftform und kein externer OCR-Dienst. Erkannten Text vor Seite prüfen kontrollieren. Browserlayout und Prüfung getestet; tatsächliche Pencil-Erkennung muss auf dem iPad getestet werden.


### Daily success chart
The seven-day chart keeps all days on one row. Each day groups four bars: green matching pairs, blue mental recall, purple sentence gaps, orange writing. Heights use one common scale. Selecting a day shows exact unique-word counts; repeated successes on the same word in the same exercise and day count once. Written answers contribute to recall counters for existing mastery rules, but daily writing bars are separate from mental recall. With article questions enabled, a matching success is logged only when all articles are correct.

Optional per-word `dailyResults` records successful exercise types by date and retains at most 366 dates. Failed attempts create a dated empty record; historical `workedDays` are preserved without guessing success types. Unrecorded historical days show hatching and a dash. The chart explicitly states that exercise-level history begins with this update. Backups and cloud snapshots preserve this history; progress reset removes it.
