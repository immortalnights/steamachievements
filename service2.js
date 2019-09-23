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
			console.log("%s Executing schedule task", moment().toISOString());

			try
			{
				await this.resynchronizePlayers();
				await this.resynchronizeGames();
				// queued during game resynchronization
				// await this.resynchronizePlayersAchievements();
			}
			catch (err)
			{
				console.error("%s Failed to execute schedule tasks", moment().toISOString(), err);
			}

			// setTimeout(scheduleTask, SCHEDULE);
		};

		scheduleTask();
	}

	queueResynchronizeNewPlayer(id)
	{
		const resync = async function(id) {
			try
			{
				const result = await this.resynchronizePlayer(id);

				// get all the games the player has played and queue the resynchronization of those too
				const games = await database.instance.getPlayerGames(id, '_id');

				debug("Player has %i games requiring resynchronization", games.length);

				games.forEach((game) => {
					this.queueResynchronizeGame(game._id);
					this.queueResynchronizePlayerAchievements(id, game._id);
				});
			}
			catch (err)
			{
				console.error("Failed to resynchronize new player '%s'", id);
				console.error(err);
			}
		};

		debug("Queue new player resynchronization");
		return this.queue.push({
			id: 'resynchronize_new_player_' + id,
			args: [id],
			fn: resync.bind(this)
		});
	}

	queueResynchronizePlayer(playerId)
	{
		const resync = async function(id) {
			try
			{
				await this.resynchronizePlayer(id);
				await this.resynchronizePlayersAchievements();
			}
			catch (err)
			{
				console.error("Failed to resynchronize player '%s'", id);
				console.error(err);
			}
		}

		return this.queue.push({
			id: 'resynchronize_player_' + playerId,
			args: [playerId],
			fn: resync.bind(this)
		});
	}

	queueResynchronizeGame(gameId, playerId)
	{
		const resync = async function(gId, pId) {
			try
			{
				await this.resynchronizeGame(gId);

				if (pId)
				{
					await queueResynchronizePlayerAchievements(pId, gId);
				}
			}
			catch (err)
			{
				console.error("Failed to resynchronize game '%i'", id);
				console.error(err);
			}
		};

		return this.queue.push({
			id: 'resynchronize_game_' + gameId,
			args: [gameId, playerId],
			fn: resync.bind(this)
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

	resynchronizePlayers()
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
					args: [doc._id],
					fn: this.resynchronizePlayer.bind(this)
				});
			});
		});
	}

	resynchronizeGames()
	{
		const variant = Math.floor(Math.random() * Math.floor(14)) - 7;
		const dueDate = moment().subtract(28 + variant, 'days').add();
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
			debug("Found %i game(s) which requires resynchronization", documents.length);

			documents.forEach((doc) => {
				// debug(doc);
				this.queue.push({
					id: 'resynchronize_game_' + doc._id,
					args: [doc._id],
					fn: this.resynchronizeGame.bind(this)
				});
			});
		});
	}

	// resynchronize all players game achievements for games which have been updated
	resynchronizePlayersAchievements()
	{
		return database.instance.getGames({
			'owners.resynchronize': true
		}, {
			fields: {
				_id: 1,
				name: 1,
				'owners': 1
			}
		})
		.then((documents) => {
			debug("Found %i owned games which require resynchronization", documents.length);

			// filter owners which have been resynchronized, could use db aggregation
			// but this only filters out games which will is already included
			documents.forEach(function(doc) {
				doc.owners = doc.owners.filter(function(owner) {
					return owner.resynchronize === true;
				});
			});

			documents.forEach((doc) => {
				doc.owners.forEach((owner) => {
					this.queueResynchronizePlayerAchievements(owner.playerId, doc._id);
				});
			});
		});
	}

	// private
	async resynchronizePlayer(id)
	{
		debug("Resynchronize player '%s'", id);

		try
		{
			const player = new Player(id);

			await player.load();

			if (player.canResynchronize())
			{
				await player.resynchronize();
			}
			else
			{
				console.log("Cannot resynchronize player '%s'", player.id);
			}
		}
		catch (err)
		{
			console.error("Failed to resynchronize player", id);
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

			let result = await game.load();

			if (result && game.canResynchronize())
			{
				await game.resynchronize();

				// reload to ensure latest data
				await game.load();

				game.attr.owners.forEach((owner) => {
					if (owner.resynchronize)
					{
						this.queueResynchronizePlayerAchievements(owner.playerId, game.id);
					}
				});
			}
		}
		catch (err)
		{
			console.error("Failed to resynchronize game", id);
			console.error(err);
		}
	}

	// resynchronize a single players game achievements
	async resynchronizePlayerAchievements(id, appid)
	{
		debug("Resynchronize player '%s' game '%s' achievements", id, appid);

		try
		{
			const player = new Player(id);

			await player.load();

			await player.updatePlayerAchievementsForGame(appid);
		}
		catch (err)
		{
			console.error("Failed to resynchronize player '%s' game '%s' achievements", id, appid);
			console.error(err);
		}

		return Promise.resolve(1);
	}
};