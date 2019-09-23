define(function(require) {
	'use strict';

	const Backbone = require('backbone');

	return Backbone.Model.extend({
		url: function() { return '/api/Games/' + encodeURIComponent(this.id); },

		resynchronize: function()
		{
			return Backbone.ajax({
				url: this.url() + '/Resynchronize/invoke/',
				method: 'put',
				data: JSON.stringify({}),
				contentType: 'application/json'
			});
		}
	});
});