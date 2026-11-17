/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // pdfjs-dist optionally requires "canvas" (Node only). We never use it in the browser.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
