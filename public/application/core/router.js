define(function(require) {
	var Marionette = require('backbone.marionette');
	var Form = require('core/form');
	var formTemplate = require('tpl!index/templates/form.html');

	return Marionette.AppRouter.extend({
		routes: {
			'': 'index',
			'*notFound': 'notFound'
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

			var toggleControls = function(show) {

				if (!show)
				{
					// disable the button and show the loader
					this.$('button[type=submit]').hide().prop('disabled', true);
					this.$('.preloader-wrapper').show();
				}
				else
				{
					this.$('button[type=submit]').show().prop('disabled', false);
					this.$('.preloader-wrapper').hide();
				}
			}

			form.on('serialized', function(formData) {
				var self = this;

				toggleControls.call(this, false);
				this.$('.error-message').hide();

				Backbone.ajax('/api/players', {
					method: 'post',
					data: JSON.stringify(formData),
					contentType: 'application/json'
				})
				.then(function(data, textStatus, xhr) {
					// toggleControls.call(this, false);
					Backbone.history.navigate('#/player/' + encodeURIComponent(data._id), true);
				})
				.fail(function(xhr, textStatus, errorThrown) {

					var el = self.$('.error-message');
					if (xhr && xhr.responseJSON)
					{
						el.text(xhr.responseJSON.error);
					}
					else
					{
						el.text("Failed to find player.");
					}
					el.show();

					toggleControls.call(self, true);
				});
			})

			screen.showChildView('formLocation', form);
		},

		notFound: function()
		{
			console.warn("Unknown url", Backbone.history.hash);
			Backbone.history.navigate('#/', true);
		}
	});
});