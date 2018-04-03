define(function(require) {
	var Marionette = require('backbone.marionette');
	var List = require('core/views/list');
	var PlayerGames = require('player/collections/games');
	var gameTemplate = require('tpl!player/templates/game.html');

	return Marionette.View.extend({
		template: _.template('<h5><%- tr("Perfect Games") %> <small class="blue-grey-text text-darken-2"><%- tr("Games with all achievements unlocked.") %></small></h5><div id="gamelist"></div>'),

		regions: {
			listLocation: '#gamelist'
		},

		initialize: function(options)
		{
			Marionette.View.prototype.initialize.call(this, options);
		},

		onRender: function()
		{
			var GameList = List.extend({
				className: 'game-list',
				childViewOptions: _.defaults({
					template: gameTemplate,
				}, List.prototype.childViewOptions),
				emptyViewOptions: {
					template: _.template('<%- tr("No games to display.") %>')
				}
			});

			var perfectGames = new PlayerGames(null, { playerId: this.model.id });
			this.showChildView('listLocation', new GameList({
				collection: perfectGames
			}));
			perfectGames.fetch({ data: { 'query': 'owners.perfect=true' } });
		}
	});
});