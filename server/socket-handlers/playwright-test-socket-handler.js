const { R } = require("redbean-node");
const fs = require("fs");
const path = require("path");
const { checkLogin } = require("../util-server");
const { log } = require("../../src/util");
const Database = require("../database");
const dayjs = require("dayjs");

const MAX_FILE_SIZE = 512 * 1024; // 500 KB

/**
 * Socket handler for Playwright test CRUD operations
 * @param {Socket} socket Socket.io socket instance
 */
module.exports.playwrightTestSocketHandler = (socket) => {

    socket.on("addPlaywrightTest", async (data, callback) => {
        try {
            checkLogin(socket);

            const { monitorID, name, fileContent } = data;

            if (!name || !fileContent) {
                throw new Error("Test name and file content are required.");
            }

            if (Buffer.byteLength(fileContent, "utf8") > MAX_FILE_SIZE) {
                throw new Error("Test file is too large (max 500 KB).");
            }

            let monitor = await R.findOne("monitor", " id = ? AND user_id = ? ", [monitorID, socket.userID]);
            if (!monitor) {
                throw new Error("Monitor not found.");
            }

            let bean = R.dispense("playwright_test");
            bean.monitor_id = monitorID;
            bean.name = name;
            bean.active = true;
            bean.created_date = R.isoDateTimeMillis(dayjs.utc());
            bean.filename = ""; // placeholder, set after we get the id
            await R.store(bean);

            const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);
            bean.filename = `test-${bean.id}-${sanitizedName}.spec.js`;
            await R.store(bean);

            const monitorDir = path.join(Database.playwrightTestDir, `monitor_${monitorID}`);
            if (!fs.existsSync(monitorDir)) {
                fs.mkdirSync(monitorDir, { recursive: true });
            }

            fs.writeFileSync(path.join(monitorDir, bean.filename), fileContent, "utf8");

            log.info("playwright", `Added test "${name}" (id=${bean.id}) for monitor #${monitorID}`);

            callback({
                ok: true,
                msg: "Test added.",
                test: {
                    id: bean.id,
                    monitor_id: bean.monitor_id,
                    name: bean.name,
                    filename: bean.filename,
                    active: bean.active,
                    created_date: bean.created_date,
                },
            });
        } catch (e) {
            callback({ ok: false, msg: e.message });
        }
    });

    socket.on("deletePlaywrightTest", async (testID, callback) => {
        try {
            checkLogin(socket);

            let bean = await R.findOne("playwright_test", " id = ? ", [testID]);
            if (!bean) {
                throw new Error("Test not found.");
            }

            let monitor = await R.findOne("monitor", " id = ? AND user_id = ? ", [bean.monitor_id, socket.userID]);
            if (!monitor) {
                throw new Error("Permission denied.");
            }

            const filePath = path.join(Database.playwrightTestDir, `monitor_${bean.monitor_id}`, bean.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            await R.trash(bean);

            log.info("playwright", `Deleted test id=${testID} for monitor #${bean.monitor_id}`);

            callback({ ok: true, msg: "Test deleted." });
        } catch (e) {
            callback({ ok: false, msg: e.message });
        }
    });

    socket.on("getPlaywrightTests", async (monitorID, callback) => {
        try {
            checkLogin(socket);

            let monitor = await R.findOne("monitor", " id = ? AND user_id = ? ", [monitorID, socket.userID]);
            if (!monitor) {
                throw new Error("Monitor not found.");
            }

            let tests = await R.getAll(
                "SELECT * FROM playwright_test WHERE monitor_id = ? ORDER BY created_date ASC",
                [monitorID]
            );

            callback({ ok: true, tests });
        } catch (e) {
            callback({ ok: false, msg: e.message });
        }
    });

    socket.on("togglePlaywrightTest", async (data, callback) => {
        try {
            checkLogin(socket);

            const { testID, active } = data;

            let bean = await R.findOne("playwright_test", " id = ? ", [testID]);
            if (!bean) {
                throw new Error("Test not found.");
            }

            let monitor = await R.findOne("monitor", " id = ? AND user_id = ? ", [bean.monitor_id, socket.userID]);
            if (!monitor) {
                throw new Error("Permission denied.");
            }

            bean.active = active ? 1 : 0;
            await R.store(bean);

            callback({ ok: true, msg: "Test updated." });
        } catch (e) {
            callback({ ok: false, msg: e.message });
        }
    });

    socket.on("getPlaywrightTestContent", async (testID, callback) => {
        try {
            checkLogin(socket);

            let bean = await R.findOne("playwright_test", " id = ? ", [testID]);
            if (!bean) {
                throw new Error("Test not found.");
            }

            let monitor = await R.findOne("monitor", " id = ? AND user_id = ? ", [bean.monitor_id, socket.userID]);
            if (!monitor) {
                throw new Error("Permission denied.");
            }

            const filePath = path.join(Database.playwrightTestDir, `monitor_${bean.monitor_id}`, bean.filename);
            if (!fs.existsSync(filePath)) {
                throw new Error("Test file not found on disk.");
            }

            const content = fs.readFileSync(filePath, "utf8");

            callback({ ok: true, content, filename: bean.filename, name: bean.name });
        } catch (e) {
            callback({ ok: false, msg: e.message });
        }
    });

    socket.on("getPlaywrightTestRuns", async (monitorID, callback) => {
        try {
            checkLogin(socket);

            let monitor = await R.findOne("monitor", " id = ? AND user_id = ? ", [monitorID, socket.userID]);
            if (!monitor) {
                throw new Error("Monitor not found.");
            }

            let runs = await R.getAll(`
                SELECT r.*, t.name as test_name
                FROM playwright_test_run r
                JOIN playwright_test t ON t.id = r.playwright_test_id
                WHERE r.monitor_id = ?
                ORDER BY r.time DESC
                LIMIT 200
            `, [monitorID]);

            callback({ ok: true, runs });
        } catch (e) {
            callback({ ok: false, msg: e.message });
        }
    });

};
