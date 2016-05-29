chrome.commands.onCommand.addListener(function(command) {
    console.log('Command:', command);
    if(command == "popup"){
        createPushClipboardWindow();
    }else if(command == "repeat-last-command"){
        if(localStorage["lastpush"]){
            window[localStorage["lastpushtype"]](localStorage["lastpush"], true);
        }else{
            createPushClipboardWindow();
        }
    }else if(command == "favorite-command"){
        var favoriteCommand = getFavoriteCommand();
        favoriteCommand = deviceCommands.first(function(command){return command.label == favoriteCommand;});
        var favoriteCommandDevice = getFavoriteCommandDevice();
        if(favoriteCommand && favoriteCommandDevice){
            favoriteCommand.func(favoriteCommandDevice, true,getFavoriteCommandText());
        }
    }else if(command == "notifications-popup"){
        showNotificationsPopup();
    }
});
var getNotificationPopupHeight = function(){
    var height = Math.min(Math.round((203 * notifications.length) + 80), screen.height * 0.75);
    if(notifications.length == 0){
        height = 150;
    }
    return height;
}
var getNotificationPopupWidth = function(){
    return 375;
}
var notificationsWindow = null;
var showNotificationsPopup = function(tab){
    if(!tab){
        tab = "notifications";
    }
    if(notificationsWindow != null){
        return;
    }
    var height = getNotificationPopupHeight();
    var width = getNotificationPopupWidth();
    chrome.windows.create({"focused":false, url: 'devices.html?tab='+tab+'&closeOnEmpty=true', type: 'detached_panel' , left: screen.width - width, top: Math.round((screen.height / 2) - (height /2)), width : width, height: height},function(win){
            notificationsWindow = win;
    });            
}
var createPushClipboardWindow = function(tab,params,paramsIfClosed){
    if(!tab){
        tab = "devices";
    }
    var url = 'devices.html?tab='+ tab+'&popup=1';
    if(params){
        var addParams = function(params){  
            if(!params){
                return;
            }         
            for(var prop in params){
                var value = params[prop];
                if(value){
                    url += "&" + prop + "=" + encodeURIComponent(value);
                }
            } 
        }
        addParams(params);
        if(!popupWindowClipboard){
            addParams(paramsIfClosed);
        }
    }
    if(!devices || devices.length == 0){
        alert("Join doesn't have any other devices available to send stuff to. Please log in on the same account on other devices to make them appear here.");
        return;
    }
    if(popupWindowClipboard){
        var tab = popupWindowClipboard.tabs[0];
        chrome.tabs.update(tab.id,{"url":url});
        chrome.windows.update(popupWindowClipboardId,{"focused":true});
    }else{
        /*var height = Math.min(Math.round((88 * devices.length) + 100), screen.height * 0.75);
        height = Math.max(height, (deviceCommands.length * 25) + 100);*/
        var width = 456;
        var height = 606;
        chrome.windows.create({ url: url, type: 'detached_panel' , left: screen.width - 230, top: Math.round((screen.height / 2) - (height /2)), width : width, height: height},function(clipboardWindow){
                popupWindowClipboard = clipboardWindow;
                popupWindowClipboardId = clipboardWindow.id;
        });
    }
}
var popupWindowClipboard = null;
var popupWindowClipboardId = null;
chrome.windows.onRemoved.addListener(function(windowId) {
  // If the window getting closed is the popup we created
  if (windowId === popupWindowClipboardId) {
    // Set popupId to undefined so we know the popups not open
    popupWindowClipboard = null;
  }
});

