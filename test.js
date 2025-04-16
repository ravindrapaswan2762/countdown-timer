// const express = require('express');
// const cors = require('cors');
// const fs = require('fs');
// const path = require('path');
// const puppeteer = require('puppeteer');

// const app = express();
// app.use(cors());

// const outputDir = path.join(__dirname, 'public', 'timers');
// fs.mkdirSync(outputDir, { recursive: true });
// app.use('/timers', express.static(outputDir));

// async function generateCountdownImage({ targetDate, bgColor, textColor, filename, preferredSize, align, padding, margin, gap, backgroundColor }) {
//   const sizeMap = {
//     small: 48,
//     medium: 64,
//     large: 80,
//     'x-large': 96,
//   };
//   const size = sizeMap[preferredSize] || 64;

//   const html = `
//     <html>
//       <body style="margin:0;padding:0;background:${backgroundColor};">
//         <div style="display:flex;justify-content:${align};gap:${gap};padding:${padding};margin:${margin};">
//           ${['days','hours','minutes','seconds'].map(id => `
//             <div style="width:${size}px;height:${size}px;border-radius:6px;background:${bgColor};color:${textColor};display:flex;flex-direction:column;justify-content:center;align-items:center;font:bold 16px Arial;">
//               <div id="${id}" style="font-size:1.5rem;">00</div>
//               <div style="font-size:0.9rem;">${id.charAt(0).toUpperCase() + id.slice(1)}</div>
//             </div>
//           `).join('')}
//         </div>
//         <script>
//           const target = new Date('${targetDate}').getTime();
//           const now = Date.now();
//           const diff = Math.max(target - now, 0);
//           const parts = [
//             Math.floor(diff / (1000*60*60*24)),
//             Math.floor((diff / (1000*60*60)) % 24),
//             Math.floor((diff / (1000*60)) % 60),
//             Math.floor((diff / 1000) % 60)
//           ];
//           ['days','hours','minutes','seconds'].forEach((id, i) => {
//             document.getElementById(id).innerText = parts[i].toString().padStart(2, '0');
//           });
//         </script>
//       </body>
//     </html>
//   `;

//   const browser = await puppeteer.launch({
//     args: ['--no-sandbox', '--disable-setuid-sandbox'],
//     headless: 'new',
//   });

//   const page = await browser.newPage();
//   await page.setViewport({ width: 360, height: 100 });
//   await page.setContent(html, { waitUntil: 'domcontentloaded' });

//   const filePath = path.join(outputDir, filename);
//   await page.screenshot({ path: filePath, omitBackground: true });
//   await browser.close();

//   return `/timers/${filename}`;
// }

// app.get('/generate-timer', async (req, res) => {
//   const {
//     date,
//     align = 'center',
//     padding = '10px',
//     margin = '',
//     gap = '10px',
//     preferredSize = 'medium',
//     color = '#444444',
//     buttonColor = '#F0F0F0',
//     backgroundColor = 'transparent',
//     type,
//   } = req.query;

//   const filename = `timer-${Date.now()}.png`;
//   const finalDate = !date || isNaN(Date.parse(date)) ? new Date(Date.now() + 86400000).toISOString() : date;

//   try {
//     const url = await generateCountdownImage({
//       targetDate: finalDate,
//       bgColor: buttonColor,
//       textColor: color,
//       filename,
//       preferredSize,
//       align,
//       padding,
//       margin,
//       gap,
//       backgroundColor,
//     });

//     if (type === 'image') {
//       return res.sendFile(path.join(outputDir, filename));
//     }

//     res.json({ imageUrl: url });
//   } catch (err) {
//     console.error("❌ Puppeteer Error:", err.message);
//     res.status(500).json({ error: `Failed to generate countdown image: ${err.message}` });
//   }
// });

// const PORT = process.env.PORT || 5001;
// app.listen(PORT, () => {
//   console.log(`⏳ Countdown server running on: ${PORT}`);
// });



// *************************************************************************************************

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

// Default options with session support
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

// Session storage for different timer configurations
const sessions = new Map();

// Browser instance management
let browser;
let page;
let currentImageFile = 'live-timer.png';
let isUpdating = false;

