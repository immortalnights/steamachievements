'use strict';

const debug = require('debug')('service');
const Queue = require('queue');
const _ = require('underscore');
const moment = require('moment');
const Database = require('./lib/database');
const Steam = require('./lib/steam');
const taskManager = require('./lib/tasks');
const config = require('./config.json');

const db = new Database('achievementchaser');
const steam = new Steam(config.SteamAPIKey);

process.on('unhandledRejection', (reason, p) => {
	console.trace('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

const q = Queue({
	concurrency: 3
});

// automatically refresh player data every 24h
async function refreshPlayers() {
	const yesterday = moment().add(-1, 'days');

	try
	{
		const documents = await db.getPlayers({ $or: [ { resynchronized: { "$lt": yesterday.toDate() } } ]});
		console.log("found %i profile(s) which requires updating", documents.length, _.pluck(documents, '_id'));


		documents.forEach(function(doc, index) {
			q.push(refreshPlayer(doc._id));
		});

		q.on('success', function() {
			console.log("Jobs completed.");
		});

		q.on('end', function() {
			console.log("All jobs completed.");
			db.close();
		});

		q.start();
	}
	catch (exception)
	{
		console.error(exception);
	}
}

async function registerGame(playerId, game) {
	// get the achievements for the new game
	// FIXME the database might already have this game, perhaps it would be better to
	// check before loading the scheam from Steam.
	let schema = await steam.getSchemaForGame(game.appid)
	.catch(function(err) {
		console.error("Failed to get scheam for game", game.appid);
	});

	if (!_.isEmpty(schema) && schema.availableGameStats)
	{
		schema = schema.availableGameStats;
	}
	else
	{
		schema.achievements = false;
	}

	const result = await db.registerGame(playerId, game, schema);
	console.log("registered game", game.appid);

	// update game achievements, if applicable
	if (!_.isEmpty(schema.achievements))
	{
		console.log("has achievements");

		// If the result is null, the game was not previously registered and the achievement schema will be required
		if (!result)
		{
			// Game did not exist, player and global achievements required
			q.push(function() {
				console.log("update global");
				return updateGlobalAchievementsForGame(game.appid);
			});

			q.push(function() {
				console.log("update player2");
				return updatePlayerAchievementsForGame(playerId, game.appid);
			});
		}
		else
		{
			// Game exists, player achievements required
			q.push(function() {
				console.log("update player1");
				return updatePlayerAchievementsForGame(playerId, game.appid);
			});
		}
	}
}

async function updateRegisteredGame(playerId, game) {
	await db.updateGamePlaytime(game.appid, playerId, game.playtime_forever, game.playtime_2weeks);

	// Update player achievements for this game
	q.push(function() {
		return updatePlayerAchievementsForGame(playerId, game.appid);
	});
}

async function updateGlobalAchievementsForGame(gameId) {
	const achievements = await steam.getGlobalAchievementPercentagesForGame(gameId);

	if (_.isEmpty(achievements))
	{
		let updates = [];
		_.each(achievements, function(achievement) {
			updates.push(db.setGameAchievementGlobalPercent(gameId, achievement.name, achievement.percent));
		});

		await Promise.all(updates);

		await db.setGameResynchronizationTime(gameId);
	}
}

async function updatePlayerAchievementsForGame(playerId, gameId) {
	const achievements = await steam.getPlayerAchievementsForGame(playerId, gameId);

	if (!_.isEmpty(achievements))
	{
		let updates = [];
		_.each(achievements, function(achievement) {
			if (achievement.achieved)
			{
				const unlocktime = achievement.unlocktime || true;
				updates.push(db.setGameAchievementAchieved(gameId, playerId, achievement.apiname, unlocktime));
			}
		});

		const perfect = _.every(achievements, function(achievement) {
			return achievement.achieved;
		});

		await Promise.all(updates);

		if (perfect)
		{
			console.log("setting perfect game", gameId, playerId);
			await db.setPerfectGame(gameId, playerId);
		}

		// await db.setGameResynchronizationTime(gameId);
	}
}

const refreshPlayer = function(playerId) {
	return (async function() {
		try
		{
			const summary = await steam.getSummary(playerId);
			debug("player summary", summary);

			// use the database id property
			delete summary.steamid;

			console.log("updating player %s (%s)", summary.personaname, playerId);
			await db.updatePlayer(playerId, {
				// resynchronized: new Date(),
				steam: summary
			});

			let [ownedGames, registeredGames] = await Promise.all([ steam.getOwnedGames(playerId), db.getPlayerGames(playerId, { sort: '_id' }) ]);

			// order owned games (from steam) by app id
			// ownedGames = _.sortBy(ownedGames, 'appid' );

			// index owned and registered games
			const indexedOwnedGames = _.indexBy(ownedGames, 'appid');
			const indexedRegisteredGames = _.indexBy(registeredGames, '_id');

			// console.log("ownedGames=", ownedGames[0]);
			// console.log("registeredGames=", registeredGames[0]);

			// Identify new or played games by iterating over the steam result set
			_.each(ownedGames, function(ownedGame, index) {
				// find the approprate game from the database set (if it exists)
				const registeredGame = indexedRegisteredGames[ownedGame.appid];

				if (!registeredGame)
				{
					// game is not registered for any players
					console.log("%s (%s) has new game '%s' (%i)", summary.personaname, playerId, ownedGame.name, ownedGame.appid);

					q.push(function() {
						return registerGame(playerId, ownedGame);
					});
				}
				else
				{
					// get player owner information
					const registeredOwner = _.findWhere(registeredGame.owners, { playerId: playerId });

					if (!registeredOwner)
					{
						console.error("Failed to find registered owner in registered game data", playerId, registeredGame.owners);
					}
					else if (ownedGame.playtime_forever !== registeredOwner.playtime_forever)
					{
						// game has been played by this player
						console.log("%s (%s) has played '%s' (%i)", summary.personaname, playerId, ownedGame.name, ownedGame.appid);

						q.push(function() {
							return updateRegisteredGame(playerId, ownedGame);
						});
					}
					else
					{
						// not played, skip
					}
				}
			});

			console.log("Done processing games");
		}
		catch (exception)
		{
			console.error("Failed to refresh player", exception);
		}
	});
}

db.connect('mongodb://localhost:27017')
.then(function() {
	db.initialize();

	refreshPlayers();
})
.catch((error) => {
	console.error("Error", error);
	process.exit(1);
});
