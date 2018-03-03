'use strict';

const express = require('express');
const _ = require('underscore');
const config = require('./config.json');
const Database = require('./lib/database');
const Steam = require('./lib/steam');


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
const db = new Database('achievementhunter');

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
	router.route('/error').get((req, res) => { throw new Error("T"); });
	router.route('/players')
		// get player(s)
		.get((req, res) => {
			db.getPlayers().then((records) => {
				res.send(records);
			}).catch((error) => {
				console.error("Error", error);
				res.send(error);
			});
		})
		// create player
		.post((req, res) => {
			const data = req.body;

			new Promise(function(resolve, reject) {
				if (data.identifier)
				{
					var result = parsePlayerIdentifier(data.identifier);

					if (result.id)
					{
						console.log("identified player steamid", result.id);
						// Load the users players
						resolve(result.id);
					}
					else
					{
						console.log("resolving player vanity name", result.vanity);

						// Resolve the vanity URL.
						// It is possible for a player has changed their URL to a different players previous URL so cannot rely on the cache
						steam.resolveVanityUrl(result.vanity)
						.then(function(response) {
							// The request (almost) always returns 200, even if it failed
							if (response.steamid)
							{
								console.log("Resolved vanity url", data.identifier, "->", response.steamid);
								resolve(response.steamid);
							}
							else
							{
								reject({ error: "Failed to resolve player '" + result.vanity + "'." });
							}
						})
						.catch(function(response) {
							console.error("Failed to resolve vanity name", result.vanity, response);
							reject({ error: "Failed to resolve player '" + data.identifier + "' ." });
						});
					}
				}
				else
				{
					console.log("Received data:", req.body, typeof (req.body));
					reject({ error: "Invalid player Id (missing identifier)" });
				}
			})
			.then(function(steamid) {
				console.log("find player in database", steamid);
				// get the player, by Id from the database
				return db.getPlayers({ _id: steamid })
				.then((records) => {
					let next;
					if (records.length === 1)
					{
						console.log("player exists in database");
						res.send(records[0]);
					}
					else
					{
						console.log("player does not exist in database, load steam summary");
						return steam.getSummary(steamid)
						.then(function(summary) {
							// Can receive a success response, but not have any data
							if (summary && summary.steamid)
							{
								let player = {
									_id: summary.steamid,
									added: new Date(),
									updated: new Date(0),
									games: new Date(0),
									steam: _.omit(summary, 'steamid')
								};

								console.log("loaded steam summary, save player");
								return db.addPlayer(player)
								.then(function() {
									console.log("successfully saved player");
									res.status(201).send(player);
								});
							}
							else
							{
								throw "Steam player does not exist";
							}
						});
					}
				});
			})
			.then(function() {
				console.log("Done");
			})
			.catch(function(err) {
				console.error("Failed to create player", err);

				if (_.isString(err))
				{
					err = { error: err };
				}
				else if (err instanceof Error)
				{
					err = { error: err.toString() };
				}

				res.status(404).send(err);
			});
		});
	router.route('/players/:id')
		// get player
		.get((req, res) => {
			db.getPlayers({ _id: req.params.id }).then((records) => {
				if (records.length === 1)
				{
					res.send(records[0]);
				}
				else
				{
					res.status(404).send({ error: "Unable to find requested players." });
				}
			}).catch((error) => {
				console.error("Error", error);
				res.send(error);
			});
		});

	router.route('/gamesummary/:id')
		.get((req, res) => {
			const query = { playerId: req.params.id };
// TODO check player even exists
			db.getPlayerGameSummary(query)
			.then(function(gameSummary) {
				console.log("summary", gameSummary);

				return db.getPlayerAchievementSummary(query)
				.then(function(achievementSummary) {
					console.log("game summary", achievementSummary);

					res.send(_.extend({}, gameSummary, achievementSummary));
				});
			})
		});

	// Apply API router
	app.use('/api', router);

	app.use(express.static('public'));
	app.use('/node_modules', express.static('node_modules'));

	const port = config.HTTPPort || 8080
	console.log("Starting express server on", port);

	try
	{
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
