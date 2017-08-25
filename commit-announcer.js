'use latest';

import express from "express";
import * as admin from "firebase-admin";
import { fromExpress } from "webtask-tools";
import bodyParser from "body-parser";

const formidable = require('formidable');
const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

module.exports = fromExpress(app);

const addClientId = (clientId, webtaskContext, callback) => {
  let registered_client_ids = [];
  webtaskContext.storage.get((error, data) => {
    //TODO: error handling
    if (error) {
      return callback(error);  
    }
    // if there is nothing in the stroge data is undefined
    if (!data) {
      data = {};
    }
    
    registered_client_ids = data.registered_client_ids;
    
    if (!registered_client_ids || registered_client_ids.length === 0) {
      registered_client_ids = [ clientId ];
    } else if (registered_client_ids.indexOf(clientId) === -1) {
      registered_client_ids.push(clientId);  
    }
    
    webtaskContext.storage.set({ registered_client_ids: registered_client_ids }, { force: 1 }, error => {
      if (error) {
        return callback(error);
      }
      
      callback(null, registered_client_ids);
    }); // set
  }); // get
};

const initFirebase = (req, res) => {
  try {
    admin.app();
  } catch(e) {
    if (e.code === "app/no-app") {
      console.log("No app, initializing");
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: req.webtaskContext.data.project_id,
          clientEmail: req.webtaskContext.data.client_email,
          privateKey: req.webtaskContext.data.private_key.replace(/\\n/g, "\n")
        }, "commit-announcer"),
        databaseURL: "https://commit-announcer.firebaseio.com"
      });
    }
  }
};


// manifest.json for firebase
app.get("/manifest.json", (req, res) => {
  res.json({
    "/": "Fixed id for all firebase apps",
    "gcm_sender_id": "103953800507"
  });
}); // GET manifest.json

app.post("/register", (req, res) => {
  let form = new formidable.IncomingForm();
  form.parse(req, (err, fields, files) => {
    if (!fields.token) {
      res.status(500).send("Invalid Request");
      return;
    }
    addClientId(fields.token, req.webtaskContext, error => {
      if (err) {
        return res.status(500).send(error);
      }
      
      res.send("OK");
    }); // addClientId
    
    
  }); // form.parse
}); // POST register

app.get("/firebase-messaging-sw.js", (req, res) => {
  res.type("text/javascript");
  res.send(`
   importScripts('https://www.gstatic.com/firebasejs/3.9.0/firebase-app.js');
   importScripts('https://www.gstatic.com/firebasejs/3.9.0/firebase-messaging.js');
   firebase.initializeApp({
     'messagingSenderId': '${req.webtaskContext.data.messaging_sender_id}'
   });
   const messaging = firebase.messaging();
   
   messaging.setBackgroundMessageHandler(function(payload) {
      console.log('[firebase-messaging-sw.js] Received background message ', payload);
      // Customize notification here
      const notificationTitle = 'Background Message Title';
      const notificationOptions = {
        body: 'Background Message body.',
        icon: '/firebase-logo.png'
      };
    
      return self.registration.showNotification(notificationTitle,
          notificationOptions);
    });
  `);
}); // GET firebase-messaging-sw.js

