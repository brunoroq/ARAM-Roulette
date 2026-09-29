// Public URLs respect Vite's relative base for the packaged Tauri app.
const asset = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`;

// The extensionless logo originals are preserved; .svg copies supply the correct MIME type.
// PNG paper avoids the visible fill artifacts in the traced SVG.
export const assets = {
  logoMain: asset('logo1.svg'),
  logoCompact: asset('logo2.svg'),
  mascotDefault: asset('dice-default.svg'),
  mascotWorried: asset('dice-worried.svg'),
  rulesPaper: asset('paper-rules.png'),
  background: asset('background.png'),
};
