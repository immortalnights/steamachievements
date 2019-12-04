'use strict';

const debug = require('debug')('service');
const subprocess = require('child_process');
const _ = require('underscore');
const Service = require('./service');
const Web = require('./web');
const config = require('./config.json');
const core = require('./lib/core');

process.on('unhandledRejection', function(reason, p) {
	console.log('Unhandled Rejection: Promise', p, 'reason:', reason);
});

debug("Service debug enabled");

const playerResynchronization = { minutes: 5 };
const systemConfig = _.defaults(config, {
	database: {},
	timers: {
		serviceTimer: 1 * 60 * 1000,
		playerResynchronization: playerResynchronization,
		playerMinResynchronizationDelay: playerResynchronization,
		gameResynchronization: { days: 14 },
		gameMinResynchronizationDelay: { hours: 1 },
		cacheMaxAge: 60 // seconds
	}
});

core.start(systemConfig)
.then(function() {
	// fork the web server (API and UI)
	const webserver = new Web(systemConfig);

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
	const service = new Service(systemConfig);
	service.start();
})
.catch(function(err) {
	console.error("Failed to connect to database or Steam");
	console.error(err);
	process.exit(1);
});

