if(process.env.NODE_ENV!=="production"){
    require("dotenv").config();
}

let express=require("express");
let mongoose=require("mongoose");
let path=require("path");
let session=require("express-session");
let mongoStore = require("connect-mongo");
let flash=require("connect-flash");
let bcrypt=require("bcrypt");
let multer=require("multer"); //To parse input[type="file"]
let {storage}=require("./cloudinary.js");
let http=require("http");   //for socket.io
let socketio=require("socket.io");

let upload = multer({ storage});

let User=require("./models/users.js");
let Message = require("./models/messages");
let utils=require("./utils.js");
const { isObject } = require("util");

let app=express();
let server=http.createServer(app);
let io=socketio(server);

let dbUrl=process.env.DB_URL || 'mongodb://localhost:27017/chatDB';
let secret = process.env.SECRET || 'issecret';

let store = mongoStore.create({
    mongoUrl: dbUrl,
    touchAfter: 24*60*60,
    crypto: {
        secret: secret
    }
});

store.on("error", function(err){
    console.log("session store error", err);
})

let sessionConfig=session({
    store: store,
    secret: secret,
    resave: true,
    saveUninitialized: true
}),
sharedsession = require("express-socket.io-session");

app.use(sessionConfig);
io.use(sharedsession(sessionConfig));


app.use(session({secret: secret, resave: false, saveUninitialized: false}));
app.use(flash());


mongoose.connect(dbUrl, {useNewUrlParser: true, useUnifiedTopology: true})
    .then(()=>{
        console.log("connection successful!");
    })
    .catch((err)=>{
        console.log(err);
    })


app.use(express.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next)=>{
    res.locals.password=req.flash("fail");
    res.locals.email=req.flash("fail");
    res.locals.credentials=req.flash("fail2");
    res.locals.success=req.flash("success");
    next();  
})


