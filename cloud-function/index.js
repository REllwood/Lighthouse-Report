const { loadConfig, missingSettings, bigQueryEnabled } = require('./lib/config');
const { parseRequest } = require('./lib/validate');
const { analyseUrls } = require('./lib/pagespeed');
const { saveResults } = require('./lib/bigquery');
const { buildPdf } = require('./lib/pdf');
const { createTransport, sendReport } = require('./lib/email');

/**
 * Builds the HTTP handler. The defaults talk to the real services, tests pass in fakes
 * @param deps.env - Environment variables
 * @param deps.fetchImpl - fetch function used for PageSpeed Insights
 * @param deps.bigquery - BigQuery client
 * @param deps.transporterFactory - Creates the email transport from the SMTP settings
 * @returns {function(req, res): Promise<void>}
 */
function createHandler({ env = process.env, fetchImpl = fetch, bigquery, transporterFactory = createTransport } = {}) {
    return async function runLighthouse(req, res) {
        try {
            await handle(req, res);
        } catch (err) {
            // Never send the error itself back, it can carry request details
            console.error(`Unexpected error: ${err.stack || err.message}`);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Something went wrong while generating the report' });
            }
        }
    };

    async function handle(req, res) {
        if (req.method !== 'POST') {
            res.set('Allow', 'POST');
            res.status(405).json({ error: 'Send a POST request with a JSON body' });
            return;
        }

        // Check the settings before doing anything that uses API quota
        const config = loadConfig(env);
        const missing = missingSettings(config);
        if (missing.length > 0) {
            console.error(`Missing environment variables: ${missing.join(', ')}`);
            res.status(500).json({ error: 'The function is not configured yet, see the logs for which settings are missing' });
            return;
        }

        const request = parseRequest(req.body, config);
        if (request.errors) {
            res.status(400).json({ errors: request.errors });
            return;
        }

        // Runs every URL through PageSpeed Insights at the same time and waits for all of them before carrying on
        const { results, failures } = await analyseUrls(request.urls, { apiKey: config.psiApiKey, strategy: request.strategy, fetchImpl });
        for (const failure of failures) {
            console.error(`PageSpeed Insights failed for ${failure.url}: ${failure.error}`);
        }
        if (results.length === 0) {
            res.status(502).json({ error: 'None of the URLs could be analysed', failures });
            return;
        }

        // Loads one row per URL into BigQuery, when BQ_DATASET and BQ_TABLE are set
        if (bigQueryEnabled(config)) {
            try {
                await saveResults(results, config.bigQuery, bigquery);
            } catch (err) {
                console.error(err.message);
                res.status(500).json({ error: 'Could not save the results to BigQuery' });
                return;
            }
        }

        // Builds the whole PDF in memory first, so the email has the finished file to attach
        const pdf = await buildPdf(results, failures);

        try {
            await sendReport(transporterFactory(config.smtp), { from: config.mailFrom, to: request.email, pdf, results, failures });
        } catch (err) {
            console.error(`Email failed: ${err.message}`);
            res.status(500).json({ error: 'The report was generated but the email could not be sent' });
            return;
        }

        console.log(`Lighthouse report for ${results.length} URL(s) sent to ${request.email}`);
        res.status(200).json({ message: `Lighthouse report sent to ${request.email}`, results, failures });
    }
}

/**
 * HTTP Cloud Function. Takes a JSON body like {"urls": ["https://example.com"], "email": "example@gmail.com"}, runs each URL through
 * PageSpeed Insights (Lighthouse), loads the results into BigQuery (when configured) and emails a PDF report to the address given
 */
exports.run_lighthouse = createHandler();
exports.createHandler = createHandler;
