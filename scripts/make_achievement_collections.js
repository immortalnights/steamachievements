
const Database = require('../lib/database');
const _ = require('underscore');

process.on('unhandledRejection', (reason, p) => {
	console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
	console.log("***");
	console.log(reason.writeErrors[0].errmsg)
});

const db = new Database('achievementchaser');
db.connect()
.then(function() {

	const extractAchievements = (async function(fromCollection, toCollection) {

		const collection = db.collection(fromCollection);

		const cursor = collection.find({ achievements: { $type: 'array' } });

		// let len = await cursor.count();
		// console.log("got", len, "documents")

		while (await cursor.hasNext()) {
			const doc = await cursor.next();
			// console.log("process", doc.appid, "for", doc.playerId);

			let insert = [];
			if (!_.isEmpty(doc.achievements))
			{
				let obj;

				switch (fromCollection)
				{
					case 'player_games':
					{
						obj = {
							appid: doc.appid,
							playerId: doc.playerId,
						};
						break;
					}
					case 'games':
					{
						obj = {
							appid: doc._id,
							updated: new Date()
						};
						break;
					}
				}

				_.each(doc.achievements, function(achievement) {
					// console.log(achievement);
					insert.push(_.extend(_.clone(obj), achievement));
				});
			}

			// console.log(insert);
			await db.collection(toCollection).insertMany(insert);
		}

		db.close();
	});

	// extractAchievements('player_games', 'player_achievements');
	extractAchievements('games', 'game_achievements');
})
.catch(function(err) {
	console.error(err);
	process.exit(1);
});