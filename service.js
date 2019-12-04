'use strict';

const debug = require('debug')('service');
const _ = require('underscore');
const moment = require('moment');
const Queue = require('better-queue');
const Player = require('./lib/player');
const Game = require('./lib/game');
const database = require('./lib/databaseconnection');

module.exports = class Service {
	constructor(config)
	{
		this.config = config;
		this.timer = null;
		this.queue = new Queue(async function(task, cb) {
			debug("Processing task '%s'", task.id);
			const result = await task.fn(...task.args);

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
			concurrent: 3,
			afterProcessDelay: 10,
		});

		// this.queue.on('task_queued', function() {
		// 	debug("Queue event 'task_queued' %o", arguments);
		// });
		// this.queue.on('task_accepted', function() {
		// 	debug("Queue event 'task_accepted' %o", arguments);
		// });
		this.queue.on('task_started', function() {
			debug("Queue event 'task_started' %o", arguments);
		});
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

	// periodically resynchronize players
	start()
	{
		const scheduleTask = async () => {
			debug(`${moment().toISOString()} Executing schedule task`);

			try
			{
				await this.resynchronizePlayers();
			}
			catch (err)
			{
				console.error(`${moment().toISOString()} Failed to execute schedule tasks`, err);
			}

			this.timer = setTimeout(scheduleTask, this.config.timers.serviceTimer);
		};

		scheduleTask();
	}

	stop()
	{
		clearTimeout(this.timer);
	}

	resynchronizePlayers()
	{
		Player.check(this.config.timers.playerResynchronization).then((documents) => {
			debug("Found %i player(s) which requires resynchronization", documents.length);

			documents.forEach((doc) => {
				// debug(doc);
				this.queue.push({
					id: 'resynchronize_player_' + doc._id,
					args: [doc._id],
					fn: this.resynchronizePlayer.bind(this)
				});
			});
		});
	}

	// queue resynchronization of all games last resynchronized over fourteen days ago
	resynchronizeGames()
	{
		const dueDate = moment().subtract(this.config.timers.playerResynchronization);
		const query = {
			$or: [{
				resynchronize: true
			}, {
				resynchronized: 'never'
			}, {
				resynchronized: { '$lt': dueDate.toDate() }
			}]
		};

		return database.instance.getGames(query)
		.then((documents) => {
			debug(`Found ${documents.length} game(s) which requires resynchronization`);

			documents.forEach((doc) => {
				this.queueResynchronizeGame(doc._id);
			});
		});
	}

	queueResynchronizePlayer(playerId)
	{
		debug("Queue resynchronization of player", playerId);
		return this.queue.push({
			id: 'resynchronize_player_' + playerId,
			args: [playerId],
			fn: this.resynchronizePlayer.bind(this)
		});
	}

	queueResynchronizeGame(gameId)
	{
		debug(`Queue resynchronization of game ${gameId}`);
		return this.queue.push({
			id: 'resynchronize_game_' + gameId,
			args: [gameId],
			fn: this.resynchronizeGame.bind(this)
		});
	}

	queueResynchronizePlayerAchievements(playerId, gameId)
	{
		return this.queue.push({
			id: 'resynchronize_player_' + playerId + '_game_' + gameId,
			args: [playerId, gameId],
			fn: this.resynchronizePlayerAchievements.bind(this)
		});
	}

	// perform player resynchronization
	async resynchronizePlayer(id)
	{
		try
		{
			const player = await Player.load(id);

			if (player.canResynchronize(this.config.timers.playerMinResynchronizationDelay) === false)
			{
				console.error(`Cannot resynchronize player '${player.name}' (${player.id})`);
			}
			else
			{
				debug(`Resynchronizing '${player.name}' (${player.id})`);

				const games = await player.resynchronize();

				// queue new or played games for resynchronization
				debug(`Queing resynchronization of ${games.length} games`);
				games.forEach((game) => {
					this.queueResynchronizeGame(game.appid);
					this.queueResynchronizePlayerAchievements(id, game.appid);
				});
			}
		}
		catch (err)
		{
			console.error(`Failed to resynchronize player '${id}'`);
			console.error(err);
		}
	}

	// private
	async resynchronizeGame(id)
	{
		debug("Resynchronize game '%s'", id);

		try
		{
			const game = new Game(id);

			if (await game.load() === false)
			{
				debug(`game '${id}' does not exist`);
			}
			else if (game.canResynchronize(this.config.timers.playerMinResynchronizationDelay) === false)
			{
				debug(`cannot resynchronize game '${game.name}' (${game.id})`);
			}
			else
			{
				await game.resynchronize();
			}
		}
		catch (err)
		{
			console.error(`Failed to resynchronize game '${gId}'`);
			console.error(err);
		}
	}

	// resynchronize a single players game achievements
	async resynchronizePlayerAchievements(playerId, appid)
	{
		debug("Resynchronize player '%s' game '%s' achievements", playerId, appid);

		try
		{
			const player = await Player.load(playerId);

			await player.updatePlayerAchievementsForGame(appid);
		}
		catch (err)
		{
			console.error("Failed to resynchronize player '%s' game '%s' achievements", player.id, appid);
			console.error(err);
		}

		return Promise.resolve(1);
	}
};