'use strict';

const debug = require('debug')('game');
const _ = require('underscore');
const moment = require('moment');
const database = require('./databaseconnection');
const steam = require('./steamconnection');

module.exports = class Game {
	constructor(id)
	{
		this.attr = { _id: id };

		Object.defineProperty(this, 'id', {
			get: function() {
				return this.attr._id;
			}
		});

		Object.defineProperty(this, 'name', {
			get: function() {
				return this.attr.name;
			}
		});
	}

	load()
	{
		return database.instance.getGames({ _id: this.attr._id })
		.then((documents) => {
			console.assert(documents.length === 1 && documents[0]._id === this.attr._id, "Unexpected response from getGames");

			Object.assign(this.attr, documents[0]);

			debug("Loaded game '%s' (%s) data from database", this.attr.name, this.attr._id);
			return true;
		});
	}

	canResynchronize(gameMinResynchronizationDelay)
	{
		let ok;
		// Check that the player record has not already been resynchronized recently
		if (this.attr.resynchronize)
		{
			debug(`Game '${this.name}' resynchronization requested`);
			ok = true;
		}
		else if (!this.attr.resynchronized || this.attr.resynchronized === 'never')
		{
			debug(`Game '${this.name}' (${this.attr._id}) has never been resynchronized`);
			ok = true;
		}
		else
		{
			const lastResynchronized = moment(this.attr.resynchronized);
			const due = lastResynchronized.clone().add(gameMinResynchronizationDelay);

			ok = (due < moment());

			debug(`Game '${this.name}' (${this.id} last resynchronized at ${lastResynchronized} (due ${due})`);
			if (ok)
			{
				debug(`Will resynchronize game '${this.name}' now`);
			}
			else
			{
				debug(`Will not resynchronize game '{this.name}'`, );
			}
		}

		return ok;
	}

	async resynchronize()
	{
		debug("Resynchronize game '%s' (%s)", this.attr.name, this.attr._id);

		try
		{
			const schema = await steam.instance.getSchemaForGame(this.attr._id);

			debug("Loaded schema for game '%s'", this.attr.name);

			const achievements = (schema.availableGameStats && schema.availableGameStats.achievements) ? schema.availableGameStats.achievements : false;

			// if the game achievements have changed, owners need to be resychronized
			if (_.isEmpty(achievements) == false)
			{
				if (_.isArray(achievements) == false || this.attr.achievements.length !== achievements.length)
				{
					debug("Game '%s' (%i) achievements have changed, update all owner states", this.name, this.id);

					// mark owners for resychronization
					const updates = this.attr.owners.map((owner) => {
						return database.instance.updateOwnedGame(this.id, owner.playerId, {
							resynchronize: true
						});
					});

					debug("Updating %i game owner records", updates.length);
					await Promise.all(updates);
				}
			}

			// in case some achievements have been updated (renamed, new image, etc), merge current achievement data and update
			if (_.isArray(this.attr.achievements))
			{
				this.attr.achievements.forEach(function(existingAchievement) {
					let achievement = achievements.find(function(item) { return item.name === existingAchievement.name; });

					if (achievement)
					{
						achievement.players = existingAchievement.players || {};
					}
				});
			}
			// achievements.forEach((achievement) => {
			// 	const existingAchievement = this.attr.achievements.find(function(item) { return item.name === achievement.name; });

			// 	if (existingAchievement)
			// 	{
			// 		if (existingAchievement.players)
			// 		{
			// 			achievement.players = existingAchievement.players;
			// 		}
			// 	}
			// 	else
			// 	{
			// 		console.warn("Achievement '%s' not found in existing achievement for '%s' (%i)", achievement.name, this.name, this.id);
			// 	}
			// });

			debug("Updating game achievement information");
			await database.instance.updateGame(this.attr._id, {
				achievements: achievements
			});

			if (achievements)
			{
				debug("Loading global achievement percentage for game '%s'", this.attr.name);
				const globalAchievements = await steam.instance.getGlobalAchievementPercentagesForGame(this.attr._id)

				if (_.isEmpty(globalAchievements) == false)
				{
					debug("Saving global achievement percentages for game '%s'", this.attr.name);
					await database.instance.setGameAchievementGlobalPercent(this.attr._id, globalAchievements);
				}
				else
				{
					console.error("Failed to get global achievements percentages for game '%s' (%i)", this.attr.name, this.attr._id);
				}
			}
			else
			{
				debug("Game '%s' does not have any achievements", this.attr.name);
			}
		}
		catch (err)
		{
			console.error("Failed to resynchronize game '%s' (%i)", this.attr.name, this.attr._id);
			console.error(err);
		}

		// update the database so the resync has been recorded
		debug("Updating game resychronization information");
		await database.instance.updateGame(this.attr._id, {
			resynchronized: new Date(),
			resynchronize: false
		});

		return;
	}

	getPlayTimeForPlayer(playerId)
	{
		let playtime = 0;
		if (_.isEmpty(this.attr.owners) == false)
		{
			const owner = this.attr.owners.find(function(item) { return item.playerId === playerId })
			playtime = owner.playtime_forever;
		}

		return playtime;
	}
}