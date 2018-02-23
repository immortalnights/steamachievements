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
			console.log("post profile", data);

			db.getProfiles({ _id: data.id }).then((records) => {
				console.log("Got profile?", records.length, records.length === 0);
				if (records.length === 0)
				{
					// assumes the user Id is profiles
					// TODO resolve fancy steam URL
					let profile = {
						_id: data.id,
						added: new Date(),
						updated: new Date(0)
					};

					console.log("add profile")
					db.addProfile(profile).then(() => {
						console.log("OK")
						res.status(201).send(profile);
					}).catch((error) => {
						console.error("Error", error);
						res.send(error);
					});
				}
				else
				{
					console.log("Eh");
					res.send("Nothing");
				}
			}).catch((error) => {
				console.error("Error", error);
				res.send(error);
			});
		});

	router.route('/profiles/:id')
		// get profile
		.get((req, res) => {
			db.getProfile({ _id: id }).then((records) => {
				res.send(records);
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
