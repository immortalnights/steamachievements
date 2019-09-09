define(function(require) {
	'use strict';

	const Marionette = require('backbone.marionette');
	const template = require('tpl!player/templates/recentactivity.html');
	const gameTemplate = require('tpl!player/templates/game.html');
	const achievementTemplate = require('tpl!player/templates/achievement.html');

	return Marionette.View.extend({
		template: template,
		regions: {
			recentGamesLocation: '#recentgames',
			recentAchievementsLocation: '#recentachievements'
		},

		initialize: function(options)
		{
			Marionette.View.prototype.initialize.call(this, options);
		},

		onRender: function()
		{
			let recentGames = new Backbone.Collection(this.model.get('recentGames'));
			let recentAchievements = new Backbone.Collection(this.model.get('recentAchievements'));
			recentAchievements.each(function(game) {
				_.each(game.get('achievements'), function(achievement) {
					achievement.unlocked = true;
				});
			});

			recentGames.invoke('set', 'smallIcon', true);
			recentAchievements.invoke('set', 'smallIcon', true);

			const playerId = this.model.id;
			this.showChildView('recentGamesLocation', new Marionette.NextCollectionView({
				collection: recentGames,
				childView: Marionette.View.extend({
					serializeData: function()
					{
						const data = Marionette.View.prototype.serializeData.call(this);

						data.playerId = playerId;

						return data;
					}
				}),
				childViewOptions: {
					className: 'recent-games',
					template : gameTemplate
				}
			}));

			this.showChildView('recentAchievementsLocation', new Marionette.NextCollectionView({
				collection: recentAchievements,
				childView: Marionette.View.extend({
					serializeData: function()
					{
						const data = Marionette.View.prototype.serializeData.call(this);

						data.playerId = playerId;

						return data;
					}
				}),
				childViewOptions: {
					className: 'recent-achievements',
					template : achievementTemplate
				}
			}));
		}
	});
});