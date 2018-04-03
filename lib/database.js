'use strict';

const debug = require('debug')('database');
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
const _ = require('underscore');
// const logging
const util = require('util')

const PLAYER_COLLECTION_NAME = 'players';
const GAMES_COLLECTION_NAME = 'games';

module.exports = class Database {
	constructor(name)
	{
		this.name = name;
	}

	connect(config)
	{
		let url;
		if (config)
		{
			url = 'mongodb://' + config.host + ':' + config.port;
		}
		else
		{
			url = 'mongodb://localhost:27017';
		}

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
		return this.collection(GAMES_COLLECTION_NAME).createIndexes([ {
			key: { 'owners.playerId': 1 }
		}, {
			key: { 'achievements.name': 1 }
		}, {
			key: { 'achievements.players': 1 }
		}, {
			key: { '_id': 1, 'owners.playerId': 1 }
		}, {
			key: { '_id': 1, 'achievements.name': 1 }
		} ]).then(function() {
			debug("Indexes created");
		});
	}

	close()
	{
		this.client.close();
	}

	// conveniance
	collection(name)
	{
		if (!this.db)
		{
			throw new Error("Not yet connected to the database!");
		}
		return this.db.collection(name);
	}

	getPlayers(query)
	{
		const collection = this.collection(PLAYER_COLLECTION_NAME);

		return collection.find(query).toArray();
	}

	getGames(query)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		return collection.find(query).toArray();
	}

	getPlayerGames(query, sort)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		if (!sort)
		{
			sort = {};
		}
		else if (!_.isObject(sort))
		{
			let field = sort;
			sort = {};
			sort[field] = 1;
		}

		if (_.isString(query))
		{
			query = { 'owners.playerId': playerId };
		}
		else if (!_.isObject(query))
		{
			throw new Error("Invalid query specified");
		}

		const aggregate = [{
			$match: query
		}, {
			$project: {
				_id: 1,
				name: 1,
				img_icon_url: 1,
				img_logo_url: 1,
				owners: 1
			}
		}, /* {
			$addFields: {
				owners: {
					$filter: {
						input: '$owners',
						as: 'owner',
						cond: {
							$eq: [ '$$owner.playerId', playerId ]
						}
					}
				}
			}
		},*/ {
			$sort: sort
		}];

		return collection.aggregate(aggregate).toArray();
	}

	getPlayerAchievements(query, options)
	{
		const collection = this.collection(PLAYER_ACHIEVEMENTS_COLLECTION_NAME);
		// return collection.find(query, options).toArray();
		return collection.aggregate([{
			$match: query,
		}, {
			$sort: { 'appid': 1 }
		}, {
			$group: {
				_id: '$appid',
				achievements: {
					$addToSet: '$$ROOT'
				}
			}
		}, {
			$limit: 10
		}]).toArray();
	}

	addPlayer(summary)
	{
		const collection = this.collection(PLAYER_COLLECTION_NAME);

		return collection.insert(summary);
	}

	registerGame(playerId, game, schema)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		let record = _.extend({
			_id: game.appid,
			resynchronized: 'never'
		}, schema, _.pick(game, 'name', 'img_icon_url', 'img_logo_url'));

		const ownerDetails = {
			playerId: playerId,
			added: new Date(),
			playtime_forever: game.playtime_forever,
			playtime_2weeks: []
		};

		if (game.playtime_2weeks)
		{
			ownerDetails.playtime_2weeks.push({
				date: new Date(),
				value: game.playtime_2weeks
			});
		}

		// console.log("find and modify", ownerDetails);
		return collection.findAndModify({
			_id: game.appid
		},
		null,
		{
			$setOnInsert: record,
			$push: { owners: ownerDetails }
		}, {
			upsert: true
		})
		.catch(function(err) {
			console.error("Failed to add game", err);
			return err;
		});
	}

	updateGamePlaytime(id, playerId, playtime_forever, playtime_2weeks)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		return collection.update({
			_id: id,
			'owners.playerId': playerId
		}, {
			$set: {
				'owners.$.playtime_forever': playtime_forever,
				'owners.$.lastPlayed': new Date()
			},
			$push: {
				'owners.$.playtime_2weeks': {
					date: new Date(),
					value: playtime_2weeks
				}
			}
		})
		.catch(function(err) {
			console.error("Failed to update game with new owner", err);
			return err;
		});
	}

	updatePlayer(playerId, data)
	{
		const collection = this.collection(PLAYER_COLLECTION_NAME);

		return collection.updateOne({ _id: playerId }, { $set: data });
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

	setGameAchievementGlobalPercent(id, name, percent)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		return collection.update({
			_id: id,
			'achievements.name': name
		}, {
			$set: { 'achievements.$.percent': percent }
		});
	}

	setGameResynchronizationTime(id)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		return collection.update({
			_id: id
		}, {
			$set: {
				resynchronized: new Date()
			}
		});
	}

	setGameAchievementAchieved(id, playerId, name, unlocktime)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		let data = {};
		data['achievements.$.players.' + playerId]= unlocktime;

		return collection.update({
			_id: id,
			'achievements.name': name
		}, {
			$set: data
		});
	}

	setPerfectGame(id, playerId)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		return collection.update({
			_id: id,
			'owners.playerId': playerId
		}, {
			$set: {
				'owners.$.perfect': true
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

	addGames(games)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		return collection.insert(games);
	}


	getPlayerGameSummary(playerId)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		const aggregate = [ {
			$match: {
				'owners.playerId': playerId
			}
		}, {
			$project: {
				owners: {
					$filter: {
						input: '$owners',
						as: 'owner',
						cond: {
							$eq: [ '$$owner.playerId', playerId ]
						}
					}
				}
			}
		}, {
			$unwind: '$owners'
		}, {
			$project: {
				_id: 1,
				playtime: '$owners.playtime_forever',
				perfect: '$owners.perfect'
			}
		}, {
			$group: {
				_id: null,
				total: {
					$sum: 1
				},
				played: {
					$sum: {
						$cond: { if: { $ne: [ '$playtime', 0 ] }, then: 1, else: 0 }
					}
				},
				unplayed: {
					$sum: {
						$cond: { if: { $eq: [ '$playtime', 0 ] }, then: 1, else: 0 }
					}
				},
				perfected: {
					$sum: {
						$cond: { if: { $eq: [ '$perfect', true ] }, then: 1, else: 0 }
					}
				},
				totalPlaytime: {
					$sum: '$playtime'
				}
			}
		} ];

		return collection.aggregate(aggregate).next();
	}

	getPlayerAchievementSummary(playerId)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		const aggregate = [ {
			$match: {
				'owners.playerId': playerId,
				achievements: { $type: 'array' }
			}
		}, {
			$project: {
				_id: 0,
				achievements: 1
			}
		}, {
			$unwind: '$achievements'
		}, {
			$project: {
				unlocked: {
					$ifNull: [ '$achievements.players.' + playerId, 0 ]
				}
			}
		}, {
			$group: {
				_id: null,
				total: {
					$sum: 1
				},
				unlocked: {
					$sum: {
						$cond: { if: { $ne: [ '$unlocked', 0 ] }, then: 1, else: 0 }
					}
				}
			}
		}];

		return collection.aggregate(aggregate).next();
	}

	getGameCompletionPercentage(playerId, order, limit)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		const aggregate = [ {
			$match: {
				'owners.playerId': playerId,
				'achievements': { $type: 'array' }
			}
		}, {
			$project: {
				_id: 1,
				name: 1,
				appid: 1,
				img_icon_url: 1,
				img_logo_url: 1,
				total: {
					$size: '$achievements'
				},
				unlocked: {
					$size: {
						$filter: {
							input: '$achievements',
							as: 'achievement',
							cond: { $ifNull: [ '$$achievement.players.' + playerId, null ] }
						}
					}
				}
			}
		},
		// Unsupported on MongoDB 3.2
		/*{
			$addFields: {
				percentage: {
					$multiply: [{
						$divide: [ '$unlocked', '$total' ]
					}, 100 ]
				}
			}
		},*/
		{
			$project: {
				_id: 1,
				name: 1,
				appid: 1,
				img_icon_url: 1,
				img_logo_url: 1,
				total: 1, 
				unlocked: 1,
				percentage: {
					$multiply: [{
						$divide: [ '$unlocked', '$total' ]
					}, 100 ]
				}
			}
		}, {
			$match: { $and: [ { 'percentage': { $ne: 100 } } , { 'percentage': { $ne: 0 } } ] }
		}, {
			$sort: { 'percentage': order === 'ASC' ? 1 : -1 }
		}, {
			$limit : limit
		} ];

		return collection.aggregate(aggregate).toArray();
	}

	getGameGlobalPercentage(playerId, order, limit)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		return collection.aggregate([ {
			$match: {
				resynchronized: { $ne: 'never' },
				owners: {
					$elemMatch: {
						playerId: playerId,
						perfect: { $ne: true }
					}
				},
				achievements: { $type: 'array' }
			}
		}, {
			$project: {
				_id: 1,
				name: 1,
				img_icon_url: 1,
				img_logo_url: 1,
				total: {
					$size: '$achievements'
				},
				lowestGlobalPercentage: {
					$min: '$achievements.percent'
				}
			}
		}, {
			$sort: { 'lowestGlobalPercentage': order === 'ASC' ? 1 : -1 }
		}, {
			$limit : limit
		} ]).toArray();
	}

	getAchievementsByGlobalPercentage(playerId, order, limit)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		const match = {
			resynchronized: { $ne: 'never' },
			achievements: {
				$type: 'array'
			},
			'owners.playerId': playerId
		};
		match['achievements.players.' + playerId] = { $exists: 0 };

		const aggregate = [{
			$match: match
		}, {
			$project: {
				_id: 1,
				name: 1,
				achievements: 1,
				img_icon_url: 1,
				img_logo_url: 1
			}
		}, {
			$unwind: '$achievements'
		}, {
			$sort: { 'achievements.percent': order === 'ASC' ? 1 : -1 }
		}, {
			$limit: limit
		}, {
			$group: {
				_id: '$_id',
				name: { $first: '$name' },
				img_icon_url: { $first: '$img_icon_url' },
				img_logo_url: { $first: '$img_logo_url' },
				achievements: { $addToSet: '$achievements' }
			}
		}, {
			$sort: { 'achievements.percent': order === 'ASC' ? 1 : -1 }
		}];

		return collection.aggregate(aggregate).toArray();
	}
}
