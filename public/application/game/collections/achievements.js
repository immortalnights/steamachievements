define(function(require) {
	'use strict';

	Backbone = require('backbone');

	return Backbone.Collection.extend({
		url: function() {
			return 'api/Games/' + encodeURIComponent(this.gameId) + '/Achievements';
		},

		initialize: function(models, options)
		{
			Backbone.Collection.prototype.initialize.call(this, options);

			this.gameId = options.gameId;

			console.assert(this.gameId, "Collection must be constructed with gameId option");
		}
	});
});