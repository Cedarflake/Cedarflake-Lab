import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as {
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

describe("development runtime safety", () => {
  it("uses bounded webpack development compilation", () => {
    const devScript = packageJson.scripts?.dev;

    assert.ok(devScript, "The Shika development script must exist");
    assert.match(devScript, /--max-old-space-size=1024/);
    assert.match(devScript, /next dev --webpack/);
    assert.doesNotMatch(devScript, /turbopack|--turbo(?:\s|$)/);
  });

  it("self-hosts Geist without the next/font loader", () => {
    const layout = readFileSync(
      new URL("../../src/app/layout.tsx", import.meta.url),
      "utf8",
    );
    const fontFiles = [
      "public/fonts/Geist-Variable.woff2",
      "public/fonts/GeistMono-Variable.woff2",
      "public/fonts/LICENSE.txt",
    ];

    assert.equal(packageJson.dependencies?.geist, undefined);
    assert.doesNotMatch(layout, /geist\/font|next\/font/);

    for (const relativePath of fontFiles) {
      const filePath = `${packageRoot}${relativePath}`;

      assert.equal(existsSync(filePath), true, `${relativePath} must exist`);
      assert.ok(
        statSync(filePath).size > 0,
        `${relativePath} must not be empty`,
      );
    }
  });
});
