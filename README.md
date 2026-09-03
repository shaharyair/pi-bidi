# pi-bidi

Right-to-left text — Hebrew, Arabic, Persian — rendered correctly in [Pi](https://github.com/earendil-works/pi), on terminals that have no bidi support.

Most terminal emulators shape every run left-to-right, so RTL text arrives in *logical* order and appears reversed. Ghostty, for one, has had this open since [#1442](https://github.com/ghostty-org/ghostty/issues/1442). This extension runs the Unicode Bidirectional Algorithm (UAX #9, via [`bidi-js`](https://github.com/lojjic/bidi-js)) over Pi's transcript markdown and hands the terminal text that is already in visual order.

```
before:  .הקידבל תירבעב טסקט הז !םולש
after:   שלום! זה טקסט בעברית לבדיקה.
```

## Install

```sh
pi package add pi-bidi
```

Restart Pi.

## Do not use this if your terminal already does bidi

`mlterm` and `konsole` implement bidi themselves. Reordering twice puts the text back the way it started. This extension is for terminals that do nothing — ghostty, alacritty, kitty, wezterm, xterm.

## Scope

Transcript markdown only: what Pi prints, and your own messages as they appear in the transcript.

Known limits:

- **Per line, before wrapping.** An RTL line wider than the transcript is reordered first and wrapped second, so the wrap points land in the wrong place. Short and medium lines are fine. A proper fix needs a post-wrap hook Pi does not currently expose.
- **The editor is untouched.** Text you are typing still shows in logical order; reordering it there would desync the cursor column.
- **Fenced code blocks are skipped** on purpose — reordering them would make text copied out of the terminal differ from the source. Inline code spans and RTL inside table cells are not special-cased.

## License

MIT