var clipboardWindows = [];
var clearClipboardWindows = function(){
    for (var i = 0; i < clipboardWindows.length; i++) {
        var win = clipboardWindows[i];
        chrome.windows.remove(win.id);
    };
    clipboardWindows = [];
}
var getToken = function(callback, token){
    getAuthToken(callback, false, token);
    /*chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
        callback(token);
    });*/
}
var isDoingAuth = false;
var waitingForAuthCallbacks = [];
/*var getAuthToken = function(callback, selectAccount){
    if(selectAccount){
        removeAuthToken();
    }
    //removeAuthToken();
    if(localStorage.accessToken && localStorage.authExpires && new Date(new Number(localStorage.authExpires)) > new Date()){
        if(callback){
            callback(localStorage.accessToken);
        }
    }else{    
        if(!isDoingAuth){
            isDoingAuth = true;
            var url = getAuthUrl(selectAccount);
            chrome.identity.launchWebAuthFlow({'url': url, 'interactive': true},function(redirect_url) {    
                var token = null;
                if(redirect_url){     
                    token = getAuthTokenFromUrl(redirect_url);
                    var expiresIn = new Number(getURLParameter(redirect_url,"expires_in"));
                    localStorage.authExpires = new Date().getTime() + ((expiresIn - 120) * 1000);
                    localStorage.accessToken = token;
                    console.log(token+":"+expiresIn);
                }   
                if(callback){
                    callback(token);
                }
                waitingForAuthCallbacks.doForAll(function(waitingCallback){
                    waitingCallback(token)
                });
                waitingForAuthCallbacks = [];
                isDoingAuth = false;
            });
        }else{
            if(callback){
                waitingForAuthCallbacks.push(callback); 
            }
        }
    }
}*/
var getAuthTokenBackground = function(callback,selectAccount){
    if(isLocalAccessTokenValid()){
        if(callback){
            callback(localStorage.accessToken)
        }
        return;
    }
    var authUrl = getAuthUrl(selectAccount,true);
    if(localStorage.userinfo){
        var userinfo = JSON.parse(localStorage.userinfo);
        if(userinfo.email){
                authUrl += "&login_hint="+ userinfo.email;
        }
    }
    fetch(authUrl,{"redirect": 'manual',"credentials": 'include'}).then(function(response) {
      return response.text();
    }).then(function(response) {
        var tokenIndex = response.indexOf("access_token=");
        if(tokenIndex > 0){
            var token = response.substring(tokenIndex + 13)
            token = token.substring(0, token.indexOf("&"))
            var expiresIn = response.substring(response.indexOf("expires_in=") + 11);
            expiresIn = expiresIn.substring(0, expiresIn.indexOf("\""));
            setLocalAccessToken(token,expiresIn);
            console.log(token);
            console.log(expiresIn);
            if(callback){
                callback(token);
            }
        }else{
            getAuthTokenFromTab(callback,selectAccount);
        }
    }).catch(function(error) {
        console.log('There has been a problem with your fetch operation: ' + error.message);

        if(callback){
            callback(null);
        }
    });
}
var authTabId = null;
var isLocalAccessTokenValid = function(){
    return localStorage.accessToken && localStorage.authExpires && new Date(new Number(localStorage.authExpires)) > new Date();
}
var setLocalAccessToken = function(token, expiresIn){
    localStorage.authExpires = new Date().getTime() + ((expiresIn - 120) * 1000);
    localStorage.accessToken = token;
}
var getAuthTokenFromTab = function(callback,selectAccount){
    
    if(selectAccount){
        removeAuthToken();
    }
    //removeAuthToken();
    if(isLocalAccessTokenValid()){
        if(callback){
            callback(localStorage.accessToken);
        }
    }else{  
        var focusOnAuthTabId = function(){
            if(authTabId){
                chrome.tabs.update(authTabId,{"active":true});
                if(!localStorage.warnedLogin){
                    localStorage.warnedLogin = true;
                    alert("Please login to use Join");
                }
            }else{
                //alert("Something went wrong. Please reload the Join extension.");
            }
        }  
        if(!isDoingAuth){
            isDoingAuth = true;
            var url = getAuthUrl(selectAccount);

            if(localStorage.userinfo){
                var userinfo = JSON.parse(localStorage.userinfo);
                if(userinfo.email){
                        url += "&login_hint="+ userinfo.email;
                }
            }
            var closeListener = function(tabId,removeInfo){
                 if(authTabId && tabId == authTabId){
                    finisher(tabId);
                 }
            }
            var authListener = function(tabId,changeInfo,tab){
                if(tab.url && tab.url.indexOf(getCliendId())>0){
                    authTabId = tabId;
                    focusOnAuthTabId();
                }
                if(tab && tab.url && tab.url.indexOf(AUTH_CALLBACK_URL) == 0){
                    var redirect_url = tab.url;
                    var token = getAuthTokenFromUrl(redirect_url);
                    finisher(tabId,token,redirect_url);
                }
            }
            var finisher = function(tabId,token,redirect_url){
                authTabId = null;
                chrome.tabs.onUpdated.removeListener(authListener);
                chrome.tabs.onRemoved.removeListener(closeListener);
                console.log("Auth token found from tab: " + token);
                chrome.tabs.remove(tabId);
                var finshCallback = function(token){
                    if(callback){
                        callback(token);
                    }
                    waitingForAuthCallbacks.doForAll(function(waitingCallback){
                        waitingCallback(token)
                    });
                    waitingForAuthCallbacks = [];
                    isDoingAuth = false;
                }
                if(token && redirect_url){
                    var expiresIn = new Number(getURLParameter(redirect_url,"expires_in"));
                    setLocalAccessToken(token,expiresIn);
                    console.log("Token expires in " + expiresIn + " seconds");                    
                    getUserInfo(function(userInfoFromStorage){
                        console.log("Logged in with: " + userInfoFromStorage.email);
                        finshCallback(token);
                    },true,token);
                }else{
                   finshCallback(null);
                }
                
            }
            chrome.tabs.onUpdated.addListener(authListener);
            chrome.tabs.onRemoved.addListener(closeListener)
            openTab( url ,{selected: false,active:false},function(tab){
                console.log("Tab auth created");
                console.log(tab);
            });           
        }else{
            if(callback){
                waitingForAuthCallbacks.push(callback); 
                focusOnAuthTabId();
            }
        }
    }
}
var getAuthTokenFromChrome = function(callback){
    
}
var getAuthToken = function(callback, selectAccount, token){
    if(token){
        if(callback){
            callback(token);
        }
        return;
    }
    if(selectAccount){
        getAuthTokenFromTab(callback,selectAccount);
        return;
    }
    chrome.identity.getProfileUserInfo(function(userInfoFromChrome){
        if(!userInfoFromChrome.email){
            getAuthTokenFromTab(callback,selectAccount);
            return;
        }
        if(localStorage.userinfo){
            var userInfoFromStorage = JSON.parse(localStorage.userinfo);
            if(userInfoFromStorage.email && userInfoFromStorage.email != userInfoFromChrome.email){
                getAuthTokenBackground(callback,selectAccount);
                return;
            }
        }
        chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
            if(callback){
                callback(token);
            }
        });       
        
    });

}
var getAuthTokenFromUrl =function(url){
    if(url.indexOf("#access_token=")>0){
        return url.substring(url.indexOf("#")+"#access_token=".length,url.indexOf("&"));
    }
}
var removeAuthToken = function(callback){
    delete localStorage.accessToken;
    delete localStorage.authExpires;
    delete localStorage.userinfo;
}

