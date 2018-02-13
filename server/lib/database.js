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

	getProfiles(query)
	{
		const collection = this.db.collection('profiles');

		return collection.find(query).toArray()/*.then((documents) => {
			return documents;
		});*/
	}

	addProfile(profile)
	{
		const collection = this.db.collection('profiles');

		return collection.insert(profile);
	}
}
