import type { APIRoute } from "astro";
import { getProducts, getSiteConfigFromServer } from "@/lib/commerce";

export const prerender = false;

/**
 * Dynamic XML sitemap generator.
 *
 * Because every page is server-rendered (prerender = false) the built-in
 * @astrojs/sitemap integration cannot discover routes automatically.
 * This endpoint fetches the product catalog from the Commerce API and
 * combines it with the known static routes to produce a complete sitemap.
 */
export const GET: APIRoute = async ({ url }) => {
  const site = await getSiteConfigFromServer();
  const origin = site.domain
    ? site.domain.startsWith("http")
      ? site.domain.replace(/\/+$/, "")
      : `https://${site.domain.replace(/\/+$/, "")}`
    : url.origin;

  // --- Static routes ---
  const staticPaths = [
    { path: "/", changefreq: "daily", priority: "1.0" },
    { path: "/contact-us", changefreq: "monthly", priority: "0.5" },
    { path: "/shipping-policy", changefreq: "monthly", priority: "0.4" },
    { path: "/cancellation-refund-policy", changefreq: "monthly", priority: "0.4" },
    { path: "/terms-conditions", changefreq: "monthly", priority: "0.4" },
    { path: "/privacy-policy", changefreq: "monthly", priority: "0.4" },
    { path: "/wonder-box", changefreq: "weekly", priority: "0.6" },
  ];

  // --- Dynamic product routes ---
  let products: Array<{ slug: string }> = [];
  try {
    products = await getProducts(100);
  } catch {
    // If the product API is unavailable, emit the sitemap without products.
  }

  const today = new Date().toISOString().slice(0, 10);

  const urls = [
    ...staticPaths.map(
      (entry) =>
        `  <url>
    <loc>${origin}${entry.path}</loc>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
    ),
    ...products.map(
      (product) =>
        `  <url>
    <loc>${origin}/products/${encodeURIComponent(product.slug)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
