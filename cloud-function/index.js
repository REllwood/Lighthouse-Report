const pdf = require('pdfkit');
const nodemailer = require('nodemailer');
const { loadConfig, missingSettings, bigQueryEnabled } = require('./lib/config');
const { analyseUrls } = require('./lib/pagespeed');
const { saveResults } = require('./lib/bigquery');

/**
 * Builds the HTTP handler. The defaults talk to the real services, tests pass in fakes
 * @param deps.env - Environment variables
 * @param deps.fetchImpl - fetch function used for PageSpeed Insights
 * @param deps.bigquery - BigQuery client
 * @returns {function(req, res): Promise<void>}
 */
function createHandler({ env = process.env, fetchImpl = fetch, bigquery } = {}) {
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
        // Check the settings before doing anything that uses API quota
        const config = loadConfig(env);
        const missing = missingSettings(config);
        if (missing.length > 0) {
            console.error(`Missing environment variables: ${missing.join(', ')}`);
            res.status(500).json({ error: 'The function is not configured yet, see the logs for which settings are missing' });
            return;
        }

        const urls = req.body.urls;
        const email = req.body.email;
        const pdfName = 'lighthouse-report.pdf';
        let pdfData = '';
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'test@gmail.com',
                pass: 'Gmail Password'
            }
        });

        // Runs every URL through PageSpeed Insights at the same time and waits for all of them before carrying on
        const { results, failures } = await analyseUrls(urls, { apiKey: config.psiApiKey, strategy: 'mobile', fetchImpl });
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

        //This is messy but it formats the report nicely
        const doc = new pdf();
        doc.pipe(pdfData);
        doc.text('Lighthouse Report');
        doc.text(' ');
        doc.text(' ');
        doc.text(' ');
        for (let j = 0; j < results.length; j++) {
            doc.text(`Report ${j + 1}`);
            doc.text(`Score: ${results[j].score}`);
            doc.text(`Title: ${results[j].title}`);
            doc.text(`Number of Resources: ${results[j].pageStats.numberResources}`);
            doc.text(`Number of Hosts: ${results[j].pageStats.numberHosts}`);
            doc.text(`Total Request Bytes: ${results[j].pageStats.totalRequestBytes}`);
            doc.text(`Number of Static Resources: ${results[j].pageStats.numberStaticResources}`);
            doc.text(`HTML Response Bytes: ${results[j].pageStats.htmlResponseBytes}`);
            doc.text(`CSS Response Bytes: ${results[j].pageStats.cssResponseBytes}`);
            doc.text(`Image Response Bytes: ${results[j].pageStats.imageResponseBytes}`);
            doc.text(`JavaScript Response Bytes: ${results[j].pageStats.javascriptResponseBytes}`);
            doc.text(`Other Response Bytes: ${results[j].pageStats.otherResponseBytes}`);
            doc.text(`Number of JS Resources: ${results[j].pageStats.numberJsResources}`);
            doc.text(`Number of CSS Resources: ${results[j].pageStats.numberCssResources}`);
            doc.text(' ');
            doc.text(' ');
        }
        doc.end();

        //This emails the user the report with a small subject and text outlining what is in the report
        const mailOptions = {
            from: 'emailservice@gmail.com',
            to: email,
            subject: 'Lighthouse Report',
            text: 'Please find attached the Lighthouse report for the URLs you provided',
            attachments: [{
                filename: pdfName,
                content: pdfData
            }]
        };
        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent: ${info.response}`);
        res.send(`Lighthouse report generated and sent to ${email}`);
    }
}

/**
 * HTTP Cloud Function. Takes a request body (example in readme), runs a Google Lighthouse report on each URL using the PageSpeed Insights API,
 * loads the results into a BigQuery table (when configured), generates a PDF report of the results and sends it as an email attachment to the requested email
 */
exports.run_lighthouse = createHandler();
exports.createHandler = createHandler;
