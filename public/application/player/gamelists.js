define(function(require) {
	var Marionette = require('backbone.marionette');
	var List = require('core/views/list');
	var PlayerGames = require('player/collections/games');
	var PlayerAchievements = require('player/collections/achievements');
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
			var GameList = List.extend({
				childViewOptions: _.defaults({
					template: gameTemplate,
				}, List.prototype.childViewOptions),
				emptyViewOptions: {
					template: _.template('<%- tr("No games to display.") %>')
				}
			});

			var highestGames = new PlayerGames(null, { playerId: this.model.id });
			this.showChildView('highestGamesLocation', new GameList({
				className: 'game-list',
				collection: highestGames
			}));
			highestGames.fetch({ data: { 'order-by': 'percent DESC' } });

			var lowestGames = new PlayerGames(null, { playerId: this.model.id });
			this.showChildView('lowestGamesLocation', new GameList({
				className: 'game-list',
				collection: lowestGames
			}));
			lowestGames.fetch({ data: { 'order-by': 'percent ASC' } });

			var easiestGames = new PlayerGames(null, { playerId: this.model.id });
			this.showChildView('easiestGamesLocation', new GameList({
				className: 'game-list',
				collection: easiestGames
			}));
			easiestGames.fetch({ data: { 'order-by': 'globalPercentage DESC' } });

			var easiestAchievements = new PlayerAchievements(null, { playerId: this.model.id });
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