'use strict';

const _ = require('underscore');
const config = require('../config.json');
const Database = require('../lib/database');
const Steam = require('../lib/steam');
const Player = require('../lib/player');

const db = new Database(config.database.name);
const steam = new Steam(config.steamAPIKey);

process.on('unhandledRejection', (reason, p) => {
	console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

const updatePlayer = function(player) {
	return player.run()
	.then(function(result) {
		console.log("Done updating player");
		console.log("Result", result);
	});
};
const registerGame = function(player, game) {
	return player.registerGame(game)
	.then(function(result) {
		console.log("Done registering player game");
		console.log("Result", result);
	});
}

const updatePlayerGameAchievements = function(player, game) {
	console.log("Updating player game achievements", game);
	return player.updatePlayerAchievementsForGame(game)
	.then(function(result) {
		console.log("Done updating player game achievements");
		console.log("Result", result);
	});
}

const updatePlayerGame = function(player, game) {
	return player.updateRegisteredGame(game)
	.then(function(result) {
		console.log("Done updating player game");
		console.log("Result", result);
	});
};


db.connect(config.database)
.then(function() {
	console.log("Database connected");
	return db.initialize();
})
.then(function() {
	console.log("Database initialized");

	const game = {
		appid: 400,
		name: 'Portal',
		playtime_forever: 666,
		playtime_2weeks: 2
	};

	const player = new Player('76561197993451745', db, steam);
	player.name = 'ImmortalNights';

	return updatePlayer(player);
	// return registerGame(player, game);
	// return updatePlayerGame(player, game);
	// return updatePlayerGameAchievements(player, game);
})
.then(function() {
	console.log("Exiting");
	db.close();
})
.catch(function(err) {
	console.error("Failed", err);
	db.close();
});
