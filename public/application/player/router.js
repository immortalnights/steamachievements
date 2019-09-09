define(function(require) {
	'use strict';

	const Marionette = require('backbone.marionette');
	const Player = require('player/models/player');
	const Games = require('player/collections/games');
	const Friends = require('player/collections/friends');
	const Profile = require('player/profile');
	const Lists = require('player/gamelists');
	const RecentGames = require('player/recentgames');
	const RecentAchievements = require('player/recentachievements');
	const PerfectGames = require('player/perfectgames');
	const Game = require('game/models/game');
	const GameAchievements = require('game/layout');
	const friendTemplate = require('tpl!player/templates/friend.html');
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
				let profile = new Profile({
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
					profile.showChildView('bodyLocation', new Lists({ model: model }));
				}

				return profile;
			}, this))
			.fail(_.bind(this.playerUnknown, this));
		},

		games: function(id)
		{
			loadPlayer(id)
			.then(screenFactory(function(model) {
				let profile = new Profile({
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
				let profile = new Profile({
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
				var profile = new Profile({
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
				const profile = new Profile({
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
				var profile = new Profile({
					model: model
				});

				waitUntilResychronized(model, function() {
					var friends = new Friends(null, { playerId: id });

					var friendsModel = new Backbone.Model({
						friends: 0
					});

					var view = new Marionette.View({
						template: _.template('<h5>Friends</h5><div id="friends"></div><div id="friendsfooter"></div>'),
						model: friendsModel,

						regions: {
							friendsLocation: '#friends',
							friendsFooterLocation: '#friendsfooter'
						}
					});

					friendsModel.listenToOnce(friends, 'sync', function(collection) {
						this.set('friends', model.get('friends') - collection.length);
						view.render();
					});

					view.on('render', function() {
						if (friends.isEmpty())
						{
							this.showChildView('friendsLocation', new Marionette.View({
								template: _.template('<p class="center">None of this users <%- friends %> friend(s) are known. Invite them to join!</p>'),
								model: friendsModel
							}));
						}
						else
						{
							this.showChildView('friendsLocation', new Marionette.NextCollectionView({
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

							this.showChildView('friendsFooterLocation', new Marionette.View({
								template: _.template('<p class="center">And <%- friends %> other friend(s), invite them to join!</p>'),
								model: friendsModel
							}));
						}
					});

					profile.showChildView('bodyLocation', view);

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