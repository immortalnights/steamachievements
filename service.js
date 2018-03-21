'use strict';

const debug = require('debug')('service');
const _ = require('underscore');
const moment = require('moment');
const Queue = require('queue');
const Progress = require('progress');

const q = Queue({
	concurrency: 3
});

module.exports = class Service {
	constructor(db, steam)
	{
		this.db = db;
		this.steam = steam;
	}

	run()
	{

	}

	async refreshPlayers()
	{
		const yesterday = moment().add(-1, 'days');

		try
		{
			const documents = await this.db.getPlayers({ $or: [ { resynchronized: { "$lt": yesterday.toDate() } } ]});
			console.log("found %i profile(s) which requires updating", documents.length, _.pluck(documents, '_id'));

			documents.forEach(function(doc, index) {
				q.push(refreshPlayer(doc._id));
			});

			q.on('success', function() {
				// console.log("Job completed.");
			});

			q.on('end', function() {
				console.log("All jobs completed.");
			});

			q.start();
		}
		catch (exception)
		{
			console.error(exception);
		}
	}

	async registerGame(playerId, game)
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

		const result = await this.db.registerGame(playerId, game, schema);
		console.log("registered game", game.appid);

		// update game achievements, if applicable
		if (!_.isEmpty(schema.achievements))
		{
			// If the result is null, the game was not previously registered and the achievement schema will be required
			if (!result.value)
			{
				// Game did not exist, player and global achievements required
				await this.updateGlobalAchievementsForGame(game.appid);
			}

			if (game.playtime_forever)
			{
				await this.updatePlayerAchievementsForGame(playerId, game.appid);
			}
		}
	}

	async updateRegisteredGame(playerId, game)
	{
		await this.db.updateGamePlaytime(game.appid, playerId, game.playtime_forever, game.playtime_2weeks);

		// Update player achievements for this game
		await this.updatePlayerAchievementsForGame(playerId, game.appid);
	}

	async updateGlobalAchievementsForGame(gameId)
	{
		const achievements = await this.steam.getGlobalAchievementPercentagesForGame(gameId);

		if (!_.isEmpty(achievements))
		{
			let updates = [];
			_.each(achievements, (achievement) => {
				updates.push(this.db.setGameAchievementGlobalPercent(gameId, achievement.name, achievement.percent));
			});

			await Promise.all(updates);

			await this.db.setGameResynchronizationTime(gameId);
		}
	}

	async updatePlayerAchievementsForGame(playerId, gameId)
	{
		const achievements = await this.steam.getPlayerAchievementsForGame(playerId, gameId);

		if (!_.isEmpty(achievements))
		{
			let updates = [];
			_.each(achievements, (achievement) => {
				if (achievement.achieved)
				{
					const unlocktime = achievement.unlocktime || true;
					updates.push(this.db.setGameAchievementAchieved(gameId, playerId, achievement.apiname, unlocktime));
				}
			});

			const perfect = _.every(achievements, function(achievement) {
				return achievement.achieved;
			});

			console.log("player has unlocked another", updates.length, "achievement(s)");
			await Promise.all(updates);

			if (perfect)
			{
				console.log("setting perfect game", gameId, playerId);
				await this.db.setPerfectGame(gameId, playerId);
			}

			// await this.db.setGameResynchronizationTime(gameId);
		}
	}

	async refreshPlayer(playerId)
	{
		try
		{
			const summary = await this.steam.getSummary(playerId);
			debug("player summary", summary);

			// use the database id property
			delete summary.steamid;

			console.log("updating player %s (%s)", summary.personaname, playerId);
			await this.db.updatePlayer(playerId, {
				// resynchronized: new Date(),
				steam: summary
			});

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

					this.registerGame(playerId, ownedGame);
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

						this.updateRegisteredGame(playerId, ownedGame);
					}
					else
					{
						// not played, skip
					}
				}
			});

			console.log("Done processing games");
		}
		catch (exception)
		{
			console.error("Failed to refresh player", exception);
		}
	}
}
