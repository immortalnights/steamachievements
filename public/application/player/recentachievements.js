define(function(require) {
	'use strict';

	const Marionette = require('backbone.marionette');
	const GameList = require('core/views/gamelist');
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
			const games = new PlayerAchievements(null, { playerId: this.model.id });
			this.showChildView('listLocation', new GameList({
				className: '', // don't use default class
				collection: games,
				childViewOptions: _.defaults({
					template: gameTemplate,
				}, GameList.prototype.childViewOptions),
			}));
			games.fetch({ data: { 'order-by': 'recent DESC' } })
		}
	});
});