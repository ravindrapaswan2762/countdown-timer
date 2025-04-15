const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

const outputDir = path.join(__dirname, 'public', 'timers');
fs.mkdirSync(outputDir, { recursive: true });
app.use('/timers', express.static(outputDir));

async function generateCountdownImage({ targetDate, bgColor, textColor, filename, preferredSize, align, padding, margin, gap, backgroundColor }) {
  const sizeMap = {
    small: 48,
    medium: 64,
    large: 80,
    'x-large': 96,
  };

  const size = sizeMap[preferredSize] || 64;

  const html = `
    <html>
      <body style="margin:0; padding:0; background:transparent;">
        <div style="display:flex; justify-content:${align}; gap:${gap}; padding:${padding}; margin:${margin}; background:${backgroundColor};">
          ${['days','hours','minutes','seconds'].map(id => `
            <div style="width:${size}px;height:${size}px;border-radius:6px;background:${bgColor};color:${textColor};display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;font:bold 16px Arial;">
              <div id="${id}" style="font-size:1.5rem;font-weight:bold;">00</div>
              <div style="font-size:0.9rem;">${id.charAt(0).toUpperCase() + id.slice(1)}</div>
            </div>
          `).join('')}
        </div>
        <script>
          const target = new Date('${targetDate}').getTime();
          const now = Date.now();
          const diff = Math.max(target - now, 0);
          const parts = [
            Math.floor(diff / (1000*60*60*24)),
            Math.floor((diff / (1000*60*60)) % 24),
            Math.floor((diff / (1000*60)) % 60),
            Math.floor((diff / 1000) % 60)
          ];
          ['days','hours','minutes','seconds'].forEach((id, i) => {
            document.getElementById(id).innerText = parts[i].toString().padStart(2, '0');
          });
        </script>
      </body>
    </html>
  `;

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html);
  const filePath = path.join(outputDir, filename);
  await page.setViewport({ width: 360, height: 100 });
  await page.screenshot({ path: filePath, omitBackground: true });
  await browser.close();
  return `/timers/${filename}`;
}

app.get('/generate-timer', async (req, res) => {
  let {
    date,
    align = 'center',
    padding = '10px',
    margin = '',
    gap = '10px',
    preferredSize = 'medium',
    color = '#444444',
    buttonColor = '#F0F0F0',
    backgroundColor = 'transparent',
    type,
  } = req.query;

  if (!date || isNaN(Date.parse(date))) {
    date = new Date(Date.now() + 86400000).toISOString();
  }

  const filename = `timer-${Date.now()}.png`;

  try {
    const url = await generateCountdownImage({
      targetDate: date,
      bgColor: buttonColor,
      textColor: color,
      filename,
      preferredSize,
      align,
      padding,
      margin,
      gap,
      backgroundColor
    });

    if (type === 'image') {
      return res.sendFile(path.join(outputDir, filename));
    }

    res.json({ imageUrl: url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate countdown image' });
  }
});

app.listen(5001, () => {
  console.log('⏳ Countdown server running on http://localhost:5001');
});
