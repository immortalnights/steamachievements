'use strict';

const debug = require('debug')('web');
const express = require('express');
const http = require('http');
const events = require('events');
const _ = require('underscore');
const playerRouterFactory = require('./lib/routers/player');
const gameRouterFactory = require('./lib/routers/game');

module.exports = class Web extends events.EventEmitter {
	constructor(config)
	{
		super();

		// setup express server
		const app = express();

		// JSON middleware
		app.use(express.json());

		// Catch-all debugging
		// app.use(function(req, res, next) {
		// 	console.log("Catch-all route");
		// 	next();
		// });

		// API router
		const emitter = this;
		const router = express.Router();
		router.use(function(req, res, next) {
			req.notifier = emitter;
			next();
		});

		// router.route('/error').get((req, res) => {
		// 	throw new Error("T");
		// });

		// Apply API router
		app.use('/api', router);
		app.use('/api', playerRouterFactory(config));
		app.use('/api', gameRouterFactory(config));

		app.use(express.static('public', {
			maxAge: '1d'
		}));

		app.use('/node_modules', express.static('node_modules', {
			maxAge: '1d'
		}));

		const port = config.HTTPPort || 8080;
		debug(`Starting express server on ${port}`);
		const service = app.listen(port, () => debug(`Listening on port ${port}`));

		service.on('error', function(err) {
			console.error(`Failed to start Express server`);
			console.error(err);
			process.exit(1);
		});

		this.app = app;
		this.service = service;
	}
}