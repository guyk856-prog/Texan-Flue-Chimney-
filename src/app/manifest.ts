import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Texan Flue Chimney Service",
    short_name: "Texan Flue",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#F6F4F0",
    theme_color: "#111111",
    icons: [
      {
        src: "/brand/favicon.webp",
        sizes: "192x192",
        type: "image/webp",
        purpose: "any",
      },
    ],
  };
}
