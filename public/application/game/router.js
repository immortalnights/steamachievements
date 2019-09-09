define(function(require) {
	'use strict';

	const Marionette = require('backbone.marionette');
	const Game = require('game/models/game');
	const Layout = require('game/layout');
	const errorTemplate = require('tpl!core/templates/errorresponse.html');

	const loadGame = function(id) {
		let game = new Game({
			id: id
		});

		return game.fetch().then(function(response) { return game; });
	}

	const screenFactory = function(fnc, ctx) {
		return function() {
			var args = _.toArray(arguments);
			_.defer(function() {
				var screen = fnc.apply(ctx, args);
				ctx.getApp().showScreen(screen);
			});
		}
	}

	const renderIfResynchronized = function(model, callback) {
		let resynchronizationState = model.get('resynchronized');
		if (resynchronizationState === 'never' || resynchronizationState === 'pending')
		{
			setTimeout(function() {
				model.fetch().then(_.bind(renderIfResynchronized, null, model, callback));
			}, 10000);
		}
		else
		{
			callback();
		}
	}

	return Marionette.AppRouter.extend({
		routes: {
			'game/:id': 'game'
		},

		initialize: function(options)
		{
			Marionette.AppRouter.prototype.initialize.call(this, options);
		},

		getApp: function()
		{
			return require('application')();
		},

		game: function(id)
		{
			loadGame(id)
			.then(screenFactory(function(model) {
				return new Layout({
					model: model
				});
			}, this))
			.fail(_.bind(function(response) {
				this.getApp().showScreen(new Marionette.View({
					class: 'page-error',
					template: errorTemplate,
					model: new Backbone.Model(response)
				}));
			}, this));
		}
	});
});