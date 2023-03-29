let mongoose=require("mongoose");

let userSchema=new mongoose.Schema({
    name: {
        type: String, 
        required: [true, "Please enter your name"],
        unique: true
    },
    email: {
        type: String, 
        required: [true, "Please enter your email"],
        unique: true
    },
    password: {
        type: String,
        required: [true, "Please enter your password"]
    },
    dob: {
        type: String,
        required: [true, "Please enter Data of Birth"]
    },
    picture: {
        url: String,
        filename: String
    },
    friends: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],
    blockList: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }]
});

userSchema.post("findOneAndDelete", async function(d){
    console.log("DELETED post");
})

let User=mongoose.model("User", userSchema);
module.exports=User;