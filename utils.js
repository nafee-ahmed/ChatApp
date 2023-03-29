let moment=require("moment");

let mongoose=require("mongoose");
let users = [];
let dbUrl=process.env.DB_URL || 'mongodb://localhost:27017/chatDB';
mongoose.connect(dbUrl, {useNewUrlParser: true, useUnifiedTopology: true})
    .then(()=>{
        console.log("connection successful");
    })
    .catch((err)=>{
        console.log(err);
    })

let User=require("./models/users.js");
let Message = require("./models/messages.js");

function validateCredentials(password){
    if(password && password.length<6){
        return "wrong password";
    }
}

class AppError extends Error{
    constructor(message, status){
        super();
        this.message=message;
        this.status=status;
    }
}

function requireLogin(req, res, next){
    if(!req.session.user_id){
        next(new AppError("You need to log in or sign up", 404));
    }
    else{
        next();
    }
}

function formatMessage(username, text, receiver){
    return {
        username: username, 
        text: text,
        time: moment().format("h:mm a"),
        receiver: receiver
    };
}

async function getUserInfo(user_id){
    let user=await User.findById(user_id).populate("friends").populate("picture");
    if(!user){
        return "not found!";
    }
    else{
        return {
            id: user._id,
            name: user.name,
            email: user.email,
            friends: user.friends,
            picture: user.picture.url
        };

        // return user.name;
    }
}

function joinUser(id, room){
    let user = {id, room};
    users.push(user);
    return user;
}

async function validateFriends(currentSession){
    let friend = [];
    let user = await User.findById(currentSession).populate("friends");
    if(user){
        for(let f of user.friends){
            friend.push(f._id);
        }
        return friend;
    }
    else{
        return "friends not found";
    }
}

async function storeMessages(obj){
    // console.log('DB info', obj);
    let sender = obj.username;
    let receiver = obj.receiver;
    let message = obj.text;
    let time = obj.time;
    let m = new Message({sender: sender, receiver: receiver, message: message, time: time});
    try{
        await m.save();
    }
    catch(err){
        console.log(err);
    }
}


module.exports.validateCredentials=validateCredentials;
module.exports.AppError=AppError;
module.exports.requireLogin=requireLogin;
module.exports.formatMessage=formatMessage;
module.exports.getUserInfo=getUserInfo;
module.exports.joinUser=joinUser;
module.exports.validateFriends = validateFriends;
module.exports.storeMessages = storeMessages;