'use strict';

const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
// const logging

module.exports = class Database {
	constructor()
	{
	}

	connect(url, database)
	{
		return MongoClient.connect(url).then((client) => {
			this.client = client;
			this.db = client.db(database);
		});
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

	updateProfile(profile)
	{
		const collection = this.collection('profiles');

		return collection.updateOne({ _id: profile._id }, { $set: profile });
	}
}
