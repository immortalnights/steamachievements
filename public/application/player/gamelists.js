
	var Marionette = require('backbone.marionette');
	var PlayerGames = require('collections/playergames');
	var PlayerAchievements = require('collections/playerachievements');
	var gameTemplate = require('tpl!player/templates/game.html');
	var achievementTemplate = require('tpl!player/templates/achievement.html');

	return Marionette.View.extend({
		template: playerTemplate,

		regions: {
			gameSummaryLocation: '#gamesummary',
			highestGamesLocation: '#highestcompletiongames',
			lowestGamesLocation: '#lowestcompetiongames',
			easiestGamesLocation: '#easiestgames',
			easiestAchievementsLocation: '#easiestachievements',
		},

		initialize: function(options)
		{
			console.log(this.model);

			document.title = this.model.get('steam').personaname + ' - Achievement Chaser';
		},

		renderLists: function()
		{
			var List = Marionette.NextCollectionView.extend({
				tagName: 'ul',
				className: '',
				childView: Marionette.View,
				childViewOptions: {
					tagName: 'li',
					template: gameTemplate
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