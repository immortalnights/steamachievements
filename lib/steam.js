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

	resolveVanityUrl(name)
	{
		console.assert(name, "Missing user name");

		debug("Resolve vanity name for", name);
		return request('ISteamUser/ResolveVanityURL/v0001/', {
			key: this.privateKey,
			vanityurl: name,
			format: 'json'
		}, 'response');
	}

	getSummary(userId)
	{
		console.assert(userId, "Missing user Id");

		debug("Get summary for", userId);
		return request('ISteamUser/GetPlayerSummaries/v0002/', {
			key: this.privateKey,
			steamids: userId,
			format: 'json'
		}, 'response').then(function(response) { return response.players[0]; });
	}

	getOwnedGames(userId)
	{
		console.assert(userId, "Missing user Id");

		debug("Get games owned for", userId);
		return request('IPlayerService/GetOwnedGames/v0001/', {
			key: this.privateKey,
			steamid: userId,
			include_appinfo: 1,
			include_played_free_games: 1,
			format: 'json'
		}, 'response').then(function(response) { return response.games; });
	}

	getPlayerAchievementsForGame(userId, appid)
	{
		console.assert(userId, "Missing user Id");
		console.assert(appid, "Missing game Id");

		debug("Get user achievements for game", appid, userId);
		return request('ISteamUserStats/GetPlayerAchievements/v0001', {
			key: this.privateKey,
			steamid: userId,
			appid: appid,
		}, 'playerstats').then(function(response) { return response.achievements; });
	}

	getSchemaForGame(appid)
	{
		console.assert(appid, "Missing game Id");

		debug("Get schema for game", appid);
		return request('ISteamUserStats/GetSchemaForGame/v2', {
			key: this.privateKey,
			appid: appid
		}, 'game');
	}

	getGlobalAchievementPercentagesForGame(appid)
	{
		console.assert(appid, "Missing game Id");

		debug("Get global achievement percentages for game", appid);
		return request('ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002', {
			gameid: appid
		}, 'achievementpercentages').then(function(response) { return response.achievements; });
	}
};
