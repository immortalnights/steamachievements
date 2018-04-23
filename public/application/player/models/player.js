define(function(require) {
	'use strict';

	var Backbone = require('backbone');

	return Backbone.Model.extend({
		url: function() { return '/api/Players/' + encodeURIComponent(this.id); },

		resynchronize: function()
		{
			return Backbone.ajax({
				url: this.url() + '/Resynchronize/invoke/?force=true',
				method: 'put',
				data: JSON.stringify({}),
				contentType: 'application/json'
			});
		}
	});
});