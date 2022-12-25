const {default: puppeteer} = require("puppeteer");

module.exports = {
    async startBrowser() {
        let browser;
        try {
            console.log("Opening the headless browser");
            browser = await puppeteer.launch({
                headless: false,
                args: ["--disable-setuid-sandbox"],
                'ignoreHTTPSErrors': true
            });
        } catch (err) {
            console.warn("Could not create a browser instance => : ", err);
        }
        return browser;
    }
}