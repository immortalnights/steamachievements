define(function(require) {
	var Marionette = require('backbone.marionette');
	var Form = require('core/form');
	var formTemplate = require('tpl!index/templates/form.html');
	var playerTemplate = require('tpl!player/templates/layout.html');

	return Marionette.AppRouter.extend({
		routes: {
			'': 'index',
			'player': 'player',
			'player/:id': 'player'
		},

		initialize: function(options)
		{
			Marionette.AppRouter.prototype.initialize.call(this, options);
		},

		getApp: function()
		{
			return require('application')();
		},

		index: function()
		{
			var Index = Marionette.View.extend({
			});

			var screen = new Marionette.View({
				template: _.template('<div id="playerform"></div><div id="summary"></div>'),

				regions: {
					formLocation: '#playerform',
					summaryLocation: '#summary'
				}
			});

			this.getApp().showScreen(screen);

			var form = new Form({
				template: formTemplate
			});

			var self = this;
			form.on('serialized', function(formData) {
				Backbone.ajax('/app/profiles', {
					method: 'post',
					data: JSON.stringify(formData),
					contentType: 'application/json'
				})
				.then(function(data, textStatus, xhr) {
					self.navigate('#/player/' + encodeURIComponent(data._id), true);
				})
				.fail(function(xhr, textStatus, errorThrown) {
					console.error(xhr.response);
				});
			})

			screen.showChildView('formLocation', form);

		},

		player: function(id)
		{
			if (!id)
			{
				this.getApp().showScreen(new Marionette.View({
					template: _.template('<%- tr("Missing profile id.") %>')
				}));
			}
			else
			{
				var Player = Backbone.Model.extend({
					url: function() { return '/app/profiles/' + encodeURIComponent(this.id); }
				});

				var player = new Player({
					id: id
				});

				this.listenToOnce(player, 'sync', function(model, response, options) {
					this.getApp().showScreen(new Marionette.View({
						template: playerTemplate,
						model: model
					}));
				});
				this.listenToOnce(player, 'error', function(model, response, options) {
					this.getApp().showScreen(new Marionette.View({
						template: _.template("error")
					}));
				});
				this.listenToOnce(player, 'sync error', function() {
					this.stopListening(player);
				});

				player.fetch();
			}
		}
	});
});