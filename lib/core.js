'use strict';

const debug = require('debug')('core');
const database = require('./databaseconnection');
const steam = require('./steamconnection');

module.exports = {
	start: function(config) {
		let databaseConnection = database.connect(config.database.name, config.database)
		.then(function(db) {
			debug("Database connected");
			return db.initialize()
			.then(function() {
				return db;
			});
		});

		// connect to steam (sudo connection)
		let steamConnection = steam.connect(config.steamAPIKey);

		return Promise.all([databaseConnection, steamConnection]);
	}
};