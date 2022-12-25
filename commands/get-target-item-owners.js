const { default: axios } = require("axios");
const { SlashCommandBuilder } = require("discord.js");
const { default: next } = require("next");
const browser = require("../scraping/browser.js");
const { startBrowser } = require("../scraping/browser.js");
const StringFormatter = require("../helpers/StringFormatting.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('get-target-item-owners')
        .setDescription('Get list of unverified users & users with < than 100 trade ads for a given item from rolimons.com.')
        .addIntegerOption(option => 
            option.setName("item-id")
                .setDescription('Item ID of the target limited item')
                .setRequired(true)
        ),
    
    async execute(interaction) {
        const itemId = interaction.options.getInteger("item-id");
        const baseItemUrl = "https://www.rolimons.com/item/";
        const targetUrl = baseItemUrl + itemId;

        await interaction.deferReply();

        // Begin initializing browser and new page
        const browser = await startBrowser();
        const page = await browser.newPage();
        
        // Go to item page
        await GotoUrl(page, targetUrl);

        // Terminate script if item ID does not exist.
        await CheckPageExists(page);

        const bc_owners_table_selector = "#bc_owners_table";
        const next_btn_selector = '#bc_owners_table_next';
        const table_length_selector = '#bc_owners_table_length';
        await page.waitForSelector(bc_owners_table_selector);
        await page.waitForSelector(next_btn_selector);
        await page.waitForSelector(table_length_selector);

        // Set pagination to 100 items
        await page.select(table_length_selector + " select" , '100');

        // Get premium userIds
        var userIds = await GetPremiumUserIds(page, next_btn_selector);

        // console.log(userIds);

        userIds = [ '470625011',  '109702302',  '3481048271', '706460512',  '1339524447',
        '398359237',  '266384071',  '66153865',   '251005625',  '2308655124',
        '251817612',  '64495672',   '335575268',  '2302408771', '205640688',
        '524749295',  '29779443',   '1177130320', '144464810',  '2016347381', '2394301869'];
        userIds = userIds.slice(0,18);

        const targetUserIds = await GetAndSendTargetUsers(userIds, interaction);
        console.log(targetUserIds);

        // Precaution if no target users were found:
        if (targetUserIds.length == 0)
            await interaction.editReply('No unverified users (or users with less than 100 trade ads) found.');
    }
}

const GotoUrl = async (page, targetUrl) => {
    try {
        await page.goto(targetUrl, {
            waitUntil: "domcontentloaded",
        });
    } catch(err) {
        console.warn("Error loading URL", err);
        interaction.editReply("Error loading URL");
    }
}

/**
 * Check if item page exists using .item_name selector as indicator.
 * @returns void
 */
const CheckPageExists = async (page) => {
    try{
        await page.$('.item_name');
    } catch(err) {
        console.warn(err);
        console.warn('Item Id does not exist in rolimons.com');
        interaction.editReply(`The following item ID does not exist in rolimons.com: \`${itemId}\``);
        return;
    }
}

/**
 * Obtains a list of user Ids of Premium users with maximum length of nMaxUsers.
 * @param {Puppeteer Page} page - Page object for getting the DOM elements
 * @param {string} next_btn_selector - String selector for obtaining the next button
 * @param {int} maxUsers - maximum number of users to query
 * @returns 
 */
const GetPremiumUserIds = async(page, next_btn_selector, maxUsers = 100) => {
    var isNextBtnDisabled = true;
    var userIds = [];
    var nUsers = 0;
    do {
        // Get all anchor tags for current page
        const pageUserIds = await page.evaluate(() => {
            var pageUserIds = [];
            const data = document.querySelectorAll('#bc_owners_table tr td:nth-child(2) a:nth-child(1)');
            
            // Check if any users own item
            if (data) {
                // Get all user Ids for current page
                data.forEach(user => {
                    // e.g. /player/594486769
                    const playerLink = (user.getAttribute('href'));
                    const userId = playerLink.replace('/player/', '');
                    pageUserIds.push(userId);
                }); 
            }
            
            return pageUserIds;
        })
        if (pageUserIds.length + nUsers <= maxUsers) {
            userIds = userIds.concat(pageUserIds);
            nUsers += pageUserIds.length;
        }
        // Only obtain users that fit the limit
        else {
            const nRemaining = maxUsers - pageUserIds.length;
            userIds = userIds.concat(pageUserIds.slice(0, nRemaining));
            nUsers += nRemaining;
        }
        
        // Check if there is a next page
        isNextBtnDisabled = await page.$eval(next_btn_selector, el => {
            console.log(el.classList.contains('disabled'))
            return el.classList.contains('disabled');
        });

        // Goto next page
        if (!isNextBtnDisabled) {
            await page.$eval(next_btn_selector, el => el.click());
        }
    } while (!isNextBtnDisabled && nUsers < maxUsers);

    return userIds;
}

/**
 * Send list of target users by batch, then returns list of target users found.
 * @param {List} userIds - List of UserIds to filter out
 * @param {Discord Interaction object} interaction - Discord Interaction Object to send responses
 * @returns list of target users found
 */
const GetAndSendTargetUsers = async(userIds, interaction) => {
    const targetUserIds = [];
    var batchUserIds = [];

    for (var i = 0; i < userIds.length; i++) {
        try {
            const userId = userIds[i];
            const response = await axios.get(`https://www.rolimons.com/playerapi/player/${userId}`);
            if (response.status == 200) {
                const data = response.data;
                const badges = data.rolibadges;
                const verified_badge_name = "verified";
                const trades100_badge_name = "create_100_trade_ads";

                if (!(verified_badge_name in badges) || !(trades100_badge_name in badges)) {
                    targetUserIds.push(userId);
                    batchUserIds.push(userId);
                }
                else {
                    console.log(`Nope, ${userId} has either badge`);
                }
            }
            else {
                console.log('Something went wrong when fetching data from the API');
            }

            // console.log(`nUsers: ${i + 1}`);
            // Send batch and set sleep time to avoid rate limit exceeded
            if ((i + 1) % 12 == 0){
                const formattedString = await StringFormatter.FormatBatchMessage(batchUserIds);
                interaction.followUp(formattedString);
                batchUserIds = [];
                
                console.log("Sleeping");
                await sleep(60000);
                console.log("I'm awake");
            }

            // If last, send one last follow up
            if (i == userIds.length - 1) {
                const formattedString = await StringFormatter.FormatBatchMessage(batchUserIds);
                interaction.followUp(formattedString);
                batchUserIds = [];
            }
        }
        catch (error) {
            console.error(error);
        }
    }

    return targetUserIds;
}



const sleep = (ms) => {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }