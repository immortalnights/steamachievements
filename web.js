'use strict';

const express = require('express');
const _ = require('underscore');
const config = require('./config.json');
const Database = require('./lib/database');
const Steam = require('./lib/steam');
const playerRouterFactory = require('./lib/routers/player');
const gameRouterFactory = require('./lib/routers/game');
const core = require('./lib/core');

process.on('unhandledRejection', (reason, p) => {
	console.log('Unhandled Rejection: Promise', p, 'reason:', reason);
});


core.start(config)
.catch(function(err) {
	console.error("Failed to connect to database or Steam");
	console.error(err);
	process.exit(1);
});

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
const router = express.Router();
router.use(function(req, res, next) {
	next();
});

// router.route('/error').get((req, res) => {
// 	throw new Error("T");
// });

// Apply API router
app.use('/api', router);
app.use('/api', playerRouterFactory());
app.use('/api', gameRouterFactory());

app.use(express.static('public', {
	maxAge: '1d'
}));

app.use('/node_modules', express.static('node_modules', {
	maxAge: '1d'
}));

const port = config.HTTPPort || 8080;
console.log("Starting express server on", port);
const serv = app.listen(port, () => console.log(`Listening on port ${port}`));

serv.on('error', function(err) {
	console.error(`Failed to start Express server`);
	console.error(err);
	process.exit(1);
});