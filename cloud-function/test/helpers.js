const psiResponse = require('./fixtures/psi-response.json');

/**
 * A copy of the fixture PageSpeed Insights response, so tests can change it safely
 */
function psiFixture() {
    return structuredClone(psiResponse);
}

/**
 * A fake fetch that answers each PageSpeed Insights request with the given handler and records the URLs requested
 * @param handler - (requestedUrl) => { status, body } or a Promise of one. Returning nothing answers with the fixture
 */
function fakeFetch(handler = () => undefined) {
    const calls = [];
    const fetchImpl = async (requestUrl, init) => {
        calls.push({ url: new URL(requestUrl), init });
        const answer = await handler(new URL(requestUrl).searchParams.get('url'));
        const { status = 200, body } = answer || { body: psiFixture() };
        return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    };
    return { fetchImpl, calls };
}

module.exports = { psiFixture, fakeFetch };
