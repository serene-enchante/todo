# Steps

Open `index.html` in a modern browser. Lessons and progress are kept in that browser's local storage. Use **Sync Drive** on the hosted HTTPS app to merge them with the app's private Google Drive app data folder.

## Google Drive sync

The app requests the `drive.appdata` permission and stores one JSON backup in the hidden app data folder associated with the Google Cloud project. Sync is started by pressing **Sync Drive**; the access token is held in memory and is not saved by the app. Lessons are merged by ID and completed step indices are combined. Add the GitHub Pages origin to the OAuth web client's authorized JavaScript origins and add the Google account as a test user while the OAuth app is in Testing mode.

Use the book menu at the top of the sidebar to switch books or choose **Add new book…** to upload a PDF to the same private app data folder. New lessons are assigned to the selected book. The book files are only accessible through this app and do not appear in the normal Drive file list.

## Copy a step to Gemini

Open a lesson and press the copy icon in the upper-right corner. The clipboard JSON includes that lesson, the current step, and completed step numbers; paste it into Gemini when asking for help.

## Install as an app

The web app manifest and service worker cache the interface for offline use. To install it, serve this folder from an HTTPS website (or `localhost` while developing); service workers cannot run from a `file://` URL. On iPhone or iPad, open the HTTPS site in Safari and use **Share → Add to Home Screen**. On a Mac, open the HTTPS site in Safari and use **File → Add to Dock** where available, or install it from a supported browser's install control. Keep using the same site address so the installed app sees the same locally stored lessons and progress.

## Lesson JSON

The default shape is:

```json
{
  "title": "A lesson",
  "steps": [
    {
      "title": "First step",
      "content": "The step text.",
      "citations": [
        {
          "source": "AVID Tutorial Book",
          "printedPage": 42,
          "pdfPage": 47,
          "lines": "3-8",
          "section": "Tutorial preparation",
          "quote": "A short exact excerpt supporting this step."
        }
      ]
    },
    { "content": "A step can omit its title." }
  ]
}
```

Each step can include a `citations` array. The lesson view displays the source, page, line range, section, and excerpt; copying a step to Gemini includes the citations. When the lesson belongs to an uploaded book, clicking its citation searches the full PDF text for the exact `quote`, opens the in-app viewer at the match, and highlights the matching text. The PDF is cached on the device after its first download. Include a short exact quote so search can locate the passage; the page values remain useful as a fallback. A citation can instead include an `https://` `url` to open a direct web source. Use printed page numbers in `printedPage`; add `pdfPage` when the PDF viewer's page index differs. Never invent line numbers. If the book has no stable line numbering, use `"lines": null` and include a short exact quote plus its section.

Use **Schema** to load a reusable mapping when your JSON uses different field names. The mapping uses dotted paths:

```json
{
  "title": "lesson.name",
  "steps": "lesson.actions",
  "stepTitle": "label",
  "stepContent": "instruction.markdown"
}
```

`title` and `steps` point into the lesson object. `stepTitle`, `stepContent`, and optional `stepCitations` point into each step object. Steps may also be strings. A lesson can override the saved mapping by including the same object as `_schema` at its root. Imported text is displayed as text, not interpreted as HTML.

Import lesson JSON from a file with **Upload lesson** or paste it with **Paste JSON**. The lesson is assigned to the currently selected book.
