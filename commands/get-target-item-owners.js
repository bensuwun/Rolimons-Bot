const { SlashCommandBuilder } = require("discord.js");
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
        await interaction.deferReply();

        const itemId = interaction.options.getInteger("item-id");
        const baseUrl = "https://www.rolimons.com/item/";
        const targetUrl = baseUrl + itemId;
        console.log(targetUrl)

        // Begin initializing browser and new page
        const browser = await startBrowser();
        const page = await browser.newPage();
        
        
        // Navigate to rolimons.com/item/{itemId}
        await page.goto(targetUrl);

        await interaction.editReply(`Navigated to ${targetUrl}`);
    }
}