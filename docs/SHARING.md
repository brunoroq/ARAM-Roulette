# Build image sharing

The results screen exports a dedicated **1500 × 860 PNG**, independent of window
size and display scaling. `ShareBuild` owns a hidden canvas; `src/share/render.ts`
draws the existing logo/background, portrait, D/F spell assignments and all six
finalized items, with names, individual costs and total gold. It loads and decodes
same-origin bundled images and waits for Bangers before drawing. No DOM capture,
SVG foreignObject, external requests or screenshot dependencies are involved.

`src/share/model.ts` reads the finalized draft without changing it. File names use
a bounded ASCII slug, such as `aram-roulette-akshan-build.png`.

## Native output

In Tauri, `src/share/output.ts` uses the official clipboard-manager plugin and
`Image.fromBytes` (`image-png` enabled in Rust) to copy an actual native image.
The temporary native image resource is closed after use. Browser clipboard
support is used only in the web build, never as a fallback for Tauri.

If copying fails, the UI announces the failure and offers **SAVE PNG**. This
option is also available after a successful copy. Tauri's dialog plugin opens
Save As, then its filesystem plugin writes the PNG to the selected path. The
capability allows image writes, image decoding/resource cleanup, save dialogs,
and file writes; it does not grant arbitrary filesystem scope or clipboard reads.
The dialog grants access to its selected file. Cancel and errors remain retryable.

Portable and installer builds use the same renderer, Rust plugins and capability.
Saving is independent of the portable `app-data` folder and installation path.
No external executable or additional app resource is required by this feature.

References: [Clipboard](https://v2.tauri.app/plugin/clipboard/),
[Image API](https://v2.tauri.app/reference/javascript/api/namespaceimage/),
[Dialog](https://v2.tauri.app/plugin/dialog/).

## Validation

Automated tests cover exact champion/items/gold/spell assignments, sanitized
filenames, busy-click suppression, copied feedback reset, rendering failures,
clipboard failure/save fallback, cancellation/retry, native image resource cleanup,
selected save paths, and disk errors. Native adapter tests mock plugin calls;
they do not prove Windows clipboard behavior.

On Arch Linux, the actual canvas PNG and browser download have been exercised
in Chromium at device scale factor 2, including EN/ES labels. The production
bundle also generated a PNG under the application CSP with no external requests.
The local native release build passes, validating plugin registration and capability
names. These checks are **not**
Windows/WebView2 or Discord paste verification.

Before shipping, run the following against **both** the extracted portable
Windows build and the installed NSIS build:

1. Finalize a build, including swapped D/F spells and any rerolled items.
2. Press SHARE BUILD. Confirm temporary COPIED feedback and no layout flash.
3. Paste into Discord or Paint using Ctrl+V. Compare champion, D/F assignments,
   all six items, names, individual costs and total against the result screen.
4. Save with SAVE PNG. Open it and confirm 1500 × 860 dimensions, legible text,
   no controls/footer/chrome and acceptable quality at 100% and 200% scaling.
5. Cancel Save As, retry, and test a destination containing spaces/non-ASCII text.
6. Force clipboard unavailability (e.g. hold it open in a test utility). Confirm
   save fallback appears, and saving still works. Also exercise a write failure.
7. Repeat in ES and with a long champion/item name. Repeat with network disabled.
8. For portable, run from an extracted folder with spaces and verify the image
   is saved to the selected location, not implicitly into `app-data`.

Windows image copying, Discord paste, and runtime behavior in the actual portable
and installed Windows packages remain unverified in this Linux environment.
