'use strict';

const debug = require('debug')('player');
const Events = require('events');
const _ = require('underscore');
const moment = require('moment');
const database = require('./databaseconnection');
const steam = require('./steamconnection');
const Game = require('./game');

module.exports = class Player extends Events.EventEmitter {
	constructor(id)
	{
		super();
		this.attr = { _id: id };

		Object.defineProperty(this, 'id', {
			get: function() {
				return this.attr._id;
			}
		});

		Object.defineProperty(this, 'name', {
			get: function() {
				return this.attr.personaname;
			}
		});
	}

	static parsePlayerIdentifier(identifier)
	{
		console.log("parsing player identifier", identifier);
		// Parse steamcommunity urls
		const parseUrl = function(url) {
			const split = function(url, key) {
				let keyOffset = url.indexOf(key);
				let name;

				if (-1 !== keyOffset)
				{
					name = url.substring(keyOffset + key.length);
				}
				
				return name;
			};

			let name = split(url, '/id/') || split(url, '/profiles/');

			if (name)
			{
				let offset = name.indexOf('/');
				if (-1 !== offset)
				{
					name = name.substring(0, offset);
				}
			}

			console.log(identifier, "=>", name);
			return name;
		};

		let result = {};

		// Parse the identifier if it looks like a community url
		if (-1 !== identifier.indexOf('steamcommunity.com'))
		{
			identifier = parseUrl(identifier);
		}

		// Converting to a number will loose some precision, but only checking for NaN
		if (identifier.length === 17 && Number(identifier))
		{
			result.id = identifier;
		}
		else
		{
			// assume vanity name
			result.vanity = identifier;
		}

		debug("Parsed identifier", result);

		return result;
	}

	load()
	{
		return database.instance.getPlayers({ _id: this.id })
		.then((documents) => {
			console.assert(documents.length === 1 && documents[0]._id === this.id, "Unexpected response from getPlayers");

			Object.assign(this.attr, documents[0]);
			debug("Loaded player '%s' (%s) data from database", this.name, this.id);
			return true;
		});
	}

	canResynchronize()
	{
		let ok;
		// Check that the player record has not already been resynchronized recently
		if (this.attr.resynchronize)
		{
			debug("Player '%s' resynchronization requested");
			ok = true;
		}
		else if (!this.attr.resynchronized || this.attr.resynchronized === 'never')
		{
			debug("Player '%s' has never been resynchronized", this.id);
			ok = true;
		}
		else
		{
			const lastResynchronized = moment(this.attr.resynchronized);
			const due = lastResynchronized.clone().add(5, 'minutes');

			ok = (due < moment());

			debug("Player '%s' last resynchronized at %s (due %s)", this.id, lastResynchronized, due);
			if (ok)
			{
				debug("Will resynchronize player '%s' now", this.id);
			}
			else
			{
				debug("Will not resynchronize player '%s'", this.id);
			}
		}

		return ok;
	}

	async resynchronize()
	{
		debug("Resynchronize player '%s' (%s)", this.name, this.id);

		try
		{
			const summary = await steam.instance.getSummary(this.id);

			debug("Reteived player summary %o", summary);
			let profile = {
				personaname: summary.personaname,
				steam: _.omit(summary, 'steamid', 'personaname')
			};

			const friends = await steam.instance.getFriends(this.id);

			if (friends)
			{
				// keep selected properties
				profile.friends = _.map(friends, function(friend) {
					return _.pick(friend, 'steamid', 'friend_since');
				});
			}

			debug("Updating player '%s' (%s)", this.name, this.id);
			await database.instance.updatePlayer(this.id, profile);

			debug("Resynchronizing player games");
			const ownedGames = await steam.instance.getOwnedGames(this.id);
			const registeredGames = await database.instance.getPlayerGames(this.id, '_id');
			const indexedRegisteredGames = _.indexBy(registeredGames, '_id');

			let newGames = 0;
			let playedGames = 0;

			// Identify new or played games by iterating over the steam result set
			_.each(ownedGames, async (ownedGame, index) => {
				// find the appropriate game from the database set (if it exists)
				const registeredGame = indexedRegisteredGames[ownedGame.appid];

				if (!registeredGame)
				{
					// game is not registered for any players
					debug("'%s' (%s) has new game '%s' (%i)", this.name, this.id, ownedGame.name, ownedGame.appid);

					++newGames;

					await this.registerGame(ownedGame);
				}
				else
				{
					// get player owner information
					const registeredOwner = _.findWhere(registeredGame.owners, { playerId: this.id });

					if (!registeredOwner)
					{
						console.error("Failed to find registered owner in registered game data", this.id, registeredGame.owners);
					}
					else if (ownedGame.playtime_forever !== registeredOwner.playtime_forever)
					{
						// game has been played by this player
						debug("'%s' (%s) has played '%s' (%i)", this.name, this.id, ownedGame.name, ownedGame.appid);

						++playedGames;

						await this.updateRegisteredGame(ownedGame);
					}
					else
					{
						// not played, skip
					}
				}
			});

			debug("Updated games for '%s' (%i new, %i played)", this.name, newGames, playedGames);
		}
		catch (err)
		{
			console.error("Failed to resyncronize player");
			console.error(err);
		}

		// update the database so the resync has been recorded
		await database.instance.updatePlayer(this.id, {
			resynchronized: new Date(),
			resynchronize: false
		});
	}

	async registerGame(game)
	{
		// register the game to the player with only the information currently available.
		let schema = {
			achievements: false,
			resynchronized: 'never',
			resynchronize: true
		};

		await database.instance.registerGame(this.id, game, schema);
	}

	async updateRegisteredGame(game)
	{
		await database.instance.updateGamePlaytime(game.appid, this.id, game.playtime_forever, game.playtime_2weeks)

		debug("Updated game playtime", game.appid, this.id);
	}

	async updatePlayerAchievementsForGame(gameId)
	{
		let perfect = false;
		try
		{
			const game = new Game(gameId);

			await game.load();

			if (this.hasPlayed(game))
			{
				const achievements = await steam.instance.getPlayerAchievementsForGame(this.id, game.id);
				debug("Reterived player '%s' (%s) achievements for game '%s' (%i)", this.name, this.id, game.name, game.id);

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

					debug("Player '%s' (%s) has unlocked %i achievement(s) in '%s' (%i)", this.name, this.id, updates.length, game.name, game.id);

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

	hasPlayed(game)
	{
		return game.getPlayTimeForPlayer(this.id) !== 0;
	}
};
