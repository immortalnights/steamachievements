define(function(require) {
	'use strict';

	var Marionette = require('backbone.marionette');
	var Player = require('player/models/player');
	var Friends = require('player/collections/friends');
	var Profile = require('player/profile');
	var Lists = require('player/gamelists');
	var PerfectGames = require('player/perfectgames');
	var Game = require('game/models/game');
	var GameAchievements = require('game/layout');
	var friendTemplate = require('tpl!player/templates/friend.html');
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
			'player/:id': 'player',
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

		player: function(id)
		{
			loadPlayer(id)
			.then(screenFactory(function(model) {
				var profile = new Profile({
					model: model
				});

				renderIfResynchronized(model, function() {
					profile.showChildView('bodyLocation', new Lists({ model: model }));
				});

				return profile;
			}, this))
			.fail(_.bind(this.playerUnknown, this));
		},

		game: function(id, appid)
		{
			loadPlayer(id)
			.then(screenFactory(function(model) {
				var profile = new Profile({
					model: model
				});

				renderIfResynchronized(model, function() {
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
				var profile = new Profile({
					model: model
				});

				renderIfResynchronized(model, function() {
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
				var profile = new Profile({
					model: model
				});

				renderIfResynchronized(model, function() {
					var friends = new Friends(null, { playerId: id });
					profile.showChildView('bodyLocation', new Marionette.NextCollectionView({
						collection: friends,
						tagName: 'ul',
						className: '',
						childView: Marionette.View,
						childViewOptions: {
							tagName: 'li',
							className: 'list-item',
							template: friendTemplate
						}
					}));
					friends.fetch();
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