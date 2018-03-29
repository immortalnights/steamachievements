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
		return new Promise(async (resolve, reject) => {
			try
			{
				const queue = new Queue({
					concurrency: 8
				});

				const summary = await this.steam.getSummary(playerId);

				// set the place name for future reference
				this.name = summary.personaname;

				debug("player summary", summary);

				// use the database _id property
				delete summary.steamid;

				console.log("updating player %s (%s)", this.name, playerId);
				await this.db.updatePlayer(playerId, {
					updated: new Date(),
					// resynchronized: new Date(),
					steam: summary
				});

				// collect owned games from steam and registered games from the database
				let [ownedGames, registeredGames] = await Promise.all([ this.steam.getOwnedGames(playerId), this.db.getPlayerGames(playerId, { sort: '_id' }) ]);

				// order owned games (from steam) by app id
				// ownedGames = _.sortBy(ownedGames, 'appid' );

				// index owned and registered games
				const indexedOwnedGames = _.indexBy(ownedGames, 'appid');
				const indexedRegisteredGames = _.indexBy(registeredGames, '_id');

				// console.log("ownedGames=", ownedGames[0]);
				// console.log("registeredGames=", registeredGames[0]);

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
					}).then(function() { resolve(playerId); });
				});

				// passing a callback to start will cause the queue to stop on error
				queue.start();
			}
			catch (err)
			{
				console.error("Failed to resynchronize player '%s' (%s)", this.name, this.id, err);
				reject(err);
			}
		});
	}

	async registerGame(game)
	{
		try
		{
			// get the achievements for the new game
			// FIXME the database might already have this game, perhaps it would be better to
			// check before loading the schema from Steam.
			let schema;

			try
			{
				schema = await this.steam.getSchemaForGame(game.appid);
			}
			catch (err)
			{
				console.error("Failed to get schema for game '%s'", game.appid);
			}

			schema = schema || {};

			if (schema.availableGameStats)
			{
				// discard all the other schema properties
				schema = schema.availableGameStats;
			}
			else
			{
				schema.achievements = false;
			}

			const result = await this.db.registerGame(this.id, game, schema);
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
				await this.updatePlayerAchievementsForGame(game);
			}

			console.log("Registered '%s' (%s) for '%s'", game.name, game.appid, this.name);
		}
		catch (err)
		{
			console.log("Failed to register game '%s' (%s) for '%s'", game.name, game.appid, this.name);
			console.error(err);

			throw err;
		}
	}

	async updateRegisteredGame(game)
	{
		try
		{
			await this.db.updateGamePlaytime(game.appid, this.id, game.playtime_forever, game.playtime_2weeks);

			// Update player achievements for this game
			await this.updatePlayerAchievementsForGame(game);
		}
		catch (err)
		{
			console.log("Failed to update registered game '%s' (%i) for '%s'", game.name, game.appid, this.name);
			console.error(err);
		}
	}

	async updatePlayerAchievementsForGame(game)
	{
		try
		{
			const achievements = await this.steam.getPlayerAchievementsForGame(this.id, game.appid);

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
				await Promise.all(updates);
				console.log("Saved game achievements '%s' (%s) to database", game.name, game.appid);


				const perfect = _.every(achievements, function(achievement) {
					return achievement.achieved;
				});

				if (perfect)
				{
					console.log("'%s' has completed all achievements in '%s' (%s)", this.name, game.name, game.appid);
					await this.db.setPerfectGame(game.appid, this.id);
				}
			}
		}
		catch (err)
		{
			console.log("Failed to update game achievements '%s' (%s) for %s", game.name, game.appid, this.name);
			console.error(err);
			throw err;
		}
	}
}