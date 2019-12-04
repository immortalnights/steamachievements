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

	static check(playerResynchronization)
	{
		const delay = moment().subtract(playerResynchronization);
		const query = {
			'steam.communityvisibilitystate': 3,
				$or: [{
				resynchronized: 'never'
			}, {
				resynchronized: { '$lt': delay.toDate() }
			}]
		};

		return database.instance.getPlayers(query);
	}

	static load(id)
	{
		return database.instance.getPlayers({ _id: id })
		.then((documents) => {
			let doc;
			if (documents.length === 1 && documents[0]._id === id)
			{
				doc = documents[0];
			}
			else
			{
				console.error("Invalid response from getPlayers", documents);
				throw new Error("Failed to load player");
			}
			return doc;
		})
		.then((record) => {
			let p = new Player(id)
			p.name = record.personaname;
			p.public = (record.steam.communityvisibilitystate === 3);
			p.lastResynchronized = record.resynchronized;

			debug(`Loaded player '${p.name}' (${p.id}) from database`);

			return p;
		});
	}

	canResynchronize(playerMinResynchronizationDelay)
	{
		let ok = false;
		if (!this.public)
		{
			console.log(`Player '${this.name}' (${this.id}) profile is not public`);
		}
		else if (!this.lastResynchronized || this.lastResynchronized === 'never')
		{
			debug(`Player '${this.name}' (${this.id}) has never been resynchronized`);
			ok = true;
		}
		else
		{
			const lastResynchronized = moment(this.lastResynchronized);
			const due = lastResynchronized.clone().add(playerMinResynchronizationDelay);

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
			debug(`Indexed ${Object.keys(indexedRegisteredGames).length} games`);

			let newGames = 0;
			let playedGames = 0;

			const deferred = _.map(ownedGames, (ownedGame) => {
				let d = true;

				// find the appropriate game from the database set (if it exists)
				const registeredGame = indexedRegisteredGames[ownedGame.appid];

				if (!registeredGame)
				{
					console.log(`${moment().toISOString()} '${this.name}' has a new game '${ownedGame.name}' (${ownedGame.appid})`);

					++newGames;

					// register the game to the player with only the information currently available.
					const schema = {
						achievements: false,
						resynchronized: 'never'
					};

					d = database.instance.registerGame(this.id, ownedGame, schema);

					games.push(ownedGame);
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
						console.log(`${moment().toISOString()} '${this.name}' has played '${ownedGame.name}' (${ownedGame.appid})`);

						++playedGames;

						d = database.instance.updateGamePlaytime(ownedGame.appid,
							this.id,
							ownedGame.playtime_forever,
							ownedGame.playtime_2weeks);

						games.push(ownedGame);
					}
					else
					{
						// not played, skip
					}
				}

				return d;
			});

			debug(`Waiting for all game updates for player '${this.name}'`);
			await Promise.all(deferred);
			debug(`Completed all game updates for player '${this.name}'`);

			debug(`Player '${this.name}' has ${newGames} new games and has played ${playedGames} since last resynchronization`);
		}
		catch (err)
		{
			console.error(`Failed to resyncronize player games '${this.name}' (${this.id})`);
			console.error(err);
		}

		// update the database so the resync has been recorded
		await database.instance.updatePlayer(this.id, {
			resynchronized: new Date()
		});

		return games;
	}

	async updatePlayerAchievementsForGame(gameId)
	{
		let perfect = false;
		try
		{
			const game = new Game(gameId);

			await game.load();

			if (game.getPlayTimeForPlayer(this.id) !== 0)
			{
				const achievements = await steam.instance.getPlayerAchievementsForGame(this.id, game.id);
				debug("Retrieved player '%s' (%s) achievements for game '%s' (%i)", this.name, this.id, game.name, game.id);

				if (_.isEmpty(achievements) == false)
				{
					let updates = [];
					_.each(achievements, (achievement) => {
						if (achievement.achieved)
						{
							const unlocktime = achievement.unlocktime || true;
							updates.push(database.instance.setGameAchievementAchieved(game.id, this.id, achievement.apiname, unlocktime));
						}
					});

					debug(`Player '${this.name}' has  unlocked ${updates.length} achievement(s) in '${game.name} (${game.id}`);

					// FIXME use a queue, else one failure will void all updates
					await Promise.all(updates);

					debug("Saved game '%s' (%i) achievements to database", game.name, game.id);

					perfect = _.every(achievements, function(achievement) {
						return achievement.achieved;
					});

					if (perfect)
					{
						debug("Player '%s' (%s) has completed all achievements in '%s' (%i)", this.name, this.id, game.name, game.id);
						// await database.instance.setPerfectGame(game.id, this.id);
					}
				}
			}
			else
			{
				debug("Player '%s' (%s) has not played '%s' (%i)", this.name, this.id, game.name, game.id);
			}
		}
		catch (err)
		{
			console.error("Failed to update player '%s' (%s) achievements for game '%i'", this.name, this.id, gameId);
			console.error(err);
		}

		await database.instance.updateOwnedGame(gameId, this.id, {
			perfect: perfect,
			resynchronize: false
		});
	}
}