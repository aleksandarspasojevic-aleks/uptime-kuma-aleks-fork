const { RateLimiter } = require("limiter");
const { log } = require("../src/util");

class KumaRateLimiter {
    /**
     * @param {object} config Rate limiter configuration object
     */
    constructor(config) {
        this.errorMessage = config.errorMessage;
        this.config = config;

        /** @type {Map<string, {limiter: RateLimiter, lastUsed: number}>} */
        this.limiters = new Map();

        this.cleanupInterval = setInterval(() => this.purgeStale(), 10 * 60 * 1000);
    }

    /**
     * Get or create a rate limiter for a specific key (typically an IP address).
     * @param {string} key Identifier for the rate limiter bucket
     * @returns {RateLimiter}
     */
    getLimiter(key) {
        let entry = this.limiters.get(key);
        if (!entry) {
            entry = {
                limiter: new RateLimiter(this.config),
                lastUsed: Date.now(),
            };
            this.limiters.set(key, entry);
        }
        entry.lastUsed = Date.now();
        return entry.limiter;
    }

    /**
     * Should the request be passed through (per-IP)?
     * @param {Function} callback Callback function to call on rejection
     * @param {string} [key="global"] IP address or other identifier
     * @param {number} [num=1] Number of tokens to remove
     * @returns {Promise<boolean>} Should the request be allowed?
     */
    async pass(callback, key = "global", num = 1) {
        const limiter = this.getLimiter(key);
        const remainingRequests = await limiter.removeTokens(num);
        log.info("rate-limit", `IP=${key} remaining requests: ${remainingRequests}`);
        if (remainingRequests < 0) {
            if (callback) {
                callback({
                    ok: false,
                    msg: this.errorMessage,
                });
            }
            return false;
        }
        return true;
    }

    /**
     * Remove a given number of tokens for a specific key.
     * @param {number} num Number of tokens to remove
     * @param {string} [key="global"] Identifier
     * @returns {Promise<number>} Number of remaining tokens
     */
    async removeTokens(num = 1, key = "global") {
        const limiter = this.getLimiter(key);
        return await limiter.removeTokens(num);
    }

    /** Remove limiter entries that haven't been used in 30 minutes. */
    purgeStale() {
        const staleMs = 30 * 60 * 1000;
        const now = Date.now();
        let purged = 0;
        for (const [key, entry] of this.limiters) {
            if (now - entry.lastUsed > staleMs) {
                this.limiters.delete(key);
                purged++;
            }
        }
        if (purged > 0) {
            log.debug("rate-limit", `Purged ${purged} stale rate-limiter entries, remaining: ${this.limiters.size}`);
        }
    }
}

const loginRateLimiter = new KumaRateLimiter({
    tokensPerInterval: 20,
    interval: "minute",
    fireImmediately: true,
    errorMessage: "Too frequently, try again later.",
});

const apiRateLimiter = new KumaRateLimiter({
    tokensPerInterval: 60,
    interval: "minute",
    fireImmediately: true,
    errorMessage: "Too frequently, try again later.",
});

const twoFaRateLimiter = new KumaRateLimiter({
    tokensPerInterval: 30,
    interval: "minute",
    fireImmediately: true,
    errorMessage: "Too frequently, try again later.",
});

module.exports = {
    loginRateLimiter,
    apiRateLimiter,
    twoFaRateLimiter,
};
