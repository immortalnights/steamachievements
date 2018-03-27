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
		return new Promise(async (resolve, reject) => {
			try
			{
				const schema = await this.steam.getSchemaForGame(this.id + 'x');
				let name = null;

				if (schema)
				{
					name = schema.gameName;

					if (schema.availableGameStats && schema.availableGameStats.achievements)
					{
						await this.updateGlobalAchievementsForGame();
					}
				}
				else
				{
					console.log("No schema for game", this.id);
				}

				resolve({ id: this.id, name: name });
			}
			catch (exception)
			{
				console.error("Failed to resynchronize game", this.id, exception);
				reject(exception);
			}
		});
	}

	async updateGlobalAchievementsForGame()
	{
		const achievements = await this.steam.getGlobalAchievementPercentagesForGame(this.id);

		if (!_.isEmpty(achievements))
		{
			let updates = [];
			_.each(achievements, (achievement) => {
				updates.push(this.db.setGameAchievementGlobalPercent(this.id, achievement.name, achievement.percent));
			});

			await Promise.all(updates);

			await this.db.setGameResynchronizationTime(this.id);
		}
	}
}