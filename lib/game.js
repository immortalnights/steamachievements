'use strict';

const debug = require('debug')('game');
const _ = require('underscore');
const moment = require('moment');

module.exports = class Game {
	constructor(id, db, steam)
	{
		this.id = id;
		this.db = db;
		this.steam = steam;
	}

	run()
	{
		return new Promise((resolve, reject) => {
			this.steam.getSchemaForGame(this.id)
			.then((schema) => {
				let name = null;

				if (schema)
				{
					name = schema.gameName;

					if (schema.availableGameStats && schema.availableGameStats.achievements)
					{
						this.updateGlobalAchievementsForGame()
						.then(() => {
							resolve({ id: this.id, name: name });
						})
						.catch(reject);
					}
				}
				else
				{
					console.log("No schema for game", this.id);
					resolve({ id: this.id, name: name });
				}
			})
			.catch((err) => {
				console.error("Failed to resynchronize game", this.id, err);
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
				return this.db.setGameAchievementGlobalPercent(this.id, achievements)
				.then(() => {
					return this.db.setGameResynchronizationTime(this.id);
				});
			}
		});
	}
}