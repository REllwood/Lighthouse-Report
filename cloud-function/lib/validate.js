// One plain address only, so the "to" field can't be turned into a list of recipients
const EMAIL_PATTERN = /^[^\s@,;<>"'()[\]\\]+@[^\s@,;<>"'()[\]\\]+\.[^\s@,;<>"'()[\]\\]+$/;
const STRATEGIES = ['mobile', 'desktop'];

/**
 * Checks the request body and returns either the cleaned values or a list of problems
 * @param body - The parsed JSON request body, eg. { "urls": ["https://example.com"], "email": "example@gmail.com", "strategy": "mobile" }
 * @param options.maxUrls - The most URLs allowed in one request
 * @returns {{urls: string[], email: string, strategy: string} | {errors: string[]}}
 */
function parseRequest(body, { maxUrls }) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { errors: ['The request body must be a JSON object, eg. {"urls": ["https://example.com"], "email": "you@example.com"}'] };
    }

    const errors = [];
    const { urls, email, strategy = 'mobile' } = body;

    const cleanUrls = [];
    if (!Array.isArray(urls) || urls.length === 0) {
        errors.push('"urls" must be a non-empty array of URLs');
    } else if (urls.length > maxUrls) {
        errors.push(`"urls" can contain at most ${maxUrls} URLs`);
    } else {
        for (const url of urls) {
            const normalised = normaliseUrl(url);
            if (!normalised) {
                errors.push(`Not a valid http(s) URL: ${String(url).slice(0, 200)}`);
            } else if (!cleanUrls.includes(normalised)) {
                cleanUrls.push(normalised);
            }
        }
    }

    if (typeof email !== 'string' || email.length > 254 || !EMAIL_PATTERN.test(email)) {
        errors.push('"email" must be a single valid email address');
    }

    if (!STRATEGIES.includes(strategy)) {
        errors.push('"strategy" must be "mobile" or "desktop"');
    }

    return errors.length > 0 ? { errors } : { urls: cleanUrls, email, strategy };
}

/**
 * Returns the URL in its standard form if it is an absolute http(s) URL, otherwise null
 * @param value - The value to check
 * @returns {string|null}
 */
function normaliseUrl(value) {
    if (typeof value !== 'string') return null;
    try {
        const url = new URL(value.trim());
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
        return null;
    }
}

module.exports = { parseRequest, normaliseUrl };
