define(function(require) {
	'use strict';

	const Marionette = require('backbone.marionette');
	const template = require('tpl!player/templates/recentactivity.html');
	const gameTemplate = require('tpl!player/templates/game.html');
	const achievementTemplate = require('tpl!player/templates/achievement.html');
	const recentAchievementsTemplate = require('tpl!player/templates/recentachievements.html');

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
			// FIME - use GameList!
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
				className: '',
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

			const V = Marionette.View.extend({
				className: 'flex-container flex-wrap',
				template: recentAchievementsTemplate,

				serializeData: function()
				{
					const data = Marionette.View.prototype.serializeData.call(this);

					data.playerId = playerId;

					return data;
				}
			});

			this.showChildView('recentAchievementsLocation', new V({
				collection: recentAchievements
			}));
			// this.showChildView('recentAchievementsLocation', new Marionette.NextCollectionView({
			// 	className: 'flex-container',
			// 	collection: recentAchievements,
			// 	childView: Marionette.View.extend({
			// 		serializeData: function()
			// 		{
			// 			const data = Marionette.View.prototype.serializeData.call(this);

			// 			data.playerId = playerId;

			// 			return data;
			// 		}
			// 	}),
			// 	childViewOptions: {
			// 		className: 'recent-achievements',
			// 		template : achievementTemplate
			// 	}
			// }));
		}
	});
});