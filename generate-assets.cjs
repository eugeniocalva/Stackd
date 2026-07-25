const { chromium } = require('playwright');
const fs = require('fs');

const svgLogo = `
<svg viewBox="0 0 130 100" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;">
  <!-- Bottom layer -->
  <polygon points="10,70 45,52 80,70 45,88" fill="#111111"/>
  <!-- Middle layer -->
  <polygon points="10,50 45,32 80,50 45,68" fill="#111111" stroke="#ffffff" stroke-width="5" stroke-linejoin="miter"/>
  <!-- Top layer -->
  <polygon points="10,30 45,12 80,30 45,48" fill="#111111" stroke="#ffffff" stroke-width="5" stroke-linejoin="miter"/>
  
  <!-- Arrow shaft -->
  <rect x="94" y="40" width="12" height="48" fill="#111111"/>
  <!-- Arrow head -->
  <polygon points="80,40 100,10 120,40" fill="#111111"/>
</svg>
`;

async function generateAssets() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // 1. Generate icon.png (Fallback legacy icon, 1024x1024)
  await page.setViewportSize({ width: 1024, height: 1024 });
  await page.setContent(`
    <style>
      body { margin: 0; padding: 0; background: #ffffff; display: flex; justify-content: center; align-items: center; height: 100vh; }
      /* Scale the logo to occupy about 40% of the tile */
      .logo-container { width: 450px; height: 346px; } 
    </style>
    <div class="logo-container">
      ${svgLogo}
    </div>
  `);
  await page.screenshot({ path: 'assets/icon.png' });

  // 1a. Generate icon-foreground.png (Transparent background)
  await page.setContent(`
    <style>
      body { margin: 0; padding: 0; background: transparent; display: flex; justify-content: center; align-items: center; height: 100vh; }
      .logo-container { width: 450px; height: 346px; } 
    </style>
    <div class="logo-container">
      ${svgLogo}
    </div>
  `);
  await page.screenshot({ path: 'assets/icon-foreground.png', omitBackground: true });

  // 1b. Generate icon-background.png (Solid white)
  await page.setContent(`
    <style>
      body { margin: 0; padding: 0; background: #ffffff; width: 1024px; height: 1024px; }
    </style>
  `);
  await page.screenshot({ path: 'assets/icon-background.png' });

  // 2. Generate splash.png (White background, logo + text, 2732x2732)
  await page.setViewportSize({ width: 2732, height: 2732 });
  await page.setContent(`
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@800&display=swap');
      body { 
        margin: 0; padding: 0; background: #ffffff; 
        display: flex; flex-direction: column; justify-content: center; align-items: center; 
        height: 100vh; gap: 88px; 
      }
      /* Logo size calculated precisely to match 120px CSS width after Android centerCrop */
      .logo-container { width: 380px; height: 292px; }
      h1 {
        font-family: 'Manrope', sans-serif;
        font-weight: 800;
        font-size: 110px;
        color: #111111;
        letter-spacing: -0.02em;
        margin: 0;
      }
    </style>
    <div class="logo-container">
      ${svgLogo}
    </div>
    <h1>Stack'd</h1>
  `);
  await page.waitForFunction('document.fonts.status === "loaded"');
  await page.screenshot({ path: 'assets/splash.png' });

  await browser.close();
  console.log('Assets generated successfully.');
}

generateAssets().catch(console.error);