var doRequestWithAuth = function(method, url,content, callback, callbackError, isRetry, token) {
    getToken(function(token) {
        if(token == null){
            if (callbackError != null) {
                callbackError("noauth");
            }
        }else{
           
            var contentClass = toClass.call(content);
            var isFileOrForm = contentClass == "[object File]" || contentClass == "[object FormData]";
            var authHeader = "Bearer " + token;
            //console.log("authHeader: " + authHeader);
            console.log("Posting to: " + url);
            var req = new XMLHttpRequest();
            req.open(method, url, true);
            req.setRequestHeader("authorization", authHeader);
            if(content){
                if(!isFileOrForm){
                    req.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
                }
            }
            req.onload = function() {
                console.log("POST status: " + this.status);
                var result = {};
                if(this.responseText){
                    result = JSON.parse(this.responseText)
                }
                if(!isRetry && result.userAuthError){
                    console.log("Retrying with new token...");
                    removeCachedAuthToken(function(){
                        doRequestWithAuth(method, url,content, callback, callbackError, true);
                    })
                }else{    
                    if (callback != null) {                
                        callback(result);
                    }   
                }
            }
            req.onerror = function(e) {
                if (callbackError != null) {
                    callbackError(e.currentTarget);
                }
            }
            var contentString = null;
            if(content){
                if(isFileOrForm){
                    contentString = content;
                }else{
                    contentString = JSON.stringify(content);
                }
            }
            req.send(contentString);
        }
    },token);    
}
var doPostWithAuth = function(url,content, callback, callbackError) {
    doRequestWithAuth("POST",url,content,callback,callbackError);
}
var doDeleteWithAuth = function(url,content, callback, callbackError) {
    doRequestWithAuth("DELETE",url,content,callback,callbackError);
}
var doGetWithAuth = function(url, callback, callbackError,token) {
    doRequestWithAuth("GET",url,null,callback,callbackError,false, token);
}
var doGetWithAuthAsyncRequest = function(endpointRequest, endpointGet, deviceId, callback, callbackError) {
    doRequestWithAuth("GET",joinserver + "messaging/v1/" + endpointRequest + "?deviceId=" + deviceId,null,function(response){
        var requestId = response.requestId;
        if(requestId){
            doGetWithAuthAsyncRequestGetResponse(joinserver + "messaging/v1/" + endpointGet + "?requestId=" + requestId,callback,callbackError);
        }else{
            callbackError({"error":"didn't get request id"});
        }
    },callbackError);
}
var doGetWithAuthAsyncRequestGetResponse = function(urlGet, callback, callbackError,count) {
    if(count > 5){
        callbackError({"error":"couldn't contact device"});
        return;
    }
    setTimeout(function(){
        if(!count){
            count = 0;
        }
        doRequestWithAuth("GET",urlGet,null,function(responseGet){
            if(responseGet.responseAvailable){
                callback(responseGet);
            }else{
                doGetWithAuthAsyncRequestGetResponse(urlGet,callback,callbackError,++count);
            }
        },callbackError);
    },2000);
    
}


var getURLParameter = function(url,name) {
    if(url == null){
        url = window.location.href;
    }
    return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(url)||[,""])[1].replace(/\+/g, '%20'))||null
}
var removeCachedAuthToken = function(callback){
    removeAuthToken();
    if(callback){
        callback();
    }
    /*chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
        chrome.identity.removeCachedAuthToken({ 'token': token }, function(){
                console.log("cached token removed");
                if(callback){
                    callback();
                }
        });
    });*/
}



/****************************OPTIONS********************************/
var getOptionType = function(option){
    if(option.attributes.type){
        return option.attributes.type.textContent;
    }else{
        return option.localName;
    }
}
var getOptionDelayed = function(option){
    if(option.attributes.delayed){
        return true;
    }else{
        return false;
    }
}
var isOptionUndefined = function(value){
    return !value || value == "undefined" || value == "null" || value == "";
}
var optionSavers = [
    {
        "type":"text",
        "saveevent":"keyup",
        "save": function(option){            
            localStorage[option.id] = option.value;
        },
        "load":function(option){
            option.value = this.getValue(option,getDefaultValue(option));
        },
        "getValue":function(option, defaultValue){
            var id = null;
            if(typeof option == "string"){
                id = option;
            }else{
                id = option.id;
            }
            var value = localStorage[id];
            if(isOptionUndefined(value)){
                if(!defaultValue){
                    defaultValue = "";
                }
                value = defaultValue;
                this.save(id,defaultValue);
            }
            return value;
        },"setDefaultValue" :function(option){
            if(!option.value){
               var defaultValue =  getDefaultValue(option);
               if(!isOptionUndefined(defaultValue)){
                   option.value = defaultValue;
               }
           }

        }
    },
    {
        "type":"textarea",
        "saveevent":"keyup",
        "save": function(option){            
            localStorage[option.id] = option.value;
        },
        "load":function(option){
            option.value = this.getValue(option,getDefaultValue(option));
        },
        "getValue":function(option, defaultValue){
            var id = null;
            if(typeof option == "string"){
                id = option;
            }else{
                id = option.id;
            }
            var value = localStorage[id];
            if(isOptionUndefined(value)){
                if(!defaultValue){
                    defaultValue = "";
                }
                value = defaultValue;
                this.save(id,defaultValue);
            }
            return value;
        },"setDefaultValue" :function(option){
            if(!option.value){
               var defaultValue =  getDefaultValue(option);
               if(!isOptionUndefined(defaultValue)){
                   option.value = defaultValue;
               }
           }

        }
    },{
        "type":"checkbox",
        "saveevent":"click",
        "save": function(option,value){    
            var id = null;
            if(typeof option == "string"){
                id = option;
            }else{
                id = option.id;
                value = option.checked;
            }      
            localStorage[id] = value;
            var onSaveFunc = window["on" + option.id + "save"];
            if(onSaveFunc){
                onSaveFunc(option, value);
            }           
        },
        "load":function(option){
            option.checked = this.getValue(option,getDefaultValue(option));
        },
        "getValue":function(option,defaultValue){
            var id = null;
            if(typeof option == "string"){
                id = option;
            }else{
                id = option.id;
            }
            var value = localStorage[id];
            if(isOptionUndefined(value)){
                value = defaultValue;
                this.save(id,defaultValue);
            }else if(value == "false"){
                value = false;
            }else{
                value = true;
            }
            return value;
        },"setDefaultValue" :function(option){
            if(this.getValue(option,null) == null){          
                var defaultValue = getDefaultValue(option);
                option.checked = defaultValue;
            }
        }
    }, {
        "type":"select",
        "saveevent":"change",
        "save": function(option){            
            localStorage[option.id] = option.value;
        },
        "load":function(option){
            option.value = this.getValue(option,getDefaultValue(option));
            if(option.funcOnChange){
                option.funcOnChange();
            }
        },
        "getValue":function(option, defaultValue){
            var id = null;
            if(typeof option == "string"){
                id = option;
            }else{
                id = option.id;
            }
            var value = localStorage[id];
            if(isOptionUndefined(value)){
                if(!defaultValue){
                    defaultValue = "";
                }
                value = defaultValue;
                this.save(id,defaultValue);
            }
            return value;
        },"setDefaultValue" :function(option){
            if(!option.value){
               var defaultValue =  getDefaultValue(option);
               if(!isOptionUndefined(defaultValue)){
                   option.value = defaultValue;
               }
           }

        }
    }
];
var getOptionSaver = function(option){
    for (var i = 0; i < optionSavers.length; i++) {
        var optionSaver = optionSavers[i];        
        var type = typeof option == "string" ? option : getOptionType(option);
        if(optionSaver.type == type)
        {
            return optionSaver;
        }
    }
}

