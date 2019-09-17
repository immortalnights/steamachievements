'use strict';

const Steam = require('./steam');

let instance;

const singleton = {
	connect: function(apiKey) {
		instance = new Steam(apiKey);
		return Promise.resolve(instance);
	}
};

Object.defineProperty(singleton, 'instance', {
	get: function() {
		return instance;
	}
});

Object.freeze(singleton);

module.exports = singleton;