let users={};
let send=[];
let usersWithFriends = {};
io.on("connection", async (socket)=>{
    console.log("new WS connection");
    socket.on("login", async function(user_id){
        socket.handshake.session.user_id = user_id;
        socket.handshake.session.save();        
    });

    socket.on("logout", function(user_id){
        if(socket.handshake.session.user_id){
            delete socket.handshake.session.user_id;
            socket.handshake.session.save();
        }
    });

    let currentSession=socket.handshake.session.user_id;
    if(typeof currentSession !== "undefined" && typeof socket.id !== "undefined"){
        if(users[currentSession]){
            users[currentSession].push(socket.id);
        }
        else{
            users[currentSession]=new Array();        //maps mongoose_ID to socketID {mongooseID: [socketID,..], ...}
            users[currentSession].push(socket.id);
        }
    }

    let arr = Array.from(io.sockets.sockets.keys()); //connected sockets. Multiple tabs from same user has unique SocketID/Each tab has unique SID


    if(typeof currentSession !== "undefined"){
        let friends = await utils.validateFriends(currentSession);
        for(let f of friends){
            f = f.toString();
            if(usersWithFriends[currentSession]){
                if(usersWithFriends[currentSession].indexOf(f) === -1){  //maps connected MongooseID with their friends {mongooseID: [FriendID, ...]}
                    usersWithFriends[currentSession].push(f);
                }
            }
            else{
                usersWithFriends[currentSession]=new Array();        
                usersWithFriends[currentSession].push(f);
            }
        }
    }

    console.log('users with friends');
    console.log(usersWithFriends);
    
    let connectedUsers = [];                 //Unique users connected regardless of tab duplication by MongooseID
    for (const [key, value] of Object.entries(users)) {
        for(let v of value){
            if(arr.includes(v)){             
                if(!connectedUsers.includes(key)){
                    connectedUsers.push(key);
                }
            }
        }
    }
    console.log('connected users ', connectedUsers);

    for(let c of connectedUsers){      //if connected user is friends with other connected user, show the friend by appending on connect
        let friend = await utils.validateFriends(c);
        for(let cu of connectedUsers){
            for(let f of friend){
                if(f.equals(cu)){
                    io.to(users[c]).emit('listOfUsers', await utils.getUserInfo(f));
                }
            }
        }
    }

        
    console.log("users");
    for (const [key, value] of Object.entries(users)) {
        for(let v of value){
            if(arr.includes(v)){             
                console.log(key, ": ", v);
            }
        }
    }

    send=[];
    socket.on("disconnect", async ()=>{
        let userLeft=await utils.getUserInfo(socket.handshake.session.user_id);
        let users2=users;  //values getting removed from users2 after disconnect after being equalled to users
        for(let [key, value] of Object.entries(users2)){
            for(let i=0; i<value.length; i++){
                if(socket.id === value[i]){
                    delete value[i];
                }

                if(users[key].every(function(item){ return item === undefined })){
                    io.emit("updateRecordArray", key);
                }
            }
        }

        arr = Array.from(io.sockets.sockets.keys());  //connected sockets

        connectedUsers = [];   //Unique connected users by MongooseID
        for (const [key, value] of Object.entries(users)) {
            for(let v of value){
                if(arr.includes(v)){             
                    if(!connectedUsers.includes(key)){
                        connectedUsers.push(key);
                    }
                }
            }
        }

        
        for(let c of connectedUsers){
            let save = [];
            let friend = await utils.validateFriends(c);
            for(let cu of connectedUsers){   //if friends with the other user, show. Repeat for every user
                for(let f of friend){
                    if(f.equals(cu)){
                        save.push(await utils.getUserInfo(cu));
                    }
                }
            }
            io.to(users[c]).emit('disconnectList', save);
        }

        users2=users;     //users array just maps eveything but users2 removes the user who disconnected
        for(let [key, value] of Object.entries(users2)){
            for(let i=0; i<value.length; i++){
                if(socket.id === value[i]){
                    delete value[i];
                }

                if(users[key].every(function(item){ return item === undefined })){
                    io.emit("updateRecordArray", key);
                }
            }
        }

    })

    

    socket.on("chatMsg", async (data) => {
        let sender = await User.findById(socket.handshake.session.user_id);
        let receiver=await User.findOne({name: data.receiver});

        if(receiver){
            io.to(users[receiver.id]).emit("chatMsg", { message: utils.formatMessage(sender.name, data.msg, receiver.name), sender: true });
            io.to(users[sender.id]).emit("chatMsg", { message: utils.formatMessage(sender.name, data.msg, receiver.name), sender: false });
            utils.storeMessages(utils.formatMessage(sender.name, data.msg, receiver.name));
        }
        else{
            io.to(users[sender.id]).emit("handleFlash", "Looks like you forgot to select the sender");
        }
    })
})



app.set("view engine", "ejs");

let port=process.env.PORT || 3000;

app.get("/login", (req, res)=>{
    if(req.session.user_id){
        res.redirect("/home");
    }
    else{
        res.render("login.ejs");
    }
    // res.render("login.ejs");
})

app.get("/signup", (req, res)=>{
    res.render("signup.ejs");
})

app.post("/signup", async (req, res)=>{
    let {name, email, password, dob}=req.body;
    if(utils.validateCredentials(password)!=="wrong password"){
        let {name, email, password, dob}=req.body;
        // console.log(name, email, password, dob);
        let hashed=await bcrypt.hash(password, 12);
        let user=new User({name: name, email: email, password: hashed, dob: dob, picture: {url: "https://res.cloudinary.com/dkgjhgzqp/image/upload/v1630230289/Neutron/l1fn0yfdo22d6wxrp4j9.png", filename: "Neutron/l1fn0yfdo22d6wxrp4j9"}});
        try{
            let final=await user.save();
            req.session.user_id=user._id;
            res.redirect("/home");
        }
        catch(err){
            let x = Object.keys(err.keyValue).toString();
            if(x === "name") x = "User"+x;
            req.flash("fail", `This ${x} has already been entered before`);
            res.redirect("/signup");
        }
        
    }
    else{
        req.flash("fail", "Password length has to be greater than 6 characters");
        res.redirect("/signup");
    }
})


