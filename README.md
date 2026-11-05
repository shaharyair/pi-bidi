# pi-bidi

Right-to-left text — Hebrew, Arabic, Persian — rendered correctly in [Pi](https://github.com/earendil-works/pi), on terminals that have no bidi support.

Most terminal emulators shape every run left-to-right, so RTL text arrives in *logical* order and appears reversed. Ghostty, for one, has had this open since [#1442](https://github.com/ghostty-org/ghostty/issues/1442). This extension runs the Unicode Bidirectional Algorithm (UAX #9, via [`bidi-js`](https://github.com/lojjic/bidi-js)) over Pi's transcript markdown and the input editor, and hands the terminal text that is already in visual order.

```
before:  .הקידבל תירבעב טסקט הז !םולש
after:   שלום! זה טקסט בעברית לבדיקה.
```

## Install

```sh
pi install npm:pi-bidi
```

Or from git: `pi install git:github.com/shaharyair/pi-bidi`.

Restart Pi.

## Do not use this if your terminal already does bidi

`mlterm` and `konsole` implement bidi themselves. Reordering twice puts the text back the way it started. This extension is for terminals that do nothing — ghostty, alacritty, kitty, wezterm, xterm.

## Scope

- **Transcript:** your own messages keep per-line direction detection. Assistant replies inherit the preceding question’s direction, including English-leading or English-only lines in an RTL conversation. Text is wrapped in logical order before reordering. Headings, quotes and table columns retain their Markdown structure; links, code spans and emphasis move as one unit. Persisted replies use their own preceding question when Pi supplies message metadata; older hosts fall back to the latest question.
- **Editor:** the text you type is shown in visual order, flush right, with the cursor on the right character. Arrow keys still move logically (left arrow = one character back in the text), as in any logical-order RTL editor.

Known limits:

- **One direction per draft.** The editor takes its base direction from the first strong character of the whole draft, not per paragraph.
- **RTL reply lists use literal markers.** To keep bullets, numbers and checkboxes on the right, these items render as hard-broken paragraphs rather than parsed Markdown lists. Nested-list layout is not preserved. User-message lists retain the existing left-pinned markers.
- **Replaces the editor component.** Another extension that also sets a custom editor will conflict; the last one to load wins.
- **Fenced code blocks are skipped** on purpose — reordering them would make text copied out of the terminal differ from the source. Code span contents are not reordered either.

## License

MIT