var deviceSufix = "=:=DeviceAutoClipboard=:=";
var getDeviceIdsToSendAutoClipboard = function(){
    var deviceIds = [];
    for (var i = 0; i < devices.length; i++) {
        var device = devices[i];
        var key = device.deviceId + deviceSufix;
        var enabled = localStorage[key] == null || localStorage[key] == "true";
        if(enabled){
            deviceIds.push(device.deviceId);
        }
    };
    return deviceIds;
}

var getOptionValue = function(type, id, defaultValue){
    if(!defaultValue){
        defaultValue = getDefaultValue(id);
    }
    var optionSaver = getOptionSaver(type);
    return optionSaver.getValue(id,defaultValue);
}
var getDownloadScreenshotsEnabled = function(){
    return getOptionValue("checkbox","downloadscreenshots");
}
var getDownloadVideosEnabled = function(){
    return getOptionValue("checkbox","downloadvideos");
}
var get12HourFormat = function(){
    return getOptionValue("checkbox","12hrformat");
}
var getAutoClipboard = function(){
    return getOptionValue("checkbox","autoclipboard");
}
var getAutoClipboardNotification = function(){
    return getOptionValue("checkbox","autoclipboardnotification");
}
var getFavoriteCommand = function(){
    return getOptionValue("select","select_favourite_command");
}
var getFavoriteCommandDevice = function(){
    return getOptionValue("select","select_favourite_command_device");
}
var getNotificationSeconds = function(){
    return getOptionValue("text","notificationseconds");
}
var getNotificationSound = function(){
    return getOptionValue("text","notificationsound");
}
var getNotificationWebsites = function(){
    return getOptionValue("textarea","notificationwebsites");
}
var getShowChromeNotifications = function(){
    return getOptionValue("checkbox","chromenotifications");
}
var getPrefixTaskerCommands = function(){
    return getOptionValue("checkbox","prefixtaskercommands");
}
var getHideNotificationText = function(){
    return getOptionValue("checkbox","hidenotificationtext");
}
var getPlayNotificationSound = function(){
    return getOptionValue("checkbox","playnotificationsound");
}
var getAlternativePopupIcon = function(){
    return getOptionValue("checkbox","alternativeicon");
}
var getEventghostPort = function(){
    return getOptionValue("text","eventghostport");
}
var getFavoriteCommandText = function(){
    return getOptionValue("text","text_favourite_command");
}
var onautoclipboardsave = function(option, value){
    console.log("Auto clipboard: " + value);
    handleAutoClipboard();
}
var getDefaultValue = function(option){
    var id = null;
    if(typeof option == "string"){
        id = option;
    }else{
        id = option.id;
    }
    return defaultValues[id];
}
var defaultValues = {
    "downloadscreenshots": true,
    "downloadvideos":false,
    "12hrformat":false,
    "autoclipboard":false,
    "autoclipboardnotification":true,
    "chromenotifications":true,
    "notificationwebsites":JSON.stringify(notificationPages,null,3),
    "prefixtaskercommands":false,
    "hidenotificationtext": false,
    "playnotificationsound": true
};
/******************************************************************************/

/*************************************************************************************/

/**************************************************************************************/
setPopupIcon(getAlternativePopupIcon());
var popupWindow = null;
updateBadgeText();
var refreshNotificationsPopup = function(){

    updateBadgeText();
    dispatch("notificationsupdated");
    /*if(popupWindow){
        try{
            popupWindow.writeNotifications();
        }catch(e){
            popupWindow = null;
        }
    }*/
}
var refreshDevicesPopup = function(){
    dispatch("devicesupdated");
    /*if(popupWindow){
        try{
            popupWindow.writeDevices();
        }catch(e){
            popupWindow = null;
        }
    }*/
}
var pendingRequests = [];
var RequestFile = function(requestType){
    this.senderId = localStorage.deviceId;
    this.requestType = requestType;
    this.send = function(deviceId, callback, download, keepPendingRequest){
        var params = this.getParams();
        if(typeof deviceId == "string"){
            if(!deviceId){
                callback(null);
                return;
            }
            params.deviceId = deviceId;
        }else{
            if(!deviceId || deviceId.length==0){
                callback(null);
                return;
            }
            params.deviceIds = deviceId;
        }
        doPostWithAuth(joinserver + "requestfile/v1/request/",params, function(result){
            pendingRequests.push({"requestId":result.requestId,"callback":callback,"download":download,"keep":keepPendingRequest});
            console.log("Added pending request: " + result.requestId);
        },function(error){
            console.log("Error: " + error);           
        });
    }
}
RequestFile.prototype = new Request();
function downloadFile(fileId, callback) {
  if (fileId) {
    getToken(function(accessToken){
        var xhr = new XMLHttpRequest();
        xhr.open('GET', "https://www.googleapis.com/drive/v2/files/" + fileId + "?alt=media");
        xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken);
        xhr.onload = function() {
          callback(xhr.responseText);
        };
        xhr.onerror = function() {
          callback(null);
        };
        xhr.send();
    });
    
  } else {
    callback(null);
  }
}
/**************************************************************************************/

