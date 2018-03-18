
const Database = require('../lib/database');
const _ = require('underscore');

const db = new Database('achievementchaser');
db.connect()
.then(function() {

	(async function() {

		const collection = db.collection('player_games');

		const cursor = collection.find({ achievements: { $type: 'array' } }, { $project: { _id: 1, appid: 1, playerId: 1, playtime_forever: 1, achievements: 1 } });

		// let len = await cursor.count();
		// console.log("got", len, "documents")

		let update = [];
		while (await cursor.hasNext()) {
			const doc = await cursor.next();
			// console.log("process", doc.appid, "for", doc.playerId);

			if (doc.playtime_forever)
			{
				if (_.every(doc.achievements, function(achievement) { return 1 === achievement.achieved; }))
				{
					update.push(doc._id);
				}
			}
		}

		// console.log(update)
		await collection.updateMany({ _id: { $in: update } }, { $set: { completed: true } });

		db.close();
	})();
})
.catch(function(err) {
	console.error(err);
	process.exit(1);
});