define(function(require) {
	var Marionette = require('backbone.marionette');
	var PlayerGames = require('collections/playergames');
	var PlayerAchievements = require('collections/playerachievements');
	var template = require('tpl!player/templates/lists.html');
	var gameTemplate = require('tpl!player/templates/game.html');
	var achievementTemplate = require('tpl!player/templates/achievement.html');

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
			var List = Marionette.NextCollectionView.extend({
				tagName: 'ul',
				className: '',
				childView: Marionette.View,
				childViewOptions: {
					tagName: 'li',
					template: gameTemplate
				},
				emptyView: Marionette.View,
				emptyViewOptions: {
					template: _.template('<%- tr("No games to display.") %>')
				}
			});

			var highestGames = new PlayerGames(null, { playerId: this.model.id });
			this.showChildView('highestGamesLocation', new List({
				className: 'game-list',
				collection: highestGames,
			}));
			highestGames.fetch({ data: { 'order-by': 'percent DESC' } });

			var lowestGames = new PlayerGames(null, { playerId: this.model.id });
			this.showChildView('lowestGamesLocation', new List({
				className: 'game-list',
				collection: lowestGames,
			}));
			lowestGames.fetch({ data: { 'order-by': 'percent ASC' } });

			var easiestGames = new PlayerGames(null, { playerId: this.model.id });
			this.showChildView('easiestGamesLocation', new List({
				className: 'game-list',
				collection: easiestGames,
			}));
			easiestGames.fetch({ data: { 'order-by': 'globalPercentage DESC' } });

			var easiestAchievements = new PlayerAchievements(null, { playerId: this.model.id });
			this.showChildView('easiestAchievementsLocation', new List({
				className: 'row',
				collection: easiestAchievements,
				childViewOptions: _.defaults({
					template: achievementTemplate,
					className: 'col s6',
				}, List.prototype.childViewOptions)
			}));
			easiestAchievements.fetch({ data: { 'order-by': 'globalPercentage DESC' } });
		}
	});
});