'use strict';

const _ = require('underscore');

module.exports = function(steam, db) {
	return {
		getProfile(playerId)
		{
			console.log("get profile for", playerId)
			return function() {
				return steam.getSummary(playerId)
					.then(function(summary) {
						// console.log("summary", summary);

						// use the database id property
						delete summary.steamid;

						console.log("updating player", playerId, )
						return db.updatePlayer(playerId, {
							updated: new Date(),
							steam: summary
						});
					})
					.catch(function(err) {
						console.error("error", err);
					});
			}
		},

		getPlayerGames(playerId, queue)
		{
			const self = this;
			return function(cb) {
				console.log("fetching player games", playerId)
				steam.getOwnedGames(playerId)
				.then(function(ownedGames) {
					// ownedGames is games retuned form the Steam API
					console.log("player owns %i games", ownedGames.length);

					// get all known games for the user
					db.getPlayerGames({ playerId: playerId }, { _id: true, name: true, appid: true, playtime_forever: true }, { sort: 'appid' })
					.then(function(knownGames) {
						console.log("cached %i games for player", knownGames.length);

						// index owned games for quicker lookup
						const keyedOwnedGames = {};
						_.each(ownedGames, function(game) {
							keyedOwnedGames[game.appid] = game;
						});

						// index the known games for quicker lookup
						const keyedKnownGames = {};
						_.each(knownGames, function(game) {
							keyedKnownGames[game.appid] = game;
						});

						// games which should be saved to the db
						let saveGames = [];

						// iterate owned games to identify new or played games
						_.each(ownedGames, function(ownedGame) {
							let storedGame = keyedKnownGames[ownedGame.appid];

							if (!storedGame)
							{
								saveGames.push(ownedGame);
							}
							// Check if the game has been played
							else if (storedGame.playtime_forever !== ownedGame.playtime_forever)
							{
								console.log("updating game", ownedGames.appid, "for", playerId);
								// If the game has been played more or less than the last recorded time, record the new time
								db.updateGamePlaytime(storedGame._id, ownedGame.playtime_forever, ownedGame.playtime_2weeks);

								// Update player achievements for this game
								queue.push(self.getPlayerAchievements(playerId, ownedGame.appid, storedGame._id));
							}
						});

						console.log("save", saveGames.length, "games for player", playerId);

						if (!_.isEmpty(saveGames))
						{
							db.addPlayerGames(playerId, saveGames)
							.catch(function(err) {
								console.error(err);

								if (err.writeErrors)
								{
									console.log(err.writeErrors[0].errmsg)
									console.log(err.writeErrors[0].toString())
								}
							});
						}

						return db.updatePlayer(playerId, {
							updated: new Date()
						}).then(function() {
							console.log("completed profile update");
							cb();
						});
					})
					.catch(function(err) {
						console.error("failed to get known games for", playerId);
						cb(err);
					});
				})
				.catch(function(err) {
					console.error("failed to get owned games for", playerId);
					cb(err);
				});
			}
		},

		getPlayerAchievements(playerId, appid, recordId)
		{
			return function() {
				return new Promise(function(resolve, reject) {
					steam.getPlayerAchievementsForGame(playerId, appid)
					.then(function(achievements) {

						if (achievements)
						{
							console.log("update achievements for", appid, playerId);
							db.updateGameAchievements(recordId, achievements);
						}
						else
						{
							// If a game doesn't define any achievements, don't automatically request the game achievements again
							db.updateGameAchievements(recordId, false);
						}

						resolve();
					})
					.catch(function(err) {
						console.error("Failed to get achievements for game", appid, err);

						// On failure, assume the game has no achievements and never (automatically) ask again
						if (!err.success)
						{
							db.updateGameAchievements(recordId, false);
							// A game without achievements isn't a failure case
							resolve();
						}
						else
						{
							reject(err);
						}
					});
				});
			}
		},

		getGameSchema(game)
		{
			const self = this;
			return function() {
				return new Promise(function(resolve, reject) {
					let defaultSchema = {
						_id: game.appid,
						updated: new Date()
					};

					// ensure the schema is complete
					_.defaults(defaultSchema, _.pick(game, 'name', 'img_icon_url', 'img_logo_url'));

					steam.getSchemaForGame(game.appid)
					.then(function(schema) {

						// ensure consistency
						schema.name = schema.gameName;
						delete schema.gameName;

						// remove unnecessary depth
						_.extend(schema, schema.availableGameStats);
						delete schema.availableGameStats;

						// apply the default schema
						_.defaults(schema, defaultSchema);

						if (!_.isEmpty(schema.achievements))
						{
							steam.getGlobalAchievementPercentagesForGame(game.appid)
							.then(function(achievements) {
								// console.log("achievements", achievements);

								// iterate over the achievements and apply the global percentage to the game achievements
								_.each(achievements, function(achievement) {
									let schemaAchievement = _.find(schema.achievements, { name: achievement.name });

									if (!schemaAchievement)
									{
										console.warn("failed to find achievement", achievement.name, "in schema", achievement);
									}
									else
									{
										schemaAchievement.percent = achievement.percent;
									}
								});

								resolve(schema);
							});
						}
						else
						{
							schema.achievements = false;
							resolve(schema);
							console.log("game %s (%s) has no achievements", schema.name, schema._id);
						}
					})
					.catch(function(err) {
						console.error("failed to get schema for game %s (%s)", game.name, game.appid);
						resolve(defaultSchema);
					});
				}).then(function(schema) {
					db.addGames(schema);
				});
			}
		}
	}
}