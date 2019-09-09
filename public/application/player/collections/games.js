define(function(require) {
	'use strict';

	const Backbone = require('backbone');

	return Backbone.Collection.extend({
		url: function() {
			return 'api/Players/' + encodeURIComponent(this.playerId) + '/Games';
		},

		initialize: function(models, options)
		{
			Backbone.Collection.prototype.initialize.call(this, options);

			this.playerId = options.playerId;

			console.assert(this.playerId, "Collection must be constructed with playerId option");
		}
	});
});