define(function(require) {
	'use strict';

	const Marionette = require('backbone.marionette');
	const Router = require('core/router');
	const PlayerRouter = require('player/router');
	const GameRouter = require('game/router');
	const viewmixin = require('core/viewmixin');
	const translation = require('core/translation');
	const moment = require('moment');
	const rootTemplate = require('tpl!core/templates/root.html');

	const Application = Marionette.Application.extend({
		region: 'main',

		initialize: function(options)
		{
			Marionette.Application.prototype.initialize.call(this, options);
		},

		onStart: function()
		{
			moment.updateLocale('en', {
				calendar: {
					sameElse : 'L [at] LT'
				}
			});
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

	let app = null;
	return function() {
		if (!app)
		{
			app = new Application();
		}

		return app;
	}
});