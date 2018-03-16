define(function(require) {
	var Marionette = require('backbone.marionette');
	var PlayerGames = require('collections/playergames');
	var PlayerAchievements = require('collections/playerachievements');
	var playerTemplate = require('tpl!player/templates/layout.html');
	var summaryTemplate = require('tpl!player/templates/summary.html');
	var gameTemplate = require('tpl!player/templates/game.html');

	return Marionette.View.extend({
		template: playerTemplate,

		regions: {
			gameSummaryLocation: '#gamesummary',
			highestGamesLocation: '#highestcompletiongames',
			lowestGamesLocation: '#lowestcompetiongames',
			easiestGamesLocation: '#easiestgames',
			easiestAchievementsLocation: '#easiestachievements',
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
				collection: highestGames,
			}));
			highestGames.fetch({ data: { 'order-by': 'percent ASC' } });

			var lowestGames = new PlayerGames(null, { playerId: this.model.id });
			this.showChildView('lowestGamesLocation', new List({
				collection: lowestGames,
			}));
			lowestGames.fetch({ data: { 'order-by': 'percent DESC' } });

			var easiestGames = new PlayerGames(null, { playerId: this.model.id });
			this.showChildView('easiestGamesLocation', new List({
				collection: easiestGames,
			}));
			easiestGames.fetch({ data: { 'order-by': 'globalPercentage ASC' } });

			var easiestAchievements = new PlayerAchievements(null, { playerId: this.model.id });
			this.showChildView('easiestAchievementsLocation', new List({
				collection: easiestAchievements,
			}));
			easiestAchievements.fetch({ data: { 'order-by': 'globalPercentage DESC' } });
		}
	});
});