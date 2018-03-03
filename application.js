'use strict';

const subprocess = require('child_process')
const Database = require('./lib/database');

const db = new Database('achievementhunter');
db.connect('mongodb://localhost:27017')
.then(function() {
	return db.initialize();
})
.then(function() {
	// fork the web server (API and UI)
	const web = subprocess.fork('./web.js');
	// fork the service for updating the db
	// const service = subprocess.fork('./service.js');
})
.catch(function(err) {
	console.error(err);
	process.exit(1);
});