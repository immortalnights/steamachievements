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
const tasks = taskManager(steam, db);

process.on('unhandledRejection', (reason, p) => {
	console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

// debug
queue.on('success', function (result, job) {
	console.log('job finished processing');

	if (_.isString(result))
	{
		console.log(result);
	}
});
queue.on('error', function (err, job) {
	console.log('job failed');

	if (_.isString(err))
	{
		console.log(err);
	}
});
// queue.on('end', function (err, job) {
// 	console.log('jobs completed');

// 	setTimeout(checkDatabase, 5000);
// });

const checkDatabase = function() {
	console.log("Check profiles");

	const lastUpdated = moment().add(-1, 'days');

	var tickWithNoWork = _.after(2, function() {
		console.log("start queue");
		queue.start(function() {
			console.log("queue completed");
			setTimeout(checkDatabase, 5000);
		});
	});

	// find any profiles which require refreshing
	db.getProfiles({ $or: [ { updated: { "$lt": lastUpdated.toDate() } } ]})
	.then(function(documents) {
		console.log("found", documents.length, "profile(s) which require updating");

		documents.forEach(function(doc, index) {
			// console.log("doc", doc);

			const playerId = doc._id;

			// refresh the players profile
			console.log("Profile required for", playerId)
			queue.push(tasks.getProfile(playerId, steam, db));

			// refresh teh players games
			console.log("Games required for", playerId)
			queue.push(tasks.getGames(playerId, steam, db, queue));
		});

		return documents;
	})
	.then(tickWithNoWork)
	.catch(function(err) {
		console.error(err);
	});

	console.log("Check games");
	// find any games which require refreshing or loading
	db.getPlayerGames({ playtime_forever: { $ne: 0 }, achievements: 'pending' })
	.then(function(documents) {
		console.log("update achievements for", documents.length, "game(s)");

		// console.log(documents[0]);

		documents.forEach(function(doc, index) {
			// console.log("doc", doc);

			// console.log("Achievements required for", doc.appid, doc.playerId);
			queue.push(tasks.getAchievements(doc._id, doc.appid, doc.playerId, steam, db));
		});

		return documents;
	})
	.then(function(documents) {
		console.log("update schema for", documents.length, "game(s)");

		return documents;

	})
	.then(tickWithNoWork)
	.catch(function(err) {
		console.error(err);
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
