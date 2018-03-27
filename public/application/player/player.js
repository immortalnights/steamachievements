define(function(require) {
	var Marionette = require('backbone.marionette');
	var GameLists = require('player/gamelists');
	var template = require('tpl!player/templates/layout.html');
	var summaryTemplate = require('tpl!player/templates/summary.html');
	var privateProfileTemplate = require('tpl!player/templates/privateprofile.html');
	var errorTemplate = require('tpl!core/templates/errorresponse.html');

	var GameSummary = Backbone.Model.extend({
		url: function() { return '/api/Players/' + this.id + '/Summary/' ; }
	});

	return Marionette.View.extend({
		template: template,

		regions: {
			gameSummaryLocation: '#gamesummary',
			gameListsLocations: '#gamelists'
		},

		events: {
			'click a[data-control=reload]': 'onReloadProfile',
			'click button[data-control=resynchronize]': 'onResynchronizeProfile'
		},

		initialize: function(options)
		{
			Marionette.View.prototype.initialize.call(this, options);
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
						self.render();
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

				this.showChildView('gameListsLocations', new GameLists({
					model: this.model
				}));

				summary.fetch();
			}
		},

		onReloadProfile: function(event)
		{
			event.preventDefault();
		},

		onResynchronizeProfile: function(event)
		{
			event.preventDefault();

			Backbone.ajax({
				url: '/api/Players/' + this.model.id + '/Resynchronize/invoke/',
				method: 'put',
				data: JSON.stringify({}),
				contentType: 'application/json'
			});
		}
	});
});