const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5173');
  await new Promise(r => setTimeout(r, 1000));
  const el = await page.$('vite-error-overlay');
  if (el) {
    const text = await page.evaluate(el => el.shadowRoot.textContent, el);
    console.log(text);
  } else {
    console.log('No overlay');
  }
  await browser.close();
})();
