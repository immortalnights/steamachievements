define(function(require) {
	'use strict';

	const Marionette = require('backbone.marionette');
	const GameList = require('core/views/gamelist');
	const PlayerGames = require('player/collections/games');

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
			const perfectGames = new PlayerGames(null, { playerId: this.model.id });
			this.showChildView('listLocation', new GameList({
				collection: perfectGames,
			}));
			perfectGames.fetch({ data: { 'query': 'perfect=true' } });
		}
	});
});