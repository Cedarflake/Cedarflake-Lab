import { realpathSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { createElement, StrictMode } from "react"
import { renderToString } from "react-dom/server"
import { defineConfig } from "vite"
import type { Plugin } from "vite"

import { App } from "./src/App"
import { createRobotsTxt, createSitemapXml, renderSeoTemplate } from "./src/lib/seo"

const appRoot = dirname(fileURLToPath(import.meta.url))
const fontPackageRoots = [
  realpathSync(resolve(appRoot, "node_modules/@fontsource-variable/jetbrains-mono")),
  realpathSync(resolve(appRoot, "node_modules/@fontsource-variable/manrope")),
]
const emptyRootMarkup = '<div id="root"></div>'

function landingDocumentPlugin(): Plugin {
  return {
    name: "cedarflake-landing-document",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const documentHtml = renderSeoTemplate(html)

        if (!documentHtml.includes(emptyRootMarkup)) {
          throw new Error("Landing document is missing the empty #root mount point")
        }

        const appHtml = renderToString(createElement(StrictMode, null, createElement(App)))

        return documentHtml.replace(emptyRootMarkup, `<div id="root">${appHtml}</div>`)
      },
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: createRobotsTxt(),
      })
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: createSitemapXml(),
      })
    },
  }
}

export default defineConfig({
  build: {
    // Keep unicode-range font subsets as separate requests instead of forcing them into every CSS response.
    assetsInlineLimit: 0,
  },
  plugins: [landingDocumentPlugin(), react()],
  server: {
    fs: {
      // Fontsource keeps dev asset URLs on pnpm's real package paths.
      allow: [appRoot, ...fontPackageRoots],
    },
    host: "127.0.0.1",
    port: 5176,
  },
})
