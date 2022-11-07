let mongoose = require("mongoose");

let messageSchema = new mongoose.Schema({
    sender: {
        type: String,
        required: [true, "sender not received"]
    },
    receiver: {
        type: String,
        required: [true, "receiver not received"]
    },
    message: {
        type: String,
        required: [true, "message not received"]
    },
    time: {
        type: String, 
        required: [true, "time not received"]
    }
});

let Message = mongoose.model("Message", messageSchema);
module.exports = Message;
