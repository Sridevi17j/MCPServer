// server.ts
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import puppeteer from "puppeteer";

const server = new McpServer({
  name: "web-scraper-new",
  version: "1.0.0"
});

server.tool(
  "extract-url",
  { url: z.string().url() },
  async ({ url }) => {
    console.log("🔍 Extracting full content from:", url);
    try {
      const browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });

      const textContent = await page.evaluate(() => {
        return document.body.innerText;
      });

      await browser.close();

      return {
        content: [{ type: "text", text: textContent }]
      };
    } catch (err: any) {
      console.error("❌ Error scraping content:", err.message);
      return {
        content: [{ type: "text", text: `Failed to extract content: ${err.message}` }]
      };
    }
  }
);

const app = express();
const transports: { [sessionId: string]: SSEServerTransport } = {};

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;

  console.log("📡 SSE session started:", transport.sessionId);

  res.on("close", () => {
    console.log("❌ SSE session closed:", transport.sessionId);
    delete transports[transport.sessionId];
  });

  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No transport found for sessionId");
  }
});

const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
  console.log(`✅ MCP Server running on port ${PORT}`);
});
