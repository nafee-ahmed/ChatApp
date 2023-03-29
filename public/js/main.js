let chatForm=document.querySelector("#chat-form");
let fullMessageBox=document.querySelector(".full-message-box");
let li=document.querySelectorAll(".active-people-li");
let div2=document.querySelector(".active-people");
// let url = process.env.baseURL || 'http://localhost:3000';
let url = "https://protected-earth-46176.herokuapp.com/";

let socket=io();

let receiver;
let picture;
let selected = false;


socket.on("handleFlash", msg => {
    let div = document.querySelector(".joiner-div");
    let p=document.createElement("p");
    p.classList.add("flash-p");
    p.innerHTML = msg;
    div.append(p);
})

let record=[];
socket.on("listOfUsers", msg=>{
    console.log("list");
    if(!record.includes(msg.id)){
        record.push(msg.id);
        outputActiveUsers(msg);
    }
})


socket.on("updateRecordArray", x => {
    for(let i=0; i<record.length; i++){
        if(record[i] === x){
            delete record[i];
        }
    }
})

let record2=[];
socket.on("disconnectList", msg=>{
    document.querySelector(".the-ul").remove();
    let ul2=document.createElement("ul");
    ul2.classList.add("the-ul");
    div2.append(ul2);

    for(let m of msg){
        if(!record2.includes(m.id)){
            record2.push(m.id);
            outputActiveUsers(m);
        }
        
    }
    record2=[];
})

console.log('selected', selected);
socket.on("chatMsg", obj=>{
    if(selected){
        if(obj.sender){
            outputMessage(obj.message);  //Outputs message to DOM
        }
        else{
            outputMessage2(obj.message);
        }
    }
    else{
        // console.log('not selected');
        outputMessage3(obj.message);
    }
    console.log("msg", obj.message);
    document.querySelector(".full-message-box").scrollTop=document.querySelector(".full-message-box").scrollHeight;
});


chatForm.addEventListener("submit", (event)=>{
    event.preventDefault();
    let msgInput=document.querySelector("#msg-input").value;
    socket.emit("chatMsg", {msg: msgInput, receiver: receiver});
    document.querySelector("#msg-input").value="";
    document.querySelector("#msg-input").focus();

})


function outputMessage(msg){
    let div=document.createElement("div");
    div.classList.add("msg-wrapper");
     div.innerHTML=`<div class="msg-wrapper">
                        <div class="msg">
                            <p>${msg.text}</p>
                        </div>
                        <span id="you-time" class="time">${msg.time}</span>
                    </div>`;
    if(!document.querySelector(".msg-wrapper")){
        document.querySelector(".full-message-box").appendChild(div);
    }
    else{
        document.querySelector(".msg-wrapper").appendChild(div);
    }
}

function outputMessage2(msg){
    let div=document.createElement("div");
    div.classList.add("msg-wrapper");
     div.innerHTML=`<div class="msg-wrapper">
                        <div class="msg opp-msg">
                            <p>${msg.text}</p>
                        </div>
                        <span id="not-you-time" class="time">${msg.time}</span>
                    </div>`;
    if(!document.querySelector(".msg-wrapper")){
        document.querySelector(".full-message-box").appendChild(div);
    }
    else{
        document.querySelector(".msg-wrapper").appendChild(div);
    }

}


function outputMessage3(msg){
    let div=document.createElement("div");
    div.classList.add("msg-wrapper");
     div.innerHTML=`<div class="msg-wrapper">
                        <div class="msg">
                            <p>${msg.username} says ${msg.text}</p>
                        </div>
                        <span id="you-time" class="time">${msg.time}</span>
                    </div>`;
    if(!document.querySelector(".msg-wrapper")){
        document.querySelector(".full-message-box").appendChild(div);
    }
    else{
        document.querySelector(".msg-wrapper").appendChild(div);
    }

}

let users = [];
async function outputActiveUsers(msg){
    let res4 = await axios.get(`/get_messages?receiver=${msg.name}`);    ////////
    let lastMessage;
    if(res4.data && res4.data.length > 0){
        lastMessage = res4.data[res4.data.length - 1].message
    }
    else{
        lastMessage = '';
    }

    let li=document.createElement("li");
    li.classList.add("active-people-li");
    li.innerHTML= `<div class="active-sidebar">
                        <div class="div-of-img">
                            <img src="${msg.picture}" alt="" class="active-profile-img">
                        </div>
                        <div>
                            <h4 class='the-h4'onclick='onUserSelected(this.innerHTML);'>${msg.name}</h4>
                            <h5>${lastMessage}</h5>
                        </div>
                    </div>`;
    document.querySelector(".the-ul").appendChild(li);
}



async function onUserSelected(username){
    selected = true;
    receiver = username;
    let res = await axios.get(`/get_info?receiver=${username}`);    ////
    picture = res.data.picture.url;
    if(receiver){
        let div = document.querySelector(".active-person-div");
        div.innerHTML = `<div>
                            <img src="${picture}" alt="" class="active-profile-img">
                        </div>
                        <div>
                            <h3>${receiver}<sup>Active</sup></h3>
                        </div>`;
    }

    document.querySelector(".full-message-box").remove();
    let div2=document.createElement("div");
    div2.classList.add("full-message-box");
    let div = document.querySelector(".active-person-div");
    div.parentNode.insertBefore(div2, div.nextSibling);
    
    let res2 = await axios.get(`/get_messages?receiver=${username}`);
    console.log(res2.data);

    for(let r of res2.data){
        if(username === r.receiver){
            outputMessage2({text: r.message, time: r.time});  //Outputs message to DOM
        }
        else{
            outputMessage({text: r.message, time: r.time});
        }
    }
    document.querySelector(".full-message-box").scrollTop=document.querySelector(".full-message-box").scrollHeight;
}



