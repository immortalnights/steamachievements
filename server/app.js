'use strict';

const subprocess = require('child_process')
const Database = require('./lib/database');

const db = new Database('achievementhunter');
db.connect('mongodb://localhost:27017')
.then(function() {
	return db.initialize();
})
.then(function() {
	const api = subprocess.fork('./api.js');
	const service = subprocess.fork('./service.js');
})
.catch(function(err) {
	console.error(err);
	process.exit(1);
});