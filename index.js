'use strict';

const debug = require('debug')('service');
const subprocess = require('child_process')
const Service = require('./service2');
const config = require('./config.json');
const core = require('./lib/core');

process.on('unhandledRejection', function(reason, p) {
	console.log('Unhandled Rejection: Promise', p, 'reason:', reason);
});

core.start(config)
.then(function() {
	console.log("Startup successful");

	// fork the web server (API and UI)
	const web = subprocess.fork('./web.js');
	// initalize the service
	const service = new Service();

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

	// start the service
	service.run();
})
.catch(function(err) {
	console.error("Failed to connect to databse or Steam");
	console.error(err);
	// TODO fix db connection error not closing / exiting automatically
	process.exit(1);
});