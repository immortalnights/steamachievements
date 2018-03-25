'use strict';

const debug = require('debug')('player');
const Queue = require('queue');
const _ = require('underscore');
const moment = require('moment');

module.exports = class Player {
	constructor(id, db, steam)
	{
		this.id = id;
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
				debug("player summary", summary);

				// use the database _id property
				delete summary.steamid;

				console.log("updating player %s (%s)", summary.personaname, playerId);
				await this.db.updatePlayer(playerId, {
					update: new Date(),
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

				// Identify new or played games by iterating over the steam result set
				_.each(ownedGames, (ownedGame, index) => {
					// find the appropriate game from the database set (if it exists)
					const registeredGame = indexedRegisteredGames[ownedGame.appid];

					if (!registeredGame)
					{
						// game is not registered for any players
						console.log("%s (%s) has new game '%s' (%i)", summary.personaname, playerId, ownedGame.name, ownedGame.appid);

						queue.push(_.bind(async function(game) {
							await this.registerGame(game);
						}, this, ownedGame));
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
							console.log("%s (%s) has played '%s' (%i)", summary.personaname, playerId, ownedGame.name, ownedGame.appid);

							queue.push(_.bind(async function(game) {
								await this.updateRegisteredGame(game);
							}, this, ownedGame));
						}
						else
						{
							// not played, skip
						}
					}
				});

				console.log("have", queue.length, "games to update");

				let count = 12;
				queue.on('success', function(result, job) {
					--count;

					if (count === 0)
					{
						count = 12;
						console.log("Progress:", queue.length, "ramaining games to register");
					}
				});

				queue.start(() => {
					console.log("Done processing games");

					this.db.updatePlayer(playerId, {
						resynchronized: new Date(),
					}).then(function() { resolve(); });
				});
			}
			catch (exception)
			{
				console.error("Failed to resynchronize player", this.id, exception);
				reject(exception);
			}
		});
	}

	async registerGame(game)
	{
		// get the achievements for the new game
		// FIXME the database might already have this game, perhaps it would be better to
		// check before loading the schema from Steam.
		let schema = await this.steam.getSchemaForGame(game.appid)
		.catch(function(err) {
			console.error("Failed to get schema for game", game.appid);
		});

		schema = schema || {};

		if (schema.availableGameStats)
		{
			schema = schema.availableGameStats;
		}
		else
		{
			schema.achievements = false;
		}

		const result = await this.db.registerGame(this.id, game, schema);

		// update game achievements, if applicable
		if (!_.isEmpty(schema.achievements))
		{
			if (game.playtime_forever)
			{
				await this.updatePlayerAchievementsForGame(game.appid);
			}
		}

		console.log("registered game", game.appid);
	}

	async updateRegisteredGame(game)
	{
		await this.db.updateGamePlaytime(game.appid, this.id, game.playtime_forever, game.playtime_2weeks);

		// Update player achievements for this game
		await this.updatePlayerAchievementsForGame(game.appid);
	}

	async updatePlayerAchievementsForGame(gameId)
	{
		const achievements = await this.steam.getPlayerAchievementsForGame(this.id, gameId);

		if (!_.isEmpty(achievements))
		{
			let updates = [];
			_.each(achievements, (achievement) => {
				if (achievement.achieved)
				{
					const unlocktime = achievement.unlocktime || true;
					updates.push(this.db.setGameAchievementAchieved(gameId, this.id, achievement.apiname, unlocktime));
				}
			});

			const perfect = _.every(achievements, function(achievement) {
				return achievement.achieved;
			});

			console.log("player has unlocked another", updates.length, "achievement(s)");
			await Promise.all(updates);

			if (perfect)
			{
				console.log("setting perfect game", gameId, this.id);
				await this.db.setPerfectGame(gameId, this.id);
			}
		}
	}
}