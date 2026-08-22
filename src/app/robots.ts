import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Nothing private is behind these, but there is no reason to crawl them.
      disallow: ["/api/", "/history"],
    },
    sitemap: `${env.siteUrl.replace(/\/$/, "")}/sitemap.xml`,
  };
}