app.post("/login", async (req, res)=>{
    let {email, password}=req.body;
    try{
        let user=await User.findOne({email: email});
        let validPassword=await bcrypt.compare(password, user.password);
        if(validPassword){
            req.session.user_id=user._id;
            res.redirect("/home");
        }
        else{
            req.flash("fail2", "Invalid Credentials");
            res.redirect("/login");
        }
    }
    catch(err){
        req.flash("fail2", "Invalid Credentials");
        res.redirect("/login");
    }
})

app.get("/logout", utils.requireLogin, (req, res)=>{
    req.session.user_id=null;
    res.redirect("/login");
})

app.get("/editprofile", utils.requireLogin, async (req, res)=>{
    let user=await User.findById(req.session.user_id);
    res.render("editprofile.ejs", {user: user});
})

app.post("/editprofile", utils.requireLogin, upload.single("picture"), async (req, res)=>{
    let {name, email, password, dob}=req.body;
    let user=await User.findById(req.session.user_id);
    let foundEmail=await User.findOne({email: email});
    let duplicateName = await User.findOne({name: name});
    let error=false;
    if(password.length<6 && password){
        req.flash("fail", "Password length has to be greater than 6 characters");
        error=true;
    }
    if( (foundEmail && !foundEmail._id.equals(user._id)) || (duplicateName && !duplicateName._id.equals(user._id)) ){  //if duplicate email/name but not of the own user's itself
        req.flash("fail2", `Email and username has to be unique`);
        error=true;
    }

    if(error){
        res.redirect("/editprofile");
    }
    else{
        if(!password && req.file){
            let path=req.file.path;
            let filename=req.file.filename;
            let user=await User.findByIdAndUpdate(req.session.user_id, {name: name, email: email, dob: dob, picture: {url: path, filename: filename}}, {new:true, runValidators: true});
            console.log(user);
            // console.log(req.file);
        }
        else if(password && req.file){
            let hashed=await bcrypt.hash(password, 12);
            let path=req.file.path;
            let filename=req.file.filename;
            let user=await User.findByIdAndUpdate(req.session.user_id, {name: name, password: hashed, email: email, dob: dob, picture: {url: path, filename: filename}}, {new:true, runValidators: true});
            // let user=await User.findByIdAndUpdate(req.session.user_id, {name: name, password: hashed, email: email, dob: dob}, {new:true, runValidators: true});
        }
        else{
            if(password){
                password=await bcrypt.hash(password, 12);
                let user=await User.findByIdAndUpdate(req.session.user_id, {name: name, password: password, email: email, dob: dob}, {new:true, runValidators: true});
            }
            else{
                let user=await User.findById(req.session.user_id);
                let password=user.password;
                await User.findByIdAndUpdate(req.session.user_id, {name: name, password: password, email: email, dob: dob}, {new:true, runValidators: true});
            }
        }
        req.flash("success", "Successfully edited your profile");
        res.redirect("/getprofile");
    }
})

app.get("/getprofile", async (req, res)=>{
    let user=await User.findById(req.session.user_id);
    res.render("profile.ejs", {user: user});
})

app.get("/delete", utils.requireLogin, async (req, res)=>{
    let user=await User.findByIdAndDelete(req.session.user_id);
    req.session.user_id=null;
    req.flash("success", "account deleted successfully");
    res.redirect("/login");
})

app.get("/home", utils.requireLogin, async (req, res)=>{
    // console.log("express session", req.session.user_id);
    let user=await User.findById(req.session.user_id);
    res.render("home.ejs", {user: user});
})

