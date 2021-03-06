'use strict';

const express = require('express');
const debug = require('debug')('router');
const moment = require('moment');
const Player = require('../player');
const _ = require('underscore');
const querystring = require('querystring');
const database = require('../databaseconnection');
const steam = require('../steamconnection');

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

const DEFAULT_RESULT_LIMIT = 12;
module.exports = function(config) {
	const router = express.Router();

	router.route('/Players')
		// get player(s)
		.get((req, res) => {
			database.instance.getPlayers().then((records) => {
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

			console.log("%s View player", moment().toISOString(), data.identifier);

			new Promise(function(resolve, reject) {
				if (data.identifier)
				{
					let result = Player.parsePlayerIdentifier(data.identifier);

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
						steam.instance.resolveVanityUrl(result.vanity)
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
				return database.instance.getPlayers({ _id: steamid })
				.then((records) => {
					let next;
					if (records.length === 1)
					{
						debug("player exists in database");

						// ensure correct cache control for new players
						if (!records[0].resynchronized || records[0].resynchronized === 'never')
						{
							res.set('Last-Modified', moment().toDate().toUTCString());
							res.set('Cache-Control', 'no-store');
						}
						else
						{
							res.set('Last-Modified', moment(records[0].resynchronized).toDate().toUTCString());
							res.set('Cache-Control', 'max-age=' + config.cacheMaxAge);
						}

						res.send(records[0]);
					}
					else
					{
						debug("player does not exist in database, load steam summary");

						throw "Not accepting new users at this time.";
						/*
						return steam.instance.getSummary(steamid)
						.then(function(summary) {
							// Can receive a success response, but not have any data
							if (summary.communityvisibilitystate !== 3)
							{
								throw "Steam player does not have a public profile";
							}
							else if (summary && summary.steamid)
							{
								let player = {
									_id: summary.steamid,
									personaname: summary.personaname,
									added: new Date(),
									resynchronized: 'never',
									steam: _.pick(summary, 'avatarfull', 'profileurl', 'communityvisibilitystate')
								};
								console.log("new player", player);

								debug("Loaded steam summary, save player");
								return database.instance.addPlayer(player)
								.then(function() {
									debug("Successfully saved player");

									// notify the parent process (the service) of the new registration so it can be resynchronized immediately
									req.notifier.emit('resynchronize', { resource: 'player', id: summary.steamid });

									res.set('Last-Modified', new Date().toUTCString());
									res.set('Cache-Control', 'max-age=' + config.cacheMaxAge);
									res.status(201).send(player);
								});
							}
							else
							{
								throw "Steam player does not exist";
							}
						});
						*/
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

		database.instance.getPlayers({ _id: playerId })
		.then(function(records) {
			if (records.length === 1)
			{
				req.player = records[0];
				req.player.lastModified = moment();
				if (req.player.resynchronized && req.player.resynchronized !== 'never')
				{
					req.player.lastModified = moment(req.player.resynchronized).toDate().toUTCString();
				}
				else
				{
					req.player.lastModified = moment(0);
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
			res.set('Cache-Control', 'max-age=' + config.timers.cacheMaxAge);
			res.send(req.player);
		});

	router.route('/Players/:id/Resynchronize/invoke')
		.put((req, res) => {
			const playerId = req.player._id;

			debug("Recieved player resynchronization request", playerId);
			req.notifier.emit('resynchronize', { resource: 'player', id: playerId });

			res.set('Cache-Control', 'no-store');
			res.status(202).send({});
		});

	router.route('/Players/:id/Summary')
		.get((req, res) => {
			const playerId = req.player._id;

			Promise.all([
				database.instance.getPlayerGameSummary(playerId),
				database.instance.getPlayerAchievementSummary(playerId),
				database.instance.getPlayerRecentGames(playerId, 3),
				database.instance.getPlayerRecentAchievements(playerId, 3),
				database.instance.getPlayerFriends(playerId)
			])
			.then(function(data) {
				res.set('Last-Modified', req.player.lastModified);
				res.set('Cache-Control', 'max-age=' + config.timers.cacheMaxAge);
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
			return database.instance.getPlayerFriends(playerId)
			.then(function(friends) {

				// Filter unknown friends
				let knownFriends = _.filter(friends, function(friend) {
					return !_.isEmpty(friend.player);
				});

				// Optimize data
				knownFriends = _.map(knownFriends, function(friend) {
					let player = {};
					_.extend(player, _.pick(friend.player[0], '_id', 'personaname'));
					_.extend(player, _.pick(friend.player[0].steam, 'profilestate', 'avatarfull', 'profileurl', 'lastlogoff'));
					_.extend(player, _.pick(friend.friend, 'friend_since'));
					return player;
				});

				res.set('Last-Modified', req.player.lastModified);
				res.set('Cache-Control', 'max-age=' + config.timers.cacheMaxAge);
				res.send(knownFriends);
			});
		});

	router.route('/Players/:id/Games')
		.get((req, res) => {
			const playerId = req.player._id;
			const queryString = querystring.parse(req.query['query']);
			const orderBy = parseOrderBy(req.query['order-by']);

			let query;
			switch (orderBy.key)
			{
				case 'percent':
				{
					query = database.instance.getGameCompletionPercentage(playerId, orderBy.order, DEFAULT_RESULT_LIMIT);
					break;
				}
				case 'globalPercentage':
				{
					query = database.instance.getGameGlobalPercentage(playerId, orderBy.order, DEFAULT_RESULT_LIMIT);
					break;
				}
				case 'recent':
				{
					query = database.instance.getPlayerRecentGames(playerId, DEFAULT_RESULT_LIMIT)
					break;
				}
				default:
				{
					switch (Object.keys(queryString)[0])
					{
						case 'perfect':
						{
							query = database.instance.getPlayerGames({
								owners: {
									$elemMatch: {
										playerId: playerId,
										perfect: { $eq: (queryString['perfect'].toLowerCase() === 'true') }
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
						default:
						{
							query = Promise.reject("Cannot get player games without filter");
							break;
						}
					}
					break;
				}
			}

			query.then(function(documents) {
				res.set('Last-Modified', req.player.lastModified);
				res.set('Cache-Control', 'max-age=' + config.timers.cacheMaxAge);
				res.send(documents);
			})
			.catch(function(err) {
				console.error("Failed to query player games", err);
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
					query = database.instance.getAchievementsByGlobalPercentage(playerId, orderBy.order, DEFAULT_RESULT_LIMIT);
					break;
				}
				default:
				{
					query = database.instance.getPlayerRecentAchievements(playerId, 25);
					break;
				}
			}

			query.then(function(record) {
				res.set('Last-Modified', req.player.lastModified);
				res.set('Cache-Control', 'max-age=' + config.timers.cacheMaxAge);
				res.send(record);
			})
			.catch(function(err) {
				console.error("Failed to query player achievements", err)
				res.set('Cache-Control', 'no-store');
				res.send(400).send({ error: "Failed to query player achievements."});
			});
		});

	return router;
}

