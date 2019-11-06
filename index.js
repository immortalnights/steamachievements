'use strict';

const debug = require('debug')('service');
const subprocess = require('child_process')
const Service = require('./service');
const config = require('./config.json');
const core = require('./lib/core');

process.on('unhandledRejection', function(reason, p) {
	console.log('Unhandled Rejection: Promise', p, 'reason:', reason);
});

core.start(config)
.then(function() {
	console.log("Startup successful");
	debug("Service debug enabled");

	// fork the web server (API and UI)
	const web = subprocess.fork('./web.js');
	// initalize the service
	const service = new Service();

	web.on('exit', (code) => {
		console.log(`Web child has exited ${code}`);
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

	process.on('SIGINT', () => {
		service.stop();
		web.kill();
		core.stop();
		console.log("SIGINT (main)");
	});

	process.on('SIGTERM', () => {
		service.stop();
		web.kill();
		core.stop();
		console.log("SIGTERM (main)");
	});

	// start the service
	service.start();
})
.catch(function(err) {
	console.error("Failed to connect to databse or Steam");
	console.error(err);
	// TODO fix db connection error not closing / exiting automatically
	process.exit(1);
});