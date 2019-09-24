define(function(require) {
	'use strict';

	const Marionette = require('backbone.marionette');
	const List = require('core/views/list');
	const gameTemplate = require('tpl!player/templates/game.html');

	const EmptyView = Marionette.View.extend({
		template: false,

		modelEvents: {
			change: 'render'
		},

		initialize: function(options)
		{
			Marionette.View.prototype.initialize.call(this, options);

			this.listenTo(this.collection, 'sync', function(collection, response, options) {
				this.model.set({
					state: 'default',
					errorXHR: null
				});
			});

			this.listenTo(this.collection, 'error', function(collection, xhr, options) {
				this.model.set({
					state: 'error',
					errorXHR: xhr
				});
			});
		},

		getTemplate: function()
		{
			let template = _.template('');

			switch (this.model.get('state'))
			{
				case 'default':
				{
					template = _.template('<p style="padding-left: 2em;"><%- tr("No games to display.") %></p>');
					break;
				}
				case 'loading':
				{
					template = _.template('<p style="padding-left: 2em;"><%- tr("Loading...") %></p>');
					break;
				}
				case 'error':
				{
					template = _.template('<p style="padding-left: 2em;"><%- tr("Error loading data.") %></p>');
					break;
				}
			}

			return template;
		}
	});

	return List.extend({
		tagName: 'div',
		className: 'game-list',
		childView: Marionette.View.extend({
			serializeData: function()
			{
				let data = Marionette.View.prototype.serializeData.apply(this, arguments);

				data.playerId = this.getOption('playerId');

				return data
			}
		}),
		childViewOptions: _.defaults({
			tagName: 'div',
			template: gameTemplate
		}, List.prototype.childViewOptions),

		emptyView: EmptyView,
		emptyViewOptions: null,

		initialize: function(options)
		{
			Marionette.View.prototype.initialize.call(this, options);

			console.assert(this.collection, "Games list missing games collection");
			this.childViewOptions.playerId = this.collection.options.playerId;
			this.emptyViewOptions = {
				collection: this.collection,
				model: new Backbone.Model({
					state: 'loading'
				})
			};
		},
	});
});