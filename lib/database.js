'use strict';

const debug = require('debug')('database');
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
const _ = require('underscore');
const moment = require('moment');
// const logging
const util = require('util')

const PLAYERS_COLLECTION_NAME = 'players';
const GAMES_COLLECTION_NAME = 'games';

module.exports = class Database {
	constructor(name)
	{
		this.name = name;
		this.client = null;
		this.db = null;
	}

	connect(config)
	{
		if (!config)
		{
			config = {};
		}

		config.host = config.host || 'localhost';
		config.port = config.port || 27017;

		const url = 'mongodb://' + config.host + ':' + config.port;

		console.log("Connecting to database '%s'", url);
		return MongoClient.connect(url, {
			autoReconnect: true
		}).then((client) => {
			this.client = client;
			this.db = client.db(this.name);

			this.db.on('close', function() {
				console.log("%s Database connection closed", moment().toISOString());
			});
			this.db.on('reconnect', function() {
				console.log("%s Database has automatically reconnected", moment().toISOString());
			});
			this.db.on('error', function() {
				console.warn("%s Database error %o", moment().toISOString(), arguments);
			});
			this.db.on('timeout', function() {
				console.log("%s Database timeout", moment().toISOString());
			});
		});
	}

	/**
	 * Create teh collections and indexes
	 */
	initialize()
	{
		this.players = this.db.collection(PLAYERS_COLLECTION_NAME);
		this.games = this.db.collection(GAMES_COLLECTION_NAME);

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

	getPlayers(query, ...args)
	{
		return this.players.find(query, ...args).toArray().then(function(documents) {
			// Never expose player friends (perhaps should use aggregate)
			_.each(documents, function(player) {
				if (player.friends)
				{
					player.friends = player.friends.length;
				}
				else
				{
					player.friends = 0;
				}
			});

			return documents;
		});
	}

	getGames(query, ...args)
	{
		return this.games.find(query, ...args).toArray();
	}

	getPlayerFriends(playerId)
	{
		const collection = this.collection(PLAYERS_COLLECTION_NAME);

		var aggregate = [{
			$match: {
				_id: playerId
			}
		}, {
			$project: {
				_id: 0,
				friends: 1
			}
		}, {
			$unwind: '$friends'
		}, {
			$project: {
				friend: '$friends',
			}
		}, {
			$lookup: {
				from: PLAYERS_COLLECTION_NAME,
				localField: 'friend.steamid',
				foreignField: '_id',
				as: 'player'
			}
		}];

		return collection.aggregate(aggregate).toArray();
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
			query = { 'owners.playerId': query };
		}
		else if (_.isObject(query) === false)
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

		// console.log(query, aggregate);
		return collection.aggregate(aggregate).toArray();
	}

	addPlayer(summary)
	{
		const collection = this.collection(PLAYERS_COLLECTION_NAME);

		// console.debug("***", summary);
		return collection.insertOne(summary);
	}

	registerGame(playerId, game, schema)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		let record = _.extend({
			_id: game.appid,
			resynchronized: 'never',
		}, schema, _.pick(game, 'name', 'img_icon_url', 'img_logo_url'));

		const ownerDetails = {
			playerId: playerId,
			added: new Date(),
			playtime_forever: game.playtime_forever,
			playtime_2weeks: [],
			perfect: false,
			resynchronize: true
		};

		if (game.playtime_2weeks)
		{
			ownerDetails.playtime_2weeks.push({
				date: new Date(),
				value: game.playtime_2weeks
			});

			// Set lastPlayed if the game has recent play time
			debug("'%s' has been recently played for %i minutes", game.name, game.playtime_2weeks);
			ownerDetails.lastPlayed = new Date();
		}

		// console.log("find and modify", ownerDetails);
		return collection.findOneAndUpdate({
			_id: game.appid
		},
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

		return collection.updateOne({
			_id: id,
			'owners.playerId': playerId
		}, {
			$set: {
				'owners.$.playtime_forever': playtime_forever,
				'owners.$.lastPlayed': new Date(),
				'owners.$.resynchronize': true,
				'resynchronize': true
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
		const collection = this.collection(PLAYERS_COLLECTION_NAME);

		return collection.updateOne({ _id: playerId }, { $set: data });
	}

	updateGame(id, data)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		return collection.updateOne({ _id: id }, { $set: data });
	}

	setGameAchievementGlobalPercent(id, achievements)
	{
		const unordered = this.collection('games').initializeUnorderedBulkOp();

		_.each(achievements, function(achievement) {
			unordered.find({
				_id: id,
				'achievements.name': achievement.name
			}).updateOne({
				$set: { 'achievements.$.percent': achievement.percent }
			});
		});

		return unordered.execute();
	}

	setGameAchievementAchieved(id, playerId, name, unlocktime)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		let data = {};
		data['achievements.$.players.' + playerId] = unlocktime;

		return collection.updateOne({
			_id: id,
			'achievements.name': name
		}, {
			$set: data
		});
	}

	updateOwnedGame(id, playerId, data)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		const keys = Object.keys(data);
		keys.forEach(function(key) {
			data['owners.$.' + key] = data[key];
			delete data[key];
		});

		return collection.updateOne({
			_id: id,
			'owners.playerId': playerId
		}, {
			$set: data
		});
	}

	setPerfectGame(id, playerId)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		return collection.updateOne({
			_id: id,
			'owners.playerId': playerId
		}, {
			$set: {
				'owners.$.perfect': true
			}
		});
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

		return collection.aggregate(aggregate).next().then(function(document) {
			return document || {};
		});
	}

	getPlayerAchievementSummary(playerId)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		const aggregate = [ {
			$match: {
				'owners.playerId': playerId,
				achievements: { $ne: false }
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

		return collection.aggregate(aggregate).next().then(function(document) {
			return document || {};
		});
	}

	getPlayerRecentGames(playerId, limit)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		const aggregate = [{
			$match: {
				owners: {
					$elemMatch: {
						playerId: playerId,
						lastPlayed: { $exists: 1 },
						playtime_2weeks: { $not: { $size: 0 } }
					}
				}
			}
		},
		{
			$project: {
				_id: 1,
				name: 1,
				img_icon_url: 1,
				img_logo_url: 1,
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
		},
		{
			$sort: {
				'owners.lastPlayed': -1
			}
		},
		{
			$limit: limit
		}];

		return collection.aggregate(aggregate).toArray();
	}

	getPlayerRecentAchievements(playerId, limit)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		let query = {};
		query['achievements.players.' + playerId] = { $exists: 1 };
		query['achievements.players.' + playerId] = { $ne: true };

		let sort = {};
		sort['achievements.players.' + playerId] = -1;

		return collection.find(query)
		.project({
			_id: 1,
			name: 1,
			img_icon_url: 1,
			img_logo_url: 1,
			achievements: 1
		})
		.sort(sort)
		.limit(limit).toArray().then(function(documents) {
			// filter the achievements down to the most recently unlocked

			let keep = [];
			_.each(documents, function(doc) {
				_.each(doc.achievements, function(achievement) {
					let players = achievement.players;
					if (players && players[playerId])
					{
						keep.push(_.extend({
							appid: doc._id,
							appname: doc.name,
							unlocked: players[playerId]
						}, achievement));

						keep =  _.sortBy(keep, 'unlocked');

						keep.splice(0, Math.max(0, keep.length - limit));
					}
				});
			});

			let keepNames = _.pluck(keep, 'name');

			// keep contains the latest three achievements
			documents = _.filter(documents, function(doc) {
				doc.achievements = _.filter(doc.achievements, function(achievement) {
					return _.contains(keepNames, achievement.name);
				});

				return !_.isEmpty(doc.achievements);
			});

			return documents;
		});
	}

	getGameCompletionPercentage(playerId, order, limit)
	{
		const collection = this.collection(GAMES_COLLECTION_NAME);

		const aggregate = [ {
			$match: {
				'owners.playerId': playerId,
				'achievements': { $ne: false }
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
				achievements: { $ne: false }
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

		const matchIncomplete = {};
		matchIncomplete['achievements.players.' + playerId] = { $exists: 0 };

		const aggregate = [{
			$match: {
				resynchronized: { $ne: 'never' },
				achievements: { $ne: false },
				owners: {
					$elemMatch: {
						playerId: playerId,
						perfect: { $ne: true }
					}
				}
			}
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
			$match: matchIncomplete
		}, {
			$sort: { 'achievements.percent': order === 'ASC' ? 1 : -1 }
		}, {
			$limit: limit
		}, {
			$sort: { 'achievements.percent': 1 }
		}, {
			$group: {
				_id: '$_id',
				name: { $first: '$name' },
				img_icon_url: { $first: '$img_icon_url' },
				img_logo_url: { $first: '$img_logo_url' },
				achievements: { $addToSet: '$achievements' }
			}
		}];

		return collection.aggregate(aggregate).toArray();
	}
}
