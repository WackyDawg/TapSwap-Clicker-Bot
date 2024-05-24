const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const express = require("express");
const path = require("path");
const { WebSocketServer } = require("ws");
require("dotenv").config();

const app = express();

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// WebSocket server setup
const wss = new WebSocketServer({ server });

// Broadcast function to send messages to all connected clients
const broadcast = (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  });
};

function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

(async () => {
  const config = await fs.readFile("./config/config.json", "utf8");
  const { numberOfClicks, urls } = JSON.parse(config);

  const performActions = async (browser, url) => {
    if (!url) return; // Skip if no URL is provided
    const page = await browser.newPage();
    let balance = 0;
    while (true) {
      try {
        const logMessage = (message) => {
          const timestamp = new Date().toISOString();
          const log = JSON.stringify({ message, timestamp });
          console.log(log);
          broadcast(log);
        };
  
        logMessage(`Navigating to ${url}`);
        await page.goto(url, { waitUntil: "networkidle0" });
  
        const imageSelector = "div#ex1-layer._tapContent_igohf_31 img";
        logMessage(`Waiting for selector ${imageSelector}`);
        await page.waitForSelector(imageSelector, {
          visible: true,
          timeout: 60000,
        });
        logMessage(`Selector ${imageSelector} found`);
  
        await delay(1000);
  
        for (let i = 0; i < numberOfClicks; i++) {
          await page.click(imageSelector);
          await delay(100);
          balance = await page.evaluate(() => {
            const balanceElement = document.querySelector("._h1_tffsq_1");
            return balanceElement ? balanceElement.textContent : 0;
          });
          logMessage(`| Success | Click Number: ${i + 1} | Successful Taps: ${i + 1} | Balance: 🟡 ${balance}`);
        }
      } catch (error) {
        console.error(`Error performing actions on ${url}:`, error);
        broadcast(
          JSON.stringify({
            message: `Error performing actions on ${url}: ${error.message}`,
            timestamp: new Date().toISOString(),
          })
        );
      }
  
      await delay(1000);
    }
  };
  

  // Filter out empty URLs
  const validUrls = urls.filter((url) => url);

  const browsers = await Promise.all(
    validUrls.map(() =>
      puppeteer.launch({
        args: [
          "--disable-setuid-sandbox",
          "--no-sandbox",
          "--single-process",
          "--no-zygote",
        ],
        executablePath:
          process.env.NODE_ENV === "production"
            ? process.env.PUPPETEER_EXECUTABLE_PATH
            : puppeteer.executablePath(),
        headless: false,
      })
    )
  );

  await Promise.all(
    browsers.map((browser, index) =>
      performActions(browser, validUrls[index % validUrls.length])
    )
  );

  // Do not close the browsers to keep the pages open
  // browsers.forEach(browser => browser.close());
})();
