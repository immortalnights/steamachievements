define(function(require) {
	'use strict';

	const Marionette = require('backbone.marionette');
	const Player = require('player/models/player');
	const Game = require('game/models/game');

	const Layout = require('player/layout');
	const Default = require('player/default');
	const RecentGames = require('player/recentgames');
	const RecentAchievements = require('player/recentachievements');
	const PerfectGames = require('player/perfectgames');
	const GameAchievements = require('game/layout');
	const Friends = require('player/friends');
	const errorTemplate = require('tpl!core/templates/errorresponse.html');

	const loadPlayer = function(id) {
		var player = new Player({
			id: id
		});

		return player.fetch().then(function() { return player; });
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

	const waitUntilResychronized = function(model, callback) {
		const resynchronizationState = model.get('resynchronized');
		if (resynchronizationState === 'never' || resynchronizationState === 'pending')
		{
			setTimeout(function() {
				model.fetch().then(_.bind(waitUntilResychronized, null, model, callback));
			}, 10000);
		}
		else
		{
			callback();
		}
	}

	return Marionette.AppRouter.extend({
		routes: {
			'player/:id': 'profile',
			'player/:id/games': 'games',
			'player/:id/achievements': 'achievements',
			'player/:id/game/:game': 'game',
			'player/:id/perfect': 'perfect',
			'player/:id/friends': 'friends'
		},

		initialize: function(options)
		{
			Marionette.AppRouter.prototype.initialize.call(this, options);
		},

		getApp: function()
		{
			return require('application')();
		},

		profile: function(id)
		{
			loadPlayer(id)
			.then(screenFactory(function(model) {
				let profile = new Layout({
					model: model
				});

				// Wait until synchronized, then reload
				const resynchronizationState = model.get('resynchronized');
				if (resynchronizationState === 'never' || resynchronizationState === 'pending')
				{
					waitUntilResychronized(model, function() {
						Backbone.history.navigate('#/player/' + id, true);
					});
				}
				else
				{
					profile.showChildView('bodyLocation', new Default({ model: model }));
				}

				return profile;
			}, this))
			.fail(_.bind(this.playerUnknown, this));
		},

		games: function(id)
		{
			loadPlayer(id)
			.then(screenFactory(function(model) {
				let profile = new Layout({
					model: model,
					displayRecentActivity: false
				});

				waitUntilResychronized(model, function() {
					profile.showChildView('bodyLocation', new RecentGames({ model: model }));
				});

				return profile;
			}, this))
			.fail(_.bind(this.playerUnknown, this));
		},

		achievements: function(id)
		{
			loadPlayer(id)
			.then(screenFactory(function(model) {
				let profile = new Layout({
					model: model,
					displayRecentActivity: false
				});

				waitUntilResychronized(model, function() {
					profile.showChildView('bodyLocation', new RecentAchievements({ model: model }));
				});

				return profile;
			}, this))
			.fail(_.bind(this.playerUnknown, this));
		},

		game: function(id, appid)
		{
			loadPlayer(id)
			.then(screenFactory(function(model) {
				let profile = new Layout({
					model: model
				});

				waitUntilResychronized(model, function() {
					var game = new Game({
						id: appid
					});

					game.fetch({ data: { players: id }})
					.then(function() {
						profile.showChildView('bodyLocation', new GameAchievements({
							playerId: id,
							model: game
						}));
					});
				});

				return profile;
			}, this))
			.fail(_.bind(this.playerUnknown, this));
		},

		perfect: function(id)
		{
			loadPlayer(id)
			.then(screenFactory(function(model) {
				let profile = new Layout({
					model: model
				});

				waitUntilResychronized(model, function() {
					profile.showChildView('bodyLocation', new PerfectGames({ model: model }));
				});

				return profile;
			}, this))
			.fail(_.bind(this.playerUnknown, this));
		},

		friends: function(id)
		{
			loadPlayer(id)
			.then(screenFactory(function(model) {
				let profile = new Layout({
					model: model
				});

				waitUntilResychronized(model, function() {
					profile.showChildView('bodyLocation', new Friends({ player: model }));
				});

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