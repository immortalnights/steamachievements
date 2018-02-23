'use strict';

const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
const _ = require('underscore');
// const logging

module.exports = class Database {
	constructor(name)
	{
		this.name = name;
	}

	connect(url)
	{
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
		
		this.collection('player_games').createIndex({ appid: 1, playerId: 1 }, { unique: true })
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

	getProfiles(query)
	{
		const collection = this.collection('profiles');

		return collection.find(query).toArray()/*.then((documents) => {
			return documents;
		});*/
	}

	addProfile(profile)
	{
		const collection = this.collection('profiles');

		return collection.insert(profile);
	}

	updateProfile(playerId, profile)
	{
		const collection = this.collection('profiles');

		return collection.updateOne({ _id: playerId }, { $set: profile });
	}

	getPlayerGames(query, fields, options)
	{
		const collection = this.collection('player_games');

		return collection.find(query, fields, options).toArray();
	}

	addGames(playerId, games)
	{
		const properties = {
			playerId: playerId,
			achievements: 'pending',
			added: new Date(),
			updated: new Date(0)
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

		const collection = this.collection('player_games');

		return collection.insert(games);
	}

	updateGamePlaytime(id, forever, twoWeeks)
	{
		const collection = this.collection('player_games');

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
		const collection = this.collection('player_games');

		return collection.updateOne({ _id: id }, {
			$set: {
				achievements: achievements,
				updated: new Date()
			},
		});
	}
}
