'use strict';

const express = require('express');
const Database = require('./lib/database');

const app = express();
const router = express.Router();

app.use(express.json());

const db = new Database('achievementhunter');

process.on('unhandledRejection', (reason, p) => {
	console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

db.connect('mongodb://localhost:27017')
.then(() => {
	// app.get('/', (req, res) => res.send('OK'));

	app.use('/', router);

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
		})

	app.listen(2000, () => console.log("Listening on port 2000"))
})
.catch((error) => {
	console.error("Error", error);
	console.log(error);
	// todo exit
});
