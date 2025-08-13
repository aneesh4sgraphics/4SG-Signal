import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 40px; }
    h1 { color: #333; }
    h2 { color: #666; margin-top: 30px; }
    p { margin: 10px 0; }
    .solution { margin-left: 20px; }
  </style>
</head>
<body>
  <h1>TROUBLESHOOTING GUIDE FOR 4S GRAPHICS PRINTING</h1>
  
  <h2>1. STATIC ISSUES</h2>
  <p><strong>Problem:</strong> Static electricity affecting print quality</p>
  <div class="solution">
    <p><strong>Solution:</strong></p>
    <ul>
      <li>Ensure humidity levels are between 40-60%</li>
      <li>Use anti-static bars or ionizers</li>
      <li>Ground all equipment properly</li>
      <li>Clean rollers regularly with anti-static cleaner</li>
    </ul>
  </div>

  <h2>2. CLEANING PROCEDURES</h2>
  <p><strong>Problem:</strong> Dirty print heads or rollers</p>
  <div class="solution">
    <p><strong>Solution:</strong></p>
    <ul>
      <li>Clean print heads daily with isopropyl alcohol</li>
      <li>Use lint-free cloths for cleaning</li>
      <li>Replace worn rollers every 6 months</li>
      <li>Run cleaning cycle after every 1000 prints</li>
    </ul>
  </div>

  <h2>3. COLOR CALIBRATION</h2>
  <p><strong>Problem:</strong> Colors not matching expectations</p>
  <div class="solution">
    <p><strong>Solution:</strong></p>
    <ul>
      <li>Calibrate monitors monthly</li>
      <li>Use color profiles specific to your printer</li>
      <li>Check ink levels and replace if low</li>
      <li>Perform nozzle check and alignment</li>
    </ul>
  </div>

  <h2>4. PAPER JAM ISSUES</h2>
  <p><strong>Problem:</strong> Frequent paper jams</p>
  <div class="solution">
    <p><strong>Solution:</strong></p>
    <ul>
      <li>Check paper alignment in tray</li>
      <li>Ensure paper is not damp or curled</li>
      <li>Clean paper path with compressed air</li>
      <li>Verify paper weight matches printer specifications</li>
    </ul>
  </div>

  <h2>5. PRINT QUALITY PROBLEMS</h2>
  <p><strong>Problem:</strong> Blurry or streaky prints</p>
  <div class="solution">
    <p><strong>Solution:</strong></p>
    <ul>
      <li>Check print head alignment</li>
      <li>Replace clogged nozzles</li>
      <li>Verify media settings match actual media</li>
      <li>Clean encoder strip</li>
    </ul>
  </div>

  <h2>6. MACHINE SETTINGS</h2>
  <p><strong>Problem:</strong> Incorrect printer settings</p>
  <div class="solution">
    <p><strong>Solution:</strong></p>
    <ul>
      <li>Set correct DPI for job type (300 DPI for photos, 150 DPI for drafts)</li>
      <li>Match color space to design file (RGB vs CMYK)</li>
      <li>Select appropriate print quality mode</li>
      <li>Configure correct paper size and orientation</li>
    </ul>
  </div>

  <h2>7. INK ISSUES</h2>
  <p><strong>Problem:</strong> Ink not adhering properly</p>
  <div class="solution">
    <p><strong>Solution:</strong></p>
    <ul>
      <li>Check substrate compatibility</li>
      <li>Ensure proper curing temperature</li>
      <li>Verify ink expiration date</li>
      <li>Pre-treat materials if necessary</li>
    </ul>
  </div>

  <h2>8. MAINTENANCE SCHEDULE</h2>
  <p><strong>Daily:</strong></p>
  <ul>
    <li>Clean print heads</li>
    <li>Check ink levels</li>
    <li>Inspect for debris</li>
  </ul>
  
  <p><strong>Weekly:</strong></p>
  <ul>
    <li>Clean rollers</li>
    <li>Calibrate colors</li>
    <li>Check alignment</li>
  </ul>
  
  <p><strong>Monthly:</strong></p>
  <ul>
    <li>Deep clean entire system</li>
    <li>Replace filters</li>
    <li>Update firmware</li>
  </ul>

  <p style="margin-top: 40px;"><em>For additional support, contact 4S Graphics technical team.</em></p>
</body>
</html>
`;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setContent(htmlContent);
  
  const pdfPath = path.join('data', 'troubleshooting-pdfs', 'printing-troubleshooting-guide.pdf');
  
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
  });
  
  await browser.close();
  
  console.log(`PDF created successfully at: ${pdfPath}`);
})();