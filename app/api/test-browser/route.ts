import { chromium } from "playwright";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return Response.json(
      {
        success: false,
        error: "Missing url parameter",
      },
      { status: 400 }
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(targetUrl);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Only HTTP and HTTPS URLs are supported.");
    }
  } catch {
    return Response.json(
      {
        success: false,
        error: "Invalid URL.",
      },
      { status: 400 }
    );
  }

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage();

    await page.goto(parsedUrl.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const title = await page.title();

    const linkCount = await page.locator("a[href]").count();

    return Response.json({
      success: true,
      url: parsedUrl.toString(),
      title,
      linkCount,
    });
  } finally {
    await browser.close();
  }
}