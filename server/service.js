'use strict';

const debug = require('debug')('service');
const Queue = require('queue');
const _ = require('underscore');
const moment = require('moment');
const Database = require('./lib/database');
const Steam = require('./lib/steam');
const taskManager = require('./lib/tasks');
const config = require('./config.json');

const db = new Database('achievementhunter');
const queue = new Queue({
	// autostart: true,
	concurrency: 10
});
const steam = new Steam(config.SteamAPIKey);
// binds the current steam and db instance to the task manager
const tasks = taskManager(steam, db);

process.on('unhandledRejection', (reason, p) => {
	console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

const TICK_TIME = 60000;

// debug
queue.on('success', function (result, job) {
	if (_.isString(result))
	{
		console.log(result);
	}
});
queue.on('error', function (err, job) {
	console.trace('job failed', err, job.toString());

	if (_.isString(err))
	{
		console.log(err);
	}
});

// find any profiles which require refreshing
const checkProfiles = function() {
	console.log("Check profiles");
	const lastUpdated = moment().add(-1, 'days');

	return db.getProfiles({ $or: [ { updated: { "$lt": lastUpdated.toDate() } } ]})
	.then(function(documents) {
		console.log("found %i profile(s) which require updating", documents.length, _.pluck(documents, '_id'));

		documents.forEach(function(doc, index) {
			// console.log("doc", doc);

			const playerId = doc._id;

			// refresh the players profile
			console.log("Profile required for", playerId)
			queue.push(tasks.getProfile(playerId, steam, db));

			// refresh the players games
			console.log("Games required for", playerId)
			queue.push(tasks.getPlayerGames(playerId, queue));
		});

		return documents;
	})
	.catch(function(err) {
		console.error("failed to get profiles to check", err);
	});
}

// find any games which require refreshing or loading
const checkPlayerGames = function() {
	console.log("Check player games");
	return db.getPlayerGames({ playtime_forever: { $ne: 0 }, achievements: 'pending' })
	.then(function(documents) {
		console.log("update achievements for %i game(s)", documents.length, _.pluck(documents, 'appid'));

		documents.forEach(function(doc, index) {
			queue.push(tasks.getPlayerAchievements(doc.playerId, doc.appid, doc._id));
		});

		return documents;
	})
	.catch(function(err) {
		console.error("failed to get player games to update", err);
	});
}

const checkGameSchema = function() {
	console.log("Check games")
	return db.getPlayerGamesWithoutSchema()
	.then(function(documents) {
		console.log("fetching schema for %i games", documents.length, _.pluck(documents, 'appid'));

		let processed = {};
		_.each(documents, function(game) {
			if (!processed[game.appid])
			{
				processed[game.appid] = true;

				queue.push(tasks.getGameSchema(game));
			}
			else
			{
				// Skip
			}
		});
	})
	.catch(function(err) {
		console.error("failed to get missing schema", err);
	});
}

const checkDatabase = function() {
	let checks = [];
	checks.push(checkProfiles());
	checks.push(checkPlayerGames());
	checks.push(checkGameSchema());

	Promise.all(checks).then(function() {
		console.log("Database queries completed, start queue");

		queue.start(function() {
			console.log("Queue completed");
			setTimeout(checkDatabase, TICK_TIME);
		});
	})
	.catch(function(err) {
		console.error("failed to perform database check", err);
	});
}

db.connect('mongodb://localhost:27017')
.then(function() {
	db.initialize();
	checkDatabase();
})
.catch((error) => {
	console.error("Error", error);
	console.log(error);
	// todo exit
});
