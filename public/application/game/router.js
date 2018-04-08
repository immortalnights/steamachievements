define(function(require) {
	var Marionette = require('backbone.marionette');
	var Game = require('game/models/game');
	var template = require('tpl!game/templates/layout.html');
	var achievementTemplate = require('tpl!game/templates/achievement.html');
		// var Lists = require('player/gamelists');
	var errorTemplate = require('tpl!core/templates/errorresponse.html');

	var loadGame = function(id) {
		var game = new Game({
			id: id
		});

		return game.fetch().then(function(response) { return game; });
	}

	var screenFactory = function(fnc, ctx) {
		return function() {
			var args = _.toArray(arguments);
			_.defer(function() {
				var screen = fnc.apply(ctx, args);
				ctx.getApp().showScreen(screen);
			});
		}
	}

	var renderIfResynchronized = function(model, callback) {
		var resynchronizationState = model.get('resynchronized');
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
				var view = new Marionette.View({
					template: template,
					model: model,
					regions: {
						achievementsLocation: '#achievements'
					}
				});

				var achievements = new Backbone.Collection(model.get('achievements'), {
					comparator: function(achievement) {
						return -achievement.get('percent');
					}
				});
				achievements.sort();

				view.showChildView('achievementsLocation', new Marionette.NextCollectionView({
					className: 'achievement-list',
					collection: achievements,
					childView: Marionette.View,
					childViewOptions: {
						template: achievementTemplate
					}
				}));

				return view;
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