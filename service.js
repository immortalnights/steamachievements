'use strict';

const debug = require('debug')('service');
const _ = require('underscore');
const moment = require('moment');
const Queue = require('queue');
const Player = require('./lib/player');

//
const SCHEDULE = 10 * 1000;

const taskFactory = function(playerId, database, steam) {
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
		if (!doc.resynchronized || doc.resynchronized === 'never' || doc.resynchronized === 'pending')
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

		this.triggeredResynchronizations = {};
	}

	run()
	{
		(async () => {
			console.log("executing start up tasks")
		})();

		const scheduleTask = async function() {
			console.log("executing schedule task");

			try
			{
				// await this.resynchronizePlayers()
				// .catch(function() {});

				// await this.resynchronizeGames();
			}
			catch (exception)
			{
				console.error("failed to execute schedule tasks", exception);
			}

			setTimeout(scheduleTask.bind(this), SCHEDULE);
		};

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
				const documents = await this.db.getPlayers(/*{ 'steam.communityvisibilitystate': 3, $or: [ { resynchronized: { "$lt": yesterday.toDate() } } ]}*/);

				console.log("found %i profile(s) which requires updating", documents.length, _.pluck(documents, '_id'));

				documents.forEach((doc, index) => {
					this.queue.push(taskFactory(doc._id, this.db, this.steam));
				});

				// start the queue, resolve the promise once completed
				console.log("start processing queue", this.queue.length);
				this.queue.start(function() {
					console.log("queue completed");

					// FIXME this  will not trigger if players continue to trigger resynchronizations, which could mean,
					// under a high load, or due to  malicious users, continuous triggers would prevent the automatic resynchronization
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
			if (this.triggeredResynchronizations[playerId])
			{
				throw new Error("Resynchronization for '" + playerId + "' is already in progress");
			}
			else
			{
				if (this.checkPlayer(playerId))
				{
					this.triggeredResynchronizations[playerId] = true;

					this.queue.push(() => {
						// verify the player can be resynchronized again as they may have already been resynchronized
						// earlier in the queue.
						// try
						// {
							if (this.checkPlayer(playerId))
							{
								// exec factory to get task promise
								return taskFactory(playerId, this.db, this.steam)();
							}
						// }
						// catch (err)
						// {
						// 	return err;
						// }
					});
					// start the queue, (no effect if already running)
					console.log("start processing queue");
					this.queue.start(() => {
						console.log("individual resynchronization completed", playerId);
						delete this.triggeredResynchronizations[playerId];

						resolve();
					});
				}
			}
		});
	}

	async checkPlayer(playerId)
	{
		let doc = await this.db.getPlayers({ _id: playerId });

		if (doc.length !== 1)
		{
			throw new Error("Player '" + playerId + "' does not exist");
		}
		else if (!canResynchronize(doc[0]))
		{
			throw new Error("Cannot resynchronize player '" + playerId + "' right now");
		}

		return true;
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
}
