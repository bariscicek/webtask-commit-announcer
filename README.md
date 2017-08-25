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

Web worker will listen to web push notifications.
