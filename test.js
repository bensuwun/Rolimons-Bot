// Testing Promises

const FormatBatchMessage = async(batchUserIds) => {
    var formattedString = "";
    console.log("Running");
    for (var i = 0; i < batchUserIds.length; i++) {
        var userString = await (FormatUserId(i, batchUserIds[i]));
        console.log(`User String: ${userString}`);
        formattedString.concat(userString);
    }

    console.log(formattedString);
}

const FormatUserId = async(i, userId) => {
    var formattedString = "";
    return new Promise((resolve) => {
        formattedString = formattedString.concat(`${i+1}. https://www.roblox.com/users/${userId}/profile`);
        resolve(formattedString);
    })
}
var arr = [1,2,3,4,5];


FormatBatchMessage(arr);