import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const scriptsDirectory = dirname(currentFilePath);
const projectRoot = join(scriptsDirectory, "..");
const outputPath = join(projectRoot, "public", "_headers");

function resolveBackendOrigin() {
  const raw = (
    process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://api.rhythmeta.org"
  ).trim();
  if (!raw) {
    return null;
  }

  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

const backendOrigin = resolveBackendOrigin();
const staticAssetsOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_STATIC_ASSETS_URL ?? "").origin;
  } catch {
    return null;
  }
})();
const backupOrigin = (() => {
  try {
    return new URL(
      process.env.NEXT_PUBLIC_BACKUP_BASE_URL ??
        "https://backups.rhythmeta.org",
    ).origin;
  } catch {
    return null;
  }
})();

const connectSources = ["'self'"];
if (backendOrigin) {
  connectSources.push(backendOrigin);
}
if (backupOrigin && !connectSources.includes(backupOrigin)) {
  connectSources.push(backupOrigin);
}
if (staticAssetsOrigin) {
  connectSources.push(staticAssetsOrigin);
}
connectSources.push(
  "https://assets.rhythmeta.org",
  "https://maimaid-assets.rhythmeta.org",
  "https://chunithmd-assets.rhythmeta.org",
);

const imageSources = [
  "'self'",
  "data:",
  "https://dp4p6x0xfi5o9.cloudfront.net",
  "https://assets2.lxns.net",
];
if (backendOrigin) {
  imageSources.push(backendOrigin);
}
if (staticAssetsOrigin) {
  imageSources.push(staticAssetsOrigin);
}
imageSources.push(
  "https://assets.rhythmeta.org",
  "https://maimaid-assets.rhythmeta.org",
  "https://chunithmd-assets.rhythmeta.org",
);

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  `connect-src ${connectSources.join(" ")}`,
  `img-src ${imageSources.join(" ")}`,
  "font-src 'self' data:",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
].join("; ");

const headers = `/*
  Content-Security-Policy: ${contentSecurityPolicy}
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), fullscreen=(self)
`;

writeFileSync(outputPath, headers, "utf8");
console.log(`Generated security headers at ${outputPath}`);
