define(function(require) {
	'use strict';

	var Marionette = require('backbone.marionette');
	var PlayerSummary = require('player/models/summary');
	var template = require('tpl!player/templates/header.html');
	var summaryTemplate = require('tpl!player/templates/summary.html');
	var privateProfileTemplate = require('tpl!player/templates/privateprofile.html');
	var gameTemplate = require('tpl!player/templates/game.html');
	var achievementTemplate = require('tpl!player/templates/achievement.html');
	var errorTemplate = require('tpl!core/templates/errorresponse.html');

	return Marionette.View.extend({
		template: template,

		regions: {
			gameSummaryLocation: '#gamesummary'
		},

		events: {
			'click a[data-control=reload]': 'onReloadProfile',
			'click button[data-control=resynchronize]': 'onResynchronizeProfile'
		},

		initialize: function(options)
		{
			Marionette.View.prototype.initialize.call(this, options);
			document.title = this.model.get('personaname') + ' - Achievement Chaser';
		},

		onRender: function()
		{
			var permission = this.model.get('steam').communityvisibilitystate;

			// public
			if (permission === 3)
			{
				this.renderPublicProfile();
			}
			else
			{
				var self = this;
				_.delay(function() {
					self.showChildView('gameSummaryLocation', new Marionette.View({
						template: privateProfileTemplate
					}));
				}, 1000);
			}
		},

		renderPublicProfile()
		{
			var resynchronizationState = this.model.get('resynchronized');
			if (resynchronizationState !== 'never' && resynchronizationState !== 'pending')
			{
				var playerId = this.model.id;
				var summary = new PlayerSummary({
					id: this.model.id
				});

				this.listenToOnce(summary, 'sync', function(model, response, options) {
					var view = new Marionette.View({
						className: 'summary-statistics',
						template: summaryTemplate,
						model: model,

						regions: {
							recentGamesLocation: '#recentgames',
							recentAchievementsLocation: '#recentachievements'
						}
					});
					this.showChildView('gameSummaryLocation', view);

					var recentGames = new Backbone.Collection(model.get('recentGames'));
					var recentAchievements = new Backbone.Collection(model.get('recentAchievements'));
					recentAchievements.each(function(game) {
						_.each(game.get('achievements'), function(achievement) {
							achievement.unlocked = true;
						});
					});

					recentGames.invoke('set', 'smallIcon', true);
					recentAchievements.invoke('set', 'smallIcon', true);

					view.showChildView('recentGamesLocation', new Marionette.NextCollectionView({
						collection: recentGames,
						className: 'game-list single-row',
						tagName: 'ul',
						childView: Marionette.View.extend({
							serializeData: function()
							{
								var data = Marionette.View.prototype.serializeData.call(this);

								data.playerId = playerId;

								return data;
							}
						}),
						childViewOptions: {
							tagName: 'li',
							template : gameTemplate
						}
					}));

					view.showChildView('recentAchievementsLocation', new Marionette.NextCollectionView({
						collection: recentAchievements,
						className: 'row',
						xtagName: 'ul',
						childView: Marionette.View.extend({
							serializeData: function()
							{
								var data = Marionette.View.prototype.serializeData.call(this);

								data.playerId = playerId;

								return data;
							}
						}),
						childViewOptions: {
							xtagName: 'li',
							className: 'col s4',
							template : achievementTemplate
						}
					}));

				});

				this.listenToOnce(summary, 'error', function(model, response, options) {
					this.showChildView('gameSummaryLocation', new Marionette.View({
						className: 'alert alert-danger',
						template: errorTemplate,
						model: new Backbone.Model(response)
					}));
				});

				this.listenToOnce(summary, 'sync error', this.stopListening);

				summary.fetch();
			}
		},

		onReloadProfile: function(event)
		{
			event.preventDefault();
			this.model.resynchronize();
		},

		onResynchronizeProfile: function(event)
		{
			event.preventDefault();
			this.model.resynchronize();
		}
	});
});