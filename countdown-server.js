const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(cors());

const outputDir = path.join(__dirname, 'public', 'timers');
const imageFile = 'live-timer.png';
const filePath = path.join(outputDir, imageFile);
fs.mkdir(outputDir, { recursive: true }).catch(err => {
  console.error('Failed to create output directory:', err);
  process.exit(1);
});
app.use('/timers', express.static(outputDir));

// Default options
const defaultOptions = {
  targetDate: new Date(Date.now() + 3600 * 1000).toISOString(),
  bgColor: '#6cb2eb',
  textColor: '#fbff00',
  preferredSize: 'medium',
  align: 'center',
  padding: '10px',
  margin: '0px',
  gap: '10px',
  backgroundColor: 'transparent',
};

// Session storage with TTL (1 hour)
const sessions = new Map();
const SESSION_TTL = 3600 * 1000; // 1 hour
function cleanupSessions() {
  const now = Date.now();
  for (const [sessionId, { timestamp }] of sessions) {
    if (now - timestamp > SESSION_TTL) {
      sessions.delete(sessionId);
    }
  }
}
setInterval(cleanupSessions, 60000); // Clean every minute

// Timer state
const timerState = {
  browser: null,
  page: null,
  lastImageBuffer: null,
  lastGenerated: 0,
  isUpdating: false,
};

async function initBrowser() {
  if (timerState.browser && timerState.page) return;
  try {
    timerState.browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    timerState.page = await timerState.browser.newPage();
    await timerState.page.setViewport({ width: 360, height: 100 });
    console.log('Puppeteer browser initialized');
  } catch (err) {
    console.error('Failed to initialize Puppeteer:', err);
    timerState.browser = null;
    timerState.page = null;
    throw err;
  }
}

function getHtml(options) {
  const sizeMap = { small: 48, medium: 64, large: 80, 'x-large': 96 };
  const size = sizeMap[options.preferredSize] || 64;
  const targetTime = new Date(options.targetDate).getTime();
  const now = Date.now();
  const diff = Math.max(targetTime - now, 0);
  const parts = [
    Math.floor(diff / (1000 * 60 * 60 * 24)), // Days
    Math.floor((diff / (1000 * 60 * 60)) % 24), // Hours
    Math.floor((diff / (1000 * 60)) % 60), // Minutes
    Math.floor((diff / 1000) % 60), // Seconds
  ];

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { margin: 0; padding: 0; background: ${options.backgroundColor}; font-family: Arial, sans-serif; }
          .timer-container { display: flex; justify-content: ${options.align}; gap: ${options.gap}; padding: ${options.padding}; margin: ${options.margin}; }
          .timer-unit { width: ${size}px; height: ${size}px; border-radius: 6px; background: ${options.bgColor}; color: ${options.textColor}; display: flex; flex-direction: column; justify-content: center; align-items: center; font-weight: bold; }
          .timer-value { font-size: 1.5rem; }
          .timer-label { font-size: 0.9rem; }
        </style>
      </head>
      <body>
        <div class="timer-container">
          ${['days', 'hours', 'minutes', 'seconds'].map((id, i) => `
            <div class="timer-unit">
              <div class="timer-value">${parts[i].toString().padStart(2, '0')}</div>
              <div class="timer-label">${id.charAt(0).toUpperCase() + id.slice(1)}</div>
            </div>
          `).join('')}
        </div>
      </body>
    </html>
  `;
}

async function updateTimerImage(sessionId = 'default') {
  if (timerState.isUpdating) return;
  timerState.isUpdating = true;
  const startTime = Date.now();

  try {
    const options = sessions.get(sessionId) || defaultOptions;
    const html = getHtml(options);

    if (!timerState.browser || !timerState.page) {
      await initBrowser();
    }

    await timerState.page.setContent(html, { waitUntil: 'domcontentloaded' });
    const buffer = await timerState.page.screenshot({ type: 'png', omitBackground: true });
    await fs.writeFile(filePath, buffer);
    timerState.lastImageBuffer = buffer;
    console.log(`Generated image in ${Date.now() - startTime}ms: ${filePath}`);
    return filePath;
  } catch (err) {
    console.error('Error updating timer:', err);
    if (timerState.browser) {
      try { await timerState.browser.close(); } catch (e) { console.error('Error closing browser:', e); }
      timerState.browser = null;
      timerState.page = null;
    }
    throw err;
  } finally {
    timerState.isUpdating = false;
  }
}

async function startTimerUpdates() {
  const UPDATE_INTERVAL = 1000; // 1000ms
  async function update() {
    const now = Date.now();
    const timeSinceLast = now - timerState.lastGenerated;
    const nextUpdate = Math.max(0, UPDATE_INTERVAL - timeSinceLast);

    if (timeSinceLast >= UPDATE_INTERVAL) {
      try {
        await updateTimerImage();
        timerState.lastGenerated = now;
      } catch (err) {
        console.error('Periodic update failed:', err);
      }
    }

    setTimeout(update, Math.min(nextUpdate, 100)); // Check frequently to stay on schedule
  }
  update();
}

app.get('/live-timer.png', async (req, res) => {
  const sessionId = req.query.sessionId || 'default';

  // Validate and sanitize query parameters
  const incoming = {
    targetDate: req.query.date && !isNaN(new Date(req.query.date).getTime()) ? req.query.date : undefined,
    bgColor: req.query.buttonColor?.match(/^#[0-9A-Fa-f]{6}$/) ? req.query.buttonColor : undefined,
    textColor: req.query.color?.match(/^#[0-9A-Fa-f]{6}$/) ? req.query.color : undefined,
    preferredSize: ['small', 'medium', 'large', 'x-large'].includes(req.query.preferredSize) ? req.query.preferredSize : undefined,
    align: ['left', 'center', 'right'].includes(req.query.align) ? req.query.align : undefined,
    padding: req.query.padding?.match(/^\d+px$/) ? req.query.padding : undefined,
    margin: req.query.margin?.match(/^\d+px$/) ? req.query.margin : undefined,
    gap: req.query.gap?.match(/^\d+px$/) ? req.query.gap : undefined,
    backgroundColor: req.query.backgroundColor?.match(/^#[0-9A-Fa-f]{6}$|^transparent$/) ? req.query.backgroundColor : undefined,
  };

  const cleanOptions = Object.fromEntries(Object.entries(incoming).filter(([_, v]) => v !== undefined));
  if (Object.keys(cleanOptions).length > 0) {
    sessions.set(sessionId, { ...defaultOptions, ...sessions.get(sessionId), ...cleanOptions, timestamp: Date.now() });
  }

  try {
    // Ensure the image exists
    await fs.access(filePath);
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('Error sending file:', err);
        res.status(500).send('Error serving timer image');
      }
    });
  } catch (err) {
    console.error('Error serving timer:', err);
    if (timerState.lastImageBuffer) {
      res.set({
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      res.send(timerState.lastImageBuffer);
    } else {
      res.status(503).send('Timer not ready');
    }
  }
});

process.on('SIGINT', async () => {
  if (timerState.browser) {
    await timerState.browser.close().catch(console.error);
    console.log('Puppeteer browser closed');
  }
  process.exit(0);
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, async () => {
  console.log(`⏳ Countdown server running on: http://localhost:${PORT}`);
  try {
    await initBrowser();
    await updateTimerImage();
    startTimerUpdates();
    console.log(`Timer images will be saved to: ${outputDir}`);
  } catch (err) {
    console.error('Initialization failed:', err);
    process.exit(1);
  }
});