'use strict';

const express = require('express');
const debug = require('debug')('router');
const moment = require('moment');
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
		debug("Check game", id);

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

			delete req.game.owners;

			let players = _.isArray(req.query.players) ? req.query.players : [req.query.players];
			_.each(req.game.achievements, function(achievement) {
				if (!_.isEmpty(players))
				{
					achievement.players = _.pick(achievement.players, players);
				}
				else
				{
					delete achievement.players;
				}
			});

			req.game.achievements = _.sortBy(req.game.achievements, function(achievemnt) {
				return -achievemnt.players[players[0]]
			});

			const lastModified = (req.game.resynchronized === 'never') ? moment() : moment(req.game.resynchronized);
			res.set('Last-Modified', lastModified.toDate().toUTCString());
			res.set('Cache-Control', 'maxAge=86400');
			res.send(req.game);
		});

	return router;
};
