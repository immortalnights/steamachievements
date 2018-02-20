'use strict';

const debug = require('debug')('service');
const Queue = require('queue');
const _ = require('underscore');
const Database = require('./lib/database');
// const tasks = require('./lib/tasks');
const Steam = require('./lib/steam');
const config = require('./config.json');

const db = new Database();
const queue = new Queue({
	autostart: true
});
const steam = new Steam(config.SteamAPIKey);

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

db.connect('mongodb://localhost:27017', 'achievementhunter')
.then(() => {
	// find any pending work
	db.getProfiles({ $or: [ { profile: 'pending'}, { games: 'pending' }, { achievements: 'pending' } ]})
	.then(function(documents) {
		documents.forEach(function(doc, index) {
			console.log("doc", doc)
			// profile requires user data
			if (doc.profile === 'pending')
			{
				console.log("Profile required for", doc._id)
				queue.push(function() {
					return steam.getSummary(doc._id)
						.then(function(summary) {
							console.log("summary", summary);

							// use the database id property
							summary._id = doc._id;
							delete summary.steamid;

							// update the profile requirement
							summary.profile = 'ok';

							return db.updateProfile(summary);
						})
						.catch(function(err) {
							console.error("error", error);
						});
				});
			}

			// profile requires game data
			if (doc.games === 'pending')
			{
				// queue.push(tasks.getGames(steam, doc._id));
			}

			// profile requires achievement data
			if (doc.achievements === 'pending')
			{
				// queue.push(tasks.getAchievements(steam, doc._id));
			}
		});
	});
})
.catch((error) => {
	console.error("Error", error);
	console.log(error);
	// todo exit
});
