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

						return db.updateProfile(playerId, {
							steam: summary
						});
					})
					.catch(function(err) {
						console.error("error", err);
					});
			}
		},

		getGames(playerId, queue)
		{
			const self = this;
			return function(cb) {
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
						// games in which player achievement data is required
						let requiredGames = [];

						// iterate owned games to identify new or played games
						_.each(ownedGames, function(ownedGame) {
							let storedGame = keyedKnownGames[ownedGame.appid];

							if (!storedGame)
							{
								saveGames.push(ownedGame);
								// Request player achievements for this game
								requiredGames.push(ownedGame.appid);
							}
							// Check if the game has been played
							else if (storedGame.playtime_forever !== ownedGame.playtime_forever)
							{
								// Request player achievements for this game
								requiredGames.push(ownedGames.appid);

								// If the game has been played more or less than the last recorded time, record the new time
								db.updateGamePlaytime(storedGame._id, ownedGame.playtime_forever, ownedGame.playtime_2weeks);
							}
						});

						console.log("save", saveGames.length, "games for player", playerId);

						if (!_.isEmpty(saveGames))
						{
							db.addGames(playerId, saveGames)
							.catch(function(err) {
								console.error(err);

								if (err.writeErrors)
								{
									console.log(err.writeErrors[0].errmsg)
									console.log(err.writeErrors[0].toString())
								}
							});
						}

						// FIXME rather then requesting the games now, let the db poll handle it.
						// Add games for which achievcements are required to the queue
						// _.each(requiredGames, function(requiredGame) {
						// 	queue.push(self.getAchievements(playerId, requiredGame.appid, steam, db))
						// });

						return db.updateProfile(playerId, {
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

		getAchievements(recordId, appid, playerId)
		{
			return function(cb) {
				steam.getPlayerAchievementsForGame(playerId, appid)
				.then(function(achievements) {

					if (achievements)
					{
						db.updateGameAchievements(recordId, achievements);
					}
					else
					{
						// If a game doesn't define any achievements, don't automatically request the game achievements again
						db.updateGameAchievements(recordId, false);
					}

					cb();
				})
				.catch(function(err,) {
					console.error("Failed to get achievements for game", appid, err);

					// On failure, assume the game has no achievements and never (automatically) ask again
					if (!err.success)
					{
						db.updateGameAchievements(recordId, false);
					}

					cb(err);
				});
			}
		}
	}
}