app.get("/", (req, res) => {
  initFirebase(req, res);
  
  let frontEndFunctions = JSON.parse(frontEndFunctionsString);
  
  res.send(`<html>
    <head>
      <script src="https://www.gstatic.com/firebasejs/4.2.0/firebase-app.js"></script>
      <script src="https://www.gstatic.com/firebasejs/4.2.0/firebase-messaging.js"></script>
      <script>
        // Initialize Firebase
        var config = {
          apiKey: "AIzaSyC37a81nNrtgpsuZyzRwwDrvmL4WOCpg0c",
          authDomain: "commit-announcer.firebaseapp.com",
          databaseURL: "https://commit-announcer.firebaseio.com",
          projectId: "commit-announcer",
          storageBucket: "commit-announcer.appspot.com",
          messagingSenderId: "${req.webtaskContext.data.messaging_sender_id}"
        };
        firebase.initializeApp(config);
      </script>
    </head>
    <body>
    <script language="javascript">
      let tokenIsSent = false;
      let activeToken = null;
      const messaging = firebase.messaging();
      
      const sendTokenToServer = (token, serverUrl) => {
        let formData = new FormData(); 
        
        formData.append("token", token);
        if (activeToken !== null) {
          formData.append("oldToken", activeToken);
        }
        
        return fetch(serverUrl, {
          method: "POST",
          body: formData
        }).then(function(response) {
          if (response.ok) {
            activeToken = token;
          }
          
          return Promise.resolve(response);
        });
      }; // sendTokenToServer
      
      const setTokenSentToServer = (status) => {
        if (status !== true || status !== false) {
          return;
        }
        
        window.tokenIsSent = status;
      }; // setTokenSentToServer
      
      messaging.requestPermission()
      .then(function() {
        console.log('Notification permission granted.');
        // TODO(developer): Retrieve an Instance ID token for use with FCM.
        // ...
        
        navigator.serviceWorker.register('/commit-announcer/firebase-messaging-sw.js', {scope: '/commit-announcer/'})
        .then(reg => {
          messaging.useServiceWorker(reg);
          messaging.getToken()
          .then(currentToken => {
            if (currentToken) {
              console.log(currentToken);
              // updateUIForPushEnabled(currentToken);
              sendTokenToServer(currentToken, "/commit-announcer/register").then(response => {
                if (!response.ok) {
                  console.warn(response);
                  alert("Could not register to notifications: " + response.statusText);
                } else {
                  setTokenSentToServer(true);
                  document.getElementById("info-box").innerHTML = "Registered to notifications, you will start getting notifications on GitHub activity.";
                }
              }).catch(err => {
                console.log(err);
                alert("Could not register to notifications.");
              });
            } else {
              // Show permission request.
              console.log('No Instance ID token available. Request permission to generate one.');
              // Show permission UI.
              // updateUIForPushPermissionRequired();
              // setTokenSentToServer(false);
            }
          })
          .catch(err => {
            console.log('An error occurred while retrieving token. ', err);
            console.log('Error retrieving Instance ID token. ', err);
            setTokenSentToServer(false);
          }); // getToken
          
          messaging.onTokenRefresh(() => {
            messaging.getToken()
            .then(refreshedToken => {
              console.log('Token refreshed.');
              // Indicate that the new Instance ID token has not yet been sent to the
              // app server.
              setTokenSentToServer(false);
              // Send Instance ID token to app server.
              sendTokenToServer(currentToken, "/commit-announcer/register").then(response => {
                if (!response.ok) {
                  console.warn(response);
                  alert("Could not register to notifications: " + response.statusText);
                } else {
                  setTokenSentToServer(true);
                  document.getElementById("info-box").innerHTML = "Refreshed token for notifications, you will start getting notifications on GitHub activity.";
                }
              }).catch(err => {
                console.log(err);
                alert("Could not re-register to notifications.");
              });
              sendTokenToServer(refreshedToken);
              // ...
            })
            .catch(err => {
              console.log('Unable to retrieve refreshed token ', err);
            });
          }); // onTokenRefresh
        }); // serviceWorker
      })
      .catch(err => {
        console.warn('Unable to get permission to notify.', err);
        alert('Unable to get permission to notify.');
      });
      
    </script>
    </body>
    <div id="info-box"></div>
    </html>
  `);
}); // GET /

app.post("/webhook", (req, res) => {
  if (!req.body && !req.body.payload) {
    res.send("No fish.");
  }
  initFirebase(req, res);
  
  sendPushMessage({ data: req.body.payload }, req.webtaskContext).then(response => {
    res.send("Message sent.");
  }).catch(err => {
    res.status(500).send("Error sending message: " + err);
  });
});

const sendPushMessage = (payload, webtaskContext) => {
  
  let defer = Promise.defer();
  
  payload = {
    data: {
      score: "850",
      time: "2:45"
    }
  };
  
  webtaskContext.storage.get((error, data) => {
    if (error) {
      return defer.reject(error);
    }
    
    // if storage not initialized data is undefined
    if (!data) {
      data = {};
    }
    
    let registered_client_ids = data.registered_client_ids;
    console.log(registered_client_ids);
    if (!registered_client_ids) {
      return defer.reject(new Error("nobody is registered"));
    }
  
    if (registered_client_ids.length === 0) {
      return defer.reject(new Error("nobody is registered"));
    }
    
    admin.messaging().sendToDevice(registered_client_ids, payload)
    .then(function(response) {
      // See the MessagingDevicesResponse reference documentation for
      // the contents of response.
      console.log("Successfully sent message:", response);
      defer.resolve("Successfully sent message:" + response);
    })
    .catch(function(error) {
      
      console.log("Error sending message:", error);
      defer.reject(error);
    });
  }); // get
  
  return defer.promise;
};
