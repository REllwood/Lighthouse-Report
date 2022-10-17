const fs = require('fs');
const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
var pdfOptions = { format: 'A4' };
var html_to_pdf = require('html-pdf-node');

/**
 * This is used to kick off the report function, it takes in an array on URL/s to run the lighthouse report on
 * @param urlArray - Array of URL/s to run the report on
 * @returns {Promise<void>}
 */
async function start(urlArray){
    for (const url of urlArray ){
        await runReport(url)
    }
}

/**
 * Takes in a URl and an Output type (To be implemented) and writes the results to a set location (currently PDF file)
 * @param url - The URL to run the lighthouse report on
 * @param outputType - How you want to report result outputted eg. CSV, Google Sheet, BigQuery, PDF, Image, etc
 * @returns {Promise<void>}
 */
async function runReport(url, outputType ) {
    const chrome = await chromeLauncher.launch({chromeFlags: ['--headless']});
    const options = {logLevel: 'info', output: 'html', onlyCategories: ['performance'], port: chrome.port};
    const runnerResult = await lighthouse(url, options);

    var friendlyName = url.replace("https://", '')
    var friendlyName = friendlyName.replace("http://", '')

    // `lhr` stands for the Light House Result as a JS object
    console.log('Report is done for', url);
    console.log('Performance score was', runnerResult.lhr.categories.performance.score * 100);

    // `report` is the HTML report as a string
    const reportHtml = await runnerResult.report;
    let filename = `${friendlyName}.pdf`

    let file = [{ content: reportHtml, name: filename }];

    console.log("Creating report...")
    // converting html file into a pdf and saved to the Report folder
    await html_to_pdf.generatePdfs(file, pdfOptions).then(output => {
        fs.writeFileSync(`Reports/${friendlyName}.pdf`, output[0].buffer )
    });

    await chrome.kill();
}

