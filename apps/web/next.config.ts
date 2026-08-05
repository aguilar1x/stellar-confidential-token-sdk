import type { NextConfig } from "next";

/**
 * Cross-origin isolation is set even though this page never proves.
 *
 * Verification — reconstructing openings and checking them against on-chain
 * commitments — is pure field arithmetic and needs nothing special. Proving
 * does: bb.js wants threads, threads want SharedArrayBuffer, and that wants
 * COOP/COEP. Setting the headers now means adding a proving surface later is a
 * code change rather than a deployment change, and `credentialless` (rather
 * than `require-corp`) keeps `fetch` to the Soroban RPC working without that
 * endpoint having to send CORP headers of its own.
 */
const crossOriginIsolation = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["stellar-confidential-token-sdk"],
  /**
   * Proving happens inside a server action, and the proving stack loads WASM at
   * runtime by URL. Bundling it rewrites those to /_next/static/... — a
   * browser-relative path with no base on the server, so `fetch` fails with
   * "Failed to parse URL". Leaving these external keeps them resolving their
   * own assets out of node_modules the way they do under plain Node.
   */
  serverExternalPackages: [
    "@noir-lang/noir_js",
    "@noir-lang/acvm_js",
    "@noir-lang/noirc_abi",
    "@aztec/bb.js",
  ],
  async headers() {
    return [{ source: "/(.*)", headers: crossOriginIsolation }];
  },
};

export default nextConfig;
