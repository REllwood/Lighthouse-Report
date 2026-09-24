const axios = require('axios');
const { BigQuery } = require('@google-cloud/bigquery');
const pdf = require('pdfkit');
const nodemailer = require('nodemailer');




/**
 * This function is takes a request body (example in readme), it then runs a Google Lighthouse report on each URL using the Lighthouse API, loads the report results into a BigQuery table,
 * generates a PDF report of the results and sends it as an email attachment to the users requested email
 * @param req - This is used to kick off the function, this should contain a body with a URL array and an email address of where to send
 * the report in a PDF format
 * @returns {Promise<void>}
 */
exports.run_lighthouse = (req, res) => {
    const urls = req.body.urls;
    const email = req.body.email;
    const apiKey = process.env.API_KEY;
    const bigquery = new BigQuery();
    const datasetId = ''; // Add dataset ID
    const tableId = '';  // Add tableID eg. Lighthouse report
    const table = bigquery.dataset(datasetId).table(tableId);
    const reports = [];
    const pdfName = 'lighthouse-report.pdf';
    let pdfData = '';
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'test@gmail.com',
            pass: 'Gmail Password'
        }
    });

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        axios.get(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${url}&strategy=mobile`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        })
            .then(response => {
                reports.push(response.data);
                if (i === urls.length - 1) {
                   //Loading report into BQ
                    table.insert(reports)
                        .then(() => {
                            //This is messy but it formats the report nicely
                            const doc = new pdf();
                            doc.pipe(pdfData);
                            doc.text('Lighthouse Report');
                            doc.text(' ');
                            doc.text(' ');
                            doc.text(' ');
                            for (let j = 0; j < reports.length; j++) {
                                doc.text(`Report ${j + 1}`);
                                doc.text(`Score: ${reports[j].score}`);
                                doc.text(`Title: ${reports[j].title}`);
                                doc.text(`Number of Resources: ${reports[j].pageStats.numberResources}`);
                                doc.text(`Number of Hosts: ${reports[j].pageStats.numberHosts}`);
                                doc.text(`Total Request Bytes: ${reports[j].pageStats.totalRequestBytes}`);
                                doc.text(`Number of Static Resources: ${reports[j].pageStats.numberStaticResources}`);
                                doc.text(`HTML Response Bytes: ${reports[j].pageStats.htmlResponseBytes}`);
                                doc.text(`CSS Response Bytes: ${reports[j].pageStats.cssResponseBytes}`);
                                doc.text(`Image Response Bytes: ${reports[j].pageStats.imageResponseBytes}`);
                                doc.text(`JavaScript Response Bytes: ${reports[j].pageStats.javascriptResponseBytes}`);
                                doc.text(`Other Response Bytes: ${reports[j].pageStats.otherResponseBytes}`);
                                doc.text(`Number of JS Resources: ${reports[j].pageStats.numberJsResources}`);
                                doc.text(`Number of CSS Resources: ${reports[j].pageStats.numberCssResources}`);
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
                            transporter.sendMail(mailOptions, (error, info) => {
                                if (error) {
                                    console.log(error);
                                } else {
                                    console.log(`Email sent: ${info.response}`);
                                    res.send(`Lighthouse report generated and sent to ${email}`);
                                }
                            });
                        })
                        .catch(err => {
                            console.error(err);
                            res.status(500).send(err);
                        });
                }
            })
            .catch(err => {
                console.error(err);
                res.status(500).send(err);
            });
    }}
