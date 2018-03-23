'use strict';

const debug = require('debug')('player');
const _ = require('underscore');
const moment = require('moment');

module.exports = class Player {
	constructor(playerId, db, steam)
	{
		this.playerId = playerId;
		this.db = db;
		this.steam = steam;
	}

	run()
	{
		return new Promise(async (resolve, reject) => {
			try
			{
				console.log("resynchronization started (", this.playerId, ")");
				setTimeout(() => {
					console.log("resynchronization completed (", this.playerId, ")");
					resolve();
				}, 15 * 1000);
			}
			catch (err)
			{
				reject(err);
			}
		});
	}

	runX()
	{
		return new Promise(async (resolve, reject) => {
			try
			{
				const summary = await this.steam.getSummary(playerId);
				debug("player summary", summary);

				// use the database _id property
				delete summary.steamid;

				console.log("updating player %s (%s)", summary.personaname, playerId);
				await this.db.updatePlayer(playerId, {
					// resynchronized: new Date(),
					steam: summary
				});

				// collect owned games from steam and registered games from the database
				let [ownedGames, registeredGames] = await Promise.all([ this.steam.getOwnedGames(playerId), this.db.getPlayerGames(playerId, { sort: '_id' }) ]);

				// order owned games (from steam) by app id
				// ownedGames = _.sortBy(ownedGames, 'appid' );

				// index owned and registered games
				const indexedOwnedGames = _.indexBy(ownedGames, 'appid');
				const indexedRegisteredGames = _.indexBy(registeredGames, '_id');

				// console.log("ownedGames=", ownedGames[0]);
				// console.log("registeredGames=", registeredGames[0]);

				// Identify new or played games by iterating over the steam result set
				_.each(ownedGames, (ownedGame, index) => {
					// find the appropriate game from the database set (if it exists)
					const registeredGame = indexedRegisteredGames[ownedGame.appid];

					if (!registeredGame)
					{
						// game is not registered for any players
						console.log("%s (%s) has new game '%s' (%i)", summary.personaname, playerId, ownedGame.name, ownedGame.appid);

						this.registerGame(playerId, ownedGame);
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

							this.updateRegisteredGame(playerId, ownedGame);
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
				reject(exception);
			}
		});
	}
}