
const Database = require('../lib/database');
const _ = require('underscore');

const db = new Database('achievementchaser');
db.connect()
.then(async function() {

	const player_games = db.collection('player_games');
	const games = db.collection('games');

	const cursor = player_games.find();

	let len = await cursor.count();
	console.log("got", len, "documents");

	while (await cursor.hasNext()) {
		const doc = await cursor.next();
		console.log("process", doc.appid, "for", doc.playerId, doc.playtime_forever);

		await games.updateOne({ _id: doc.appid }, {
			$set: {
				name: doc.name
			},
			$push: {
				owners: {
					playerId: doc.playerId,
					added: doc.added,
					playtime_forever: doc.playtime_forever,
					playtime_2weeks: doc.playtime_2weeks
				}
			}
		});
	}

	db.close();
})
.catch(function(err) {
	console.error(err);
	process.exit(1);
});