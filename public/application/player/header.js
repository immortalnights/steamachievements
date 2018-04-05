define(function(require) {
	var Marionette = require('backbone.marionette');
	var PlayerSummary = require('player/models/summary');
	var template = require('tpl!player/templates/header.html');
	var summaryTemplate = require('tpl!player/templates/summary.html');
	var privateProfileTemplate = require('tpl!player/templates/privateprofile.html');
	var errorTemplate = require('tpl!core/templates/errorresponse.html');

	return Marionette.View.extend({
		template: template,

		regions: {
			gameSummaryLocation: '#gamesummary'
		},

		events: {
			'click a[data-control=reload]': 'onReloadProfile',
			'click button[data-control=resynchronize]': 'onResynchronizeProfile'
		},

		initialize: function(options)
		{
			Marionette.View.prototype.initialize.call(this, options);
			document.title = this.model.get('personaname') + ' - Achievement Chaser';
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
				_.delay(function() {
					self.showChildView('gameSummaryLocation', new Marionette.View({
						template: privateProfileTemplate
					}));
				}, 1000);
			}
		},

		renderPublicProfile()
		{
			var resynchronizationState = this.model.get('resynchronized');
			if (resynchronizationState !== 'never' && resynchronizationState !== 'pending')
			{
				var summary = new PlayerSummary({
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

				this.listenToOnce(summary, 'sync error', this.stopListening);

				summary.fetch();
			}
		},

		onReloadProfile: function(event)
		{
			event.preventDefault();
			this.model.resynchronize();
		},

		onResynchronizeProfile: function(event)
		{
			event.preventDefault();
			this.model.resynchronize();
		}
	});
});