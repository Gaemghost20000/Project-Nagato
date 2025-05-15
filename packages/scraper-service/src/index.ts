import express, { Request, Response } from 'express';

const app = express();
const PORT = process.env.SCRAPER_SERVICE_PORT || 3003;

app.use(express.json());

// Placeholder for scraping a URL
app.post('/scrape', async (req: Request, res: Response) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  console.log(`Scraper Service: Received request to scrape URL: ${url}`);

  try {
    // In a real application, you would use a library like Puppeteer or Cheerio + Axios
    // For example:
    // const response = await axios.get(url);
    // const $ = cheerio.load(response.data);
    // const title = $('title').text();
    // const content = $('body').text(); // Simplified example

    // Placeholder response
    res.json({
      message: `Successfully scraped (placeholder) ${url}`,
      url,
      title: `Placeholder Title for ${url}`,
      content: `Placeholder content for ${url}. Actual scraping logic to be implemented.`,
      // metadata: { ... } // e.g., links, images found
    });
  } catch (error) {
    console.error(`Scraper Service: Error scraping ${url}:`, error);
    // Check if error is an instance of Error to safely access message property
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during scraping.';
    res.status(500).json({ error: `Failed to scrape URL: ${url}`, details: errorMessage });
  }
});

app.listen(PORT, () => {
  console.log(`Scraper Service HTTP server started on port ${PORT}`);
});

export default app;