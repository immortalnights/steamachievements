define(function(require) {
	'use strict';

	const Backbone = require('backbone');

	return Backbone.Collection.extend({
		url: function() {
			return 'api/Players/' + encodeURIComponent(this.options.playerId) + '/Games';
		},

		initialize: function(models, options)
		{
			Backbone.Collection.prototype.initialize.call(this, options);

			this.options = options;

			console.assert(this.options.playerId, "Collection must be constructed with playerId option");
		}
	});
});