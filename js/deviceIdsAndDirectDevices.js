
var doDirectGCMRequest = function(regId, gcmString, gcmType, gcmParams, callback, callbackError){
    var req = new XMLHttpRequest();
    req.open("POST", "https://gcm-http.googleapis.com/gcm/send", true);
    req.setRequestHeader("Authorization", "key=AIzaSyDvDS_KGPYTBrCG7tppCyq9P3_iVju9UkA");
    req.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
    req.onload = function() {
        console.log("POST status: " + this.status);
        var result = {};
        if(this.status != 200){
            if (callbackError != null) {
                callbackError(this.responseText);
            }
            return;
        }
        if(this.responseText){
            result = JSON.parse(this.responseText)
        }
        if (callback != null) {                
            callback(result);
        }
    }
    req.onerror = function(e) {
        if (callbackError != null) {
            callbackError(e.currentTarget);
        }
    }
    if(typeof regId == "string"){
        regId = [regId];
    }
    var content = {
        "data": {
            "json": gcmString,
            "type": gcmType
        },
        "registration_ids": regId
    }
    if(gcmParams){
        for(var prop in gcmParams){
            content[prop] = gcmParams[prop];
        }
    }
    var contentString = JSON.stringify(content);
    req.send(contentString);
}

var DeviceIdsAndDirectDevices = function(deviceIds){
	var me = this;
	this.deviceIds = deviceIds;
	this.serverDevices = [];
	this.directDevices = [];

	this.convertGroupToDeviceIds = function(device){
		var devicesResult = [];
		if(device.deviceId.indexOf("group." == 0)){
			var devicesForGroup = joindevices.groups.deviceGroups.getGroupDevices(devices, device.deviceId);
			if(devicesForGroup && devicesForGroup.length > 0){
				for (var i = 0; i < devicesForGroup.length; i++) {
					var deviceForGroup = devicesForGroup[i];
					devicesResult.push(deviceForGroup);
				}
			}else{
				devicesResult.push(device);
			}
		}else{
			devicesResult.push(device);
		}
		return devicesResult;
	}
	var devicesForId = devices.where(function(device){
		return deviceIds.indexOf(device.deviceId) >= 0;
	});
	devicesForId.doForAll(function(deviceForId){
		var devicesExpanded = me.convertGroupToDeviceIds(deviceForId);
		devicesExpanded.doForAll(function(deviceForId){
			if(deviceForId.regId2){
				me.directDevices.removeIf(function(device){
					return device.deviceId == deviceForId.deviceId;
				});
				me.directDevices.push(deviceForId);
			}else{
				me.serverDevices.removeIf(function(device){
					return device.deviceId == deviceForId.deviceId;
				});
				me.serverDevices.push(deviceForId);
			}
		});		
	});
	
	this.send = function(sendThroughServer, gcm, gcmParams){
		if(!gcm){
			return;
		}
		var serverDevices = me.serverDevices;
		var directDevices = me.directDevices;
		var gcmString = JSON.stringify(gcm);
		if(gcmString.length > 3500){
			serverDevices = serverDevices.concat(directDevices);
			directDevices = [];
		}
		if(directDevices.length > 0){
			var regIds = directDevices.select(function(device){return device.regId2;});
			if(!gcmParams){
				gcmParams = {};
			}
			doDirectGCMRequest(regIds,gcmString,gcm.getCommunicationType(),gcmParams,function(multicastResult){
				for (var i = 0; i < directDevices.length; i++) {
					var device = directDevices[i];
					var result = multicastResult.results[i];
					me.handleGcmResult(device, result);
				}

	        },
	        function(error){
	        	var title = "Direct GCM error";
	            console.log(title);
	            console.log(error);
            	showNotification(title, error);
	        });
		}
		if(serverDevices.length > 0){
			sendThroughServer(serverDevices.select(function(device){return device.deviceId;}));
		}
	}
	this.handleGcmResult = function(device, result){
		console.log("Direct GCM result");
        console.log(result);
        if(result.message_id){
        	if(result.registration_id){
        		device.regId2 = result.registration_id;
        		console.log("RegId2 changed for " + device.deviceName);
        		setDevices(devices);
        	}
        }else{
        	var error = result.error;
        	var errorMessage = error;
        	if(error == "NotRegistered"){
        		errorMessage = "Device not registered!";
        	}
    		if(!errorMessage){
    			errorMessage = "Unknown Error";
    		}
    		console.log(errorMessage);
    		showNotification("Error Direct Send", errorMessage);
        }
	}
}