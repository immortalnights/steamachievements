'use strict';

const express = require('express');
const _ = require('underscore');
const config = require('./config.json');
const Database = require('./lib/database');
const Steam = require('./lib/steam');
const playerRouterFactory = require('./lib/routers/player');

process.on('unhandledRejection', (reason, p) => {
	console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

const parsePlayerIdentifier = function(identifier) {
	console.log("parsing player identifier", identifier);
	// Parse steamcommunity urls
	const parseUrl = function(url) {
		const split = function(url, key) {
			let keyOffset = url.indexOf(key);
			let name;

			if (-1 !== keyOffset)
			{
				name = url.substring(keyOffset + key.length);
			}
			
			return name;
		};

		let name = split(url, '/id/') || split(url, '/profiles/');

		if (name)
		{
			let offset = name.indexOf('/');
			if (-1 !== offset)
			{
				name = name.substring(0, offset);
			}
		}

		console.log(identifier, "=>", name);
		return name;
	};

	let result = {};

	// Parse the idetifier if it looks like a community url
	if (-1 !== identifier.indexOf('steamcommunity.com'))
	{
		identifier = parseUrl(identifier);
	}

	// Converting to a number will loose some presistion, but only checking for NaN
	if (identifier.length === 17 && Number(identifier))
	{
		result.id = identifier;
	}
	else
	{
		// assume vanity name
		result.vanity = identifier;
	}

	console.log("parsed identifier", result);

	return result;
}

const steam = new Steam(config.SteamAPIKey);
const db = new Database('achievementchaser');

db.connect('mongodb://localhost:27017')
.then(() => {
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
		console.log("Route API");
		next();
	});

	// router.route('/error').get((req, res) => {
	// 	throw new Error("T");
	// });

	// Apply API router
	app.use('/api', router);
	app.use('/api', playerRouterFactory(db, steam));

	app.use(express.static('public'));
	app.use('/node_modules', express.static('node_modules'));

	try
	{
		const port = config.HTTPPort || 8080
		console.log("Starting express server on", port);
		app.listen(port, () => console.log("Listening on port", port));
	}
	catch (err)
	{
		console.error("Failed to start Express", err);
	}
})
.catch((error) => {
	console.error("Error", error);
	console.log(error);
	// todo exit
});
