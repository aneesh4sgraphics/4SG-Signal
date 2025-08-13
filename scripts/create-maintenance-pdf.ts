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
    ul { margin-left: 20px; }
  </style>
</head>
<body>
  <h1>MACHINE MAINTENANCE GUIDE</h1>
  
  <h2>DAILY MAINTENANCE</h2>
  <ul>
    <li>Clean print heads with isopropyl alcohol</li>
    <li>Check and refill ink levels</li>
    <li>Inspect for paper debris in feed path</li>
    <li>Wipe down exterior surfaces</li>
    <li>Run nozzle check pattern</li>
  </ul>

  <h2>WEEKLY MAINTENANCE</h2>
  <ul>
    <li>Deep clean all rollers with lint-free cloth</li>
    <li>Calibrate color profiles</li>
    <li>Check belt tension and alignment</li>
    <li>Clean encoder strips</li>
    <li>Test all safety sensors</li>
  </ul>

  <h2>MONTHLY MAINTENANCE</h2>
  <ul>
    <li>Replace air filters</li>
    <li>Lubricate moving parts</li>
    <li>Update printer firmware</li>
    <li>Full system diagnostic test</li>
    <li>Clean ventilation system</li>
  </ul>

  <h2>TROUBLESHOOTING TIPS</h2>
  <p><strong>Poor Print Quality:</strong> Check nozzles, clean heads, verify media settings</p>
  <p><strong>Paper Jams:</strong> Clear path, check humidity, verify paper weight</p>
  <p><strong>Color Issues:</strong> Recalibrate, check profiles, verify ink quality</p>
  <p><strong>Slow Performance:</strong> Clear print queue, check network, update drivers</p>

  <h2>CLEANING SOLUTIONS</h2>
  <ul>
    <li>Use only 99% isopropyl alcohol for print heads</li>
    <li>Mild soap solution for exterior cleaning</li>
    <li>Compressed air for dust removal</li>
    <li>Anti-static cleaner for rollers</li>
  </ul>

  <h2>SAFETY GUIDELINES</h2>
  <ul>
    <li>Always power off before maintenance</li>
    <li>Use proper grounding equipment</li>
    <li>Wear protective gloves when handling ink</li>
    <li>Ensure proper ventilation</li>
  </ul>

  <p style="margin-top: 40px;"><em>Contact 4S Graphics support for advanced maintenance procedures.</em></p>
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
  
  const pdfPath = path.join('data', 'troubleshooting-pdfs', 'maintenance-guide.pdf');
  
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
  });
  
  await browser.close();
  
  console.log(`PDF created successfully at: ${pdfPath}`);
})();