define(function(require) {
	'use strict';

	var Marionette = require('backbone.marionette');
	var Router = require('core/router');
	var PlayerRouter = require('player/router');
	var GameRouter = require('game/router');
	var viewmixin = require('core/viewmixin');
	var translation = require('core/translation');
	var rootTemplate = require('tpl!core/templates/root.html');

	var Application = Marionette.Application.extend({
		region: 'main',

		initialize: function(options)
		{
			Marionette.Application.prototype.initialize.call(this, options);
		},

		onStart: function()
		{
			// this.showView(new Marionette.View({
			// 	template: rootTemplate,

			// 	regions: {
			// 		navLocation: '#nav',
			// 		mainLocation: 'main'
			// 	}
			// }));

			new Router();
			new PlayerRouter();
			new GameRouter();

			Backbone.history.start();
		},

		showScreen: function(view)
		{
			console.assert(view instanceof Marionette.View);

			// this.getView().showChildView('mainLocation', view);
			this.showView(view);
		}
	});

	var app = null;
	return function() {
		if (!app)
		{
			app = new Application();
		}

		return app;
	}
});