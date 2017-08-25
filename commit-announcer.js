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

/**
 * clears client ids inside the webtask storage
 * @param  {webtaskContext}   webtaskContext ctx of webtask
 * @param  {Function} callback       callback(err)
 */
const clearClientIds = (webtaskContext, callback) => {
  webtaskContext.storage.set({ registered_client_ids: [] }, {force: 1}, error => {
      if (error) {
        return callback(error);
      }
      callback();
  });
}; // clearClientIds

/**
 * adds clientid to the webtask storage. does not add client id if exists in the
 * storage already.
 * @param  {string}   clientId       client Id to be added.
 * @param  {webtaskContext}   webtaskContext ctx of webtask
 * @param  {Function} callback       callback(err, registered_client_ids)
  */
const addClientId = (clientId, webtaskContext, callback) => {
  let registered_client_ids = [];

  webtaskContext.storage.get((error, data) => {
    //TODO: better error handling
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
}; // addClientId

/**
 * deletes list of indexes from webtask storage. warning: no boundary check is done
 * @param  {array}   indexes        array of indexes to be removed
 * @param  {webtaskContext}   webtaskContext ctx of webtask
 * @param  {Function} callback       callback(err, new_registered_client_ids)
 */
const deleteClientIdByIndex = (indexes, webtaskContext, callback) => {
  let registered_client_ids = [];
  let new_registered_client_ids = [];

  if (!Array.isArray(indexes)) {
    return callback(null);
  }

  webtaskContext.storage.get((error, data) => {
    //TODO: better error handling
    if (error) {
      return callback(error);
    }

    // if there is nothing in the stroge data is undefined
    if (!data) {
      data = {};
    }

    registered_client_ids = data.registered_client_ids;

    if (registered_client_ids) {
      registered_client_ids.forEach((clientId, index) => {
        if (indexes.indexOf(index) === -1) {
          new_registered_client_ids.push(clientId);
        }
      }); // forEach
    }

    webtaskContext.storage.set({ registered_client_ids: new_registered_client_ids }, { force: 1 }, error => {
      if (error) {
        return callback(error);
      }

      callback(null, new_registered_client_ids);
    }); // set
  }); // get
}; // deleteClientIdByIndex


/**
 * initialize firebase-admin. Uses project_id, client_email and private_key from 
 * webtask secrets.
 * @param  {object} req request object from express
 * @param  {object} res response object from express
 */
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
}; // initFirebase

/**
 * sends push message using firebase-admin. Sends message to all clients in registered_client_ids.
 * @param  {object} payload        payload object for notification
 * @param  {webtaskContext} webtaskContext cts of webtask for accesing storage
 * @return {Promise}                resolves to success message
 */
const sendPushMessage = (payload, webtaskContext) => {

  let defer = Promise.defer();

  webtaskContext.storage.get((error, data) => {
    if (error) {
      return defer.reject(error);
    }

    // if storage not initialized data is undefined
    if (!data) {
      data = {};
    }

    let registered_client_ids = data.registered_client_ids;

    if (!registered_client_ids) {
      return defer.reject(new Error("nobody is registered"));
    }

    if (registered_client_ids.length === 0) {
      return defer.reject(new Error("nobody is registered"));
    }

    admin.messaging().sendToDevice(registered_client_ids, payload)
    .then(response => {
      console.log("Successfully sent message:", response);

      // handle error messages to clean up unavailable clients
      let indexesToBeRemoved = [];

      if (response.results) {
        response.results.forEach((result, index) => {
          if (result.code === "messaging/registration-token-not-registered") {
            indexesToBeRemoved.push(index);
          }

          // console.log(result);
        }); // forEach

        deleteClientIdByIndex(indexesToBeRemoved, webtaskContext, (error) => {
          defer.resolve("Successfully sent message:" + response);
        });

      } else {
        defer.resolve("Successfully sent message:" + response);  
      }
    })
    .catch(error => {

      console.log("Error sending message:", error);
      defer.reject(error);
    }); // sendToDevice
  }); // get

  return defer.promise;
}; // sendPushMessage

/**
 * Routes start here
 */


// index.html, uses messagin_sender_id from webtask secrets. 
app.get("/", (req, res) => {
  initFirebase(req, res);

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
                  document.getElementById("info-box").innerHTML = "Registered to notifications, you will start getting notifications on GitHub activity. You can close this window.";
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
      return res.status(500).send("Invalid Request");
    }
    addClientId(fields.token, req.webtaskContext, (error, clientIds) => {
      if (err) {
        return res.status(500).send(error);
      }

      res.send("OK");
    }); // addClientId
  }); // form.parse
}); // POST /register

app.get("/clear", (req, res) => {
  clearClientIds(req.webtaskContext, error => {
    if (error) {
      return res.status(500).send(error);
    }

    res.send("OK");
  });
}); // GET /clear

// static logo for notification stored as base64
app.get("/images/github.png", (req, res) => {
  const logoBase64 = "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";

  let logo = new Buffer(logoBase64, "base64");

  res.type("image/png");
  res.write(logo);
  res.end();
}); // GET /images/github.png

// static web worker script, uses messaging_sender_id from webtask secrets
app.get("/firebase-messaging-sw.js", (req, res) => {
  res.type("text/javascript");
  res.send(`
   importScripts('https://www.gstatic.com/firebasejs/3.9.0/firebase-app.js');
   importScripts('https://www.gstatic.com/firebasejs/3.9.0/firebase-messaging.js');
   firebase.initializeApp({
     'messagingSenderId': '${req.webtaskContext.data.messaging_sender_id}'
   });
   const messaging = firebase.messaging();

   messaging.setBackgroundMessageHandler(function(_payload) {
      console.log('[firebase-messaging-sw.js] Received background message ', _payload);
      let payload = _payload.data;
      // Customize notification here
      const notificationTitle = 'GitHub Commit on ' + payload.repository;
      const notificationOptions = {
        body: payload.message,
        data: payload.link,
        icon: '/commit-announcer/images/github.png'
      };

      return self.registration.showNotification(notificationTitle,
          notificationOptions);
    });

    self.addEventListener('notificationclick', function(event) {
      console.log('[Service Worker] Notification click Received.');

      event.notification.close();
      event.waitUntil(
        clients.openWindow(event.notification.data)
      );
    });
  `);
}); // GET firebase-messaging-sw.js

// web hook handler for github
app.post("/webhook", (req, res) => {
  if (!req.body && !req.body.payload && !req.body.payload.commits) {
    res.send("No fish.");
  }

  initFirebase(req, res);

  let payloadObject = {
    commits: [
      {
        message: ""
      }
    ],
    repository: {
      name: ""
    },
    compare: ""
  };

  // parse is always risky
  try {
    let _payload = JSON.parse(req.body.payload);
    payloadObject = Object.assign(payloadObject, _payload);
  } catch (e) {
    console.warn("using empty payload object because parse did not went through: " + req.body.payload);
  }
  
  let payload = {
    message: payloadObject.commits[0].message,
    repository: payloadObject.repository.name,
    link: payloadObject.compare
  };

  sendPushMessage({ data: payload }, req.webtaskContext).then(response => {
    res.send("Message sent.");
  }).catch(err => {
    res.status(500).send("Error sending message: " + err);
  });
}); // POST /webhook