# webtask-commit-announcer
Webtask.io commit announcer task

This is a repository to hold webtask commit announcer task. Normaly you do not need this.

Webtask commit announcer is a webtask application which allows Github users to get a web push notification.

Webtask commit announcer is using Firebase Cloud Messaging platform of Google.

For that reason you need to have FCM api keys and put them into Webtask.io "secrets".

Once you setup webtask, you need to get copy of the url, and add this to webhook of the repository
you need to track.

Once you have the webhook defined you neet visit webworker's homepage. Visiting the homepage will register
web worker for you.

Web worker will listen to web push notifications. If you allowed notifications you will receive them. If you did
not allow, notifications will not be shown. If you want to override your settings search for "Notification" in
settings and remove webtaks' url. Once you revisit, chrome will ask you for authorization again.

This worker would work on most modern browsers. But it is only test in Chrome. It should work well on Firefox, though.

Once notification is enabled, webworker will work on the background. Background web workers can be seen from Dev Tools of
Chrome. Applications -> Web workers list the background webworkers.
