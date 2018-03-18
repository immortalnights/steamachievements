define(function(require) {
	var Marionette = require('backbone.marionette');
	var PlayerGames = require('collections/playergames');
	var PlayerAchievements = require('collections/playerachievements');
	var playerTemplate = require('tpl!player/templates/layout.html');
	var summaryTemplate = require('tpl!player/templates/summary.html');
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

		onRender: function()
		{
			var GameSummary = Backbone.Model.extend({
				url: function() { return '/api/Players/' + this.id + '/Summary/' ; }
			});

			var model = new GameSummary({
				id: this.model.id,
			});

			this.listenToOnce(model, 'sync', function(model, response, options) {
				this.showChildView('gameSummaryLocation', new Marionette.View({
					className: 'summary-statistics',
					template: summaryTemplate,
					model: model
				}));
			});

			this.listenToOnce(model, 'error', function(model, response, options) {
				this.showChildView('gameSummaryLocation', new Marionette.View({
					className: 'alert alert-danger',
					template: _.template('error template'),
					model: response
				}));
			});

			this.listenToOnce(model, 'sync', this.stopListening);

			this.renderLists();

			model.fetch();
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
	});
});