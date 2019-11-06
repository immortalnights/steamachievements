'use strict';

const debug = require('debug')('service');
const subprocess = require('child_process')
const Service = require('./service');
const config = require('./config.json');
const core = require('./lib/core');

process.on('unhandledRejection', function(reason, p) {
	console.log('Unhandled Rejection: Promise', p, 'reason:', reason);
});

debug("Service debug enabled");

core.start(config)
.then(function() {
	// fork the web server (API and UI)
	const web = subprocess.fork('./web.js');

	web.on('exit', (code) => {
		console.log(`Web child has exited ${code}`);
		process.exit(1);
	});

	web.on('message', (message) => {
		debug("received message from `web`", message);

		switch (message.action)
		{
			case 'registered':
			{
				service.queueResynchronizeNewPlayer(message.id);
				break;
			}
			case 'resynchronize':
			{
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

