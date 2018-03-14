'use strict';

const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
const _ = require('underscore');
// const logging

// const PLAYER_COLLECTION_NAME = 'players';
const PLAYER_COLLECTION_NAME = 'profiles';
const PLAYER_GAMES_COLLECTION_NAME = 'player_games';
const PLAYER_ACHIEVEMENTS_COLLECTION_NAME = 'player_achievements';
const GAMES_COLLECTION_NAME = 'games';
const GAMES_ACHIEVEMENTS_COLLECTION_NAME = 'game_achievements';

module.exports = class Database {
	constructor(name)
	{
		this.name = name || 'achievementchaser';
	}

	connect(url)
	{
		url = url || 'mongodb://localhost:27017';

		return MongoClient.connect(url).then((client) => {
			this.client = client;
			this.db = client.db(this.name);
		});
	}

	/**
	 * Create teh collections and indexes
	 */
	initialize()
	{
		// console.log(this.db)
		// const collections = this.db.getCollectionNames();

		// console.log(collections);
		// if (!this.collection('profiles'))
		// {
		// 	this.db.createCollection('profiles');
		// }

		// if (!this.collection('player_games'))
		// {
		// 	this.db.createCollection('player_games');
		// }
		
		this.collection(PLAYER_GAMES_COLLECTION_NAME).createIndex({ appid: 1, playerId: 1 }, { unique: true })
	}

	close()
	{
		this.client.close();
	}

	// conveniance
	collection(name)
	{
		return this.db.collection(name);
	}

	getPlayers(query)
	{
		const collection = this.collection(PLAYER_COLLECTION_NAME);

		return collection.find(query).toArray()/*.then((documents) => {
			return documents;
		});*/
	}

	addPlayer(summary)
	{
		const collection = this.collection(PLAYER_COLLECTION_NAME);

		return collection.insert(summary);
	}

	updatePlayer(playerId, summary)
	{
		const collection = this.collection(PLAYER_COLLECTION_NAME);

		return collection.updateOne({ _id: playerId }, { $set: summary });
	}

	getPlayerGames(query, options)
	{
		const collection = this.collection(PLAYER_GAMES_COLLECTION_NAME);
		return collection.find(query, options).toArray();
	}

	addPlayerGames(playerId, games)
	{
		const properties = {
			playerId: playerId,
			achievements: 'pending',
			added: new Date(),
			games: new Date(0)
		};

		_.each(games, function(game) {
			_.extend(game, properties);

			if (game.playtime_2weeks)
			{
				game.playtime = [{
					time: game.playtime_2weeks,
					date: new Date()
				}];

				delete game.playtime_2weeks;
			}
		});

		const collection = this.collection(PLAYER_GAMES_COLLECTION_NAME);

		return collection.insert(games);
	}

	updateGamePlaytime(id, forever, twoWeeks)
	{
		const collection = this.collection(PLAYER_GAMES_COLLECTION_NAME);

		return collection.updateOne({ _id: id }, {
			$set: {
				playtime_forever: forever,
				updated: new Date()
			},
			$push: {
				playtime: {
					time: twoWeeks,
					date: new Date()
				}
			}
		});
	}

	updateGameAchievements(id, achievements)
	{
		const collection = this.collection(PLAYER_GAMES_COLLECTION_NAME);

		return collection.updateOne({ _id: id }, {
			$set: {
				achievements: achievements,
				updated: new Date()
			},
		});
	}

	getPlayerGamesWithoutSchema()
	{
		const collection = this.collection(PLAYER_GAMES_COLLECTION_NAME);

		return collection.aggregate([ {
			$lookup: {
				from: GAMES_COLLECTION_NAME,
				localField: 'appid',
				foreignField: '_id',
				as: 'schema' }
			}, {
				$match: { schema: { $eq: [] } }
			} ]).toArray();
	}

	getGames()
	{

	}

	addGames(games)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		return collection.insert(games);
	}

	getPlayerGameSummary(query)
	{
		const collection = this.collection(PLAYER_GAMES_COLLECTION_NAME);

		const aggregate = [ {
			$match: query
		}, {
			$group: {
				'_id': null,
				'total': {
					$sum: 1,
				},
				'played': {
					$sum: {
						$cond: { if: { $ne: [ '$playtime_forever', 0 ] }, then: 1, else: 0 }
					}
				},
				'unplayed': {
					$sum: {
						$cond: { if: { $eq: [ '$playtime_forever', 0 ] }, then: 1, else: 0 }
					}
				},
				'perfect': {
					$sum: {
						$cond: { if: { $eq: [ '$completed', true ] }, then: 1, else: 0 }
					}
				},
				'totalPlaytime': {
					$sum: "$playtime_forever"
				}
			}
		} ];

		// console.log("aggregate", aggregate);
		return collection.aggregate(aggregate).next();
	}

	getPlayerAchievementSummary(query)
	{
		const collection = this.collection(PLAYER_ACHIEVEMENTS_COLLECTION_NAME);

		const aggregate = [ {
			$match: query
		}, {
			$group: {
				_id: null,
				total: { $sum: 1 },
				unlocked: { $sum: '$achieved' }
			}
		} ];

		// console.log("aggregate", aggregate);
		return collection.aggregate(aggregate).next();
	}

	getGameCompletionPercentage(playerId, order, limit)
	{
		const collection = this.collection(PLAYER_ACHIEVEMENTS_COLLECTION_NAME);

		const aggregate = [ {
			$match: {
				playerId: playerId
			}
		}, {
			$group: {
				_id: '$appid',
				total: { $sum: 1 },
				unlocked: { $sum: '$achieved' }
			}
		}, {
			$addFields: {
				percentage: {
					$multiply: [{
						$divide: [ '$unlocked', '$total' ]
					}, 100 ]
				}
			}
		}, {
			$match: { $and: [ { 'percentage': { $ne: 100 } } , { 'percentage': { $ne: 0 } } ] }
		}, {
			$sort: { 'percentage': order === 'DESC' ? 1 : -1 }
		}, {
			$limit : limit
		}, {
			$lookup: {
				from: PLAYER_GAMES_COLLECTION_NAME,
				let: {
					appid: '$_id'
				},
				pipeline: [{
					$match: {
						playerId: playerId,
						$expr: { $eq: [ "$appid", "$$appid"] }
					},
				}, {
					$project: {
						_id: 0,
						name: 1,
						img_icon_url: 1,
						img_logo_url: 1,
						playtime_forever: 1
					}
				}],
				as: 'schema'
			}
		}, {
			$replaceRoot: { newRoot: { $mergeObjects: [ { $arrayElemAt: [ '$schema', 0 ] }, '$$ROOT' ] } }
		}, {
			$project: { schema: 0 }
		} ];

		return collection.aggregate(aggregate).toArray();
	}

	getGameGlobalPercentage(playerId, order, limit)
	{
		const collection = this.collection(PLAYER_GAMES_COLLECTION_NAME);

		return collection.aggregate([ {
			$match: {
				playerId: playerId,
				completed: { $ne: true },
				achievements: { $type: 'array' }
			}
		}, {
			$lookup: {
				from: GAMES_COLLECTION_NAME,
				localField: 'appid',
				foreignField: '_id',
				as: 'schema'
			}
		}, {
			"$unwind": "$schema"
		}, {
			$project: {
				_id: null,
				appid: 1,
				name: 1,
				img_icon_url: 1,
				img_logo_url: 1,
				total: {
					$size: '$achievements'
				},
				lowestGlobalPercentage: {
					$min: '$schema.achievements.percent'
				}
			}
		}, {
			$sort: { 'lowestGlobalPercentage': order === 'DESC' ? 1 : -1 }
		}, {
			$limit : limit
		} ]).toArray();
	}
}
