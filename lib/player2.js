'use strict';

const debug = require('debug')('player');
const _ = require('underscore');
const moment = require('moment');
const database = require('./databaseconnection');
const steam = require('./steamconnection');
const Game = require('./game');

module.exports = class Player {
	constructor(id)
	{
		this.id = id;
		this.name = '';
		this.public = false;
		this.lastResynchronized = null;
	}

	load()
	{
		return database.instance.getPlayers({ _id: this.id })
		.then((documents) => {
			console.assert(documents.length === 1 && documents[0]._id === this.id, "Unexpected response from getPlayers");

			const record = documents[0];
			this.name = record.personaname;
			this.public = (documents[0].steam.communityvisibilitystate === 3);
			this.lastResynchronized = record.resynchronized;

			debug(`Loaded player '${this.name}' (${this.id}) from database`);
			return true;
		});
	}

	canResynchronize()
	{
		let ok = false;
		if (!this.public)
		{
			debug(`Player '${this.name}' (${this.id}) profile is not public`);
		}
		else if (!this.lastResynchronized || this.lastResynchronized === 'never')
		{
			debug(`Player '${this.name}' (${this.id}) has never been resynchronized`);
			ok = true;
		}
		else
		{
			const lastResynchronized = moment(this.lastResynchronized);
			const due = lastResynchronized.clone().add(1, 'minutes');

			ok = (due < moment());

			debug(`Player '${this.name}' last resynchronized at ${lastResynchronized} (due ${due})`);
		}

		return ok;
	}

	// returns array of new or played games
	async resynchronize()
	{
		await this.resynchronizeProfile();
		let games = await this.loadPlayedGames();


		return games;
	}

	// update player profile and friends
	async resynchronizeProfile()
	{
		try
		{
			const summary = await steam.instance.getSummary(this.id);

			let profile = {
				personaname: summary.personaname,
				steam: _.pick(summary, 'avatarfull', 'profileurl', 'communityvisibilitystate')
			};

			const friends = await steam.instance.getFriends(this.id);
			if (friends)
			{
				// keep selected properties
				profile.friends = _.map(friends, function(friend) {
					return _.pick(friend, 'steamid', 'friend_since');
				});
			}

			debug(`Updating player '${this.name}' profile`);
			await database.instance.updatePlayer(this.id, profile);

			// update instance
			this.name = summary.personaname;
			this.public = (summary.communityvisibilitystate === 3);
		}
		catch (err)
		{
			console.error(`Failed to resyncronize player profile '${this.name}' (${this.id})`);
			console.error(err);
		}
	}

	// load owned games and cross-reference with registered games
	// return array of new games or games played since last resynchronization
	async loadPlayedGames()
	{
		let games = [];
		try
		{
			debug(`Fetching owned games for player '${this.name}'`);
			const ownedGames = await steam.instance.getOwnedGames(this.id);
			debug(`Player '${this.name}' owns ${ownedGames.length} games`);
			const registeredGames = await database.instance.getPlayerGames(this.id, '_id');
			debug(`Player '${this.name}' has ${registeredGames.length} registered games`);
			const indexedRegisteredGames = _.indexBy(registeredGames, '_id');
			debug(`Indexed ${indexedRegisteredGames.length} games`);

			let newGames = 0;
			let playedGames = 0;

			_.each(ownedGames, (ownedGame) => {
				// find the appropriate game from the database set (if it exists)
				const registeredGame = indexedRegisteredGames[ownedGame.appid];

				if (!registeredGame)
				{
					debug(`'${this.name}' has a new game '${ownedGame.name}' (${ownedGame.appid})`);

					++newGames;

						// TODO
						// games.append
				}
				else
				{
					// find the owner data for this player
					const registeredOwner = _.findWhere(registeredGame.owners, { playerId: this.id });

					if (!registeredOwner)
					{
						console.error(`Failed to find '${this.name}' as a registered owner for game '${ownedGame.appid}'`);
					}
					else if (ownedGame.playtime_forever !== registeredOwner.playtime_forever)
					{
						// game has been played by this player
						debug(`'${this.name}' has played '${ownedGame.name}' (${ownedGame.appid})`);

						++playedGames;

							// TODO
							// games.append
					}
					else
					{
						// not played, skip
					}
				}
			});

			debug(`Player '${this.name}' has ${newGames} new games and has played ${playedGames} since last resynchronization`);
		}
		catch (err)
		{
			console.error(`Failed to resyncronize player games '${this.name}' (${this.id})`);
			console.error(err);
		}
	}
}