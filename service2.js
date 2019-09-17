'use strict';

const debug = require('debug')('service');
const _ = require('underscore');
const moment = require('moment');
const Queue = require('better-queue');
const Player = require('./lib/player');
const Game = require('./lib/game');
const database = require('./lib/databaseconnection');

// check every hour
const SCHEDULE = 60 * 60 * 1000;

module.exports = class Service {
	constructor()
	{
		this.queue = new Queue(async function(task, cb) {
			debug("Processing task '%s'", task.id);
			const result = await task.fn(task.ref);

			// If an error is returned, fail the task, otherwise it's successful
			cb(result instanceof Error ? result : null, result);
		}, {
			filter: (task, cb) => {
				debug("Filter '%s'", task.id);
				cb(null, task);
			},
			precondition: (cb) => {
				cb(null, true);
			},
			// must be one for process fn
			batchSize: 1,
			concurrent: 3
		});

		// this.queue.on('task_queued', function() {
		// 	debug("Queue event 'task_queued' %o", arguments);
		// });
		// this.queue.on('task_accepted', function() {
		// 	debug("Queue event 'task_accepted' %o", arguments);
		// });
		// this.queue.on('task_started', function() {
		// 	debug("Queue event 'task_started' %o", arguments);
		// });
		this.queue.on('task_finish', function() {
			debug("Queue event 'task_finish' %o", arguments);
		});
		this.queue.on('task_failed', function() {
			debug("Queue event 'task_failed' %o", arguments);
		});
		// this.queue.on('task_progress', function() {
		// 	debug("Queue event 'task_progress' %o", arguments);
		// });
		// this.queue.on('batch_finish', function() {
		// 	debug("Queue event 'batch_finish' %o", arguments);
		// });
		// this.queue.on('batch_failed', function() {
		// 	debug("Queue event 'batch_failed' %o", arguments);
		// });
		// this.queue.on('batch_progress', function() {
		// 	debug("Queue event 'batch_progress' %o", arguments);
		// });

		this.timeout = null;
	}

	run()
	{
		const scheduleTask = async () => {
			debug("Executing schedule task");

			try
			{
				await this.resynchronizePlayers();
				await this.resynchronizeGames();
			}
			catch (err)
			{
				console.error("Failed to execute schedule tasks", err);
			}

			// setTimeout(scheduleTask, SCHEDULE);
		};


		// scheduleTask();
	}

	queueResynchronizePlayer(id)
	{
		return this.queue.push({
			id: 'resynchronize_player_' + doc._id,
			ref: doc._id,
			fn: this.resynchronizePlayer.bind(this)
		});
	}

	queueResynchronizeGame(id)
	{
		return this.queue.push({
			id: 'resynchronize_game_' + doc.id,
			ref: doc.id,
			fn: this.resynchronizeGame.bind(this)
		});
	}

	async resynchronizePlayers()
	{
		const yesterday = moment().add(-1, 'days');
		
		return database.instance.getPlayers({
			'steam.communityvisibilitystate': 3,
				$or: [{
				resynchronized: 'never'
			}, {
				resynchronized: { "$lt": yesterday.toDate() }
			}]
		})
		.then((documents) => {
			debug("Found %i player(s) which requires resynchronization", documents.length);

			documents.forEach((doc) => {
				// debug(doc);
				this.queue.push({
					id: 'resynchronize_player_' + doc._id,
					ref: doc._id,
					fn: this.resynchronizePlayer.bind(this)
				});
			});
		});
	}

	async resynchronizeGames()
	{
		const variant = Math.floor(Math.random() * Math.floor(14)) - 7;
		const dueDate = moment().subtract(28 + variant, 'days').add();
		const query = {
			$or: [{
				resynchronized: 'never'
			}, {
				resynchronized: { "$lt": dueDate.toDate() }
			}]
		};

		return database.instance.getGames(query)
		.then((documents) => {
			debug("Found %i game(s) which requires resynchronization", documents.length);

			documents.forEach((doc) => {
				// debug(doc);
				this.queue.push({
					id: 'resynchronize_game_' + doc._id,
					ref: doc._id,
					fn: this.resynchronizeGame.bind(this)
				});
			});
		});
	}

	// private
	async resynchronizePlayer(id)
	{
		debug("Resynchronize player '%s'", id);

		const player = new Player(id);

		let result;
		result = await player.load();

		if (result && player.canResynchronize())
		{
			result = await player.update();
		}
		else
		{
			console.log("Cannot resynchronize player '%s'", id);
		}

		return result;
	}

	// private
	async resynchronizeGame(id)
	{
		debug("Resynchronize game '%s'", id);
		return Promise.resolve(1);
	}
};