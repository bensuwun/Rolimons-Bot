module.exports = {
    FormatBatchMessage: async(batchUserIds) => {
        var formattedString = "";
        console.log("Running");
        for (var i = 0; i < batchUserIds.length; i++) {
            var userString = await (FormatUserId(i, batchUserIds[i]));
            console.log(`User String: ${userString}`);
            formattedString = formattedString.concat(userString);
        }
        return formattedString;
    },
    
    FormatUserId: async(i, userId) => {
        var formattedString = "";
        return new Promise((resolve) => {
            formattedString = formattedString.concat(`${i+1}. https://www.roblox.com/users/${userId}/profile \n`);
            resolve(formattedString);
        })
    }
}