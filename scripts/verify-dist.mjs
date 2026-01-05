import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve(process.cwd(), "dist");
const requiredFiles = [
  "manifest.json",
  "background.js",
  "popup.html",
  "sidepanel.html",
  "assets/icon16.png",
  "assets/icon32.png",
  "assets/icon48.png",
  "assets/icon128.png"
];

const missing = requiredFiles.filter((file) =>
  !fs.existsSync(path.join(distDir, file))
);

if (missing.length > 0) {
  console.error("Missing required files in dist/:");
  for (const file of missing) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log("dist/ verification passed.");
