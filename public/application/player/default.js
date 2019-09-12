define(function(require) {
	'use strict';

	const Marionette = require('backbone.marionette');
	const GameList = require('core/views/gamelist');
	const PlayerGames = require('player/collections/games');
	const PlayerAchievements = require('player/collections/achievements');
	const template = require('tpl!player/templates/lists.html');
	const achievementTemplate = require('tpl!player/templates/achievement.html');

	return Marionette.View.extend({
		template: template,

		regions: {
			gameSummaryLocation: '#gamesummary',
			highestGamesLocation: '#highestcompletiongames',
			lowestGamesLocation: '#lowestcompetiongames',
			easiestGamesLocation: '#easiestgames',
			easiestAchievementsLocation: '#easiestachievements',
		},

		initialize: function(options)
		{
			Marionette.View.prototype.initialize.call(this, options);
		},

		onRender: function()
		{
			const highestGames = new PlayerGames(null, { playerId: this.model.id });
			this.showChildView('highestGamesLocation', new GameList({
				collection: highestGames
			}));
			highestGames.fetch({ data: { 'order-by': 'percent DESC' } });

			const lowestGames = new PlayerGames(null, { playerId: this.model.id });
			this.showChildView('lowestGamesLocation', new GameList({
				collection: lowestGames
			}));
			lowestGames.fetch({ data: { 'order-by': 'percent ASC' } });

			const easiestGames = new PlayerGames(null, { playerId: this.model.id });
			this.showChildView('easiestGamesLocation', new GameList({
				collection: easiestGames
			}));
			easiestGames.fetch({ data: { 'order-by': 'globalPercentage DESC' } });

			const easiestAchievements = new PlayerAchievements(null, { playerId: this.model.id });
			this.showChildView('easiestAchievementsLocation', new GameList({
				className: 'row',
				collection: easiestAchievements,
				childViewOptions: _.defaults({
					template: achievementTemplate,
					className: 'col s6',
				}, GameList.prototype.childViewOptions)
			}));
			easiestAchievements.fetch({ data: { 'order-by': 'globalPercentage DESC' } });
		}
	});
});