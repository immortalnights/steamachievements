define(function(require) {
	'use strict';

	const Backbone = require('backbone');

	return Backbone.Model.extend({
		url: function() { return '/api/Games/' + encodeURIComponent(this.id); }
	});
});