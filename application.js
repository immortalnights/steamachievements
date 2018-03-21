'use strict';

const subprocess = require('child_process')
const Database = require('./lib/database');
const Steam = require('./lib/steam');
const Service = require('./service');
const config = require('./config.json');

const db = new Database(config.database.name);
const steam = new Steam(config.steamAPIKey);

db.connect(config.database)
.then(function() {
	return db.initialize();
})
.then(function() {

	// fork the web server (API and UI)
	const web = subprocess.fork('./web.js');
	// initalize the service
	const service = new Service(db, steam);

	web.on('message', function(message) {
		console.log("received message from `web`", message);

		if (message.registered)
		{
			service.refreshPlayer(message.registered);
		}
	});

	// start the service
	service.run();
})
.catch(function(err) {
	console.error(err);
	// TODO fix db connection error not closing / exiting automatically
	process.exit(1);
});