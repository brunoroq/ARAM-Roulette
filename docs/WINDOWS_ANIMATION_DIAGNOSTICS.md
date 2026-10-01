# Diagnosing animation in the Windows portable app

The portable app uses the system Microsoft WebView2 Runtime. Its item reveal and
reroll sequence is driven by React state and `setTimeout`; the slot jitter is a
CSS animation. The app intentionally skips the sequence when WebView2 reports
`prefers-reduced-motion: reduce`. On Windows 11, check **Settings →
Accessibility → Visual effects → Animation effects**; on Windows 10, check
**Settings → Ease of Access → Display → Show animations in Windows**. Record the
setting before changing it.

Test the **extracted release ZIP**, not a Vite page. In PowerShell, from the
folder containing `ARAM Roulette.exe`, launch WebView2 DevTools for this run:

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--auto-open-devtools-for-tabs'
& '.\ARAM Roulette.exe'
```

This variable is only set in that PowerShell session; close the app and run
`Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` afterward. If DevTools
does not open automatically, confirm the app uses the system WebView2 Runtime
and try the same command in a new PowerShell session. Microsoft documents this
[WebView2 debugging flag](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/debug-devtools).

Before clicking through the spell screen to the item draft, paste this into
the DevTools Console. If DevTools asks to allow pasting, follow its on-screen
instruction. The probe changes no game state or RNG; it samples the page for
up to 30 seconds. It reports the media query, frame/timer progress, mounted
slots, visible slot classes, computed CSS animation, and image loading.

```js
(() => {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let frames = 0;
  let lastFrames = 0;
  let lastSample = performance.now();
  let stopped = false;
  const frame = () => {
    if (stopped) return;
    frames++;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  const sample = setInterval(() => {
    const now = performance.now();
    const slots = [...document.querySelectorAll('.roulette-slot')];
    const spinning = slots.filter(slot => slot.classList.contains('spinning'));
    const window = spinning[0]?.querySelector('.roulette-window');
    const style = window && getComputedStyle(window);
    const images = slots.flatMap(slot => [...slot.querySelectorAll('img')]);
    const rect = slots[0]?.getBoundingClientRect();
    console.log('[ARAM animation]', {
      seconds: +(now / 1000).toFixed(1),
      reducedMotion: motion.matches,
      documentVisibility: document.visibilityState,
      timerIntervalMs: Math.round(now - lastSample),
      framesSinceSample: frames - lastFrames,
      mountedSlots: slots.length,
      spinningSlots: spinning.length,
      visibleFirstSlot: !!rect && rect.width > 0 && rect.height > 0,
      slotNames: slots.map(slot => slot.querySelector('.roulette-item-name')?.textContent),
      slotIcons: slots.map(slot => slot.querySelector('.roulette-window img')?.getAttribute('src') ?? '?'),
      slotAnimation: style?.animationName ?? '(no spinning slot)',
      loadedImages: images.filter(img => img.complete && img.naturalWidth > 0).length,
      totalImages: images.length,
    });
    lastSample = now;
    lastFrames = frames;
  }, 150);
  setTimeout(() => { stopped = true; clearInterval(sample); }, 30000);
})();
```

While the probe runs, enter the item draft. Run the probe again before a
full-build reroll and again before an individual reroll. In DevTools, enable **Preserve log** and
save the Console output. Also record the WebView2 Runtime version (Windows
**Installed apps → Microsoft Edge WebView2 Runtime**) and whether other CSS
transitions, such as button hover, run. Repeat once with the Windows animation
setting enabled and restart the portable app. Do not use DevTools' emulated
reduced-motion setting for this comparison.

Interpretation:

- `reducedMotion: true`, zero spinning slots, and fully revealed names indicate
  the intended accessibility path. Enabling Windows animations should make
  `reducedMotion` false on the next run.
- `reducedMotion: false` with spinning slots and changing icons, but
  `slotAnimation: none`, points to CSS style application. Check the DevTools
  **Network** and **Elements → Computed** panels for the bundled CSS.
- `reducedMotion: false` with spinning slots but no icon changes and
  stalled timer or frame counts points to a WebView2 scheduling/rendering issue.
- Changing slot names with `loadedImages` below `totalImages` points to image
  decode/loading. Check failed requests in **Network**.
- No mounted slots means the draft screen was not reached; inspect Console
  errors and the app's screen/session state first.

The release check verifies the copied assets and built frontend, but it cannot
render WebView2 on this Linux development machine. These observations are
needed before changing the animation logic without weakening reduced-motion
support.
