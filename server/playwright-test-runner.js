const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { log } = require("../src/util");
const Database = require("./database");

const RUNNER_TIMEOUT_MS = 5 * 60 * 1000; // 5 min hard limit

/**
 * Run all given Playwright test files for a monitor.
 * @param {number} monitorID
 * @param {Array<{id: number, filename: string, name: string}>} tests - active test rows
 * @returns {Promise<Array<{testID: number, testName: string, status: string, duration: number, errorMessage: string|null, reportPath: string|null}>>}
 */
async function runPlaywrightTests(monitorID, tests) {
    const monitorTestDir = path.resolve(Database.playwrightTestDir, `monitor_${monitorID}`);
    const runTimestamp = Date.now();
    const reportRelDir = `monitor_${monitorID}/run_${runTimestamp}`;
    const reportAbsDir = path.resolve(Database.playwrightReportDir, reportRelDir);

    if (!fs.existsSync(reportAbsDir)) {
        fs.mkdirSync(reportAbsDir, { recursive: true });
    }

    const testFiles = tests
        .map(t => path.join(monitorTestDir, t.filename))
        .filter(f => fs.existsSync(f));

    if (testFiles.length === 0) {
        log.warn("playwright", `No test files found on disk for monitor #${monitorID}`);
        return [];
    }

    const fwdTestDir = monitorTestDir.replace(/\\/g, "/");
    const fwdReportDir = reportAbsDir.replace(/\\/g, "/");
    const fwdOutputDir = path.resolve(Database.dataDir, "playwright-output", `monitor_${monitorID}`, `run_${runTimestamp}`).replace(/\\/g, "/");

    if (!fs.existsSync(fwdOutputDir)) {
        fs.mkdirSync(fwdOutputDir, { recursive: true });
    }

    const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH || "";
    const launchOptionsSnippet = chromiumPath
        ? `\n        launchOptions: { executablePath: ${JSON.stringify(chromiumPath)}, args: ["--no-sandbox"] },`
        : "";

    const configContent = `
const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
    testDir: ${JSON.stringify(fwdTestDir)},
    testMatch: ${JSON.stringify(tests.map(t => t.filename))},
    outputDir: ${JSON.stringify(fwdOutputDir)},
    timeout: 60000,
    retries: 0,
    reporter: [
        ["html", { outputFolder: ${JSON.stringify(fwdReportDir)}, open: "never" }],
    ],
    use: {
        headless: true,
        screenshot: "only-on-failure",${launchOptionsSnippet}
    },
});
`;

    const configPath = path.resolve(monitorTestDir, `pw-config-${runTimestamp}.js`);
    fs.writeFileSync(configPath, configContent, "utf8");

    let stdout = "";
    let stderr = "";
    let exitCode = 0;
    try {
        const result = await runPlaywrightExec(configPath);
        stdout = result.stdout || "";
        stderr = result.stderr || "";
    } catch (e) {
        stdout = e.stdout || "";
        stderr = e.stderr || "";
        exitCode = e.exitCode || 2;
        log.warn("playwright", `Playwright exited with error for monitor #${monitorID}: ${e.message}`);
    } finally {
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }
    }

    return parseStdoutResults(tests, stdout, stderr, exitCode, reportRelDir);
}

/**
 * Shell-escape a path for safe embedding in a command string
 */
