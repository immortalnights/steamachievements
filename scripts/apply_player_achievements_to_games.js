
const Database = require('../lib/database');
const _ = require('underscore');

const db = new Database('achievementchaser');
db.connect()
.then(async function() {

	const player_games = db.collection('player_games');
	const games = db.collection('games');

	const cursor = player_games.find({ playtime_forever: { $ne: 0 }, achievements: { $type: 'array' } }, { $project: { _id: 1, appid: 1, playerId: 1, playtime_forever: 1, achievements: 1 } });

	let len = await cursor.count();
	console.log("got", len, "documents");

	while (await cursor.hasNext()) {
		const doc = await cursor.next();
		console.log("process", doc.appid, "for", doc.playerId, doc.playtime_forever);

		let updates = [];
		if (doc.playtime_forever)
		{
			_.each(doc.achievements, function(achievement) {

				let set = {};
				if (achievement.achieved === 1)
				{
					set['achievements.$.players.' + doc.playerId] = achievement.unlocktime ? achievement.unlocktime : true;

					updates.push([{
						_id: doc.appid,
						'achievements.name': achievement.apiname
					}, {
						$set: set
					}]);
				}
			});


			if (!_.isEmpty(updates))
			{
				_.each(updates, async function(obj) {
					console.log(obj[0], obj[1]);
					await games.updateOne(obj[0], obj[1]);
				});
			}
		}
	}

	db.close();
})
.catch(function(err) {
	console.error(err);
	process.exit(1);
});