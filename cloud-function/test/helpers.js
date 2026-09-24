const zlib = require('node:zlib');
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

/**
 * Pulls the text out of a PDF made by PDFKit (standard fonts write text as hex strings inside TJ operators)
 * @param pdf - The PDF as a Buffer
 * @returns {string}
 */
function pdfText(pdf) {
    const raw = pdf.toString('latin1');
    const lines = [];
    for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
        let content;
        try {
            content = zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
        } catch {
            continue;
        }
        for (const tj of content.matchAll(/\[(.*?)\] TJ/g)) {
            const hexParts = [...tj[1].matchAll(/<([0-9a-fA-F]*)>/g)].map(part => Buffer.from(part[1], 'hex').toString('latin1'));
            lines.push(hexParts.join(''));
        }
    }
    return lines.join('\n');
}

module.exports = { psiFixture, fakeFetch, pdfText };
