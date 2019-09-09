define(function(require) {
	'use strict';

	const Marionette = require('backbone.marionette');
	const List = require('core/views/list');
	const PlayerAchievements = require('player/collections/achievements');
	const gameTemplate = require('tpl!player/templates/gamewithachievements.html');

	return Marionette.View.extend({
		template: _.template('<h5><%- tr("Recent Achievements") %> <small class="blue-grey-text text-darken-2"><%- tr("Recent unlocked achievements.") %></small></h5><div id="gamelist"></div>'),

		regions: {
			listLocation: '#gamelist'
		},

		initialize: function(options)
		{
			Marionette.View.prototype.initialize.call(this, options);
		},

		onRender: function()
		{
			const GameList = List.extend({
				className: 'game-achievement-list',
				childViewOptions: _.defaults({
					template: gameTemplate,
				}, List.prototype.childViewOptions),
				emptyViewOptions: {
					template: _.template('<%- tr("No games to display.") %>')
				}
			});

			const games = new PlayerAchievements(null, { playerId: this.model.id });
			this.showChildView('listLocation', new GameList({
				collection: games
			}));
			games.fetch({ data: { 'order-by': 'recent DESC' } })
		}
	});
});