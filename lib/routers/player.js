
const express = require('express');
const _ = require('underscore');

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

	// Parse the identifier if it looks like a community url
	if (-1 !== identifier.indexOf('steamcommunity.com'))
	{
		identifier = parseUrl(identifier);
	}

	// Converting to a number will loose some precision, but only checking for NaN
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

const parseOrderBy = function(orderby) {
	let result = {};

	if (orderby)
	{
		const index = orderby.lastIndexOf(' ');
		const order = orderby.substr(index+1).toLowerCase();
		if (-1 === index)
		{
			result.key = orderby;
			result.order = 'DESC';
		}
		else if (order === 'asc')
		{
			result.key = orderby.substr(0, index);
			result.order = 'ASC';
		}
		else if (order === 'desc')
		{
			result.key = orderby.substr(0, index);
			result.order = 'DESC';
		}
	}

	return result
}

const parseQueryString = function(query) {
	let result = {};

	if (query)
	{
		let parts = query.split(' ');

		for (index in parts)
		{
			let [key, value] = parts[index].split('=');

			if (value === 'true')
			{
				value = true;
			}
			else if (value === 'false')
			{
				value = false;
			}

			result[key] = value;
		}
	}

	return result;
}

const DEFAULT_RESULT_LIMIT = 12

module.exports = function(db, steam) {
	const router = express.Router();
	router.route('/Players')
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
									personaname: summary.personaname,
									added: new Date(),
									updated: new Date(0),
									resynchronized: 'pending',
									steam: _.omit(summary, 'steamid', 'personaname')
								};

								console.log("loaded steam summary, save player");
								return db.addPlayer(player)
								.then(function() {
									console.log("successfully saved player");
									// notify the parent process (the service) of the new registration so it can be resynchronized immediately
									process.send({ registered: summary.steamid });

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

	router.param('id', (req, res, next, playerId) => {
		console.log("Check player", playerId);

		db.getPlayers({ _id: playerId })
		.then(function(records) {
			if (records.length === 1)
			{
				req.player = records[0];
				return next();
			}
			else
			{
				res.status(404).send({ error: "Player not found." });
			}
		});
	});

	router.route('/Players/:id')
		.get((req, res) => {
			res.send(req.player);
		});

	router.route('/Players/:id/resynchronize/invoke')
		.put((req, res) => {
			const playerId = req.player._id;
			process.send({ resynchronize: playerId });

			res.status(202).send({});
		});

	router.route('/Players/:id/Summary')
		.get((req, res) => {
			const playerId = req.player._id;

			console.log("get player game summary", playerId);
			return db.getPlayerGameSummary(playerId)
			.then(function(gameSummary) {
				// console.log("summary", gameSummary);

				console.log("get player achievement summary", playerId);
				return db.getPlayerAchievementSummary(playerId)
				.then(function(achievementSummary) {
					// console.log("achievement summary", achievementSummary);

					res.send(_.extend({}, { games: gameSummary }, { achievements: achievementSummary }));
				});
			})
			.catch(function(err) {
				console.error("Failed to query player games", err)
				res.send(400).send({ error: "Failed to query player games."});
			});
		});

	router.route('/Players/:id/Games')
		.get((req, res) => {
			const playerId = req.player._id;
			const queryString = parseQueryString(req.query['query']);
			const orderBy = parseOrderBy(req.query['order-by']);

			let query;
			switch (orderBy.key)
			{
				case 'percent':
				{
					query = db.getGameCompletionPercentage(playerId, orderBy.order, DEFAULT_RESULT_LIMIT);
					break;
				}
				case 'globalPercentage':
				{
					query = db.getGameGlobalPercentage(playerId, orderBy.order, DEFAULT_RESULT_LIMIT);
					break;
				}
				default:
				{
					query = db.getPlayerGames({
						owners: {
							$elemMatch: {
								playerId: playerId,
								perfect: { $eq: true }
							}
						}
					}, 'name')
					.then(function(documents) {
						_.each(documents, function(doc) {
							delete doc.owners;
						});

						return documents;
					});
					break;
				}
			}

			query.then(function(documents) {
				res.send(documents);
			})
			.catch(function(err) {
				console.error("Failed to query player games", err)
				res.status(400).send({ error: "Failed to query player games."});
			});
		});

	router.route('/Players/:id/Achievements')
		.get((req, res) => {
			const playerId = req.player._id;
			const orderBy = parseOrderBy(req.query['order-by']);

			console.log("get player game achievements", playerId);

			let query;
			switch (orderBy.key)
			{
				case 'globalPercentage':
				{
					query = db.getAchievementsByGlobalPercentage(playerId, orderBy.order, DEFAULT_RESULT_LIMIT);
					break;
				}
				default:
				{
					query = db.getPlayerAchievements({
						playerId: playerId
					}, {
						$limit: DEFAULT_RESULT_LIMIT
					});
					break;
				}
			}

			query.then(function(record) {
				res.send(record);
			})
			.catch(function(err) {
				console.error("Failed to query player achievements", err)
				res.send(400).send({ error: "Failed to query player achievements."});
			});
		});

	return router;
};
