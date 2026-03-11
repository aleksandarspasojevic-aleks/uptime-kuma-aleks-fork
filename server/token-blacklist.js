const { log } = require("../src/util");

/**
 * In-memory JWT blacklist. Revoked tokens are stored until they would have
 * expired naturally, then automatically purged to avoid unbounded growth.
 */
class TokenBlacklist {
    constructor() {
        /** @type {Map<string, number>} token → expiry timestamp (ms) */
        this.revoked = new Map();

        this.cleanupInterval = setInterval(() => this.purgeExpired(), 60 * 60 * 1000);
    }

    /**
     * Add a token to the blacklist.
     * @param {string} token The raw JWT string
     * @param {number} expiresAtMs When the token expires (epoch ms). If unknown, defaults to 30 days from now.
     */
    add(token, expiresAtMs) {
        if (!expiresAtMs) {
            expiresAtMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
        }
        this.revoked.set(token, expiresAtMs);
        log.debug("token-blacklist", `Token revoked, blacklist size: ${this.revoked.size}`);
    }

    /**
     * Check whether a token has been revoked.
     * @param {string} token The raw JWT string
     * @returns {boolean}
     */
    isRevoked(token) {
        return this.revoked.has(token);
    }

    /** Remove entries whose tokens have already expired. */
    purgeExpired() {
        const now = Date.now();
        let purged = 0;
        for (const [token, expiresAt] of this.revoked) {
            if (expiresAt <= now) {
                this.revoked.delete(token);
                purged++;
            }
        }
        if (purged > 0) {
            log.debug("token-blacklist", `Purged ${purged} expired tokens, remaining: ${this.revoked.size}`);
        }
    }

    /** Stop the background cleanup timer (for graceful shutdown). */
    stop() {
        clearInterval(this.cleanupInterval);
    }
}

const tokenBlacklist = new TokenBlacklist();

module.exports = {
    tokenBlacklist,
};
