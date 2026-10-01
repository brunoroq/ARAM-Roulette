// Public URLs respect Vite's relative base for the packaged Tauri app.
const asset = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`;

// The home hero keeps the original logo; the compact header uses the supplied PNG.
export const assets = {
  logoMain: asset('logo1.svg'),
  logoCompact: asset('logo2.png'),
  mascotDefault: asset('dice-default.svg'),
  mascotWorried: asset('dice-worried.svg'),
  rulesPaper: asset('paper-rules.png'),
  background: asset('background.png'),
};