function shellQuote(s) {
    if (process.platform === "win32") {
        return `"${s}"`;
    }
    return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Execute playwright test via child_process.exec using the locally installed binary.
 */
function runPlaywrightExec(configPath) {
    return new Promise((resolve, reject) => {
        const playwrightBin = path.resolve(__dirname, "..", "node_modules", ".bin", "playwright");
        const cmd = `${shellQuote(playwrightBin)} test --config ${shellQuote(configPath)}`;

        log.debug("playwright", `Executing: ${cmd}`);

        exec(cmd, {
            timeout: RUNNER_TIMEOUT_MS,
            maxBuffer: 10 * 1024 * 1024,
            windowsHide: true,
        }, (error, stdout, stderr) => {
            if (stdout) {
                log.debug("playwright", `stdout (first 1500): ${stdout.substring(0, 1500)}`);
            }
            if (stderr) {
                log.debug("playwright", `stderr (first 500): ${stderr.substring(0, 500)}`);
            }

            if (error && error.killed) {
                const err = new Error("Playwright test timed out");
                err.stdout = stdout;
                err.stderr = stderr;
                err.exitCode = -1;
                reject(err);
            } else if (error) {
                const err = new Error(error.message);
                err.stdout = stdout;
                err.stderr = stderr;
                err.exitCode = error.code;
                reject(err);
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

/**
 * Parse test results from Playwright's list reporter stdout output.
 * Extracts pass/fail counts and per-file status from the text output.
 */
function parseStdoutResults(tests, stdout, stderr, exitCode, reportRelDir) {
    const combined = stdout + "\n" + stderr;
    const results = [];

    const passedMatch = combined.match(/(\d+)\s+passed/);
    const failedMatch = combined.match(/(\d+)\s+failed/);
    const totalPassed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
    const totalFailed = failedMatch ? parseInt(failedMatch[1], 10) : 0;

    const durationMatch = combined.match(/\(([0-9.]+(?:ms|s|m))\)\s*$/m);
    let totalDurationMs = 0;
    if (durationMatch) {
        const durStr = durationMatch[1];
        if (durStr.endsWith("ms")) {
            totalDurationMs = parseFloat(durStr);
        } else if (durStr.endsWith("m")) {
            totalDurationMs = parseFloat(durStr) * 60000;
        } else {
            totalDurationMs = parseFloat(durStr) * 1000;
        }
    }

    const perFileDuration = tests.length > 0 ? Math.round(totalDurationMs / tests.length) : 0;

    for (const test of tests) {
        const fileErrors = extractFileErrors(combined, test.filename);

        let status;
        let errorMessage = null;

        if (exitCode === 0) {
            status = "passed";
        } else if (fileErrors) {
            status = "failed";
            errorMessage = fileErrors;
        } else if (totalFailed === 0 && totalPassed > 0) {
            status = "passed";
        } else if (totalFailed > 0 && tests.length === 1) {
            status = "failed";
            errorMessage = fileErrors || extractFirstError(combined);
        } else if (exitCode === -1) {
            status = "timedout";
            errorMessage = "Test execution timed out";
        } else if (totalPassed === 0 && totalFailed === 0) {
            status = "error";
            errorMessage = "Could not determine test results";
        } else {
            status = "passed";
        }

        results.push({
            testID: test.id,
            testName: test.name,
            status,
            duration: perFileDuration,
            errorMessage,
            reportPath: reportRelDir + "/index.html",
        });
    }

    log.info("playwright", `Parsed results: ${totalPassed} passed, ${totalFailed} failed, duration ${totalDurationMs}ms`);

    return results;
}

/**
 * Extract error messages related to a specific test file from the output
 */
function extractFileErrors(output, filename) {
    const escapedName = filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const errorRegex = new RegExp(`(?:^|\\n)\\s*\\d+\\)\\s*${escapedName}[\\s\\S]*?(?=\\n\\s*\\d+\\)|\\n\\s*\\d+ (?:passed|failed)|$)`, "m");
    const match = output.match(errorRegex);
    if (match) {
        return match[0].trim().substring(0, 500);
    }
    if (output.includes(filename) && output.includes("Error")) {
        const lines = output.split("\n");
        const errorLines = [];
        let capturing = false;
        for (const line of lines) {
            if (line.includes(filename) && (line.includes("›") || line.includes("Error"))) {
                capturing = true;
            }
            if (capturing) {
                errorLines.push(line);
                if (errorLines.length > 10) {
                    break;
                }
                if (line.trim() === "" && errorLines.length > 2) {
                    break;
                }
            }
        }
        if (errorLines.length > 0) {
            return errorLines.join("\n").trim().substring(0, 500);
        }
    }
    return null;
}

/**
 * Extract the first error block from the output
 */
function extractFirstError(output) {
    const errorMatch = output.match(/Error:.*(?:\n.*){0,5}/);
    if (errorMatch) {
        return errorMatch[0].trim().substring(0, 500);
    }
    const failMatch = output.match(/\d+\)\s+.*\n[\s\S]*?(?=\n\s*\d+\)|\n\s*\d+ (?:passed|failed)|$)/);
    if (failMatch) {
        return failMatch[0].trim().substring(0, 500);
    }
    return null;
}

const MAX_REPORTS_TO_KEEP = 10;

/**
 * Delete old Playwright report directories and DB rows beyond MAX_REPORTS_TO_KEEP.
 * Keeps the most recent reports.
 * @param {number} monitorID
 */
async function cleanupOldReports(monitorID) {
    const { R } = require("redbean-node");

    try {
        const oldRuns = await R.getAll(
            `SELECT id, report_path FROM playwright_test_run
             WHERE monitor_id = ?
             ORDER BY time DESC
             LIMIT 1000 OFFSET ?`,
            [monitorID, MAX_REPORTS_TO_KEEP]
        );

        if (oldRuns.length === 0) {
            return;
        }

        const deletedDirs = new Set();
        for (const run of oldRuns) {
            if (run.report_path) {
                const dirName = path.dirname(run.report_path);
                if (dirName && dirName !== ".") {
                    deletedDirs.add(dirName);
                }
            }
        }

        for (const relDir of deletedDirs) {
            const absDir = path.resolve(Database.playwrightReportDir, relDir);
            if (fs.existsSync(absDir)) {
                fs.rmSync(absDir, { recursive: true, force: true });
                log.debug("playwright", `Cleaned up old report: ${relDir}`);
            }
        }

        const oldIds = oldRuns.map(r => r.id);
        if (oldIds.length > 0) {
            const placeholders = oldIds.map(() => "?").join(",");
            await R.exec(
                `DELETE FROM playwright_test_run WHERE id IN (${placeholders})`,
                oldIds
            );
            log.info("playwright", `Cleaned up ${oldIds.length} old test run(s) for monitor #${monitorID}`);
        }
    } catch (e) {
        log.warn("playwright", `Cleanup failed for monitor #${monitorID}: ${e.message}`);
    }
}

module.exports = { runPlaywrightTests, cleanupOldReports };
