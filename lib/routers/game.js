'use strict';

const express = require('express');
const _ = require('underscore');

module.exports = function(db, steam) {
	const router = express.Router();
	router.route('/Games')
		// get game(s)
		.get((req, res) => {
			db.getGames().then((records) => {
				res.set('Cache-Control', 'public, no-cache');
				res.send(records);
			}).catch((error) => {
				console.error("Error", error);
				res.set('Cache-Control', 'no-store');
				res.send(error);
			});
		});

	router.param('id', (req, res, next, id) => {
		id = Number(id);
		console.log("Check game", id);

		db.getGames({ _id: id })
		.then(function(records) {
			if (records.length === 1)
			{
				req.game = records[0];
				return next();
			}
			else
			{
				res.set('Cache-Control', 'no-store');
				res.status(404).send({ error: "Game not found." });
			}
		});
	});

	router.route('/Games/:id')
		.get((req, res) => {
			res.set('Last-Modified', moment(req.game.resynchronized).toDate().toUTCString());
			res.set('Cache-Control', 'maxAge=86400');
			res.send(req.game);
		});

	// router.route('/Games/:id/Games')
	// 	.get((req, res) => {
	// 		const playerId = req.player._id;
	// 		const queryString = parseQueryString(req.query['query']);
	// 		const orderBy = parseOrderBy(req.query['order-by']);

	// 		let query;
	// 		switch (orderBy.key)
	// 		{
	// 			case 'percent':
	// 			{
	// 				query = db.getGameCompletionPercentage(playerId, orderBy.order, DEFAULT_RESULT_LIMIT);
	// 				break;
	// 			}
	// 			case 'globalPercentage':
	// 			{
	// 				query = db.getGameGlobalPercentage(playerId, orderBy.order, DEFAULT_RESULT_LIMIT);
	// 				break;
	// 			}
	// 			default:
	// 			{
	// 				query = db.getPlayerGames({
	// 					owners: {
	// 						$elemMatch: {
	// 							playerId: playerId,
	// 							perfect: { $eq: true }
	// 						}
	// 					}
	// 				}, 'name')
	// 				.then(function(documents) {
	// 					_.each(documents, function(doc) {
	// 						delete doc.owners;
	// 					});

	// 					return documents;
	// 				});
	// 				break;
	// 			}
	// 		}

	// 		query.then(function(documents) {
	// 			res.send(documents);
	// 		})
	// 		.catch(function(err) {
	// 			console.error("Failed to query player games", err)
	// 			res.status(400).send({ error: "Failed to query player games."});
	// 		});
	// 	});

	router.route('/Games/:id/Achievements')
		.get((req, res) => {
			const gameId = req.game._id;
			console.log("get game achievements", gameId);

			// query.then(function(record) {
			// 	res.send(record);
			// })
			// .catch(function(err) {
			// 	console.error("Failed to query game achievements", err)
				res.set('Cache-Control', 'no-store');
				res.send(400).send({ error: "Failed to query game achievements."});
			// });
		});

	return router;
};
