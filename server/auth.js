const basicAuth = require("express-basic-auth");
const passwordHash = require("./password-hash");
const { R } = require("redbean-node");
const { log } = require("../src/util");
const { loginRateLimiter, apiRateLimiter } = require("./rate-limiter");
const { Settings } = require("./settings");
const dayjs = require("dayjs");

/**
 * Login to web app
 * @param {string} username Username to login with
 * @param {string} password Password to login with
 * @returns {Promise<(Bean|null)>} User or null if login failed
 */
exports.login = async function (username, password) {
    if (typeof username !== "string" || typeof password !== "string") {
        return null;
    }

    let user = await R.findOne("user", "TRIM(username) = ? AND active = 1 ", [username.trim()]);

    if (user && passwordHash.verify(password, user.password)) {
        // Upgrade the hash to bcrypt
        if (passwordHash.needRehash(user.password)) {
            await R.exec("UPDATE `user` SET password = ? WHERE id = ? ", [
                await passwordHash.generate(password),
                user.id,
            ]);
        }
        return user;
    }

    return null;
};

/**
 * Validate a provided API key
 * @param {string} key API key to verify
 * @returns {boolean} API is ok?
 */
async function verifyAPIKey(key) {
    if (typeof key !== "string") {
        return false;
    }

    // uk prefix + key ID is before _
    let index = key.substring(2, key.indexOf("_"));
    let clear = key.substring(key.indexOf("_") + 1, key.length);

    let hash = await R.findOne("api_key", " id=? ", [index]);

    if (hash === null) {
        return false;
    }

    let current = dayjs();
    let expiry = dayjs(hash.expires);
    if (expiry.diff(current) < 0 || !hash.active) {
        return false;
    }

    return hash && passwordHash.verify(clear, hash.key);
}

/**
 * Callback for basic auth authorizers
 * @callback authCallback
 * @param {any} err Any error encountered
 * @param {boolean} authorized Is the client authorized?
 */

/**
 * Create an API key authorizer scoped to a client IP.
 * @param {string} clientIP The client's IP address
 * @returns {Function} express-basic-auth async authorizer
 */
function createApiAuthorizer(clientIP) {
    return function apiAuthorizer(username, password, callback) {
        apiRateLimiter.pass(null, clientIP, 0).then((pass) => {
            if (pass) {
                verifyAPIKey(password).then((valid) => {
                    if (!valid) {
                        log.warn("api-auth", `Failed API auth attempt: invalid API Key. IP=${clientIP}`);
                    }
                    callback(null, valid);
                    apiRateLimiter.removeTokens(1, clientIP);
                });
            } else {
                log.warn("api-auth", `Failed API auth attempt: rate limit exceeded. IP=${clientIP}`);
                callback(null, false);
            }
        });
    };
}

/**
 * Create a user/password authorizer scoped to a client IP.
 * @param {string} clientIP The client's IP address
 * @returns {Function} express-basic-auth async authorizer
 */
function createUserAuthorizer(clientIP) {
    return function userAuthorizer(username, password, callback) {
        loginRateLimiter.pass(null, clientIP, 0).then((pass) => {
            if (pass) {
                exports.login(username, password).then((user) => {
                    callback(null, user != null);

                    if (user == null) {
                        log.warn("basic-auth", `Failed basic auth attempt: invalid username/password. IP=${clientIP}`);
                        loginRateLimiter.removeTokens(1, clientIP);
                    }
                });
            } else {
                log.warn("basic-auth", `Failed basic auth attempt: rate limit exceeded. IP=${clientIP}`);
                callback(null, false);
            }
        });
    };
}

/**
 * Use basic auth if auth is not disabled
 * @param {express.Request} req Express request object
 * @param {express.Response} res Express response object
 * @param {express.NextFunction} next Next handler in chain
 * @returns {Promise<void>}
 */
exports.basicAuth = async function (req, res, next) {
    const clientIP = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || req.connection?.remoteAddress || "unknown";

    const middleware = basicAuth({
        authorizer: createUserAuthorizer(clientIP),
        authorizeAsync: true,
        challenge: true,
    });

    const disabledAuth = await Settings.get("disableAuth");

    if (!disabledAuth) {
        middleware(req, res, next);
    } else {
        next();
    }
};

/**
 * Use use API Key if API keys enabled, else use basic auth
 * @param {express.Request} req Express request object
 * @param {express.Response} res Express response object
 * @param {express.NextFunction} next Next handler in chain
 * @returns {Promise<void>}
 */
exports.apiAuth = async function (req, res, next) {
    if (!(await Settings.get("disableAuth"))) {
        const clientIP = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || req.connection?.remoteAddress || "unknown";

        let usingAPIKeys = await Settings.get("apiKeysEnabled");
        let middleware;
        if (usingAPIKeys) {
            middleware = basicAuth({
                authorizer: createApiAuthorizer(clientIP),
                authorizeAsync: true,
                challenge: true,
            });
        } else {
            middleware = basicAuth({
                authorizer: createUserAuthorizer(clientIP),
                authorizeAsync: true,
                challenge: true,
            });
        }
        middleware(req, res, next);
    } else {
        next();
    }
};
