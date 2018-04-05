'use strict';

const debug = require('debug')('player');
const Queue = require('queue');
const _ = require('underscore');
const moment = require('moment');

module.exports = class Player {
	constructor(id, db, steam)
	{
		this.id = id;
		this.name = null;
		this.db = db;
		this.steam = steam;
	}

	run()
	{
		const playerId = this.id;
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
						console.log("'%s' (%s) has new game '%s' (%i)", this.name, playerId, ownedGame.name, ownedGame.appid);

						queue.push(_.bind(this.registerGame, this, ownedGame));

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
							console.log("'%s' (%s) has played '%s' (%i)", this.name, playerId, ownedGame.name, ownedGame.appid);

							queue.push(_.bind(this.updateRegisteredGame, this, ownedGame));

							++playedGames;
						}
						else
						{
							// not played, skip
						}
					}
				});

				console.log("Have %i games to update for '%s' (%i new, %i played)", queue.length, this.name, newGames, playedGames);
			}

			this.steam.getSummary(playerId)
			.then((summary) => {
				// set the place name for future reference
				this.name = summary.personaname;

				debug("Reteived player summary", summary);

				// use the database _id property
				delete summary.steamid;

				console.log("Updating player %s (%s)", this.name, playerId);
				this.db.updatePlayer(playerId, {
					personaname: summary.personaname,
					updated: new Date(),
					steam: _.omit(summary, 'steamid', 'personaname')
				});

				// collect owned games from steam and registered games from the database
				return Promise.all([ this.steam.getOwnedGames(playerId), this.db.getPlayerGames(playerId, '_id') ])
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
							console.log("Progress:", queue.length, "ramaining games to register");

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

						console.trace("Job failed");
					});

					queue.once('end', (err) => {
						this.db.updatePlayer(playerId, {
							resynchronized: new Date(),
						}).then(function() {
							console.log("Updated player resynchronization time");
							resolve(playerId);
						});
					});

					// passing a callback to start will cause the queue to stop on error
					queue.start();
				})
				.catch(reject);
			})
			.catch((err) => {
				console.error("Failed to resynchronize player '%s' (%s)", this.name, this.id, err);
				reject(err);
			});
		});
	}

	registerGame(game)
	{
		return new Promise((resolve, reject) => {
			// get the achievements for the new game
			// FIXME the database might already have this game, perhaps it would be better to
			// check before loading the schema from Steam.
			let schema;

			this.steam.getSchemaForGame(game.appid)
			.then((schema) => {
				console.log("Loaded schema for game", game.appid);

				// only keep stats and achievements
				schema = schema.availableGameStats || {};

				// Might only have stats so have to explicity check for achievements
				if (schema.achievements)
				{
					console.log("Game has achievements");
				}
				else
				{
					console.log("Game does not have achievements");
					schema.achievements = false;
				}

				this.db.registerGame(this.id, game, schema)
				.then((result) => {
					console.log("Saved game '%s' (%s) to database", game.name, game.appid);

					// update game achievements, if applicable
					if (_.isEmpty(schema.achievements))
					{
						console.log("Game '%s' does not have any achievements", game.name);
					}
					else if (!game.playtime_forever)
					{
						console.log("Game '%s' has not been played", game.name);
					}
					else
					{
						return this.updatePlayerAchievementsForGame(game);
					}
				})
				.then(function() {
					resolve(game);
				});
			})
			.catch((err) => {
				console.log("Failed to get schema for game '%s'", game.appid);
				console.error(err);

				let schema = {
					achievements: false
				};

				this.db.registerGame(this.id, game, schema)
				.then(function() {
					resolve(game);
				});
				console.log("Registered '%s' (%s) for '%s'", game.name, game.appid, this.name);
			});
		});
	}

	updateRegisteredGame(game)
	{
		return new Promise((resolve, reject) => {
			this.db.updateGamePlaytime(game.appid, this.id, game.playtime_forever, game.playtime_2weeks)
			.then(() => {
				console.log("Updated game playtime", game.appid, this.id);

				// Update player achievements for this game
				return this.updatePlayerAchievementsForGame(game)
				.then(() => {
					console.log("Updated game achievements");
					resolve(game);
				});
			})
			.catch(reject);
		});

		// catch (err)
		// {
		// 	console.log("Failed to update registered game '%s' (%i) for '%s'", game.name, game.appid, this.name);
		// 	console.error(err);
		// }
	}

	updatePlayerAchievementsForGame(game)
	{
		return new Promise((resolve, reject) => {
			this.steam.getPlayerAchievementsForGame(this.id, game.appid)
			.then((achievements) => {
				console.log("Reterived player achievements for game", game.appid);

				if (!_.isEmpty(achievements))
				{
					let updates = [];
					_.each(achievements, (achievement) => {
						if (achievement.achieved)
						{
							const unlocktime = achievement.unlocktime || true;
							updates.push(this.db.setGameAchievementAchieved(game.appid, this.id, achievement.apiname, unlocktime));
						}
					});

					console.log("'%s' has unlocked %i achievement(s) in '%s' (%s)", this.name, updates.length, game.name, game.appid);

					// FIXME use a queue, else one failure will void all updates
					return Promise.all(updates)
					.then((results) => {
						console.log("Saved game achievements '%s' (%s) to database", game.name, game.appid);

						const perfect = _.every(achievements, function(achievement) {
							return achievement.achieved;
						});

						if (perfect)
						{
							console.log("'%s' has completed all achievements in '%s' (%s)", this.name, game.name, game.appid);
							return this.db.setPerfectGame(game.appid, this.id);
						}
					});
				}
			})
			.then(() => {
				console.log("Done updating game");
				resolve(game);
			})
			.catch(reject);
		});
	}
}