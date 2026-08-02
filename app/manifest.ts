import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.productName,
    short_name: BRAND.productShortName,
    description: `${BRAND.productDescriptor}.`,
    start_url: "/",
    display: "standalone",
    background_color: "#06243f",
    theme_color: "#06243f",
  };
}
