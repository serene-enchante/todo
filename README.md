# Steps

Open `index.html` in a modern browser. Lessons and progress are kept in that browser's local storage; nothing is uploaded to a server.

## Install as an app

The web app manifest and service worker cache the interface for offline use. To install it, serve this folder from an HTTPS website (or `localhost` while developing); service workers cannot run from a `file://` URL. On iPhone or iPad, open the HTTPS site in Safari and use **Share → Add to Home Screen**. On a Mac, open the HTTPS site in Safari and use **File → Add to Dock** where available, or install it from a supported browser's install control. Keep using the same site address so the installed app sees the same locally stored lessons and progress.

## Lesson JSON

The default shape is:

```json
{
  "title": "A lesson",
  "steps": [
    { "title": "First step", "content": "The step text." },
    { "content": "A step can omit its title." }
  ]
}
```

Use **Schema** to load a reusable mapping when your JSON uses different field names. The mapping uses dotted paths:

```json
{
  "title": "lesson.name",
  "steps": "lesson.actions",
  "stepTitle": "label",
  "stepContent": "instruction.markdown"
}
```

`title` and `steps` point into the lesson object. `stepTitle` and `stepContent` point into each step object. Steps may also be strings. A lesson can override the saved mapping by including the same object as `_schema` at its root. Imported text is displayed as text, not interpreted as HTML.
