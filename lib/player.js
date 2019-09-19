'use strict';

const debug = require('debug')('player');
const Queue = require('queue');
const _ = require('underscore');
const moment = require('moment');
const database = require('./databaseconnection');
const steam = require('./steamconnection');
const Events = require('events');

module.exports = class Player extends Events.EventEmitter {
	constructor(id)
	{
		super();
		this._id = id;
	}

	static parsePlayerIdentifier(identifier)
	{
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

	load()
	{
		return database.instance.getPlayers({ _id: this._id })
		.then((documents) => {
			console.assert(documents.length === 1 && documents[0]._id === this._id, "Unexpected response from getPlayers");

			Object.assign(this, documents[0]);
			debug("Loaded player '%s' (%s) data from database", this.personaname, this._id);
			return true;
		});
	}

	canResynchronize()
	{
		let ok;
		// Check that the player record has not already been resynchronized recently
		if (!this.resynchronized || this.resynchronized === 'never' || this.resynchronized === 'pending')
		{
			debug("Player '%s' has never been resynchronized", this._id);
			ok = true;
		}
		else
		{
			const fiveMinutesAgo = moment().add(-5, 'minute');
			const lastResynchronized = moment(this.resynchronized);

			ok = (lastResynchronized < fiveMinutesAgo);

			debug("'%s' last resynchronized at %s (due %s)", this._id, lastResynchronized, fiveMinutesAgo);
			if (ok)
			{
				debug("Will resynchronize '%s' now", this._id);
			}
			else
			{
				debug("Will not resynchronize '%s'", this._id);
			}
		}

		return ok;
	}

	async update()
	{
		debug("Loading player '%s' (%s) profile summary", this.personaname, this._id);

		try
		{
			const summary = await steam.instance.getSummary(this._id);

			debug("Reteived player summary %o", summary);
			let profile = {
				personaname: summary.personaname,
				updated: new Date(),
				steam: _.omit(summary, 'steamid', 'personaname')
			};

			const friends = await steam.instance.getFriends(this._id);

			if (friends)
			{
				// keep selected properties
				profile.friends = _.map(friends, function(friend) {
					return _.pick(friend, 'steamid', 'friend_since');
				});
			}

			debug("Updating player '%s' (%s)", this.personaname, this._id);
			await database.instance.updatePlayer(this._id, profile);

			debug("Resynchronizing player games");
			const ownedGames = await steam.instance.getOwnedGames(this._id);
			const registeredGames = await database.instance.getPlayerGames(this._id, '_id');
			const indexedRegisteredGames = _.indexBy(registeredGames, '_id');

			let newGames = 0;
			let playedGames = 0;

			// Identify new or played games by iterating over the steam result set
			_.each(ownedGames, async (ownedGame, index) => {
				// find the appropriate game from the database set (if it exists)
				const registeredGame = indexedRegisteredGames[ownedGame.appid];

				if (!registeredGame)
				{
					// game is not registered for any players
					debug("'%s' (%s) has new game '%s' (%i)", this.personaname, this._id, ownedGame.name, ownedGame.appid);

					++newGames;

					await this.registerGame(ownedGame);
				}
				else
				{
					// get player owner information
					const registeredOwner = _.findWhere(registeredGame.owners, { playerId: this._id });

					if (!registeredOwner)
					{
						console.error("Failed to find registered owner in registered game data", this._id, registeredGame.owners);
					}
					else if (ownedGame.playtime_forever !== registeredOwner.playtime_forever)
					{
						// game has been played by this player
						debug("'%s' (%s) has played '%s' (%i)", this.personaname, this._id, ownedGame.name, ownedGame.appid);

						++playedGames;

						await this.updateRegisteredGame(ownedGame);
					}
					else
					{
						// not played, skip
					}
				}
			});

			debug("Updated games for '%s' (%i new, %i played)", this.personaname, newGames, playedGames);
		}
		catch (err)
		{
			console.error("Failed to load player summary");
			console.error(err);
		}

		// update the database so the resync has been recorded
		await database.instance.updatePlayer(this._id, {
			updated: new Date(),
			resynchronized: new Date()
		});

		return
		const playerId = this._id;
		return new Promise((resolve, reject) => {
			const queueGames = function(queue, ownedGames, indexedRegisteredGames) {
				let newGames = 0;
				let playedGames = 0;
				// Identify new or played games by iterating over the steam result set
				_.each(ownedGames, (ownedGame, index) => {
					// find the appropriate game from the database set (if it exists)
					const registeredGame = indexedRegisteredGames[ownedGame.appid];

					if (!registeredGame)
					{
						// game is not registered for any players
						debug("'%s' (%s) has new game '%s' (%i)", this.personaname, playerId, ownedGame.name, ownedGame.appid);

						this.registerGame(ownedGame);

						++newGames;
					}
					else
					{
						// get player owner information
						const registeredOwner = _.findWhere(registeredGame.owners, { playerId: playerId });

						if (!registeredOwner)
						{
							console.error("Failed to find registered owner in registered game data", playerId, registeredGame.owners);
						}
						else if (ownedGame.playtime_forever !== registeredOwner.playtime_forever)
						{
							// game has been played by this player
							debug("'%s' (%s) has played '%s' (%i)", this.personaname, playerId, ownedGame.name, ownedGame.appid);

							this.updateRegisteredGame(ownedGame);

							++playedGames;
						}
						else
						{
							// not played, skip
						}
					}
				});

				debug("Have %i games to update for '%s' (%i new, %i played)", queue.length, this.personaname, newGames, playedGames);
			}

			debug("Loading player '%s' profile summary", this._id);
			steam.instance.getSummary(playerId)
			.then((summary) => {
				// set the place name for future reference
				this.personaname = summary.personaname;

				debug("Reteived player summary %o", summary);

				// use the database _id property
				delete summary.steamid;

				debug("Updating player '%s' (%s)", this.personaname, playerId);
				database.instance.updatePlayer(playerId, {
					personaname: summary.personaname,
					updated: new Date(),
					steam: _.omit(summary, 'steamid', 'personaname')
				});

				// collect owned games from steam and registered games from the database
				return Promise.all([ steam.instance.getOwnedGames(playerId), database.instance.getPlayerGames(playerId, '_id') ])
				.then(([ownedGames, registeredGames]) => {
					// order owned games (from steam) by app id
					// ownedGames = _.sortBy(ownedGames, 'appid' );

					// index owned and registered games
					const indexedOwnedGames = _.indexBy(ownedGames, 'appid');
					const indexedRegisteredGames = _.indexBy(registeredGames, '_id');

					// console.log("ownedGames=", ownedGames[0]);
					// console.log("registeredGames=", registeredGames[0]);

					const queue = new Queue({
						concurrency: 8
					});

					queueGames.call(this, queue, ownedGames, indexedRegisteredGames);

					let status;
					const resetStatus = function() {
						return _.after(12, function() {
							debug("Progress:", queue.length, "ramaining games to register");

							status = resetStatus();
						});
					};

					let count;
					status = resetStatus();

					queue.on('success', function(result, job) {
						++count;
						status();
					});

					queue.on('error', function(result, job) {
						++count;
						status();

						console.trace("Job failed", result);
						debug(job.toString());
					});

					queue.once('end', (err) => {
						database.instance.updatePlayer(playerId, {
							resynchronized: new Date(),
						}).then(function() {
							debug("Updated player resynchronization time");
							resolve(playerId);
						});
					});

					// passing a callback to start will cause the queue to stop on error
					queue.start();
				})
				.catch(reject);
			})
			.then(() => {
				return steam.instance.getFriends(playerId)
				.then((friends) => {
					// keep selected properties
					friends = _.map(friends, function(friend) {
						return _.pick(friend, 'steamid', 'friend_since');
					});

					return database.instance.updatePlayer(playerId, {
						friends: friends
					});
				})
				.catch(function() {
					console.warn("Failed to update friends for", playerId);
				})
			})
			.catch((err) => {
				console.error("Failed to resynchronize player '%s' (%s)", this.personaname, this._id, err);
				reject(err);
			});
		});
	}

	async registerGame(game)
	{
		// register the game to the player with only the information currently available.
		let schema = {
			achievements: false,
			resynchronized: 'never'
		};

		await database.instance.registerGame(this._id, game, schema);

		// notify the Service to resynchronize the new game
		this.emit('resynchronize_game', {
			id: 'resychronize_game_' + game.appid,
			args: [game.appid],
			fn: null
		});

		// return new Promise((resolve, reject) => {
		// 	// get the achievements for the new game
		// 	// FIXME the database might already have this game, perhaps it would be better to
		// 	// check before loading the schema from Steam.
		// 	let schema;

		// 	steam.instance.getSchemaForGame(game.appid)
		// 	.then((schema) => {
		// 		debug("Loaded schema for game", game.appid);

		// 		// only keep stats and achievements
		// 		schema = schema.availableGameStats || {};

		// 		// Might only have stats so have to explicity check for achievements
		// 		if (schema.achievements)
		// 		{
		// 			debug("Game has achievements");
		// 		}
		// 		else
		// 		{
		// 			debug("Game does not have achievements");
		// 			schema.achievements = false;
		// 		}

		// 		database.instance.registerGame(this._id, game, schema)
		// 		.then((result) => {
		// 			debug("Saved game '%s' (%s) to database", game.name, game.appid);

		// 			// update game achievements, if applicable
		// 			if (_.isEmpty(schema.achievements))
		// 			{
		// 				debug("Game '%s' does not have any achievements", game.name);
		// 			}
		// 			else if (!game.playtime_forever)
		// 			{
		// 				debug("Game '%s' has not been played", game.name);
		// 			}
		// 			else
		// 			{
		// 				// this.emit('event', ownedGame);
		// 				// return this.updatePlayerAchievementsForGame(game);
		// 			}
		// 		})
		// 		.then(function() {
		// 			resolve(game);
		// 		});
		// 	})
		// 	.catch((err) => {
		// 		debug("Failed to get schema for game '%s'", game.appid);
		// 		console.error(err);

		// 		let schema = {
		// 			achievements: false
		// 		};

		// 		database.instance.registerGame(this._id, game, schema)
		// 		.then(function() {
		// 			resolve(game);
		// 		});
		// 		debug("Registered '%s' (%s) for '%s'", game.name, game.appid, this.personaname);
		// 	});
		// });
	}

	async updateRegisteredGame(game)
	{
		await database.instance.updateGamePlaytime(game.appid, this._id, game.playtime_forever, game.playtime_2weeks)

		debug("Updated game playtime", game.appid, this._id);

		this.emit('resynchronize_game_achievements', {
			id: 'resynchronize_player_' + this._id + '_game_' + game.appid,
			args: [this._id, game.appid],
			fn: null
		});
	}

	updatePlayerAchievementsForGame(game)
	{
		return new Promise((resolve, reject) => {
			steam.instance.getPlayerAchievementsForGame(this._id, game.appid)
			.then((achievements) => {
				debug("Reterived player achievements for game", game.appid);

				if (!_.isEmpty(achievements))
				{
					let updates = [];
					_.each(achievements, (achievement) => {
						if (achievement.achieved)
						{
							const unlocktime = achievement.unlocktime || true;
							updates.push(database.instance.setGameAchievementAchieved(game.appid, this._id, achievement.apiname, unlocktime));
						}
					});

					debug("'%s' has unlocked %i achievement(s) in '%s' (%s)", this.personaname, updates.length, game.name, game.appid);

					// FIXME use a queue, else one failure will void all updates
					return Promise.all(updates)
					.then((results) => {
						debug("Saved game achievements '%s' (%s) to database", game.name, game.appid);

						const perfect = _.every(achievements, function(achievement) {
							return achievement.achieved;
						});

						if (perfect)
						{
							debug("'%s' has completed all achievements in '%s' (%s)", this.personaname, game.name, game.appid);
							return database.instance.setPerfectGame(game.appid, this._id);
						}
					});
				}
			})
			.then(() => {
				debug("Done updating game");
				resolve(game);
			})
			.catch(reject);
		});
	}
};
