'use strict';

const debug = require('debug')('service');
const _ = require('underscore');
const moment = require('moment');
const Queue = require('queue');
const Player = require('./player');


// 
const SCHEDULE = 10 * 1000;

const taskFactory = function(playerId, database, steam) {
	console.log("build task")
	return function() {
		return new Promise(function(resolve, reject) {
			const player = new Player(playerId, database, steam);

			player.run().
			then(function() {
				console.log("completed resynchronization of", playerId)
				resolve(playerId);
			})
			.catch(function(err) {
				console.error("failed to resynchronize player", playerId);
				console.error(err);
				reject(err);
			});
		});
	}
};

const canResynchronize = function(doc) {
	let result = false;

	if (_.isObject(doc))
	{
		if (!doc.resynchronized)
		{
			result = true;
			console.log("player", doc._id, "has never been resynchronized");
		}
		else
		{
			const twoHoursAgo = moment().add(-2, 'hours');
			const lastResynchronized = moment(doc.resynchronized);

			result = (doc.state === 'ok' && lastResynchronized > twoHoursAgo);
			console.log("player", doc._id, "last resynchronized", String(lastResynchronized), "(", String(twoHoursAgo), ")", result);
		}
	}

	return result;
}

module.exports = class Service {
	constructor(db, steam)
	{
		this.queue = new Queue({
			concurrency: 3
		});

		this.db = db;
		this.steam = steam;
	}

	run()
	{
		(async () => {
			console.log("executing start up tasks")
			await this.db.resetPendingResynchronizations();
		})();

		const scheduleTask = async function() {
			console.log("executing schedule task");

			try
			{
				await this.resynchronizePlayers()
				.catch(function() {});

				await this.resynchronizeGames();
			}
			catch (exception)
			{
				console.error(exception);
			}

			setTimeout(scheduleTask.bind(this), SCHEDULE);
		};

		// setTimeout(() => {
		// 	this.resynchronizePlayer('76561197993451745').catch(function() {});
		// 	this.resynchronizePlayer('76561197993451745').catch(function() {});
		// 	this.resynchronizePlayer('76561197993451745').catch(function() {});
		// }, 5000);

		scheduleTask.call(this);
	}

	// identifies players which require updating, queues the resynchronizations and starts the queue
	// @private
	resynchronizePlayers()
	{
		return new Promise(async (resolve, reject) => {
			const yesterday = moment().add(-1, 'days');

			try
			{
				const documents = await this.db.getPlayers(/*{ $or: [ { resynchronized: { "$lt": yesterday.toDate() } } ]}*/);

				console.log("found %i profile(s) which requires updating", documents.length, _.pluck(documents, '_id'));

				let starting = [];
				documents.forEach((doc, index) => {
					starting.push(this.queuePlayerResynchronization(doc._id));
				});

				console.log("ok")

				// start the queue, resolve the promise once completed
				console.log("start processing queue", this.queue.length);
				this.queue.start(function() {
					console.log("queue completed");

					// FIXME this  will not trigger if players continue to trigger resynchronizations, which could mean,
					// under a high load, or malicious users, continue triggers would prevent the automatic resynchronization
					// of other players
					resolve();
				});
			}
			catch (exception)
			{
				console.log("failed to resynchronize players", exception);
				reject(exception);
			}
		});
	}

	// resynchronize a single player, starts processing the queue immediately
	resynchronizePlayer(playerId)
	{
		return new Promise((resolve, reject) => {
			try
			{
				this.queuePlayerResynchronization(playerId);

				// start the queue, (no effect if already running)
				console.log("start processing queue");
				this.queue.start(() => {
					console.log("individual resynchronization completed", playerId);
					resolve();
				});
			}
			catch (err)
			{
				console.log("failed", err);
				reject(err);
			}
		});
	}

	// @private
	async queuePlayerResynchronization(playerId)
	{
		// find and update the player record.
		// if the player does not exist, null will be returned
		// player document is _before_ the modification, so can be used to
		// determine if the resynchronization is permitted
		let result = await this.db.triggerResynchronizationForPlayer(playerId);

		if (result && result.value)
		{
			if (canResynchronize(result.value))
			{
				this.queue.push(taskFactory(playerId, this.db, this.steam));
			}
			else
			{
				throw new Error("Cannot resynchronize player '" + playerId + "' right now");
			}
		}
		else
		{
			throw new Error("Player '" + playerId + "' does not exist");
		}
	}

	// fetch schema for recently registered games or games flagged as requiring an update
	// resynchronize global achievements for a game if it has not been updated in a week or has been flagged
	resynchronizeGames()
	{
		return new Promise((resolve, reject) => {
			resolve();
		});
	}

	async _registerGame(playerId, game)
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

	async _updateRegisteredGame(playerId, game)
	{
		await this.db.updateGamePlaytime(game.appid, playerId, game.playtime_forever, game.playtime_2weeks);

		// Update player achievements for this game
		await this.updatePlayerAchievementsForGame(playerId, game.appid);
	}

	async _updateGlobalAchievementsForGame(gameId)
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

	async _updatePlayerAchievementsForGame(playerId, gameId)
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

	async _refreshPlayer(playerId)
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
