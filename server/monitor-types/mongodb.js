const { MonitorType } = require("./monitor-type");
const { UP, log } = require("../../src/util");
const { MongoClient } = require("mongodb");
const jsonata = require("jsonata");

/**
 * Commands allowed for the MongoDB monitor. Anything not on this list is
 * rejected to prevent arbitrary admin/write operations via the monitor UI.
 */
const ALLOWED_MONGODB_COMMANDS = new Set([
    "ping",
    "hello",
    "isMaster",
    "ismaster",
    "serverStatus",
    "dbStats",
    "collStats",
    "count",
    "find",
    "aggregate",
    "distinct",
    "explain",
    "listCollections",
    "listDatabases",
    "connectionStatus",
    "buildInfo",
    "hostInfo",
    "features",
    "getParameter",
]);

class MongodbMonitorType extends MonitorType {
    name = "mongodb";

    /**
     * @inheritdoc
     */
    async check(monitor, heartbeat, _server) {
        let command = { ping: 1 };
        if (monitor.databaseQuery) {
            command = JSON.parse(monitor.databaseQuery);

            const commandKeys = Object.keys(command);
            const primaryCommand = commandKeys[0];
            if (!primaryCommand || !ALLOWED_MONGODB_COMMANDS.has(primaryCommand)) {
                throw new Error(
                    `MongoDB command "${primaryCommand}" is not allowed. ` +
                    `Permitted commands: ${[...ALLOWED_MONGODB_COMMANDS].join(", ")}`
                );
            }
        }

        let result = await this.runMongodbCommand(monitor.databaseConnectionString, command);

        if (result["ok"] !== 1) {
            throw new Error("MongoDB command failed");
        } else {
            heartbeat.msg = "Command executed successfully";
        }

        if (monitor.jsonPath) {
            let expression = jsonata(monitor.jsonPath);
            result = await expression.evaluate(result);
            if (result) {
                heartbeat.msg = "Command executed successfully and the jsonata expression produces a result.";
            } else {
                throw new Error("Queried value not found.");
            }
        }

        if (monitor.expectedValue) {
            if (result.toString() === monitor.expectedValue) {
                heartbeat.msg = "Command executed successfully and expected value was found";
            } else {
                throw new Error(
                    "Query executed, but value is not equal to expected value, value was: [" +
                        JSON.stringify(result) +
                        "]"
                );
            }
        }

        heartbeat.status = UP;
    }

    /**
     * Connect to and run MongoDB command on a MongoDB database
     * @param {string} connectionString The database connection string
     * @param {object} command MongoDB command to run on the database
     * @returns {Promise<(string[] | object[] | object)>} Response from server
     */
    async runMongodbCommand(connectionString, command) {
        let client = await MongoClient.connect(connectionString);
        let result = await client.db().command(command);
        await client.close();
        return result;
    }
}

module.exports = {
    MongodbMonitorType,
};
