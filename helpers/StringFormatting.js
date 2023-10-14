const FormatBatchMessage = async(batchUserIds, currentCtr) => {
    var formattedString = "";
    for (var i = 0; i < batchUserIds.length; i++) {
        var userString = await (FormatUserId(i + currentCtr, batchUserIds[i]));
        formattedString = formattedString.concat(userString);
    }
    console.log(`User Batch: \n${formattedString}`);
    return formattedString;
}

const FormatUserId = async(i, userId) => {
    var formattedString = "";
    return new Promise((resolve) => {
        formattedString = formattedString.concat(`${i+1}. https://www.roblox.com/users/${userId}/profile \n`);
        resolve(formattedString);
    })
}
module.exports = { FormatBatchMessage, FormatUserId }