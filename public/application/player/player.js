define(function(require) {
	var Marionette = require('backbone.marionette');
	var playerTemplate = require('tpl!player/templates/layout.html');
	var summaryTemplate = require('tpl!player/templates/summary.html');

	return Marionette.View.extend({
		template: playerTemplate,

		regions: {
			gameSummaryLocation: '#gamesummary'
		},

		onRender: function()
		{
			var GameSummary = Backbone.Model.extend({
				url: function() { return '/api/Player/' + this.id + '/Summary/' ; }
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

			model.fetch();
		}
	});
});