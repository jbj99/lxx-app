# Septuagint (LXX) Reader

An offline Greek Septuagint reader with Brenton's English translation. It is a Progressive Web App: you host these files once, open the address in Chrome on your Android phone, and choose **Add to Home screen** (or **Install app**). After that it opens like any other app and works with no connection.

## Putting it on your phone

A PWA must be served over HTTPS. Any static host works. The easiest options, all free:

1. **Netlify Drop**: go to app.netlify.com/drop and drag this whole folder onto the page. You get an https address in seconds.
2. **GitHub Pages**: upload the folder to a repository and turn on Pages in the repository settings.
3. **Cloudflare Pages**, or any folder on your own web hosting.

Then open the address in Chrome on your phone, wait a few seconds for the first load, and tap **⋮ → Install app**. The app quietly downloads all 54 books and the dictionary (about 6 MB over the network) so it works fully offline. Settings → Offline library shows progress.

To try it on a computer first: `python3 -m http.server` in this folder, then open http://localhost:8000.

## What's in it

- 54 books: the Greek Old Testament, the deuterocanonical books, 3 and 4 Maccabees, the Odes, and both Daniel texts (Old Greek and Theodotion).
- Greek verse numbering (the Psalter is numbered as in the Greek, so "Psalm 22" is "The Lord is my shepherd").
- **English on/off** with one tap. When it's off you get Greek only, either one verse per line or as flowing text.
- **Tap any Greek word** for its dictionary form, transliteration, part of speech, short meaning, a fuller definition (with the Hebrew words it translates where the lexicon notes them), and how often it occurs. **Find all uses** lists every verse containing that word, with each inflected form highlighted.
- **Navigation:** tap the book name at the top for the chapter grid and verse jump. The box at the top of that menu understands references such as `ps 118:105`, `wis 3`, `1 sam 3`, `3 kingdoms 2`, `isa 53`. Swipe left or right, or use the Previous and Next buttons, to change chapter.
- Search in Greek (accent-insensitive) or English. Tap a verse number to copy or save a verse.
- Two looks: **Parchment** (a parchment page with walnut and brass trim) and **Candlelit** (dark vellum). Automatic mode follows your phone. On a tablet or computer, Greek and English sit in two columns.

## Limits of this edition

- Brenton's English covers most books, but not 3 Maccabees, 4 Maccabees, Daniel (Theodotion), or most of the Odes. Those show Greek only.
- Verses use Swete's numbering. Where Brenton's verse divisions differ, a few English lines may sit one verse off or be missing.
- **Word meanings are matched automatically.** No openly licensed per-word tagging of Swete's text exists, so each word is matched to a dictionary entry by aligning Swete's text with the Open Scriptures lemma data (which follows Rahlfs' edition). 99.3% of the 588,103 words are tagged; the other 0.7% show "No dictionary entry was matched" rather than a guess. In the samples I checked by hand, nearly every tagged word was right. The weak spots are proper names (spelled differently in the two editions), places where the two editions have different readings, and a few irregular verbs. Full grammatical parsing (case, tense, mood) is not included, because no free data for it exists for this text. WORD-TAGGING-AUDIT.txt has the method and the numbers.
- Definitions come from Abbott-Smith and a Bible-focused edition of LSJ, so they lean towards New Testament and classical usage. The "in LXX for ..." notes show the Hebrew words behind the Greek where the lexicon records them.

## Text verification

The Greek text was cross-checked against a second transcription of Swete, which found and fixed 115 typos. See TEXT-VERIFICATION.txt for what was and was not checked, corrections-log.csv for every change (with Swete page numbers), and please-check-against-scan.csv for 22 spots that need a person to check them against the printed page. The text is not guaranteed to be 100% accurate. Isaiah and Ecclesiastes could not be cross-checked at all.

## Licence

The Greek data derives from GPL-3.0 sources, so the data files are GPL-3.0 (see LICENSE-GPL3.txt). Brenton's English is public domain. Lemma data is CC BY 4.0 (Open Scriptures), the lexicon text is CC BY 4.0 (STEPBible, Tyndale House) and, where it comes from LSJ, CC BY-SA 4.0. Cardo is under the SIL Open Font License. Full credits are in ATTRIBUTION.txt.
