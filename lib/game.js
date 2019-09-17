'use strict';

const debug = require('debug')('game');
const _ = require('underscore');
const moment = require('moment');
const database = require('./databaseconnection');
const steam = require('./steamconnection');

module.exports = class Game {
	constructor(id)
	{
		this.id = id;
		this.name = '';
	}

	update()
	{
		// console.log("update game", this.id)
		return new Promise((resolve, reject) => {
			steam.instance.getSchemaForGame(this.id)
			.then((schema) => {
				let next = Promise.resolve();
				debug("received schema for game");

				if (_.isEmpty(schema) == false)
				{
					this.name = schema.gameName;

					if (schema.availableGameStats && schema.availableGameStats.achievements)
					{
						next = this.updateGlobalAchievementsForGame();
					}
				}

				// update time
				next.then(() => {
					return db.instance.setGameResynchronizationTime(this.id);
				});

				return next;
			})
			.then(() => {
				resolve({ id: this.id, name: this.name });
			})
			.catch((err) => {
				console.error("Failed to resynchronize game", this.id, err);

				// update the time anyway, as this game will be refreshed again later
				db.instance.setGameResynchronizationTime(this.id);

				reject(err);
			});
		});
	}

	updateGlobalAchievementsForGame()
	{
		return steam.instance.getGlobalAchievementPercentagesForGame(this.id)
		.then((achievements) => {
			if (!_.isEmpty(achievements))
			{
				return db.instance.setGameAchievementGlobalPercent(this.id, achievements);
			}
		});
	}
}