//Chat functionality request from client side socket.io(main.js)
app.get("/get_messages", async (req, res) => {
    let {receiver} = req.query;
    let sender = req.session.user_id;
    let receiverFull = await User.findOne({name: receiver});
    let senderFull = await User.findById(req.session.user_id);
    // console.log('message info', receiverFull.name, senderFull.name);
    // let messages = await Message.find({sender: senderFull.name, receiver: receiverFull.name});
    let messages = await Message.find({$or: [{sender: senderFull.name, receiver: receiverFull.name}, {sender: receiverFull.name, receiver: senderFull.name}]});
    res.send(messages);
})

app.get("/get_info", async (req, res) => {
    let {receiver} = req.query;
    let user = await User.findOne({name: receiver}); 
    res.send(user);
})



app.get("/friends/:friend_id", utils.requireLogin, async (req, res)=>{
    let {friend_id}=req.params;
    // console.log(friend_id);
    let friend=await User.findById(friend_id).populate("picture");
    let user=await User.findById(req.session.user_id).populate("friends");
    console.log(user, friend);
    // res.send("frdoneiend");
    res.render("friends.ejs", {friend: friend, user: user});
})

app.get("/unfriend/:friend_id", utils.requireLogin, async (req, res)=>{
    let {friend_id}=req.params;
    let user=await User.findOneAndUpdate({_id: req.session.user_id}, {$pull: {friends: friend_id}});  //Removing friend from friend list
    // console.log(user);
    res.redirect("/friends");
})

app.get("/block/:friend_id", utils.requireLogin, async (req, res)=>{
    let {friend_id}=req.params;
    let user=await User.findById(req.session.user_id);
    await User.findOneAndUpdate({_id: req.session.user_id}, {$pull: {friends: friend_id}});
    let blocked=await User.findById(friend_id);
    user.blockList.push(blocked);
    await user.save();
    res.redirect("/friends");
})

app.get("/friends", async (req, res)=>{
    let user=await User.findById(req.session.user_id).populate("friends").populate("blockList");
    res.render("friends.ejs", {user: user});
})


app.get("/searchresults", utils.requireLogin, async (req, res)=>{
    let user=await User.findById(req.session.user_id).populate("friends").populate("blockList");
    let {search}=req.query;
    // let final="/"+search+"/";
    let results=await User.find({name: {$regex: search, $options: "i"}});
    // console.log(user);
    // console.log(results);
    res.render("search.ejs", {user: user, results: results, search: search});
})

app.post("/:receiver_id/personal_message", utils.requireLogin, async (req, res) => {
    let {receiver_id} = req.params;
    let {msg_input} = req.body;
    let senderID = req.session.user_id;

    let receiver = await User.findById(receiver_id);
    let sender = await User.findById(senderID);
    await utils.storeMessages(utils.formatMessage(sender.name, msg_input, receiver.name));
    res.redirect(`/${senderID}/${receiver_id}/personal_message`);
})

app.get("/:user_id/:id/addfriend", utils.requireLogin, async (req, res)=>{
    let {user_id, id}=req.params;
    let user=await User.findById(user_id);
    let addFriend=await User.findById(id);
    user.friends.push(addFriend);
    addFriend.friends.push(user);
    await user.save();
    await addFriend.save();
    req.flash("success", "friend successfully added!");
    res.redirect("/friends");
})

app.get("/:user_id/:receiver_id/personal_message", utils.requireLogin, async (req, res) => {
    let {user_id, receiver_id} = req.params;
    let user=await User.findById(user_id);
    let receiver = await User.findById(receiver_id);
    // let receiverMsg = await Message.find({sender: receiver.name});
    let msg = await Message.find({$or: [{sender: user.name, receiver: receiver.name}, {sender: receiver.name, receiver: user.name}]});
    res.render("message.ejs", {user: user, receiver: receiver, msg: msg});
})



app.all("*", (req, res, next)=>{
    next(new utils.AppError("Page Not Found", 404));
})

app.use((err, req, res, next)=>{
    let {status=500}=err;
    res.status(status).render("error.ejs", {err: err});
})

server.listen(port, ()=>{
    console.log(`listening on port ${port}`);
})