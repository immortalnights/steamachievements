'use strict';

const debug = require('debug')('steam');
const httprequest = require('./httprequest');
const query = require('querystring');
const _ = require('underscore');

const request = function(path, data, responseDataKey) {
	return httprequest({
		method: 'get',
		host: 'api.steampowered.com',
		path: '/' + path + '?' + query.stringify(data),
	}, responseDataKey);
}

module.exports = class Steam {
	constructor(privateKey)
	{
		this.privateKey = privateKey;
	}

	getSummary(userId)
	{
		debug("Get summary for", userId);
		return request('ISteamUser/GetPlayerSummaries/v0002/', {
			key: this.privateKey,
			steamids: userId,
			format: 'json'
		}, 'response').then(function(response) { return response.players[0]; });

	}

	getOwnedGames(userId)
	{
		debug("Get games owned for", userId);
		return request('IPlayerService/GetOwnedGames/v0001/', {
			key: this.privateKey,
			steamid: userId,
			include_appinfo: 1,
			include_played_free_games: 1,
			format: 'json'
		}, 'response').then(function(response) { return response.games; });
	}

	// Get player achievements for a specific game
	getPlayerAchievementsForGame(userId, game)
	{
		debug("Get user achievements for game", game.appid);

		return request('ISteamUserStats/GetPlayerAchievements/v0001', {
			key: this.privateKey,
			steamid: userId,
			appid: game.appid,
		}, 'playerstats').then(function(response) {

			let result = _.clone(game);

			// Sometimes the game schema doesn't include the game name and this endpoint does.
			if (!result.gameName || result.gameName.startsWith('ValveTestApp'))
			{
				if (response.gameName)
				{
					result.gameName = response.gameName;
				}
			}

			result.achievements = _.isUndefined(response.achievements) ? false : response.achievements;

			return result;
		});
	}

	/**
	 * game: {
	 * 	gameName: "Half-Life 2",
	 * 	gameVersion: "12",
	 * 	availableGameStats: {
	 * 		achievements: [
	 * 			{
	 * 				name: "HL2_HIT_CANCOP_WITHCAN",
	 * 				displayName: "Defiant",
	 * 			},
	 * 			{
	 * 				...
	 * 			}
	 * 		]
	 * 	}
	 * }
	 */
	getSchemaForGame(game)
	{
		debug("Get schema for game", game.appid);
		return request('ISteamUserStats/GetSchemaForGame/v2', {
			key: this.privateKey,
			appid: game.appid
		}, 'game').then(function(response) {

			// Extend the basic game data with the full schema, apply 'achievements' to the game object directly
			_.extend(game, _.omit(response, 'availableGameStats'));
			_.extend(game, response.availableGameStats);

			return game;
		}, function(err) {
			debug("Failed to get schema for game", game.appid, err);
		});
	}

	getGlobalAchievementPercentagesForGame(game)
	{
		debug("Get global achievement percentages for game", game.appid);

		return request('ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002', {
			gameid: game.appid
		}, 'achievementpercentages').then(function(response) {
			// Iterate game achievements and apply global states
			_.each(game.achievements, function(achievement) {
				// Find the achievement in the global states
				let globalAchievement = _.find(response.achievements, function(responseAchievement) {
					return responseAchievement.name === achievement.name;
				});

				if (globalAchievement)
				{
					achievement.globalCompletionPercentage = globalAchievement.percent;
				}
				else
				{
					debug("Failed to find '%s' in global achievements for game %s", achievement.name, game.appid);
				}
			});

			return game;
		}, function() {
			debug("Failed to get global achievement percentages for game %s", game.appid);
		});
	}
};
