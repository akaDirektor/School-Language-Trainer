# Wort für Wort · School Language Trainer

A small, dependency-free school vocabulary trainer for iPhone, tablet and computer. English first; an independent Spanish dictionary is ready for later. Translations and interface are German.

## Learning

- **Word cards:** think of the translation, reveal both complete dictionary forms (including articles), then mark known / practise again. Three consecutive correct cards unlock the next stages.
- **Active recall:** translate mentally, reveal and self-assess. Prioritises weaker words.
- **Context:** type the exact missing form in a textbook or clearly labelled supplemental AI sentence. Articles and accents in the answer are required. Textbook sentences take priority. No live AI or translation service is called.
- Named lessons/topics, multiple lessons per word, combined lesson filters, word-type/date/mastery filters, search, editing, hiding and restoring words.
- Separate per-language counters, matching streaks, ready words, recall success, context success, accuracy, mistakes, seven-day activity, and a combined parent summary.

The canonical dictionaries in `data/en.json` and `data/es.json` deliberately start empty. Add only reviewed textbook vocabulary. The optional demo uses separate in-memory data and never writes into real dictionaries.

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
