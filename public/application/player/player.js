define(function(require) {
	var Marionette = require('backbone.marionette');
	var playerTemplate = require('tpl!player/templates/layout.html');

	return Marionette.View.extend({
		template: playerTemplate,

		regions: {
			gameSummaryLocation: '#gamesummary'
		},

		onRender: function()
		{
			var GameSummary = Backbone.Model.extend({
				url: function() { return '/api/GameSummary/' + this.id; }
			});

			var model = new GameSummary({
				id: this.model.id,
			});

			this.showChildView('gameSummaryLocation', new Marionette.View({
				template: _.template('asd')
			}));

			model.fetch();
		}
	});
});