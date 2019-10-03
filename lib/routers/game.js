'use strict';

const express = require('express');
const debug = require('debug')('router');
const moment = require('moment');
const _ = require('underscore');
const database = require('../databaseconnection');

module.exports = function() {
	const router = express.Router();
	router.route('/Games')
		// get game(s)
		.get((req, res) => {
			database.instance.getGames().then((records) => {
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
		debug("Check game", id);

		database.instance.getGames({ _id: id })
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
			const game = req.game;
			const playerId = req.query.player;

			// remove all other owners
			if (playerId)
			{
				game.owner = game.owners.find(function(owner) { 
					return owner.playerId === playerId;
				});
			}

			delete game.owners;

			// clean up achievements
			if (game.achievements)
			{
				game.achievements.forEach(function(achievement) {
					if (playerId && achievement.players)
					{
						// remove players and replace with this players (if applicable) unlock time
						const unlockedAt = achievement.players[playerId];
						achievement.unlocked = unlockedAt ? moment.unix(unlockedAt).toISOString() : false;
						delete achievement.players;
					}
					else
					{
						achievement.unlocked = false;
					}
				});
			}

			const lastModified = (req.game.resynchronized === 'never') ? moment(0) : moment(req.game.resynchronized);
			res.set('Last-Modified', lastModified.toDate().toUTCString());
			res.set('Cache-Control', 'max-age=300');
			res.send(req.game);
		});

	router.route('/Games/:id/Resynchronize/invoke')
		.put((req, res) => {
			const gameId = req.game._id;
			process.send({ action: 'resynchronize', resource: 'game', id: gameId });

			res.set('Cache-Control', 'no-store');
			res.status(202).send({});
		});
	return router;
};
