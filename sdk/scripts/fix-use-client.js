// TypeScript (CJS target) emits "use strict" before any other directive.
// Next.js requires "use client" to be the first statement, so we hoist it
// after the compiled dist is written.

const fs = require("fs");
const path = require("path");

const targets = [
  "react.js",
  "payments.react.js",
  "payments.next.client.js",
].map((file) => path.join(__dirname, "..", "dist", file));

for (const target of targets) {
  if (!fs.existsSync(target)) {
    console.error(`[fix-use-client] missing ${target}`);
    process.exit(1);
  }

  const source = fs.readFileSync(target, "utf8");
  const lines = source.split("\n");
  const fileName = path.basename(target);

  const hasUseClient = lines.some((l) => l.trim() === `"use client";`);
  if (!hasUseClient) {
    console.error(`[fix-use-client] no 'use client' directive found in ${fileName}`);
    process.exit(1);
  }

  const filtered = lines.filter((l) => l.trim() !== `"use client";` && l.trim() !== `"use strict";`);
  const out = ['"use client";', ...filtered].join("\n");
  fs.writeFileSync(target, out);
  console.log(`[fix-use-client] hoisted 'use client' to the top of dist/${fileName}`);
}