var resetNotifications = function(){
    notifications = new Notifications();
    updateBadgeText();
}
var getNotifications = function(callback){
    resetNotifications();
    var requestId = guid();
    var gcm = new GCMRequestNotifications();
    gcm.requestId = requestId;
    var deviceIds = devices.select(function(device){return device.deviceId;});
    if(!deviceIds || deviceIds.length == 0){
        callback(notifications);
        return;
    }
    pendingRequests.push({"requestId":requestId,"callback":function(result){        
        callback(notifications);
        console.log(result);
    }});
    gcm.send(deviceIds);
    console.log("Requested notifications from: ");
    console.log(deviceIds);
}
var pushClipboard = function(deviceId, notify){
    getClipboard(function(clipboardData){
        var push = new GCMPush();
        push.clipboard = clipboardData;
        push.send(deviceId);
        setLastPush(deviceId, "pushClipboard");
        if(notify){
            showNotification("Join","Sent Clipboard");
        }
    });
}
var openClipboard = function(deviceId, notify){
    getClipboard(function(clipboardData){
        var push = new GCMPush();
        push.files = [clipboardData];
        push.send(deviceId);
        setLastPush(deviceId, "openClipboard");
        if(notify){
            showNotification("Join","Sent Clipboard to open");
        }
    });
}
var findDevice = function(deviceId, notify){
    if(!confirm("This will make your phone play your default ringtone at full volume. Are you sure?")){
        return;
    }
    var push = new GCMPush();
    push.find = true;
    push.send(deviceId);
    setLastPush(deviceId, "findDevice");
    if(notify){
        showNotification("Join","Device will now ring...");
    }
}   
var writeText = function(deviceId, notify, text){
    var push = new GCMPush();
    if(!text || (typeof text) != "string" ){
        text = prompt("Text to write");
    }
    push.clipboard = text;
    if(!push.clipboard){
        return;
    }
    push.send(deviceId);
    setLastPush(deviceId, "writeText");
    if(notify){
        showNotification("Join","Sent Text");
    }
}
var requestLocation = function(deviceId, notify){
    var push = new GCMPush();
    push.location = true;
    push.send(deviceId);
    setLastPush(deviceId, "requestLocation");
    if(notify){
        showNotification("Join","Requested location...");
    }
}
var getScreenshot = function(deviceId, notify){
    if(notify){
        showNotification("Join", "Getting screenshot...");
    }
    var requestFile = new RequestFile(REQUEST_TYPE_SCREENSHOT);
    requestFile.send(deviceId, function(responseFile){
        var url = responseFile.viewUrl;
        if(getDownloadScreenshotsEnabled()){
            url = responseFile.downloadUrl;
        }
        openTab(url);
        showNotification("Join", "Got screenshot!");
    });
    setLastPush(deviceId, "getScreenshot");
}
var renameDevice = function(deviceId, notify){
    var device = devices.first(function(device){return device.deviceId == deviceId;});
    if(!device){
        return;
    }
    var confirm = window.prompt("What do you want to name " + device.deviceName + "?");
    if(confirm){
        doPostWithAuth(joinserver + "registration/v1/renameDevice/?deviceId="+deviceId+"&newName="+encodeURIComponent(confirm),{"deviceId":deviceId,"newName":confirm}, function(result){
          console.log(result);   
          var device = devices.first(function(device){
            return device.deviceId == deviceId;
          }); 
          device.deviceName = confirm;
          setDevices(devices);
          refreshDevicesPopup();      
          if(showNotification){
            showNotification("Renamed",device.deviceName + " renamed to " +confirm); 
          }
        },function(error){
            console.log("Error: " + error);   
            showNotification("Error renaming",error);     
        });       
    }
}
var deleteDevice = function(deviceId, notify){
    var device = devices.first(function(device){return device.deviceId == deviceId;});
    if(!device){
        return;
    }
    var confirm = window.confirm("Are you sure you want to delete " + device.deviceName + "?");
    if(confirm){
        doPostWithAuth(joinserver + "registration/v1/unregisterDevice/?deviceId="+deviceId,{"deviceId":deviceId}, function(result){
          console.log(result);   
          devices.removeIf(function(device){
            return device.deviceId == deviceId;
          });
          setDevices(devices);
          refreshDevicesPopup();      
          if(showNotification){
            showNotification("Deleted",device.deviceName + " deleted.");
          }
        },function(error){
            console.log("Error: " + error);   
            showNotification("Error deleting",error);     
        });       
    }
}
var noteToSelf = function(deviceId, notify){
        var noteText = prompt("Note to self");
        if(noteText){
            var push = new GCMPush();
            push.title = "Note To Self";
            push.text = noteText;
            push.send(deviceId);
            setLastPush(deviceId, "noteToSelf");
        }
}
var getCurrentTab = function(callback){
    chrome.tabs.query({'active': true, currentWindow: true}, function (tabs) {
        if(tabs && tabs.length > 0){
            callback(tabs[0]);
        }else{
            callback(null);
        }
    });
}
var pushUrl = function(deviceId, notify,callback){
    getCurrentTab(function(tab){
        if(!tab){
            showNotification("Join", "No opened tab detected.");
            return;
        }
        console.log("pushing tab " + tab.url );
        if(tab.url.indexOf(DEVICES_POPUP_URL) == 0){
            setTimeout(function(){
               pushUrl(deviceId,notify,callback); 
            },100);
            return;
        }
        var pushed = false;
        if(tab.url.indexOf("http") == 0){
            var url = tab.url;
            text = tab.title;
            var push = new GCMPush();
            push.url = url;
            push.text = text;
            push.send(deviceId);
            setLastPush(deviceId, "pushUrl");
            pushed = true;
        }
        if(!pushed){ 
            showNotification("Join", "Link not supported. Must start with http. Was " + tab.url);
        }else{
            if(notify){
                showNotification("Join", "Pushed current tab");
            }
        }
        if(callback){
            callback();
        }  
    });    
}
var pushTaskerCommand = function(deviceId, notify,text){
    var push = new GCMPush();
    if(!text || (typeof text) != "string" ){
        text = prompt("Write your Tasker command.\n\nSetup a profile with the AutoApps condition to react to it.");
    }
    if(!text){
        return;
    }
    if(getPrefixTaskerCommands()){
         text = "=:=" + text;
    }
    push.text =text;
    push.send(deviceId);
    setLastPush(deviceId, "pushTaskerCommand");
    if(notify){
        showNotification("Join", "Sent command " + text);
    }
}
var fileInput = null;
addEventListener("popupunloaded",function(){
    if(listeningForFile){
        listeningForFile = false;
        alert("Seems that the Join popup was closed by your system before you selected the file, which will make file sending not work.\n\nPlease popout the window using the popout button inside the Join popup and try again.");
    }
},false);
var listeningForFile = false;
var pushFile = function(deviceId, notify, tab){
    if(!fileInput){
        return;
    }
    listeningForFile = true;
    fileInput.onchange = function(){
        listeningForFile = false;
        if(tab){
            chrome.tabs.remove(tab.id,function(){             
            });
        }
        if(!fileInput.files || fileInput.files.length == 0){
            return;
        }
        var deviceName = localStorage.deviceName;
        if(!deviceName){
            deviceName = "Chrome";
        }
        var filesLength = fileInput.files.length;
        var whatsUploading = filesLength == 1 ? fileInput.files[0].name : filesLength + " files";
        showNotification("Join", "Uploading " + whatsUploading);        
        
        getFolderId(function(folderId){
            var files = [];
            for (var i = 0; i < fileInput.files.length; i++) {
                var file = fileInput.files[i];
                files.push(file);
            }
            files.doForAllAsync(function(file,callbackSingleUpload){
                if(!file){
                    return;
                }
                if(filesLength > 1){
                    showNotification("Join", "Uploading " + file.name);
                }
                console.log("Uploading...");
                console.log(file);
                var formData = new FormData();
                formData.append("data", new Blob([JSON.stringify(
                    {
                        "name": file.name,
                        "parents":[folderId]
                    })],{"type":"application/json"}));
                formData.append("file", file);
                doPostWithAuth("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",formData, function(result){
                    console.log("Upload result:");
                    console.log(result);
                    callbackSingleUpload("https://drive.google.com/file/d/" + result.id);                 
                },function(error){
                    console.log("Error: " + error);           
                });
            },function(uploadResults){
                var push = new GCMPush();
                push.files = uploadResults;
                push.send(deviceId);
                setLastPush(deviceId, "pushFile");
                showNotification("Join", "Sent " + whatsUploading);
            });
                
        },"Join Files/from " + deviceName);
    }
    fileInput.click();
}
var smsWindow = null;
var smsWindowId = null;
var showSmsPopup = function(deviceId,number,name,isReply,text){
    createPushClipboardWindow("sms",{"deviceId":deviceId,"number":number,"name":name},{"reply":isReply,"text":text});    
    dispatch(EVENT_SMS_HANDLED,{"text":text,"deviceId":deviceId});
}
addEventListener(EVENT_SMS_HANDLED,function(event){
    var text = event.text;
    var deviceId = event.deviceId;
    if(!text || !deviceId){
        return;
    }
    var gcm = new GCMSMSHandled();
    gcm.text = text;
    gcm.send(deviceId);
});
var sendSms = function(deviceId, number){
    dispatch("sendsms",{"deviceId":deviceId});
    if(!popupWindow){
        showSmsPopup(deviceId);
    }
    /*if(smsWindow != null){
        chrome.windows.update(smsWindowId,{"focused":true});
        return;
    }
    //var url =  joinserverBase + "sms.html?deviceId="+deviceId;
    var height = 690;
    var width = 460;
    var url = "smschrome.html?deviceId="+deviceId+"&height="+height+"&width="+width;
    if(number){
        url += "#" + number;
    }
    chrome.windows.create({ url: url, type: 'detached_panel' , left: screen.width - 230, top: Math.round((screen.height / 2) - (height /2)), width : width, height: height},function(win){
        smsWindow = win;
        smsWindowId = win.id;
    });*/
    /*var requestFile = new RequestFile(REQUEST_TYPE_SMS_HISTORY);
    requestFile.send(deviceId, function(responseFile){
        var url = responseFile.viewUrl;
        console.log(url);
        downloadFile(responseFile,function(jsonSMSs){
            showNotification("Join", "Got SMS!");
            var smses = JSON.parse(jsonSMSs);
            console.log(smses);
        })
    });
    setLastPush(deviceId, "sendSms");*/
}
var setLastPush = function(deviceId, functionName){
    localStorage["lastpush"] = deviceId;
    localStorage["lastpushtype"] = functionName;
}
/******************************************************************************/


