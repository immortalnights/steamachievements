'use strict';

const debug = require('debug')('game');
const _ = require('underscore');
const moment = require('moment');

module.exports = class Game {
	constructor(id, db, steam)
	{
		this.id = id;
		this.name = '';
		this.db = db;
		this.steam = steam;
	}

	update()
	{
		// console.log("update game", this.id)
		return new Promise((resolve, reject) => {
			this.steam.getSchemaForGame(this.id)
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
					return this.db.setGameResynchronizationTime(this.id);
				});

				return next;
			})
			.then(() => {
				resolve({ id: this.id, name: this.name });
			})
			.catch((err) => {
				console.error("Failed to resynchronize game", this.id, err);

				// update the time anyway, as this game will be refreshed again later
				this.db.setGameResynchronizationTime(this.id);

				reject(err);
			});
		});
	}

	updateGlobalAchievementsForGame()
	{
		return this.steam.getGlobalAchievementPercentagesForGame(this.id)
		.then((achievements) => {
			if (!_.isEmpty(achievements))
			{
				return this.db.setGameAchievementGlobalPercent(this.id, achievements);
			}
		});
	}
}