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

				// await this.updateGlobalAchievementsForGame(game.appid);
				resolve({ id: this.id, name: schema.gameName });
			}
			catch (exception)
			{
				console.error("Failed to resynchronize game", this.id, exception);
				reject(exception);
			}
		});
	}

	async _updateGlobalAchievementsForGame(gameId)
	{
		const achievements = await this.steam.getGlobalAchievementPercentagesForGame(gameId);

		if (!_.isEmpty(achievements))
		{
			let updates = [];
			_.each(achievements, (achievement) => {
				updates.push(this.db.setGameAchievementGlobalPercent(gameId, achievement.name, achievement.percent));
			});

			await Promise.all(updates);

			await this.db.setGameResynchronizationTime(gameId);
		}
	}
}