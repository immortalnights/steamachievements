define(function(require) {
	'use strict';

	const Marionette = require('backbone.marionette');
	const PlayerSummary = require('player/models/summary');
	const RecentActivity = require('player/recentactivity');
	const template = require('tpl!player/templates/header.html');
	const summaryTemplate = require('tpl!player/templates/summary.html');
	const privateProfileTemplate = require('tpl!player/templates/privateprofile.html');
	const errorTemplate = require('tpl!core/templates/errorresponse.html');

	return Marionette.View.extend({
		template: template,

		regions: {
			gameSummaryLocation: '#gamesummary'
		},

		events: {
			'click a[data-control=reload]': 'onReloadProfile',
			'click button[data-control=resynchronize]': 'onResynchronizeProfile'
		},

		displayRecentActivity: true,

		initialize: function(options)
		{
			Marionette.View.prototype.initialize.call(this, options);
			document.title = this.model.get('personaname') + ' - Achievement Chaser';
		},

		onRender: function()
		{
			let permission = this.model.get('steam').communityvisibilitystate;

			// public
			if (permission === 3)
			{
				this.renderPublicProfile();
			}
			else
			{
				const self = this;
				_.delay(function() {
					self.showChildView('gameSummaryLocation', new Marionette.View({
						template: privateProfileTemplate
					}));
				}, 1000);
			}
		},

		renderPublicProfile()
		{
			let resynchronizationState = this.model.get('resynchronized');
			if (resynchronizationState !== 'never' && resynchronizationState !== 'pending')
			{
				let playerId = this.model.id;
				let summary = new PlayerSummary({
					id: this.model.id
				});

				this.listenToOnce(summary, 'sync', function(model, response, options) {
					let view = new Marionette.View({
						className: 'summary-statistics',
						template: summaryTemplate,
						model: model,
						displayRecentActivity: this.getOption('displayRecentActivity'),

						regions: {
							recentActivityLocation: '#recentactivity'
						}
					});

					view.on('render', function() {
						if (this.getOption('displayRecentActivity'))
						{
							this.showChildView('recentActivityLocation', new RecentActivity({
								model: this.model
							}));
						}
					})

					this.showChildView('gameSummaryLocation', view);
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