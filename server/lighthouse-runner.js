const puppeteer = require("puppeteer");
const log = require("../src/util").log;

/**
 * Run a Lighthouse audit against the given URL and return category scores.
 * Uses puppeteer's bundled Chromium so no system-installed browser is needed.
 *
 * @param {string} url Fully-qualified URL to audit (http/https)
 * @returns {Promise<{performance: number, accessibility: number, bestPractices: number, seo: number}>}
 *          Scores as integers 0-100
 */
async function runLighthouse(url) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                "--no-sandbox",
                "--disable-gpu",
                "--disable-dev-shm-usage",
            ],
        });

        // lighthouse v10+ is ESM-only; dynamic import required from CommonJS
        const { default: lighthouse } = await import("lighthouse");

        const port = new URL(browser.wsEndpoint()).port;

        const result = await lighthouse(url, {
            logLevel: "error",
            output: "json",
            port: Number(port),
            onlyCategories: [
                "performance",
                "accessibility",
                "best-practices",
                "seo",
            ],
        });

        const { categories } = result.lhr;

        return {
            performance: Math.round((categories["performance"]?.score ?? 0) * 100),
            accessibility: Math.round((categories["accessibility"]?.score ?? 0) * 100),
            bestPractices: Math.round((categories["best-practices"]?.score ?? 0) * 100),
            seo: Math.round((categories["seo"]?.score ?? 0) * 100),
        };
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                log.warn("lighthouse", "Failed to close browser: " + e.message);
            }
        }
    }
}

module.exports = {
    runLighthouse,
};