var showNotification = function(title, message, timeout, notificationId){
    if(!timeout)timeout = 3000;
    var options = {
        "type":"basic",
        "iconUrl":"big.png",
        "title": title,
        "message": message
    };
    if(!notificationId){
        notificationId = guid();
    }
    chrome.notifications.create(notificationId, options,function(){        
        setInterval(function() {
            chrome.notifications.clear(notificationId, function() {})
        }, timeout);
    });    
}
var registerDevice = function(callback,callbackError){
    var registrationId = localStorage.regIdLocal;
   /* if(!regId2){
        console.log("Couldn't get direct regId");
    }else{            
        //console.log("Got direct regId: " + registrationId);
    }*/
    doPostWithAuth(joinserver + "registration/v1/registerDevice/",{"deviceId":localStorage.deviceId,"regId":registrationId,"regId2":registrationId,"deviceName":"Chrome","deviceType":3}, function(result){
      console.log(result);          
      localStorage.deviceId = result.deviceId;
      localStorage.regIdServer = result.regId;
      if(callback){
        callback(result);
      }
    },function(error){
        console.log("Error: " + error);   
        if(callbackError){
            callbackError(error);
        }        
    });  
}
chrome.gcm.onMessage.addListener(function(message){
    console.log(message);
    var multiIndexString = message.data.multi;
    var type = message.data.type;
    if(!multiIndexString){
        executeGcm(message.data.type,message.data.json);
    }else{
        var multiIndex = Number(multiIndexString);
        var length = Number(message.data.length);
        console.log("Got multi message index: " + multiIndex+"/"+length);
        var id = message.data.id;
        var value = message.data.value;
        var gcmMultis = gcmMultiMap.add(id,multiIndex,value,type,length);
        var complete = gcmMultis.getComplete();
        if(complete){
            console.log("GCM complete! Executing of type " + type);
            delete gcmMultiMap[id];
            executeGcm(complete.type,complete.json);
        }
    }
});
var executeGcm = function(type, json){
        var gcm = new window[type]();
        gcm.fromJsonString(json);
        gcm.execute();
}

