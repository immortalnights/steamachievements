'use strict';

const express = require('express');
const config = require('./config.json');
const Database = require('./lib/database');

process.on('unhandledRejection', (reason, p) => {
	console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

const db = new Database('achievementhunter');
db.connect('mongodb://localhost:27017')
.then(() => {
	const app = express();

	// JSON middleware
	app.use(express.json());

	// Catch-all debugging
	// app.use(function(req, res, next) {
	// 	console.log("Catch-all route");
	// 	next();
	// });

	// API router
	const router = express.Router();
	router.use(function(req, res, next) {
		console.log("Route API");
		next();
	});
	router.route('/error').get((req, res) => { throw new Error("T"); });
	router.route('/profiles')
		// get profile(s)
		.get((req, res) => {
			db.getProfiles().then((records) => {
				res.send(records);
			}).catch((error) => {
				console.error("Error", error);
				res.send(error);
			});
		})
		// create profile
		.post((req, res) => {
			const data = req.body;

			if (data.identifier)
			{
				db.getProfiles({ _id: data.identifier }).then((records) => {
					console.log("Got profile?", records.length === 1);
					if (records.length === 1)
					{
						// Exists
						res.send(records[0]);
					}
					else if (records.length === 0)
					{
						// assumes the user Id is profiles
						// TODO resolve fancy steam URL
						let profile = {
							_id: data.identifier,
							added: new Date(),
							updated: new Date(0)
						};

						console.log("add profile")
						db.addProfile(profile).then(() => {
							res.status(201).send(profile);
						}).catch((error) => {
							console.error("Error", error);
							res.send(error);
						});
					}
					else
					{
						res.status(500).send({ error: "Unexpected result from database." });
					}
				}).catch((error) => {
					console.error("Error", error);
					res.send(error);
				});
			}
			else
			{
				console.log("Received data:", req.body, typeof (req.body));
				res.status(400).send({ error: "Invalid player Id (missing identifier)" });
			}
		});
	router.route('/profiles/:id')
		// get profile
		.get((req, res) => {
			db.getProfiles({ _id: req.params.id }).then((records) => {
				if (records.length === 1)
				{
					res.send(records[0]);
				}
				else
				{
					res.status(404).send({ error: "Unable to find requested profile." });
				}
			}).catch((error) => {
				console.error("Error", error);
				res.send(error);
			});
		});

	// Apply API router
	app.use('/api', router);

	app.use(express.static('public'));
	app.use('/node_modules', express.static('node_modules'));

	const port = config.HTTPPort || 8080
	console.log("Starting express server on", port);

	try
	{
		app.listen(port, () => console.log("Listening on port", port));
	}
	catch (err)
	{
		console.error("Failed to start Express", err);
	}
})
.catch((error) => {
	console.error("Error", error);
	console.log(error);
	// todo exit
});
