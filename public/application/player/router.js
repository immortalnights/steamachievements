define(function(require) {
	var Marionette = require('backbone.marionette');
	var Player = require('player/models/player');
	var Profile = require('player/profile');
	var Lists = require('player/gamelists');
	var PerfectGames = require('player/perfectgames');
	var errorTemplate = require('tpl!core/templates/errorresponse.html');

	var loadPlayer = function(id) {
		var player = new Player({
			id: id
		});

		return player.fetch().then(function() { return player; });
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

	return Marionette.AppRouter.extend({
		routes: {
			'player': 'player',
			'player/:id': 'player',
			'player/:id/perfect': 'playerPerfect'
		},

		initialize: function(options)
		{
			Marionette.AppRouter.prototype.initialize.call(this, options);
		},

		getApp: function()
		{
			return require('application')();
		},

		player: function(id)
		{
			loadPlayer(id)
			.then(screenFactory(function(model) {
				var profile = new Profile({
					model: model
				});

				// must be rendered after
				profile.showChildView('bodyLocation', new Lists({ model: model }));

				return profile;
			}, this))
			.fail(_.bind(this.playerUnknown, this));
		},

		playerPerfect: function(id)
		{
			loadPlayer(id)
			.then(screenFactory(function(model) {
				var profile = new Profile({
					model: model
				});

				profile.showChildView('bodyLocation', new PerfectGames({ model: model }));

				return profile;
			}, this))
			.fail(_.bind(this.playerUnknown, this));
		},

		playerUnknown: function(response)
		{
			this.getApp().showScreen(new Marionette.View({
				class: 'page-error',
				template: errorTemplate,
				model: new Backbone.Model(response)
			}));
		}
	});
});