var refreshDevices = function(callback){    
    console.log("Refreshing devices...");
     doGetWithAuth(joinserver + "registration/v1/listDevices/", function(result){
      console.log(result);
      
      setDevices(result.records);
      if(callback != null){
        callback(result.records);
      }
      refreshDevicesPopup();
    },function(error){
        console.log("Error: " + error);    
        if(callback != null){
            callback(null);
        }       
    });
}

getToken();
chrome.gcm.register(["596310809542","737484412860"],function(registrationId) {
    if (registrationId == null || registrationId == "") {
        if (callback != null) {
            console.log("Error getting key: " + chrome.runtime.lastError);
        }
    } else {
        console.log("Got key: " + registrationId);
        localStorage.regIdLocal = registrationId;
        registerDevice(function(){
            refreshDevices();
        });       
    }
});

var deviceImages = {};
deviceImages[""+DEVICE_TYPE_ANDROID_PHONE] =function(device){return "phone.png";};
deviceImages[""+DEVICE_TYPE_ANDROID_TABLET]=function(device){return"tablet.png";};
deviceImages[""+DEVICE_TYPE_CHROME_BROWSER]=function(device){return"chrome.png";};
deviceImages[""+DEVICE_TYPE_WIDNOWS_PC]=function(device){return"windows10.png";};
deviceImages[""+DEVICE_TYPE_FIREFOX]=function(device){return"firefox.png";};
deviceImages[""+DEVICE_TYPE_GROUP]=function(device){return device.deviceId.substring(6) + ".png"};
deviceImages[""+DEVICE_TYPE_ANDROID_TV]=function(device){return "tv.png"};
var devicesJson = localStorage["devices"];

var devices = null;
if(devicesJson){
    devices = JSON.parse(devicesJson);
}


var getDeviceById = function(deviceId){
    for (var i = 0; i < devices.length; i++) {
        var device = devices[i];
        if(device.deviceId == deviceId){
            return device;
        }
    }
}
var setDevices = function(devicesToSet){

    devices = [];
    if(devicesToSet){        
        for (var i = 0; i < devicesToSet.length; i++) {
            var device = devicesToSet[i];
            if(!localStorage.deviceId || localStorage.deviceId != device.deviceId){
                devices.push(device);
            }
        }
        console.log("After setting devices: " + localStorage.deviceId);
        if(localStorage.deviceId){
            devicesToSet.doForAll(function(deviceToSet){
                if(localStorage.deviceId == deviceToSet.deviceId){
                    localStorage.deviceName = deviceToSet.deviceName;
                }
            });
        }
        if(localStorage.deviceName){
            devices.doForAll(function(storedDevice){
                if(storedDevice.deviceName == localStorage.deviceName){
                    var newName = prompt("One of your Join devices is already named '" + localStorage.deviceName + "'. What do you want to name this Chrome installation?");
                    var message = "You can always rename your devices by long-touching them in the Android app.";
                    if(newName){
                        localStorage.deviceName = newName;
                        doPostWithAuth(joinserver + "registration/v1/renameDevice/?deviceId=" + localStorage.deviceId + "&newName=" + encodeURIComponent(newName),{}, function(result){                          
                            alert("Renamed. " + message);          
                        },function(error){
                            alert("Error renaming: " + JSON.stringify(error));          
                        });
                    }else{
                        alert(message);
                    }
                }
            });
        }
        devices.removeIf(function(device){
            return device.deviceType == DEVICE_TYPE_GROUP;
        });
        var groups = joindevices.groups.deviceGroups.getGroups(devices);
        for (var i = 0;i < groups.length;i++) {
            var group = groups[i];
            var deviceFromGroup = {
                "deviceId": "group." + group.id,
                "deviceName": group.name,
                "deviceType": DEVICE_TYPE_GROUP
            };
            devices.push(deviceFromGroup);
        }
        localStorage["devices"] = JSON.stringify(devices);
    }
    updatemenu();
}
function directCopy(str,setLastClipboard){
    if(!str){
        return;
    }
    if(setLastClipboard){
        lastClipboard = str;
    }
    document.oncopy = function(event) {
        event.clipboardData.setData("Text", str);
        event.preventDefault();
    };
    document.execCommand("Copy");
    document.oncopy = undefined;
    console.log("Set clipboard to: " + str);
}
function getClipboard(callback){

    document.onpaste = function(event) {
        var clipboardData = event.clipboardData.getData("Text");
        event.preventDefault();
        callback(clipboardData);
    };
    document.execCommand("paste");
    document.onpaste = undefined;
}
function doForDevices(action) {
    if(!devices || devices.length == 0){
        return;
    }
    for (var i = 0; i < devices.length; i++) {
        var device = devices[i];
        action(device);
    }
}
var createMenuFromFuncs = function(funcs) {
    for (var j = 0; j < funcs.length; j++) {
        var func = funcs[j];
        var device = func.device;
        var deviceName = device.deviceName;
        var title = func.command + " " + func.context;
        if (func.dontSendText) {
            title = func.command;
        }
        if (func.sendSelectedFile) {
            title += " with selected file"
        }
        if (func.customtext != null && func.customtext != "") {
            title = func.customtext;
        }
        chrome.contextMenus.create({
            "title": title,
            "contexts": [func.context],
            "onclick": func.func,
            "parentId": device.deviceId
        });
    }
}
function sendClipboardMenu(device, option) {
    return function(info, tab) {
        var push = new GCMPush();
        push.clipboard = info.selectionText;
        push.send(device.deviceId);
    };

}
function notificationSelection(device, option) {
    return function(info, tab) {
        var push = new GCMPush();
        push.title = "Note to self";
        push.text = info.selectionText;
        push.send(device.deviceId);
    };

}
function sendPageUrlMenu(device, option) {
    return function(info, tab) {
        var push = new GCMPush();
        push.url = info.pageUrl;
        push.send(device.deviceId);
    };

}
function writePage(device, option) {
    return function(info, tab) {
        var push = new GCMPush();
        push.clipboard = info.pageUrl;
        push.send(device.deviceId);
    };

}
function notificationPage(device, option) {
    return function(info, tab) {
        var push = new GCMPush();
        push.title = "Saved Page";
        push.text = tab.title;
        push.url = info.pageUrl;
        push.send(device.deviceId);
    };

}
function sendLinkUrlMenu(device, option) {
    return function(info, tab) {
        var push = new GCMPush();
        push.url = info.linkUrl;
        push.send(device.deviceId);
    };

}
function sendSrcUrlMenu(device, option) {
    return function(info, tab) {
        var push = new GCMPush();
        push.url = info.srcUrl;
        push.send(device.deviceId);
    };

}
function sendWallpaperMenu(device, option) {
    return function(info, tab) {
        var push = new GCMPush();
        push.wallpaper = info.srcUrl;
        push.send(device.deviceId);
    };

}
function writeLink(device, option) {
    return function(info, tab) {
        var push = new GCMPush();
        push.clipboard = info.linkUrl;
        push.send(device.deviceId);
    };

}
function notificationLink(device, option) {
    return function(info, tab) {
        var push = new GCMPush();
        push.title = "Link from" + tab.title;
        push.text = info.pageUrl
        push.url = info.pageUrl;
        push.send(device.deviceId);
    };

}
function openLinkFile(device, option) {
    return function(info, tab) {
        var push = new GCMPush();
        push.files = [info.linkUrl];
        push.send(device.deviceId);
    };

}
function openLinkImage(device, option) {
    return function(info, tab) {
       var push = new GCMPush();
        push.text = tab.title;
        push.files = [info.srcUrl];
        push.send(device.deviceId);
    };

}

