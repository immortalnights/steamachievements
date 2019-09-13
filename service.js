'use strict';

const debug = require('debug')('service');
const _ = require('underscore');
const moment = require('moment');
const Queue = require('queue');
const Player = require('./lib/player');
const Game = require('./lib/game');

//
const SCHEDULE = 60 * 60 * 1000;

const resynchronizePlayerFactory = function(playerId, database, steam) {
	return function() {
		return new Promise(function(resolve, reject) {
			const player = new Player(playerId, database, steam);

			player.update()
			.then(function() {
				console.log("Completed resynchronization of", playerId)
				resolve(playerId);
			})
			.catch(function(err) {
				console.error("Failed to resynchronize player", playerId);
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

			result = (doc.state === 'ok' && lastResynchronized < twoHoursAgo);
			console.log("player", doc._id, "last resynchronized", String(lastResynchronized), "(", String(twoHoursAgo), ")", result);

			result = true;
		}
	}

	return result;
}

module.exports = class Service {
	constructor(db, steam)
	{
		this.db = db;
		this.steam = steam;

		this.triggerQueue = new Queue({
			concurrency: 1
		});

		this.triggerQueue.on('success', (result, job) => {
			if (this.triggeredResynchronizations[result])
			{
				console.log("Individual resynchronization completed", result);
				delete this.triggeredResynchronizations[result];
			}
		});

		this.triggeredResynchronizations = {};
	}

	run()
	{
		const scheduleTask = () => {
			console.log("Executing schedule task");

			try
			{
				this.resynchronizePlayers();
				this.resynchronizeGames();
			}
			catch (err)
			{
				console.error("Failed to execute schedule tasks", err);
			}

			setTimeout(scheduleTask, SCHEDULE);
		};

		scheduleTask();
	}

	// identifies players which require updating, queues the resynchronizations and starts the queue
	// @private
	resynchronizePlayers()
	{
		return new Promise((resolve, reject) => {
			let queue = new Queue({
				concurrency: 3
			});

			const yesterday = moment().add(-1, 'days');
			this.db.getPlayers({ 'steam.communityvisibilitystate': 3, resynchronized: { "$lt": yesterday.toDate() }})
			.then((documents) => {
				console.log("found %i player(s) which requires updating", documents.length);

				documents.forEach((doc, index) => {
					queue.push(resynchronizePlayerFactory(doc._id, this.db, this.steam));
				});

				// start the queue, resolve the promise once completed
				// console.log("start processing queue", queue.length);

				// Individual resynchronizations will delay the queue completion
				queue.once('end', function(err) {
					console.log("Player queue completed");
					resolve();
				});

				// passing a callback to start will cause the queue to stop on error
				// If this doesn't appear to do anything, be sure to enable debug logging
				queue.start();
			})
			.catch(function(err) {
				console.error("Failed to resynchronize players", err);
				reject(err);
			});
		});
	}

	// resynchronize a single player, starts processing the queue immediately
	resynchronizePlayer(playerId, force)
	{
		const resynchronizePlayerFactory2 = function(id, db, steam) {
			return () => {
				return new Promise((resolve, reject) => {
					// verify the player can be resynchronized again as they may have already been resynchronized
					// earlier in the queue.
					this.checkPlayer(id)
					.then(() => {
						// exec factory to get task promise
						return resynchronizePlayerFactory(id, db, steam)()
						.then(() => {
							this.resynchronizeGames();
						});
					})
					.then(function() { resolve(id); })
					.catch(function(err) {
						console.log("Failed to begin player resyncrhonization", id);
						console.error(err);
						reject(err);
					});
				});
			}
		}

		// if force, remove the player from the pending resynchronizations
		if (force === true)
		{
			delete this.triggeredResynchronizations[playerId];
		}

		if (this.triggeredResynchronizations[playerId])
		{
			console.log("Resynchronization for '%s' is already in progress", playerId);
		}
		else
		{
			this.checkPlayer(playerId)
			.then(() => {
				// make the player as being resynchronized
				this.triggeredResynchronizations[playerId] = true;

				this.triggerQueue.push(resynchronizePlayerFactory2.call(this, playerId, this.db, this.steam));

				// start the queue, (no effect if already running)
				// console.log("Start processing queue");
				this.triggerQueue.start();
			})
			.catch((err) => {
				console.error("Failed to resynchronize player", playerId, err);
			});
		}
	}

	checkPlayer(playerId)
	{
		return new Promise((resolve, reject) => {
			this.db.getPlayers({ _id: playerId })
			.then(function(documents) {
				if (documents.length !== 1)
				{
					reject(new Error("Player '" + playerId + "' does not exist"));
				}
				else if (!canResynchronize(documents[0]))
				{
					reject(new Error("Cannot resynchronize player '" + playerId + "' right now"));
				}
				else
				{
					resolve();
				}
			});
		});
	}

	resynchronizeGame(id)
	{

	}

	// fetch schema for recently registered games or games flagged as requiring an update
	// resynchronize global achievements for a game if it has not been updated in a week or has been flagged
	resynchronizeGames()
	{
		const resynchronizeGameFactory = function(id, db, steam) {
			return function() {
				return new Promise(function(resolve, reject) {
					try
					{
						const game = new Game(id, db, steam);

						game.update()
						.then(function(game) {
							// Note game name within the Schema is unreliable
							console.log("Completed resynchronization of '%s' (%i)", game.name, game.id)
							resolve(id);
						})
						.catch(function(err) {
							console.error("Failed to resynchronize game", id);
							console.error(err);
							reject(err);
						});
					}
					catch (err)
					{
						console.log("err", err)
						reject(err);
					}
				});
			};
		}

		return new Promise((resolve, reject) => {
			const queue = new Queue({
				concurrency: 3
			});

			const weekAgo = moment().add(-7, 'days');
			const query = {
				$or: [{
					resynchronized: 'never'
				}, {
					resynchronized: { "$lt": weekAgo.toDate() }
				}]
			};

			this.db.getGames(query)
			.then((documents) => {
				console.log("Found %i game(s) which requires updating", documents.length);

				documents.forEach((doc, index) => {
					queue.push(resynchronizeGameFactory(doc._id, this.db, this.steam));
				});

				queue.once('end', function(err) {
					console.log("Game queue completed");
					resolve();
				});

				queue.on('error', function(err, task) {
					console.error("Game resynchronization failed", err);
				});

				// console.log("start processing game queue", queue.length);
				queue.start();
			})
			.catch(function(err) {
				console.error("Failed to resynchronize games", err);
				reject(err);
			});
		});
	}
}
