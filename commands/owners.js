const { default: axios } = require("axios");
const { SlashCommandBuilder } = require("discord.js");
const browser = require("../scraping/browser.js");
const { startBrowser } = require("../scraping/browser.js");
const StringFormatter = require("../helpers/StringFormatting.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('owners')
        .setDescription('Get list of unverified users & users with < than 100 trade ads for a given item from rolimons.com.')
        .addIntegerOption(option => 
            option.setName("item-id")
                .setDescription('Item ID of the target limited item')
                .setRequired(true)
        )
        .addIntegerOption(option => 
            option.setName("user-count")
                .setDescription('Number of users to fetch (maximum of 100)')
        ),
    
    async execute(interaction) {
        const itemId = interaction.options.getInteger("item-id");
        const userCount = interaction.options.getInteger("user-count") || 12;
        const maxUsers = 100;
        const baseItemUrl = "https://www.rolimons.com/item/";
        const targetUrl = baseItemUrl + itemId;
        const client = interaction.client;

        console.log(`Attempting to fetch ${userCount} users for ${itemId}.`);

        // Check if cooldown ongoing;
        const isOnCooldown = IsOnCooldown(interaction);
        if (isOnCooldown) {
            console.log(`Please wait for cooldown to end.`);
            await interaction.reply({ content: "Please wait for cooldown to end", ephemeral: true });
            return;
        }

        if (userCount > maxUsers) {
            console.log(`Please provide a userCount less than ${maxUsers}.`);
            await interaction.reply(`Please provide a userCount less than ${maxUsers}.`);
            return;
        }
        // Set executing cooldown
        client.executingCooldowns.set(interaction.user.id, true)

        await interaction.deferReply();

        // Begin initializing browser and new page
        const browser = await startBrowser();
        const page = await browser.newPage();
        
        // Go to item page
        const success = await GotoUrl(page, targetUrl, interaction);
        if (!success) {
            await interaction.editReply("Error loading URL");
            client.executingCooldowns.delete(interaction.user.id);

            // Exit browser and page
            await browser.close();
            return;
        }

        // Terminate script if item ID does not exist.
        const exists = await CheckPageExists(page, interaction);
        if (!exists) {
            console.log(`Item Id ${itemId} does not exist in rolimons.com`);
            await interaction.editReply(`The following item ID does not exist in rolimons.com: \`${itemId}\``);
            client.executingCooldowns.delete(interaction.user.id);

            await browser.close();
            return;
        }

        const bc_owners_table_selector = "#bc_owners_table";
        const next_btn_selector = '#bc_owners_table_next';
        const table_length_selector = '#bc_owners_table_length';
        await page.waitForSelector(bc_owners_table_selector);
        await page.waitForSelector(next_btn_selector);
        await page.waitForSelector(table_length_selector);

        // Set pagination to 100 items
        await page.select(table_length_selector + " select" , '100');

        // Get premium userIds
        var userIds = await GetPremiumUserIds(page, next_btn_selector, userCount);
        console.log(`Total user IDs: ${userIds.length}`);
        console.log(userIds);

        // userIds = userIds.slice(0,18);

        const targetUserIds = await GetAndSendTargetUsers(userIds, interaction);
        console.log(targetUserIds);

        // Precaution if no target users were found:
        if (targetUserIds.length == 0){
            console.log(`No unverified users (or users with less than 100 trade ads) found for item ${itemId}.`);
            await interaction.editReply(`No unverified users (or users with less than 100 trade ads) found for item ${itemId}.`);
        }
        else {
            console.log(`[COMPLETE] Finished fetching users for item: ${itemId}`);
            await interaction.followUp(`[COMPLETE] Finished fetching users for item: ${itemId}`);
        }

        await browser.close();

        // Remove executing cooldown
        client.executingCooldowns.delete(interaction.user.id);

        // Set cooldown for rate limit
        client.cooldowns.set(interaction.user.id, true);
        setTimeout(() => {
            client.cooldowns.delete(interaction.user.id); 
        }, client.COOLDOWN_SECONDS * 1000);
    }
}

const IsOnCooldown = (interaction) => {
    const client = interaction.client;
    var isOnCooldown = false;

    if (client.cooldowns.has(interaction.user.id) || client.executingCooldowns.has(interaction.user.id)) {
        isOnCooldown = true;
    }
    return isOnCooldown;
}

const GotoUrl = async (page, targetUrl, interaction) => {
    try {
        await page.goto(targetUrl);
        return true;
    } catch(err) {
        console.warn("Error loading URL", err);
        return false;
    }
}

/**
 * Check if item page exists using .item_name selector as indicator.
 * @returns void
 */
const CheckPageExists = async (page, interaction) => {
    try{
        const exists = await page.$('.item_name');
        return exists;
    } catch(err) {
        console.warn(err);
        console.warn('Item Id does not exist in rolimons.com');
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
const GetPremiumUserIds = async(page, next_btn_selector, userCount) => {
    var isNextBtnDisabled = true;
    var userIds = [];
    var nUsers = 0;
    const pageLimit = 100;
    do {
        // Get all anchor tags for current page
        var pageUserIds = await page.evaluate(() => {
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

        if (userCount < pageLimit) {
            pageUserIds = pageUserIds.slice(0, userCount);
        }
        // page users + current users <= number of users to fetch
        else if (pageUserIds.length + nUsers <= userCount) {
            pageUserIds = pageUserIds;
        }        
        // Too many retrieved users, reduce (will only run once)
        else {
            const nRemaining = userCount - pageUserIds.length;
            pageUserIds = pageUserIds.slice(0, nRemaining);
        }

        userIds = userIds.concat(pageUserIds);
        nUsers += pageUserIds.length;

        // Remove duplicates in userIds
        userIds = [...new Set(userIds)];
        
        // Check if there is a next page
        isNextBtnDisabled = await page.$eval(next_btn_selector, el => {
            console.log(el.classList.contains('disabled'))
            return el.classList.contains('disabled');
        });

        // Goto next page
        if (!isNextBtnDisabled) {
            await page.$eval(next_btn_selector, el => el.click());
        }
    } while (!isNextBtnDisabled && nUsers < userCount);

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
                if (formattedString !== ""){
                    await interaction.followUp(formattedString);
                    console.log("Sleeping");
                    await sleep(60000);
                    console.log("I'm awake");
                }
                batchUserIds = [];
            }

            // If last, send one last follow up
            if (i == userIds.length - 1) {
                const formattedString = await StringFormatter.FormatBatchMessage(batchUserIds);
                if (formattedString !== "") {
                    await interaction.followUp(formattedString);
                }
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