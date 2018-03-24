define(function(require) {
	var Marionette = require('backbone.marionette');
	var playerTemplate = require('tpl!player/templates/layout.html');
	var summaryTemplate = require('tpl!player/templates/summary.html');
	var privateProfileTemplate = require('tpl!player/templates/privateprofile.html');
	var errorTemplate = require('tpl!core/templates/errorresponse.html');

	var GameSummary = Backbone.Model.extend({
		url: function() { return '/api/Players/' + this.id + '/Summary/' ; }
	});

	return Marionette.View.extend({
		template: playerTemplate,

		regions: {
			gameSummaryLocation: '#gamesummary',
		},

		events: {
			'click a[data-control=reload]': 'onReloadProfile'
		},

		initialize: function(options)
		{
			document.title = this.model.get('steam').personaname + ' - Achievement Chaser';
		},

		onRender: function()
		{
			var permission = this.model.get('steam').communityvisibilitystate;

			// public
			if (permission === 3)
			{
				this.renderPublicProfile();
			}
			else
			{
				var self = this;
				setTimeout(function() {
					self.showChildView('gameSummaryLocation', new Marionette.View({
						template: privateProfileTemplate
					}));
				}, 1000);
			}
		},

		renderPublicProfile()
		{
			var resynchronizationState = this.model.get('resynchronized');
			if (resynchronizationState === 'never' || resynchronizationState === 'pending')
			{
				var self = this;
				// poll every ten seconds
				setTimeout(function() {
					self.model.fetch()
					.then(function() {
						self.renderPublicProfile();
					})
					.fail(function(response, statusText, errorString) {
						self.showChildView('gameSummaryLocation', new Marionette.View({
							className: 'alert alert-danger',
							template: errorTemplate,
							model: new Backbone.Model(response)
						}));
					});
				}, 10000);
			}
			else
			{
				var summary = new GameSummary({
					id: this.model.id,
				});

				this.listenToOnce(summary, 'sync', function(model, response, options) {
					this.showChildView('gameSummaryLocation', new Marionette.View({
						className: 'summary-statistics',
						template: summaryTemplate,
						model: model
					}));
				});

				this.listenToOnce(summary, 'error', function(model, response, options) {
					this.showChildView('gameSummaryLocation', new Marionette.View({
						className: 'alert alert-danger',
						template: errorTemplate,
						model: new Backbone.Model(response)
					}));
				});

				this.listenToOnce(summary, 'sync', this.stopListening);

				this.renderLists();

				summary.fetch();
			}
		},

		onReloadProfile: function(event)
		{
			event.preventDefault();
		}
	});
});