function updatemenu() {    
    chrome.contextMenus.removeAll();
    var contexts = ["page", "selection", "link", "editable", "image", "video", "audio"];
    var contextFuncs = [{
        "context": "page"
    }, {
        "context": "selection"
    }, {
        "context": "link"
    }, {
        "context": "editable"
    }, {
        "context": "image"
    }, {
        "context": "video"
    }, {
        "context": "audio"
    }];
    var funcs = [];
    doForDevices(function(device){
        chrome.contextMenus.create({
            "id": device.deviceId,
            "title": device.deviceName,
            "contexts": ["all"]
        });
    });
    for (var i = 0; i < contexts.length; i++) {
        var context = contexts[i];
        doForDevices(function(device){
            var funcsForContext = [];
            var commandNames = [];
            var dontSendText = [];
            var func = null;
            var commandName = "Open";
            var deviceId = device.deviceId;
            if (context == "page") {
                func = sendPageUrlMenu(device);
                funcsForContext.push({"func":writePage(device),"commandName":"Paste page","dontSendText":true});
                funcsForContext.push({"func":notificationPage(device),"commandName":"Create notification with page","dontSendText":true});
            }else if (context == "link") {
                func = sendLinkUrlMenu(device);
                funcsForContext.push({"func":writeLink(device),"commandName":"Paste link","dontSendText":true});
                funcsForContext.push({"func":notificationLink(device),"commandName":"Create notification with link","dontSendText":true});
                funcsForContext.push({"func":openLinkFile(device),"commandName":"Download link","dontSendText":true});
            }else if (context == "selection") {
                commandName = "Paste"
                func = sendClipboardMenu(device);
                funcsForContext.push({"func":notificationSelection(device),"commandName":"Create Notification with text","dontSendText":true});
            }else if (context == "image") {
               func = sendSrcUrlMenu(device);
               funcsForContext.push({"func":sendWallpaperMenu(device),"commandName":"Set image as wallpaper","dontSendText":true});
               funcsForContext.push({"func":openLinkImage(device),"commandName":"Download image","dontSendText":true});
            }else if (context == "video") {
                func = sendSrcUrlMenu(device);
            }else if (context == "audio") {
                func = sendSrcUrlMenu(device);
            }
            if (func) {
                funcsForContext.push({"func":func,"commandName":commandName});
            }
            for (var i = 0; i < funcsForContext.length; i++) {
                var func = funcsForContext[i];
                func = {
                    "func": func.func,
                    "command": func.commandName,
                    "dontSendText": func.dontSendText
                };
                func.device = device;
                func.context = context;
                func.name = device.name;
                funcs.push(func);
            };
        });
    }
    createMenuFromFuncs(funcs);
}  
updatemenu();
var lastClipboard = null;
var autoCheckClipboard = getAutoClipboard();
var checkClipboardRecursive = function(){
    if(!autoCheckClipboard){
        return;
    }
    getClipboard(function(clipboardData){
        if(lastClipboard != clipboardData){
            lastClipboard = clipboardData;
            var devicesToSendClipboard = getDeviceIdsToSendAutoClipboard();
            if(devicesToSendClipboard.length>0){
                var gcmParams = {};
                gcmParams[GCM_PARAM_TIME_TO_LIVE] = 0;
                var params = {"deviceIds" : devicesToSendClipboard, "text":encrypt(clipboardData)};
                var gcmAutoClipboard = new GCMAutoClipboard();
                gcmAutoClipboard.text = params.text;
                new DeviceIdsAndDirectDevices(devicesToSendClipboard).send(function(serverDeviceIds,callback, callbackError){
                    params.deviceIds = serverDeviceIds;
                    doPostWithAuth(joinserver + "messaging/v1/sendAutoClipboard/",params,callback, callbackError);
                },gcmAutoClipboard,gcmParams, function(result){
                      console.log("Sent clipboard automatically: " + JSON.stringify(result));          
                    },function(error){
                        console.log("Error: " + error);           
                });                
            }
        }
    });
    if(autoCheckClipboard){
        setTimeout(checkClipboardRecursive,2000);
    }
}
var handleAutoClipboard = function(){
    if(getAutoClipboard()){
        autoCheckClipboard = true;
        getClipboard(function(clipboardData){
            lastClipboard = clipboardData;
            checkClipboardRecursive();
        });
    }else{
        autoCheckClipboard = false;
    }
}
handleAutoClipboard();

