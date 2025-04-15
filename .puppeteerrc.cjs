/**
 * @type {import("puppeteer").Configuration}
 */

// .puppeteerrc.cjs
module.exports = {
  defaultBrowser: 'chrome',
  download: {
    chromium: true,
  },
};
