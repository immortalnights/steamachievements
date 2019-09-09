'use strict';

const express = require('express');
const debug = require('debug')('router');
const moment = require('moment');
const Player = require('../player');
const _ = require('underscore');

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

		for (var index in parts)
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

const DEFAULT_RESULT_LIMIT = 12;

module.exports = function(db, steam) {
	const router = express.Router();
	router.route('/Players')
		// get player(s)
		.get((req, res) => {
			db.getPlayers().then((records) => {
				res.set('Cache-Control', 'public, no-cache');
				res.send(records);
			}).catch((error) => {
				console.error("Error", error);
				res.set('Cache-Control', 'no-store');
				res.send(error);
			});
		})
		// create player
		.post((req, res) => {
			const data = req.body;

			new Promise(function(resolve, reject) {
				if (data.identifier)
				{
					var result = Player.parsePlayerIdentifier(data.identifier);

					if (result.id)
					{
						debug("identified player steamid", result.id);
						// Load the users players
						resolve(result.id);
					}
					else
					{
						debug("resolving player vanity name", result.vanity);

						// Resolve the vanity URL.
						// It is possible for a player has changed their URL to a different players previous URL so cannot rely on the cache
						steam.resolveVanityUrl(result.vanity)
						.then(function(response) {
							// The request (almost) always returns 200, even if it failed
							if (response.steamid)
							{
								debug("Resolved vanity url", data.identifier, "->", response.steamid);
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
					debug("Received data:", req.body, typeof (req.body));
					reject({ error: "Invalid player Id (missing identifier)" });
				}
			})
			.then(function(steamid) {
				debug("find player in database", steamid);

				// get the player, by Id from the database
				return db.getPlayers({ _id: steamid })
				.then((records) => {
					let next;
					if (records.length === 1)
					{
						debug("player exists in database");
						res.set('Last-Modified', moment(records[0].resynchronized).toDate().toUTCString());
						res.set('Cache-Control', 'maxAge=86400');
						res.send(records[0]);
					}
					else
					{
						debug("player does not exist in database, load steam summary");
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

								debug("loaded steam summary, save player");
								return db.addPlayer(player)
								.then(function() {
									debug("successfully saved player");
									// notify the parent process (the service) of the new registration so it can be resynchronized immediately
									process.send({ registered: summary.steamid });


									res.set('Last-Modified', new Date().toUTCString());
									res.set('Cache-Control', 'maxAge=86400');
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

				res.set('Cache-Control', 'no-store');
				res.status(404).send(err);
			});
		});

	router.param('id', (req, res, next, playerId) => {
		debug("Check player", playerId);

		db.getPlayers({ _id: playerId })
		.then(function(records) {
			if (records.length === 1)
			{
				req.player = records[0];
				req.player.lastModified = moment();
				if (req.player.resynchronized && req.player.resynchronized !== 'never' && req.player.resynchronized !== 'pending')
				{
					req.player.lastModified = moment(req.player.resynchronized).toDate().toUTCString();
				}
				else
				{
					req.player.lastModified = moment();
				}
				return next();
			}
			else
			{
				res.set('Cache-Control', 'no-store');
				res.status(404).send({ error: "Player not found." });
			}
		});
	});

	router.route('/Players/:id')
		.get((req, res) => {
			res.set('Last-Modified', req.player.lastModified);
			res.set('Cache-Control', 'maxAge=86400');
			res.send(req.player);
		});

	router.route('/Players/:id/Resynchronize/invoke')
		.put((req, res) => {
			const playerId = req.player._id;
			debug("force=", (req.query['force'] === 'true'));
			process.send({ resynchronize: playerId, force: (req.query['force'] === 'true') });

			res.set('Cache-Control', 'no-store');
			res.status(202).send({});
		});

	router.route('/Players/:id/Summary')
		.get((req, res) => {
			const playerId = req.player._id;

			Promise.all([
				db.getPlayerGameSummary(playerId),
				db.getPlayerAchievementSummary(playerId),
				db.getPlayerRecentGames(playerId, 3),
				db.getPlayerRecentAchievements(playerId),
				db.getPlayerFriends(playerId)
			])
			.then(function(data) {
				res.set('Last-Modified', req.player.lastModified);
				res.set('Cache-Control', 'maxAge=86400');
				res.send(_.extend({}, {
					id: playerId,
					games: data[0],
					achievements: data[1],
					recentGames: data[2],
					recentAchievements: data[3],
					friendCount: data[4].length
				}));
			})
			.catch(function(err) {
				console.error("Failed to query player games", err)
				res.set('Cache-Control', 'no-store');
				res.send(400).send({ error: "Failed to query player games."});
			});
		});

	router.route('/Players/:id/Friends')
		.get((req, res) => {
			const playerId = req.player._id;

			debug("get player friends", playerId);
			return db.getPlayerFriends(playerId)
			.then(function(friends) {

				// Filter unknown friends
				let knownFriends = _.filter(friends, function(friend) {
					return !_.isEmpty(friend.player);
				});

				// Optimize data
				knownFriends = _.map(knownFriends, function(friend) {
					let player = {};
					_.extend(player, _.pick(friend.player[0], '_id', 'personaname'));
					_.extend(player, _.pick(friend.player[0].steam, 'profilestate', 'avatar', 'profileurl', 'lastlogoff'));
					_.extend(player, _.pick(friend.friend, 'friend_since'));
					return player;
				});

				res.set('Last-Modified', req.player.lastModified);
				res.set('Cache-Control', 'maxAge=86400');
				res.send(knownFriends);
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
				case 'recent':
				{
					query = db.getPlayerRecentGames(playerId, DEFAULT_RESULT_LIMIT)
					break;
				}
				default:
				{
					// getting all unfiltered games is not optimal
					/*
					query = db.getPlayerGames({
						owners: {
							$elemMatch: {
								playerId: playerId,
							}
						}
					}, 'name')
					.then(function(documents) {
						_.each(documents, function(doc) {
							delete doc.owners;
						});

						return documents;
					});
					*/
					query = Promise.reject();
					break;
				}
			}

			query.then(function(documents) {
				res.set('Last-Modified', req.player.lastModified);
				res.set('Cache-Control', 'maxAge=86400');
				res.send(documents);
			})
			.catch(function(err) {
				console.error("Failed to query player games", err)
				res.set('Cache-Control', 'no-store');
				res.status(400).send({ error: "Failed to query player games."});
			});
		});

	router.route('/Players/:id/Achievements')
		.get((req, res) => {
			const playerId = req.player._id;
			const orderBy = parseOrderBy(req.query['order-by']);

			debug("get player game achievements", playerId);

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
				res.set('Last-Modified', req.player.lastModified);
				res.set('Cache-Control', 'maxAge=86400');
				res.send(record);
			})
			.catch(function(err) {
				console.error("Failed to query player achievements", err)
				res.set('Cache-Control', 'no-store');
				res.send(400).send({ error: "Failed to query player achievements."});
			});
		});

	return router;
};
