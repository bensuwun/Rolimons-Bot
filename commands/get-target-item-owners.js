const { default: axios } = require("axios");
const { SlashCommandBuilder } = require("discord.js");
const { default: next } = require("next");
const browser = require("../scraping/browser.js");
const { startBrowser } = require("../scraping/browser.js");

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
        const userIds = await GetPremiumUserIds(page, next_btn_selector);
        
        console.log(userIds);
        console.log(userIds.length);
        
        // ==================================================
        // Iterate through each user
        // userIds = userIds.slice(0, 2);
        // userIds = [ '12726040', '706460512', '2394301869'];
        // const targetUserIds = await GetTargetUsers(userIds);
        // console.log(targetUserIds);

        await interaction.editReply(`Navigated to ${targetUrl}`);
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

const GetPremiumUserIds = async(page, next_btn_selector, maxUsers = 150) => {
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

const GetTargetUsers = async(userIds) => {
    const targetUserIds = [];

    for (const userId of userIds) {
        try {
            const response = await axios.get(`https://www.rolimons.com/playerapi/player/${userId}`);
            if (response.status == 200) {
                const data = response.data;
                const badges = data.rolibadges;
                const verified_badge_name = "verified";
                const trades100_badge_name = "create_100_trade_ads";

                if (!(verified_badge_name in badges) || !(trades100_badge_name in badges)) {
                    targetUserIds.push(userId);
                }
                else {
                    console.log(`Nope, ${userId} has either badge`);
                }
            }
            else {
                console.log('Something went wrong when fetching data from the API');
            }
        }
        catch (error) {
            console.error(error);
        }
    }

    return targetUserIds;
}