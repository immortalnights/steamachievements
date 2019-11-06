'use strict';

const Database = require('./database');

let instance;

const singleton = {
	connect: function(name, options) {
		console.assert(!instance, "Database instance is already connected");

		instance = new Database(name);
		return instance.connect(options).then(function() {
			return instance;
		});
	}
};

Object.defineProperty(singleton, 'instance', {
	get: function() {
		return instance;
	}
});

Object.freeze(singleton);

module.exports = singleton;