async function initBrowser() {
  browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process'
    ],
  });
  page = await browser.newPage();
  await page.setViewport({ width: 360, height: 100 });
}

function getHtml(options) {
  const sizeMap = {
    small: 48,
    medium: 64,
    large: 80,
    'x-large': 96,
  };
  const size = sizeMap[options.preferredSize] || 64;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            margin: 0;
            padding: 0;
            background: ${options.backgroundColor};
            font-family: Arial, sans-serif;
          }
          .timer-container {
            display: flex;
            justify-content: ${options.align};
            gap: ${options.gap};
            padding: ${options.padding};
            margin: ${options.margin};
          }
          .timer-unit {
            width: ${size}px;
            height: ${size}px;
            border-radius: 6px;
            background: ${options.bgColor};
            color: ${options.textColor};
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            font-weight: bold;
          }
          .timer-value {
            font-size: 1.5rem;
          }
          .timer-label {
            font-size: 0.9rem;
          }
        </style>
      </head>
      <body>
        <div class="timer-container">
          ${['days','hours','minutes','seconds'].map(id => `
            <div class="timer-unit">
              <div id="${id}" class="timer-value">00</div>
              <div class="timer-label">${id.charAt(0).toUpperCase() + id.slice(1)}</div>
            </div>
          `).join('')}
        </div>
        <script>
          function updateTimer() {
            const target = new Date('${options.targetDate}').getTime();
            const now = Date.now();
            const diff = Math.max(target - now, 0);
            const parts = [
              Math.floor(diff / (1000*60*60*24)),
              Math.floor((diff / (1000*60*60)) % 24),
              Math.floor((diff / (1000*60)) % 60),
              Math.floor((diff / 1000) % 60)
            ];
            ['days','hours','minutes','seconds'].forEach((id, i) => {
              const element = document.getElementById(id);
              if (element) {
                element.textContent = parts[i].toString().padStart(2, '0');
              }
            });
          }
          updateTimer();
          setInterval(updateTimer, 1000);
          setInterval(() => document.body.offsetHeight, 1000);
        </script>
      </body>
    </html>
  `;
}

async function updateTimerImage(sessionId = 'default') {
  if (isUpdating) return;
  isUpdating = true;

  try {
    const options = sessions.get(sessionId) || defaultOptions;
    const html = getHtml(options);

    if (!browser || !page) {
      await initBrowser();
    }

    await page.setContent(html, { waitUntil: 'networkidle0' });
    const filePath = path.join(outputDir, currentImageFile);
    await page.screenshot({
      path: filePath,
      type: 'png',
      omitBackground: true
    });

    return filePath;
  } catch (err) {
    console.error('Error updating timer:', err);
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error('Error closing browser:', e);
      }
      browser = null;
      page = null;
    }
    throw err;
  } finally {
    isUpdating = false;
  }
}

// Update timer every second
const updateInterval = setInterval(async () => {
  try {
    await updateTimerImage();
  } catch (err) {
    console.error('Periodic update failed:', err);
  }
}, 1000);

// API endpoint
app.get('/live-timer.png', async (req, res) => {
  const sessionId = req.query.sessionId || 'default';
  
  // Update or create session options
  if (Object.keys(req.query).length > 0) {
    const sessionOptions = {
      ...defaultOptions,
      ...sessions.get(sessionId),
      ...req.query
    };
    sessions.set(sessionId, sessionOptions);
  }

  // Set proper headers
  res.set({
    'Content-Type': 'image/png',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  // Send the file
  const filePath = path.join(outputDir, currentImageFile);
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error sending file:', err);
      res.status(500).send('Error serving timer image');
    }
  });
});

// Cleanup handlers
process.on('SIGINT', async () => {
  clearInterval(updateInterval);
  if (browser) {
    await browser.close().catch(console.error);
  }
  process.exit();
});

// Initialize server
const PORT = process.env.PORT || 5001;
app.listen(PORT, async () => {
  console.log(`⏳ Countdown server running on: http://localhost:${PORT}`);
  try {
    await initBrowser();
    await updateTimerImage();
    console.log(`Timer images will be saved to: ${outputDir}`);
  } catch (err) {
    console.error('Initialization failed:', err);
    process.exit(1);
  }
});