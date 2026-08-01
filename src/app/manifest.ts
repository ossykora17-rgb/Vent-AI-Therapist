import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mind Weave Vent — Truth Anchor",
    short_name: "VENT",
    description: "Carve your truth. Calm AI support, grounded in reality.",
    start_url: "/chat",
    display: "standalone",
    background_color: "#FEFCF8",
    theme_color: "#FEFCF8",
    orientation: "portrait",
    icons: [
      { src: "/icon.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
