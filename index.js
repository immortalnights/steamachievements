'use strict';

const debug = require('debug')('service');
const subprocess = require('child_process');
const Service = require('./service');
const Web = require('./web');
const config = require('./config.json');
const core = require('./lib/core');

process.on('unhandledRejection', function(reason, p) {
	console.log('Unhandled Rejection: Promise', p, 'reason:', reason);
});

debug("Service debug enabled");

core.start(config)
.then(function() {
	// fork the web server (API and UI)
	const webserver = new Web(config);

	webserver.on('registered', (message) => {
		console.log("received 'registered' event from web server", message);
		service.queueResynchronizeNewPlayer(message.id);
	});

	webserver.on('resynchronize', (message) => {
		console.log("received 'resynchronize' event from web server", message);
		
		switch (message.resource)
		{
			case 'player':
			{
				service.queueResynchronizePlayer(message.id);
				break
			}
			case 'game':
			{
				service.queueResynchronizeGame(message.id);
				break;
			}
		}
	});

	// initalize the service
	const service = new Service();
	service.start();
})
.catch(function(err) {
	console.error("Failed to connect to database or Steam");
	console.error(err);
	process.exit(1);
});

